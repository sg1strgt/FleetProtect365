alter table public.companies
  add column if not exists address_street text,
  add column if not exists address_suite text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists address_zip text,
  add column if not exists admin_notes text,
  add column if not exists logo_url text,
  add column if not exists logo_scale integer not null default 100;

alter table public.companies
  drop constraint if exists companies_admin_notes_length,
  add constraint companies_admin_notes_length
    check (admin_notes is null or char_length(admin_notes) <= 750),
  drop constraint if exists companies_logo_scale_range,
  add constraint companies_logo_scale_range
    check (logo_scale between 50 and 150);

create table if not exists public.company_content (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  content_type text not null check (content_type in (
    'question_pre', 'question_post', 'question_final',
    'fmcsa', 'document', 'legal'
  )),
  title text not null,
  body text,
  url text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid references public.employee_profiles(id),
  updated_by uuid references public.employee_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_content_company_type_idx
  on public.company_content(company_id, content_type, active, sort_order);

alter table public.company_content enable row level security;

drop policy if exists "company content readable by company users" on public.company_content;
create policy "company content readable by company users"
  on public.company_content for select to authenticated
  using (
    company_id = (
      select ep.company_id from public.employee_profiles ep
      where ep.id = auth.uid() and ep.deleted_at is null
    )
    and (
      content_type <> 'legal'
      or exists (
        select 1 from public.employee_profiles ep
        where ep.id = auth.uid() and ep.role = 'super_admin'
      )
    )
  );

drop policy if exists "company content managed by admins" on public.company_content;
create policy "company content managed by admins"
  on public.company_content for all to authenticated
  using (
    company_id = (
      select ep.company_id from public.employee_profiles ep
      where ep.id = auth.uid() and ep.deleted_at is null
        and ep.role in ('admin', 'super_admin')
    )
    and (
      content_type <> 'legal'
      or exists (
        select 1 from public.employee_profiles ep
        where ep.id = auth.uid() and ep.role = 'super_admin'
      )
    )
  )
  with check (
    company_id = (
      select ep.company_id from public.employee_profiles ep
      where ep.id = auth.uid() and ep.deleted_at is null
        and ep.role in ('admin', 'super_admin')
    )
    and (
      content_type <> 'legal'
      or exists (
        select 1 from public.employee_profiles ep
        where ep.id = auth.uid() and ep.role = 'super_admin'
      )
    )
  );

insert into storage.buckets (id, name, public)
values ('company-assets', 'company-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "company logos readable" on storage.objects;
create policy "company logos readable"
  on storage.objects for select
  using (bucket_id = 'company-assets');

drop policy if exists "company logos managed by admins" on storage.objects;
create policy "company logos managed by admins"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = (
      select ep.company_id::text from public.employee_profiles ep
      where ep.id = auth.uid() and ep.deleted_at is null
        and ep.role in ('admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = (
      select ep.company_id::text from public.employee_profiles ep
      where ep.id = auth.uid() and ep.deleted_at is null
        and ep.role in ('admin', 'super_admin')
    )
  );
