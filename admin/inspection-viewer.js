(() => {
  'use strict';
  const client = window.FP365_ADMIN_CLIENT;
  if (!client) return;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
  const dateTime = (value) => value ? new Date(value).toLocaleString() : 'Not available';
  const equipment = (value) => ({
    '53_trailer': '53’ Trailer', container: 'Container', single_pup: 'Single Pup', doubles: 'Doubles', bobtail: 'Bobtail'
  }[value] || value || 'Not entered');
  const dialog = document.createElement('dialog');
  dialog.id = 'inspectionViewerDialog';
  dialog.innerHTML = '<div id="inspectionViewerContent" class="inspection-viewer"></div>';
  document.body.appendChild(dialog);

  async function openInspection(id) {
    const content = document.getElementById('inspectionViewerContent');
    content.innerHTML = '<p>Loading submission…</p>';
    if (!dialog.open) dialog.showModal();
    const { data: inspection, error } = await client.from('inspections').select('*').eq('id', id).single();
    if (error) {
      content.innerHTML = `<h3>Unable to open submission</h3><p>${esc(error.message)}</p><button type="button" data-close-inspection>Close</button>`;
      return;
    }
    const [{ data: driver }, { data: reviewer }, { data: reports }, { data: photoRows, error: photoError }] = await Promise.all([
      client.from('employee_profiles').select('full_name,display_name,employee_id,email').eq('id', inspection.driver_id).maybeSingle(),
      inspection.flag_resolved_by
        ? client.from('employee_profiles').select('full_name,display_name').eq('id', inspection.flag_resolved_by).maybeSingle()
        : Promise.resolve({ data:null }),
      client.from('end_shift_reports').select('*').contains('inspection_ids', [inspection.id]).order('emailed_at', { ascending: false }).limit(1),
      client.from('inspection_photos').select('photo_key,photo_label,display_order,is_required,storage_path').eq('inspection_id', inspection.id).is('deleted_at', null).order('display_order')
    ]);
    let photos = [];
    if (!photoError && photoRows?.length) {
      photos = (await Promise.all(photoRows.map(async (photo) => {
        const { data, error: signedError } = await client.storage.from('inspection-photos')
          .createSignedUrl(photo.storage_path, 900);
        return signedError ? null : { ...photo, signedUrl: data.signedUrl };
      }))).filter(Boolean);
    }
    const report = reports?.[0];
    content.innerHTML = `
      <div class="inspection-viewer-head"><div><small>Fleet Protect 365 Submission</small><h3>${esc(inspection.inspection_number || 'Inspection')}</h3></div><button type="button" data-close-inspection aria-label="Close">×</button></div>
      <div class="inspection-viewer-grid">
        <div><small>Driver</small><strong>${esc(driver?.full_name || driver?.display_name || 'Not available')}</strong></div>
        <div><small>Employee ID</small><strong>${esc(driver?.employee_id || 'Not available')}</strong></div>
        <div><small>Submitted</small><strong>${esc(dateTime(inspection.submitted_at))}</strong></div>
        <div><small>Status</small><strong>${esc(inspection.status)}</strong></div>
        <div><small>Equipment</small><strong>${esc(equipment(inspection.equipment_type))}</strong></div>
        <div><small>Truck</small><strong>${esc(inspection.truck_number)}</strong></div>
        <div><small>Trailer 1</small><strong>${esc(inspection.trailer_1_number)}</strong></div>
        ${inspection.equipment_type === 'container' ? `<div><small>Chassis ID</small><strong>${esc(inspection.chassis_id)}</strong></div>` : ''}
        <div><small>Dolly</small><strong>${esc(inspection.dolly_number)}</strong></div>
        <div><small>Trailer 2</small><strong>${esc(inspection.trailer_2_number)}</strong></div>
        <div><small>Route</small><strong>${esc(inspection.location_from)} → ${esc(inspection.location_to)}</strong></div>
        <div class="wide"><small>Notes</small><strong>${esc(inspection.notes)}</strong></div>
        <div><small>Driver Certified</small><strong>${inspection.driver_certified ? 'Yes' : 'No'}</strong></div>
        <div><small>Bypass / Flag</small><strong>${inspection.has_bypass ? 'Yes' : 'No'}</strong></div>
      </div>
      ${(inspection.has_bypass || String(inspection.status).toLowerCase() === 'flagged') ? `<div class="inspection-resolution-box">
        <h4>Administrative Review</h4>
        ${inspection.flag_resolved_at ? `
          <p><strong>Reviewed/Resolved</strong> ${esc(dateTime(inspection.flag_resolved_at))}</p>
          <p>Reviewed by ${esc(reviewer?.full_name || reviewer?.display_name || 'Administrator')}</p>
          <p><strong>Resolution note:</strong> ${esc(inspection.flag_resolution_note)}</p>` : `
          <p>This submission still requires administrative review.</p>
          <label for="flagResolutionNote">Required resolution note</label>
          <textarea id="flagResolutionNote" maxlength="1000" rows="4" placeholder="Describe how the flagged item was reviewed or corrected"></textarea>
          <p id="flagResolutionMsg" class="form-message"></p>
          <button type="button" class="primary" data-resolve-inspection="${esc(inspection.id)}">Mark Reviewed/Resolved</button>`}
      </div>` : ''}
      <div class="inspection-photo-box">
        <h4>Inspection Photos</h4>
        ${photoError
          ? `<p>Photos could not be loaded: ${esc(photoError.message)}</p>`
          : photos.length
            ? `<div class="inspection-photo-grid">${photos.map(photo => `
                <button type="button" class="inspection-photo" data-open-photo="${esc(photo.signedUrl)}">
                  <img src="${esc(photo.signedUrl)}" alt="${esc(photo.photo_label)}">
                  <span>${esc(photo.photo_label)}${photo.is_required ? '' : ' (Additional)'}</span>
                </button>`).join('')}</div>`
            : '<p>No centrally stored photos are available for this submission yet.</p>'}
      </div>
      <div class="inspection-report-box"><h4>End-of-Shift Report</h4>${report
        ? `<p>${esc(report.report_id)} · emailed ${esc(dateTime(report.emailed_at))}</p><button type="button" class="primary" data-open-report="${esc(report.storage_path)}">Open or Download PDF</button>`
        : '<p>This inspection has not yet been included in an archived End-of-Shift report.</p>'}</div>
      <div class="actions"><button type="button" data-close-inspection>Close</button></div>`;
  }

  document.addEventListener('click', async (event) => {
    const submission = event.target.closest('[data-inspection-id]');
    if (submission) return openInspection(submission.dataset.inspectionId);
    if (event.target.closest('[data-close-inspection]')) return dialog.close();
    const resolveButton = event.target.closest('[data-resolve-inspection]');
    if (resolveButton) {
      const note = document.getElementById('flagResolutionNote')?.value.trim() || '';
      const message = document.getElementById('flagResolutionMsg');
      if (!note) { if (message) message.textContent = 'Enter a resolution note before marking this inspection resolved.'; return; }
      resolveButton.disabled = true;
      if (message) message.textContent = 'Saving review…';
      const { error } = await client.rpc('resolve_inspection_flag', { p_inspection_id:resolveButton.dataset.resolveInspection, p_resolution_note:note });
      resolveButton.disabled = false;
      if (error) { if (message) message.textContent = error.message; return; }
      document.dispatchEvent(new CustomEvent('fp365:inspection-resolved'));
      return openInspection(resolveButton.dataset.resolveInspection);
    }
    const photoButton = event.target.closest('[data-open-photo]');
    if (photoButton) return window.open(photoButton.dataset.openPhoto, '_blank', 'noopener');
    const reportButton = event.target.closest('[data-open-report]');
    if (!reportButton) return;
    reportButton.disabled = true;
    const { data, error } = await client.storage.from('end-shift-reports')
      .createSignedUrl(reportButton.dataset.openReport, 300);
    reportButton.disabled = false;
    if (error) return alert(error.message);
    window.open(data.signedUrl, '_blank', 'noopener');
  });
})();
