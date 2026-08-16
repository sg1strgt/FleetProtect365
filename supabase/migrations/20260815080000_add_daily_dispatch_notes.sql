alter table public.daily_dispatch_records
  add column if not exists notes text;

alter table public.daily_dispatch_records
  drop constraint if exists daily_dispatch_records_notes_length_check;

alter table public.daily_dispatch_records
  add constraint daily_dispatch_records_notes_length_check
  check (notes is null or char_length(notes) <= 500);
