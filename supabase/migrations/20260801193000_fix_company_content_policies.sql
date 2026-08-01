-- Use the established authenticated-user helpers for company content access.
-- Direct employee_profiles lookups inside the original policies could be hidden
-- by that table's own RLS policies, causing valid admin inserts to be rejected.

drop policy if exists "company content readable by company users"
  on public.company_content;
drop policy if exists "company content managed by admins"
  on public.company_content;
drop policy if exists "company content added by admins"
  on public.company_content;
drop policy if exists "company content updated by admins"
  on public.company_content;
drop policy if exists "company content deleted by admins"
  on public.company_content;

create policy "company content readable by company users"
  on public.company_content
  for select
  to authenticated
  using (
    company_id = public.current_company_id()
    and (
      content_type <> 'legal'
      or public.current_user_role() = 'super_admin'::public.user_role
    )
  );

create policy "company content added by admins"
  on public.company_content
  for insert
  to authenticated
  with check (
    company_id = public.current_company_id()
    and public.current_user_role() in (
      'admin'::public.user_role,
      'super_admin'::public.user_role
    )
    and (
      content_type <> 'legal'
      or public.current_user_role() = 'super_admin'::public.user_role
    )
  );

create policy "company content updated by admins"
  on public.company_content
  for update
  to authenticated
  using (
    company_id = public.current_company_id()
    and public.current_user_role() in (
      'admin'::public.user_role,
      'super_admin'::public.user_role
    )
    and (
      content_type <> 'legal'
      or public.current_user_role() = 'super_admin'::public.user_role
    )
  )
  with check (
    company_id = public.current_company_id()
    and public.current_user_role() in (
      'admin'::public.user_role,
      'super_admin'::public.user_role
    )
    and (
      content_type <> 'legal'
      or public.current_user_role() = 'super_admin'::public.user_role
    )
  );

create policy "company content deleted by admins"
  on public.company_content
  for delete
  to authenticated
  using (
    company_id = public.current_company_id()
    and public.current_user_role() in (
      'admin'::public.user_role,
      'super_admin'::public.user_role
    )
    and (
      content_type <> 'legal'
      or public.current_user_role() = 'super_admin'::public.user_role
    )
  );
