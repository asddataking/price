/**
 * Helpers for creating/ensuring `public.data_sources` rows.
 * These are used so adapters can safely reference `source_id` FK values.
 */
export async function ensureDataSourceId({
  supabase,
  slug,
  enabled,
  priority,
  defaultTtlSeconds,
  categoryScopes,
}: {
  supabase: any
  slug: string
  enabled: boolean
  priority: number
  defaultTtlSeconds: number
  categoryScopes: string[]
}): Promise<{ dataSourceId: string }> {
  const { data, error } = await supabase
    .from("data_sources")
    .upsert(
      {
        slug,
        enabled,
        priority,
        default_ttl_seconds: defaultTtlSeconds,
        category_scopes: categoryScopes,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .maybeSingle()

  if (error) throw error
  if (!data?.id) throw new Error("Failed to resolve data_sources.id")

  return { dataSourceId: data.id as string }
}

