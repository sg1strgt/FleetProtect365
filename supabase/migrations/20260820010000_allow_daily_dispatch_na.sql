alter table public.daily_dispatch_records
  alter column dispatch_time drop not null;

alter table public.call_out_records
  alter column took_decline drop not null;
