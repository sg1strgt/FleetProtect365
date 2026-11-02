-- Company Admins can inspect staged photos too, allowing the Storage API to remove cancelled uploads.
drop policy "Admins read attached note photos" on storage.objects;
create policy "Admins read company note photo files" on storage.objects for select to authenticated using(
 bucket_id='admin-note-photos'
 and (storage.foldername(name))[1] in (select p.company_id::text from public.employee_profiles p where p.id=auth.uid() and p.role in ('admin','super_admin') and p.deleted_at is null)
);
