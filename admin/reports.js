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

  function localIso(value = new Date()) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function isoToLocalDate(value) {
    return new Date(`${value}T12:00:00`);
  }

  function setReportDate(name, value) {
    const group = document.querySelector(`[data-report-date="${name}"]`);
    if (!group) return;
    const [year = '', month = '', day = ''] = String(value || '').split('-');
    group.querySelector('.report-date-day').value = day;
    group.querySelector('.report-date-month').value = month;
    group.querySelector('.report-date-year').value = year;
  }

  function readReportDate(name) {
    const group = document.querySelector(`[data-report-date="${name}"]`);
    if (!group) return null;
    const day = group.querySelector('.report-date-day').value.padStart(2, '0');
    const month = group.querySelector('.report-date-month').value.padStart(2, '0');
    const year = group.querySelector('.report-date-year').value;
    if (!day && !month && !year) return '';
    if (day.length !== 2 || month.length !== 2 || year.length !== 4) return null;
    const iso = `${year}-${month}-${day}`;
    const parsed = isoToLocalDate(iso);
    if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() !== Number(year) ||
      parsed.getMonth() + 1 !== Number(month) || parsed.getDate() !== Number(day)) return null;
    return iso;
  }

  function getDateWindow() {
    const mode = $('reportsDateMode').value;
    if (mode === 'range') {
      const start = readReportDate('start');
      const end = readReportDate('end');
      return { start, end, valid: Boolean(start && end && start <= end) };
    }
    const anchor = readReportDate('anchor');
    if (!anchor) return { start: anchor, end: anchor, valid: false };
    if (mode === 'day') return { start: anchor, end: anchor, valid: true };
    const anchorDate = isoToLocalDate(anchor);
    if (mode === 'week') {
      const startDate = new Date(anchorDate);
      const daysSinceSaturday = (anchorDate.getDay() + 1) % 7;
      startDate.setDate(anchorDate.getDate() - daysSinceSaturday);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      return { start: localIso(startDate), end: localIso(endDate), valid: true };
    }
    const startDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const endDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
    return { start: localIso(startDate), end: localIso(endDate), valid: true };
  }

  function updateDriverOptions() {
    const selected = $('reportsDriver').value;
    const seen = new Map();
    reports.forEach((report) => {
      const driver = report.employee_profiles || {};
      const key = report.driver_id || driver.employee_id;
      if (!key || seen.has(key)) return;
      seen.set(key, driver.full_name || driver.display_name || `Employee ${driver.employee_id || ''}`.trim());
    });
    $('reportsDriver').innerHTML = '<option value="">All drivers</option>' +
      [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');
    if (seen.has(selected)) $('reportsDriver').value = selected;
  }

  function updateDateFields() {
    const range = $('reportsDateMode').value === 'range';
    $('reportsAnchorField').classList.toggle('hidden', range);
    $('reportsRangeFields').classList.toggle('hidden', !range);
    renderReports();
  }

  function setupReportDates() {
    document.querySelectorAll('.report-date-entry').forEach((group) => {
      const parts = [...group.querySelectorAll('input')];
      parts.forEach((input, index) => {
        input.addEventListener('input', () => {
          input.value = input.value.replace(/\D/g, '').slice(0, Number(input.maxLength));
          if (input.value.length === Number(input.maxLength) && index < parts.length - 1) {
            parts[index + 1].focus();
          }
          renderReports();
        });
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Backspace' && !input.value && index > 0) parts[index - 1].focus();
        });
        input.addEventListener('blur', () => {
          if (index < 2 && input.value.length === 1) input.value = input.value.padStart(2, '0');
          renderReports();
        });
      });
    });
  }

  async function loadReports() {
    window.FP365_LOAD_RECORDS?.();
    $('reportsMsg').textContent = 'Loading archived reports…';
    const { data, error } = await client.from('end_shift_reports')
      .select('report_id,report_date,pdf_file_name,storage_path,email_recipients,email_status,emailed_at,inspection_ids,driver_id,employee_profiles!end_shift_reports_driver_id_fkey(full_name,display_name,employee_id)')
      .order('report_date', { ascending: false }).order('created_at', { ascending: false }).limit(500);
    if (error) return void ($('reportsMsg').textContent = error.message);
    reports = data || [];
    updateDriverOptions();
    $('reportsMsg').textContent = '';
    renderReports();
  }

  function renderReports() {
    const query = $('reportsSearch').value.trim().toLowerCase();
    const selectedDriver = $('reportsDriver').value;
    const window = getDateWindow();
    $('reportsDateSummary').textContent = window.valid
      ? (window.start === window.end ? `Showing ${date(window.start)}` : `Showing ${date(window.start)} through ${date(window.end)}`)
      : 'Enter a complete valid date in DD/MM/YYYY format.';
    const list = reports.filter((report) => {
      const driver = report.employee_profiles || {};
      const driverKey = report.driver_id || driver.employee_id || '';
      const matchesDriver = !selectedDriver || driverKey === selectedDriver;
      const matchesDate = window.valid && report.report_date >= window.start && report.report_date <= window.end;
      const matchesSearch = !query || [report.report_id, report.report_date, driver.full_name, driver.display_name,
        driver.employee_id, ...(report.email_recipients || [])]
        .some((value) => String(value || '').toLowerCase().includes(query));
      return matchesDriver && matchesDate && matchesSearch;
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
      $('title').textContent = 'Reports and Records';
      loadReports();
    }, true);
  });
  $('refreshReports').onclick = loadReports;
  $('reportsSearch').oninput = renderReports;
  $('reportsDriver').onchange = renderReports;
  $('reportsDateMode').onchange = updateDateFields;
  $('clearReportsFilters').onclick = () => {
    $('reportsSearch').value = '';
    $('reportsDriver').value = '';
    $('reportsDateMode').value = 'day';
    setReportDate('anchor', localIso());
    setReportDate('start', localIso());
    setReportDate('end', localIso());
    updateDateFields();
  };
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
    $('forwardReportMsg').textContent = 'Verifying Admin session…';
    let { data: sessionData, error: sessionError } = await client.auth.getSession();
    let session = sessionData?.session;
    const expiresSoon = !session?.expires_at || session.expires_at * 1000 < Date.now() + 60000;
    if (!sessionError && expiresSoon) {
      const refreshed = await client.auth.refreshSession();
      sessionError = refreshed.error;
      session = refreshed.data?.session;
    }
    if (sessionError || !session?.access_token) {
      button.disabled = false;
      $('forwardReportMsg').textContent =
        'Your Admin session has expired. Log out, log back in, and try again.';
      return;
    }
    $('forwardReportMsg').textContent = 'Sending archived PDF…';
    const { data, error } = await client.functions.invoke('email-archived-report', {
      body: { reportId: $('forwardReportId').value, recipientEmail: $('forwardRecipient').value.trim() },
      headers: { Authorization: `Bearer ${session.access_token}` }
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
  setupReportDates();
  setReportDate('anchor', localIso());
  setReportDate('start', localIso());
  setReportDate('end', localIso());
  updateDateFields();
})();
