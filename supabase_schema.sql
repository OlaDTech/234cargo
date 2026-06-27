-- ============================================================
-- 234Cargo Logistics — Supabase Database Schema
-- Run this entire file in your Supabase SQL Editor
-- ============================================================
--
-- ⚠️  SECURITY NOTE — READ BEFORE GOING LIVE  ⚠️
-- The client portal in this app does NOT use Supabase Auth — clients log
-- in with phone/shipping_mark + a password stored in the `clients` table,
-- checked client-side. To make that login flow work at all, several
-- tables below (clients, goods, receipts, announcements, suppliers,
-- messages) have a public-read RLS policy, since an unauthenticated
-- browser session has no auth.uid() to scope a normal policy to.
--
-- This means anyone with your anon key could query goods/receipts for
-- ANY client, not just their own — the app only *filters* by client_id
-- in the UI, it doesn't enforce it at the database layer.
--
-- Before production launch, do ONE of the following:
--   1. (Recommended) Move client login + all client-scoped reads behind
--      a Supabase Edge Function that checks the password hash and returns
--      a short-lived signed JWT (Supabase supports custom JWTs), so RLS
--      policies can use auth.uid() / a custom claim instead of `using (true)`.
--   2. At minimum, hash passwords with bcrypt (don't store plaintext as
--      password_hash currently does in the demo) and rate-limit login
--      attempts at the edge/proxy layer.
-- ============================================================

-- SECURITY UPDATE
-- The policies below now remove the old public client-table access. Deploy
-- client-login, client-wallet, and client-portal Edge Functions before running
-- this schema: each function checks an opaque client session server-side and
-- returns only that client's records. Passwords are stored with bcrypt via the
-- trigger below, with legacy plaintext values converted when this schema runs.

-- Enable UUID extension
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── SETTINGS ──────────────────────────────────────────────
create table if not exists settings (
  id uuid primary key default uuid_generate_v4(),
  key text unique not null,
  value text not null,
  updated_at timestamptz default now()
);

insert into settings (key, value) values
  ('company_name', '234Cargo Logistics'),
  ('china_warehouse_name', 'SinoShip Warehouse Guangzhou'),
  ('china_warehouse_address', '128 Tianhe Rd, Guangzhou, Guangdong 510620'),
  ('china_warehouse_phone', '+86 020-8888-6666'),
  ('sea_rate_cbm', '150000'),
  ('sea_rate_kg', '1200'),
  ('air_rate_kg', '18000')
on conflict (key) do nothing;

update settings set value = '150000' where key = 'sea_rate_cbm' and value = '150';
update settings set value = '1200' where key = 'sea_rate_kg' and value = '1.20';
update settings set value = '18000' where key = 'air_rate_kg' and value = '18.00';
update settings set value = '234Cargo Logistics' where key = 'company_name' and value in ('OceanAir Logistics', '234 Cargo Logistics');

-- Sea and air freight can receive goods at different China warehouses. Copy the
-- legacy shared warehouse details on first run so existing labels keep working
-- until an administrator enters the two real receiving addresses.
insert into settings (key, value)
select setting_key, setting_value
from (
  select 'china_sea_warehouse_name'::text as setting_key, value as setting_value from settings where key = 'china_warehouse_name'
  union all
  select 'china_sea_warehouse_address', value from settings where key = 'china_warehouse_address'
  union all
  select 'china_sea_warehouse_phone', value from settings where key = 'china_warehouse_phone'
  union all
  select 'china_air_warehouse_name', value from settings where key = 'china_warehouse_name'
  union all
  select 'china_air_warehouse_address', value from settings where key = 'china_warehouse_address'
  union all
  select 'china_air_warehouse_phone', value from settings where key = 'china_warehouse_phone'
) as warehouse_settings
on conflict (key) do nothing;

-- ── USERS (staff & admin) ─────────────────────────────────
-- We use Supabase Auth for authentication.
-- This table holds profile + role data.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role text not null check (role in ('admin', 'staff', 'warehouse_manager')),
  permissions text[] default array['dashboard', 'clients', 'goods', 'scan', 'receipts', 'messages', 'purchases'],
  avatar_url text,
  created_at timestamptz default now()
);

-- Keeps existing projects compatible when this schema is re-run.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'staff', 'warehouse_manager'));
alter table profiles alter column permissions set default array['dashboard', 'clients', 'goods', 'scan', 'receipts', 'messages', 'purchases'];

