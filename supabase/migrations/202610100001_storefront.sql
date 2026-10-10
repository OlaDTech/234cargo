-- Apply after the existing 234Cargo schema.
create table public.store_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  description text not null default '',
  category text not null default 'General',
  supplier text not null default '234Cargo',
  price numeric(14,2) not null check (price > 0),
  currency text not null check (currency in ('RMB','NGN','USD')),
  image_url text,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.store_orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  request_id uuid not null,
  items jsonb not null,
  currency text not null,
  total numeric(14,2) not null check (total > 0),
  status text not null default 'pending' check (status in ('pending','confirmed','purchased','ready_to_ship','cancelled')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (client_id, request_id)
);
create index on public.store_orders(client_id, created_at desc);
alter table public.store_products enable row level security;
alter table public.store_orders enable row level security;
create policy store_catalog_read on public.store_products for select to anon, authenticated using (active or public.get_my_role() = 'admin');
create policy store_catalog_admin on public.store_products for all to authenticated using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
create policy store_orders_admin_read on public.store_orders for select to authenticated using (public.get_my_role() = 'admin');
create policy store_orders_admin_update on public.store_orders for update to authenticated using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
revoke all on public.store_products, public.store_orders from anon, authenticated;
grant select on public.store_products to anon, authenticated;
grant insert, update on public.store_products to authenticated;
grant select on public.store_orders to authenticated;
grant update(status) on public.store_orders to authenticated;

create or replace function public.place_store_order(p_client uuid, p_request uuid, p_items jsonb, p_notes text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_item jsonb; v_product public.store_products; v_qty integer; v_currency text; v_total numeric := 0; v_items jsonb := '[]';
begin
  -- Serialize retries for a client's checkout. Never accept browser prices.
  perform 1 from public.clients where id = p_client for update;
  if not found then raise exception 'Client not found'; end if;
  select id into v_id from public.store_orders where client_id = p_client and request_id = p_request;
  if v_id is not null then return v_id; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Choose 1 to 50 products'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if (v_item->>'quantity') !~ '^[1-9][0-9]{0,3}$' then raise exception 'Invalid quantity'; end if;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null then raise exception 'Quantity is required'; end if;
    select * into v_product from public.store_products where id = (v_item->>'id')::uuid and active for share;
    if not found then raise exception 'A product is no longer available'; end if;
    if v_currency is not null and v_currency <> v_product.currency then raise exception 'Order products in one currency at a time'; end if;
    v_currency := v_product.currency;
    v_total := v_total + v_product.price * v_qty;
    v_items := v_items || jsonb_build_array(jsonb_build_object('id',v_product.id,'name',v_product.name,'quantity',v_qty,'price',v_product.price,'amount',v_product.price*v_qty));
  end loop;
  insert into public.store_orders(client_id,request_id,items,currency,total,notes) values(p_client,p_request,v_items,v_currency,v_total,left(coalesce(p_notes,''),1000)) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.place_store_order(uuid,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.place_store_order(uuid,uuid,jsonb,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('store-products','store-products',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy store_photos_read on storage.objects for select using(bucket_id = 'store-products');
create policy store_photos_admin on storage.objects for insert to authenticated with check(bucket_id = 'store-products' and public.get_my_role() = 'admin');
notify pgrst, 'reload schema';
