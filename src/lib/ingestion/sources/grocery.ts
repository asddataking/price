import crypto from "crypto"

import type { SourceAdapter } from "./adapter"
import type {
  IngestionCacheDescriptor,
  IngestionParams,
  IngestionRawResult,
  NormalizedResult,
  NormalizedPriceCandidate,
} from "./types"

type KrogerLocation = {
  locationId: string
  name?: string
  address?: string | null
  lat: number
  lng: number
}

type KrogerSeedProduct = {
  itemId: string
  term: string
  displayName: string
}

type KrogerGroceryPayload = {
  type: "kroger_grocery"
  locations: KrogerLocation[]
  // priceByLocationIdBySeedTerm is intentionally sparse: we only store prices we can extract.
  priceByLocationIdBySeedTerm: Record<string, Partial<Record<string, number>>>
  observedAtIso: string
}

const KROGER_BASE = "https://api.kroger.com/v1"
const KROGER_TOKEN_URL = `${KROGER_BASE}/connect/oauth2/token`

// Deterministic UUID generator for provider IDs.
// We use this so store IDs are stable across ingestions.
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

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

function tryExtractBestKrogerPrice(product: any): number | null {
  // Kroger price objects vary; prefer promo/discount if present.
  // We try a small list of common shapes.
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
    // Some payloads put money in a top-level-ish field.
    product?.price ?? null,
    product?.nationalPrice?.promo?.amount ?? null,
    product?.nationalPrice?.promo?.value ?? null,
    product?.nationalPrice?.regular?.amount ?? null,
    product?.nationalPrice?.regular?.value ?? null,
  ]

  const parsed = candidates.map((c) => asFiniteNumber(c)).filter((n): n is number => n != null)
  if (parsed.length === 0) return null

  // If there are multiple values, the smallest is the "best deal" representation.
  return Math.min(...parsed)
}

