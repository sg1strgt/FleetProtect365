create table if not exists public.dispatch_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  dispatch_date date not null,
  driver_profile_id uuid not null references public.employee_profiles(id),
  driver_name text not null,
  dispatch_time time not null,
  actual_dispatched_time time not null,
  legs jsonb not null default '[]'::jsonb,
  delay_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.call_out_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  call_out_date date not null,
  driver_profile_id uuid not null references public.employee_profiles(id),
  driver_name text not null,
  reason text not null,
  took_decline boolean not null default false,
  decline_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_off_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  driver_profile_id uuid not null references public.employee_profiles(id),
  driver_name text not null,
  date_from date not null,
  date_to date not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint time_off_date_order check (date_to >= date_from)
);

create table if not exists public.daily_dispatch_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  dispatch_date date not null,
  driver_profile_id uuid not null references public.employee_profiles(id),
  driver_name text not null,
  run text not null,
  dispatch_time time not null,
  truck_number text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.location_mileage_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code_from text not null check (code_from ~ '^[0-9]{1,10}$'),
  name_from text not null,
  code_to text not null check (code_to ~ '^[0-9]{1,10}$'),
  name_to text not null,
  miles numeric(10,2) not null check (miles >= 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (company_id, code_from, code_to)
);

create index if not exists dispatch_records_company_date_idx on public.dispatch_records(company_id, dispatch_date);
create index if not exists call_out_records_company_date_idx on public.call_out_records(company_id, call_out_date);
create index if not exists time_off_requests_company_date_idx on public.time_off_requests(company_id, date_from);
create index if not exists daily_dispatch_records_company_date_idx on public.daily_dispatch_records(company_id, dispatch_date);
create index if not exists location_mileage_records_company_codes_idx on public.location_mileage_records(company_id, code_from, code_to);

alter table public.dispatch_records enable row level security;
alter table public.call_out_records enable row level security;
alter table public.time_off_requests enable row level security;
alter table public.daily_dispatch_records enable row level security;
alter table public.location_mileage_records enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['dispatch_records','call_out_records','time_off_requests','daily_dispatch_records','location_mileage_records']
  loop
    execute format('drop policy if exists %I on public.%I', table_name || ' administered by company admins', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (company_id = public.current_company_id() and public.current_user_role() in (''admin''::user_role, ''super_admin''::user_role)) with check (company_id = public.current_company_id() and public.current_user_role() in (''admin''::user_role, ''super_admin''::user_role))',
      table_name || ' administered by company admins', table_name
    );
  end loop;
end $$;
