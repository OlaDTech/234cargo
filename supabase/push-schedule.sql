-- Run only after configuring Edge secrets and the two Vault secrets described
-- in docs/web-push.md. No credentials belong in this file or in Git.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create or replace function public.dispatch_pending_push() returns void
language plpgsql security definer set search_path=public as $$
declare base_url text; worker_secret text;
begin
 delete from push_deliveries where created_at<now()-interval '7 days';
 delete from push_subscriptions where expires_at<=now();
 if not exists(select 1 from push_deliveries where status='pending' and available_at<=now()) then return; end if;
 select decrypted_secret into base_url from vault.decrypted_secrets where name='push_project_url';
 select decrypted_secret into worker_secret from vault.decrypted_secrets where name='push_worker_secret';
 if base_url is null or worker_secret is null then raise exception 'Push Vault configuration is missing'; end if;
 perform net.http_post(url:=base_url||'/functions/v1/push-send',
   headers:=jsonb_build_object('Content-Type','application/json','x-push-secret',worker_secret),
   body:='{}'::jsonb,timeout_milliseconds:=60000);
end $$;
revoke all on function public.dispatch_pending_push() from public,anon,authenticated;
select cron.schedule('234cargo-push','* * * * *','select public.dispatch_pending_push()');
