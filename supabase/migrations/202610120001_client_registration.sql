begin;
create table public.client_registrations (
 id uuid primary key default gen_random_uuid(),
 full_name text not null check(length(full_name) between 2 and 120),
 phone text not null check(phone ~ '^\+[1-9][0-9]{7,14}$'),
 country text not null check(length(country) between 2 and 80),
 state text not null check(length(state) between 2 and 100),
 password_hash text,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 client_id uuid references public.clients(id),
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index client_registration_pending_phone on public.client_registrations(phone) where status='pending';
alter table public.client_registrations enable row level security;
revoke all on public.client_registrations from public, anon, authenticated;
grant select(id,full_name,phone,country,state,status,client_id,reviewed_by,reviewed_at,created_at) on public.client_registrations to authenticated;
create policy registration_admin_read on public.client_registrations for select to authenticated using(public.get_my_role()='admin');

create table public.registration_rate_limits (
 key text primary key,
 window_start timestamptz not null default now(),
 attempts integer not null default 1
);
alter table public.registration_rate_limits enable row level security;
revoke all on public.registration_rate_limits from public,anon,authenticated;
create function public.registration_allow_attempt(p_key text) returns boolean
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 delete from registration_rate_limits where window_start < now()-interval '1 day';
 insert into registration_rate_limits as r(key) values(p_key)
 on conflict(key) do update set
 attempts=case when r.window_start<now()-interval '1 hour' then 1 else r.attempts+1 end,
 window_start=case when r.window_start<now()-interval '1 hour' then now() else r.window_start end
 returning attempts into n;
 return n<=5;
end $$;
revoke all on function public.registration_allow_attempt(text) from public,anon,authenticated;
grant execute on function public.registration_allow_attempt(text) to service_role;

create function public.submit_client_registration(p_name text,p_phone text,p_country text,p_state text,p_hash text)
returns void language plpgsql security definer set search_path=public as $$
begin
 -- Generic response for both existing customers and duplicate applications.
 if exists(select 1 from clients where right(regexp_replace(phone,'[^0-9]','','g'),10)=right(p_phone,10)) then return; end if;
 if p_hash !~ '^\$2[aby]\$' then raise exception 'Invalid password hash'; end if;
 insert into client_registrations(full_name,phone,country,state,password_hash)
 values(p_name,p_phone,p_country,p_state,p_hash)
 on conflict(phone) where status='pending' do nothing;
end $$;
revoke all on function public.submit_client_registration(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_client_registration(text,text,text,text,text) to service_role;

create sequence public.registration_shipping_mark_seq;
create function public.review_client_registration(p_id uuid,p_approve boolean) returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.client_registrations; v_client uuid; v_mark text; v_seq text;
begin
 if auth.uid() is null or public.get_my_role() is distinct from 'admin' then raise exception 'Only administrators can review registrations' using errcode='42501'; end if;
 if p_approve is null then raise exception 'Choose approve or reject'; end if;
 select * into r from client_registrations where id=p_id for update;
 if not found or r.status<>'pending' then raise exception 'This request has already been reviewed or no longer exists'; end if;
 if p_approve then
   -- Serialize with manual customer inserts while checking existing phone records.
   lock table public.clients in share row exclusive mode;
   if exists(select 1 from clients where right(regexp_replace(phone,'[^0-9]','','g'),10)=right(r.phone,10)) then
     raise exception 'An existing customer uses this phone. Reject this request and help them access their existing account.';
   end if;
   loop
     v_seq := nextval('registration_shipping_mark_seq')::text;
     v_mark := 'MY-R' || lpad(v_seq,greatest(6,length(v_seq)),'0');
     exit when not exists(select 1 from clients where shipping_mark=v_mark);
   end loop;
   insert into clients(full_name,phone,country,state,password_hash,shipping_mark,created_by)
   values(r.full_name,r.phone,r.country,r.state,r.password_hash,v_mark,auth.uid()) returning id into v_client;
 end if;
 update client_registrations set status=case when p_approve then 'approved' else 'rejected' end,
 password_hash=null,client_id=v_client,reviewed_by=auth.uid(),reviewed_at=now() where id=p_id;
 return v_client;
end $$;
revoke all on function public.review_client_registration(uuid,boolean) from public,anon;
grant execute on function public.review_client_registration(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
