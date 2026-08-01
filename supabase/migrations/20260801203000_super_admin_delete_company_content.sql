-- Only Super Admins may permanently delete company content.
-- Admins retain update access so they can mark records inactive.

drop policy if exists "company content deleted by admins"
  on public.company_content;
drop policy if exists "company content deleted by super admins"
  on public.company_content;

create policy "company content deleted by super admins"
  on public.company_content
  for delete
  to authenticated
  using (
    company_id = public.current_company_id()
    and public.current_user_role() = 'super_admin'::public.user_role
  );
