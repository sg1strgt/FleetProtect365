(() => {
  'use strict';
  const s = window.FP365_ADMIN_CLIENT;
  if (!s) return;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let profile, company, legalFolderIdValue = '', questionType = 'question_pre', auditRows = [];

  async function context() {
    if (profile && company) return { profile, company };
    const { data: sessionData } = await s.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) throw new Error('Admin session is unavailable.');
    const { data, error } = await s.from('employee_profiles').select('*,companies(*)').eq('id', user.id).single();
    if (error) throw error;
    profile = data; company = data.companies;
    $('legalNav')?.classList.toggle('hidden', profile.role !== 'super_admin');
    return { profile, company };
  }

  function addDashboardControls() {
    const stats = document.querySelector('#dashboard .dashboard-stats');
    if (!stats || $('customizeDashboard')) return;
    stats.id = 'dashboardWidgets';
    const controls = document.createElement('div');
    controls.className = 'dashboard-controls';
    controls.innerHTML = '<button id="customizeDashboard" type="button">Customize Dashboard</button><button id="resetDashboard" type="button">Reset Layout</button><small>Choose Customize Dashboard, then drag cards or use − / + to change their size. This affects only the admin dashboard.</small>';
    stats.before(controls);
    let editing = false, key = 'fp365_admin_dashboard_layout';
    const cards = [...stats.children].filter(x => !x.classList.contains('hidden'));
    context().then(({profile:p}) => { key += `_${p.id}`; restore(); });
    cards.forEach((card, index) => {
      card.dataset.widget = card.querySelector('strong')?.id || String(index);
      card.dataset.size = 'small';
      const tools = document.createElement('div');
      tools.className = 'widget-tools';
      tools.innerHTML = '<span>Drag</span><button type="button" data-widget-smaller aria-label="Make widget smaller">−</button><button type="button" data-widget-larger aria-label="Make widget larger">+</button>';
      card.appendChild(tools);
      card.draggable = true;
      card.addEventListener('dragstart', () => card.classList.add('dragging'));
      card.addEventListener('dragend', () => { card.classList.remove('dragging'); saveLayout(); });
      card.addEventListener('dragover', e => {
        if (!editing) return;
        e.preventDefault();
        const moving = stats.querySelector('.dragging');
        if (moving && moving !== card) stats.insertBefore(moving, card);
      });
      tools.addEventListener('click', e => {
        const sizes = ['small','medium','large'];
        let at = sizes.indexOf(card.dataset.size || 'small');
        if (e.target.closest('[data-widget-smaller]')) at = Math.max(0, at - 1);
        else if (e.target.closest('[data-widget-larger]')) at = Math.min(sizes.length - 1, at + 1);
        else return;
        card.dataset.size = sizes[at];
        saveLayout();
      });
    });
    function saveLayout() {
      const value = [...stats.children].filter(x => !x.classList.contains('hidden')).map(x => ({id:x.dataset.widget,size:x.dataset.size || 'small'}));
      localStorage.setItem(key, JSON.stringify(value));
    }
    function restore() {
      try {
        const saved = JSON.parse(localStorage.getItem(key) || '[]');
        saved.forEach(item => {
          const card = cards.find(x => x.dataset.widget === item.id);
          if (card) { card.dataset.size = item.size || 'small'; stats.appendChild(card); }
        });
      } catch (_) {}
    }
    $('customizeDashboard').onclick = () => {
      editing = !editing;
      stats.classList.toggle('customizing', editing);
      $('customizeDashboard').textContent = editing ? 'Finish Customizing' : 'Customize Dashboard';
      if (!editing) saveLayout();
    };
    $('resetDashboard').onclick = () => {
      localStorage.removeItem(key);
      cards.forEach(card => { card.dataset.size = 'small'; stats.appendChild(card); });
    };
  }

  async function loadDashboardStats() {
    try {
      const { company: co } = await context();
      const since = new Date(); since.setHours(0,0,0,0); since.setDate(since.getDate() - 6);
      const [employees, trucks, inspections, recent] = await Promise.all([
        s.from('employee_profiles').select('role,status').eq('company_id', co.id).is('deleted_at', null),
        s.from('trucks').select('status').eq('company_id', co.id).is('deleted_at', null),
        s.from('inspections').select('*', { count:'exact', head:true }).eq('company_id', co.id),
        s.from('inspections').select('submitted_at,status,has_bypass').eq('company_id', co.id).gte('submitted_at', since.toISOString()).order('submitted_at')
      ]);
      $('userCount').textContent = (employees.data || []).length;
      $('activeDriverCount').textContent = (employees.data || []).filter(x => x.role === 'driver' && x.status === 'active').length;
      $('truckCount').textContent = (trucks.data || []).filter(x => x.status === 'active').length;
      $('totalInspectionCount').textContent = inspections.count || 0;
      const rows = recent.data || [];
      $('inspectionLast7Count').textContent = rows.length;
      const flagged = rows.filter(x => x.has_bypass || String(x.status).toLowerCase() === 'flagged').length;
      $('inspectionFlaggedCount').textContent = flagged;
      $('inspectionVerifiedRate').textContent = rows.length ? `${Math.round(((rows.length - flagged) / rows.length) * 100)}%` : '—';
      renderInspectionTrend(rows, since);
    } catch (error) { console.error(error); }
  }

  function renderInspectionTrend(rows, start) {
    const trend = $('inspectionTrend'); if (!trend) return;
    const days = Array.from({length:7}, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return { date:d, key:d.toISOString().slice(0,10), count:0 }; });
    rows.forEach(row => { const key = String(row.submitted_at || '').slice(0,10); const day = days.find(x => x.key === key); if (day) day.count += 1; });
    const max = Math.max(1, ...days.map(x => x.count));
    trend.innerHTML = days.map(day => `<div class="trend-day" title="${esc(day.date.toLocaleDateString())}: ${day.count}"><span class="trend-value">${day.count}</span><span class="trend-bar" style="height:${Math.max(8, Math.round((day.count / max) * 76))}px"></span><small>${esc(day.date.toLocaleDateString(undefined,{weekday:'short'}))}</small></div>`).join('');
  }

  async function loadSettings() {
    try {
      const { company: co } = await context(); company = co;
      const values = {addressStreet:'address_street',addressSuite:'address_suite',addressCity:'address_city',addressState:'address_state',addressZip:'address_zip',companyNotes:'admin_notes',logoUrl:'logo_url',logoScale:'logo_scale',documentsFolderId:'documents_drive_folder_id'};
      Object.entries(values).forEach(([id,key]) => { if ($(id)) $(id).value = co[key] ?? (id === 'logoScale' ? 100 : ''); });
      $('legalFolderSetting')?.classList.toggle('hidden', profile?.role !== 'super_admin');
      if (profile?.role === 'super_admin') {
        const {data, error} = await s.from('company_private_settings').select('legal_drive_folder_id').eq('company_id', co.id).maybeSingle();
        if (error) throw error;
        legalFolderIdValue = data?.legal_drive_folder_id || '';
        if ($('legalFolderId')) $('legalFolderId').value = legalFolderIdValue;
      }
      updateFolderLinks();
      updateSettingsPreview();
    } catch (error) { $('settingsMsg').textContent = error.message; }
  }
  function updateSettingsPreview() {
    const notes = $('companyNotes')?.value || '';
    if ($('settingsNotesCount')) $('settingsNotesCount').textContent = `${notes.length} / 750`;
    const scale = Math.max(50, Math.min(100, Number($('logoScale')?.value || 100)));
    if ($('logoScale')) $('logoScale').value = String(scale);
    if ($('logoScaleValue')) $('logoScaleValue').textContent = `${scale}%`;
    const logo = $('companyLogo'), tile = logo?.closest('.company-logo-frame');
    if (logo && $('logoUrl')?.value) logo.src = $('logoUrl').value;
    if (tile) {
      tile.style.setProperty('--logo-tile-scale', String(scale / 100));
      tile.style.marginBottom = `${-116 * (1 - scale / 100)}px`;
    }
  }
  async function saveSettings() {
    try {
      const { company: co } = await context();
      const logoFile = $('logoFile')?.files?.[0];
      let logoUploadError = null;
      if (logoFile) {
        if (!logoFile.type.startsWith('image/')) throw new Error('Choose an image file for the company logo.');
        if (logoFile.size > 5 * 1024 * 1024) throw new Error('The logo image must be 5 MB or smaller.');
        const extension = (logoFile.name.split('.').pop() || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase();
        const path = `${co.id}/logo-${Date.now()}.${extension}`;
        try {
          const content = await logoFile.arrayBuffer();
          if (!content.byteLength) throw new Error('The selected logo file is empty.');
          const { error: uploadError } = await s.storage.from('company-assets').upload(path, content, { upsert:true, contentType:logoFile.type || 'application/octet-stream' });
          if (uploadError) throw uploadError;
          $('logoUrl').value = s.storage.from('company-assets').getPublicUrl(path).data.publicUrl;
        } catch (error) { logoUploadError = error; }
      }
      const update = {address_street:$('addressStreet').value.trim(),address_suite:$('addressSuite').value.trim()||null,address_city:$('addressCity').value.trim(),address_state:$('addressState').value.trim().toUpperCase(),address_zip:$('addressZip').value.trim(),admin_notes:$('companyNotes').value.trim()||null,logo_url:$('logoUrl').value.trim()||null,logo_scale:Number($('logoScale').value),storage_location:$('driveFolder').value.trim(),documents_drive_folder_id:$('documentsFolderId').value.trim()||null,contact_name:$('contactName').value.trim(),contact_email:$('contactEmail').value.trim(),contact_phone:$('contactPhone').value.trim()};
      if (!update.address_street || !update.address_city || !update.address_state || !update.address_zip) throw new Error('Street, City, State, and ZIP are required.');
      const { data, error } = await s.from('companies').update(update).eq('id', co.id).select('*').single();
      if (error) throw error;
      if (profile?.role === 'super_admin') {
        legalFolderIdValue = $('legalFolderId').value.trim();
        const {error: privateError} = await s.from('company_private_settings').upsert({company_id:co.id,legal_drive_folder_id:legalFolderIdValue||null,updated_at:new Date().toISOString()});
        if (privateError) throw privateError;
      }
      company = data;
      $('settingsMsg').textContent = logoUploadError
        ? `Company settings saved, but the logo image was not replaced: ${logoUploadError.message}`
        : 'Company settings saved.';
      updateFolderLinks(); updateSettingsPreview();
    } catch (error) { $('settingsMsg').textContent = error.message; }
  }

  function ensureContentDialog() {
    if ($('contentDialog')) return;
    const dialog = document.createElement('dialog'); dialog.id = 'contentDialog';
    dialog.innerHTML = '<form id="contentForm"><h3 id="contentDialogTitle">Add Item</h3><input id="contentId" type="hidden"><input id="contentType" type="hidden"><label>Title / Question *</label><input id="contentTitle" required maxlength="300"><label id="contentUrlLabel">Link</label><input id="contentUrl" type="url" placeholder="https://..."><label>Notes / Description</label><textarea id="contentBody" rows="4" maxlength="1000"></textarea><label>Display Order</label><input id="contentOrder" type="number" min="0" value="0"><label class="check-row"><input id="contentActive" type="checkbox" checked> Active</label><p id="contentMsg"></p><div class="actions"><button id="deleteContent" type="button" class="danger hidden">Remove</button><button id="cancelContent" type="button">Cancel</button><button type="submit" class="primary">Save</button></div></form>';
    document.body.appendChild(dialog);
    $('cancelContent').onclick = () => dialog.close();
    $('contentForm').onsubmit = saveContent;
    $('deleteContent').onclick = deleteContent;
  }
  function openContent(type, item) {
    ensureContentDialog();
    $('contentForm').reset(); $('contentId').value = item?.id || ''; $('contentType').value = type;
    $('contentTitle').value = item?.title || ''; $('contentUrl').value = item?.url || ''; $('contentBody').value = item?.body || ''; $('contentOrder').value = item?.sort_order || 0; $('contentActive').checked = item?.active ?? true;
    $('contentUrlLabel').classList.toggle('hidden', type.startsWith('question_')); $('contentUrl').classList.toggle('hidden', type.startsWith('question_'));
    $('deleteContent').classList.toggle('hidden', !item); $('contentDialogTitle').textContent = item ? 'Edit Item' : 'Add Item'; $('contentMsg').textContent=''; $('contentDialog').showModal();
  }
  async function saveContent(e) {
    e.preventDefault();
    try {
      const {profile:p, company:co} = await context(), id=$('contentId').value, type=$('contentType').value;
      const record={company_id:co.id,content_type:type,title:$('contentTitle').value.trim(),url:$('contentUrl').value.trim()||null,body:$('contentBody').value.trim()||null,sort_order:Number($('contentOrder').value)||0,active:$('contentActive').checked,updated_by:p.id,updated_at:new Date().toISOString()};
      const query=id?s.from('company_content').update(record).eq('id',id):s.from('company_content').insert({...record,created_by:p.id}); const {error}=await query; if(error)throw error;
      $('contentDialog').close(); await loadContent(type);
    } catch(error){$('contentMsg').textContent=error.message;}
  }
  async function deleteContent() {
    if (!confirm('Remove this item?')) return;
    const id=$('contentId').value,type=$('contentType').value,{error}=await s.from('company_content').delete().eq('id',id); if(error)return $('contentMsg').textContent=error.message; $('contentDialog').close(); loadContent(type);
  }
  function targetFor(type){return type.startsWith('question_')?'questionsList':`${type}List`;}
  function driveFolderUrl(id){return id?`https://drive.google.com/drive/folders/${encodeURIComponent(id)}`:'';}
  function updateFolderLinks(){
    const docs=$('documentsFolderLink'),legal=$('legalFolderLink');
    if(docs){const url=driveFolderUrl(company?.documents_drive_folder_id||$('documentsFolderId')?.value);docs.href=url;docs.classList.toggle('hidden',!url);}
    if(legal){const url=driveFolderUrl(legalFolderIdValue||$('legalFolderId')?.value);legal.href=url;legal.classList.toggle('hidden',profile?.role!=='super_admin'||!url);}
  }
  async function loadContent(type) {
    try {
      const {profile:p,company:co}=await context();
      if(type==='legal'&&p.role==='super_admin'&&!legalFolderIdValue){const {data:privateData,error:privateError}=await s.from('company_private_settings').select('legal_drive_folder_id').eq('company_id',co.id).maybeSingle();if(privateError)throw privateError;legalFolderIdValue=privateData?.legal_drive_folder_id||'';}
      updateFolderLinks(); const types=type==='questions'?[questionType]:[type];
      const {data,error}=await s.from('company_content').select('*').eq('company_id',co.id).in('content_type',types).order('sort_order').order('title'); if(error)throw error;
      const target=$(targetFor(type==='questions'?questionType:type)); if(!target)return;
      target.innerHTML=(data||[]).map(item=>`<article class="content-item"><div><h3>${esc(item.title)}</h3>${item.body?`<p>${esc(item.body)}</p>`:''}${item.url?`<a href="${esc(item.url)}" target="_blank" rel="noopener">Open link</a>`:''}<small>${item.active?'Active':'Inactive'} · Order ${item.sort_order}</small></div><button data-edit-content="${esc(item.id)}">Edit</button></article>`).join('')||'<p class="empty-content">No items have been added.</p>';
      target.querySelectorAll('[data-edit-content]').forEach(btn=>btn.onclick=()=>openContent((data||[]).find(x=>x.id===btn.dataset.editContent).content_type,(data||[]).find(x=>x.id===btn.dataset.editContent)));
    } catch(error){const target=$(targetFor(type==='questions'?questionType:type));if(target)target.innerHTML=`<p>${esc(error.message)}</p>`;}
  }

  async function loadAuditRows() {
    const {company:co}=await context(); const {data,error}=await s.from('employee_status_audit').select('*,employee_profiles!employee_status_audit_employee_profile_id_fkey(display_name,full_name)').eq('company_id',co.id).order('changed_at',{ascending:false}).limit(1000); if(error)throw error; auditRows=data||[]; return auditRows;
  }
  function auditCsv(){const rows=[['Employee','Previous Status','New Status','Reason','Changed At'],...auditRows.map(x=>[x.employee_profiles?.display_name||x.employee_profiles?.full_name||'User',x.previous_status||'',x.new_status||'',x.reason||'',x.changed_at])];const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`FP365-Audit-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);}
  function auditPdf(){const w=window.open('','_blank');if(!w)return alert('Allow pop-ups to export the PDF.');w.document.write(`<title>Fleet Protect 365 Audit Trail</title><style>body{font-family:Arial;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:7px;text-align:left;font-size:12px}</style><h1>Fleet Protect 365 Audit Trail</h1><table><tr><th>Employee</th><th>Previous</th><th>New</th><th>Reason</th><th>Changed</th></tr>${auditRows.map(x=>`<tr><td>${esc(x.employee_profiles?.display_name||x.employee_profiles?.full_name||'User')}</td><td>${esc(x.previous_status||'')}</td><td>${esc(x.new_status||'')}</td><td>${esc(x.reason||'')}</td><td>${esc(new Date(x.changed_at).toLocaleString())}</td></tr>`).join('')}</table>`);w.document.close();setTimeout(()=>w.print(),250);}

  function wireNavigation() {
    document.querySelectorAll('nav [data-view]').forEach(button => button.addEventListener('click', () => {
      const view=button.dataset.view;
      if (!['questions','fmcsa','documents','legal'].includes(view)) { if(view==='settings')setTimeout(loadSettings); if(view==='dashboard')setTimeout(loadDashboardStats); if(view==='audit')setTimeout(()=>loadAuditRows().catch(console.error)); return; }
      document.querySelectorAll('.view').forEach(x=>x.classList.add('hidden')); $(view).classList.remove('hidden'); document.querySelectorAll('nav [data-view]').forEach(x=>x.classList.toggle('active',x===button)); $('title').textContent=button.textContent.trim(); loadContent(view);
    }));
    document.querySelectorAll('.add-content').forEach(btn=>btn.onclick=()=>openContent(btn.dataset.contentType));
    document.querySelectorAll('[data-question-type]').forEach(btn=>btn.onclick=()=>{questionType=btn.dataset.questionType;document.querySelectorAll('[data-question-type]').forEach(x=>x.classList.toggle('active',x===btn));document.querySelector('#questions .add-content').dataset.contentType=questionType;loadContent('questions');});
  }
  function addLogoFilePicker() {
    const url = $('logoUrl');
    if (!url || $('logoFile')) return;
    const label = document.createElement('label');
    label.innerHTML = 'Replace Logo Image<input id="logoFile" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml">';
    url.closest('label')?.after(label);
  }
  addDashboardControls(); addLogoFilePicker(); wireNavigation();
  $('refreshDashboard')?.addEventListener('click',loadDashboardStats); $('saveSettings').onclick=saveSettings;
  $('companyNotes')?.addEventListener('input',updateSettingsPreview); $('logoUrl')?.addEventListener('input',updateSettingsPreview); $('logoScale')?.addEventListener('input',updateSettingsPreview);
  $('exportAuditCsv').onclick=async()=>{await loadAuditRows();auditCsv();}; $('exportAuditPdf').onclick=async()=>{await loadAuditRows();auditPdf();};
  setTimeout(()=>{context().then(()=>{loadDashboardStats();loadSettings();}).catch(console.error);},800);
})();
