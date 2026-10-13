begin;
-- Keep only activity timestamps here, never expose session credentials.
create table public.client_presence (
  client_id uuid primary key references public.clients(id) on delete cascade,
  last_seen_at timestamptz not null
);
alter table public.client_presence enable row level security;
revoke all on public.client_presence from public, anon, authenticated;

insert into public.client_presence(client_id,last_seen_at)
select client_id,max(last_seen_at) from public.client_sessions
where last_seen_at is not null group by client_id;

create function public.record_client_presence() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.last_seen_at is not null then
    insert into public.client_presence(client_id,last_seen_at) values(new.client_id,new.last_seen_at)
    on conflict(client_id) do update
    set last_seen_at=greatest(client_presence.last_seen_at,excluded.last_seen_at);
  end if;
  return new;
end $$;
revoke all on function public.record_client_presence() from public,anon,authenticated;
create trigger client_activity_record after insert or update of last_seen_at on public.client_sessions
for each row execute function public.record_client_presence();

create function public.admin_client_presence()
returns table(client_id uuid,last_seen_at timestamptz,is_online boolean)
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or public.get_my_role() is distinct from 'admin' then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  return query select p.client_id,p.last_seen_at,exists(
    select 1 from public.client_sessions s where s.client_id=p.client_id
      and s.expires_at>now() and s.last_seen_at>now()-interval '60 seconds'
  ) from public.client_presence p;
end $$;
revoke all on function public.admin_client_presence() from public,anon;
grant execute on function public.admin_client_presence() to authenticated;
notify pgrst,'reload schema';
commit;
