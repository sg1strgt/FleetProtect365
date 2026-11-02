(() => {
  'use strict';
  const s = window.FP365_ADMIN_CLIENT, $ = id => document.getElementById(id);
  if (!s || !$('notes')) return;
  const categories = ['General','Important','Urgent','Escalate','Resolved','Completed','Other'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let rows = [], selected = null, editing = false, busy = false, companyId, updateMode = false;
  const photos = window.FP365_CREATE_NOTE_PHOTOS({client:s,onChange:controls,onMessage:message});
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const displayDate = iso => { const [y,m,d] = iso.split('-'); return `${m}/${d}/${y}`; };
  function parseDate(value) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (!match) throw Error('Enter the date as MM/DD/YYYY.');
    const [,m,d,y] = match, iso = `${y}-${m}-${d}`, date = new Date(`${iso}T12:00:00`);
    if (Number(y)<1 || Number.isNaN(date.getTime()) || date.getFullYear()!==Number(y) || date.getMonth()+1!==Number(m) || date.getDate()!==Number(d)) throw Error('Enter a valid date.');
    return iso;
  }
  function message(value) { $('notesMsg').textContent = value; }
  function controls() {
    $('saveNote').disabled = busy || !editing || photos.processing;
    $('newNote').disabled = busy;
    $('notesSort').disabled = busy || editing; $('notesCategory').disabled = busy || editing;
    $('editNote').disabled = busy || editing || !selected;
    $('addNoteUpdate').disabled = busy || editing || !selected;
    $('deleteNote').disabled = busy || editing || !selected;
    $('cancelNote').disabled = busy;
    $('notesList').querySelectorAll('input[name=selectedNote]').forEach(el => el.disabled = busy || editing);
    $('noteEditor').querySelectorAll('input,select,textarea').forEach(el => el.disabled = busy);
    photos.setBusy(busy);
    $('exportNotes').disabled = busy || !filtered().length;
    $('emailNotes').disabled = busy || editing || !filtered().length;
  }
  async function context() {
    const {data:session,error:sessionError} = await s.auth.getSession();
    if(sessionError) throw sessionError;
    if(!session.session?.user) throw Error('Sign in to manage notes.');
    const {data,error} = await s.from('employee_profiles').select('company_id,role').eq('id',session.session.user.id).is('deleted_at',null).single();
    if(error) throw error;
    if(!['admin','super_admin'].includes(data.role)) throw Error('Admin access required.');
    companyId = data.company_id;
  }
  function filtered() {
    return rows.filter(r => !$('notesCategory').value || r.category === $('notesCategory').value).sort((a,b) => {
      const cmp = a.note_date.localeCompare(b.note_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
      return $('notesSort').value === 'oldest' ? cmp : -cmp;
    });
  }
  const updatesFor = row => [...(row.updates || [])].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  function updateText(update) { return `Update · ${displayDate(update.update_date)} · ${update.author_name} · ${update.category}${update.previous_category !== update.category ? ` (was ${update.previous_category})` : ''}`; }
  function render() {
    if($('noteEditor').closest('.note-record')) $('notesList').before($('noteEditor'));
    const visible = filtered();
    if (!visible.some(r => r.id === selected)) selected = null;
    const chosen = rows.find(r => r.id === selected);
    $('noteSelection').textContent = chosen ? `Selected: ${displayDate(chosen.note_date)} · ${chosen.category}` : 'Select a saved note to edit it or add an update.';
    $('notesList').innerHTML = visible.length ? visible.map(r => {
      const updates = updatesFor(r), originalCategory = updates[0]?.previous_category;
      return `<article class="note-record" data-note-id="${esc(r.id)}"><label><input type="radio" name="selectedNote" value="${esc(r.id)}" ${r.id===selected?'checked':''} ${editing||busy?'disabled':''}><strong>${esc(displayDate(r.note_date))}</strong><span class="note-category">${esc(r.category)}</span></label>${originalCategory ? `<small>Original category: ${esc(originalCategory)}</small>` : ''}<p>${esc(r.body)}</p>${photos.gallery((r.photos || []).filter(p=>!p.update_id))}<div class="note-updates">${updates.map(u => `<section class="note-update"><h4>${esc(updateText(u))}</h4><p>${esc(u.body)}</p>${photos.gallery((r.photos || []).filter(p=>p.update_id===u.id))}</section>`).join('')}</div></article>`;
    }).join('') : '<p>No notes match these filters.</p>';
    if(editing && updateMode) { const card = [...$('notesList').children].find(el => el.dataset.noteId===selected); card?.appendChild($('noteEditor')); }
    controls();
  }
  async function load() {
    await context();
    const {data,error} = await s.from('admin_notes').select('*,updates:admin_note_updates(*),photos:admin_note_photos(*)').eq('company_id',companyId).order('note_date',{ascending:false});
    if(error) throw error;
    rows = data || []; await photos.hydrate(rows); render();
    controls();
  }
  function closeEditor() { photos.reset(); editing = false; updateMode = false; $('notesList').before($('noteEditor')); $('noteEditor').classList.add('hidden'); render(); }
  function openEditor(row, addingUpdate = false) {
    if(editing && !confirm('Discard the unsaved note changes?')) return;
    photos.begin(row,addingUpdate);
    selected = row?.id || null; editing = true; updateMode = addingUpdate;
    $('noteEditorTitle').textContent = updateMode ? 'Add Update' : row ? 'Edit Note' : 'New Note';
    $('noteDate').value = displayDate(updateMode ? today() : row?.note_date || today());
    $('noteCategory').value = row?.category || 'General';
    $('noteBody').value = updateMode ? '' : row?.body || '';
    $('noteCount').textContent = `${$('noteBody').value.length} / 3000`;
    $('noteEditor').classList.remove('hidden'); message(''); render(); if(updateMode) { const card = [...$('notesList').children].find(el => el.dataset.noteId === selected); card?.appendChild($('noteEditor')); } else $('notesList').before($('noteEditor')); $('noteBody').focus();
  }
  async function save(event) {
    event?.preventDefault(); if(busy || !editing || photos.processing) return;
    try {
      const date = parseDate($('noteDate').value.trim()), body = $('noteBody').value;
      if(!body.trim()) throw Error('Enter a note before saving.');
      if(body.length>3000) throw Error('Notes must be 3,000 characters or fewer.');
      busy = true; controls(); await context();
      const wasUpdate = updateMode;
      const attachmentPayload = await photos.upload(companyId);
      const {data:result,error:saveError} = await s.rpc('save_admin_note_with_photos',{
        ...attachmentPayload,save_mode:updateMode?'update':selected?'edit':'create',
        target_date:date,target_category:$('noteCategory').value,target_body:body
      });
      if(saveError) throw saveError;
      photos.committed(); selected=result.note_id;
      // Refresh the committed note and immutable history as one server result.
      const {data:saved,error:readError}=await s.from('admin_notes').select('*,updates:admin_note_updates(*),photos:admin_note_photos(*)').eq('id',result.note_id).eq('company_id',companyId).single();
      photos.cleanup(result.removed_paths || []);
      if(readError) {
        closeEditor(); await load(); selected=result.note_id; render(); message('Note and photos saved.');
      } else {
        rows=rows.filter(r=>r.id!==saved.id); rows.push(saved);
        if($('notesCategory').value && $('notesCategory').value!==saved.category) $('notesCategory').value='';
        await photos.hydrate([saved]);
        closeEditor(); message(wasUpdate?'Update and photos saved.':'Note and photos saved.');
      }
    } catch(error) { message(`Unable to save note: ${error.message}`); }
    finally { busy = false; render(); }
  }
  async function remove() {
    if(busy || editing || !selected || !confirm('Delete the selected note and all its updates? This cannot be undone.')) return;
    try {
      busy = true; controls(); await context();
      const {data,error} = await s.from('admin_notes').delete().eq('id',selected).eq('company_id',companyId).select('id').single();
      if(error) throw error;
      photos.cleanup((rows.find(r=>r.id===data.id)?.photos || []).map(p=>p.storage_path));
      rows = rows.filter(r => r.id!==data.id); selected = null; message('Note deleted.');
    } catch(error) { message(`Unable to delete note: ${error.message}`); }
    finally { busy = false; render(); }
  }
  function buildPdf() {
      const visible = filtered(); if(!visible.length) throw Error('No notes match these filters.');
      const JsPDF = window.jspdf?.jsPDF; if(!JsPDF) throw Error('PDF export is unavailable. Reload the portal and try again.');
      const doc = new JsPDF({unit:'pt',format:'letter'});
      doc.setFontSize(18); doc.text('Fleet Protect 365 — Notes',40,40);
      doc.setFontSize(10); doc.text(`Category: ${$('notesCategory').value || 'All categories'} | ${$('notesSort').selectedOptions[0].textContent}`,40,60);
      doc.autoTable({startY:76,margin:40,head:[['Date','Category','Note']],body:visible.map(r=>[displayDate(r.note_date),r.category,[r.body,...updatesFor(r).map(u=>`${updateText(u)}\n${u.body}`)].join('\n\n')]),styles:{fontSize:9,cellPadding:6,overflow:'linebreak'},columnStyles:{0:{cellWidth:65},1:{cellWidth:75},2:{cellWidth:392}},headStyles:{fillColor:[31,111,209]}});
      return {doc,fileName:`FP365-Notes-${today()}.pdf`,count:visible.length};
  }
  function exportPdf() {
    try { const report = buildPdf(); report.doc.save(report.fileName); }
    catch(error) { message(error.message); }
  }
  async function emailPdf() {
    if(busy || editing) return;
    const email = 'reports@fleetprotect365.com';
    const destination = email;
    try {
      const report = buildPdf();
      busy = true; controls(); message(`Sending PDF to ${destination}…`);
      const pdfBase64 = report.doc.output('datauristring').split(',')[1];
      const {data,error} = await s.functions.invoke('email-record-report',{body:{recipientEmail:email,reportType:'notes',fileName:report.fileName,pdfBase64,category:$('notesCategory').value || 'All categories',sortOrder:$('notesSort').selectedOptions[0].textContent,recordCount:report.count}});
      if(error || !data?.ok) {
        let detail = data?.error || error?.message || 'Unable to email the PDF.';
        if(error?.context?.json) { try { detail = (await error.context.json()).error || detail; } catch (_) {} }
        throw Error(detail);
      }
      message(`PDF submitted to the email provider for ${destination}. Delivery is not yet confirmed.`);
    } catch(error) { message(`Unable to email PDF: ${error.message}`); }
    finally { busy = false; controls(); }
  }
  categories.forEach(category => { $('noteCategory').add(new Option(category,category)); $('notesCategory').add(new Option(category,category)); });
  $('emailNotes').onclick = emailPdf;
  $('newNote').onclick = () => openEditor();
  $('editNote').onclick = () => openEditor(rows.find(r=>r.id===selected));
  $('addNoteUpdate').onclick = () => { const row = rows.find(r => r.id===selected); if(row) openEditor(row,true); };
  $('saveNote').onclick = save; $('noteEditor').onsubmit = save; $('deleteNote').onclick = remove;
  $('cancelNote').onclick = () => { if(confirm('Discard the unsaved note changes?')) { closeEditor(); message('Changes discarded.'); } };
  $('noteBody').oninput = () => { $('noteCount').textContent = `${$('noteBody').value.length} / 3000`; };
  $('notesList').onchange = event => { if(busy || editing) return; if(event.target.name==='selectedNote') { selected = event.target.value; render(); } };
  $('notesList').onclick = event => { const thumb=event.target.closest('[data-note-photo]'); if(thumb) { photos.expand(rows.flatMap(r=>r.photos || []).find(p=>p.id===thumb.dataset.notePhoto)); return; } if(busy || editing || event.target.closest('label,input,button,form')) return; const card = event.target.closest('[data-note-id]'); if(card) { selected = card.dataset.noteId; render(); } };
  $('notesSort').onchange = render; $('notesCategory').onchange = render; $('exportNotes').onclick = exportPdf;
  document.querySelector('nav [data-view="notes"]').addEventListener('click',async () => {
    document.querySelectorAll('.view').forEach(el=>el.classList.toggle('hidden',el.id!=='notes'));
    document.querySelectorAll('nav [data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view==='notes'));
    $('title').textContent = 'Notes';
    if(editing || busy) return;
    busy = true; controls(); message('Loading notes…');
    try { await load(); message(''); } catch(error) { rows=[]; message(`Unable to load notes: ${error.message}`); }
    finally { busy = false; render(); }
  });
  document.querySelectorAll('nav [data-view]').forEach(button => button.addEventListener('click', () => { if(button.dataset.view!=='notes') $('notes').classList.add('hidden'); }));
  s.auth.onAuthStateChange(event => { if(event==='SIGNED_OUT') { photos.clear(); $('notes').classList.add('hidden'); rows=[]; selected=null; companyId=null; editing=false; $('noteEditor').reset(); $('noteEditor').classList.add('hidden'); render(); } });
  controls();
})();
