import { NextResponse } from "next/server"

import crypto from "crypto"

import { createSupabaseServiceClient } from "@/lib/supabaseService"
import { createSupabaseServerClient } from "@/lib/supabase"
import { distanceMeters } from "@/lib/geo"

const KROGER_BASE = "https://api.kroger.com/v1"
const KROGER_TOKEN_URL = `${KROGER_BASE}/connect/oauth2/token`

const KROGER_ON_DEMAND_CACHE_TTL_MS = 5 * 60 * 1000

type Offer = {
  store: {
    id: string
    name: string
    lat: number
    lng: number
    address?: string | null
    category?: string | null
  }
  item: {
    id: string
    name: string
    category?: string | null
  }
  price: number
  observedAt: string
  distanceMeters: number
  source: "snapshot" | "kroger"
  verificationType?: string
}

const onDemandCache = new Map<
  string,
  { expiresAt: number; offers: Offer[] }
>()

function uuidFromStringDeterministic(input: string) {
  const hash = crypto.createHash("sha256").update(input).digest()
  const bytes = Uint8Array.from(hash.subarray(0, 16))
  // Version 5 (pseudo) and RFC 4122 variant.
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function storeIdFromKrogerLocationId(locationId: string) {
  return uuidFromStringDeterministic(`wprice:kroger:location:${locationId}`)
}

function normalizeQuery(q: string) {
  return q.trim().toLowerCase().replace(/[^a-z0-9\s]/g, " ")
}

function timeBucketFromLocalTime(now: Date = new Date()): "morning" | "lunch" | "evening" | "night" {
  const h = now.getHours()
  if (h >= 5 && h < 11) return "morning"
  if (h >= 11 && h < 15) return "lunch"
  if (h >= 15 && h < 21) return "evening"
  return "night"
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

const LIVE_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes
const MAX_STALE_PRICE_PENALTY = 0.3 // up to +30%
function freshnessPenaltyFromAgeMs(ageMs: number) {
  if (!Number.isFinite(ageMs) || ageMs <= LIVE_THRESHOLD_MS) return 0
  const ageRangeMs = 24 * 60 * 60 * 1000 - LIVE_THRESHOLD_MS
  const t = clamp(ageMs - LIVE_THRESHOLD_MS, 0, ageRangeMs) / ageRangeMs
  return t * MAX_STALE_PRICE_PENALTY
}

function guessCategoryFromQuery(query: string): "groceries" | "cigarettes" | "liquor" {
  const q = query.toLowerCase()
  if (q.includes("newport") || q.includes("cigarette") || q.includes("marboro") || q.includes("smoke")) return "cigarettes"
  if (q.includes("vodka") || q.includes("whiskey") || q.includes("tequila") || q.includes("beer") || q.includes("liquor")) return "liquor"
  if (q.includes("gatorade") || q.includes("protein") || q.includes("milk") || q.includes("egg") || q.includes("yogurt") || q.includes("cheese")) return "groceries"
  return "groceries"
}

function toFuelKey(_fuelType?: string) {
  return (_fuelType ?? "").trim()
}

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

function tryExtractBestKrogerPrice(product: any): number | null {
  const candidates: Array<number | null> = [
    product?.price?.promo?.amount ?? null,
    product?.price?.promo?.value ?? null,
    product?.price?.discount?.amount ?? null,
    product?.price?.discount?.value ?? null,
    product?.price?.sale?.amount ?? null,
    product?.price?.sale?.value ?? null,
    product?.price?.regular?.amount ?? null,
    product?.price?.regular?.value ?? null,
    product?.price?.list?.amount ?? null,
    product?.price?.list?.value ?? null,
    product?.price?.amount ?? null,
    product?.price?.value ?? null,
    product?.nationalPrice?.promo?.amount ?? null,
    product?.nationalPrice?.promo?.value ?? null,
    product?.nationalPrice?.regular?.amount ?? null,
    product?.nationalPrice?.regular?.value ?? null,
  ]

  const parsed = candidates.map((c) => asFiniteNumber(c)).filter((n): n is number => n != null)
  if (parsed.length === 0) return null
  return Math.min(...parsed)
}

function getKrogerLocationText(loc: any) {
  const address = loc?.address
  const addressLine1 =
    typeof address?.addressLine1 === "string"
      ? address.addressLine1
      : typeof address?.addressLine2 === "string"
        ? address.addressLine2
        : typeof address?.city === "string"
          ? address.city
          : null
  return addressLine1
}

async function getKrogerToken() {
  const clientId = process.env.KROGER_CLIENT_ID
  const clientSecret = process.env.KROGER_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error("Missing KROGER_CLIENT_ID/SECRET env vars.")

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "product.compact",
  })

  const res = await fetch(KROGER_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Kroger token request failed (${res.status}): ${text.slice(0, 300)}`)
  }

  const json = (await res.json().catch(() => ({}))) as any
  const token = typeof json?.access_token === "string" ? json.access_token : null
  if (!token) throw new Error("Kroger token missing access_token in response.")
  return token
}

async function fetchKrogerLocations(token: string, lat: number, lng: number, radiusMeters: number) {
  const url = new URL(`${KROGER_BASE}/locations`)
  const radiusMiles = radiusMeters / 1609.34
  url.searchParams.set("filter.latLong.near", `${lat},${lng}`)
  url.searchParams.set("filter.radiusInMiles", String(radiusMiles))
  url.searchParams.set("filter.limit", "10")

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Kroger locations request failed (${res.status}): ${text.slice(0, 300)}`)
  }

  const json = (await res.json().catch(() => ({}))) as any
  const raw = Array.isArray(json?.data) ? json.data : Array.isArray(json?.locations) ? json.locations : []

  const locations: Array<{
    locationId: string
    name?: string
    lat: number
    lng: number
    address?: string | null
  }> = []

  for (const loc of raw) {
    const locationId =
      (typeof loc?.locationId === "string" && loc.locationId) ||
      (typeof loc?.location_id === "string" && loc.location_id) ||
      (typeof loc?.id === "string" && loc.id) ||
      null
    const latVal =
      asFiniteNumber(loc?.lat) ??
      asFiniteNumber(loc?.latitude) ??
      asFiniteNumber(loc?.location?.lat) ??
      asFiniteNumber(loc?.coordinates?.lat) ??
      null
    const lngVal =
      asFiniteNumber(loc?.lng) ??
      asFiniteNumber(loc?.longitude) ??
      asFiniteNumber(loc?.location?.lng) ??
      asFiniteNumber(loc?.coordinates?.lng) ??
      null
    if (!locationId || latVal == null || lngVal == null) continue

    locations.push({
      locationId,
      name: typeof loc?.name === "string" ? loc.name : undefined,
      address: getKrogerLocationText(loc),
      lat: latVal,
      lng: lngVal,
    })
  }

  return locations
}

