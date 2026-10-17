create table public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  note_date date not null default current_date,
  category text not null default 'General' check (category in ('General','Important','Urgent','Escalate','Resolved','Completed','Other')),
  body text not null check (char_length(body) between 1 and 3000 and length(btrim(body)) > 0),
  created_by uuid not null default auth.uid() references public.employee_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index admin_notes_company_date_idx on public.admin_notes(company_id, note_date desc);
alter table public.admin_notes enable row level security;
create policy "Company admins manage notes" on public.admin_notes for all to authenticated
using (exists (select 1 from public.employee_profiles ep where ep.id = auth.uid() and ep.company_id = admin_notes.company_id and ep.deleted_at is null and ep.role in ('admin','super_admin')))
with check (exists (select 1 from public.employee_profiles ep where ep.id = auth.uid() and ep.company_id = admin_notes.company_id and ep.deleted_at is null and ep.role in ('admin','super_admin')));
grant select, insert, update, delete on public.admin_notes to authenticated;
