import type { NormalizedPriceCandidate } from "../sources/types"

const MVP_WINDOW_SECONDS = [21600, 86400, 604800, 2592000] as const

function toFuelKey(fuelType?: string): string {
  // Snapshots unique keys include fuel_type. For non-gas categories we normalize to empty string
  // so uniqueness works reliably.
  return (fuelType ?? "").trim()
}

export async function upsertLatestPriceSnapshotsFromCandidates({
  supabase,
  candidates,
}: {
  supabase: any
  candidates: NormalizedPriceCandidate[]
}): Promise<number> {
  const withIds = candidates.filter((c) => c.storeId && c.itemId)
  if (withIds.length === 0) return 0

  const keys = withIds.map((c) => ({
    storeId: c.storeId as string,
    itemId: c.itemId as string,
    fuelType: toFuelKey(c.fuelType),
  }))

  const uniqueStoreIds = Array.from(new Set(keys.map((k) => k.storeId)))
  const uniqueItemIds = Array.from(new Set(keys.map((k) => k.itemId)))

  const { data: storeRows } = await supabase
    .from("stores")
    .select("id,name,category")
    .in("id", uniqueStoreIds)

  const { data: itemRows } = await supabase
    .from("items")
    .select("id,name,category")
    .in("id", uniqueItemIds)

  const storeById = new Map<string, (typeof storeRows)[number]>()
  for (const s of (storeRows ?? []) as any[]) storeById.set(s.id, s)

  const itemById = new Map<string, (typeof itemRows)[number]>()
  for (const it of (itemRows ?? []) as any[]) itemById.set(it.id, it)

  const upsertRows = withIds
    .map((c) => {
      const storeId = c.storeId as string
      const itemId = c.itemId as string
      const store = storeById.get(storeId)
      const item = itemById.get(itemId)
      if (!store || !item) return null

      return {
        store_id: storeId,
        item_id: itemId,
        fuel_type: toFuelKey(c.fuelType),
        store_name: store.name,
        item_name: item.name,
        store_category: store.category,
        item_category: item.category,

        price: c.price,
        observed_at: c.observedAt,
        source_id: null,
        verification_type: c.verificationType ?? "sourced",
        confidence_score: c.confidenceScore ?? null,
        freshness_score: c.freshnessScore ?? null,
      }
    })
    .filter(Boolean) as any[]

  if (upsertRows.length === 0) return 0

  // Upsert without conditional update: for correctness the “latest” row will converge
  // because ingestion should only call this when payload changes.
  const { error } = await supabase
    .from("latest_price_snapshot")
    .upsert(upsertRows, { onConflict: "store_id,item_id,fuel_type" })

  if (error) throw error
  return upsertRows.length
}

