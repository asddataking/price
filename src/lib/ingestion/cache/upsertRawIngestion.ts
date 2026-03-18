export async function upsertRawIngestion({
  supabase,
  dataSourceId,
  ingestionRunId,
  cacheKey,
  locationKey,
  payloadHash,
  rawPayload,
  fetchedAtIso,
  expiresAtIso,
  status = "success",
  errorMessage,
}: {
  supabase: any
  dataSourceId: string
  ingestionRunId: string | null
  cacheKey: string
  locationKey: string
  payloadHash: string
  rawPayload: unknown
  fetchedAtIso: string
  expiresAtIso: string
  status?: string
  errorMessage?: string
}) {
  const insertRow = {
    source_id: dataSourceId,
    ingestion_run_id: ingestionRunId,
    cache_key: cacheKey,
    location_key: locationKey,
    payload_hash: payloadHash,
    raw_payload: rawPayload as any,
    fetched_at: fetchedAtIso,
    expires_at: expiresAtIso,
    status,
    error_message: errorMessage ?? null,
  }

  const { data, error } = await supabase
    .from("raw_ingestions")
    .upsert(insertRow, {
      onConflict: "source_id,cache_key,location_key,payload_hash",
    })
    .select("id")
    .maybeSingle()

  if (error) throw error
  return { rawIngestionId: (data?.id as string | undefined) ?? null }
}

