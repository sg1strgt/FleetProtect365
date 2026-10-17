create table public.admin_note_updates (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.admin_notes(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  update_date date not null default current_date,
  category text not null check (category in ('General','Important','Urgent','Escalate','Resolved','Completed','Other')),
  previous_category text not null,
  body text not null check (char_length(body) between 1 and 3000 and length(btrim(body)) > 0),
  created_by uuid not null references public.employee_profiles(id),
  author_name text not null,
  created_at timestamptz not null default now()
);
create index admin_note_updates_note_created_idx on public.admin_note_updates(note_id, created_at, id);
alter table public.admin_note_updates enable row level security;
create policy "Company admins read note updates" on public.admin_note_updates for select to authenticated
using (exists (select 1 from public.employee_profiles ep where ep.id=auth.uid() and ep.company_id=admin_note_updates.company_id and ep.deleted_at is null and ep.role in ('admin','super_admin')));
create policy "Company admins add note updates" on public.admin_note_updates for insert to authenticated
with check (created_by=auth.uid() and exists (select 1 from public.employee_profiles ep where ep.id=auth.uid() and ep.company_id=admin_note_updates.company_id and ep.deleted_at is null and ep.role in ('admin','super_admin')));
-- Set authorship from the authenticated session and lock the parent so concurrent
-- updates record the previous category accurately. All changes share one transaction.
create function public.prepare_admin_note_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare parent public.admin_notes; author public.employee_profiles;
begin
 select * into author from public.employee_profiles where id=auth.uid() and deleted_at is null and role in ('admin','super_admin');
 if not found then raise exception 'Admin access required'; end if;
 select * into parent from public.admin_notes where id=new.note_id and company_id=author.company_id for update;
 if not found then raise exception 'Note not found or access denied'; end if;
 new.company_id := parent.company_id;
 new.previous_category := parent.category;
 new.created_by := author.id;
 new.author_name := coalesce(nullif(btrim(author.full_name),''), 'Admin');
 new.created_at := clock_timestamp();
 return new;
end $$;
create trigger prepare_admin_note_update before insert on public.admin_note_updates
for each row execute function public.prepare_admin_note_update();
create function public.apply_admin_note_update_category() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 update public.admin_notes set category=new.category, updated_at=new.created_at where id=new.note_id and company_id=new.company_id;
 if not found then raise exception 'Note not found or access denied'; end if;
 return new;
end $$;
create trigger apply_admin_note_update_category after insert on public.admin_note_updates
for each row execute function public.apply_admin_note_update_category();
revoke all on public.admin_note_updates from anon, authenticated;
grant select, insert on public.admin_note_updates to authenticated;
revoke all on function public.prepare_admin_note_update() from public;
revoke all on function public.apply_admin_note_update_category() from public;
