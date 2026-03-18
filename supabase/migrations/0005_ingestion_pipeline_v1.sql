-- Ingestion/normalization/snapshot pipeline (v1)
-- Designed to keep Vercel reads cheap by precomputing app-critical snapshots.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Pipeline config
-- ---------------------------------------------------------------------------

create table if not exists public.data_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  enabled boolean not null default true,
  priority int not null default 0,
  default_ttl_seconds int not null default 3600,
  category_scopes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_data_sources_set_updated_at on public.data_sources;
create trigger trg_data_sources_set_updated_at
before update on public.data_sources
for each row execute function public.set_updated_at();

alter table public.data_sources enable row level security;

-- ---------------------------------------------------------------------------
-- Raw ingestion storage (deduped by payload hash)
-- ---------------------------------------------------------------------------

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.data_sources(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  error_message text,
  run_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_ingestion_runs_set_updated_at on public.ingestion_runs;
create trigger trg_ingestion_runs_set_updated_at
before update on public.ingestion_runs
for each row execute function public.set_updated_at();

alter table public.ingestion_runs enable row level security;

create table if not exists public.raw_ingestions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.data_sources(id) on delete cascade,
  ingestion_run_id uuid references public.ingestion_runs(id) on delete set null,
  cache_key text not null,
  location_key text not null default '',
  payload_hash text not null,
  raw_payload jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'success',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raw_ingestions_dedupe_unique unique (source_id, cache_key, location_key, payload_hash)
);

drop trigger if exists trg_raw_ingestions_set_updated_at on public.raw_ingestions;
create trigger trg_raw_ingestions_set_updated_at
before update on public.raw_ingestions
for each row execute function public.set_updated_at();

alter table public.raw_ingestions enable row level security;

create index if not exists idx_raw_ingestions_source_cache_loc
  on public.raw_ingestions (source_id, cache_key, location_key);

create index if not exists idx_raw_ingestions_expires_at
  on public.raw_ingestions (expires_at);

create index if not exists idx_raw_ingestions_payload_hash
  on public.raw_ingestions (payload_hash);

-- ---------------------------------------------------------------------------
-- Fetch locks to prevent duplicate concurrent ingestions
-- ---------------------------------------------------------------------------

create table if not exists public.source_fetch_locks (
  source_id uuid not null references public.data_sources(id) on delete cascade,
  cache_key text not null,
  location_key text not null default '',
  lock_token text not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (source_id, cache_key, location_key)
);

alter table public.source_fetch_locks enable row level security;

-- ---------------------------------------------------------------------------
-- AI/normalization cache (idempotent normalization)
-- ---------------------------------------------------------------------------

