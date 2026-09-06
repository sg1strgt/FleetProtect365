do $$
declare
  v_company_id uuid;
  v_snapshot jsonb;
begin
  select id into v_company_id
  from public.companies
  where upper(company_code) = 'WFS'
  limit 1;

  if v_company_id is null then
    raise exception 'WFS company not found.';
  end if;

  select snapshot into v_snapshot
  from public.homepage_versions
  where id = 'e3d2d253-cce9-4b15-b5a9-0aa738c56ae6'
    and company_id = v_company_id;

  if v_snapshot is null then
    raise exception 'Homepage recovery snapshot not found.';
  end if;

  insert into public.homepage_versions(company_id, snapshot)
  select v_company_id,
         coalesce(
           jsonb_agg(
             to_jsonb(hc) - 'company_id' - 'created_by' - 'updated_by'
             order by hc.section_key, hc.sort_order, hc.created_at
           ),
           '[]'::jsonb
         )
  from public.homepage_content hc
  where hc.company_id = v_company_id;

  delete from public.homepage_content
  where company_id = v_company_id;

  insert into public.homepage_content (
    company_id, item_type, section_key, item_key, title, body, url, icon,
    link_label, sort_order, active, open_new_tab, style_data
  )
  select v_company_id,
         x.item_type,
         x.section_key,
         nullif(left(x.item_key, 80), ''),
         left(coalesce(x.title, ''), 180),
         nullif(left(x.body, 3000), ''),
         nullif(left(x.url, 1000), ''),
         nullif(x.icon, ''),
         nullif(left(x.link_label, 100), ''),
         coalesce(x.sort_order, 0),
         coalesce(x.active, true),
         coalesce(x.open_new_tab, false),
         coalesce(x.style_data, '{}'::jsonb)
  from jsonb_to_recordset(v_snapshot) as x(
    item_type text, section_key text, item_key text, title text, body text,
    url text, icon text, link_label text, sort_order integer,
    active boolean, open_new_tab boolean, style_data jsonb
  );
end;
$$;
