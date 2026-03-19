import { NextResponse } from "next/server"

import { createSupabaseServiceClient } from "@/lib/supabaseService"

// Hybrid refresh dispatcher:
// - finds stale `retail_location_products`
// - converts them into adapter+location buckets
// - upserts `refresh_targets`
// - enqueues `refresh_jobs`

const GROCERY_ADAPTER_SLUG = "grocery"
const GROCERY_RADIUS_METERS = 15_000
const LAT_LNG_DECIMALS = 3

const MAX_STALE_ROWS = 400
const MAX_TARGETS_PER_DISPATCH = 12
const MAX_JOBS_PER_DISPATCH = 12

const TIER_FROM_AGE = (ageMs: number) => {
  const oneDay = 24 * 60 * 60 * 1000
  const sevenDays = 7 * oneDay
  if (ageMs >= sevenDays) return "lazy" as const
  if (ageMs >= oneDay) return "moderate" as const
  return "aggressive" as const
}

const PRIORITY_FROM_TIER = (tier: "aggressive" | "moderate" | "lazy") => {
  if (tier === "aggressive") return 0.9
  if (tier === "moderate") return 0.5
  return 0.2
}

function makeGroceryLocationKey(lat: number, lng: number, radiusMeters: number) {
  const latB = Number(lat).toFixed(LAT_LNG_DECIMALS)
  const lngB = Number(lng).toFixed(LAT_LNG_DECIMALS)
  return `grocery:lat=${latB}&lng=${lngB}&r=${radiusMeters}`
}

function makeGroceryLocationParams(lat: number, lng: number, radiusMeters: number) {
  const latB = Number(lat).toFixed(LAT_LNG_DECIMALS)
  const lngB = Number(lng).toFixed(LAT_LNG_DECIMALS)
  return {
    location: { lat: Number(latB), lng: Number(lngB), radiusMeters },
  }
}

export async function POST(req: Request) {
  const expectedSecret = process.env.REFRESH_WORKER_SECRET
  if (expectedSecret) {
    const provided = req.headers.get("x-refresh-secret") ?? ""
    if (provided !== expectedSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createSupabaseServiceClient()
  const nowMs = Date.now()
  const runAtIso = new Date(Math.floor(nowMs / 60_000) * 60_000).toISOString()

  // Small read for stale candidates.
  const { data: staleRows, error: staleErr } = await supabase
    .from("retail_location_products")
    .select("retail_location_id,last_observed_at")
    .order("last_observed_at", { ascending: true })
    .limit(MAX_STALE_ROWS)

  if (staleErr) throw staleErr

  const locationIds = Array.from(
    new Set((staleRows ?? []).map((r) => r.retail_location_id).filter(Boolean)),
  ) as string[]

  if (locationIds.length === 0) {
    return NextResponse.json({ enqueued: 0, reason: "no_stale_locations" })
  }

  const { data: locations, error: locationsErr } = await supabase
    .from("retail_locations")
    .select("id,lat,lng")
    .in("id", locationIds)

  if (locationsErr) throw locationsErr

  const locById = new Map<string, { id: string; lat: number; lng: number }>()
  for (const l of locations ?? []) locById.set(l.id, l as any)

  type Bucket = {
    adapter_slug: string
    location_key: string
    location_params: any
    tier: "aggressive" | "moderate" | "lazy"
    priority_score: number
  }

  const bucketByKey = new Map<string, Bucket>()

  for (const row of staleRows ?? []) {
    const retailLocationId = row.retail_location_id as string
    const loc = locById.get(retailLocationId)
    if (!loc) continue

    const lastObservedAtMs = new Date(row.last_observed_at as any).getTime()
    if (!Number.isFinite(lastObservedAtMs)) continue

    const ageMs = nowMs - lastObservedAtMs
    const tier = TIER_FROM_AGE(ageMs)
    const priority_score = PRIORITY_FROM_TIER(tier)

    const location_key = makeGroceryLocationKey(loc.lat, loc.lng, GROCERY_RADIUS_METERS)
    const location_params = makeGroceryLocationParams(loc.lat, loc.lng, GROCERY_RADIUS_METERS)

    const existing = bucketByKey.get(location_key)
    if (!existing || priority_score > existing.priority_score) {
      bucketByKey.set(location_key, {
        adapter_slug: GROCERY_ADAPTER_SLUG,
        location_key,
        location_params,
        tier,
        priority_score,
      })
    }
  }

  const buckets = Array.from(bucketByKey.values())
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, MAX_TARGETS_PER_DISPATCH)

  if (buckets.length === 0) return NextResponse.json({ enqueued: 0, reason: "no_buckets" })

  const targetPayload = buckets.map((b) => ({
    adapter_slug: b.adapter_slug,
    location_key: b.location_key,
    location_params: b.location_params,
    tier: b.tier,
    priority_score: b.priority_score,
    next_refresh_at: runAtIso,
  }))

  await supabase.from("refresh_targets").upsert(targetPayload, {
    onConflict: "adapter_slug,location_key",
  })

  const locationKeys = buckets.map((b) => b.location_key)
  const { data: targetRows, error: targetErr } = await supabase
    .from("refresh_targets")
    .select("id,location_key")
    .eq("adapter_slug", GROCERY_ADAPTER_SLUG)
    .in("location_key", locationKeys)

  if (targetErr) throw targetErr

  const byLocKey = new Map<string, { priority_score: number }>()
  for (const b of buckets) byLocKey.set(b.location_key, { priority_score: b.priority_score })

  const jobsPayload = (targetRows ?? [])
    .map((t: any) => {
      const meta = byLocKey.get(t.location_key)
      return {
        target_id: t.id,
        status: "queued",
        priority_score: meta?.priority_score ?? 0,
        run_at: runAtIso,
      }
    })
    .slice(0, MAX_JOBS_PER_DISPATCH)

  if (jobsPayload.length === 0) return NextResponse.json({ enqueued: 0, reason: "no_jobs_payload" })

  await supabase.from("refresh_jobs").upsert(jobsPayload, {
    onConflict: "target_id,run_at",
  })

  return NextResponse.json({
    enqueued: jobsPayload.length,
    adapter: GROCERY_ADAPTER_SLUG,
    run_at: runAtIso,
  })
}

