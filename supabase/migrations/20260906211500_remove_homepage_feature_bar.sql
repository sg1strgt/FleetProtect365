delete from public.homepage_content hc
using public.companies c
where hc.company_id = c.id
  and upper(c.company_code) = 'WFS'
  and hc.section_key = 'features';
