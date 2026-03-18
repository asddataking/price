import type { IngestionCacheDescriptor, IngestionParams, IngestionRawResult, NormalizedResult } from "./types"

export type AdapterId = "gas" | "grocery" | "store_metadata" | "user_merge"

export type SourceAdapter = {
  id: AdapterId

  enabled: boolean

  // Human-readable (for logging + future data_sources rows).
  slug: string

  // For UI/data selection later; currently informational.
  supportedCategories: string[]

  // Used for TTL decisions in Step 4.
  defaultTtlSeconds: number

  // Cheap deterministic cache key computation (must not call external providers).
  // This enables TTL checks before fetchRaw().
  computeCacheDescriptor: (params: IngestionParams, ctx: { requestId?: string }) => Promise<IngestionCacheDescriptor>

  fetchRaw: (params: IngestionParams, ctx: { requestId?: string }) => Promise<IngestionRawResult>

  validateRaw: (raw: IngestionRawResult) => Promise<void>

  // Normalize raw payload into canonical-ish candidates.
  normalize: (raw: IngestionRawResult, ctx: { requestId?: string }) => Promise<NormalizedResult>

  // Optional adapter-specific side effects; Step 4 will likely do the real upserts.
  upsertRawIngestion: () => Promise<void>
}

