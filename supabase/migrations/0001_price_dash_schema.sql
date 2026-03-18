-- PriceDash schema (stores/items/price reports/reviews/profiles)
-- Includes RLS + seed data + Supabase Realtime publication wiring.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'store_category') then
    create type public.store_category as enum ('gas_station', 'convenience', 'liquor', 'grocery');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'price_item_category') then
    create type public.price_item_category as enum ('gas', 'cigarettes', 'liquor', 'groceries');
  end if;
end $$;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,
  address text,
  category public.store_category not null,
  created_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category public.price_item_category not null,
  variants text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.price_reports (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  price numeric(10,2) not null check (price >= 0),
  reported_at timestamptz not null default now(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  photo_url text not null,
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  price_report_id uuid not null references public.price_reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating >= 1 and rating <= 5),
  comment text,
  helpful_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  points int not null default 0,
  badges jsonb not null default '[]'::jsonb,
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

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Create/update profile rows automatically for new users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, points, badges)
  values (new.id, 0, '[]'::jsonb)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Indexes for fast map/search
create index if not exists idx_price_reports_item_id on public.price_reports (item_id);
create index if not exists idx_price_reports_store_id on public.price_reports (store_id);
create index if not exists idx_price_reports_reported_at on public.price_reports (reported_at desc);
create index if not exists idx_reviews_price_report_id on public.reviews (price_report_id);

-- RLS
alter table public.stores enable row level security;
alter table public.items enable row level security;
alter table public.price_reports enable row level security;
alter table public.reviews enable row level security;
alter table public.profiles enable row level security;

-- Public read for stores/items (needed for map browsing)
drop policy if exists stores_select_anon on public.stores;
create policy stores_select_anon
on public.stores for select
to anon
using (true);

drop policy if exists stores_select_authenticated on public.stores;
create policy stores_select_authenticated
on public.stores for select
to authenticated
using (true);

drop policy if exists items_select_anon on public.items;
create policy items_select_anon
on public.items for select
to anon
using (true);

drop policy if exists items_select_authenticated on public.items;
create policy items_select_authenticated
on public.items for select
to authenticated
using (true);

-- Price reports: public read, authenticated insert; clients cannot verify/update directly.
drop policy if exists price_reports_select_anon on public.price_reports;
create policy price_reports_select_anon
on public.price_reports for select
to anon
using (true);

drop policy if exists price_reports_select_authenticated on public.price_reports;
create policy price_reports_select_authenticated
on public.price_reports for select
to authenticated
using (true);

drop policy if exists price_reports_insert_authenticated on public.price_reports;
create policy price_reports_insert_authenticated
on public.price_reports for insert
to authenticated
with check (reporter_id = auth.uid());

-- Reviews: public read, authenticated insert; helpful_count increments handled server-side.
drop policy if exists reviews_select_anon on public.reviews;
create policy reviews_select_anon
on public.reviews for select
to anon
using (true);

drop policy if exists reviews_select_authenticated on public.reviews;
create policy reviews_select_authenticated
on public.reviews for select
to authenticated
using (true);

drop policy if exists reviews_insert_authenticated on public.reviews;
create policy reviews_insert_authenticated
on public.reviews for insert
to authenticated
with check (user_id = auth.uid());

-- Profiles: users can read/insert their own profile; no client updates (points/badges updated server-side).
drop policy if exists profiles_select_authenticated_own on public.profiles;
create policy profiles_select_authenticated_own
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_insert_authenticated_own on public.profiles;
create policy profiles_insert_authenticated_own
on public.profiles for insert
to authenticated
with check (id = auth.uid());

-- Ensure updated rows are fully available for realtime change payloads.
alter table public.price_reports replica identity full;
alter table public.reviews replica identity full;

-- Enable realtime using the supabase_realtime publication (table-level).
do $$
begin
  begin
    alter publication supabase_realtime add table public.price_reports;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.reviews;
  exception when duplicate_object then
    null;
  end;
end $$;

-- Seed Items (10)
insert into public.items (id, name, category, variants)
values
  ('00000000-0000-0000-0000-000000000001', 'Regular Unleaded', 'gas', array['Regular']),
  ('00000000-0000-0000-0000-000000000002', 'Premium Unleaded', 'gas', array['Premium']),
  ('00000000-0000-0000-0000-000000000003', 'Marlboro Reds (100s)', 'cigarettes', array['Marlboro Reds', 'Marlboro Red 100s']),
  ('00000000-0000-0000-0000-000000000004', 'Newport 100s', 'cigarettes', array['Newport 100s']),
  ('00000000-0000-0000-0000-000000000005', 'Tito''s Vodka (750ml)', 'liquor', array['Tito''s Vodka 750ml']),
  ('00000000-0000-0000-0000-000000000006', 'Smirnoff Vodka (750ml)', 'liquor', array['Smirnoff Vodka 750ml']),
  ('00000000-0000-0000-0000-000000000007', 'Jack Daniel''s Old No. 7 (750ml)', 'liquor', array['Jack Daniel''s Old No. 7 750ml']),
  ('00000000-0000-0000-0000-000000000008', '2% Milk (Gallon)', 'groceries', array['2% Milk 1 Gallon']),
  ('00000000-0000-0000-0000-000000000009', 'Eggs (Dozen)', 'groceries', array['Eggs Dozen']),
  ('00000000-0000-0000-0000-000000000010', 'Greek Yogurt (32oz)', 'groceries', array['Greek Yogurt 32oz'])
on conflict do nothing;

-- Seed Stores (8) around Port Huron, MI area (roughly accurate lat/lng)
insert into public.stores (id, name, lat, lng, address, category)
values
  ('00000000-0000-0000-0000-000000000101', 'North End Fuel & Go', 42.996200, -82.423900, '1300 Military St, Port Huron, MI', 'gas_station'),
  ('00000000-0000-0000-0000-000000000102', 'Harbor Convenience Market', 42.975800, -82.420600, '200 Griswold St, Port Huron, MI', 'convenience'),
  ('00000000-0000-0000-0000-000000000103', 'Blue Water Liquor Shop', 42.965700, -82.421200, '1800 6th St, Port Huron, MI', 'liquor'),
  ('00000000-0000-0000-0000-000000000104', 'St. Clair Grocery Outlet', 42.972900, -82.454200, '4120 Pine Grove Ave, Port Huron, MI', 'grocery'),
  ('00000000-0000-0000-0000-000000000105', 'Riverfront Gas & Snacks', 42.983100, -82.441100, '650 Huron Ave, Port Huron, MI', 'gas_station'),
  ('00000000-0000-0000-0000-000000000106', 'Downtown Quick Mart', 42.981400, -82.414900, '905 Water St, Port Huron, MI', 'convenience'),
  ('00000000-0000-0000-0000-000000000107', 'Port Huron Liquor & Wine', 42.969600, -82.409800, '1212 Pine St, Port Huron, MI', 'liquor'),
  ('00000000-0000-0000-0000-000000000108', 'Market Square Groceries', 42.986800, -82.429000, '2200 12th St, Port Huron, MI', 'grocery')
on conflict do nothing;

