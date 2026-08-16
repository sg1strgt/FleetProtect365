alter table public.dispatch_records
  add column if not exists truck_number text,
  add column if not exists notes text;

alter table public.dispatch_records
  drop constraint if exists dispatch_records_notes_length_check;

alter table public.dispatch_records
  add constraint dispatch_records_notes_length_check
  check (notes is null or char_length(notes) <= 500);
