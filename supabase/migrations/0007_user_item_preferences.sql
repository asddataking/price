-- User item intent preferences (time-of-day "picks")
-- Stores aggregated counts of items a user repeatedly searches/selects.

create table if not exists public.user_item_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  time_bucket text not null,
  count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id, time_bucket)
);

-- Helpful index for reads by user/time_bucket.
create index if not exists idx_user_item_preferences_user_bucket
  on public.user_item_preferences (user_id, time_bucket, count desc);

alter table public.user_item_preferences enable row level security;

-- Users can read their own rows.
drop policy if exists user_item_preferences_select_own on public.user_item_preferences;
create policy user_item_preferences_select_own
on public.user_item_preferences for select
to authenticated
using (user_id = auth.uid());

-- Users can insert their own rows.
drop policy if exists user_item_preferences_insert_own on public.user_item_preferences;
create policy user_item_preferences_insert_own
on public.user_item_preferences for insert
to authenticated
with check (user_id = auth.uid());

-- Users can update their own rows.
drop policy if exists user_item_preferences_update_own on public.user_item_preferences;
create policy user_item_preferences_update_own
on public.user_item_preferences for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Keep `updated_at` fresh on updates.
drop trigger if exists trg_user_item_preferences_set_updated_at on public.user_item_preferences;
create trigger trg_user_item_preferences_set_updated_at
before update on public.user_item_preferences
for each row
execute function public.set_updated_at();

