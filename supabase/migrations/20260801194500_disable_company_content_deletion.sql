-- Company content is retained for auditability. Admins can deactivate an item
-- instead of permanently deleting it.

drop policy if exists "company content deleted by admins"
  on public.company_content;
