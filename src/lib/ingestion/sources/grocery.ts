import type { SourceAdapter } from "./adapter"
import type {
  IngestionCacheDescriptor,
  IngestionParams,
  IngestionRawResult,
  NormalizedResult,
} from "./types"

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
    const radius = location.radiusMeters ?? 3000
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

    return {
      cacheKey,
      locationKey,
      ttlSeconds,
      payload: { type: "stub", note: "grocery adapter placeholder (no provider call yet)" },
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

