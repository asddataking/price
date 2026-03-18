import type { SourceAdapter } from "./adapter"
import type {
  IngestionCacheDescriptor,
  IngestionParams,
  IngestionRawResult,
  NormalizedResult,
} from "./types"

export const storeMetadataAdapter: SourceAdapter = {
  id: "store_metadata",
  enabled: true,
  slug: "store_metadata",
  supportedCategories: ["gas_station", "convenience", "liquor", "grocery"],
  defaultTtlSeconds: 30 * 24 * 60 * 60, // long TTL for store lists
  async computeCacheDescriptor(
    params: IngestionParams,
    _ctx: { requestId?: string },
  ): Promise<IngestionCacheDescriptor> {
    const location = params.location ?? { lat: 0, lng: 0 }
    const radius = location.radiusMeters ?? 10_000
    const cacheKey = `stores:${location.lat.toFixed(3)}:${location.lng.toFixed(3)}:${radius}`
    const locationKey = `bucket:lat=${location.lat.toFixed(3)}&lng=${location.lng.toFixed(3)}&r=${radius}`
    return {
      cacheKey,
      locationKey,
      ttlSeconds: storeMetadataAdapter.defaultTtlSeconds,
    }
  },

  async fetchRaw(params: IngestionParams, ctx: { requestId?: string }): Promise<IngestionRawResult> {
    const { cacheKey, locationKey, ttlSeconds } = await storeMetadataAdapter.computeCacheDescriptor(params, ctx)

    return {
      cacheKey,
      locationKey,
      ttlSeconds,
      payload: { type: "stub", note: "store metadata adapter placeholder (no provider call yet)" },
    }
  },

  async validateRaw(_raw: IngestionRawResult) {
    // Stub adapter: nothing to validate yet.
  },

  async normalize(_raw: IngestionRawResult): Promise<NormalizedResult> {
    return { prices: [] }
  },

  async upsertRawIngestion() {
    // Placeholder no-op for Step 4.
  },
}

