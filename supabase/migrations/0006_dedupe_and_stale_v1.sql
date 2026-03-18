-- Phase-1 hardening:
-- 1) Dedupe sourced_price_events so re-running ingestion doesn’t create duplicates.
-- 2) Support staleness semantics for store_best_recent_price_snapshot (handled in app code).

-- Dedupe: unique per raw ingestion + entity + fuel type (only when raw_ingestion_id is set).
create unique index if not exists idx_sourced_price_events_dedupe
  on public.sourced_price_events (raw_ingestion_id, store_id, item_id, fuel_type)
  where raw_ingestion_id is not null;