function getLocationText(loc: any) {
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

export const groceryAdapter: SourceAdapter = {
  id: "grocery",
  enabled: true,
  slug: "grocery",
  supportedCategories: ["groceries", "convenience", "liquor"],
  defaultTtlSeconds: 12 * 60 * 60, // medium TTL for retail pricing
  async computeCacheDescriptor(
    params: IngestionParams,
    _ctx: { requestId?: string },
  ): Promise<IngestionCacheDescriptor> {
    const location = params.location ?? { lat: 0, lng: 0 }
    // Bigger default radius because retail stores can be spaced out.
    const radius = location.radiusMeters ?? 15_000
    const cacheKey = `grocery:${location.lat.toFixed(3)}:${location.lng.toFixed(3)}:${radius}`
    const locationKey = `bucket:lat=${location.lat.toFixed(3)}&lng=${location.lng.toFixed(3)}&r=${radius}`
    return {
      cacheKey,
      locationKey,
      ttlSeconds: groceryAdapter.defaultTtlSeconds,
    }
  },

  async fetchRaw(params: IngestionParams, ctx: { requestId?: string }): Promise<IngestionRawResult> {
    const { cacheKey, locationKey, ttlSeconds } = await groceryAdapter.computeCacheDescriptor(params, ctx)

    const KROGER_CLIENT_ID = process.env.KROGER_CLIENT_ID
    const KROGER_CLIENT_SECRET = process.env.KROGER_CLIENT_SECRET
    if (!KROGER_CLIENT_ID || !KROGER_CLIENT_SECRET) {
      return {
        cacheKey,
        locationKey,
        ttlSeconds,
        payload: { type: "kroger_grocery_error", error: "Missing KROGER_CLIENT_ID/SECRET env vars." } as any,
      }
    }

    const location = params.location ?? { lat: 0, lng: 0 }
    const radiusMeters = location.radiusMeters ?? 15_000

    const observedAtIso = new Date().toISOString()

    const krogerSeedProducts: KrogerSeedProduct[] = [
      // Seeded grocery items from `supabase/migrations/0001_price_dash_schema.sql`.
      { itemId: "00000000-0000-0000-0000-000000000008", term: "2% milk 1 gallon", displayName: "2% Milk (Gallon)" },
      { itemId: "00000000-0000-0000-0000-000000000009", term: "eggs dozen", displayName: "Eggs (Dozen)" },
      { itemId: "00000000-0000-0000-0000-000000000010", term: "greek yogurt 32 oz", displayName: "Greek Yogurt (32oz)" },
    ]

    async function getKrogerToken() {
      const basic = Buffer.from(`${KROGER_CLIENT_ID}:${KROGER_CLIENT_SECRET}`).toString("base64")
      const body = new URLSearchParams({
        grant_type: "client_credentials",
        // For this app we need product catalog+pricing.
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
        throw new Error(`Kroger token request failed (${res.status}): ${text.slice(0, 500)}`)
      }

      const json = (await res.json().catch(() => ({}))) as any
      const token = typeof json?.access_token === "string" ? json.access_token : null
      if (!token) throw new Error("Kroger token missing access_token in response.")
      return token
    }

    async function fetchKrogerLocations(token: string) {
      const url = new URL(`${KROGER_BASE}/locations`)
      const lat = location.lat
      const lng = location.lng
      const radiusMiles = radiusMeters / 1609.34

      // Kroger filters use the `filter.*` convention.
      url.searchParams.set("filter.latLong.near", `${lat},${lng}`)
      url.searchParams.set("filter.radiusInMiles", String(radiusMiles))
      url.searchParams.set("filter.limit", "20")

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`Kroger locations request failed (${res.status}): ${text.slice(0, 500)}`)
      }

      const json = (await res.json().catch(() => ({}))) as any
      const raw = Array.isArray(json?.data) ? json.data : Array.isArray(json?.locations) ? json.locations : []

      const locations: KrogerLocation[] = []
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
          name: typeof loc?.name === "string" ? loc.name : typeof loc?.locationName === "string" ? loc.locationName : undefined,
          address: getLocationText(loc),
          lat: latVal,
          lng: lngVal,
        })
      }

      return locations
    }

    async function fetchKrogerProductPricesForLocation(token: string, locationId: string, term: string) {
      const url = new URL(`${KROGER_BASE}/products`)
      url.searchParams.set("filter.term", term)
      url.searchParams.set("filter.locationId", locationId)
      url.searchParams.set("filter.limit", "5")

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        // Soft-fail: return null price for this term/location pair.
        return { price: null as number | null, error: text.slice(0, 300) }
      }

      const json = (await res.json().catch(() => ({}))) as any
      const rawProducts = Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.products)
          ? json.products
          : Array.isArray(json)
            ? json
            : []

      let best: number | null = null
      for (const product of rawProducts) {
        const price = tryExtractBestKrogerPrice(product)
        if (price == null) continue
        if (best == null || price < best) best = price
      }
      return { price: best }
    }

    try {
      const token = await getKrogerToken()
      const locations = await fetchKrogerLocations(token)
      const limited = locations.slice(0, 8) // Cap compute for MVP.

      const priceByLocationIdBySeedTerm: KrogerGroceryPayload["priceByLocationIdBySeedTerm"] = {}
      for (const loc of limited) {
        const perTerm: Partial<Record<string, number>> = {}
        // Run the seed terms sequentially to stay under rate limits.
        for (const seed of krogerSeedProducts) {
          const { price } = await fetchKrogerProductPricesForLocation(token, loc.locationId, seed.term)
          if (price == null) continue
          perTerm[seed.term] = price
        }
        priceByLocationIdBySeedTerm[loc.locationId] = perTerm
      }

      return {
        cacheKey,
        locationKey,
        ttlSeconds,
        payload: {
          type: "kroger_grocery",
          locations: limited,
          priceByLocationIdBySeedTerm,
          observedAtIso,
        } satisfies KrogerGroceryPayload,
      }
    } catch (e: any) {
      return {
        cacheKey,
        locationKey,
        ttlSeconds,
        payload: { type: "kroger_grocery_error", error: e?.message ?? "Unknown kroger ingestion error" } as any,
      }
    }
  },

  async validateRaw(_raw: IngestionRawResult) {
    // Best-effort: payload validation happens in `normalize()`.
  },

  async normalize(raw: IngestionRawResult): Promise<NormalizedResult> {
    const payload = raw.payload as any
    if (payload?.type !== "kroger_grocery") return { prices: [] }

    const seedProducts: KrogerSeedProduct[] = [
      { itemId: "00000000-0000-0000-0000-000000000008", term: "2% milk 1 gallon", displayName: "2% Milk (Gallon)" },
      { itemId: "00000000-0000-0000-0000-000000000009", term: "eggs dozen", displayName: "Eggs (Dozen)" },
      { itemId: "00000000-0000-0000-0000-000000000010", term: "greek yogurt 32 oz", displayName: "Greek Yogurt (32oz)" },
    ]

    const candidates: NormalizedPriceCandidate[] = []

    const locations: KrogerLocation[] = Array.isArray(payload?.locations) ? payload.locations : []
    const observedAtIso = typeof payload?.observedAtIso === "string" ? payload.observedAtIso : new Date().toISOString()
    const pricesByLoc = (payload?.priceByLocationIdBySeedTerm ?? {}) as Record<string, Partial<Record<string, number>>>

    for (const loc of locations) {
      for (const seed of seedProducts) {
        const p = pricesByLoc?.[loc.locationId]?.[seed.term]
        if (p == null) continue
        if (!Number.isFinite(p)) continue

        candidates.push({
          storeId: storeIdFromKrogerLocationId(loc.locationId),
          itemId: seed.itemId,
          store: {
            name: loc.name,
            address: loc.address ?? undefined,
            lat: loc.lat,
            lng: loc.lng,
            krogerLocationId: loc.locationId,
          },
          item: {
            name: seed.displayName,
            category: "groceries",
            variants: [],
          },
          price: p,
          observedAt: observedAtIso,
          verificationType: "sourced",
        })
      }
    }

    return { prices: candidates }
  },

  async upsertRawIngestion() {
    // Placeholder no-op for Step 4.
  },
}

