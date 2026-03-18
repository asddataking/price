import type { NormalizedPriceCandidate } from "../sources/types"

function toFuelKey(fuelType?: string): string {
  return (fuelType ?? "").trim()
}

export async function insertSourcedPriceEventsFromCandidates({
  supabase,
  dataSourceId,
  ingestionRunId,
  rawIngestionId,
  payloadHash,
  candidates,
}: {
  supabase: any
  dataSourceId: string
  ingestionRunId: string
  rawIngestionId: string | null
  payloadHash: string
  candidates: NormalizedPriceCandidate[]
}): Promise<number> {
  if (!rawIngestionId) throw new Error("rawIngestionId is required to upsert sourced_price_events.")

  const withIds = candidates.filter((c) => c.storeId && c.itemId)
  if (withIds.length === 0) return 0

  const rows = withIds.map((c) => {
    const observedLat =
      typeof c.store?.lat === "number" ? c.store?.lat : c.store?.lat ? Number(c.store.lat) : null
    const observedLng =
      typeof c.store?.lng === "number" ? c.store?.lng : c.store?.lng ? Number(c.store.lng) : null

    return {
      source_id: dataSourceId,
      ingestion_run_id: ingestionRunId,
      raw_ingestion_id: rawIngestionId,

      store_id: c.storeId as string,
      item_id: c.itemId as string,

      price: c.price,
      observed_at: c.observedAt,

      fuel_type: toFuelKey(c.fuelType),
      verification_type: c.verificationType ?? "sourced",
      confidence_score: c.confidenceScore ?? null,
      freshness_score: c.freshnessScore ?? null,

      observed_lat: Number.isFinite(observedLat) ? observedLat : null,
      observed_lng: Number.isFinite(observedLng) ? observedLng : null,

      payload_hash: payloadHash,
    }
  })

  const { error } = await supabase.from("sourced_price_events").upsert(rows, {
    onConflict: "raw_ingestion_id,store_id,item_id,fuel_type",
  })
  if (error) throw error

  return rows.length
}

