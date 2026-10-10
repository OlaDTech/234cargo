-- Apply after 202610100002_admin_receipt_deletion.sql.
-- Admins may delete any receipt; retain an immutable copy and wallet history.
begin;
create table if not exists public.receipt_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null,
  deleted_by uuid not null,
  deleted_at timestamptz not null default now(),
  receipt_snapshot jsonb not null
);
alter table public.receipt_deletion_audit enable row level security;
revoke all on public.receipt_deletion_audit from anon, authenticated;
grant select on public.receipt_deletion_audit to authenticated;
drop policy if exists admin_read_receipt_deletions on public.receipt_deletion_audit;
create policy admin_read_receipt_deletions on public.receipt_deletion_audit for select to authenticated
using (public.get_my_role() = 'admin');

create or replace function public.guard_receipt_deletion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.get_my_role() is distinct from 'admin' then
    raise exception 'Only administrators can delete receipts' using errcode = '42501';
  end if;
  insert into public.receipt_deletion_audit(receipt_id, deleted_by, receipt_snapshot)
  values(old.id, auth.uid(), to_jsonb(old));
  return old;
end;
$$;
drop trigger if exists receipts_admin_delete_guard on public.receipts;
create trigger receipts_admin_delete_guard before delete on public.receipts
for each row execute function public.guard_receipt_deletion();

drop policy if exists receipts_delete on public.receipts;
create policy receipts_delete on public.receipts for delete to authenticated
using (public.get_my_role() = 'admin');

create or replace function public.admin_delete_receipt(p_receipt_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare deleted_id uuid;
begin
  if auth.uid() is null or public.get_my_role() is distinct from 'admin' then
    raise exception 'Only administrators can delete receipts' using errcode = '42501';
  end if;
  delete from public.receipts where id = p_receipt_id returning id into deleted_id;
  if deleted_id is null then raise exception 'Receipt no longer exists. Refresh your receipts.'; end if;
  return deleted_id;
end;
$$;
revoke all on function public.admin_delete_receipt(uuid) from public, anon;
grant execute on function public.admin_delete_receipt(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
