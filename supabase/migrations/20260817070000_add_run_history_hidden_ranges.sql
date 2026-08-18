create table if not exists public.run_history_hidden_ranges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  date_from date not null,
  date_to date not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (date_to >= date_from)
);

create index if not exists run_history_hidden_ranges_company_dates_idx
  on public.run_history_hidden_ranges(company_id, date_from, date_to);

alter table public.run_history_hidden_ranges enable row level security;

drop policy if exists "run_history_hidden_ranges administered by company admins"
  on public.run_history_hidden_ranges;

create policy "run_history_hidden_ranges administered by company admins"
  on public.run_history_hidden_ranges for all to authenticated
  using (
    company_id = public.current_company_id()
    and public.current_user_role() in ('admin'::user_role, 'super_admin'::user_role)
  )
  with check (
    company_id = public.current_company_id()
    and public.current_user_role() in ('admin'::user_role, 'super_admin'::user_role)
  );
