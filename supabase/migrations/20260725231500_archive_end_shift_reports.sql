create table if not exists public.end_shift_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  driver_id uuid not null references public.employee_profiles(id),
  employee_id text not null,
  report_id text not null unique,
  shift_date date not null,
  storage_path text not null,
  inspection_ids uuid[] not null default '{}',
  recipient_emails text[] not null default '{}',
  emailed_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.end_shift_reports enable row level security;

drop policy if exists "Admins can view company end shift reports" on public.end_shift_reports;
create policy "Admins can view company end shift reports"
  on public.end_shift_reports for select to authenticated
  using (
    company_id = current_company_id()
    and current_user_role() in ('admin'::user_role, 'super_admin'::user_role)
  );

insert into storage.buckets (id, name, public)
values ('end-shift-reports', 'end-shift-reports', false)
on conflict (id) do nothing;

drop policy if exists "Admins can download company end shift reports" on storage.objects;
create policy "Admins can download company end shift reports"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'end-shift-reports'
    and (storage.foldername(name))[1] = current_company_id()::text
    and current_user_role() in ('admin'::user_role, 'super_admin'::user_role)
  );