async function fetchKrogerBestPriceForLocation(token: string, locationId: string, term: string) {
  const url = new URL(`${KROGER_BASE}/products`)
  url.searchParams.set("filter.term", term)
  url.searchParams.set("filter.locationId", locationId)
  url.searchParams.set("filter.limit", "5")

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    return { price: null as number | null }
  }

  const json = (await res.json().catch(() => ({}))) as any
  const rawProducts = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.products)
      ? json.products
      : []

  let best: number | null = null
  let bestName: string | null = null

  for (const product of rawProducts) {
    const price = tryExtractBestKrogerPrice(product)
    if (price == null) continue
    if (best == null || price < best) {
      best = price
      bestName =
        typeof product?.description === "string"
          ? product.description
          : typeof product?.productDescription === "string"
            ? product.productDescription
            : typeof product?.name === "string"
              ? product.name
              : null
    }
  }

  return { price: best, name: bestName }
}

async function internalOffersFromSnapshots({
  supabase,
  query,
  lat,
  lng,
  limit,
}: {
  supabase: any
  query: string
  lat: number
  lng: number
  limit: number
}): Promise<Offer[]> {
  const q = normalizeQuery(query)
  if (!q) return []

  const { data: items } = await supabase
    .from("items")
    .select("id,name,category,variants")
    .limit(200)

  const allItems = Array.isArray(items) ? items : []

  // Very small MVP matching: exact substring / token inclusion.
  function scoreItem(item: any) {
    const name = String(item?.name ?? "").toLowerCase()
    const variants = Array.isArray(item?.variants) ? item.variants.join(" ").toLowerCase() : ""
    const tokens = q.split(/\s+/).filter(Boolean)

    let score = 0
    if (name.includes(q)) score += 4
    if (variants.includes(q)) score += 3
    for (const t of tokens) {
      if (name.includes(t)) score += 1
      else if (variants.includes(t)) score += 1
    }
    return score
  }

  const scored = allItems
    .map((it) => ({ itemId: it.id as string, item: it, score: scoreItem(it) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return []

  // Use the single best matching item for the initial MVP.
  const best = scored[0]
  const bestItemId = best.itemId

  const radiusMeters = 25_000
  const latDelta = radiusMeters / 111_320
  const lngDelta = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180))

  const { data: stores } = await supabase
    .from("stores")
    .select("id,name,lat,lng,address,category")
    .gte("lat", lat - latDelta)
    .lte("lat", lat + latDelta)
    .gte("lng", lng - lngDelta)
    .lte("lng", lng + lngDelta)
    .limit(50)

  const storeRows = Array.isArray(stores) ? stores : []
  const storeIds = storeRows.map((s: any) => s.id as string)
  if (storeIds.length === 0) return []

  const windowSeconds = 2_592_000 // 30d
  const { data: snaps } = await supabase
    .from("store_best_recent_price_snapshot")
    .select("store_id,item_id,best_price,best_observed_at,fuel_type,store_name,item_name,store_category,item_category")
    .in("store_id", storeIds)
    .eq("item_id", bestItemId)
    .eq("window_seconds", windowSeconds)

  const snapRows = Array.isArray(snaps) ? snaps : []
  if (snapRows.length === 0) return []

  const storeById = new Map(storeRows.map((s: any) => [s.id as string, s]))
  const bestByStoreId = new Map<string, (typeof snapRows)[number]>()

  for (const s of snapRows) {
    const sid = s.store_id as string
    const existing = bestByStoreId.get(sid)
    if (!existing || Number(s.best_price) < Number(existing.best_price)) {
      bestByStoreId.set(sid, s)
    }
  }

  const offers: Offer[] = []
  for (const [storeId, snap] of bestByStoreId.entries()) {
    const store = storeById.get(storeId)
    if (!store) continue
    const price = Number(snap.best_price)
    if (!Number.isFinite(price)) continue

    const distance = distanceMeters(
      { lat, lng },
      { lat: Number(store.lat), lng: Number(store.lng) },
    )

    offers.push({
      store: {
        id: storeId,
        name: String(store.name ?? snap.store_name ?? "Store"),
        lat: Number(store.lat),
        lng: Number(store.lng),
        address: store.address ?? null,
        category: store.category ?? snap.store_category ?? null,
      },
      item: {
        id: bestItemId,
        name: String(snap.item_name ?? best.item?.name ?? "Item"),
        category: best.item?.category ?? null,
      },
      price,
      observedAt: new Date(snap.best_observed_at).toISOString(),
      distanceMeters: distance,
      source: "snapshot",
      verificationType: "api_verified",
    })
  }

  return offers
    .slice()
    .sort((a, b) => {
      const ageA = Date.now() - new Date(a.observedAt).getTime()
      const ageB = Date.now() - new Date(b.observedAt).getTime()
      const effA = a.price * (1 + freshnessPenaltyFromAgeMs(ageA))
      const effB = b.price * (1 + freshnessPenaltyFromAgeMs(ageB))
      if (effA !== effB) return effA - effB
      return a.distanceMeters - b.distanceMeters
    })
    .slice(0, limit)
}

async function offersFromRetailLocationProducts({
  supabase,
  query,
  lat,
  lng,
  radiusMeters,
  userId,
  limit,
}: {
  supabase: any
  query: string
  lat: number
  lng: number
  radiusMeters: number
  userId: string | null
  limit: number
}): Promise<{ offers: Offer[]; matchedProductIds: string[] }> {
  const q = normalizeQuery(query)
  if (!q) return { offers: [], matchedProductIds: [] }

  // 1) Resolve candidate products.
  const { data: productRowsRaw } = await supabase
    .from("products")
    .select("id,name,category,variants")
    .limit(200)

  const productRows = Array.isArray(productRowsRaw) ? productRowsRaw : []
  function scoreProduct(p: any) {
    const name = String(p?.name ?? "").toLowerCase()
    const variants = Array.isArray(p?.variants) ? p.variants.join(" ").toLowerCase() : ""
    const tokens = q.split(/\s+/).filter(Boolean)

    let score = 0
    if (name.includes(q)) score += 4
    if (variants.includes(q)) score += 3
    for (const t of tokens) {
      if (name.includes(t)) score += 1
      else if (variants.includes(t)) score += 1
    }
    return score
  }

  const scored = productRows
    .map((p: any) => ({ productId: p.id as string, product: p, score: scoreProduct(p) }))
    .filter((r: any) => r.score > 0)
    .sort((a: any, b: any) => b.score - a.score)

  if (scored.length === 0) return { offers: [], matchedProductIds: [] }

  const matchedProductIds = Array.from(new Set(scored.slice(0, 8).map((s: any) => s.productId)))
  if (matchedProductIds.length === 0) return { offers: [], matchedProductIds: [] }

  const productById = new Map<string, any>(scored.map((s: any) => [s.productId, s.product]))

  // 2) Find nearby retail locations that have tracked offers.
  const latDelta = radiusMeters / 111_320
  const lngDelta = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180))

  const { data: locRowsRaw } = await supabase
    .from("retail_locations")
    .select("id,name,lat,lng,address_line1")
    .gte("lat", lat - latDelta)
    .lte("lat", lat + latDelta)
    .gte("lng", lng - lngDelta)
    .lte("lng", lng + lngDelta)
    .limit(200)

  const locRows = Array.isArray(locRowsRaw) ? locRowsRaw : []
  const locationIds = locRows.map((l: any) => l.id as string)
  if (locationIds.length === 0) return { offers: [], matchedProductIds: [] }

  const { data: offerRowsRaw } = await supabase
    .from("retail_location_products")
    .select(
      "retail_location_id,product_id,price,last_observed_at,verification_type,is_live,is_stale,fuel_type",
    )
    .in("retail_location_id", locationIds)
    .in("product_id", matchedProductIds)

  const offerRows = Array.isArray(offerRowsRaw) ? offerRowsRaw : []
  if (offerRows.length === 0) return { offers: [], matchedProductIds: [] }

  const locById = new Map<string, any>(locRows.map((l: any) => [l.id as string, l]))

  // 3) User behavior score (logged-in only).
  const userBehaviorScoreByProductId = new Map<string, number>()
  if (userId) {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: histRaw } = await supabase
      .from("user_search_history")
      .select("product_id,count,searched_at")
      .eq("user_id", userId)
      .in("product_id", matchedProductIds)
      .gte("searched_at", cutoff)

    for (const r of Array.isArray(histRaw) ? histRaw : []) {
      const pid = r.product_id as string
      if (!pid) continue
      const searchedAtMs = new Date(r.searched_at as any).getTime()
      if (!Number.isFinite(searchedAtMs)) continue
      const ageDays = (Date.now() - searchedAtMs) / (24 * 60 * 60 * 1000)
      const decay = 1 / (1 + ageDays)
      const c = Number(r.count ?? 0)
      if (!Number.isFinite(c) || c <= 0) continue
      userBehaviorScoreByProductId.set(pid, (userBehaviorScoreByProductId.get(pid) ?? 0) + c * decay)
    }
  }

  // 4) Score offers: user behavior -> freshness-penalized price -> distance.
  const offersWithSort = offerRows
    .map((row: any) => {
      const retailLocationId = row.retail_location_id as string
      const productId = row.product_id as string
      const loc = locById.get(retailLocationId)
      const prod = productById.get(productId)
      if (!loc || !prod) return null

      const price = Number(row.price)
      if (!Number.isFinite(price)) return null

      const observedAt = new Date(row.last_observed_at as any).toISOString()
      const observedAtMs = new Date(observedAt).getTime()
      const ageMs = Date.now() - observedAtMs

      const stalePenalty = freshnessPenaltyFromAgeMs(ageMs)
      const effectivePrice = price * (1 + stalePenalty)

      const distance = distanceMeters(
        { lat, lng },
        { lat: Number(loc.lat), lng: Number(loc.lng) },
      )

      const userScore = userBehaviorScoreByProductId.get(productId) ?? 0

      return {
        offer: {
          store: {
            id: retailLocationId,
            name: String(loc?.name ?? "Store"),
            lat: Number(loc.lat),
            lng: Number(loc.lng),
            address: (loc?.address_line1 as string | null) ?? null,
            category: null,
          },
          item: {
            id: productId,
            name: String(prod?.name ?? "Item"),
            category: prod?.category ?? null,
          },
          price,
          observedAt,
          distanceMeters: distance,
          source: "kroger" as const,
          verificationType: String(row.verification_type ?? "api_verified"),
        } satisfies Offer,
        userScore,
        effectivePrice,
      }
    })
    .filter(Boolean) as Array<{ offer: Offer; userScore: number; effectivePrice: number }>

  offersWithSort.sort((a, b) => {
    // 1) user behavior first
    if (b.userScore !== a.userScore) return b.userScore - a.userScore
    // 2) freshness-penalized price
    if (a.effectivePrice !== b.effectivePrice) return a.effectivePrice - b.effectivePrice
    // 3) distance
    return a.offer.distanceMeters - b.offer.distanceMeters
  })

  const offers = offersWithSort.map((x) => x.offer).slice(0, limit)
  return { offers, matchedProductIds }
}

