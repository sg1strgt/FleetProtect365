alter table public.companies
  add column if not exists documents_drive_folder_id text;

create table if not exists public.company_private_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  legal_drive_folder_id text,
  updated_at timestamptz not null default now()
);

alter table public.company_private_settings enable row level security;

drop policy if exists "private company settings readable by super admins" on public.company_private_settings;
create policy "private company settings readable by super admins"
  on public.company_private_settings for select to authenticated
  using (
    company_id = (
      select ep.company_id from public.employee_profiles ep
      where ep.id = auth.uid() and ep.deleted_at is null and ep.role = 'super_admin'
    )
  );

drop policy if exists "private company settings managed by super admins" on public.company_private_settings;
create policy "private company settings managed by super admins"
  on public.company_private_settings for all to authenticated
  using (
    company_id = (
      select ep.company_id from public.employee_profiles ep
      where ep.id = auth.uid() and ep.deleted_at is null and ep.role = 'super_admin'
    )
  )
  with check (
    company_id = (
      select ep.company_id from public.employee_profiles ep
      where ep.id = auth.uid() and ep.deleted_at is null and ep.role = 'super_admin'
    )
  );

update public.companies
set documents_drive_folder_id = '1PvSYuLM7gibeFe92pq3GljuW6NofNAp-'
where company_code = 'WFS';

insert into public.company_private_settings (company_id, legal_drive_folder_id)
select id, '1PxT4NR3R_H0N_Tjrb6xHXcyWVr3Ng0vc'
from public.companies
where company_code = 'WFS'
on conflict (company_id) do update
set legal_drive_folder_id = excluded.legal_drive_folder_id,
    updated_at = now();