-- Every Supabase Auth team account needs a matching profile before it can
-- use the staff workspace. New accounts start with the standard Staff access;
-- an admin can then add or remove permissions in the app.
create or replace function public.create_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, role, permissions)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'team-member'), '@', 1)),
    new.phone,
    'staff',
    array['dashboard', 'clients', 'goods', 'scan', 'receipts', 'messages', 'purchases']
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists auth_user_profile_created on auth.users;
create trigger auth_user_profile_created
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

-- Creates profiles for any Auth accounts that existed before this trigger.
insert into profiles (id, full_name, phone, role, permissions)
select
  auth_user.id,
  coalesce(auth_user.raw_user_meta_data ->> 'full_name', split_part(coalesce(auth_user.email, 'team-member'), '@', 1)),
  auth_user.phone,
  'staff',
  array['dashboard', 'clients', 'goods', 'scan', 'receipts', 'messages', 'purchases']
from auth.users as auth_user
left join profiles on profiles.id = auth_user.id
where profiles.id is null
on conflict (id) do nothing;

-- Upgrade the old dashboard-only Staff default to the standard Staff access.
-- Admins can still remove any of these permissions in Settings and Staff Access.
update profiles
set permissions = array['dashboard', 'clients', 'goods', 'scan', 'receipts', 'messages', 'purchases']
where role = 'staff'
  and permissions in (
    array['dashboard']::text[],
    array['dashboard', 'clients', 'goods', 'scan', 'receipts', 'messages']::text[]
  );

