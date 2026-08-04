alter table public.inspections
  add column if not exists flag_resolved_at timestamptz,
  add column if not exists flag_resolved_by uuid references public.employee_profiles(id) on delete set null,
  add column if not exists flag_resolution_note text;

alter table public.inspections
  drop constraint if exists inspections_flag_resolution_note_length;

alter table public.inspections
  add constraint inspections_flag_resolution_note_length
  check (flag_resolution_note is null or char_length(flag_resolution_note) <= 1000);

create or replace function public.resolve_inspection_flag(
  p_inspection_id uuid,
  p_resolution_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.employee_profiles%rowtype;
begin
  select * into actor
  from public.employee_profiles
  where id = auth.uid()
    and deleted_at is null;

  if actor.id is null or actor.role not in ('admin', 'super_admin') then
    raise exception 'Admin access is required.';
  end if;

  if nullif(btrim(p_resolution_note), '') is null then
    raise exception 'A resolution note is required.';
  end if;

  update public.inspections
  set flag_resolved_at = now(),
      flag_resolved_by = actor.id,
      flag_resolution_note = left(btrim(p_resolution_note), 1000)
  where id = p_inspection_id
    and company_id = actor.company_id
    and (has_bypass is true or lower(coalesce(status::text, '')) = 'flagged')
    and flag_resolved_at is null;

  if not found then
    raise exception 'This unresolved flagged inspection could not be found.';
  end if;
end;
$$;

revoke all on function public.resolve_inspection_flag(uuid, text) from public;
grant execute on function public.resolve_inspection_flag(uuid, text) to authenticated;
