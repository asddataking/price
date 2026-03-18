-- Cache for Google Maps/Places/Geocoding responses
-- TTL-based to avoid excessive API calls.

create table if not exists public.google_cache (
  key text primary key,
  response_json jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_google_cache_expires_at on public.google_cache (expires_at);

create or replace function public.set_google_cache_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_google_cache_set_updated_at on public.google_cache;
create trigger trg_google_cache_set_updated_at
before update on public.google_cache
for each row execute function public.set_google_cache_updated_at();

-- Allow reads/writes from the anon role so Next route handlers can cache without
-- requiring a service-role key.
grant select, insert, update on public.google_cache to anon, authenticated;

