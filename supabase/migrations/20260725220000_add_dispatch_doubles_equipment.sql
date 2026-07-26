alter table public.dispatch_delays
  add column if not exists dolly_number text,
  add column if not exists trailer_2_number text;
