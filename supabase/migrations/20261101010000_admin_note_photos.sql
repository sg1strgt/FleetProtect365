-- Private photos are committed atomically with their note or immutable update.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('admin-note-photos','admin-note-photos',false,10485760,array['image/jpeg']) on conflict(id) do nothing;
create table public.admin_note_photos (
 id uuid primary key,
 company_id uuid not null references public.companies(id) on delete cascade,
 note_id uuid not null references public.admin_notes(id) on delete cascade,
 update_id uuid references public.admin_note_updates(id) on delete cascade,
 storage_path text not null unique,
 file_name text not null check(length(file_name) between 1 and 250),
 byte_size integer not null check(byte_size between 1 and 10485760),
 created_by uuid not null default auth.uid() references public.employee_profiles(id),
 created_at timestamptz not null default now()
);
create index admin_note_photos_note_idx on public.admin_note_photos(note_id,created_at,id);
alter table public.admin_note_photos enable row level security;
create function public.can_manage_note_photos(company uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.employee_profiles p where p.id=auth.uid() and p.company_id=company and p.role in ('admin','super_admin') and p.deleted_at is null)
$$;
revoke all on function public.can_manage_note_photos(uuid) from public;
grant execute on function public.can_manage_note_photos(uuid) to authenticated;
create policy "Admins read company note photos" on public.admin_note_photos for select to authenticated using(public.can_manage_note_photos(company_id));
revoke all on public.admin_note_photos from public,anon,authenticated;
grant select on public.admin_note_photos to authenticated;
-- Only validated UUID prefixes may be uploaded, and the image bucket accepts JPEGs only.
create policy "Admins upload staged note photos" on storage.objects for insert to authenticated with check(
 bucket_id='admin-note-photos' and array_length(storage.foldername(name),1)=2
 and (storage.foldername(name))[1] in (select p.company_id::text from public.employee_profiles p where p.id=auth.uid() and p.role in ('admin','super_admin') and p.deleted_at is null)
 and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$' and storage.filename(name) ~ '^[0-9a-f-]{36}[.]jpg$'
);
create policy "Admins read attached note photos" on storage.objects for select to authenticated using(
 bucket_id='admin-note-photos' and exists(select 1 from public.admin_note_photos p where p.storage_path=name and public.can_manage_note_photos(p.company_id))
);
-- Attached images must first be removed by the note transaction. Staged uploads can be discarded.
create policy "Admins clean unattached note photos" on storage.objects for delete to authenticated using(
 bucket_id='admin-note-photos'
 and (storage.foldername(name))[1] in (select p.company_id::text from public.employee_profiles p where p.id=auth.uid() and p.role in ('admin','super_admin') and p.deleted_at is null)
 and not exists(select 1 from public.admin_note_photos p where p.storage_path=name)
);
create table public.admin_note_save_requests (
 id uuid primary key,
 company_id uuid not null references public.companies(id) on delete cascade,
 created_by uuid not null references public.employee_profiles(id),
 note_id uuid not null references public.admin_notes(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.admin_note_save_requests enable row level security;
revoke all on public.admin_note_save_requests from public,anon,authenticated;
create function public.save_admin_note_with_photos(
 operation_id uuid, target_note_id uuid, save_mode text, target_date date, target_category text, target_body text,
 new_photos jsonb default '[]'::jsonb, removed_photo_ids uuid[] default '{}'::uuid[], expected_updated_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare author public.employee_profiles; parent public.admin_notes; update_record_id uuid; item jsonb; photo_id uuid; path text; removed_paths text[]; amount integer;
begin
 select * into author from public.employee_profiles where id=auth.uid() and role in ('admin','super_admin') and deleted_at is null;
 if not found then raise exception 'Admin access required.';end if;
 if operation_id is null or target_note_id is null or save_mode not in ('create','edit','update') or save_mode is null then raise exception 'Invalid note request.';end if;
 perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
 if exists(select 1 from public.admin_note_save_requests where id=operation_id and created_by=author.id and note_id=target_note_id and company_id=author.company_id) then return jsonb_build_object('note_id',target_note_id,'already_saved',true);end if;
 if jsonb_typeof(new_photos) is distinct from 'array' or jsonb_array_length(new_photos)>10 then raise exception 'Choose no more than 10 photos.';end if;
 if save_mode='create' then
  insert into public.admin_notes(id,company_id,note_date,category,body,created_by) values(target_note_id,author.company_id,target_date,target_category,target_body,author.id) returning * into parent;
 else
  select * into parent from public.admin_notes where id=target_note_id and company_id=author.company_id for update;
  if not found then raise exception 'Note not found or access denied.';end if;
  if save_mode='edit' and (expected_updated_at is null or parent.updated_at is distinct from expected_updated_at) then raise exception 'This note changed in another session. Cancel, refresh Notes, and try again.';end if;
  if save_mode='edit' then update public.admin_notes set note_date=target_date,category=target_category,body=target_body,updated_at=clock_timestamp() where id=parent.id returning * into parent;
  else
   insert into public.admin_note_updates(note_id,company_id,update_date,category,previous_category,body,created_by,author_name) values(parent.id,author.company_id,target_date,target_category,parent.category,target_body,author.id,author.full_name) returning id into update_record_id;
  end if;
 end if;
 if coalesce(cardinality(removed_photo_ids),0)>0 then
  if save_mode<>'edit' then raise exception 'Existing photos can only be removed when editing their original note.';end if;
  if exists(select 1 from unnest(removed_photo_ids) r(id) where not exists(select 1 from public.admin_note_photos p where p.id=r.id and p.note_id=parent.id and p.update_id is null and p.company_id=author.company_id)) then raise exception 'Photo not found or access denied.';end if;
  select array_agg(storage_path) into removed_paths from public.admin_note_photos where id=any(removed_photo_ids) and note_id=parent.id;
  delete from public.admin_note_photos where id=any(removed_photo_ids) and note_id=parent.id and update_id is null;
 end if;
 select count(*) into amount from public.admin_note_photos where note_id=parent.id and update_id is not distinct from update_record_id;
 if amount+jsonb_array_length(new_photos)>10 then raise exception 'Each note or update can have up to 10 photos.';end if;
 for item in select * from jsonb_array_elements(new_photos) loop
  photo_id:=(item->>'id')::uuid;path:=author.company_id::text||'/'||parent.id::text||'/'||photo_id::text||'.jpg';
  if not exists(select 1 from storage.objects where bucket_id='admin-note-photos' and name=path and owner_id=author.id::text) then raise exception 'A photo has not finished uploading. Retry Save.';end if;
  insert into public.admin_note_photos(id,company_id,note_id,update_id,storage_path,file_name,byte_size,created_by) values(photo_id,author.company_id,parent.id,update_record_id,path,left(item->>'file_name',250),(item->>'byte_size')::integer,author.id);
 end loop;
 insert into public.admin_note_save_requests(id,company_id,created_by,note_id) values(operation_id,author.company_id,author.id,parent.id);
 return jsonb_build_object('note_id',parent.id,'removed_paths',coalesce(removed_paths,'{}'::text[]));
end $$;
revoke all on function public.save_admin_note_with_photos(uuid,uuid,text,date,text,text,jsonb,uuid[],timestamptz) from public,anon;
grant execute on function public.save_admin_note_with_photos(uuid,uuid,text,date,text,text,jsonb,uuid[],timestamptz) to authenticated;
