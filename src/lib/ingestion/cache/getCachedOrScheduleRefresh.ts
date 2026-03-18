export async function getCachedOrScheduleRefresh({
  supabase,
  dataSourceId,
  cacheKey,
  locationKey,
}: {
  supabase: any
  dataSourceId: string
  cacheKey: string
  locationKey: string
}): Promise<{
  cacheHit: boolean
  cachedRawIngestionId: string | null
  cachedPayloadHash: string | null
  cachedExpiresAt: string | null
}> {
  const { data, error } = await supabase
    .from("raw_ingestions")
    .select("id,payload_hash,expires_at")
    .eq("source_id", dataSourceId)
    .eq("cache_key", cacheKey)
    .eq("location_key", locationKey)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  const expiresAtMs = data?.expires_at ? new Date(data.expires_at).getTime() : NaN
  const nowMs = Date.now()

  if (!data || !data.expires_at || !Number.isFinite(expiresAtMs)) {
    return {
      cacheHit: false,
      cachedRawIngestionId: data?.id ?? null,
      cachedPayloadHash: data?.payload_hash ?? null,
      cachedExpiresAt: data?.expires_at ?? null,
    }
  }

  const cacheHit = nowMs < expiresAtMs

  return {
    cacheHit,
    cachedRawIngestionId: data.id as string,
    cachedPayloadHash: data.payload_hash as string,
    cachedExpiresAt: data.expires_at as string,
  }
}

