-- Kroger provider mappings
-- - stores.kroger_location_id to associate our internal store row with a Kroger location
-- - kroger_item_terms to associate our internal item_id with a Kroger search term for that item

-- Associate our internal store rows with Kroger store locations.
alter table public.stores
  add column if not exists kroger_location_id text;

-- Make it unique when present so we can upsert by provider ID.
create unique index if not exists idx_stores_kroger_location_id_unique
  on public.stores (kroger_location_id)
  where kroger_location_id is not null;

-- Map internal items to Kroger product search terms.
create table if not exists public.kroger_item_terms (
  item_id uuid primary key references public.items(id) on delete cascade,
  term text not null,
  provider_item_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_kroger_item_terms_set_updated_at on public.kroger_item_terms;
create trigger trg_kroger_item_terms_set_updated_at
before update on public.kroger_item_terms
for each row execute function public.set_updated_at();

create index if not exists idx_kroger_item_terms_term on public.kroger_item_terms (term);

-- RLS (mappings are safe to read publicly; writes are typically done by server-side code)
alter table public.kroger_item_terms enable row level security;

drop policy if exists kroger_item_terms_select_anon on public.kroger_item_terms;
create policy kroger_item_terms_select_anon
on public.kroger_item_terms for select
to anon
using (true);

drop policy if exists kroger_item_terms_select_authenticated on public.kroger_item_terms;
create policy kroger_item_terms_select_authenticated
on public.kroger_item_terms for select
to authenticated
using (true);

-- Allow authenticated writes (still safe because service role will bypass RLS during ingestion).
drop policy if exists kroger_item_terms_write_authenticated on public.kroger_item_terms;
create policy kroger_item_terms_write_authenticated
on public.kroger_item_terms for insert
to authenticated
with check (true);

drop policy if exists kroger_item_terms_update_authenticated on public.kroger_item_terms;
create policy kroger_item_terms_update_authenticated
on public.kroger_item_terms for update
to authenticated
using (true)
with check (true);

