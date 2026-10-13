-- Existing one-minute Cron job remains the retry/recovery path.
begin;
create function public.wake_push_sender() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from new_deliveries) then return null; end if;
 -- One HTTP wake-up per transaction, even when several events create alerts.
 if current_setting('app.push_wakeup_sent',true)='yes' then return null; end if;
 if to_regprocedure('public.dispatch_pending_push()') is null then return null; end if;
 begin
   perform public.dispatch_pending_push();
   perform set_config('app.push_wakeup_sent','yes',true);
 exception when others then
   -- Do not prevent a cargo/message write if the network queue is unavailable.
   -- The pending alert is retained for the scheduled recovery job.
   raise warning 'Immediate push wake-up failed; scheduled delivery will retry';
 end;
 return null;
end $$;
revoke all on function public.wake_push_sender() from public,anon,authenticated;
create trigger push_deliveries_wake after insert on public.push_deliveries
referencing new table as new_deliveries for each statement execute function public.wake_push_sender();
commit;