export async function recomputeBestRecentSnapshotsFromSourcedEvents({
  supabase,
  candidates,
  windowsSeconds = MVP_WINDOW_SECONDS as readonly number[],
}: {
  supabase: any
  candidates: NormalizedPriceCandidate[]
  windowsSeconds?: readonly number[]
}): Promise<number> {
  const withIds = candidates.filter((c) => c.storeId && c.itemId)
  if (withIds.length === 0) return 0

  const keys = Array.from(
    new Map(
      withIds.map((c) => {
        const key = `${c.storeId}:${c.itemId}:${toFuelKey(c.fuelType)}`
        return [
          key,
          { storeId: c.storeId as string, itemId: c.itemId as string, fuelType: toFuelKey(c.fuelType) },
        ]
      }),
    ).values(),
  )

  // Fetch store/item display fields for upserts.
  const storeIds = Array.from(new Set(keys.map((k) => k.storeId)))
  const itemIds = Array.from(new Set(keys.map((k) => k.itemId)))

  const { data: storeRows } = await supabase
    .from("stores")
    .select("id,name,category")
    .in("id", storeIds)
  const { data: itemRows } = await supabase
    .from("items")
    .select("id,name,category")
    .in("id", itemIds)

  const storeById = new Map<string, (typeof storeRows)[number]>()
  for (const s of (storeRows ?? []) as any[]) storeById.set(s.id, s)

  const itemById = new Map<string, (typeof itemRows)[number]>()
  for (const it of (itemRows ?? []) as any[]) itemById.set(it.id, it)

  const maxWindowSeconds = Math.max(...windowsSeconds)
  const sinceIso = new Date(Date.now() - maxWindowSeconds * 1000).toISOString()

  // Pull recent history for affected keys; compute best price per window in code.
  const { data: events } = await supabase
    .from("sourced_price_events")
    .select("store_id,item_id,fuel_type,price,observed_at")
    .in("store_id", storeIds)
    .in("item_id", itemIds)
    .gte("observed_at", sinceIso)

  const eventRows = (events ?? []) as Array<{
    store_id: string
    item_id: string
    fuel_type: string | null
    price: number
    observed_at: string
  }>

  type Best = { bestPrice: number; bestObservedAt: string }
  const bestByKeyWindow = new Map<string, Best>()

  const windowSecondsArr = Array.from(windowsSeconds)

  for (const ev of eventRows) {
    const fuelType = toFuelKey(ev.fuel_type ?? undefined)
    for (const w of windowSecondsArr) {
      const windowStartMs = Date.now() - w * 1000
      const observedMs = new Date(ev.observed_at).getTime()
      if (!Number.isFinite(observedMs) || observedMs < windowStartMs) continue

      const k = `${ev.store_id}:${ev.item_id}:${fuelType}:${w}`
      const existing = bestByKeyWindow.get(k)
      if (!existing) {
        bestByKeyWindow.set(k, { bestPrice: ev.price, bestObservedAt: ev.observed_at })
        continue
      }

      if (ev.price < existing.bestPrice) {
        bestByKeyWindow.set(k, { bestPrice: ev.price, bestObservedAt: ev.observed_at })
        continue
      }
      // Tie-break: prefer newer observation.
      if (ev.price === existing.bestPrice && ev.observed_at > existing.bestObservedAt) {
        bestByKeyWindow.set(k, { bestPrice: ev.price, bestObservedAt: ev.observed_at })
      }
    }
  }

  // Staleness handling:
  // - if we have an existing snapshot row for a key/window but no new "best" for that window,
  //   re-upsert the existing best value and mark `is_stale=true`.
  // - if we do find a best within the window, mark `is_stale=false`.
  const existingSnapshotRows = await (async () => {
    const fuelTypes = Array.from(new Set(keys.map((k) => k.fuelType)))
    if (fuelTypes.length === 0) return []

    const { data: existing } = await supabase
      .from("store_best_recent_price_snapshot")
      .select("store_id,item_id,fuel_type,window_seconds,best_price,best_observed_at,is_stale")
      .in("store_id", storeIds)
      .in("item_id", itemIds)
      .in("fuel_type", fuelTypes)
      .in("window_seconds", windowSecondsArr)

    return (existing ?? []) as Array<{
      store_id: string
      item_id: string
      fuel_type: string | null
      window_seconds: number
      best_price: number
      best_observed_at: string
      is_stale: boolean
    }>
  })()

  const existingByKeyWindow = new Map<string, (typeof existingSnapshotRows)[number]>()
  for (const row of existingSnapshotRows) {
    const fuelType = toFuelKey(row.fuel_type ?? undefined)
    existingByKeyWindow.set(
      `${row.store_id}:${row.item_id}:${fuelType}:${row.window_seconds}`,
      row,
    )
  }

  const upsertRows: any[] = []
  for (const key of keys) {
    for (const w of windowSecondsArr) {
      const k = `${key.storeId}:${key.itemId}:${key.fuelType}:${w}`

      const best = bestByKeyWindow.get(k)
      const store = storeById.get(key.storeId)
      const item = itemById.get(key.itemId)
      if (!store || !item) continue

      if (best) {
        upsertRows.push({
          store_id: key.storeId,
          item_id: key.itemId,
          fuel_type: key.fuelType,
          window_seconds: w,

          store_name: store.name,
          item_name: item.name,
          store_category: store.category,
          item_category: item.category,

          best_price: best.bestPrice,
          best_observed_at: best.bestObservedAt,
          source_id: null,
          verification_type: "sourced",
          confidence_score: null,
          freshness_score: null,

          is_stale: false,
        })
        continue
      }

      const existing = existingByKeyWindow.get(k)
      if (!existing) continue

      const existingAgeMs = Date.now() - new Date(existing.best_observed_at).getTime()
      const isStale = !Number.isFinite(existingAgeMs) ? true : existingAgeMs > w * 1000

      upsertRows.push({
        store_id: key.storeId,
        item_id: key.itemId,
        // Preserve stored fuel_type if it was null (future-proofing).
        fuel_type: existing.fuel_type ?? key.fuelType,
        window_seconds: w,

        store_name: store.name,
        item_name: item.name,
        store_category: store.category,
        item_category: item.category,

        best_price: existing.best_price,
        best_observed_at: existing.best_observed_at,
        source_id: null,
        verification_type: "sourced",
        confidence_score: null,
        freshness_score: null,

        is_stale: isStale,
      })
    }
  }

  if (upsertRows.length === 0) return 0

  const { error } = await supabase
    .from("store_best_recent_price_snapshot")
    .upsert(upsertRows, { onConflict: "store_id,item_id,fuel_type,window_seconds" })
  if (error) throw error

  return upsertRows.length
}

