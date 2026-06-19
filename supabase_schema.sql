-- ============================================================
-- OceanAir Logistics — Supabase Database Schema
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

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── SETTINGS ──────────────────────────────────────────────
create table if not exists settings (
  id uuid primary key default uuid_generate_v4(),
  key text unique not null,
  value text not null,
  updated_at timestamptz default now()
);

insert into settings (key, value) values
  ('company_name', 'OceanAir Logistics'),
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

-- ── USERS (staff & admin) ─────────────────────────────────
-- We use Supabase Auth for authentication.
-- This table holds profile + role data.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role text not null check (role in ('admin', 'staff')),
  permissions text[] default array['dashboard'],
  avatar_url text,
  created_at timestamptz default now()
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

-- PROFILES: users see own profile; admin sees all
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or get_my_role() in ('admin','staff'));
drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles for update
  using (id = auth.uid() or get_my_role() = 'admin');
drop policy if exists "profiles_insert" on profiles;
create policy "profiles_insert" on profiles for insert
  with check (get_my_role() = 'admin');

-- SETTINGS: public read (needed for shipping label on client portal, pre-auth); only admin writes
drop policy if exists "settings_read" on settings;
create policy "settings_read" on settings for select using (true);
drop policy if exists "settings_write" on settings;
create policy "settings_write" on settings for all using (get_my_role() = 'admin');

-- CLIENTS: staff & admin can fully manage.
-- Public SELECT is also allowed so the client portal can look up
-- a client by phone/shipping_mark during login (no Supabase Auth session).
-- Only non-sensitive columns should be exposed this way in production —
-- see README "Hardening" section for moving login to an Edge Function.
drop policy if exists "clients_staff_admin_all" on clients;
create policy "clients_staff_admin_all" on clients for all using (get_my_role() in ('admin','staff'));
drop policy if exists "clients_public_login_read" on clients;
create policy "clients_public_login_read" on clients for select using (true);

-- GOODS: staff & admin manage; clients can read (filtered client-side by client_id,
-- since the client portal has no Supabase Auth session to scope a policy to)
drop policy if exists "goods_staff_admin_all" on goods;
create policy "goods_staff_admin_all" on goods for all using (get_my_role() in ('admin','staff'));
drop policy if exists "goods_public_read" on goods;
create policy "goods_public_read" on goods for select using (true);

-- CONTAINERS: staff & admin
drop policy if exists "containers_all" on containers;
create policy "containers_all" on containers for all using (get_my_role() in ('admin','staff'));

-- RECEIPTS: admin manages; staff reads; clients read their own (filtered client-side)
drop policy if exists "receipts_staff_admin_read" on receipts;
create policy "receipts_staff_admin_read" on receipts for select using (get_my_role() in ('admin','staff'));
drop policy if exists "receipts_public_read" on receipts;
create policy "receipts_public_read" on receipts for select using (true);
drop policy if exists "receipts_write" on receipts;
create policy "receipts_write" on receipts for insert with check (get_my_role() = 'admin');
drop policy if exists "receipts_update" on receipts;
create policy "receipts_update" on receipts for update using (get_my_role() = 'admin');

-- EXPENSES: admin only
drop policy if exists "expenses_admin_all" on expenses;
create policy "expenses_admin_all" on expenses for all using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- ANNOUNCEMENTS: public read (client portal dashboard); admin writes
drop policy if exists "ann_read" on announcements;
create policy "ann_read" on announcements for select using (true);
drop policy if exists "ann_write" on announcements;
create policy "ann_write" on announcements for all using (get_my_role() = 'admin');

-- SUPPLIERS: public read (client portal directory); admin writes
drop policy if exists "sup_read" on suppliers;
create policy "sup_read" on suppliers for select using (true);
drop policy if exists "sup_write" on suppliers;
create policy "sup_write" on suppliers for all using (get_my_role() = 'admin');

-- MESSAGES: staff/admin manage all; clients can read/insert their own thread
-- (client_id is enforced application-side since clients have no auth.uid())
drop policy if exists "msg_staff_admin_all" on messages;
create policy "msg_staff_admin_all" on messages for all using (get_my_role() in ('admin','staff'));
drop policy if exists "msg_public_read" on messages;
create policy "msg_public_read" on messages for select using (true);
drop policy if exists "msg_public_insert" on messages;
create policy "msg_public_insert" on messages for insert with check (sender = 'client');

-- SCAN LOG
drop policy if exists "scan_all" on scan_logs;
create policy "scan_all" on scan_logs for all using (get_my_role() in ('admin','staff'));

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
  with check (bucket_id = 'goods-photos' and get_my_role() in ('admin','staff'));

drop policy if exists "goods_photos_staff_update" on storage.objects;
create policy "goods_photos_staff_update" on storage.objects for update
  using (bucket_id = 'goods-photos' and get_my_role() in ('admin','staff'))
  with check (bucket_id = 'goods-photos' and get_my_role() in ('admin','staff'));