-- ── CLIENTS ───────────────────────────────────────────────
create table if not exists clients (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  phone text not null unique,
  country text not null default 'Nigeria',
  state text not null default 'Lagos',
  shipping_mark text not null unique,
  password_hash text not null,  -- bcrypt hash, handled by Edge Function
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table clients add column if not exists state text not null default 'Lagos';
alter table clients alter column country set default 'Nigeria';

create index if not exists clients_phone_idx on clients (phone);
create index if not exists clients_shipping_mark_idx on clients (shipping_mark);
create index if not exists clients_created_at_idx on clients (created_at desc);

-- ── GOODS ─────────────────────────────────────────────────
create table if not exists goods (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  description text not null,
  type text not null check (type in ('sea', 'air')) default 'sea',
  -- sea measurements
  length_cm numeric,
  width_cm numeric,
  height_cm numeric,
  cbm numeric generated always as (
    case when length_cm is not null and width_cm is not null and height_cm is not null
    then round((length_cm * width_cm * height_cm / 1000000.0)::numeric, 4)
    else null end
  ) stored,
  -- common
  quantity integer not null default 1 check (quantity > 0),
  weight_kg numeric not null default 0,
  tracking_no text,
  status text not null check (status in ('in_warehouse','in_transit','delivered')) default 'in_warehouse',
  container_id uuid,  -- FK added after container table
  notes text,
  photos text[] default array[]::text[],  -- Supabase Storage URLs
  recorded_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table goods add column if not exists quantity integer not null default 1;
alter table goods drop constraint if exists goods_quantity_positive;
alter table goods add constraint goods_quantity_positive check (quantity > 0);

-- ── CONTAINERS ────────────────────────────────────────────
create table if not exists containers (
  id uuid primary key default uuid_generate_v4(),
  container_no text not null unique,
  type text not null default '20ft' check (type in ('20ft', '40ft', '40hc', 'air')),
  route text not null,
  status text not null default 'loading' check (status in ('loading','in_transit','delivered')),
  departure_date date,
  arrival_date date,
  notes text,
  created_at timestamptz default now()
);

-- Add FK from goods to containers
alter table goods drop constraint if exists goods_container_id_fkey;
alter table goods add constraint goods_container_id_fkey
  foreign key (container_id) references containers(id) on delete set null;

create index if not exists goods_client_id_idx on goods (client_id);
create index if not exists goods_tracking_no_idx on goods (tracking_no);
create index if not exists goods_container_id_idx on goods (container_id);
create index if not exists goods_status_idx on goods (status);
create index if not exists goods_created_at_idx on goods (created_at desc);

-- ── RECEIPTS ──────────────────────────────────────────────
create table if not exists receipts (
  id uuid primary key default uuid_generate_v4(),
  receipt_no text not null unique,
  client_id uuid not null references clients(id),
  goods_id uuid references goods(id),
  items jsonb not null default '[]',
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  total numeric not null default 0,
  currency text not null default 'NGN',
  status text not null default 'unpaid' check (status in ('unpaid','paid')),
  issued_by uuid references profiles(id),
  issued_at timestamptz default now(),
  paid_at timestamptz
);

alter table receipts alter column currency set default 'NGN';
update receipts set currency = 'NGN' where currency = 'MYR';

create index if not exists receipts_client_id_idx on receipts (client_id);
create index if not exists receipts_goods_id_idx on receipts (goods_id);
create index if not exists receipts_issued_at_idx on receipts (issued_at desc);
create index if not exists receipts_status_idx on receipts (status);

-- ── EXPENSES / FINANCE ────────────────────────────────────
create table if not exists expenses (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  category text not null default 'Operations',
  amount numeric not null default 0,
  currency text not null default 'NGN',
  expense_date date not null default current_date,
  notes text,
  recorded_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table expenses alter column currency set default 'NGN';
update expenses set currency = 'NGN' where currency = 'MYR';

create index if not exists expenses_expense_date_idx on expenses (expense_date desc);

-- ── ANNOUNCEMENTS ─────────────────────────────────────────
create table if not exists announcements (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  body text not null,
  is_important boolean default false,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- ── SUPPLIERS ─────────────────────────────────────────────
create table if not exists suppliers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  contact text,
  category text,
  address text,
  notes text,
  created_at timestamptz default now()
);

-- ── MESSAGES ──────────────────────────────────────────────
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  sender text not null check (sender in ('client','admin','staff')),
  message text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);

create index if not exists messages_client_id_created_at_idx on messages (client_id, created_at);

-- ── PURCHASE REQUESTS ────────────────────────────────────
-- Clients submit marketplace links here when they want the team to buy in China.
create table if not exists purchase_requests (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  platform text not null check (platform in ('1688', 'taobao', 'pinduoduo', 'other')),
  product_link text not null,
  product_name text,
  variant text,
  quantity integer not null default 1 check (quantity > 0),
  notes text,
  status text not null default 'submitted' check (status in ('submitted', 'reviewing', 'awaiting_payment', 'payment_confirmed', 'purchased', 'unavailable', 'cancelled')),
  quoted_amount_rmb numeric,
  team_notes text,
  handled_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists purchase_requests_client_id_idx on purchase_requests (client_id, created_at desc);
create index if not exists purchase_requests_status_idx on purchase_requests (status, created_at desc);

-- Client prepaid balance. Balances are derived from the immutable ledger.
-- Staff use the wallet functions below; direct writes are intentionally blocked.
create table if not exists wallet_accounts (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  currency text not null check (currency in ('NGN', 'RMB')),
  available_balance numeric(14,2) not null default 0 check (available_balance >= 0),
  held_balance numeric(14,2) not null default 0 check (held_balance >= 0),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (client_id, currency)
);

create table if not exists wallet_transactions (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid references wallet_accounts(id) on delete set null,
  client_id uuid not null references clients(id) on delete cascade,
  currency text not null check (currency in ('NGN', 'RMB')),
  entry_type text not null check (entry_type in ('cash_topup', 'shipping_charge', 'purchase_charge', 'refund')),
  direction text not null check (direction in ('credit', 'debit')),
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected', 'cancelled')),
  reference_type text,
  reference_id uuid,
  description text,
  cash_reference text,
  office_location text,
  recorded_by uuid references profiles(id) on delete set null,
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  balance_after numeric(14,2),
  created_at timestamptz default now()
);

-- Created and checked only by Supabase Edge Functions. The browser never
-- receives a database session row or token hash.
create table if not exists client_sessions (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists wallet_accounts_client_id_idx on wallet_accounts (client_id, currency);
create index if not exists wallet_transactions_client_created_at_idx on wallet_transactions (client_id, created_at desc);
create index if not exists wallet_transactions_status_created_at_idx on wallet_transactions (status, created_at desc);
create index if not exists client_sessions_token_hash_idx on client_sessions (token_hash);
create index if not exists client_sessions_client_expires_idx on client_sessions (client_id, expires_at desc);

-- ── SCAN LOG ──────────────────────────────────────────────
create table if not exists scan_logs (
  id uuid primary key default uuid_generate_v4(),
  scanned_value text not null,
  goods_id uuid references goods(id),
  scanned_by uuid references profiles(id),
  result text,
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table clients enable row level security;
alter table goods enable row level security;
alter table containers enable row level security;
alter table receipts enable row level security;
alter table expenses enable row level security;
alter table announcements enable row level security;
alter table suppliers enable row level security;
alter table messages enable row level security;
alter table purchase_requests enable row level security;
alter table wallet_accounts enable row level security;
alter table wallet_transactions enable row level security;
alter table client_sessions enable row level security;
alter table scan_logs enable row level security;
alter table settings enable row level security;

-- Realtime: publish changes so open client/staff/admin screens refresh
-- as soon as admins update goods, settings, receipts, messages, etc.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'clients',
    'goods',
    'containers',
    'receipts',
    'expenses',
    'announcements',
    'suppliers',
    'messages',
    'purchase_requests',
    'wallet_accounts',
    'wallet_transactions',
    'settings'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

-- Helper function: get current user role
create or replace function get_my_role()
returns text language sql security definer as $$
  select role from profiles where id = auth.uid()
$$;

-- Admins always have full access. Staff and warehouse managers are scoped
-- by the permissions selected in the admin workspace.
create or replace function has_permission(required_permission text)
returns boolean language sql security definer set search_path = public as $$
  select coalesce(
    (
      select role = 'admin'
        or required_permission = any(coalesce(permissions, '{}'::text[]))
      from profiles
      where id = auth.uid()
    ),
    false
  )
$$;

-- PROFILES: users see own profile; admin sees all
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or get_my_role() = 'admin');
drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles for update
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');
drop policy if exists "profiles_insert" on profiles;
create policy "profiles_insert" on profiles for insert
  with check (get_my_role() = 'admin');

-- SETTINGS: client portal reads run through the scoped Edge Function; only
-- signed-in staff can read settings, while only administrators can change them.
drop policy if exists "settings_read" on settings;
drop policy if exists "settings_staff_read" on settings;
create policy "settings_staff_read" on settings for select
  using (get_my_role() is not null);
drop policy if exists "settings_write" on settings;
create policy "settings_write" on settings for all using (get_my_role() = 'admin');

-- CLIENTS: staff and admin can manage client records. Client login is handled
-- only by the client-login Edge Function, never by a public table query.
drop policy if exists "clients_staff_admin_all" on clients;
create policy "clients_staff_admin_all" on clients for all
  using (has_permission('clients'))
  with check (has_permission('clients'));
drop policy if exists "clients_public_login_read" on clients;

-- GOODS: client-specific reads are returned by client-portal Edge Function.
drop policy if exists "goods_staff_admin_all" on goods;
create policy "goods_staff_admin_all" on goods for all
  using (has_permission('goods') or has_permission('scan'))
  with check (has_permission('goods') or has_permission('scan'));
drop policy if exists "goods_public_read" on goods;

-- CONTAINERS: staff & admin
drop policy if exists "containers_all" on containers;
create policy "containers_all" on containers for all
  using (has_permission('goods') or has_permission('scan') or has_permission('containers'))
  with check (has_permission('goods') or has_permission('scan') or has_permission('containers'));

-- RECEIPTS: finance/receipt users manage records; client receipt reads and
-- wallet payment requests are handled through the scoped Edge Function.
drop policy if exists "receipts_staff_admin_read" on receipts;
create policy "receipts_staff_admin_read" on receipts for select
  using (has_permission('receipts') or has_permission('finance'));
drop policy if exists "receipts_public_read" on receipts;
drop policy if exists "receipts_write" on receipts;
create policy "receipts_write" on receipts for insert
  with check (has_permission('receipts') or has_permission('finance'));
drop policy if exists "receipts_update" on receipts;
create policy "receipts_update" on receipts for update
  using (has_permission('receipts') or has_permission('finance'))
  with check (has_permission('receipts') or has_permission('finance'));

-- EXPENSES: the finance permission can view and manage expense records.
drop policy if exists "expenses_admin_all" on expenses;
create policy "expenses_admin_all" on expenses for all
  using (has_permission('finance'))
  with check (has_permission('finance'));

-- ANNOUNCEMENTS: client portal access is mediated by client-portal.
drop policy if exists "ann_read" on announcements;
drop policy if exists "ann_write" on announcements;
create policy "ann_write" on announcements for all using (get_my_role() = 'admin');

-- SUPPLIERS: client portal access is mediated by client-portal.
drop policy if exists "sup_read" on suppliers;
drop policy if exists "sup_write" on suppliers;
create policy "sup_write" on suppliers for all using (get_my_role() = 'admin');

-- MESSAGES: client thread reads/inserts are mediated by client-portal.
drop policy if exists "msg_staff_admin_all" on messages;
create policy "msg_staff_admin_all" on messages for all
  using (has_permission('messages'))
  with check (has_permission('messages'));
drop policy if exists "msg_public_read" on messages;
drop policy if exists "msg_public_insert" on messages;

-- PURCHASE REQUESTS: the Edge Function verifies the client session before it
-- creates a request, and the purchase team manages the queue.
drop policy if exists "purchase_requests_team_all" on purchase_requests;
create policy "purchase_requests_team_all" on purchase_requests for all
  using (has_permission('purchases'))
  with check (has_permission('purchases'));
drop policy if exists "purchase_requests_client_submit" on purchase_requests;
drop policy if exists "purchase_requests_finance_read" on purchase_requests;
create policy "purchase_requests_finance_read" on purchase_requests for select
  using (has_permission('finance'));

-- Prepaid balance: finance users can read the ledger, while every write goes
-- through the security-definer functions below. Clients read only through the
-- client-wallet Edge Function after its private session check.
drop policy if exists "wallet_accounts_finance_read" on wallet_accounts;
create policy "wallet_accounts_finance_read" on wallet_accounts for select
  using (has_permission('finance'));
drop policy if exists "wallet_transactions_finance_read" on wallet_transactions;
create policy "wallet_transactions_finance_read" on wallet_transactions for select
  using (has_permission('finance'));

-- SCAN LOG
drop policy if exists "scan_all" on scan_logs;
create policy "scan_all" on scan_logs for all
  using (has_permission('scan'))
  with check (has_permission('scan'));

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists clients_updated_at on clients;
create trigger clients_updated_at before update on clients
  for each row execute function update_updated_at();
drop trigger if exists goods_updated_at on goods;
create trigger goods_updated_at before update on goods
  for each row execute function update_updated_at();
drop trigger if exists expenses_updated_at on expenses;
create trigger expenses_updated_at before update on expenses
  for each row execute function update_updated_at();
drop trigger if exists purchase_requests_updated_at on purchase_requests;
create trigger purchase_requests_updated_at before update on purchase_requests
  for each row execute function update_updated_at();
drop trigger if exists wallet_accounts_updated_at on wallet_accounts;
create trigger wallet_accounts_updated_at before update on wallet_accounts
  for each row execute function update_updated_at();

-- A completed wallet payment locks the charged financial record. Refunds are
-- recorded as separate ledger credits instead of silently rewriting history.
create or replace function public.prevent_wallet_paid_record_rewrite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'receipts' and exists (
    select 1 from wallet_transactions
    where reference_type = 'receipt'
      and reference_id = old.id
      and status = 'completed'
  ) then
    if new.client_id is distinct from old.client_id
      or new.goods_id is distinct from old.goods_id
      or new.items is distinct from old.items
      or new.subtotal is distinct from old.subtotal
      or new.discount is distinct from old.discount
      or new.total is distinct from old.total
      or new.currency is distinct from old.currency
      or new.status is distinct from old.status then
      raise exception 'A wallet-paid receipt cannot be changed. Record a refund for corrections.';
    end if;
  end if;

  if tg_table_name = 'purchase_requests' and exists (
    select 1 from wallet_transactions
    where reference_type = 'purchase_request'
      and reference_id = old.id
      and status = 'completed'
  ) then
    if new.client_id is distinct from old.client_id
      or new.quoted_amount_rmb is distinct from old.quoted_amount_rmb
      or new.status in ('submitted', 'reviewing', 'awaiting_payment') then
      raise exception 'A wallet-paid purchase request cannot be reopened or re-quoted. Record a refund for corrections.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists receipts_wallet_payment_guard on receipts;
create trigger receipts_wallet_payment_guard before update on receipts
  for each row execute function public.prevent_wallet_paid_record_rewrite();
drop trigger if exists purchase_requests_wallet_payment_guard on purchase_requests;
create trigger purchase_requests_wallet_payment_guard before update on purchase_requests
  for each row execute function public.prevent_wallet_paid_record_rewrite();

-- Client passwords are stored as bcrypt hashes. Existing legacy plaintext
-- values are converted by the update below, and every new or changed password
-- is hashed by this trigger.
create or replace function public.hash_client_password()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.password_hash !~ '^\$2[aby]\$' then
    new.password_hash := crypt(new.password_hash, gen_salt('bf', 12));
  end if;
  return new;
end;
$$;

drop trigger if exists clients_password_hashed on clients;
create trigger clients_password_hashed before insert or update of password_hash on clients
  for each row execute function public.hash_client_password();

-- Convert existing demo passwords immediately when this schema is applied.
-- Deploy the bcrypt-aware client-login function before running this update.
update clients
set password_hash = password_hash
where password_hash !~ '^\$2[aby]\$';

-- Record cash received at the Nigeria office. This stays pending until a
-- different finance user approves the entry.
create or replace function public.create_wallet_cash_topup(
  p_client_id uuid,
  p_currency text,
  p_amount numeric,
  p_cash_reference text default null,
  p_description text default null,
  p_office_location text default 'Nigeria office'
)
returns wallet_transactions language plpgsql security definer set search_path = public as $$
declare
  v_currency text := upper(trim(coalesce(p_currency, '')));
  v_amount numeric(14,2) := round(coalesce(p_amount, 0), 2);
  v_transaction wallet_transactions;
begin
  if not has_permission('finance') then
    raise exception 'Finance permission is required';
  end if;
  if v_currency not in ('NGN', 'RMB') then
    raise exception 'Wallet currency must be NGN or RMB';
  end if;
  if v_amount <= 0 then
    raise exception 'Top-up amount must be greater than zero';
  end if;

  insert into wallet_transactions (
    client_id, currency, entry_type, direction, amount, status,
    description, cash_reference, office_location, recorded_by
  ) values (
    p_client_id, v_currency, 'cash_topup', 'credit', v_amount, 'pending',
    nullif(trim(p_description), ''), nullif(trim(p_cash_reference), ''),
    coalesce(nullif(trim(p_office_location), ''), 'Nigeria office'), auth.uid()
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

-- Approve the top-up and add it to the balance while the account row is
-- locked, preventing concurrent approvals from double-crediting the client.
create or replace function public.approve_wallet_cash_topup(p_transaction_id uuid)
returns wallet_transactions language plpgsql security definer set search_path = public as $$
declare
  v_transaction wallet_transactions;
  v_account wallet_accounts;
  v_new_balance numeric(14,2);
begin
  if not has_permission('finance') then
    raise exception 'Finance permission is required';
  end if;

  select * into v_transaction
  from wallet_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Wallet transaction not found';
  end if;
  if v_transaction.entry_type <> 'cash_topup' or v_transaction.status <> 'pending' then
    raise exception 'Only pending cash top-ups can be approved';
  end if;
  if v_transaction.recorded_by = auth.uid() then
    raise exception 'A different finance user must approve this cash top-up';
  end if;

  insert into wallet_accounts (client_id, currency)
  values (v_transaction.client_id, v_transaction.currency)
  on conflict (client_id, currency) do nothing;

  select * into v_account
  from wallet_accounts
  where client_id = v_transaction.client_id and currency = v_transaction.currency
  for update;

  v_new_balance := v_account.available_balance + v_transaction.amount;
  update wallet_accounts
  set available_balance = v_new_balance
  where id = v_account.id;

  update wallet_transactions
  set account_id = v_account.id,
      status = 'completed',
      approved_by = auth.uid(),
      approved_at = now(),
      balance_after = v_new_balance
  where id = v_transaction.id
  returning * into v_transaction;

  return v_transaction;
end;
$$;

-- Apply an approved shipping or purchasing debit, or a refund credit.
-- A debit cannot make the available balance negative.
create or replace function public.record_wallet_entry(
  p_client_id uuid,
  p_currency text,
  p_amount numeric,
  p_entry_type text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_description text default null
)
returns wallet_transactions language plpgsql security definer set search_path = public as $$
declare
  v_currency text := upper(trim(coalesce(p_currency, '')));
  v_amount numeric(14,2) := round(coalesce(p_amount, 0), 2);
  v_entry_type text := trim(coalesce(p_entry_type, ''));
  v_direction text;
  v_account wallet_accounts;
  v_new_balance numeric(14,2);
  v_transaction wallet_transactions;
begin
  if not has_permission('finance') then
    raise exception 'Finance permission is required';
  end if;
  if v_currency not in ('NGN', 'RMB') then
    raise exception 'Wallet currency must be NGN or RMB';
  end if;
  if v_amount <= 0 then
    raise exception 'Entry amount must be greater than zero';
  end if;
  if v_entry_type not in ('shipping_charge', 'purchase_charge', 'refund') then
    raise exception 'Wallet entry type is not allowed';
  end if;

  v_direction := case when v_entry_type = 'refund' then 'credit' else 'debit' end;
  insert into wallet_accounts (client_id, currency)
  values (p_client_id, v_currency)
  on conflict (client_id, currency) do nothing;

  select * into v_account
  from wallet_accounts
  where client_id = p_client_id and currency = v_currency
  for update;

  if v_direction = 'debit' and v_account.available_balance < v_amount then
    raise exception 'Insufficient available wallet balance';
  end if;

  v_new_balance := case
    when v_direction = 'credit' then v_account.available_balance + v_amount
    else v_account.available_balance - v_amount
  end;

  update wallet_accounts
  set available_balance = v_new_balance
  where id = v_account.id;

  insert into wallet_transactions (
    account_id, client_id, currency, entry_type, direction, amount, status,
    reference_type, reference_id, description, recorded_by, approved_by,
    approved_at, balance_after
  ) values (
    v_account.id, p_client_id, v_currency, v_entry_type, v_direction, v_amount, 'completed',
    nullif(trim(p_reference_type), ''), p_reference_id, nullif(trim(p_description), ''),
    auth.uid(), auth.uid(), now(), v_new_balance
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

-- Pays one unpaid freight receipt from the client's matching wallet. Receipt
-- and balance rows are locked so the receipt cannot be charged twice.
create or replace function public.pay_wallet_receipt(
  p_client_id uuid,
  p_receipt_id uuid,
  p_initiated_by_client boolean default false
)
returns wallet_transactions language plpgsql security definer set search_path = public as $$
declare
  v_receipt receipts;
  v_account wallet_accounts;
  v_currency text;
  v_new_balance numeric(14,2);
  v_transaction wallet_transactions;
begin
  if p_initiated_by_client then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Client wallet payments must be made through the secure portal';
    end if;
  elsif not has_permission('finance') then
    raise exception 'Finance permission is required';
  end if;

  select * into v_receipt
  from receipts
  where id = p_receipt_id
  for update;

  if not found then
    raise exception 'Receipt not found';
  end if;
  if v_receipt.client_id <> p_client_id then
    raise exception 'Receipt does not belong to this client';
  end if;
  if v_receipt.status <> 'unpaid' then
    raise exception 'This receipt has already been paid';
  end if;
  if v_receipt.total <= 0 then
    raise exception 'Receipt total must be greater than zero';
  end if;

  v_currency := upper(coalesce(v_receipt.currency, 'NGN'));
  if v_currency not in ('NGN', 'RMB') then
    raise exception 'This receipt currency cannot be paid from the wallet';
  end if;

  insert into wallet_accounts (client_id, currency)
  values (p_client_id, v_currency)
  on conflict (client_id, currency) do nothing;

  select * into v_account
  from wallet_accounts
  where client_id = p_client_id and currency = v_currency
  for update;

  if v_account.available_balance < v_receipt.total then
    raise exception 'Insufficient available wallet balance';
  end if;

  v_new_balance := v_account.available_balance - v_receipt.total;
  update wallet_accounts
  set available_balance = v_new_balance
  where id = v_account.id;

  update receipts
  set status = 'paid', paid_at = now()
  where id = v_receipt.id;

  insert into wallet_transactions (
    account_id, client_id, currency, entry_type, direction, amount, status,
    reference_type, reference_id, description, recorded_by, approved_by,
    approved_at, balance_after
  ) values (
    v_account.id, p_client_id, v_currency, 'shipping_charge', 'debit', v_receipt.total, 'completed',
    'receipt', v_receipt.id, 'Wallet payment for receipt ' || v_receipt.receipt_no,
    case when p_initiated_by_client then null else auth.uid() end,
    case when p_initiated_by_client then null else auth.uid() end,
    now(), v_new_balance
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

-- Pays a quoted marketplace request from the RMB wallet and records the
-- request reference in the same transaction as the balance change.
drop function if exists public.pay_wallet_purchase(uuid, uuid);
create or replace function public.pay_wallet_purchase(
  p_client_id uuid,
  p_purchase_request_id uuid,
  p_initiated_by_client boolean default false
)
returns wallet_transactions language plpgsql security definer set search_path = public as $$
declare
  v_purchase purchase_requests;
  v_account wallet_accounts;
  v_new_balance numeric(14,2);
  v_transaction wallet_transactions;
begin
  if p_initiated_by_client then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Client wallet payments must be made through the secure portal';
    end if;
  elsif not has_permission('finance') then
    raise exception 'Finance permission is required';
  end if;

  select * into v_purchase
  from purchase_requests
  where id = p_purchase_request_id
  for update;

  if not found then
    raise exception 'Purchase request not found';
  end if;
  if v_purchase.client_id <> p_client_id then
    raise exception 'Purchase request does not belong to this client';
  end if;
  if v_purchase.status in ('payment_confirmed', 'purchased', 'unavailable', 'cancelled') then
    raise exception 'This purchase request cannot be charged';
  end if;
  if v_purchase.quoted_amount_rmb is null or v_purchase.quoted_amount_rmb <= 0 then
    raise exception 'Set a positive RMB quote before charging this purchase request';
  end if;

  insert into wallet_accounts (client_id, currency)
  values (p_client_id, 'RMB')
  on conflict (client_id, currency) do nothing;

  select * into v_account
  from wallet_accounts
  where client_id = p_client_id and currency = 'RMB'
  for update;

  if v_account.available_balance < v_purchase.quoted_amount_rmb then
    raise exception 'Insufficient available RMB wallet balance';
  end if;

  v_new_balance := v_account.available_balance - v_purchase.quoted_amount_rmb;
  update wallet_accounts
  set available_balance = v_new_balance
  where id = v_account.id;

  update purchase_requests
  set status = 'payment_confirmed',
      handled_by = case when p_initiated_by_client then handled_by else auth.uid() end
  where id = v_purchase.id;

  insert into wallet_transactions (
    account_id, client_id, currency, entry_type, direction, amount, status,
    reference_type, reference_id, description, recorded_by, approved_by,
    approved_at, balance_after
  ) values (
    v_account.id, p_client_id, 'RMB', 'purchase_charge', 'debit', v_purchase.quoted_amount_rmb, 'completed',
    'purchase_request', v_purchase.id,
    'Wallet payment for purchase request: ' || coalesce(v_purchase.product_name, v_purchase.platform),
    case when p_initiated_by_client then null else auth.uid() end,
    case when p_initiated_by_client then null else auth.uid() end,
    now(), v_new_balance
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

revoke all on function public.create_wallet_cash_topup(uuid, text, numeric, text, text, text) from public;
revoke all on function public.approve_wallet_cash_topup(uuid) from public;
revoke all on function public.record_wallet_entry(uuid, text, numeric, text, text, uuid, text) from public;
revoke all on function public.pay_wallet_receipt(uuid, uuid, boolean) from public;
revoke all on function public.pay_wallet_purchase(uuid, uuid, boolean) from public;
grant execute on function public.create_wallet_cash_topup(uuid, text, numeric, text, text, text) to authenticated;
grant execute on function public.approve_wallet_cash_topup(uuid) to authenticated;
grant execute on function public.record_wallet_entry(uuid, text, numeric, text, text, uuid, text) to authenticated;
grant execute on function public.pay_wallet_receipt(uuid, uuid, boolean) to authenticated;
grant execute on function public.pay_wallet_purchase(uuid, uuid, boolean) to authenticated;

notify pgrst, 'reload schema';

-- Generate shipping mark: MY-NNN-XXX
create or replace function generate_shipping_mark(client_name text)
returns text language plpgsql as $$
declare
  seq int;
  initials text;
begin
  select count(*) + 1 into seq from clients;
  initials := upper(substring(regexp_replace(client_name, '\s+', ' ', 'g'), 1, 1));
  -- get first letter of each word up to 3 chars
  select string_agg(upper(left(word, 1)), '') into initials
  from (select regexp_split_to_table(trim(client_name), '\s+') as word limit 3) w;
  return 'MY-' || lpad(seq::text, 3, '0') || '-' || initials;
end;
$$;

-- Auto-generate receipt number
create or replace function generate_receipt_no()
returns text language plpgsql as $$
declare
  seq int;
begin
  select count(*) + 1 into seq from receipts;
  return 'REC-' || to_char(now(), 'YYYY') || '-' || lpad(seq::text, 4, '0');
end;
$$;

-- ============================================================
-- STORAGE BUCKET (run separately if needed)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('goods-photos', 'goods-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "goods_photos_public_read" on storage.objects;
create policy "goods_photos_public_read" on storage.objects for select
  using (bucket_id = 'goods-photos');

drop policy if exists "goods_photos_staff_upload" on storage.objects;
create policy "goods_photos_staff_upload" on storage.objects for insert
  with check (bucket_id = 'goods-photos' and has_permission('goods'));

drop policy if exists "goods_photos_staff_update" on storage.objects;
create policy "goods_photos_staff_update" on storage.objects for update
  using (bucket_id = 'goods-photos' and has_permission('goods'))
  with check (bucket_id = 'goods-photos' and has_permission('goods'));
