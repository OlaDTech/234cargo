begin;
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 endpoint text not null unique,
 p256dh text not null,
 auth text not null,
 client_id uuid references public.clients(id) on delete cascade,
 staff_id uuid references public.profiles(id) on delete cascade,
 client_session_id uuid references public.client_sessions(id) on delete cascade,
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 check ((client_id is not null and client_session_id is not null and staff_id is null) or
        (staff_id is not null and client_id is null and client_session_id is null))
);
create index on public.push_subscriptions(client_id);
create index on public.push_subscriptions(staff_id);
create table public.push_deliveries (
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
 title text not null,
 body text not null,
 created_at timestamptz not null default now(),
 available_at timestamptz not null default now(),
 attempts integer not null default 0,
 lease_token uuid,
 status text not null default 'pending' check(status in ('pending','sent','failed')),
 last_status integer
);
create index on public.push_deliveries(available_at) where status='pending';
alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;
revoke all on public.push_subscriptions,public.push_deliveries from public,anon,authenticated;
grant all on public.push_subscriptions,public.push_deliveries to service_role;

create function public.save_push_subscription(p_endpoint text,p_p256dh text,p_auth text,p_client uuid,p_staff uuid,p_session uuid,p_expiry timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare saved uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(coalesce(p_client,p_staff)::text,0));
 if p_client is not null and not exists(select 1 from client_sessions where id=p_session and client_id=p_client and expires_at>now()) then raise exception 'Invalid client session'; end if;
 if p_staff is not null and not exists(select 1 from profiles where id=p_staff and role='admin') then raise exception 'Invalid administrator'; end if;
 if not exists(select 1 from push_subscriptions where endpoint=p_endpoint) and
   (select count(*) from push_subscriptions where client_id=p_client or staff_id=p_staff)>=10 then raise exception 'Device limit reached'; end if;
 insert into push_subscriptions as s(endpoint,p256dh,auth,client_id,staff_id,client_session_id,expires_at)
 values(p_endpoint,p_p256dh,p_auth,p_client,p_staff,p_session,p_expiry)
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,client_session_id=excluded.client_session_id,expires_at=excluded.expires_at
 where s.client_id is not distinct from excluded.client_id and s.staff_id is not distinct from excluded.staff_id
 returning id into saved;
 if saved is null then raise exception 'Device belongs to another account'; end if;
end $$;
revoke all on function public.save_push_subscription(text,text,text,uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.save_push_subscription(text,text,text,uuid,uuid,uuid,timestamptz) to service_role;

create function public.enqueue_business_push() returns trigger
language plpgsql security definer set search_path=public as $$
declare recipient uuid; admins boolean:=false; heading text; message text;
begin
 if tg_table_name='containers' then
   if new.status is not distinct from old.status then return new; end if;
   insert into push_deliveries(subscription_id,title,body)
   select s.id,'Shipment update','Your shipment status has changed. Open 234Cargo for details.'
   from push_subscriptions s where s.expires_at>now()
   and exists(select 1 from goods g where g.container_id=new.id and g.client_id=s.client_id)
   and exists(select 1 from client_sessions cs where cs.id=s.client_session_id and cs.client_id=s.client_id and cs.expires_at>now());
   return new;
 end if;
 if tg_table_name='client_registrations' then
   admins:=true; heading:='New registration'; message:='A client registration is waiting for your review.';
 elsif tg_table_name='store_orders' then
   admins:=true; heading:='New store order'; message:='A customer has placed an order. Open 234Cargo to review it.';
 elsif tg_table_name='messages' then
   admins:=new.sender='client'; recipient:=new.client_id;
   heading:='New message'; message:='You have a new message in 234Cargo.';
 elsif tg_table_name='goods' then
   if tg_op='UPDATE' then
     if new.status is not distinct from old.status then return new; end if;
     heading:='Cargo update'; message:='Your cargo status has changed. Open 234Cargo for details.';
   else
     heading:='Goods recorded'; message:='New goods have been recorded for your account.';
   end if;
   recipient:=new.client_id;
 elsif tg_table_name='receipts' then
   recipient:=new.client_id; heading:='New receipt'; message:='A receipt is available in your 234Cargo account.';
 end if;
 insert into push_deliveries(subscription_id,title,body)
 select s.id,heading,message from push_subscriptions s
 where s.expires_at>now() and (
   (admins and exists(select 1 from profiles p where p.id=s.staff_id and p.role='admin')) or
   (not admins and s.client_id=recipient and exists(select 1 from client_sessions cs
     where cs.id=s.client_session_id and cs.client_id=recipient and cs.expires_at>now()))
 );
 return new;
end $$;
revoke all on function public.enqueue_business_push() from public,anon,authenticated;
create trigger registrations_push after insert on public.client_registrations for each row execute function public.enqueue_business_push();
create trigger orders_push after insert on public.store_orders for each row execute function public.enqueue_business_push();
create trigger messages_push after insert on public.messages for each row execute function public.enqueue_business_push();
create trigger goods_push after insert or update of status on public.goods for each row execute function public.enqueue_business_push();
create trigger receipts_push after insert on public.receipts for each row execute function public.enqueue_business_push();
create trigger shipments_push after update of status on public.containers for each row execute function public.enqueue_business_push();

create function public.claim_push_deliveries() returns setof public.push_deliveries
language plpgsql security definer set search_path=public as $$
begin
 delete from push_subscriptions where expires_at<=now();
 delete from push_deliveries where created_at<now()-interval '7 days';
 update push_deliveries set status='failed' where status='pending' and (attempts>=5 or created_at<now()-interval '1 day') and available_at<=now();
 return query
 with picked as (select id from push_deliveries where status='pending' and available_at<=now()
   and attempts<5 order by created_at limit 20 for update skip locked)
 update push_deliveries d set attempts=d.attempts+1,available_at=now()+interval '2 minutes',lease_token=gen_random_uuid()
 from picked where d.id=picked.id returning d.*;
end $$;
revoke all on function public.claim_push_deliveries() from public,anon,authenticated;
grant execute on function public.claim_push_deliveries() to service_role;
notify pgrst,'reload schema';
commit;
