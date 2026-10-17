(() => {
  'use strict';
  const s = window.FP365_ADMIN_CLIENT, $ = id => document.getElementById(id);
  if (!s || !$('notes')) return;
  const categories = ['General','Important','Urgent','Escalate','Resolved','Completed','Other'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let rows = [], selected = null, editing = false, busy = false, companyId;
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
    $('saveNote').disabled = busy || !editing;
    $('newNote').disabled = busy;
    $('editNote').disabled = busy || editing || !selected;
    $('deleteNote').disabled = busy || editing || !selected;
    $('cancelNote').disabled = busy;
    $('noteEditor').querySelectorAll('input,select,textarea').forEach(el => el.disabled = busy);
    $('exportNotes').disabled = busy || !filtered().length;
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
  function render() {
    const visible = filtered();
    if (!visible.some(r => r.id === selected)) selected = null;
    $('notesList').innerHTML = visible.length ? visible.map(r => `<article class="note-record"><label><input type="radio" name="selectedNote" value="${esc(r.id)}" ${r.id===selected?'checked':''} ${editing||busy?'disabled':''}><strong>${esc(displayDate(r.note_date))}</strong><span class="note-category">${esc(r.category)}</span></label><p>${esc(r.body)}</p></article>`).join('') : '<p>No notes match these filters.</p>';
    controls();
  }
  async function load() {
    await context();
    const {data,error} = await s.from('admin_notes').select('*').eq('company_id',companyId).order('note_date',{ascending:false});
    if(error) throw error;
    rows = data || []; render();
  }
  function closeEditor() { editing = false; $('noteEditor').classList.add('hidden'); render(); }
  function openEditor(row) {
    if(editing && !confirm('Discard the unsaved note changes?')) return;
    selected = row?.id || null; editing = true;
    $('noteDate').value = displayDate(row?.note_date || today());
    $('noteCategory').value = row?.category || 'General';
    $('noteBody').value = row?.body || '';
    $('noteCount').textContent = `${$('noteBody').value.length} / 3000`;
    $('noteEditor').classList.remove('hidden'); message(''); render(); $('noteBody').focus();
  }
  async function save(event) {
    event?.preventDefault(); if(busy || !editing) return;
    try {
      const date = parseDate($('noteDate').value.trim()), body = $('noteBody').value;
      if(!body.trim()) throw Error('Enter a note before saving.');
      if(body.length>3000) throw Error('Notes must be 3,000 characters or fewer.');
      busy = true; controls(); await context();
      const payload = {note_date:date,category:$('noteCategory').value,body,updated_at:new Date().toISOString()};
      const query = selected ? s.from('admin_notes').update(payload).eq('id',selected).eq('company_id',companyId) : s.from('admin_notes').insert({...payload,company_id:companyId});
      const {data,error} = await query.select().single(); if(error) throw error;
      rows = rows.filter(r => r.id!==data.id); rows.push(data); selected = data.id;
      closeEditor(); message('Note saved.');
    } catch(error) { message(`Unable to save note: ${error.message}`); }
    finally { busy = false; render(); }
  }
  async function remove() {
    if(busy || editing || !selected || !confirm('Delete the selected note? This cannot be undone.')) return;
    try {
      busy = true; controls(); await context();
      const {data,error} = await s.from('admin_notes').delete().eq('id',selected).eq('company_id',companyId).select('id').single();
      if(error) throw error;
      rows = rows.filter(r => r.id!==data.id); selected = null; message('Note deleted.');
    } catch(error) { message(`Unable to delete note: ${error.message}`); }
    finally { busy = false; render(); }
  }
  function exportPdf() {
    try {
      const visible = filtered(); if(!visible.length) throw Error('No notes match these filters.');
      const JsPDF = window.jspdf?.jsPDF; if(!JsPDF) throw Error('PDF export is unavailable. Reload the portal and try again.');
      const doc = new JsPDF({unit:'pt',format:'letter'});
      doc.setFontSize(18); doc.text('Fleet Protect 365 — Notes',40,40);
      doc.setFontSize(10); doc.text(`Category: ${$('notesCategory').value || 'All categories'} | ${$('notesSort').selectedOptions[0].textContent}`,40,60);
      doc.autoTable({startY:76,margin:40,head:[['Date','Category','Note']],body:visible.map(r=>[displayDate(r.note_date),r.category,r.body]),styles:{fontSize:9,cellPadding:6,overflow:'linebreak'},columnStyles:{0:{cellWidth:65},1:{cellWidth:75},2:{cellWidth:392}},headStyles:{fillColor:[31,111,209]}});
      doc.save(`FP365-Notes-${today()}.pdf`);
    } catch(error) { message(error.message); }
  }
  categories.forEach(category => { $('noteCategory').add(new Option(category,category)); $('notesCategory').add(new Option(category,category)); });
  $('newNote').onclick = () => openEditor();
  $('editNote').onclick = () => openEditor(rows.find(r=>r.id===selected));
  $('saveNote').onclick = save; $('noteEditor').onsubmit = save; $('deleteNote').onclick = remove;
  $('cancelNote').onclick = () => { if(confirm('Discard the unsaved note changes?')) { closeEditor(); message('Changes discarded.'); } };
  $('noteBody').oninput = () => { $('noteCount').textContent = `${$('noteBody').value.length} / 3000`; };
  $('notesList').onchange = event => { if(event.target.name==='selectedNote') { selected = event.target.value; controls(); } };
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
  s.auth.onAuthStateChange(event => { if(event==='SIGNED_OUT') { rows=[]; selected=null; companyId=null; editing=false; $('noteEditor').reset(); $('noteEditor').classList.add('hidden'); render(); } });
  controls();
})();
