alter table public.end_shift_reports
  add column if not exists drive_file_id text,
  add column if not exists drive_web_view_link text,
  add column if not exists drive_status text not null default 'pending',
  add column if not exists drive_uploaded_at timestamptz,
  add column if not exists drive_error text;

create index if not exists end_shift_reports_drive_status_idx
  on public.end_shift_reports (drive_status);
