-- Admin-only deletion. Preserve existing completed-payment protections.
drop policy if exists receipts_delete on public.receipts;
create policy receipts_delete on public.receipts for delete to authenticated
using (
  public.get_my_role() = 'admin'
  and status = 'unpaid'
  and not exists (
    select 1 from public.wallet_transactions
    where reference_type = 'receipt' and reference_id = receipts.id and status = 'completed'
  )
);

-- Also enforce on cascades and deployments with additional permissive policies.
create or replace function public.guard_receipt_deletion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_role() is distinct from 'admin' then
    raise exception 'Only administrators can delete receipts' using errcode = '42501';
  end if;
  if old.status <> 'unpaid' or exists (
    select 1 from public.wallet_transactions
    where reference_type = 'receipt' and reference_id = old.id and status = 'completed'
  ) then
    raise exception 'Paid receipts cannot be deleted. Record a refund or correction.';
  end if;
  return old;
end;
$$;
drop trigger if exists receipts_admin_delete_guard on public.receipts;
create trigger receipts_admin_delete_guard before delete on public.receipts
for each row execute function public.guard_receipt_deletion();
notify pgrst, 'reload schema';
