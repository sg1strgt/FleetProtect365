alter table public.run_history_entries
  alter column from_location drop not null,
  alter column to_location drop not null,
  alter column miles drop not null;
