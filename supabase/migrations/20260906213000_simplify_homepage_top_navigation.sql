delete from public.homepage_content hc
using public.companies c
where hc.company_id = c.id
  and upper(c.company_code) = 'WFS'
  and (
    (
      hc.item_type = 'link'
      and hc.section_key = 'navigation'
      and coalesce(hc.item_key, '') not in ('header_login', 'header_demo')
    )
    or (
      hc.item_type = 'card'
      and coalesce((hc.style_data #>> '{layouts,desktop,y}')::numeric, 99999) < 100
    )
  );
