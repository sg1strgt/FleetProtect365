insert into public.homepage_content
  (company_id,item_type,section_key,item_key,title,sort_order,open_new_tab,active,style_data)
select c.id,'text','hero','page_state','Additional page text',999,false,true,'{}'::jsonb
from public.companies c
where upper(c.company_code)='WFS'
on conflict (company_id,item_key) where item_key is not null do nothing;
