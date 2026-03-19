import { NextResponse } from "next/server"

import { createSupabaseServiceClient } from "@/lib/supabaseService"
import { previewOptimizeList } from "@/lib/lists/optimizeList"
import type { OptimizationMode } from "@/lib/lists/optimizeList"

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any
    const productIds = Array.isArray(body?.productIds) ? (body.productIds as string[]) : []
    const optimizationMode = String(body?.optimizationMode ?? "lowest_total") as OptimizationMode

    const lat = Number(body?.lat)
    const lng = Number(body?.lng)
    const radiusMeters =
      body?.radiusMeters != null && Number.isFinite(Number(body.radiusMeters)) ? Number(body.radiusMeters) : 25_000

    if (productIds.length === 0) {
      return NextResponse.json({ error: "Missing `productIds`" }, { status: 400 })
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "Missing/invalid `lat` and `lng`" }, { status: 400 })
    }

    const supabase = createSupabaseServiceClient()

    const preview = await previewOptimizeList({
      supabase,
      productIds,
      userLat: lat,
      userLng: lng,
      radiusMeters,
      optimizationMode,
    })

    return NextResponse.json({ preview })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 })
  }
}

