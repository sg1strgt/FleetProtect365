alter table public.run_history_drivers
  add column if not exists phone text;

alter table public.run_history_drivers
  drop constraint if exists run_history_drivers_phone_format_check;

alter table public.run_history_drivers
  add constraint run_history_drivers_phone_format_check
  check (phone is null or phone ~ '^\([0-9]{3}\)-[0-9]{3}-[0-9]{4}$');
