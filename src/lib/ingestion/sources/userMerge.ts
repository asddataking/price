import type { SourceAdapter } from "./adapter"
import type {
  IngestionCacheDescriptor,
  IngestionParams,
  IngestionRawResult,
  NormalizedResult,
} from "./types"

/**
 * User-merge adapter: in v1 it can later convert user verified reports
 * (`public.price_reports`) into the sourced snapshot tables.
 *
 * For now it’s a placeholder so the adapter pipeline is complete.
 */
export const userMergeAdapter: SourceAdapter = {
  id: "user_merge",
  enabled: true,
  slug: "user_merge",
  supportedCategories: ["gas", "cigarettes", "liquor", "groceries"],
  defaultTtlSeconds: 6 * 60 * 60, // refresh social proof style feeds periodically
  async computeCacheDescriptor(
    params: IngestionParams,
    _ctx: { requestId?: string },
  ): Promise<IngestionCacheDescriptor> {
    const location = params.location ?? { lat: 0, lng: 0 }
    const radius = location.radiusMeters ?? 10_000
    const cacheKey = `user_merge:${location.lat.toFixed(3)}:${location.lng.toFixed(3)}:${radius}`
    const locationKey = `bucket:lat=${location.lat.toFixed(3)}&lng=${location.lng.toFixed(3)}&r=${radius}`
    return {
      cacheKey,
      locationKey,
      ttlSeconds: userMergeAdapter.defaultTtlSeconds,
    }
  },

  async fetchRaw(params: IngestionParams, ctx: { requestId?: string }): Promise<IngestionRawResult> {
    const { cacheKey, locationKey, ttlSeconds } = await userMergeAdapter.computeCacheDescriptor(params, ctx)

    return {
      cacheKey,
      locationKey,
      ttlSeconds,
      payload: { type: "stub", note: "user merge adapter placeholder (no DB pull yet)" },
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