create table if not exists public.normalization_cache (
  id uuid primary key default gen_random_uuid(),
  input_text text not null,
  input_hash text not null unique,
  normalized_output jsonb not null,
  method text not null default 'rule',
  confidence numeric(4,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_normalization_cache_set_updated_at on public.normalization_cache;
create trigger trg_normalization_cache_set_updated_at
before update on public.normalization_cache
for each row execute function public.set_updated_at();

alter table public.normalization_cache enable row level security;

create index if not exists idx_normalization_cache_method_conf
  on public.normalization_cache (method, confidence desc nulls last);

-- ---------------------------------------------------------------------------
-- Normalized sourced price events (post-matching)
-- ---------------------------------------------------------------------------

create table if not exists public.sourced_price_events (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.data_sources(id) on delete cascade,
  ingestion_run_id uuid references public.ingestion_runs(id) on delete set null,
  raw_ingestion_id uuid references public.raw_ingestions(id) on delete set null,
  store_id uuid not null references public.stores(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  price numeric(10,2) not null check (price >= 0),
  observed_at timestamptz not null,
  fuel_type text,
  confidence_score numeric(4,3),
  freshness_score numeric(4,3),
  verification_type text not null default 'sourced',
  observed_lat numeric(9,6),
  observed_lng numeric(9,6),
  payload_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_sourced_price_events_set_updated_at on public.sourced_price_events;
create trigger trg_sourced_price_events_set_updated_at
before update on public.sourced_price_events
for each row execute function public.set_updated_at();

alter table public.sourced_price_events enable row level security;

create index if not exists idx_sourced_price_events_store_item_observed
  on public.sourced_price_events (store_id, item_id, observed_at desc);

create index if not exists idx_sourced_price_events_source_observed
  on public.sourced_price_events (source_id, observed_at desc);

create index if not exists idx_sourced_price_events_payload_hash
  on public.sourced_price_events (payload_hash);

create index if not exists idx_sourced_price_events_observed_lat
  on public.sourced_price_events (observed_lat);

create index if not exists idx_sourced_price_events_observed_lng
  on public.sourced_price_events (observed_lng);

-- ---------------------------------------------------------------------------
-- Read-optimized snapshots for the UI
-- ---------------------------------------------------------------------------

-- Latest (one current price per entity; useful for "current cheapest" reads)
create table if not exists public.latest_price_snapshot (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  fuel_type text,
  -- Denormalized for speed (avoid joins in high-traffic reads)
  store_name text not null,
  item_name text not null,
  store_category public.store_category not null,
  item_category public.price_item_category not null,

  price numeric(10,2) not null,
  observed_at timestamptz not null,
  source_id uuid references public.data_sources(id) on delete set null,
  verification_type text not null default 'sourced',
  confidence_score numeric(4,3),
  freshness_score numeric(4,3),

  updated_at timestamptz not null default now(),

  constraint latest_price_snapshot_unique unique (store_id, item_id, fuel_type)
);

drop trigger if exists trg_latest_price_snapshot_set_updated_at on public.latest_price_snapshot;
create trigger trg_latest_price_snapshot_set_updated_at
before update on public.latest_price_snapshot
for each row execute function public.set_updated_at();

alter table public.latest_price_snapshot enable row level security;

create index if not exists idx_latest_price_snapshot_store_item
  on public.latest_price_snapshot (store_id, item_id);

create index if not exists idx_latest_price_snapshot_updated_at
  on public.latest_price_snapshot (updated_at desc);

-- Best recent (windowed "hot wins" precompute)
create table if not exists public.store_best_recent_price_snapshot (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  fuel_type text,
  window_seconds int not null,

  -- Denormalized for speed
  store_name text not null,
  item_name text not null,
  store_category public.store_category not null,
  item_category public.price_item_category not null,

  best_price numeric(10,2) not null,
  best_observed_at timestamptz not null,

  source_id uuid references public.data_sources(id) on delete set null,
  verification_type text not null default 'sourced',
  confidence_score numeric(4,3),
  freshness_score numeric(4,3),

  is_stale boolean not null default false,
  updated_at timestamptz not null default now(),

  constraint store_best_recent_price_snapshot_unique
    unique (store_id, item_id, fuel_type, window_seconds),

  constraint store_best_recent_price_snapshot_window_check
    check (window_seconds in (21600, 86400, 604800, 2592000))
);

drop trigger if exists trg_store_best_recent_price_snapshot_set_updated_at on public.store_best_recent_price_snapshot;
create trigger trg_store_best_recent_price_snapshot_set_updated_at
before update on public.store_best_recent_price_snapshot
for each row execute function public.set_updated_at();

alter table public.store_best_recent_price_snapshot enable row level security;

create index if not exists idx_store_best_recent_price_snapshot_store_window
  on public.store_best_recent_price_snapshot (store_id, window_seconds);

create index if not exists idx_store_best_recent_price_snapshot_item_window
  on public.store_best_recent_price_snapshot (item_id, window_seconds);

create index if not exists idx_store_best_recent_price_snapshot_best_observed_at_desc
  on public.store_best_recent_price_snapshot (best_observed_at desc);

create index if not exists idx_store_best_recent_price_snapshot_is_stale
  on public.store_best_recent_price_snapshot (is_stale, updated_at desc);

-- ---------------------------------------------------------------------------
-- RLS policies for read-optimized snapshots (public UI reads)
-- ---------------------------------------------------------------------------

drop policy if exists latest_price_snapshot_select_anon on public.latest_price_snapshot;
create policy latest_price_snapshot_select_anon
on public.latest_price_snapshot for select
to anon using (true);

drop policy if exists latest_price_snapshot_select_authenticated on public.latest_price_snapshot;
create policy latest_price_snapshot_select_authenticated
on public.latest_price_snapshot for select
to authenticated using (true);

drop policy if exists store_best_recent_price_snapshot_select_anon on public.store_best_recent_price_snapshot;
create policy store_best_recent_price_snapshot_select_anon
on public.store_best_recent_price_snapshot for select
to anon using (true);

drop policy if exists store_best_recent_price_snapshot_select_authenticated on public.store_best_recent_price_snapshot;
create policy store_best_recent_price_snapshot_select_authenticated
on public.store_best_recent_price_snapshot for select
to authenticated using (true);

-- Note: ingestion/cache/raw tables intentionally have no client write policies;
-- ingestion pipeline will run using server-side service role credentials.

