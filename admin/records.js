(() => {
  'use strict';
  const client = window.FP365_ADMIN_CLIENT;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const fmtDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-US') : '—';
  const fmtTime = value => value ? new Date(`2000-01-01T${value}`).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '—';
  const declineLabel = value => value === true ? 'Yes' : value === false ? 'No' : 'Unsure';
  const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const orderKey='fp365-reports-records-order';
  let company, profile, drivers=[], trucks=[], recipients=[], state={dispatch:[],callout:[],timeoff:[],daily:[],mileage:[]};
  const selectedTimeOffIds=new Set();

  const definitions = {
    dispatch:{table:'dispatch_records',date:'dispatch_date',title:'Dispatch Record'},
    callout:{table:'call_out_records',date:'call_out_date',title:'Call Out Record'},
    timeoff:{table:'time_off_requests',date:'date_from',title:'Requested Time Off'},
    daily:{table:'daily_dispatch_records',date:'dispatch_date',title:'Daily Dispatch Record'},
    mileage:{table:'location_mileage_records',date:'created_at',title:'Location ID Record'}
  };

  async function context(){
    if(company) return;
    const {data:s}=await client.auth.getSession();
    if(!s.session?.user) throw Error('Admin session is unavailable.');
    const {data,error}=await client.from('employee_profiles').select('*,companies(*)').eq('id',s.session.user.id).single();
    if(error) throw error;
    profile=data; company=Array.isArray(data.companies)?data.companies[0]:data.companies;
    const [driverResult,truckResult,recipientResult]=await Promise.all([
      client.from('employee_profiles').select('id,full_name,display_name,employee_id,status').eq('company_id',company.id).is('deleted_at',null).order('full_name'),
      client.from('trucks').select('id,truck_number,status').eq('company_id',company.id).is('deleted_at',null).order('truck_number'),
      client.from('report_recipients').select('id,display_name,email,active').eq('company_id',company.id).is('deleted_at',null).eq('active',true).order('display_name')
    ]);
    if(driverResult.error) throw driverResult.error;
    if(truckResult.error) throw truckResult.error;
    if(recipientResult.error) throw recipientResult.error;
    drivers=(driverResult.data||[]).filter(x=>x.status==='active');
    trucks=truckResult.data||[];
    recipients=recipientResult.data||[];
    updateReportFilterOptions();
  }

  function driverOptions(selected=''){
    return '<option value="">Select driver</option>'+drivers.map(x=>`<option value="${x.id}" ${x.id===selected?'selected':''}>${esc(x.full_name||x.display_name)}${x.employee_id?` (${esc(x.employee_id)})`:''}</option>`).join('');
  }
  function truckOptions(selected=''){const choices=trucks.filter(x=>(x.status==='active'||x.truck_number===selected)&&x.truck_number!=='NA');return `<option value="">Select truck</option><option value="NA" ${selected==='NA'?'selected':''}>NA</option>`+choices.map(x=>`<option value="${esc(x.truck_number)}" ${x.truck_number===selected?'selected':''}>${esc(x.truck_number)}${x.status!=='active'?` (${esc(x.status)})`:''}</option>`).join('');}

  function shell(){
    const section=$('reports'); if(!section||$('recordsHub')) return;
    section.querySelector('h2').textContent='Archived End-of-Shift Reports';
    const hub=document.createElement('div'); hub.id='recordsHub'; hub.className='records-hub';
    hub.innerHTML=`<div class="records-intro"><h2>Reports and Records</h2><p>Maintain attendance, time-off, daily assignments, and route-mile records.</p></div>
      ${card('callout','Call Out Record','Driver call-outs and declines.','Add Record')}
      ${card('timeoff','Requested Time Off','Requested date ranges by driver.','Add Request')}
      ${card('daily','Daily Dispatch Record','Daily driver, run, dispatch, and truck assignments.','Add Record','<button type="button" data-copy-all-daily>Copy All</button><button type="button" data-refresh-daily>Clear Today’s Records</button>')}
      ${card('mileage','Location ID Record','Mileage table used by dispatch reports.','Add Route')}`;
    section.insertBefore(hub,section.firstChild);
    const archiveNodes=[...section.children].filter(node=>node!==hub);
    const archive=document.createElement('section');archive.className='records-card collapsed records-archive-card';archive.dataset.collapseCard='archive';archive.innerHTML='<button class="records-card-title" type="button" data-toggle-card="archive" aria-expanded="false"><span>Archived End-of-Shift Reports</span><span class="records-chevron" aria-hidden="true">›</span></button><div class="records-card-content" id="archiveReportsContent"></div>';
    archiveNodes.forEach(node=>archive.querySelector('#archiveReportsContent').appendChild(node));section.appendChild(archive);
    hub.querySelectorAll('[data-add-record]').forEach(b=>b.onclick=()=>openEditor(b.dataset.addRecord));
    hub.querySelector('[data-refresh-daily]').onclick=clearTodayDailyRecords;
    hub.querySelector('[data-copy-all-daily]').onclick=copyDailyText;
    hub.querySelectorAll('[data-move-card]').forEach(button=>button.onclick=()=>moveCard(button.dataset.moveCard,Number(button.dataset.direction)));
    section.querySelectorAll('[data-toggle-card]').forEach(button=>button.onclick=()=>toggleCard(button));
    section.querySelectorAll('[data-record-filter]').forEach(input=>input.onchange=()=>{if(input.dataset.recordFilter==='timeoff')selectedTimeOffIds.clear();renderAll();});
    section.querySelectorAll('[data-export-record]').forEach(button=>button.onclick=()=>exportRecordPdf(button.dataset.exportRecord));
    section.querySelectorAll('[data-email-record]').forEach(button=>button.onclick=()=>emailRecordPdf(button.dataset.emailRecord));
    ensureDialog();
    restoreOrder();
  }

  function card(type,title,description,button,extra=''){
    const action=type==='miles'?'<button type="button" data-refresh-miles>Refresh</button>':`<button type="button" class="primary" data-add-record="${type}">${button}</button>`;
    const reporting=['callout','timeoff'].includes(type)?reportToolbar(type):'';
    return `<section class="records-card collapsed" data-record-card="${type}" data-collapse-card="${type}"><button class="records-card-title" type="button" data-toggle-card="${type}" aria-expanded="false"><span>${title}</span><span class="records-chevron" aria-hidden="true">›</span></button><div class="records-card-content"><p class="records-description">${description}</p><div class="records-actions">${extra}${action}<span class="records-move"><button type="button" data-move-card="${type}" data-direction="-1" aria-label="Move ${title} up">↑</button><button type="button" data-move-card="${type}" data-direction="1" aria-label="Move ${title} down">↓</button></span></div>${reporting}<div id="${type}Summary"></div><div class="records-table"><table><thead id="${type}Head"></thead><tbody id="${type}Body"></tbody></table></div><p id="${type}Empty" class="records-empty hidden">No records entered.</p></div></section>`;
  }
  function reportToolbar(type){const from=new Date();from.setFullYear(from.getFullYear()-1);const fromIso=from.toISOString().slice(0,10);return `<div class="records-report-toolbar"><label>Employee<select id="${type}FilterDriver" data-record-filter="${type}"><option value="">All employees</option></select></label><label>From<input id="${type}FilterFrom" data-record-filter="${type}" type="date" value="${fromIso}"></label><label>To<input id="${type}FilterTo" data-record-filter="${type}" type="date" value="${today()}"></label><button type="button" data-export-record="${type}">Export PDF</button><label>Email To<select id="${type}Recipient"><option value="">Select recipient</option></select></label><button type="button" data-email-record="${type}">Email PDF</button></div>`;}
  function updateReportFilterOptions(){['callout','timeoff'].forEach(type=>{const driverSelect=$(type+'FilterDriver'),recipientSelect=$(type+'Recipient');if(driverSelect){const selected=driverSelect.value;driverSelect.innerHTML='<option value="">All employees</option>'+drivers.map(x=>`<option value="${x.id}">${esc(x.full_name||x.display_name)}</option>`).join('');driverSelect.value=selected;}if(recipientSelect){const selected=recipientSelect.value;recipientSelect.innerHTML='<option value="">Select recipient</option>'+recipients.map(x=>`<option value="${x.id}">${esc(x.display_name)} — ${esc(x.email)}</option>`).join('');recipientSelect.value=selected;}});}

  function saveOrder(){localStorage.setItem(orderKey,JSON.stringify([...document.querySelectorAll('[data-record-card]')].map(card=>card.dataset.recordCard)));}
  function restoreOrder(){try{const order=JSON.parse(localStorage.getItem(orderKey)||'[]'),hub=$('recordsHub');order.forEach(type=>{const card=hub.querySelector(`[data-record-card="${type}"]`);if(card)hub.appendChild(card);});}catch{localStorage.removeItem(orderKey);}}
  function moveCard(type,direction){const card=document.querySelector(`[data-record-card="${type}"]`);if(!card)return;const sibling=direction<0?card.previousElementSibling:card.nextElementSibling;if(!sibling||!sibling.matches('[data-record-card]'))return;if(direction<0)card.parentNode.insertBefore(card,sibling);else card.parentNode.insertBefore(sibling,card);saveOrder();}
  function toggleCard(button){const card=button.closest('[data-collapse-card]'),expanded=card.classList.toggle('collapsed')===false;button.setAttribute('aria-expanded',String(expanded));}

  async function loadAll(){
    try{
      await context(); $('reportsMsg').textContent='Loading reports and records…';
      const cutoff=new Date(); cutoff.setFullYear(cutoff.getFullYear()-1);
      const cutoffIso=cutoff.toISOString().slice(0,10);
      const queries=Object.entries(definitions).map(([key,d])=>client.from(d.table).select('*').eq('company_id',company.id).gte(d.date,key==='mileage'?'1900-01-01':cutoffIso).order(d.date,{ascending:true}));
      const results=await Promise.all(queries);
      const keys=Object.keys(definitions);
      results.forEach((result,i)=>{if(result.error) throw result.error; state[keys[i]]=result.data||[];});
      selectedTimeOffIds.forEach(id=>{if(!state.timeoff.some(row=>row.id===id))selectedTimeOffIds.delete(id);});
      renderAll(); $('reportsMsg').textContent='';
    }catch(error){$('reportsMsg').textContent=error.message;}
  }

  function renderAll(){renderCallouts();renderTimeOff();renderDaily();renderMileage();bindRows();}
  function actionButtons(type,id,copy=false){return `<div class="row-actions"><button data-edit-type="${type}" data-edit-id="${id}">Edit</button>${copy?`<button data-copy-type="${type}" data-copy-id="${id}">Copy</button>`:''}<button class="danger" data-delete-type="${type}" data-delete-id="${id}">Delete</button></div>`;}
  function table(type,headers,rows){$(type+'Head').innerHTML=`<tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr>`;$(type+'Body').innerHTML=rows.join('');$(type+'Empty').classList.toggle('hidden',rows.length>0);}
  function renderDispatch(){const newestFirst=[...state.dispatch].sort((a,b)=>b.dispatch_date.localeCompare(a.dispatch_date)||String(b.created_at).localeCompare(String(a.created_at)));table('dispatch',['Date','Driver','Truck / Notes','Dispatch / Dispatched','Route','Delay','Action'],newestFirst.map(r=>{const legs=(r.legs||[]).map(x=>`${esc(x.from)} → ${esc(x.to)}`).join('<br>');const delay=minutes(r.dispatch_time,r.actual_dispatched_time);return `<tr><td>${fmtDate(r.dispatch_date)}</td><td>${esc(r.driver_name)}</td><td>${esc(r.truck_number||'—')}${r.notes?`<br><small>${esc(r.notes)}</small>`:''}</td><td>${fmtTime(r.dispatch_time)}<br>${fmtTime(r.actual_dispatched_time)}</td><td>${legs}</td><td>${r.actual_dispatched_time?`${delay} min`:'—'}${r.delay_reason?`<br>${esc(r.delay_reason)}`:''}</td><td>${actionButtons('dispatch',r.id)}</td></tr>`;}));}
  function filteredRecords(type,useSelection=true){const driver=$(type+'FilterDriver')?.value||'',from=$(type+'FilterFrom')?.value||'',to=$(type+'FilterTo')?.value||'';return state[type].filter(row=>{const driverMatch=!driver||row.driver_profile_id===driver,selected=type!=='timeoff'||!useSelection||!selectedTimeOffIds.size||selectedTimeOffIds.has(row.id);if(type==='callout')return selected&&driverMatch&&(!from||row.call_out_date>=from)&&(!to||row.call_out_date<=to);return selected&&driverMatch&&(!from||row.date_to>=from)&&(!to||row.date_from<=to);}).sort((a,b)=>{const ad=type==='callout'?a.call_out_date:a.date_from,bd=type==='callout'?b.call_out_date:b.date_from;return bd.localeCompare(ad)||String(b.created_at).localeCompare(String(a.created_at));});}
  function renderCallouts(){const rows=filteredRecords('callout');table('callout',['Date','Driver','Reason','Took Decline','Action'],rows.map(r=>`<tr><td>${fmtDate(r.call_out_date)}</td><td>${esc(r.driver_name)}</td><td>${esc(r.reason)}</td><td>${declineLabel(r.took_decline)}${r.decline_reason?`<br>${esc(r.decline_reason)}`:''}</td><td>${actionButtons('callout',r.id)}</td></tr>`));}
  function renderTimeOff(){const rows=filteredRecords('timeoff',false),allSelected=rows.length>0&&rows.every(row=>selectedTimeOffIds.has(row.id));table('timeoff',[`<label><input id="selectAllTimeOff" type="checkbox" ${allSelected?'checked':''}> Driver / Select All</label>`,'From','To','Comments','Action'],rows.map(r=>`<tr><td><label><input type="checkbox" data-select-timeoff="${r.id}" aria-label="Select ${esc(r.driver_name)} time-off request" ${selectedTimeOffIds.has(r.id)?'checked':''}> ${esc(r.driver_name)}</label></td><td>${fmtDate(r.date_from)}</td><td>${fmtDate(r.date_to)}</td><td>${esc(r.comments||'—')}</td><td>${actionButtons('timeoff',r.id,true)}</td></tr>`));}
  function renderDaily(){table('daily',['Date','Driver','Run','Dispatch Time','Truck','Notes','Action'],state.daily.map(r=>`<tr><td>${fmtDate(r.dispatch_date)}</td><td>${esc(r.driver_name)}</td><td>${esc(r.run)}</td><td>${fmtTime(r.dispatch_time)}</td><td>${esc(r.truck_number)}</td><td>${esc(r.notes||'—')}</td><td>${actionButtons('daily',r.id,true)}</td></tr>`));}
  function renderMileage(){table('mileage',['From','To','Miles','Action'],state.mileage.map(r=>`<tr><td><b>${esc(r.code_from)}</b> — ${esc(r.name_from)}</td><td><b>${esc(r.code_to)}</b> — ${esc(r.name_to)}</td><td>${Number(r.miles).toLocaleString()}</td><td>${actionButtons('mileage',r.id)}</td></tr>`));}

  function startOfWeek(iso){const d=new Date(`${iso}T12:00:00`),offset=(d.getDay()+1)%7;d.setDate(d.getDate()-offset);return d.toISOString().slice(0,10);}
  function routeMiles(from,to){const row=state.mileage.find(x=>(x.code_from===from&&x.code_to===to)||(x.code_from===to&&x.code_to===from));return Number(row?.miles||0);}
  function renderMiles(){
    const weekly=new Map(),monthly=new Map();
    state.dispatch.forEach(r=>{const miles=(r.legs||[]).reduce((sum,l)=>sum+routeMiles(String(l.from),String(l.to)),0);const week=startOfWeek(r.dispatch_date),month=r.dispatch_date.slice(0,7);const wk=`${week}|${r.driver_profile_id}`,mo=`${month}|${r.driver_profile_id}`;weekly.set(wk,{period:week,driver:r.driver_name,miles:(weekly.get(wk)?.miles||0)+miles});monthly.set(mo,{period:month,driver:r.driver_name,miles:(monthly.get(mo)?.miles||0)+miles});});
    const weeklyRows=[...weekly.values()].sort((a,b)=>a.period.localeCompare(b.period));
    const allByWeek=new Map();weeklyRows.forEach(x=>allByWeek.set(x.period,(allByWeek.get(x.period)||0)+x.miles));
    const allByMonth=new Map();monthly.forEach(x=>allByMonth.set(x.period,(allByMonth.get(x.period)||0)+x.miles));
    $('milesSummary').innerHTML=`<div class="mileage-summary"><article><small>Rolling 12-Month Miles</small><strong>${weeklyRows.reduce((s,x)=>s+x.miles,0).toLocaleString()}</strong></article><article><small>Routes Missing Mileage</small><strong>${missingMileageCount()}</strong></article></div>`;
    const monthlyRows=[...monthly.values()].sort((a,b)=>a.period.localeCompare(b.period));
    const weekLines=weeklyRows.map(x=>{const end=new Date(`${x.period}T12:00:00`);end.setDate(end.getDate()+6);return `<tr><td><b>Weekly</b><br>${fmtDate(x.period)}–${end.toLocaleDateString('en-US')}</td><td>${esc(x.driver)}</td><td>${x.miles.toLocaleString()}</td><td>${(allByWeek.get(x.period)||0).toLocaleString()}</td></tr>`;});
    const monthLines=monthlyRows.map(x=>{const label=new Date(`${x.period}-01T12:00:00`).toLocaleDateString('en-US',{month:'long',year:'numeric'});return `<tr><td><b>Monthly</b><br>${label}</td><td>${esc(x.driver)}</td><td>${x.miles.toLocaleString()}</td><td>${(allByMonth.get(x.period)||0).toLocaleString()}</td></tr>`;});
    table('miles',['Period','Driver','Driver Miles','All Drivers'],[...weekLines,...monthLines]);
  }
  function missingMileageCount(){return state.dispatch.reduce((n,r)=>n+(r.legs||[]).filter(l=>!routeMiles(String(l.from),String(l.to))).length,0);}
  function minutes(a,b){if(!a||!b)return 0;const [ah,am]=a.split(':').map(Number),[bh,bm]=b.split(':').map(Number);let d=(bh*60+bm)-(ah*60+am);if(d<0)d+=1440;return d;}

  function buildRecordPdf(type){const rows=filteredRecords(type),title=type==='callout'?'Call Out Record Report':'Requested Time Off Report',doc=new window.jspdf.jsPDF({orientation:'landscape'}),driver=$(type+'FilterDriver').value,driverLabel=driver?(drivers.find(x=>x.id===driver)?.full_name||'Selected employee'):'All employees',from=$(type+'FilterFrom').value,to=$(type+'FilterTo').value;doc.setFontSize(18);doc.setTextColor(22,38,63);doc.text('Fleet Protect 365',14,16);doc.setFontSize(14);doc.text(title,14,24);doc.setFontSize(10);doc.setTextColor(70);doc.text(`${driverLabel} | ${fmtDate(from)} through ${fmtDate(to)}`,14,31);const head=type==='callout'?[['Date','Driver','Reason','Took Decline','Decline Reason']]:[['Driver','Requested From','Requested To','Comments']];const body=type==='callout'?rows.map(r=>[fmtDate(r.call_out_date),r.driver_name,r.reason,declineLabel(r.took_decline),r.decline_reason||'']):rows.map(r=>[r.driver_name,fmtDate(r.date_from),fmtDate(r.date_to),r.comments||'']);doc.autoTable({startY:36,head,body,styles:{fontSize:9,cellPadding:3},headStyles:{fillColor:[22,38,63]}});const fileName=`FleetProtect365_${type==='callout'?'Call_Out':'Time_Off'}_${from||'all'}_${to||'all'}.pdf`;return{doc,rows,fileName,title,driverLabel,from,to};}
  function exportRecordPdf(type){const report=buildRecordPdf(type);if(!report.rows.length)return void($(type+'Summary').innerHTML='<p class="records-empty">No records match the selected employee and date range.</p>');report.doc.save(report.fileName);$(type+'Summary').innerHTML=`<p><b>${report.rows.length} record${report.rows.length===1?'':'s'} exported to PDF.</b></p>`;}
  async function emailRecordPdf(type){const recipientId=$(type+'Recipient').value;if(!recipientId)return void($(type+'Summary').innerHTML='<p class="records-empty">Select an email recipient first.</p>');const report=buildRecordPdf(type);if(!report.rows.length)return void($(type+'Summary').innerHTML='<p class="records-empty">No records match the selected employee and date range.</p>');const recipient=recipients.find(x=>x.id===recipientId);$(type+'Summary').innerHTML=`<p>Sending PDF to ${esc(recipient?.email||'recipient')}…</p>`;const pdfBase64=report.doc.output('datauristring').split(',')[1];const {data,error}=await client.functions.invoke('email-record-report',{body:{recipientId,reportType:type,fileName:report.fileName,pdfBase64,dateFrom:report.from,dateTo:report.to,driverName:report.driverLabel,recordCount:report.rows.length}});if(error||!data?.ok)return void($(type+'Summary').innerHTML=`<p class="records-empty">${esc(data?.error||error?.message||'Unable to email the report.')}</p>`);$(type+'Summary').innerHTML=`<p><b>PDF emailed to ${esc(recipient.email)}.</b></p>`;}

  function bindRows(){
    $('recordsHub').querySelectorAll('[data-edit-type]').forEach(b=>b.onclick=()=>openEditor(b.dataset.editType,state[b.dataset.editType].find(x=>x.id===b.dataset.editId)));
    $('recordsHub').querySelectorAll('[data-copy-type]').forEach(b=>{b.onclick=()=>{const row=state[b.dataset.copyType].find(x=>x.id===b.dataset.copyId);if(b.dataset.copyType==='timeoff')copyTimeOffText(row);else openEditor(b.dataset.copyType,{...row,id:null,dispatch_date:today()},true);};});
    $('recordsHub').querySelectorAll('[data-delete-type]').forEach(b=>b.onclick=()=>removeRecord(b.dataset.deleteType,b.dataset.deleteId));
    $('recordsHub').querySelectorAll('[data-select-timeoff]').forEach(box=>box.onchange=()=>{box.checked?selectedTimeOffIds.add(box.dataset.selectTimeoff):selectedTimeOffIds.delete(box.dataset.selectTimeoff);const all=$('selectAllTimeOff'),boxes=[...document.querySelectorAll('[data-select-timeoff]')];if(all)all.checked=boxes.length>0&&boxes.every(item=>item.checked);});
    if($('selectAllTimeOff'))$('selectAllTimeOff').onchange=event=>{document.querySelectorAll('[data-select-timeoff]').forEach(box=>{box.checked=event.target.checked;event.target.checked?selectedTimeOffIds.add(box.dataset.selectTimeoff):selectedTimeOffIds.delete(box.dataset.selectTimeoff);});};
  }

  function ensureDialog(){if($('recordDialog'))return;const d=document.createElement('dialog');d.id='recordDialog';d.className='record-dialog';d.innerHTML='<form id="recordForm"><h2 id="recordDialogTitle"></h2><input id="recordType" type="hidden"><input id="recordId" type="hidden"><div id="recordFields"></div><p id="recordFormMsg"></p><div class="actions"><button id="recordReset" type="button">Refresh / Clear</button><button id="recordCancel" type="button">Cancel</button><button class="primary" type="submit">Save Record</button></div></form>';document.body.appendChild(d);$('recordCancel').onclick=()=>d.close();$('recordReset').onclick=()=>openEditor($('recordType').value,null,true);$('recordForm').onsubmit=saveRecord;}
  async function copyDailyText(){
    if(!state.daily.length)return void($('dailySummary').innerHTML='<p class="records-empty">No Daily Dispatch records are available to copy.</p>');
    const dates=[...new Set(state.daily.map(row=>row.dispatch_date))].sort().reverse();
    const selectedDate=dates.includes(today())?today():dates[0];
    const rows=state.daily.filter(row=>row.dispatch_date===selectedDate);
    const text=[`Fleet Protect 365 — Daily Dispatch Record`,`Date: ${fmtDate(selectedDate)}`,'',...rows.map((row,index)=>`${index+1}. ${row.driver_name} | Run: ${row.run} | Dispatch: ${fmtTime(row.dispatch_time)} | Truck: ${row.truck_number}${row.notes?` | Notes: ${row.notes}`:''}`)].join('\n');
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
      else{const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();}
      $('dailySummary').innerHTML=`<p><b>${rows.length} record${rows.length===1?'':'s'} for ${fmtDate(selectedDate)} copied.</b> You can paste them into a text message.</p>`;
    }catch{$('dailySummary').innerHTML='<p class="records-empty">The browser could not copy the records. Check clipboard permission and try again.</p>';}
  }
  async function copyTimeOffText(row){
    if(!row)return;
    const rows=selectedTimeOffIds.size?filteredRecords('timeoff'):[row];
    const text=['Fleet Protect 365 — Requested Time Off','',...rows.map((item,index)=>`${index+1}. ${item.driver_name} | From: ${fmtDate(item.date_from)} | To: ${fmtDate(item.date_to)}${item.comments?` | Comments: ${item.comments}`:''}`)].join('\n');
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
      else{const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();}
      $('timeoffSummary').innerHTML=`<p><b>${rows.length} time-off request${rows.length===1?' was':'s were'} copied as text.</b> You can paste ${rows.length===1?'it':'them'} into a text message.</p>`;
    }catch{$('timeoffSummary').innerHTML='<p class="records-empty">The browser could not copy the request. Check clipboard permission and try again.</p>';}
  }
  async function clearTodayDailyRecords(){
    const date=today(),rows=state.daily.filter(row=>row.dispatch_date===date);
    if(!rows.length)return void($('dailySummary').innerHTML='<p class="records-empty">There are no Daily Dispatch records for today to clear.</p>');
    if(!confirm(`Clear all ${rows.length} Daily Dispatch record${rows.length===1?'':'s'} for ${fmtDate(date)}? This cannot be undone.`))return;
    const {error}=await client.from('daily_dispatch_records').delete().eq('company_id',company.id).eq('dispatch_date',date);
    if(error)return void($('dailySummary').innerHTML=`<p class="records-empty">${esc(error.message)}</p>`);
    await loadAll();
    $('dailySummary').innerHTML=`<p><b>Today’s Daily Dispatch records were cleared.</b></p>`;
  }
  function timeField(name,label,value='',required=true,allowNA=false){const hasValue=Boolean(value),[h24='',m='']=String(value||'').split(':'),n=Number(h24),period=hasValue?(n>=12?'PM':'AM'):'',h=hasValue?(n%12||12):'',requiredAttr=required?'required':'';return `<label>${label}${required?' *':' (optional)'}<span class="record-time" ${allowNA?'style="grid-template-columns:1fr auto 1fr 1.2fr auto"':''} data-time="${name}"><input inputmode="numeric" maxlength="2" value="${h}" aria-label="Hour" ${requiredAttr}><b>:</b><input inputmode="numeric" maxlength="2" value="${m}" aria-label="Minute" ${requiredAttr}><select ${requiredAttr}><option value="" ${!period?'selected':''}>AM/PM</option><option ${period==='AM'?'selected':''}>AM</option><option ${period==='PM'?'selected':''}>PM</option></select>${allowNA?`<button type="button" data-clear-time="${name}">NA</button>`:''}</span></label>`;}
  function readTime(name){const g=document.querySelector(`[data-time="${name}"]`),inputs=g.querySelectorAll('input'),p=g.querySelector('select').value;let h=Number(inputs[0].value),m=Number(inputs[1].value);if(h<1||h>12||m<0||m>59)throw Error('Enter a valid time.');if(p==='PM'&&h<12)h+=12;if(p==='AM'&&h===12)h=0;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;}
  function readOptionalTime(name){const g=document.querySelector(`[data-time="${name}"]`),inputs=g.querySelectorAll('input'),values=[inputs[0].value,inputs[1].value,g.querySelector('select').value];if(values.every(value=>!value))return null;if(values.some(value=>!value))throw Error('Complete all parts of Dispatched Time or leave it blank.');return readTime(name);}
  function driverField(value=''){return `<label>Driver Name *<select id="recordDriver" required>${driverOptions(value)}</select></label>`;}
  function legsFields(legs=[]){const rows=[0,1,2].map(i=>`<div class="record-leg ${i===2&&!legs[i]?'hidden':''}" data-leg="${i}"><label>Location From *<input inputmode="numeric" pattern="[0-9]*" maxlength="10" value="${esc(legs[i]?.from||'')}"></label><label>Location To *<input inputmode="numeric" pattern="[0-9]*" maxlength="10" value="${esc(legs[i]?.to||'')}"></label>${i===2?'<button type="button" data-remove-leg>Remove Third Leg</button>':''}</div>`).join('');return `${rows}<button id="addThirdLeg" type="button">Add Third Leg</button>`;}
  function openEditor(type,row=null,reset=false){
    ensureDialog();$('recordType').value=type;$('recordId').value=row?.id||'';$('recordDialogTitle').textContent=`${row?.id?'Edit':'Add'} ${definitions[type].title}`;$('recordFormMsg').textContent='';
    let html='';
    if(type==='dispatch')html=`<div class="record-form-grid"><label>Date *<input id="recordDate" type="date" value="${row?.dispatch_date||today()}" required></label>${driverField(row?.driver_profile_id)}<label>Truck Number *<select id="recordDispatchTruck" required>${truckOptions(row?.truck_number||'')}</select></label><label>Notes (optional) <span id="dispatchNotesCount">${String(row?.notes||'').length} / 500</span><textarea id="recordDispatchNotes" maxlength="500" rows="3">${esc(row?.notes||'')}</textarea></label>${timeField('scheduled','Dispatch Time',row?.dispatch_time)}${timeField('actual','Dispatched Time',row?.actual_dispatched_time,false)}<div class="wide">${legsFields(row?.legs||[])}</div><label id="delayReasonRow" class="wide record-delay-note hidden">Reason dispatched more than 30 minutes late *<textarea id="recordDelayReason" rows="3">${esc(row?.delay_reason||'')}</textarea></label></div>`;
    if(type==='callout'){const declineValue=!row?'false':row.took_decline===true?'true':row.took_decline===false?'false':'unsure';html=`<div class="record-form-grid"><label>Date *<input id="recordDate" type="date" value="${row?.call_out_date||today()}" required></label>${driverField(row?.driver_profile_id)}<label class="wide">Reason *<textarea id="recordReason" required>${esc(row?.reason||'')}</textarea></label><label>Took decline because of? *<select id="recordDecline"><option value="false" ${declineValue==='false'?'selected':''}>No</option><option value="true" ${declineValue==='true'?'selected':''}>Yes</option><option value="unsure" ${declineValue==='unsure'?'selected':''}>Unsure</option></select></label><label id="declineReasonRow" class="${declineValue==='true'?'':'hidden'}">Decline reason<textarea id="recordDeclineReason">${esc(row?.decline_reason||'')}</textarea></label></div>`;}
    if(type==='timeoff')html=`<div class="record-form-grid">${driverField(row?.driver_profile_id)}<label>Requested From *<input id="recordFromDate" type="date" value="${row?.date_from||today()}" required></label><label>Requested To *<input id="recordToDate" type="date" value="${row?.date_to||today()}" required></label><label class="wide">Comments (optional) <span id="timeOffCommentsCount">${String(row?.comments||'').length} / 500</span><textarea id="recordTimeOffComments" maxlength="500" rows="4">${esc(row?.comments||'')}</textarea></label></div>`;
    if(type==='daily')html=`<div class="record-form-grid"><label>Date *<input id="recordDate" type="date" value="${reset?'':(row?.dispatch_date||today())}" required></label>${driverField(reset?'':row?.driver_profile_id)}<label>Run *<input id="recordRun" value="${reset?'':esc(row?.run||'')}" required></label>${timeField('daily','Dispatch Time',reset?'':row?.dispatch_time,false,true)}<label>Truck Number *<select id="recordTruck" required>${truckOptions(reset?'':row?.truck_number||'')}</select></label><label>Notes (optional) <span id="dailyNotesCount">${String(reset?'':row?.notes||'').length} / 500</span><textarea id="recordDailyNotes" maxlength="500" rows="3">${reset?'':esc(row?.notes||'')}</textarea></label></div>`;
    if(type==='mileage')html=`<div class="record-form-grid"><label>Code From *<input id="recordCodeFrom" inputmode="numeric" pattern="[0-9]{1,10}" maxlength="10" value="${esc(row?.code_from||'')}" required></label><label>Name From *<input id="recordNameFrom" value="${esc(row?.name_from||'')}" required></label><label>Code To *<input id="recordCodeTo" inputmode="numeric" pattern="[0-9]{1,10}" maxlength="10" value="${esc(row?.code_to||'')}" required></label><label>Name To *<input id="recordNameTo" value="${esc(row?.name_to||'')}" required></label><label>Miles *<input id="recordMiles" inputmode="decimal" type="number" min="0" step="0.01" value="${esc(row?.miles||'')}" required></label></div>`;
    $('recordFields').innerHTML=html;$('recordReset').classList.toggle('hidden',type!=='daily');
    if(type==='dispatch'){const updateDelay=()=>{const actual=readOptionalTime('actual');$('delayReasonRow').classList.toggle('hidden',!actual||minutes(readTime('scheduled'),actual)<=30);};document.querySelectorAll('[data-time] input,[data-time] select').forEach(x=>x.onchange=()=>{try{updateDelay();}catch{}});$('recordDispatchNotes').oninput=()=>{$('dispatchNotesCount').textContent=`${$('recordDispatchNotes').value.length} / 500`;};$('addThirdLeg').onclick=()=>document.querySelector('[data-leg="2"]').classList.remove('hidden');document.querySelector('[data-remove-leg]').onclick=()=>{const leg=document.querySelector('[data-leg="2"]');leg.querySelectorAll('input').forEach(x=>x.value='');leg.classList.add('hidden');};try{updateDelay();}catch{}}
    if(type==='daily'){$('recordDailyNotes').oninput=()=>{$('dailyNotesCount').textContent=`${$('recordDailyNotes').value.length} / 500`;};document.querySelector('[data-clear-time="daily"]').onclick=()=>{const group=document.querySelector('[data-time="daily"]');group.querySelectorAll('input').forEach(input=>input.value='');group.querySelector('select').value='';};}
    if(type==='timeoff')$('recordTimeOffComments').oninput=()=>{$('timeOffCommentsCount').textContent=`${$('recordTimeOffComments').value.length} / 500`;};
    if(type==='callout')$('recordDecline').onchange=()=>$('declineReasonRow').classList.toggle('hidden',$('recordDecline').value!=='true');
    $('recordDialog').showModal();
  }

  function selectedDriver(){const id=$('recordDriver').value,row=drivers.find(x=>x.id===id);if(!row)throw Error('Select a driver.');return {id,name:row.full_name||row.display_name};}
  async function saveRecord(event){
    event.preventDefault();const type=$('recordType').value,id=$('recordId').value;try{let record={company_id:company.id,updated_by:profile.id,updated_at:new Date().toISOString()};
      if(type==='dispatch'){const d=selectedDriver(),legs=[...document.querySelectorAll('[data-leg]')].map(g=>{const i=g.querySelectorAll('input');return{from:i[0].value.trim(),to:i[1].value.trim()};}).filter(x=>x.from||x.to);if(legs.length<2||legs.some(x=>!/^\d{1,10}$/.test(x.from)||!/^\d{1,10}$/.test(x.to)))throw Error('Complete the first two route legs with numeric location codes.');const scheduled=readTime('scheduled'),actual=readOptionalTime('actual'),delay=actual?minutes(scheduled,actual):0,reason=$('recordDelayReason').value.trim();if(actual&&delay>30&&!reason)throw Error('Enter the reason for a delay greater than 30 minutes.');Object.assign(record,{dispatch_date:$('recordDate').value,driver_profile_id:d.id,driver_name:d.name,truck_number:$('recordDispatchTruck').value,notes:$('recordDispatchNotes').value.trim()||null,dispatch_time:scheduled,actual_dispatched_time:actual,legs,delay_reason:actual&&delay>30?reason:null});}
      if(type==='callout'){const d=selectedDriver(),declineValue=$('recordDecline').value,decline=declineValue==='true'?true:declineValue==='false'?false:null;Object.assign(record,{call_out_date:$('recordDate').value,driver_profile_id:d.id,driver_name:d.name,reason:$('recordReason').value.trim(),took_decline:decline,decline_reason:decline===true?$('recordDeclineReason').value.trim()||null:null});}
      if(type==='timeoff'){const d=selectedDriver();if($('recordToDate').value<$('recordFromDate').value)throw Error('The end date cannot be before the start date.');Object.assign(record,{driver_profile_id:d.id,driver_name:d.name,date_from:$('recordFromDate').value,date_to:$('recordToDate').value,comments:$('recordTimeOffComments').value.trim()||null});}
      if(type==='daily'){const d=selectedDriver();Object.assign(record,{dispatch_date:$('recordDate').value,driver_profile_id:d.id,driver_name:d.name,run:$('recordRun').value.trim(),dispatch_time:readOptionalTime('daily'),truck_number:$('recordTruck').value.trim(),notes:$('recordDailyNotes').value.trim()||null});}
      if(type==='mileage')Object.assign(record,{code_from:$('recordCodeFrom').value.trim(),name_from:$('recordNameFrom').value.trim(),code_to:$('recordCodeTo').value.trim(),name_to:$('recordNameTo').value.trim(),miles:Number($('recordMiles').value)});
      if(!id)record.created_by=profile.id;const query=id?client.from(definitions[type].table).update(record).eq('id',id).eq('company_id',company.id):client.from(definitions[type].table).insert(record);const {error}=await query;if(error)throw error;$('recordDialog').close();await loadAll();
    }catch(error){$('recordFormMsg').textContent=error.message;}
  }
  async function removeRecord(type,id){if(!confirm(`Delete this ${definitions[type].title.toLowerCase()}?`))return;const {error}=await client.from(definitions[type].table).delete().eq('id',id).eq('company_id',company.id);if(error)return alert(error.message);await loadAll();}

  shell();
  window.FP365_LOAD_RECORDS = loadAll;
  document.querySelector('nav [data-view="reports"]')?.addEventListener('click',()=>{setTimeout(()=>{$('title').textContent='Reports and Records';loadAll();},0);});
})();
