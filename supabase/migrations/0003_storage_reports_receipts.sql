-- Storage bucket + RLS policies for mandatory photo proof receipts
-- plus points awarding for verified price reports.

insert into storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
values (
  'price-dash-receipts',
  'price-dash-receipts',
  true,
  false,
  5 * 1024 * 1024,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

-- RLS is expected to be enabled for storage.objects already.
-- Policies:
-- - public read (so we can use getPublicUrl)
-- - authenticated insert (only signed-in users can upload)
drop policy if exists public_read_price_dash_receipts on storage.objects;
drop policy if exists authenticated_insert_price_dash_receipts on storage.objects;

create policy public_read_price_dash_receipts
on storage.objects for select
to public
using (bucket_id = 'price-dash-receipts');

create policy authenticated_insert_price_dash_receipts
on storage.objects for insert
to authenticated
with check (bucket_id = 'price-dash-receipts');

-- +10 points when a report transitions to verified (photo proof + location check passed).
create or replace function public.award_points_on_verified_report_insert()
returns trigger
language plpgsql
as $$
begin
  if new.verified then
    update public.profiles
    set points = points + 10
    where id = new.reporter_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_award_points_on_verified_report_insert on public.price_reports;
create trigger trg_award_points_on_verified_report_insert
after insert on public.price_reports
for each row
when (new.verified = true)
execute function public.award_points_on_verified_report_insert();

create or replace function public.award_points_on_verified_report_update()
returns trigger
language plpgsql
as $$
begin
  if coalesce(old.verified, false) = false and new.verified = true then
    update public.profiles
    set points = points + 10
    where id = new.reporter_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_award_points_on_verified_report_update on public.price_reports;
create trigger trg_award_points_on_verified_report_update
after update of verified on public.price_reports
for each row
when (old.verified = false and new.verified = true)
execute function public.award_points_on_verified_report_update();

