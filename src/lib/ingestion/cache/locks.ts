import crypto from "crypto"

export async function acquireSourceFetchLock({
  supabase,
  dataSourceId,
  cacheKey,
  locationKey,
  lockTtlSeconds = 120,
}: {
  supabase: any
  dataSourceId: string
  cacheKey: string
  locationKey: string
  lockTtlSeconds?: number
}): Promise<{ acquired: boolean; lockToken: string }> {
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  const lockToken = crypto.randomUUID()
  const expiresIso = new Date(nowMs + lockTtlSeconds * 1000).toISOString()

  // 1) Try to update an expired lock row.
  const { data: updated, error: updateError } = await supabase
    .from("source_fetch_locks")
    .update({
      lock_token: lockToken,
      acquired_at: nowIso,
      expires_at: expiresIso,
    })
    .eq("source_id", dataSourceId)
    .eq("cache_key", cacheKey)
    .eq("location_key", locationKey)
    .lt("expires_at", nowIso)
    .select("lock_token")
    .maybeSingle()

  if (updateError && updateError.code !== "PGRST116") throw updateError
  if (updated?.lock_token === lockToken) return { acquired: true, lockToken }

  // 2) No expired lock row updated; try to insert a new one.
  const { error: insertError } = await supabase
    .from("source_fetch_locks")
    .insert({
      source_id: dataSourceId,
      cache_key: cacheKey,
      location_key: locationKey,
      lock_token: lockToken,
      acquired_at: nowIso,
      expires_at: expiresIso,
    })

  // If insert conflicts with an existing unexpired lock, we treat it as not acquired.
  if (!insertError) return { acquired: true, lockToken }

  return { acquired: false, lockToken }
}

