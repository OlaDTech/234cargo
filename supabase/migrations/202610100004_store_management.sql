-- Product deletion uses the existing admin-only RLS policy.
begin;
grant delete on public.store_products to authenticated;
-- A restrictive policy prevents a permissive policy added later from
-- accidentally allowing non-admin catalog deletion.
drop policy if exists store_delete_admin_only on public.store_products;
create policy store_delete_admin_only on public.store_products as restrictive
for delete to authenticated using (public.get_my_role() = 'admin');
commit;
