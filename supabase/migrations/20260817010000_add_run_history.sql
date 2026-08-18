create table if not exists public.run_history_drivers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  driver_name text not null,
  cbr text not null check (cbr ~ '^[0-9]{1,20}$'),
  fedex_id text not null check (fedex_id ~ '^[0-9]{1,20}$'),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (company_id, cbr),
  unique (company_id, fedex_id)
);

create table if not exists public.run_history_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  run_history_driver_id uuid not null references public.run_history_drivers(id) on delete cascade,
  run_date date not null,
  line_number smallint not null check (line_number between 1 and 3),
  from_location text not null check (from_location ~ '^[0-9]{1,10}$'),
  to_location text not null check (to_location ~ '^[0-9]{1,10}$'),
  miles numeric(10,2) not null check (miles >= 0),
  archived_at timestamptz,
  archive_batch_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (run_history_driver_id, run_date, line_number)
);

create table if not exists public.run_history_day_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  run_history_driver_id uuid not null references public.run_history_drivers(id) on delete cascade,
  run_date date not null,
  visible_lines smallint not null default 3 check (visible_lines between 1 and 3),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (run_history_driver_id, run_date)
);

create index if not exists run_history_entries_company_date_idx on public.run_history_entries(company_id, run_date desc);
create index if not exists run_history_entries_archive_idx on public.run_history_entries(company_id, archived_at, run_date desc);
create index if not exists run_history_drivers_company_name_idx on public.run_history_drivers(company_id, driver_name);

alter table public.run_history_drivers enable row level security;
alter table public.run_history_entries enable row level security;
alter table public.run_history_day_settings enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['run_history_drivers','run_history_entries','run_history_day_settings']
  loop
    execute format('drop policy if exists %I on public.%I', table_name || ' administered by company admins', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (company_id = public.current_company_id() and public.current_user_role() in (''admin''::user_role, ''super_admin''::user_role)) with check (company_id = public.current_company_id() and public.current_user_role() in (''admin''::user_role, ''super_admin''::user_role))',
      table_name || ' administered by company admins', table_name
    );
  end loop;
end $$;
