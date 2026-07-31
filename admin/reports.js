(() => {
  'use strict';
  const client = window.FP365_ADMIN_CLIENT;
  if (!client) return;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
  const date = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString() : '—';
  const dateTime = (value) => value ? new Date(value).toLocaleString() : '—';
  let reports = [];

  async function loadReports() {
    $('reportsMsg').textContent = 'Loading archived reports…';
    const { data, error } = await client.from('end_shift_reports')
      .select('report_id,report_date,pdf_file_name,storage_path,email_recipients,email_status,emailed_at,inspection_ids,driver_id,employee_profiles!end_shift_reports_driver_id_fkey(full_name,display_name,employee_id)')
      .order('report_date', { ascending: false }).order('created_at', { ascending: false }).limit(500);
    if (error) return void ($('reportsMsg').textContent = error.message);
    reports = data || [];
    $('reportsMsg').textContent = '';
    renderReports();
  }

  function renderReports() {
    const query = $('reportsSearch').value.trim().toLowerCase();
    const list = reports.filter((report) => {
      const driver = report.employee_profiles || {};
      return !query || [report.report_id, report.report_date, driver.full_name, driver.display_name,
        driver.employee_id, ...(report.email_recipients || [])]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });
    $('reportsBody').innerHTML = list.map((report) => {
      const driver = report.employee_profiles || {};
      return `<tr><td><b>${esc(report.report_id || report.pdf_file_name)}</b><br><small>${esc(date(report.report_date))}</small></td>
        <td><b>${esc(driver.full_name || driver.display_name || 'Unknown driver')}</b><br><small>Employee ID: ${esc(driver.employee_id || '—')}</small></td>
        <td>${(report.inspection_ids || []).length}</td><td>${esc(dateTime(report.emailed_at))}</td>
        <td>${esc((report.email_recipients || []).join(', ') || '—')}</td>
        <td><div class="report-actions"><button type="button" data-download-report="${esc(report.storage_path || '')}" ${report.storage_path ? '' : 'disabled'}>Open PDF</button>
        <button type="button" data-email-report="${esc(report.report_id || '')}" ${report.storage_path ? '' : 'disabled'}>Email Copy</button></div></td></tr>`;
    }).join('');
    $('reportsEmpty').classList.toggle('hidden', list.length > 0);
  }

  async function openReport(path, button) {
    button.disabled = true;
    const { data, error } = await client.storage.from('end-shift-reports').createSignedUrl(path, 300);
    button.disabled = false;
    if (error) return alert(error.message);
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  document.querySelectorAll('#mainNav [data-view], nav [data-view]').forEach((button) => {
    button.addEventListener('click', (event) => {
      if (button.dataset.view !== 'reports') {
        $('reports').classList.add('hidden');
        return;
      }
      event.stopImmediatePropagation();
      document.querySelectorAll('.view').forEach((view) => view.classList.add('hidden'));
      document.querySelectorAll('nav button').forEach((item) => item.classList.toggle('active', item === button));
      $('reports').classList.remove('hidden');
      $('title').textContent = 'Archived End-of-Shift Reports';
      loadReports();
    }, true);
  });
  $('refreshReports').onclick = loadReports;
  $('reportsSearch').oninput = renderReports;
  $('cancelRecipient').onclick = () => $('recipientDialog').close();
  $('reportsBody').onclick = (event) => {
    const download = event.target.closest('[data-download-report]');
    if (download) return openReport(download.dataset.downloadReport, download);
    const email = event.target.closest('[data-email-report]');
    if (!email) return;
    $('forwardReportId').value = email.dataset.emailReport;
    $('forwardRecipient').value = '';
    $('forwardReportMsg').textContent = '';
    $('forwardReportDialog').showModal();
  };
  $('cancelForwardReport').onclick = () => $('forwardReportDialog').close();
  $('forwardReportForm').onsubmit = async (event) => {
    event.preventDefault();
    const button = $('sendForwardReport');
    button.disabled = true;
    $('forwardReportMsg').textContent = 'Sending archived PDF…';
    const { data, error } = await client.functions.invoke('email-archived-report', {
      body: { reportId: $('forwardReportId').value, recipientEmail: $('forwardRecipient').value.trim() }
    });
    button.disabled = false;
    if (error || !data?.ok) {
      let details = data;
      if (!details && error?.context && typeof error.context.json === 'function') {
        try {
          details = await error.context.json();
        } catch {
          details = null;
        }
      }
      const stage = details?.stage ? ` (${details.stage})` : '';
      $('forwardReportMsg').textContent =
        `${details?.error || error?.message || 'Unable to send the report.'}${stage}`;
      return;
    }
    $('forwardReportMsg').textContent = `Report emailed to ${data.recipient}.`;
    setTimeout(() => $('forwardReportDialog').close(), 900);
  };
})();
