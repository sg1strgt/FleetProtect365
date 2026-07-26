drop index if exists public.end_shift_reports_report_id_key;

create unique index end_shift_reports_report_id_key
  on public.end_shift_reports (report_id);
