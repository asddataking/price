import { NextResponse } from "next/server"

import { runIngestionPipeline } from "@/lib/ingestion/pipeline/runIngestion"
import type { AdapterId } from "@/lib/ingestion/sources/adapter"
import { createSupabaseServiceClient } from "@/lib/supabaseService"

const DEFAULT_ADAPTERS: AdapterId[] = ["gas", "grocery", "store_metadata", "user_merge"]

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | {
        sourceIds?: AdapterId[]
        location?: { lat: number; lng: number; radiusMeters?: number }
        dryRun?: boolean
        forceRefresh?: boolean
      }
    | null

  const sourceIds = Array.isArray(body?.sourceIds) && body.sourceIds.length > 0 ? body.sourceIds : DEFAULT_ADAPTERS

  const dryRun = body?.dryRun ?? true
  const forceRefresh = body?.forceRefresh ?? false

  const params = {
    location: body?.location,
  }

  const supabase = createSupabaseServiceClient()

  const { requestId, results } = await runIngestionPipeline({
    sourceIds,
    params,
    dryRun,
    supabase,
    forceRefresh,
  })

  return NextResponse.json({
    requestId,
    dryRun,
    results,
  })
}

