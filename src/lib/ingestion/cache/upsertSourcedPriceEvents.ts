import crypto from "crypto"

import type { NormalizedPriceCandidate } from "../sources/types"

function toFuelKey(fuelType?: string): string {
  return (fuelType ?? "").trim()
}

function uuidFromStringDeterministic(input: string) {
  // Deterministic UUID derived from sha256 digest (RFC 4122 variant).
  const hash = crypto.createHash("sha256").update(input).digest()
  const bytes = Uint8Array.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function canonicalHashFromProduct(input: { name: string; category: string; variants?: string[] }) {
  const variants = Array.isArray(input.variants) ? [...input.variants] : []
  variants.sort((a, b) => String(a).localeCompare(String(b)))

  const stable = JSON.stringify({
    name: input.name.trim().toLowerCase(),
    category: input.category.trim().toLowerCase(),
    variants,
  })
  return crypto.createHash("sha256").update(stable).digest("hex")
}

function mapCandidateVerificationToRetailVerificationType(verificationType?: string): string {
  // Existing adapters emit `sourced` today. Normalize to badge-friendly values.
  const raw = String(verificationType ?? "").trim().toLowerCase()
  if (!raw) return "api_verified"
  if (raw === "sourced" || raw === "api" || raw === "api_verified") return "api_verified"
  if (raw === "live") return "api_live"
  if (raw.includes("user")) return "user_reported"
  if (raw.includes("receipt")) return "user_receipt"
  return "api_verified"
}

function mapCandidateCategoryToPriceItemCategory(
  category?: string,
): "gas" | "cigarettes" | "liquor" | "groceries" {
  const c = String(category ?? "").trim().toLowerCase()
  if (c === "gas") return "gas"
  if (c === "cigarettes") return "cigarettes"
  if (c === "liquor") return "liquor"
  // Adapters may use legacy category names like "groceries"
  if (c === "groceries" || c === "grocery") return "groceries"
  return "groceries"
}

const LEGACY_RETAILER_ID = uuidFromStringDeterministic("wprice:retailer:legacy")
const DEFAULT_PRICE_OBSERVATION_LIVE_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes

export async function insertSourcedPriceEventsFromCandidates({
  supabase,
  dataSourceId,
  ingestionRunId,
  rawIngestionId,
  payloadHash,
  candidates,
}: {
  supabase: any
  dataSourceId: string
  ingestionRunId: string
  rawIngestionId: string | null
  payloadHash: string
  candidates: NormalizedPriceCandidate[]
}): Promise<number> {
  if (!rawIngestionId) throw new Error("rawIngestionId is required to upsert sourced_price_events.")

  const withIds = candidates.filter((c) => c.storeId && c.itemId)
  if (withIds.length === 0) return 0

  // Ensure referenced stores exist so FK constraints don't fail.
  // Adapters can provide best-effort store metadata; we upsert those rows here.
  const withStoreInfo = withIds.filter(
    (c) => typeof c.store?.lat === "number" && typeof c.store?.lng === "number" && typeof c.storeId === "string",
  )

  if (withStoreInfo.length === 0) return 0

  const storeRows = withStoreInfo.map((c) => ({
    id: c.storeId as string,
    name: c.store?.name ?? "Kroger Store",
    lat: c.store?.lat as number,
    lng: c.store?.lng as number,
    address: typeof c.store?.address === "string" ? c.store?.address : null,
    kroger_location_id: typeof c.store?.krogerLocationId === "string" ? c.store?.krogerLocationId : null,
    // For this MVP grocery ingestion is the only provider writing into this path.
    category: "grocery",
  }))

  // Upsert on PK `id` so re-running ingestion converges.
  const { error: storesError } = await supabase.from("stores").upsert(storeRows, { onConflict: "id" })
  if (storesError) throw storesError

  // -------------------------------------------------------------------------
  // Dual-write to normalized current-state + historical tracking
  // -------------------------------------------------------------------------
  // MVP migration approach:
  // - Preserve legacy `stores`/`items` identity by using the same UUIDs as:
  //   - `retail_locations.id = stores.id`
  //   - `products.id = items.id` (derived from candidate metadata)
  // - Map all legacy stores into a single placeholder retailer chain for FK safety.

  await supabase.from("retailers").upsert(
    {
      id: LEGACY_RETAILER_ID,
      name: "Legacy Chain",
      provider: "google",
      provider_retailer_id: "legacy",
      brand_meta: {},
    },
    { onConflict: "id" },
  )

  const distinctStores = withStoreInfo.filter((c, idx, arr) => arr.findIndex((x) => x.storeId === c.storeId) === idx)
  const retailLocationRows = distinctStores.map((c) => {
    const store = c.store
    return {
      id: c.storeId as string,
      retailer_id: LEGACY_RETAILER_ID,
      provider: typeof store?.krogerLocationId === "string" ? "kroger" : "google",
      provider_place_id: typeof store?.krogerLocationId === "string" ? store.krogerLocationId : null,
      name: store?.name ?? "Retail Location",
      address_line1: typeof store?.address === "string" ? store.address : null,
      address_line2: null,
      city: null,
      region: null,
      postal_code: null,
      lat: store?.lat as number,
      lng: store?.lng as number,
      place_persisted: true,
      provider_raw: {},
    }
  })

  await supabase.from("retail_locations").upsert(retailLocationRows, { onConflict: "id" })

  const distinctItems = withStoreInfo.filter((c, idx, arr) => arr.findIndex((x) => x.itemId === c.itemId) === idx)
  const productRows = distinctItems.map((c) => {
    const itemName = c.item?.name ?? "Unknown Product"
    const category = mapCandidateCategoryToPriceItemCategory(c.item?.category)
    const variants = Array.isArray(c.item?.variants) ? c.item?.variants ?? [] : []

    return {
      id: c.itemId as string,
      name: itemName,
      category,
      brand: null,
      upc_ean: null,
      variants,
      pack_meta: {},
      canonical_hash: canonicalHashFromProduct({ name: itemName, category, variants }),
    }
  })

  await supabase.from("products").upsert(productRows, { onConflict: "id" })

  const nowMs = Date.now()

  const priceObservationRows = withStoreInfo.map((c) => {
    const observedAt = c.observedAt
    const fuelType = toFuelKey(c.fuelType)
    const store = c.store
    const storeObservedLat = typeof store?.lat === "number" ? store.lat : null
    const storeObservedLng = typeof store?.lng === "number" ? store.lng : null

    return {
      retail_location_id: c.storeId as string,
      product_id: c.itemId as string,

      source_type: "api",
      source_provider: dataSourceId,
      source_observation_key: `${rawIngestionId}:${c.storeId}:${c.itemId}:${fuelType}:${observedAt}`,

      price: c.price,
      availability: "unknown",

      observed_at: observedAt,
      observed_lat: storeObservedLat,
      observed_lng: storeObservedLng,

      verification_type: mapCandidateVerificationToRetailVerificationType(c.verificationType),
      confidence_score: c.confidenceScore ?? null,
      freshness_score: c.freshnessScore ?? null,

      user_price_submission_id: null,
      reported_by_user_id: null,

      raw_payload: {},
    }
  })

  const { error: priceObservationsError } = await supabase
    .from("price_observations")
    .upsert(priceObservationRows, { onConflict: "source_provider,source_observation_key" })
  if (priceObservationsError) throw priceObservationsError

  const retailLocationProductRows = withStoreInfo.map((c) => {
    const observedAtMs = new Date(c.observedAt).getTime()
    const isLive =
      Number.isFinite(observedAtMs) ? nowMs - observedAtMs <= DEFAULT_PRICE_OBSERVATION_LIVE_THRESHOLD_MS : false

    return {
      retail_location_id: c.storeId as string,
      product_id: c.itemId as string,
      fuel_type: toFuelKey(c.fuelType),

      price: c.price,
      availability: "unknown",
      last_observed_at: c.observedAt,
      last_observation_id: null,

      verification_type: mapCandidateVerificationToRetailVerificationType(c.verificationType),
      confidence_score: c.confidenceScore ?? null,
      freshness_score: c.freshnessScore ?? null,

      is_stale: !isLive,
      is_live: isLive,
    }
  })

  const { error: retailLocationProductsError } = await supabase
    .from("retail_location_products")
    .upsert(retailLocationProductRows, { onConflict: "retail_location_id,product_id,fuel_type" })
  if (retailLocationProductsError) throw retailLocationProductsError

  const rows = withStoreInfo.map((c) => {
    const observedLat = c.store?.lat as number
    const observedLng = c.store?.lng as number
    return {
      source_id: dataSourceId,
      ingestion_run_id: ingestionRunId,
      raw_ingestion_id: rawIngestionId,

      store_id: c.storeId as string,
      item_id: c.itemId as string,

      price: c.price,
      observed_at: c.observedAt,

      fuel_type: toFuelKey(c.fuelType),
      verification_type: c.verificationType ?? "sourced",
      confidence_score: c.confidenceScore ?? null,
      freshness_score: c.freshnessScore ?? null,

      observed_lat: Number.isFinite(observedLat) ? observedLat : null,
      observed_lng: Number.isFinite(observedLng) ? observedLng : null,

      payload_hash: payloadHash,
    }
  })

  const { error } = await supabase.from("sourced_price_events").upsert(rows, {
    onConflict: "raw_ingestion_id,store_id,item_id,fuel_type",
  })
  if (error) throw error

  return rows.length
}

