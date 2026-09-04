create table if not exists public.homepage_content (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  item_type text not null check (item_type in ('text', 'card', 'link')),
  section_key text not null check (section_key in ('hero', 'features', 'resources', 'dashboard', 'mobile', 'documents', 'navigation')),
  item_key text,
  title text not null default '',
  body text,
  url text,
  icon text,
  link_label text,
  sort_order integer not null default 0,
  active boolean not null default true,
  open_new_tab boolean not null default false,
  created_by uuid references public.employee_profiles(id),
  updated_by uuid references public.employee_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists homepage_content_company_key_idx
  on public.homepage_content(company_id, item_key)
  where item_key is not null;

create index if not exists homepage_content_public_idx
  on public.homepage_content(company_id, active, section_key, sort_order);

create table if not exists public.homepage_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot jsonb not null,
  created_by uuid references public.employee_profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists homepage_versions_company_created_idx
  on public.homepage_versions(company_id, created_at desc);

alter table public.homepage_content enable row level security;
alter table public.homepage_versions enable row level security;

drop policy if exists "homepage content managed by admins" on public.homepage_content;
create policy "homepage content managed by admins"
  on public.homepage_content for all to authenticated
  using (
    company_id = public.current_company_id()
    and public.current_user_role() in ('admin', 'super_admin')
  )
  with check (
    company_id = public.current_company_id()
    and public.current_user_role() in ('admin', 'super_admin')
  );

drop policy if exists "homepage versions readable by admins" on public.homepage_versions;
create policy "homepage versions readable by admins"
  on public.homepage_versions for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.current_user_role() in ('admin', 'super_admin')
  );

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
  open_new_tab boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select hc.id, hc.item_type, hc.section_key, hc.item_key, hc.title, hc.body,
         hc.url, hc.icon, hc.link_label, hc.sort_order, hc.open_new_tab
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
    link_label, sort_order, active, open_new_tab, created_by, updated_by
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
         v_user_id,
         v_user_id
  from jsonb_to_recordset(p_items) as x(
    item_type text, section_key text, item_key text, title text, body text,
    url text, icon text, link_label text, sort_order integer,
    active boolean, open_new_tab boolean
  );

  return v_version_id;
end;
$$;

grant execute on function public.publish_homepage_content(jsonb) to authenticated;
revoke all on function public.publish_homepage_content(jsonb) from public, anon;

create or replace function public.restore_homepage_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_snapshot jsonb;
begin
  if v_company_id is null or public.current_user_role() not in ('admin', 'super_admin') then
    raise exception 'Admin access required.';
  end if;
  select snapshot into v_snapshot
  from public.homepage_versions
  where id = p_version_id and company_id = v_company_id;
  if v_snapshot is null then raise exception 'Homepage version not found.'; end if;
  perform public.publish_homepage_content(v_snapshot);
end;
$$;

grant execute on function public.restore_homepage_version(uuid) to authenticated;
revoke all on function public.restore_homepage_version(uuid) from public, anon;

with wfs as (select id from public.companies where upper(company_code) = 'WFS' limit 1)
insert into public.homepage_content
  (company_id, item_type, section_key, item_key, title, body, url, icon, link_label, sort_order, active, open_new_tab)
select wfs.id, v.item_type, v.section_key, v.item_key, v.title, v.body, v.url, v.icon, v.link_label, v.sort_order, true, v.open_new_tab
from wfs
cross join (values
  ('text','hero','hero_eyebrow','The #1 Compliance Platform for Modern Fleets',null,null,null,null,10,false),
  ('text','hero','hero_title','Complete Compliance.','Every Connection.','',null,null,20,false),
  ('text','hero','hero_accent','Every Day.',null,null,null,null,30,false),
  ('text','hero','hero_body','Fleet Protect 365 is the most advanced platform for photo documentation, inspections, and compliance reporting for fleets running singles, doubles, and beyond.',null,null,null,null,40,false),
  ('text','hero','hero_button','Request a Demo',null,'mailto:demo@fleetprotect365.com',null,null,50,false),
  ('card','features',null,'FMCSA Compliant','Stay audit-ready, always.',null,'♢',null,10,false),
  ('card','features',null,'Cloud Based','Secure. Scalable. Reliable.',null,'☁',null,20,false),
  ('card','features',null,'Mobile First','Built for drivers on the go.',null,'▯',null,30,false),
  ('card','features',null,'All Connections','Tractor to trailer to dolly to trailer.',null,'🔗',null,40,false),
  ('card','features',null,'Real-Time Insights','Data that drives performance.',null,'▥',null,50,false),
  ('card','dashboard',null,'Inspections','Drivers will perform both pre and post trip inspections (pass or fail). If any inspection fails, they will fully document the issue, reach out to linehaul, the shop for repairs, and their dispatch making them all aware of the issue.',null,'▣',null,10,false),
  ('card','dashboard',null,'Drivers','An active list of current drivers using the application.',null,'♙',null,20,false),
  ('card','dashboard',null,'Vehicles','A list of company trucks and their numbers. In the driver app they will be required to select the truck number they are assigned to that day.',null,'▰',null,30,false),
  ('card','dashboard',null,'Documents','User guides, employee handbook, etc.',null,'□',null,40,false),
  ('card','dashboard',null,'Reports','Drivers will be able to view their trip submissions for that day, week, or month.',null,'▥',null,50,false),
  ('card','dashboard',null,'Alerts','Messages from management for weather alerts, road closures, etc.',null,'🔔',null,60,false),
  ('card','dashboard',null,'Users','A list for non drivers that have access to the application (compliance officers, safety, supervisors, dispatch, admins, etc.).',null,'♧',null,70,false),
  ('card','mobile',null,'Driver App','Large buttons, minimal typing, complete trip summary end to end, photo capture, date and time stamped submissions, pre and post trip data.',null,'▣',null,10,false),
  ('card','mobile',null,'Admin Access','Admins will have access to add/remove/suspend users, grant levels of access to app for new drivers and/or users, add/remove documents, alerts, and access to reporting.',null,'⚙',null,20,false),
  ('card','documents',null,'Company Documents','Placeholder for user guides, employee handbook, operating procedures, safety policies, training materials, and other documents companies need to make available to drivers and authorized users.',null,'□',null,10,false),
  ('card','documents',null,'Document Controls','Add new documents, update existing files, archive outdated documents, and organize materials by category.',null,'▤',null,20,false),
  ('link','navigation',null,'Dashboard Overview',null,'#dashboard',null,null,10,false),
  ('link','navigation',null,'Mobile Apps',null,'#mobile',null,null,20,false),
  ('link','navigation',null,'Important Numbers',null,'#numbers',null,null,30,false),
  ('link','navigation',null,'Traffic & Weather',null,'#traffic',null,null,40,false),
  ('link','navigation',null,'Documents',null,'#documents',null,null,50,false)
) as v(item_type,section_key,item_key,title,body,url,icon,link_label,sort_order,open_new_tab)
where not exists (select 1 from public.homepage_content hc where hc.company_id = wfs.id);
