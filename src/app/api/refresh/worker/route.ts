import { NextResponse } from "next/server"

import { createSupabaseServiceClient } from "@/lib/supabaseService"
import type { AdapterId } from "@/lib/ingestion/sources/adapter"
import { runIngestionPipeline } from "@/lib/ingestion/pipeline/runIngestion"
import type { IngestionParams } from "@/lib/ingestion/sources/types"

const MAX_JOBS_PER_WORKER = 6

const INTERVAL_MS_BY_TIER = {
  aggressive: 2 * 60 * 60 * 1000, // 2h
  moderate: 12 * 60 * 60 * 1000, // 12h
  lazy: 48 * 60 * 60 * 1000, // 48h
} as const

export async function POST(req: Request) {
  const expectedSecret = process.env.REFRESH_WORKER_SECRET
  if (expectedSecret) {
    const provided = req.headers.get("x-refresh-secret") ?? ""
    if (provided !== expectedSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createSupabaseServiceClient()
  const now = new Date()
  const nowIso = now.toISOString()

  // Claim eligible queued jobs with a small budget.
  const { data: jobs, error: jobsErr } = await supabase
    .from("refresh_jobs")
    .select("id,target_id,status,priority_score,run_at,attempts,max_attempts")
    .eq("status", "queued")
    .lte("run_at", nowIso)
    .order("priority_score", { ascending: false })
    .limit(MAX_JOBS_PER_WORKER)

  if (jobsErr) throw jobsErr

  const claimedJobs: typeof jobs = []
  for (const job of jobs ?? []) {
    // Atomic-ish claim by status/attempt bounds.
    const nextAttempts = (job.attempts ?? 0) + 1

    const { data: claimed, error: claimErr } = await supabase
      .from("refresh_jobs")
      .update({
        status: "running",
        locked_by: "worker",
        locked_at: nowIso,
        started_at: nowIso,
        attempts: nextAttempts,
      })
      .eq("id", job.id)
      .eq("status", "queued")
      .lt("attempts", job.max_attempts)
      .select("id,target_id")
      .maybeSingle()

    if (claimErr) throw claimErr
    if (!claimed) continue

    claimedJobs.push(job)
  }

  let succeeded = 0
  let failed = 0

  for (const job of claimedJobs ?? []) {
    try {
      const { data: target, error: targetErr } = await supabase
        .from("refresh_targets")
        .select("id,adapter_slug,location_params,tier")
        .eq("id", job.target_id)
        .maybeSingle()

      if (targetErr) throw targetErr
      if (!target) throw new Error(`Missing refresh target ${job.target_id}`)

      const adapterSlug = target.adapter_slug as AdapterId
      const params = target.location_params as IngestionParams

      const { results } = await runIngestionPipeline({
        sourceIds: [adapterSlug],
        params,
        dryRun: false,
        supabase,
        forceRefresh: true,
      })

      const jobSuccess = (results ?? []).every((r) => r.cacheStatus !== "locked")
      if (!jobSuccess) throw new Error("Ingestion ran but produced no output (or was locked).")

      await supabase
        .from("refresh_jobs")
        .update({
          status: "success",
          finished_at: new Date().toISOString(),
          last_error_message: null,
        })
        .eq("id", job.id)

      succeeded += 1

      const intervalMs = INTERVAL_MS_BY_TIER[target.tier as keyof typeof INTERVAL_MS_BY_TIER] ?? INTERVAL_MS_BY_TIER.moderate
      await supabase
        .from("refresh_targets")
        .update({
          last_attempted_at: nowIso,
          last_succeeded_at: nowIso,
          next_refresh_at: new Date(Date.now() + intervalMs).toISOString(),
        })
        .eq("id", target.id)
    } catch (e: any) {
      failed += 1
      const errMsg = e?.message ?? "Unknown refresh error"

      await supabase
        .from("refresh_jobs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          last_error_message: errMsg,
        })
        .eq("id", job.id)
    }
  }

  return NextResponse.json({
    processed: (claimedJobs ?? []).length,
    succeeded,
    failed,
  })
}

