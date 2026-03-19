-- Refresh dispatcher/worker queue for hybrid refresh (quality/cost).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Refresh targets (what to refresh, at what cadence)
-- ---------------------------------------------------------------------------

create table if not exists public.refresh_targets (
  id uuid primary key default gen_random_uuid(),

  -- Adapter to run (e.g. 'grocery', 'gas')
  adapter_slug text not null,

  -- Cache/bucket key so we refresh the same provider location scope consistently.
  location_key text not null,

  -- Adapter-specific params (must be JSON serializable; includes location scope).
  location_params jsonb not null default '{}'::jsonb,

  tier text not null default 'moderate'
    check (tier in ('aggressive', 'moderate', 'lazy')),

  priority_score numeric(6,3) not null default 0,

  next_refresh_at timestamptz not null default now(),
  last_attempted_at timestamptz,
  last_succeeded_at timestamptz,
  last_error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint refresh_targets_adapter_location_key_unique
    unique (adapter_slug, location_key)
);

drop trigger if exists trg_refresh_targets_set_updated_at on public.refresh_targets;
create trigger trg_refresh_targets_set_updated_at
before update on public.refresh_targets
for each row execute function public.set_updated_at();

create index if not exists idx_refresh_targets_next_refresh_at
  on public.refresh_targets (next_refresh_at asc);

create index if not exists idx_refresh_targets_adapter_next
  on public.refresh_targets (adapter_slug, next_refresh_at asc);

-- ---------------------------------------------------------------------------
-- Refresh jobs (queued work)
-- ---------------------------------------------------------------------------

create table if not exists public.refresh_jobs (
  id uuid primary key default gen_random_uuid(),

  target_id uuid not null references public.refresh_targets(id) on delete cascade,

  status text not null default 'queued'
    check (status in ('queued', 'running', 'success', 'failed')),

  priority_score numeric(6,3) not null default 0,

  -- When the job becomes eligible to run
  run_at timestamptz not null default now(),

  -- Simple attempt tracking + retry cap
  attempts int not null default 0,
  max_attempts int not null default 5,

  locked_by text,
  locked_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,

  last_error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint refresh_jobs_target_run_unique unique (target_id, run_at)
);

drop trigger if exists trg_refresh_jobs_set_updated_at on public.refresh_jobs;
create trigger trg_refresh_jobs_set_updated_at
before update on public.refresh_jobs
for each row execute function public.set_updated_at();

create index if not exists idx_refresh_jobs_status_run_priority
  on public.refresh_jobs (status, run_at asc, priority_score desc);

create index if not exists idx_refresh_jobs_target_status
  on public.refresh_jobs (target_id, status);

-- ---------------------------------------------------------------------------
-- RLS (queue tables are internal)
-- ---------------------------------------------------------------------------

alter table public.refresh_targets enable row level security;
alter table public.refresh_jobs enable row level security;

-- No public policies: access is via service-role only in workers/dispatchers.

