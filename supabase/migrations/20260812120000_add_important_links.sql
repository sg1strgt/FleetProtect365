alter table public.company_content
  drop constraint if exists company_content_content_type_check;

alter table public.company_content
  add constraint company_content_content_type_check
  check (content_type in (
    'question_pre', 'question_post', 'question_final',
    'fmcsa', 'document', 'legal', 'important_link'
  ));

drop policy if exists "important links deleted by admins" on public.company_content;
create policy "important links deleted by admins"
on public.company_content
for delete
to authenticated
using (
  company_id = public.current_company_id()
  and content_type = 'important_link'
  and public.current_user_role() in ('admin', 'super_admin')
);
