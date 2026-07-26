(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const client = window.FP365_ADMIN_CLIENT;
  if (!client || !$('dispatch')) return;

  let records = [];
  let drivers = [];
  let trucks = [];

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
  const todayIso = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const formatDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString() : '—';
  const formatTime = (value) => {
    if (!value) return '—';
    const [hour, minute] = value.slice(0, 5).split(':').map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
  };
  const formatMinutes = (minutes) => {
    const value = Number(minutes || 0);
    const hours = Math.floor(value / 60);
    const remainder = value % 60;
    if (!hours) return `${remainder} min`;
    return `${hours} hr${hours === 1 ? '' : 's'}${remainder ? ` ${remainder} min` : ''}`;
  };
  const delayMinutes = () => {
    const toMinutes = (value) => {
      if (!value) return null;
      const [hour, minute] = value.split(':').map(Number);
      return hour * 60 + minute;
    };
    const scheduled = toMinutes($('dispatchScheduled').value);
    const actual = toMinutes($('dispatchActual').value);
    if (scheduled === null || actual === null) return 0;
    const difference = actual - scheduled;
    return difference < 0 ? difference + 1440 : difference;
  };
  const updateDuration = () => {
    $('dispatchDuration').value = formatMinutes(delayMinutes());
  };
  const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  function render() {
    const search = $('dispatchSearch').value.trim().toLowerCase();
    const visible = records.filter((record) => !search || [
      record.driver_name, record.employee_id, record.truck_number, record.trailer_number,
      record.location_from, record.location_to, record.delay_reason, record.notes
    ].some((value) => String(value || '').toLowerCase().includes(search)));
    $('dispatchBody').innerHTML = visible.map((record) => `
      <tr>
        <td><b>${esc(formatDate(record.dispatch_date))}</b><small>Run ${esc(record.run_number)}</small></td>
        <td><b>${esc(record.driver_name)}</b><small>Employee ID: ${esc(record.employee_id)}</small></td>
        <td>${esc(record.location_from)} → ${esc(record.location_to)}</td>
        <td>Truck ${esc(record.truck_number)}<small>Trailer ${esc(record.trailer_number)}</small></td>
        <td>${esc(formatTime(record.scheduled_dispatch))}<small>Actual: ${esc(formatTime(record.actual_dispatch))}</small></td>
        <td><span class="delay-pill">${esc(formatMinutes(record.delay_minutes))}</span></td>
        <td>${esc(record.delay_reason)}${record.notes ? `<small>${esc(record.notes)}</small>` : ''}</td>
        <td><button type="button" data-edit-dispatch="${esc(record.id)}">Edit</button></td>
      </tr>`).join('');
    $('dispatchEmpty').classList.toggle('hidden', visible.length > 0);
    const total = records.reduce((sum, record) => sum + Number(record.delay_minutes || 0), 0);
    $('dispatchTotal').textContent = records.length;
    $('dispatchToday').textContent = records.filter((record) => record.dispatch_date === todayIso()).length;
    $('dispatchTotalTime').textContent = formatMinutes(total);
    $('dispatchAverage').textContent = records.length ? formatMinutes(Math.round(total / records.length)) : '0 min';
  }

  async function loadData() {
    $('dispatchMsg').textContent = 'Loading dispatch delays…';
    const [delaysResult, driversResult, trucksResult] = await Promise.all([
      client.from('dispatch_delays').select('*').is('deleted_at', null)
        .order('dispatch_date', { ascending: false }).order('run_number', { ascending: false }),
      client.from('employee_profiles').select('id,display_name,full_name,employee_id,role,drivers_license_number')
        .eq('status', 'active').is('deleted_at', null).order('display_name'),
      client.from('trucks').select('id,truck_number').eq('status', 'active')
        .is('deleted_at', null).order('truck_number')
    ]);
    if (delaysResult.error) {
      $('dispatchMsg').textContent = delaysResult.error.message;
      return;
    }
    records = delaysResult.data || [];
    drivers = (driversResult.data || []).filter((profile) =>
      profile.role === 'driver' || Boolean(profile.drivers_license_number));
    trucks = trucksResult.data || [];
    render();
    $('dispatchMsg').textContent = '';
  }

  function refreshOptions() {
    $('dispatchDriver').innerHTML = '<option value="">Select driver</option>' + drivers.map((driver) =>
      `<option value="${esc(driver.id)}">${esc(driver.display_name || driver.full_name)} — ${esc(driver.employee_id)}</option>`).join('');
    $('dispatchTruck').innerHTML = '<option value="">Select truck</option>' + trucks.map((truck) =>
      `<option value="${esc(truck.id)}">${esc(truck.truck_number)}</option>`).join('');
  }

  function nextRunNumber(driverId, date, editingId = '') {
    const used = records.filter((record) =>
      record.driver_profile_id === driverId && record.dispatch_date === date && record.id !== editingId);
    return used.reduce((maximum, record) => Math.max(maximum, Number(record.run_number || 0)), 0) + 1;
  }

  function updateRun() {
    const id = $('dispatchId').value;
    if (!id) $('dispatchRun').value = nextRunNumber($('dispatchDriver').value, $('dispatchDate').value);
    const driver = drivers.find((item) => item.id === $('dispatchDriver').value);
    $('dispatchEmployeeId').value = driver?.employee_id || '';
  }

  function openDialog(id = '') {
    $('dispatchForm').reset();
    $('dispatchFormMsg').textContent = '';
    $('dispatchId').value = id;
    refreshOptions();
    const record = records.find((item) => item.id === id);
    if (record) {
      $('dispatchDialogTitle').textContent = 'Edit Dispatch Delay';
      $('dispatchDate').value = record.dispatch_date;
      $('dispatchRun').value = record.run_number;
      $('dispatchDriver').value = record.driver_profile_id;
      $('dispatchEmployeeId').value = record.employee_id;
      $('dispatchTruck').value = record.truck_id;
      $('dispatchTrailer').value = record.trailer_number;
      $('dispatchFrom').value = record.location_from;
      $('dispatchTo').value = record.location_to;
      $('dispatchScheduled').value = String(record.scheduled_dispatch).slice(0, 5);
      $('dispatchActual').value = String(record.actual_dispatch).slice(0, 5);
      $('dispatchReason').value = record.delay_reason;
      $('dispatchNotes').value = record.notes || '';
      $('deleteDispatch').classList.remove('hidden');
    } else {
      $('dispatchDialogTitle').textContent = 'Add Dispatch Delay';
      $('dispatchDate').value = todayIso();
      $('dispatchRun').value = '';
      $('deleteDispatch').classList.add('hidden');
    }
    updateRun();
    updateDuration();
    $('dispatchDialog').showModal();
  }

  async function saveRecord() {
    const { data: authData } = await client.auth.getUser();
    const userId = authData?.user?.id;
    const { data: profile, error: profileError } = await client.from('employee_profiles')
      .select('company_id').eq('id', userId).single();
    if (profileError) throw profileError;
    const driver = drivers.find((item) => item.id === $('dispatchDriver').value);
    const truck = trucks.find((item) => item.id === $('dispatchTruck').value);
    const id = $('dispatchId').value;
    const existing = records.find((item) => item.id === id);
    const record = {
      company_id: profile.company_id,
      dispatch_date: $('dispatchDate').value,
      run_number: existing?.run_number || nextRunNumber(driver.id, $('dispatchDate').value, id),
      driver_profile_id: driver.id,
      employee_id: String(driver.employee_id),
      driver_name: driver.full_name || driver.display_name,
      truck_id: truck.id,
      truck_number: String(truck.truck_number),
      trailer_number: $('dispatchTrailer').value.trim().toUpperCase(),
      location_from: $('dispatchFrom').value.trim(),
      location_to: $('dispatchTo').value.trim(),
      scheduled_dispatch: $('dispatchScheduled').value,
      actual_dispatch: $('dispatchActual').value,
      delay_minutes: delayMinutes(),
      delay_reason: $('dispatchReason').value,
      notes: $('dispatchNotes').value.trim() || null,
      updated_by: userId,
      updated_at: new Date().toISOString()
    };
    if (id) {
      const { error } = await client.from('dispatch_delays').update(record).eq('id', id);
      if (error) throw error;
    } else {
      record.created_by = userId;
      const { error } = await client.from('dispatch_delays').insert(record);
      if (error) throw error;
    }
  }

  $('addDispatch').onclick = () => openDialog();
  $('refreshDispatch').onclick = loadData;
  $('cancelDispatch').onclick = () => $('dispatchDialog').close();
  $('dispatchDriver').onchange = updateRun;
  $('dispatchDate').onchange = updateRun;
  $('dispatchScheduled').oninput = updateDuration;
  $('dispatchActual').oninput = updateDuration;
  $('dispatchSearch').oninput = render;
  $('dispatchBody').onclick = (event) => {
    const button = event.target.closest('[data-edit-dispatch]');
    if (button) openDialog(button.dataset.editDispatch);
  };
  $('dispatchForm').onsubmit = async (event) => {
    event.preventDefault();
    try {
      $('saveDispatch').disabled = true;
      $('dispatchFormMsg').textContent = 'Saving…';
      await saveRecord();
      $('dispatchDialog').close();
      await loadData();
      $('dispatchMsg').textContent = 'Dispatch delay saved successfully.';
    } catch (error) {
      $('dispatchFormMsg').textContent = error.message;
    } finally {
      $('saveDispatch').disabled = false;
    }
  };
  $('deleteDispatch').onclick = async () => {
    if (!confirm('Remove this dispatch delay record?')) return;
    const { data: authData } = await client.auth.getUser();
    const removedAt = new Date().toISOString();
    const { error } = await client.from('dispatch_delays').update({
      deleted_at: removedAt, deleted_by: authData?.user?.id,
      updated_at: removedAt, updated_by: authData?.user?.id
    }).eq('id', $('dispatchId').value);
    if (error) {
      $('dispatchFormMsg').textContent = error.message;
      return;
    }
    $('dispatchDialog').close();
    await loadData();
  };
  $('exportDispatch').onclick = () => {
    const headers = ['Date', 'Run', 'Driver', 'Employee ID', 'Truck', 'Trailer', 'From', 'To',
      'Scheduled', 'Actual', 'Delay Minutes', 'Reason', 'Notes'];
    const rows = records.map((record) => [record.dispatch_date, record.run_number, record.driver_name,
      record.employee_id, record.truck_number, record.trailer_number, record.location_from,
      record.location_to, record.scheduled_dispatch, record.actual_dispatch, record.delay_minutes,
      record.delay_reason, record.notes]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `FleetProtect365-Dispatch-Delays-${todayIso()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const dispatchNav = document.querySelector('nav [data-view="dispatch"]');
  dispatchNav.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    document.querySelectorAll('.view').forEach((view) => view.classList.add('hidden'));
    $('dispatch').classList.remove('hidden');
    document.querySelectorAll('nav button').forEach((button) =>
      button.classList.toggle('active', button === dispatchNav));
    $('title').textContent = 'Dispatch Delays';
    loadData();
  }, true);
})();
