import crypto from "crypto"

import { getSourceAdapters } from "../sources"
import type { AdapterId, SourceAdapter } from "../sources/adapter"
import type { IngestionParams } from "../sources/types"
import type { NormalizedResult } from "../sources/types"

import { computePayloadHash } from "../cache/computePayloadHash"
import { acquireSourceFetchLock } from "../cache/locks"
import { getCachedOrScheduleRefresh } from "../cache/getCachedOrScheduleRefresh"
import { ensureDataSourceId } from "../cache/dataSources"
import { upsertRawIngestion } from "../cache/upsertRawIngestion"
import { insertSourcedPriceEventsFromCandidates } from "../cache/upsertSourcedPriceEvents"
import {
  recomputeBestRecentSnapshotsFromSourcedEvents,
  upsertLatestPriceSnapshotsFromCandidates,
} from "../cache/snapshotUpsert"

export type AdapterRunSummary = {
  sourceId: AdapterId
  slug: string
  dryRun: boolean
  cacheStatus: "cache_hit" | "locked" | "cache_miss"
  rawCacheKey: string
  rawLocationKey: string
  rawTtlSeconds: number
  normalizedPriceCount: number
  payloadChanged: boolean | null
}

function makeRequestId() {
  return crypto.randomUUID()
}

async function runSingleAdapter({
  adapter,
  params,
  dryRun,
  requestId,
  supabase,
  forceRefresh,
}: {
  adapter: SourceAdapter
  params: IngestionParams
  dryRun: boolean
  requestId: string
  supabase?: any
  forceRefresh: boolean
}): Promise<AdapterRunSummary> {
  const cacheDescriptor = await adapter.computeCacheDescriptor(params, { requestId })

  let dataSourceId: string | null = null
  let previousPayloadHash: string | null = null

  // TTL cache check (must happen before fetchRaw()).
  if (supabase) {
    const ensured = await ensureDataSourceId({
      supabase,
      slug: adapter.slug,
      enabled: adapter.enabled,
      priority: 0,
      defaultTtlSeconds: adapter.defaultTtlSeconds,
      categoryScopes: adapter.supportedCategories,
    })
    dataSourceId = ensured.dataSourceId

    const cached = await getCachedOrScheduleRefresh({
      supabase,
      dataSourceId,
      cacheKey: cacheDescriptor.cacheKey,
      locationKey: cacheDescriptor.locationKey,
    })

    previousPayloadHash = cached.cachedPayloadHash
    const cacheHit = cached.cacheHit && !forceRefresh
    if (cacheHit) {
      return {
        sourceId: adapter.id,
        slug: adapter.slug,
        dryRun,
        cacheStatus: "cache_hit",
        rawCacheKey: cacheDescriptor.cacheKey,
        rawLocationKey: cacheDescriptor.locationKey,
        rawTtlSeconds: cacheDescriptor.ttlSeconds,
        normalizedPriceCount: 0,
        payloadChanged: false,
      }
    }
  }

  // Prevent duplicate concurrent ingestion for the same source/cache/location bucket.
  if (supabase && dataSourceId) {
    const { acquired } = await acquireSourceFetchLock({
      supabase,
      dataSourceId,
      cacheKey: cacheDescriptor.cacheKey,
      locationKey: cacheDescriptor.locationKey,
    })
    if (!acquired) {
      return {
        sourceId: adapter.id,
        slug: adapter.slug,
        dryRun,
        cacheStatus: "locked",
        rawCacheKey: cacheDescriptor.cacheKey,
        rawLocationKey: cacheDescriptor.locationKey,
        rawTtlSeconds: cacheDescriptor.ttlSeconds,
        normalizedPriceCount: 0,
        payloadChanged: null,
      }
    }
  }

  // Cache miss or forced refresh: fetch raw payload.
  const raw = await adapter.fetchRaw(params, { requestId })
  await adapter.validateRaw(raw)

  const fetchedAtIso = new Date().toISOString()
  const expiresAtIso = new Date(Date.now() + cacheDescriptor.ttlSeconds * 1000).toISOString()
  const payloadHash = computePayloadHash(raw.payload)

  const payloadChanged = previousPayloadHash ? previousPayloadHash !== payloadHash : true

  // If the payload didn’t change, extend TTL but skip normalization/snapshots.
  if (!payloadChanged) {
    if (supabase && dataSourceId && !dryRun) {
      const { data: ingestionRunRow, error: ingestionRunError } = await supabase
        .from("ingestion_runs")
        .insert({
          source_id: dataSourceId,
          status: "running",
          run_metadata: { request_id: requestId, adapter: adapter.id },
        })
        .select("id")
        .maybeSingle()

      if (ingestionRunError) throw ingestionRunError
      const ingestionRunId = ingestionRunRow?.id as string | undefined
      if (!ingestionRunId) throw new Error("Failed to create ingestion_runs row")

      try {
        await upsertRawIngestion({
          supabase,
          dataSourceId,
          ingestionRunId,
          cacheKey: cacheDescriptor.cacheKey,
          locationKey: cacheDescriptor.locationKey,
          payloadHash,
          rawPayload: raw.payload,
          fetchedAtIso,
          expiresAtIso,
        })

        await supabase
          .from("ingestion_runs")
          .update({ status: "success", finished_at: fetchedAtIso })
          .eq("id", ingestionRunId)
      } catch (e: any) {
        await supabase
          .from("ingestion_runs")
          .update({
            status: "failed",
            finished_at: new Date().toISOString(),
            error_message: e?.message ?? "Unknown error",
          })
          .eq("id", ingestionRunId)
        throw e
      }
    }

    return {
      sourceId: adapter.id,
      slug: adapter.slug,
      dryRun,
      cacheStatus: "cache_miss",
      rawCacheKey: cacheDescriptor.cacheKey,
      rawLocationKey: cacheDescriptor.locationKey,
      rawTtlSeconds: cacheDescriptor.ttlSeconds,
      normalizedPriceCount: 0,
      payloadChanged: false,
    }
  }

  const normalized: NormalizedResult = await adapter.normalize(raw, { requestId })

  if (supabase && dataSourceId && !dryRun) {
    const { data: ingestionRunRow, error: ingestionRunError } = await supabase
      .from("ingestion_runs")
      .insert({
        source_id: dataSourceId,
        status: "running",
        run_metadata: { request_id: requestId, adapter: adapter.id },
      })
      .select("id")
      .maybeSingle()

    if (ingestionRunError) throw ingestionRunError
    const ingestionRunId = ingestionRunRow?.id as string | undefined
    if (!ingestionRunId) throw new Error("Failed to create ingestion_runs row")

    try {
      const { rawIngestionId } = await upsertRawIngestion({
        supabase,
        dataSourceId,
        ingestionRunId,
        cacheKey: cacheDescriptor.cacheKey,
        locationKey: cacheDescriptor.locationKey,
        payloadHash,
        rawPayload: raw.payload,
        fetchedAtIso,
        expiresAtIso,
      })

      if (!rawIngestionId) throw new Error("Failed to upsert raw_ingestions row")

      const candidatesWithPayload = normalized.prices.map((p) => ({
        ...p,
        payloadHash,
      }))

      await insertSourcedPriceEventsFromCandidates({
        supabase,
        dataSourceId,
        ingestionRunId,
        rawIngestionId,
        payloadHash,
        candidates: candidatesWithPayload,
      })

      await upsertLatestPriceSnapshotsFromCandidates({
        supabase,
        candidates: candidatesWithPayload,
      })

      await recomputeBestRecentSnapshotsFromSourcedEvents({
        supabase,
        candidates: candidatesWithPayload,
      })

      await supabase
        .from("ingestion_runs")
        .update({ status: "success", finished_at: fetchedAtIso })
        .eq("id", ingestionRunId)
    } catch (e: any) {
      await supabase
        .from("ingestion_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message: e?.message ?? "Unknown error",
        })
        .eq("id", ingestionRunId)
      throw e
    }
  }

  return {
    sourceId: adapter.id,
    slug: adapter.slug,
    dryRun,
    cacheStatus: "cache_miss",
    rawCacheKey: cacheDescriptor.cacheKey,
    rawLocationKey: cacheDescriptor.locationKey,
    rawTtlSeconds: cacheDescriptor.ttlSeconds,
    normalizedPriceCount: normalized.prices.length,
    payloadChanged,
  }
}

export async function runIngestionPipeline({
  sourceIds,
  params,
  dryRun,
  supabase,
  forceRefresh,
}: {
  sourceIds: AdapterId[]
  params: IngestionParams
  dryRun: boolean
  supabase?: any
  forceRefresh?: boolean
}): Promise<{
  requestId: string
  results: AdapterRunSummary[]
}> {
  const requestId = makeRequestId()
  const adapters = getSourceAdapters(sourceIds)

  const results: AdapterRunSummary[] = []
  for (const adapter of adapters) {
    if (!adapter.enabled) continue
    results.push(
      await runSingleAdapter({
        adapter,
        params,
        dryRun,
        requestId,
        supabase,
        forceRefresh: forceRefresh ?? false,
      }),
    )
  }

  return { requestId, results }
}

