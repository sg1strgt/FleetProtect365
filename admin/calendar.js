(() => {
 'use strict';
 const s=window.FP365_ADMIN_CLIENT,$=id=>document.getElementById(id),D=window.FP365_CALENDAR_DATES;
 if(!s || !$('calendar')) return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const display=(value,options={weekday:'long',month:'long',day:'numeric',year:'numeric'})=>new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(D.date(value));
 const clock=value=>{if(!value)return 'All day';const [h,m]=value.split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'}`;};
 let selected=D.supported(today())?today():'2026-01-01',year=Number(selected.slice(0,4)),month=Number(selected.slice(5,7))-1,view='month',rows=[],profile,capabilities={},loading=false,saving=false,request=0,editId=null,editRevision=null,original='',lastDeleted=null;
 const message=text=>{$('calendarMsg').textContent=text;};
 async function context(){
  const {data,error}=await s.auth.getSession();if(error)throw error;
  if(!data.session?.user)throw Error('Sign in to use Calendar.');
  const result=await s.from('employee_profiles').select('id,company_id,email,role,status,deleted_at').eq('id',data.session.user.id).single();if(result.error)throw result.error;
  profile=result.data;if(profile.status!=='active'||profile.deleted_at||!['admin','super_admin'].includes(profile.role))throw Error('Active Admin access required.');
 }
 async function load(){
  const serial=++request;loading=true;message('Loading calendar…');render();
  try{
   await context();
   const cells=D.monthCells(year,month),start=cells[0]<'2026-01-01'?'2026-01-01':cells[0],end=cells[41]>'2027-12-31'?'2027-12-31':cells[41];
   const fetched=[];
   for(let from=0;;from+=500){
    const {data,error}=await s.from('admin_calendar_notes').select('*,reminders:admin_calendar_reminders(id,revision,channel,status,remind_at,last_error,submitted_at)').eq('company_id',profile.company_id).is('deleted_at',null).gte('note_date',start).lte('note_date',end).order('note_date').order('created_at').range(from,from+499);
    if(error)throw error;fetched.push(...data);if(data.length<500)break;
   }
   if(serial!==request)return;rows=fetched;message('');
  }catch(error){if(serial===request){rows=[];message(`Unable to load calendar: ${error.message}`);}}
  finally{if(serial===request){loading=false;render();}}
 }
 async function loadCapabilities(){
  try{const {data,error}=await s.functions.invoke('calendar-reminders',{body:{action:'capabilities'}});if(error||!data?.ok)throw error||Error(data?.error);capabilities=data;}
  catch{capabilities={};}
 }
 function render(){
  $('calendarMonth').value=String(month);$('calendarYear').value=String(year);
  $('calendarMonthLabel').textContent=new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month,1)));
  $('calendarPrev').disabled=loading||(year===2026&&month===0);$('calendarNext').disabled=loading||(year===2027&&month===11);
  ['calendarMonth','calendarYear','calendarToday','calendarRefresh','calendarAdd'].forEach(id=>$(id).disabled=loading);
  $('calendarMonthView').setAttribute('aria-pressed',String(view==='month'));$('calendarDayView').setAttribute('aria-pressed',String(view==='day'));
  $('calendarLayout').classList.toggle('calendar-day-only',view==='day');
  $('calendarGrid').innerHTML=D.monthCells(year,month).map(value=>{
   const notes=rows.filter(row=>row.note_date===value),enabled=D.supported(value),outside=Number(value.slice(5,7))-1!==month;
   return `<button type="button" role="gridcell" class="calendar-cell${outside?' outside':''}${value===selected?' selected':''}${value===today()?' today':''}" data-calendar-day="${value}" ${!enabled?'disabled':''} aria-selected="${value===selected}" aria-label="${esc(display(value))}, ${notes.length} note${notes.length===1?'':'s'}"><span class="calendar-day-number">${Number(value.slice(8))}</span>${notes.slice(0,2).map(row=>`<span class="calendar-chip">${row.notify_email||row.notify_text?'<span aria-label="Reminder">◷</span> ':''}${esc(row.title)}</span>`).join('')}${notes.length>2?`<span class="calendar-more">+${notes.length-2} more</span>`:''}<span class="calendar-mobile-count">${notes.length?`${notes.length} note${notes.length===1?'':'s'}`:''}</span></button>`;
  }).join('');
  $('calendarDayTitle').textContent=display(selected,{weekday:'long',month:'long',day:'numeric'});
  const notes=rows.filter(row=>row.note_date===selected).sort((a,b)=>(a.note_time||'').localeCompare(b.note_time||'')||a.created_at.localeCompare(b.created_at));
  $('calendarDayCount').textContent=`${notes.length} note${notes.length===1?'':'s'} · Central time`;
  $('calendarDayNotes').innerHTML=loading?'<p class="calendar-empty">Loading notes…</p>':notes.length?notes.map(row=>`<article class="calendar-note"><div class="calendar-note-top"><span>${esc(clock(row.note_time))}</span><div><button type="button" data-calendar-edit="${row.id}">Edit</button><button type="button" data-calendar-delete="${row.id}" class="calendar-delete">Delete</button></div></div><h3>${esc(row.title)}</h3>${row.body?`<p class="calendar-note-body">${esc(row.body)}</p>`:''}${reminderSummary(row)}</article>`).join(''):'<div class="calendar-empty"><strong>No notes for this day</strong><p>Add a note, appointment, or reminder.</p></div>';
 }
 function reminderSummary(row){
  if(!row.notify_email&&!row.notify_text)return '';
  const at=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(row.remind_at));
  const jobs=(row.reminders||[]).filter(job=>job.revision===row.revision&&job.status!=='cancelled');
  const label={scheduled:'Scheduled',processing:'Submitting',submitted:'Submitted to email service',failed:'Failed'};
  return `<div class="calendar-reminder-summary"><strong>Reminder · ${esc(at)} Central</strong>${jobs.length?jobs.map(job=>`<span class="calendar-reminder-status ${job.status}">${job.channel==='text'?'Verizon text':'Email'}: ${label[job.status]||esc(job.status)}${job.last_error?`<small>${esc(job.last_error)}</small>`:''}</span>`).join(''):'<span>No pending reminder. Choose a future time to schedule another.</span>'}</div>`;
 }
 function setMonth(y,m){year=y;month=m;selected=`${year}-${String(month+1).padStart(2,'0')}-01`;load();}
 function formSnapshot(){return JSON.stringify([...$('calendarNoteForm').elements].filter(el=>el.name).map(el=>[el.name,el.type==='checkbox'?el.checked:el.value]));}
 function closeEditor(){if(saving)return;if(formSnapshot()!==original&&!confirm('Discard the unsaved calendar note changes?'))return;$('calendarNoteDialog').close();}
 function reminderControls(){
  const enabled=$('calendarReminderPreset').value!=='';
  $('calendarReminderOptions').classList.toggle('hidden',!enabled);
  $('calendarCustomTime').classList.toggle('hidden',$('calendarReminderPreset').value!=='custom');
  $('calendarEmailTo').disabled=!$('calendarNotifyEmail').checked||!enabled;
  $('calendarNotifyText').disabled=!capabilities.text_ready;
  $('calendarNotifyEmail').disabled=!capabilities.email_ready;
  $('calendarReminderHelp').textContent=$('calendarReminderPreset').value==='custom'?'Choose when to send the reminder, in Central time.':'Reminders count back from the note’s time, or 9:00 AM Central for an all-day note.';
 }
 async function openEditor(row){
  if(loading||saving)return;
  if(!profile){await context();}
  editId=row?.id||null;editRevision=row?.revision||null;$('calendarNoteForm').reset();
  $('calendarEditorTitle').textContent=row?'Edit calendar note':'Add calendar note';
  $('calendarNoteDate').value=row?.note_date||selected;$('calendarNoteTime').value=row?.note_time?.slice(0,5)||'';
  $('calendarNoteTitle').value=row?.title||'';$('calendarNoteBody').value=row?.body||'';
  $('calendarReminderPreset').value=row?.remind_at?(row.reminder_hours?String(row.reminder_hours):'custom'):'';
  $('calendarNotifyEmail').checked=row?row.notify_email:true;$('calendarNotifyText').checked=row?.notify_text||false;
  $('calendarEmailTo').value=row?.email_to||profile.email||'';
  const local=row?.remind_local||`${selected}T09:00:00`;
  $('calendarReminderDate').value=local.slice(0,10);$('calendarReminderTime').value=local.slice(11,16);
  $('calendarEditorMsg').textContent='';$('calendarBodyCount').textContent=`${$('calendarNoteBody').value.length} / 5000`;
  $('calendarProviderNotice').textContent='Checking reminder services…';
  $('calendarNoteDialog').showModal();
  await loadCapabilities();
  $('calendarProviderNotice').innerHTML=capabilities.email_ready?`<span>Email reminders are available.</span>${capabilities.text_ready?'<span>Text destination: <strong>615-785-0344</strong> via Verizon Vtext. Verizon is retiring this service by March 31, 2027; delivery may fail sooner. Use email as a backup. <a href="https://www.verizon.com/support/vtext-vzwpix-shutdown/" target="_blank" rel="noopener">Verizon notice</a></span>':'<span>Text reminders are not configured for this company.</span>'}`:'Reminder service status could not be checked. Refresh Calendar and try again before adding a reminder.';
  reminderControls();original=formSnapshot();$('calendarNoteTitle').focus();
 }
 async function save(event){
  event.preventDefault();if(saving)return;
  const preset=$('calendarReminderPreset').value,notifyEmail=!!preset&&$('calendarNotifyEmail').checked,notifyText=!!preset&&$('calendarNotifyText').checked;
  const title=$('calendarNoteTitle').value.trim(),date=$('calendarNoteDate').value;
  if(!title||!D.supported(date)){$('calendarEditorMsg').textContent='Enter a title and a date in 2026 or 2027.';return;}
  if(preset&&(!notifyEmail&&!notifyText)){$('calendarEditorMsg').textContent='Choose Email, Verizon text, or both for the reminder.';return;}
  if((notifyEmail&&!capabilities.email_ready)||(notifyText&&!capabilities.text_ready)){$('calendarEditorMsg').textContent='The selected reminder service is unavailable. Choose another option or save without a reminder.';return;}
  const custom=preset==='custom';
  if(custom&&(!$('calendarReminderDate').value||!$('calendarReminderTime').value)){$('calendarEditorMsg').textContent='Choose a reminder date and time.';return;}
  try{
   saving=true;$('calendarSave').disabled=true;$('calendarEditorMsg').textContent='Saving…';
   const payload={note_date:date,note_time:$('calendarNoteTime').value||null,title,body:$('calendarNoteBody').value,reminder_hours:preset&&!custom?Number(preset):null,remind_local:custom?`${$('calendarReminderDate').value}T${$('calendarReminderTime').value}:00`:null,notify_email:notifyEmail,notify_text:notifyText,email_to:notifyEmail?$('calendarEmailTo').value.trim():null};
   const query=editId?s.from('admin_calendar_notes').update(payload).eq('id',editId).eq('company_id',profile.company_id).eq('revision',editRevision):s.from('admin_calendar_notes').insert({...payload,company_id:profile.company_id});
   const {data,error}=await query.select('id').single();if(error)throw Error(error.code==='PGRST116'?'This note changed in another session. Close the editor and refresh Calendar before editing again.':error.message);
   if(!data)throw Error('The note could not be saved.');
   $('calendarNoteDialog').close();selected=date;year=Number(date.slice(0,4));month=Number(date.slice(5,7))-1;await load();message('Calendar note saved.');
  }catch(error){$('calendarEditorMsg').textContent=`Unable to save: ${error.message}`;}
  finally{saving=false;$('calendarSave').disabled=false;}
 }
 async function remove(row){
  if(!row||loading)return;
  if(!confirm(`Delete “${row.title}” and cancel its pending reminders? You can undo this deletion.`))return;
  const {data,error}=await s.from('admin_calendar_notes').update({deleted_at:new Date().toISOString()}).eq('id',row.id).eq('company_id',profile.company_id).eq('revision',row.revision).select('id,revision').single();
  if(error){message(`Unable to delete note: ${error.message}`);return;}
  lastDeleted=data;await load();message('Note deleted. Its pending reminders were cancelled.');$('calendarUndo').classList.remove('hidden');
 }
 $('calendarUndo').onclick=async()=>{if(!lastDeleted)return;const {error}=await s.from('admin_calendar_notes').update({deleted_at:null}).eq('id',lastDeleted.id).eq('company_id',profile.company_id).eq('revision',lastDeleted.revision).select('id').single();if(error){message(`Unable to restore: ${error.message}`);return;}lastDeleted=null;$('calendarUndo').classList.add('hidden');await load();message('Calendar note restored. Future reminders were restored too.');};
 $('calendarNoteForm').onsubmit=save;$('calendarCloseEditor').onclick=$('calendarCancel').onclick=closeEditor;
 $('calendarNoteDialog').addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
 $('calendarReminderPreset').onchange=$('calendarNotifyEmail').onchange=reminderControls;
 $('calendarNoteBody').oninput=()=>{$('calendarBodyCount').textContent=`${$('calendarNoteBody').value.length} / 5000`;};
 $('calendarGrid').onclick=event=>{const button=event.target.closest('[data-calendar-day]');if(!button||button.disabled||loading)return;selected=button.dataset.calendarDay;const nextMonth=Number(selected.slice(5,7))-1;if(nextMonth!==month){month=nextMonth;year=Number(selected.slice(0,4));load();}else render();if(matchMedia('(max-width: 900px)').matches)$('calendarDayPanel').scrollIntoView({behavior:'smooth',block:'start'});};
 $('calendarDayNotes').onclick=event=>{const edit=event.target.closest('[data-calendar-edit]'),del=event.target.closest('[data-calendar-delete]');if(edit)openEditor(rows.find(row=>row.id===edit.dataset.calendarEdit));if(del)remove(rows.find(row=>row.id===del.dataset.calendarDelete));};
 $('calendarAdd').onclick=$('calendarDayAdd').onclick=()=>openEditor();
 $('calendarPrev').onclick=()=>setMonth(month===0?year-1:year,month===0?11:month-1);
 $('calendarNext').onclick=()=>setMonth(month===11?year+1:year,month===11?0:month+1);
 $('calendarMonth').onchange=()=>setMonth(year,Number($('calendarMonth').value));$('calendarYear').onchange=()=>setMonth(Number($('calendarYear').value),month);
 $('calendarToday').onclick=()=>{selected=D.supported(today())?today():'2027-12-31';year=Number(selected.slice(0,4));month=Number(selected.slice(5,7))-1;load();};
 $('calendarRefresh').onclick=load;$('calendarMonthView').onclick=()=>{view='month';render();};$('calendarDayView').onclick=()=>{view='day';render();};
 document.querySelector('nav [data-view="calendar"]').addEventListener('click',()=>{document.querySelectorAll('.view').forEach(el=>el.classList.toggle('hidden',el.id!=='calendar'));$('title').textContent='Calendar';load();});
 document.querySelectorAll('nav [data-view]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.view!=='calendar')$('calendar').classList.add('hidden');}));
 s.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){request++;rows=[];profile=null;lastDeleted=null;capabilities={};$('calendarNoteDialog').close();$('calendar').classList.add('hidden');$('calendarNoteForm').reset();$('calendarUndo').classList.add('hidden');render();}});
 render();
})();
