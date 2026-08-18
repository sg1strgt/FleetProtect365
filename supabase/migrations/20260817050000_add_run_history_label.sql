alter table public.run_history_entries
  add column if not exists run_label text;
