alter table public.homepage_content
  add column if not exists style_data jsonb not null default '{}'::jsonb;

drop function if exists public.get_public_homepage(text);

create or replace function public.get_public_homepage(p_company_code text default 'WFS')
returns table (
  id uuid,
  item_type text,
  section_key text,
  item_key text,
  title text,
  body text,
  url text,
  icon text,
  link_label text,
  sort_order integer,
  open_new_tab boolean,
  style_data jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select hc.id, hc.item_type, hc.section_key, hc.item_key, hc.title, hc.body,
         hc.url, hc.icon, hc.link_label, hc.sort_order, hc.open_new_tab,
         hc.style_data
  from public.homepage_content hc
  join public.companies c on c.id = hc.company_id
  where upper(c.company_code) = upper(p_company_code)
    and c.active is true
    and hc.active is true
    and exists (
      select 1 from public.homepage_versions hv where hv.company_id = hc.company_id
    )
  order by hc.section_key, hc.sort_order, hc.created_at;
$$;

grant execute on function public.get_public_homepage(text) to anon, authenticated;

create or replace function public.publish_homepage_content(p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_user_id uuid := auth.uid();
  v_version_id uuid;
begin
  if v_company_id is null or public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Admin access required.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then
    raise exception 'Homepage content must be an array of no more than 200 items.';
  end if;

  insert into public.homepage_versions(company_id, snapshot, created_by)
  select v_company_id,
         coalesce(jsonb_agg(to_jsonb(hc) - 'company_id' - 'created_by' - 'updated_by' order by hc.section_key, hc.sort_order, hc.created_at), '[]'::jsonb),
         v_user_id
  from public.homepage_content hc
  where hc.company_id = v_company_id
  returning id into v_version_id;

  delete from public.homepage_content where company_id = v_company_id;

  insert into public.homepage_content (
    company_id, item_type, section_key, item_key, title, body, url, icon,
    link_label, sort_order, active, open_new_tab, style_data, created_by, updated_by
  )
  select v_company_id,
         x.item_type,
         x.section_key,
         nullif(left(x.item_key, 80), ''),
         left(coalesce(x.title, ''), 180),
         nullif(left(x.body, 3000), ''),
         nullif(left(x.url, 1000), ''),
         nullif(left(x.icon, 20), ''),
         nullif(left(x.link_label, 100), ''),
         coalesce(x.sort_order, 0),
         coalesce(x.active, true),
         coalesce(x.open_new_tab, false),
         coalesce(x.style_data, '{}'::jsonb),
         v_user_id,
         v_user_id
  from jsonb_to_recordset(p_items) as x(
    item_type text, section_key text, item_key text, title text, body text,
    url text, icon text, link_label text, sort_order integer,
    active boolean, open_new_tab boolean, style_data jsonb
  );

  return v_version_id;
end;
$$;

grant execute on function public.publish_homepage_content(jsonb) to authenticated;
revoke all on function public.publish_homepage_content(jsonb) from public, anon;
