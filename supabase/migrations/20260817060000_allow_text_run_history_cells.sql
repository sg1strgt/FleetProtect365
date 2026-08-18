alter table public.run_history_entries
  drop constraint if exists run_history_entries_from_location_check,
  drop constraint if exists run_history_entries_to_location_check,
  drop constraint if exists run_history_entries_miles_check;

alter table public.run_history_entries
  alter column miles type text using miles::text;
