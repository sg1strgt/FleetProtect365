-- Calendar notes and one-shot reminders, isolated to each company's active Admins.
create table public.admin_calendar_settings (
 company_id uuid primary key references public.companies(id) on delete cascade,
 text_email text check (text_email ~ '^[0-9]{10}@vtext[.]com$'),
 time_zone text not null default 'America/Chicago' check(time_zone = 'America/Chicago')
);
insert into public.admin_calendar_settings(company_id,text_email)
select distinct company_id,'6157850344@vtext.com' from public.employee_profiles
where lower(email)='steven@fleetprotect365.com' and role='super_admin' and deleted_at is null;
create function public.can_manage_calendar(company uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.employee_profiles where id=auth.uid() and company_id=company and role in ('admin','super_admin') and status='active' and deleted_at is null)
$$;
revoke all on function public.can_manage_calendar(uuid) from public;
grant execute on function public.can_manage_calendar(uuid) to authenticated;
alter table public.admin_calendar_settings enable row level security;
create policy "Admins read calendar settings" on public.admin_calendar_settings for select to authenticated using(public.can_manage_calendar(company_id));
grant select on public.admin_calendar_settings to authenticated;

create table public.admin_calendar_notes (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 note_date date not null check(note_date between '2026-01-01' and '2027-12-31'),
 note_time time,
 title text not null check(length(btrim(title)) between 1 and 160),
 body text not null default '' check(length(body)<=5000),
 reminder_hours integer check(reminder_hours in (24,48,72,168)),
 remind_local timestamp,
 remind_at timestamptz,
 notify_email boolean not null default false,
 notify_text boolean not null default false,
 email_to text check(email_to is null or (length(email_to)<=254 and email_to ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')),
 revision integer not null default 1,
 created_by uuid not null default auth.uid() references public.employee_profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz
);
create index admin_calendar_notes_company_date on public.admin_calendar_notes(company_id,note_date) where deleted_at is null;
alter table public.admin_calendar_notes enable row level security;
create policy "Admins read calendar notes" on public.admin_calendar_notes for select to authenticated using(public.can_manage_calendar(company_id));
create policy "Admins create calendar notes" on public.admin_calendar_notes for insert to authenticated with check(public.can_manage_calendar(company_id));
create policy "Admins update calendar notes" on public.admin_calendar_notes for update to authenticated using(public.can_manage_calendar(company_id)) with check(public.can_manage_calendar(company_id));
grant select,insert,update on public.admin_calendar_notes to authenticated;

create table public.admin_calendar_reminders (
 id uuid primary key default gen_random_uuid(),
 note_id uuid not null references public.admin_calendar_notes(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 revision integer not null,
 channel text not null check(channel in ('email','text')),
 recipient text not null,
 payload jsonb not null,
 remind_at timestamptz not null,
 next_attempt_at timestamptz not null,
 status text not null default 'scheduled' check(status in ('scheduled','processing','submitted','failed','cancelled')),
 attempts integer not null default 0,
 locked_at timestamptz,
 provider_id text,
 last_error text,
 submitted_at timestamptz,
 unique(note_id,revision,channel)
);
create index admin_calendar_reminders_due on public.admin_calendar_reminders(next_attempt_at) where status='scheduled';
alter table public.admin_calendar_reminders enable row level security;
create policy "Admins read calendar reminder status" on public.admin_calendar_reminders for select to authenticated using(public.can_manage_calendar(company_id));
grant select on public.admin_calendar_reminders to authenticated;

create function public.prepare_calendar_note() returns trigger language plpgsql security definer set search_path=public as $$
declare changed boolean; settings public.admin_calendar_settings;
begin
 if tg_op='UPDATE' then
  if new.company_id<>old.company_id or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception 'The note owner cannot be changed.'; end if;
  changed := row(new.note_date,new.note_time,new.title,new.body,new.reminder_hours,new.remind_local,new.notify_email,new.notify_text,new.email_to,new.deleted_at)
      is distinct from row(old.note_date,old.note_time,old.title,old.body,old.reminder_hours,old.remind_local,old.notify_email,old.notify_text,old.email_to,old.deleted_at);
  new.revision := old.revision + case when changed then 1 else 0 end;
 else
  changed := true; new.revision := 1; new.created_by := auth.uid(); new.created_at := now();
 end if;
 new.updated_at := now();
 if new.notify_email or new.notify_text then
  if new.reminder_hours is not null then
   new.remind_at := ((new.note_date + coalesce(new.note_time,'09:00'::time)) at time zone 'America/Chicago') - make_interval(hours=>new.reminder_hours);
   new.remind_local := new.remind_at at time zone 'America/Chicago';
  else
   if new.remind_local is null then raise exception 'Choose a reminder date and time.'; end if;
   new.remind_at := new.remind_local at time zone 'America/Chicago';
  end if;
  if new.remind_at at time zone 'America/Chicago' <> new.remind_local then raise exception 'That time does not exist because of daylight saving time. Choose another time.'; end if;
  if new.notify_email and (new.email_to is null or btrim(new.email_to)='') then raise exception 'Enter an email address for the reminder.'; end if;
  if new.notify_text then
   select * into settings from public.admin_calendar_settings where company_id=new.company_id;
   if settings.text_email is null then raise exception 'A text reminder destination has not been configured for this company.'; end if;
   if new.remind_at >= '2027-03-31 00:00:00 America/Chicago'::timestamptz then raise exception 'Verizon is retiring Vtext. Use an email reminder for March 31, 2027 or later.'; end if;
  end if;
  if new.deleted_at is null and new.remind_at<=now() then
   if tg_op='INSERT' then raise exception 'The reminder must be in the future.'; end if;
   if row(new.reminder_hours,new.remind_local,new.notify_email,new.notify_text,new.email_to) is distinct from row(old.reminder_hours,old.remind_local,old.notify_email,old.notify_text,old.email_to) then raise exception 'The reminder must be in the future.'; end if;
  end if;
 else new.reminder_hours:=null; new.remind_local:=null; new.remind_at:=null; new.email_to:=null;
 end if;
 return new;
end $$;
create trigger prepare_calendar_note before insert or update on public.admin_calendar_notes for each row execute function public.prepare_calendar_note();

create function public.queue_calendar_note() returns trigger language plpgsql security definer set search_path=public as $$
declare snapshot jsonb; destination text;
begin
 if tg_op='UPDATE' and new.revision=old.revision then return new; end if;
 update public.admin_calendar_reminders set status='cancelled',last_error=null where note_id=new.id and status in ('scheduled','processing');
 if new.deleted_at is not null or new.remind_at is null or new.remind_at<=now() then return new; end if;
 snapshot:=jsonb_build_object('title',new.title,'body',new.body,'date',new.note_date,'time',new.note_time);
 if new.notify_email then
 insert into public.admin_calendar_reminders(note_id,company_id,revision,channel,recipient,payload,remind_at,next_attempt_at)
 values(new.id,new.company_id,new.revision,'email',new.email_to,snapshot,new.remind_at,new.remind_at);
 end if;
 if new.notify_text then
 select text_email into destination from public.admin_calendar_settings where company_id=new.company_id;
 insert into public.admin_calendar_reminders(note_id,company_id,revision,channel,recipient,payload,remind_at,next_attempt_at)
 values(new.id,new.company_id,new.revision,'text',destination,snapshot,new.remind_at,new.remind_at);
 end if;
 return new;
end $$;
create trigger queue_calendar_note after insert or update on public.admin_calendar_notes for each row execute function public.queue_calendar_note();

-- Only the server can claim or send reminders. Expired leases retry with the same provider idempotency key.
create function public.claim_calendar_reminders() returns setof public.admin_calendar_reminders language plpgsql security definer set search_path=public as $$
begin
 update public.admin_calendar_reminders set status='scheduled',next_attempt_at=now() where status='processing' and locked_at<now()-interval '5 minutes' and attempts<5 and remind_at>now()-interval '12 hours';
 update public.admin_calendar_reminders set status='failed',last_error='Reminder expired without confirmed submission. Set a new reminder time to try again.' where status in ('scheduled','processing') and (remind_at<now()-interval '12 hours' or attempts>=5);
 return query with due as (
 select r.id from public.admin_calendar_reminders r join public.admin_calendar_notes n on n.id=r.note_id and n.revision=r.revision and n.deleted_at is null
 where r.status='scheduled' and r.next_attempt_at<=now() order by r.next_attempt_at for update of r skip locked limit 10
 ) update public.admin_calendar_reminders r set status='processing',locked_at=now(),attempts=r.attempts+1 from due where r.id=due.id returning r.*;
end $$;
revoke all on function public.claim_calendar_reminders() from public,anon,authenticated;
grant execute on function public.claim_calendar_reminders() to service_role;
revoke all on function public.prepare_calendar_note(),public.queue_calendar_note() from public,anon,authenticated;

-- Keep the scheduler credential in Vault, never in browser assets or source control.
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'fp365_calendar_dispatch_token')
where not exists(select 1 from vault.secrets where name='fp365_calendar_dispatch_token');
create function public.authorize_calendar_dispatch(token text) returns boolean language sql stable security definer set search_path=public as $$
 select length(token)=64 and exists(select 1 from vault.decrypted_secrets where name='fp365_calendar_dispatch_token' and decrypted_secret=token)
$$;
revoke all on function public.authorize_calendar_dispatch(text) from public,anon,authenticated;
grant execute on function public.authorize_calendar_dispatch(text) to service_role;
create function public.dispatch_calendar_reminders() returns void language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.admin_calendar_reminders where (status='scheduled' and next_attempt_at<=now()) or (status='processing' and locked_at<now()-interval '5 minutes')) then
 perform net.http_post(
 url:='https://ahoejwyxfclndcbcxhwv.supabase.co/functions/v1/calendar-reminders',
 headers:=jsonb_build_object('Content-Type','application/json','X-Calendar-Token',(select decrypted_secret from vault.decrypted_secrets where name='fp365_calendar_dispatch_token')),
 body:='{}'::jsonb,timeout_milliseconds:=120000);
 end if;
end $$;
revoke all on function public.dispatch_calendar_reminders() from public,anon,authenticated;
select cron.schedule('fp365-calendar-reminders','* * * * *','select public.dispatch_calendar_reminders()');
