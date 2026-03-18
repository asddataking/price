import type { SourceAdapter } from "./adapter"
import type {
  IngestionCacheDescriptor,
  IngestionParams,
  IngestionRawResult,
  NormalizedResult,
} from "./types"

export const gasAdapter: SourceAdapter = {
  id: "gas",
  enabled: true,
  slug: "gas",
  supportedCategories: ["gas"],
  defaultTtlSeconds: 5 * 60, // gas changes frequently
  async computeCacheDescriptor(
    params: IngestionParams,
    _ctx: { requestId?: string },
  ): Promise<IngestionCacheDescriptor> {
    const location = params.location ?? { lat: 0, lng: 0 }
    const radius = location.radiusMeters ?? 1000
    const cacheKey = `gas:${location.lat.toFixed(3)}:${location.lng.toFixed(3)}:${radius}`
    const locationKey = `bucket:lat=${location.lat.toFixed(3)}&lng=${location.lng.toFixed(3)}&r=${radius}`
    return {
      cacheKey,
      locationKey,
      ttlSeconds: gasAdapter.defaultTtlSeconds,
    }
  },
  async fetchRaw(params: IngestionParams, ctx: { requestId?: string }): Promise<IngestionRawResult> {
    const { cacheKey, locationKey, ttlSeconds } = await gasAdapter.computeCacheDescriptor(params, ctx)

    // Placeholder: no live provider call yet.
    return {
      cacheKey,
      locationKey,
      ttlSeconds,
      payload: { type: "stub", note: "gas adapter placeholder (no provider call yet)" },
    }
  },

  async validateRaw(_raw: IngestionRawResult) {
    // Stub adapter: nothing to validate yet.
  },

  async normalize(_raw: IngestionRawResult): Promise<NormalizedResult> {
    // Placeholder: return no candidates until we add a real source adapter.
    return { prices: [] }
  },

  async upsertRawIngestion() {
    // Placeholder no-op for Step 4 (raw_ingestions + sourced_price_events upserts).
  },
}

