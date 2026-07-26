create table if not exists public.dispatch_delays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  dispatch_date date not null,
  run_number integer not null check (run_number > 0),
  driver_profile_id uuid not null references public.employee_profiles(id),
  employee_id text not null,
  driver_name text not null,
  truck_id uuid not null references public.trucks(id),
  truck_number text not null,
  trailer_number text not null,
  location_from text not null,
  location_to text not null,
  scheduled_dispatch time not null,
  actual_dispatch time not null,
  delay_minutes integer not null default 0 check (delay_minutes >= 0),
  delay_reason text not null,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  deleted_by uuid references auth.users(id),
  deleted_at timestamptz
);

alter table public.dispatch_delays
  add column if not exists run_number integer,
  add column if not exists location_from text,
  add column if not exists location_to text,
  add column if not exists deleted_by uuid references auth.users(id);

update public.dispatch_delays
set run_number = 1
where run_number is null;

alter table public.dispatch_delays
  alter column run_number set not null;

create unique index if not exists dispatch_delays_company_driver_run_unique
  on public.dispatch_delays (company_id, dispatch_date, driver_profile_id, run_number)
  where deleted_at is null;

alter table public.dispatch_delays enable row level security;

drop policy if exists "Admins can view company dispatch delays" on public.dispatch_delays;
create policy "Admins can view company dispatch delays"
  on public.dispatch_delays for select to authenticated
  using (
    company_id = current_company_id()
    and current_user_role() in ('admin'::user_role, 'super_admin'::user_role)
  );

drop policy if exists "Admins can insert company dispatch delays" on public.dispatch_delays;
create policy "Admins can insert company dispatch delays"
  on public.dispatch_delays for insert to authenticated
  with check (
    company_id = current_company_id()
    and current_user_role() in ('admin'::user_role, 'super_admin'::user_role)
  );

drop policy if exists "Admins can update company dispatch delays" on public.dispatch_delays;
create policy "Admins can update company dispatch delays"
  on public.dispatch_delays for update to authenticated
  using (
    company_id = current_company_id()
    and current_user_role() in ('admin'::user_role, 'super_admin'::user_role)
  )
  with check (
    company_id = current_company_id()
    and current_user_role() in ('admin'::user_role, 'super_admin'::user_role)
  );
