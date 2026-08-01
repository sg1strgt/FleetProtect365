drop policy if exists "company settings managed by admins" on public.companies;

create policy "company settings managed by admins"
  on public.companies for update to authenticated
  using (
    exists (
      select 1
      from public.employee_profiles ep
      where ep.id = auth.uid()
        and ep.company_id = companies.id
        and ep.deleted_at is null
        and ep.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.employee_profiles ep
      where ep.id = auth.uid()
        and ep.company_id = companies.id
        and ep.deleted_at is null
        and ep.role in ('admin', 'super_admin')
    )
  );
