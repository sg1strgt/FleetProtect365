create table if not exists public.dispatch_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_daily_id uuid references public.daily_dispatch_records(id) on delete set null,
  leg_number smallint not null default 1 check (leg_number between 1 and 3),
  dispatch_date date not null,
  driver_profile_id uuid not null references public.employee_profiles(id),
  driver_name text not null,
  run text not null,
  dispatch_time time,
  truck_number text not null,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint dispatch_log_notes_length_check check (notes is null or char_length(notes) <= 500),
  constraint dispatch_log_source_leg_unique unique (company_id, source_daily_id, leg_number)
);

create index if not exists dispatch_log_company_date_idx
  on public.dispatch_log(company_id, dispatch_date desc, created_at desc);

alter table public.dispatch_log enable row level security;

drop policy if exists "dispatch_log administered by company admins" on public.dispatch_log;
create policy "dispatch_log administered by company admins"
  on public.dispatch_log
  for all
  to authenticated
  using (
    company_id = public.current_company_id()
    and public.current_user_role() in ('admin'::user_role, 'super_admin'::user_role)
  )
  with check (
    company_id = public.current_company_id()
    and public.current_user_role() in ('admin'::user_role, 'super_admin'::user_role)
  );
