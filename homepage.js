(() => {
  'use strict';
  const SUPABASE_URL = 'https://ahoejwyxfclndcbcxhwv.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_FeyV-yXT6lwFHh737rYnAQ_mYoP8TIW';
  const byId = id => document.getElementById(id);
  const safeUrl = value => {
    const url = String(value || '').trim();
    if (!url) return '';
    if (url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:')) return url;
    try { const parsed = new URL(url, location.href); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : ''; }
    catch (_) { return ''; }
  };
  const itemByKey = (items, key) => items.find(item => item.item_key === key);

  function makeLink(item, className = 'link') {
    const url = safeUrl(item.url); if (!url) return null;
    const link = document.createElement('a'); link.className = className; link.href = url;
    link.textContent = item.link_label || item.title;
    if (item.open_new_tab) { link.target = '_blank'; link.rel = 'noopener'; }
    return link;
  }
  function applyHero(items) {
    const eyebrow=itemByKey(items,'hero_eyebrow'), title=itemByKey(items,'hero_title'), accent=itemByKey(items,'hero_accent'), body=itemByKey(items,'hero_body'), button=itemByKey(items,'hero_button');
    if(eyebrow)byId('homeHeroEyebrow').textContent=eyebrow.title;
    if(title){byId('homeHeroTitle').textContent=title.title;byId('homeHeroSubtitle').textContent=title.body||'';}
    if(accent)byId('homeHeroAccent').textContent=accent.title;
    if(body)byId('homeHeroBody').textContent=body.title;
    if(button){const el=byId('homeHeroButton'),url=safeUrl(button.url);el.textContent=button.title||'Learn More';if(url)el.href=url;el.hidden=!url;}
  }
  function renderFeatures(items) {
    const target=byId('homeFeatures'), rows=items.filter(x=>x.item_type==='card'&&x.section_key==='features');
    if(!rows.length){target.remove();return;}
    target.replaceChildren(...rows.map(item=>{const row=document.createElement('div');row.className='feature';const icon=document.createElement('div');icon.className='icon';icon.textContent=item.icon||'◆';const copy=document.createElement('div'),title=document.createElement('b'),body=document.createElement('small');title.textContent=item.title;body.textContent=item.body||'';copy.append(title,body);row.append(icon,copy);return row;}));
    target.style.gridTemplateColumns=`repeat(${Math.min(rows.length,5)},minmax(0,1fr))`;
  }
  function makeCard(item, tile=false) {
    const card=document.createElement('article');card.className=tile?'tile':'card';
    if(item.icon){const icon=document.createElement('div');icon.className=tile?'bigicon':'card-icon';icon.textContent=item.icon;card.appendChild(icon);}
    const heading=document.createElement(tile?'h4':'h3');heading.textContent=item.title;card.appendChild(heading);
    if(item.body){const body=document.createElement('p');body.textContent=item.body;card.appendChild(body);}
    const link=makeLink(item,tile?'mini-btn':'link');if(link)card.appendChild(link);return card;
  }
  function renderCards(items, section, targetId, tile=false) {
    const target=targetId==='documents'?document.querySelector('section.documents-section#documents'):byId(targetId),rows=items.filter(x=>x.item_type==='card'&&x.section_key===section);
    if(!rows.length||!target)return;
    const cards=rows.map(x=>makeCard(x,tile));
    if(section==='resources')target.append(...cards);else target.replaceChildren(...cards);
  }
  function renderNavigation(items) {
    const target=byId('homeNavigation'),rows=items.filter(x=>x.item_type==='link'&&x.section_key==='navigation'),links=rows.map(x=>makeLink(x,'')).filter(Boolean);
    if(!links.length)return;target.replaceChildren(...links);links[0].classList.add('active');
  }
  async function load() {
    if(!window.supabase)return;
    const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data,error}=await client.rpc('get_public_homepage',{p_company_code:'WFS'});
    if(error||!data?.length){if(error)console.warn('Using built-in homepage content.',error.message);return;}
    const items=[...data].sort((a,b)=>a.sort_order-b.sort_order);applyHero(items);renderFeatures(items);renderCards(items,'resources','homeResources');renderCards(items,'dashboard','homeDashboardCards',true);renderCards(items,'mobile','mobile');renderCards(items,'documents','documents');renderNavigation(items);
  }
  load().catch(error=>console.warn('Using built-in homepage content.',error));
})();