async function krogerOnDemandOffers({
  supabase,
  query,
  lat,
  lng,
  limit,
}: {
  supabase: any
  query: string
  lat: number
  lng: number
  limit: number
}): Promise<Offer[]> {
  const q = normalizeQuery(query)
  if (!q) return []

  const token = await getKrogerToken()

  const radiusMeters = 25_000
  const locations = (await fetchKrogerLocations(token, lat, lng, radiusMeters)).slice(0, 8)
  if (locations.length === 0) return []

  const category = guessCategoryFromQuery(q)

  // MVP: item_id is deterministic based on query, so we can persist & personalize even without exact internal matches.
  const itemId = uuidFromStringDeterministic(`wprice:item:${q}`)
  const observedAt = new Date().toISOString()

  const displayName = query.trim()

  // Persist into normalized model so future searches can use `retail_location_products`
  // without hitting Kroger again.
  const retailerId = uuidFromStringDeterministic("wprice:retailer:kroger")
  const canonicalHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        name: displayName.toLowerCase().trim(),
        category: category.toLowerCase(),
        variants: [q],
      }),
    )
    .digest("hex")

  await supabase.from("products").upsert(
    {
      id: itemId,
      name: displayName,
      category,
      variants: [q],
      pack_meta: {},
      canonical_hash: canonicalHash,
      brand: null,
      upc_ean: null,
    },
    { onConflict: "id" },
  )

  await supabase.from("retailers").upsert(
    {
      id: retailerId,
      name: "Kroger",
      provider: "kroger",
      provider_retailer_id: "kroger",
      brand_meta: {},
    },
    { onConflict: "id" },
  )

  // Upsert item + kroger term mapping.
  await supabase.from("items").upsert(
    {
      id: itemId,
      name: displayName,
      category,
      variants: [],
    },
    { onConflict: "id" },
  )

  await supabase.from("kroger_item_terms").upsert(
    {
      item_id: itemId,
      term: query.trim(),
      provider_item_id: null,
    },
    { onConflict: "item_id" },
  )

  // Upsert stores so UI can reuse them.
  const storeRows = locations.map((loc) => {
    const storeId = storeIdFromKrogerLocationId(loc.locationId)
    return {
      id: storeId,
      name: loc.name ?? "Kroger",
      lat: loc.lat,
      lng: loc.lng,
      address: loc.address ?? null,
      category: "grocery",
      kroger_location_id: loc.locationId,
    }
  })

  await supabase.from("stores").upsert(storeRows, { onConflict: "id" })

  // Mirror legacy stores into normalized retail locations for FK safety + low-latency reads.
  await supabase.from("retail_locations").upsert(
    storeRows.map((s: any) => ({
      id: s.id,
      retailer_id: retailerId,
      provider: "kroger",
      provider_place_id: s.kroger_location_id ?? null,
      name: s.name,
      address_line1: s.address ?? null,
      address_line2: null,
      city: null,
      region: null,
      postal_code: null,
      lat: Number(s.lat),
      lng: Number(s.lng),
      place_persisted: true,
      provider_raw: {},
    })),
    { onConflict: "id" },
  )

  const offers: Offer[] = []
  const priceObservationRows: Array<any> = []
  const retailLocationProductRows: Array<any> = []
  // Sequential for MVP rate-limit friendliness.
  for (const loc of locations) {
    const storeId = storeIdFromKrogerLocationId(loc.locationId)
    const { price, name } = await fetchKrogerBestPriceForLocation(token, loc.locationId, query.trim())
    if (price == null) continue

    offers.push({
      store: {
        id: storeId,
        name: loc.name ?? "Kroger",
        lat: loc.lat,
        lng: loc.lng,
        address: loc.address ?? null,
        category: "grocery",
      },
      item: {
        id: itemId,
        name: name ?? displayName,
        category,
      },
      price,
      observedAt,
      distanceMeters: distanceMeters({ lat, lng }, { lat: loc.lat, lng: loc.lng }),
      source: "kroger",
      verificationType: "api_verified",
    })

    priceObservationRows.push({
      retail_location_id: storeId,
      product_id: itemId,

      source_type: "api",
      source_provider: "kroger_on_demand",
      source_observation_key: `kroger_on_demand:${loc.locationId}:${itemId}:${observedAt}`,

      price,
      availability: "unknown",

      observed_at: observedAt,
      observed_lat: loc.lat,
      observed_lng: loc.lng,

      verification_type: "api_verified",
      confidence_score: null,
      freshness_score: null,

      user_price_submission_id: null,
      reported_by_user_id: null,

      raw_payload: {},
    })

    retailLocationProductRows.push({
      retail_location_id: storeId,
      product_id: itemId,
      fuel_type: "",

      price,
      availability: "unknown",

      last_observed_at: observedAt,
      last_observation_id: null,

      verification_type: "api_verified",
      confidence_score: null,
      freshness_score: null,

      is_stale: false,
      is_live: true,
    })
  }

  if (priceObservationRows.length > 0) {
    await supabase.from("price_observations").upsert(priceObservationRows, {
      onConflict: "source_provider,source_observation_key",
    })
  }

  if (retailLocationProductRows.length > 0) {
    await supabase.from("retail_location_products").upsert(retailLocationProductRows, {
      onConflict: "retail_location_id,product_id,fuel_type",
    })
  }

  return offers.sort((a, b) => a.price - b.price || a.distanceMeters - b.distanceMeters).slice(0, limit)
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any
    const query = String(body?.query ?? "").trim()
    const lat = Number(body?.lat)
    const lng = Number(body?.lng)
    const limit = Number(body?.limit ?? 12)
    const radiusMeters = body?.radiusMeters != null ? Number(body.radiusMeters) : undefined

    if (!query) return NextResponse.json({ error: "Missing `query`" }, { status: 400 })
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "Missing/invalid `lat` and `lng`" }, { status: 400 })
    }

    const radiusMetersResolved = Number.isFinite(radiusMeters) && (radiusMeters as number) > 0 ? (radiusMeters as number) : 25_000

    const supabaseServer = createSupabaseServerClient()
    const { data: userData, error: userErr } = await supabaseServer.auth.getUser()
    if (userErr) throw userErr
    const userId = userData?.user?.id ?? null

    const cacheKey = `${normalizeQuery(query)}:${lat.toFixed(2)}:${lng.toFixed(2)}:${radiusMetersResolved}:${userId ?? "anon"}`
    const now = Date.now()
    const cached = onDemandCache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      return NextResponse.json({ offers: cached.offers, source: "cache" })
    }

    const supabase = createSupabaseServiceClient()
    const resultLimit = Math.max(1, Math.min(limit, 12))

    // 1) Primary path: current-state normalized offers + ranking.
    const normalized = await offersFromRetailLocationProducts({
      supabase,
      query,
      lat,
      lng,
      radiusMeters: radiusMetersResolved,
      userId,
      limit: resultLimit,
    })

    if (normalized.offers.length > 0) {
      if (userId) {
        const normalizedQ = normalizeQuery(query)
        const queryFingerprint = crypto.createHash("sha256").update(normalizedQ).digest("hex")
        const time_bucket = timeBucketFromLocalTime()
        const location_bucket = `${lat.toFixed(3)},${lng.toFixed(3)}`
        const distinctProductIds = Array.from(new Set(normalized.offers.map((o) => o.item.id))).slice(0, 5)
        const rows = distinctProductIds.map((productId) => ({
          user_id: userId,
          product_id: productId,
          query_fingerprint: queryFingerprint,
          time_bucket,
          location_bucket,
          count: 1,
        }))
        if (rows.length > 0) {
          await supabase.from("user_search_history").insert(rows)
        }
      }

      onDemandCache.set(cacheKey, { expiresAt: now + KROGER_ON_DEMAND_CACHE_TTL_MS, offers: normalized.offers })
      return NextResponse.json({ offers: normalized.offers, source: "normalized" })
    }

    // 2) Fallback to internal snapshot-based answers (legacy tables).
    const internalOffers = await internalOffersFromSnapshots({
      supabase,
      query,
      lat,
      lng,
      limit: resultLimit,
    })

    if (internalOffers.length > 0) {
      onDemandCache.set(cacheKey, { expiresAt: now + KROGER_ON_DEMAND_CACHE_TTL_MS, offers: internalOffers })
      return NextResponse.json({ offers: internalOffers, source: "snapshot" })
    }

    // 3) Fallback to on-demand Kroger lookup (and persistence).
    const offers = await krogerOnDemandOffers({
      supabase,
      query,
      lat,
      lng,
      limit: resultLimit,
    })

    if (offers.length > 0 && userId) {
      const normalizedQ = normalizeQuery(query)
      const queryFingerprint = crypto.createHash("sha256").update(normalizedQ).digest("hex")
      const time_bucket = timeBucketFromLocalTime()
      const location_bucket = `${lat.toFixed(3)},${lng.toFixed(3)}`
      const distinctProductIds = Array.from(new Set(offers.map((o) => o.item.id))).slice(0, 5)
      const rows = distinctProductIds.map((productId) => ({
        user_id: userId,
        product_id: productId,
        query_fingerprint: queryFingerprint,
        time_bucket,
        location_bucket,
        count: 1,
      }))
      await supabase.from("user_search_history").insert(rows)
    }

    onDemandCache.set(cacheKey, { expiresAt: now + KROGER_ON_DEMAND_CACHE_TTL_MS, offers })
    return NextResponse.json({ offers, source: "kroger" })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 })
  }
}

