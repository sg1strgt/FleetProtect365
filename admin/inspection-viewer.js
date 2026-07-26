(() => {
  'use strict';
  const client = window.FP365_ADMIN_CLIENT;
  if (!client) return;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
  const dateTime = (value) => value ? new Date(value).toLocaleString() : 'Not available';
  const equipment = (value) => ({
    '53_trailer': '53’ Trailer', single_pup: 'Single Pup', doubles: 'Doubles', bobtail: 'Bobtail'
  }[value] || value || 'Not entered');
  const dialog = document.createElement('dialog');
  dialog.id = 'inspectionViewerDialog';
  dialog.innerHTML = '<div id="inspectionViewerContent" class="inspection-viewer"></div>';
  document.body.appendChild(dialog);

  async function openInspection(id) {
    const content = document.getElementById('inspectionViewerContent');
    content.innerHTML = '<p>Loading submission…</p>';
    dialog.showModal();
    const { data: inspection, error } = await client.from('inspections').select('*').eq('id', id).single();
    if (error) {
      content.innerHTML = `<h3>Unable to open submission</h3><p>${esc(error.message)}</p><button type="button" data-close-inspection>Close</button>`;
      return;
    }
    const [{ data: driver }, { data: reports }] = await Promise.all([
      client.from('employee_profiles').select('full_name,display_name,employee_id,email').eq('id', inspection.driver_id).maybeSingle(),
      client.from('end_shift_reports').select('*').contains('inspection_ids', [inspection.id]).order('emailed_at', { ascending: false }).limit(1)
    ]);
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
        <div><small>Dolly</small><strong>${esc(inspection.dolly_number)}</strong></div>
        <div><small>Trailer 2</small><strong>${esc(inspection.trailer_2_number)}</strong></div>
        <div><small>Route</small><strong>${esc(inspection.location_from)} → ${esc(inspection.location_to)}</strong></div>
        <div class="wide"><small>Notes</small><strong>${esc(inspection.notes)}</strong></div>
        <div><small>Driver Certified</small><strong>${inspection.driver_certified ? 'Yes' : 'No'}</strong></div>
        <div><small>Bypass / Flag</small><strong>${inspection.has_bypass ? 'Yes' : 'No'}</strong></div>
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
