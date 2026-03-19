import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase"
import type { OptimizationMode } from "@/lib/lists/optimizeList"

const OPT_MODES: OptimizationMode[] = ["lowest_total", "closest", "least_driving", "best_single_store", "best_combo"]

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any
    const name = String(body?.name ?? "").trim()
    const listType = String(body?.listType ?? body?.list_type ?? "").trim()
    const optimizationMode = String(body?.optimizationMode ?? body?.optimization_mode ?? "lowest_total").trim() as OptimizationMode
    const productIds = Array.isArray(body?.productIds) ? (body.productIds as string[]) : []

    if (!name) return NextResponse.json({ error: "Missing `name`" }, { status: 400 })
    if (!listType) return NextResponse.json({ error: "Missing `listType`" }, { status: 400 })
    if (!OPT_MODES.includes(optimizationMode)) {
      return NextResponse.json({ error: "Invalid `optimizationMode`" }, { status: 400 })
    }
    if (productIds.length === 0) return NextResponse.json({ error: "Missing `productIds`" }, { status: 400 })

    const supabase = createSupabaseServerClient()
    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr) throw userErr

    const userId = userData?.user?.id
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const distinctProductIds = Array.from(new Set(productIds)).slice(0, 50)

    const { data: listRow, error: listErr } = await supabase
      .from("user_lists")
      .insert({
        user_id: userId,
        name,
        list_type: listType,
        optimization_mode: optimizationMode,
      })
      .select("id")
      .maybeSingle()

    if (listErr) throw listErr
    const listId = listRow?.id as string | undefined
    if (!listId) return NextResponse.json({ error: "Failed to create list" }, { status: 500 })

    const itemRows = distinctProductIds.map((pid) => ({
      user_list_id: listId,
      product_id: pid,
    }))

    const { error: itemsErr } = await supabase.from("user_list_items").insert(itemRows)
    if (itemsErr) throw itemsErr

    return NextResponse.json({ listId })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 })
  }
}

