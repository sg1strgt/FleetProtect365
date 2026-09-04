insert into public.homepage_content
  (company_id,item_type,section_key,item_key,title,body,url,icon,link_label,sort_order,open_new_tab,active,style_data)
select c.id,v.item_type,v.section_key,v.item_key,v.title,null,v.url,null,null,v.sort_order,false,true,'{}'::jsonb
from public.companies c
cross join (values
  ('text','navigation','header_brand','FLEET PROTECT 365',null,1),
  ('link','navigation','header_login','Login','#login',2),
  ('link','navigation','header_demo','Request a Demo','mailto:demo@fleetprotect365.com',3)
) as v(item_type,section_key,item_key,title,url,sort_order)
where upper(c.company_code)='WFS'
on conflict (company_id,item_key) where item_key is not null do nothing;
