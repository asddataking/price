export type LocationScope = {
  lat: number
  lng: number
  radiusMeters?: number
  // Adapters can use any additional location scoping params they need.
  [key: string]: unknown
}

export type IngestionParams = {
  location?: LocationScope
  // Arbitrary adapter-specific parameters (e.g. fuel type, region, store list seed).
  [key: string]: unknown
}

export type IngestionRawResult = {
  cacheKey: string
  locationKey: string
  payload: unknown
  ttlSeconds: number
}

export type IngestionCacheDescriptor = {
  cacheKey: string
  locationKey: string
  ttlSeconds: number
}

export type NormalizedPriceCandidate = {
  // Canonical resolution happens later (Step 4), but adapters can optionally provide IDs.
  storeId?: string
  itemId?: string
  // If IDs aren’t known yet, adapters can supply text/geo to resolve.
  store?: {
    name?: string
    address?: string
    lat?: number
    lng?: number
    // Optional provider-provenance identifier used for provider-backed store upserts.
    krogerLocationId?: string
  }
  item?: { name?: string; category?: string; variants?: string[] }

  price: number
  observedAt: string // ISO

  // Gas-only
  fuelType?: string

  // Used for provenance/dedupe (derived from the raw ingestion payload hash).
  payloadHash?: string
  // Confidence/freshness are optional until we standardize scoring in Step 4.
  confidenceScore?: number
  freshnessScore?: number

  // Provider-provenance
  verificationType?: string
}

export type NormalizedResult = {
  prices: NormalizedPriceCandidate[]
}

export type IngestionRunContext = {
  // Used by adapters that want deterministic behavior (tests / dry-runs).
  requestId?: string
}

