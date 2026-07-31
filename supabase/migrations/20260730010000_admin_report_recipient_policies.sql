alter table public.report_recipients enable row level security;

drop policy if exists "Admins can view company report recipients" on public.report_recipients;
create policy "Admins can view company report recipients"
  on public.report_recipients for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.current_user_role() in ('admin', 'super_admin')
  );

drop policy if exists "Admins can add company report recipients" on public.report_recipients;
create policy "Admins can add company report recipients"
  on public.report_recipients for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.current_user_role() in ('admin', 'super_admin')
  );

drop policy if exists "Admins can update company report recipients" on public.report_recipients;
create policy "Admins can update company report recipients"
  on public.report_recipients for update to authenticated
  using (
    company_id = public.current_company_id()
    and public.current_user_role() in ('admin', 'super_admin')
  )
  with check (
    company_id = public.current_company_id()
    and public.current_user_role() in ('admin', 'super_admin')
  );
