-- ============================================================
-- 234 Cargo Logistics - Clear Test Operational Data
-- Run once in the Supabase SQL Editor when ready for live use.
--
-- This is irreversible. It preserves staff/admin Auth accounts, profiles,
-- settings, warehouse addresses, database structure, RLS policies, and the
-- goods-photos bucket.
-- It deletes all test clients, shipments, receipts, wallet activity, and
-- operational records. Uploaded goods photos must be cleared separately from
-- Supabase Storage because direct SQL deletes from storage.objects are blocked.
-- ============================================================

begin;

-- Sea and air warehouse addresses are stored in public.settings and are
-- intentionally left untouched by this reset.

-- Delete dependent operational records before the client records they use.
delete from public.scan_logs;
delete from public.receipts;
delete from public.wallet_transactions;
delete from public.wallet_accounts;
delete from public.client_sessions;
delete from public.messages;
delete from public.purchase_requests;
delete from public.goods;

-- Clear standalone operational records.
delete from public.containers;
delete from public.expenses;
delete from public.announcements;
delete from public.suppliers;

-- Client records are last because receipts and other records reference them.
delete from public.clients;

commit;

-- Expected after the reset: all values below should be 0.
select
  (select count(*) from public.clients) as clients,
  (select count(*) from public.goods) as goods,
  (select count(*) from public.receipts) as receipts,
  (select count(*) from public.wallet_transactions) as wallet_transactions,
  (select count(*) from public.purchase_requests) as purchase_requests,
  (select count(*) from public.messages) as messages;

-- Optional sanity check: these address settings should still be present.
select key, value
from public.settings
where key in (
  'china_sea_warehouse_name',
  'china_sea_warehouse_address',
  'china_sea_warehouse_phone',
  'china_air_warehouse_name',
  'china_air_warehouse_address',
  'china_air_warehouse_phone'
)
order by key;

-- Optional storage check: shows how much space old goods photos still occupy.
select
  'goods-photos' as bucket_id,
  count(*) as file_count,
  pg_size_pretty(coalesce(sum(nullif(metadata ->> 'size', '')::bigint), 0)) as total_size
from storage.objects
where bucket_id = 'goods-photos';
