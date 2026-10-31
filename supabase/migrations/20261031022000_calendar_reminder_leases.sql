-- Let in-flight submissions finish before expiring their lease.
create or replace function public.claim_calendar_reminders() returns setof public.admin_calendar_reminders language plpgsql security definer set search_path=public as $$
begin
 update public.admin_calendar_reminders set status='scheduled',next_attempt_at=now() where status='processing' and locked_at<now()-interval '5 minutes' and attempts<5 and remind_at>now()-interval '12 hours';
 update public.admin_calendar_reminders set status='failed',last_error='Reminder expired without confirmed submission. Set a new reminder time to try again.' where (status='scheduled' or (status='processing' and locked_at<now()-interval '5 minutes')) and (remind_at<now()-interval '12 hours' or attempts>=5);
 return query with due as (
 select r.id from public.admin_calendar_reminders r join public.admin_calendar_notes n on n.id=r.note_id and n.revision=r.revision and n.deleted_at is null
 where r.status='scheduled' and r.next_attempt_at<=now() order by r.next_attempt_at for update of r skip locked limit 5
 ) update public.admin_calendar_reminders r set status='processing',locked_at=now(),attempts=r.attempts+1 from due where r.id=due.id returning r.*;
end $$;
