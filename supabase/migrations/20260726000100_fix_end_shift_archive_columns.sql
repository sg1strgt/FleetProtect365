alter table public.end_shift_reports
  add column if not exists report_id text,
  add column if not exists storage_path text,
  add column if not exists emailed_at timestamptz;

create unique index if not exists end_shift_reports_report_id_key
  on public.end_shift_reports (report_id)
  where report_id is not null;
