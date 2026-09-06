do $$
declare
  v_company_id uuid;
begin
  select id into v_company_id from public.companies where upper(company_code) = 'WFS' limit 1;
  if v_company_id is null then raise exception 'WFS company not found'; end if;

  -- Keep a complete recovery point before the user-requested clean start.
  insert into public.homepage_versions(company_id, snapshot)
  select v_company_id,
         coalesce(jsonb_agg(to_jsonb(hc) - 'company_id' - 'created_by' - 'updated_by'
           order by hc.section_key, hc.sort_order, hc.created_at), '[]'::jsonb)
  from public.homepage_content hc
  where hc.company_id = v_company_id;

  delete from public.homepage_content where company_id = v_company_id;

  insert into public.homepage_content
    (company_id,item_type,section_key,item_key,title,body,url,sort_order,active,open_new_tab,style_data)
  values
    (v_company_id,'text','navigation','page_state','Page settings',null,null,0,true,false,
      '{"cutoffs":{"desktop":900,"tablet":900,"phone":900},"base_cutoffs":{"desktop":900,"tablet":900,"phone":900}}'::jsonb),
    (v_company_id,'link','navigation','header_login','Login',null,'/admin/',10,true,false,'{}'::jsonb),
    (v_company_id,'link','navigation','header_demo','Request a Demo',null,'mailto:demo@fleetprotect365.com',20,true,false,'{}'::jsonb);
end $$;

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
         coalesce(jsonb_agg(to_jsonb(hc) - 'company_id' - 'created_by' - 'updated_by'
           order by hc.section_key, hc.sort_order, hc.created_at), '[]'::jsonb),
         v_user_id
  from public.homepage_content hc
  where hc.company_id = v_company_id
  returning id into v_version_id;

  delete from public.homepage_content where company_id = v_company_id;

  insert into public.homepage_content (
    company_id,item_type,section_key,item_key,title,body,url,icon,link_label,
    sort_order,active,open_new_tab,style_data,created_by,updated_by
  )
  select v_company_id,x.item_type,x.section_key,nullif(left(x.item_key,80),''),
         left(coalesce(x.title,''),180),nullif(left(x.body,3000),''),
         nullif(left(x.url,1000),''),nullif(left(x.icon,1000),''),
         nullif(left(x.link_label,100),''),coalesce(x.sort_order,0),
         coalesce(x.active,true),coalesce(x.open_new_tab,false),
         coalesce(x.style_data,'{}'::jsonb),v_user_id,v_user_id
  from jsonb_to_recordset(p_items) as x(
    item_type text,section_key text,item_key text,title text,body text,url text,icon text,
    link_label text,sort_order integer,active boolean,open_new_tab boolean,style_data jsonb
  );
  return v_version_id;
end;
$$;

grant execute on function public.publish_homepage_content(jsonb) to authenticated;
revoke all on function public.publish_homepage_content(jsonb) from public, anon;
