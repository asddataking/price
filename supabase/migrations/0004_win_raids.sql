-- Win Raids tracking + verified default for MVP auto-inserts

-- Make `verified` default to true for any inserts that omit it.
alter table public.price_reports
alter column verified set default true;

create table if not exists public.win_raids (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  items_raided integer not null default 0,
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_win_raids_set_updated_at on public.win_raids;
create trigger trg_win_raids_set_updated_at
before update on public.win_raids
for each row execute function public.set_updated_at();

alter table public.win_raids enable row level security;

drop policy if exists win_raids_select_own on public.win_raids;
create policy win_raids_select_own
on public.win_raids for select
to authenticated
using (user_id = auth.uid());

drop policy if exists win_raids_insert_own on public.win_raids;
create policy win_raids_insert_own
on public.win_raids for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists win_raids_update_own on public.win_raids;
create policy win_raids_update_own
on public.win_raids for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create index if not exists idx_win_raids_user_id on public.win_raids (user_id desc);
create index if not exists idx_win_raids_store_id on public.win_raids (store_id desc);

