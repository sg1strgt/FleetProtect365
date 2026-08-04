(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const client = window.FP365_ADMIN_CLIENT;
  if (!client) return;
  let truckRecords = [];
  let adminNames = {};
  let loading = false;
  let truckFilter = 'all';
  let currentRole = '';

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
  const formatDate = (value) => value
    ? new Date(`${value}T12:00:00`).toLocaleDateString()
    : 'Not entered';
  const daysUntil = (value) => {
    if (!value) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : Math.ceil((date - today) / 86400000);
  };
  const monthsUntil = (value) => {
    if (!value) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    let months = (date.getFullYear() - today.getFullYear()) * 12 +
      date.getMonth() - today.getMonth();
    if (date.getDate() < today.getDate()) months -= 1;
    return months;
  };
  const complianceStatus = (value, type) => {
    if (!value) return { className: '', countdown: 'Date not entered' };
    const days = daysUntil(value);
    if (days === null) return { className: '', countdown: 'Invalid date' };
    if (days < 0) {
      const overdue = Math.abs(days);
      return {
        className: 'truck-expired',
        countdown: `${overdue} day${overdue === 1 ? '' : 's'} overdue`
      };
    }
    if (days === 0) return { className: 'truck-expiring', countdown: 'Due today' };
    if (type === 'quarterly') {
      return {
        className: days <= 30 ? 'truck-expiring' : '',
        countdown: `${days} day${days === 1 ? '' : 's'} remaining`
      };
    }
    const months = monthsUntil(value);
    return {
      className: days <= 60 ? 'truck-expiring' : '',
      countdown: months <= 0 ? 'Less than 1 mo remaining' :
        `${months} mo remaining`
    };
  };
  const complianceLine = (label, value, type) => {
    const status = complianceStatus(value, type);
    return `<div class="truck-compliance ${status.className}"><span>${label}: ${esc(formatDate(value))}</span><span class="truck-countdown">${esc(status.countdown)}</span></div>`;
  };

  function setDateValue(id, value = '') {
    const hidden = $(id);
    const group = document.querySelector(`[data-date-target="${id}"]`);
    hidden.value = value || '';
    const [year = '', month = '', day = ''] = String(value || '').split('-');
    group.querySelector('.mm').value = month;
    group.querySelector('.dd').value = day;
    group.querySelector('.yyyy').value = year;
  }

  function syncDate(group) {
    const month = group.querySelector('.mm').value.padStart(2, '0');
    const day = group.querySelector('.dd').value.padStart(2, '0');
    const year = group.querySelector('.yyyy').value;
    const hidden = $(group.dataset.dateTarget);
    hidden.value = '';
    if (month.length !== 2 || day.length !== 2 || year.length !== 4) return;
    const value = `${year}-${month}-${day}`;
    const date = new Date(`${value}T12:00:00`);
    if (!Number.isNaN(date.getTime()) && date.getFullYear() === Number(year) &&
      date.getMonth() + 1 === Number(month) && date.getDate() === Number(day)) {
      hidden.value = value;
    }
  }

  function setupDates() {
    document.querySelectorAll('#truckDialog .date-entry').forEach((group) => {
      const parts = [...group.querySelectorAll('.date-part')];
      parts.forEach((input, index) => {
        input.addEventListener('input', () => {
          input.value = input.value.replace(/\D/g, '').slice(0, Number(input.maxLength));
          syncDate(group);
          if (input.value.length === Number(input.maxLength) && index < parts.length - 1) {
            parts[index + 1].focus();
          }
        });
        input.addEventListener('blur', () => {
          if (index < 2 && input.value.length === 1) input.value = input.value.padStart(2, '0');
          syncDate(group);
        });
      });
    });
  }

  function render() {
    const visible = truckRecords.filter((truck) => truckFilter === 'all' || truck.status === truckFilter);
    $('trucksBody').innerHTML = visible.map((truck) => `
      <tr data-enhanced-truck="${esc(truck.id)}">
        <td><b>${esc(truck.truck_number)}</b>${truck.notes ? `<span class="truck-sub">${esc(truck.notes)}</span>` : ''}</td>
        <td>${esc([truck.year, truck.make, truck.model].filter(Boolean).join(' ') || 'Not entered')}</td>
        <td>${esc(truck.vin || 'Not entered')}</td>
        <td>${esc(truck.license_plate || 'Not entered')} ${esc(truck.plate_state || '')}</td>
        <td><span class="badge ${esc(truck.status)}">${esc(String(truck.status).replaceAll('_', ' '))}</span>${truck.status_reason ? `<span class="truck-sub">Reason: ${esc(truck.status_reason)}</span>` : ''}${truck.status_changed_at ? `<span class="truck-sub">${truck.status === 'retired' ? 'Removed' : 'Changed'}: ${esc(new Date(truck.status_changed_at).toLocaleString())}</span>` : ''}${truck.removed_by ? `<span class="truck-sub">Removed by: ${esc(adminNames[truck.removed_by] || 'Administrator')}</span>` : ''}</td>
        <td>
          ${complianceLine('Quarterly', truck.quarterly_inspection, 'quarterly')}
          ${complianceLine('Annual', truck.annual_inspection, 'monthly')}
          ${complianceLine('Insurance', truck.insurance_expiration, 'monthly')}
        </td>
        <td><div class="truck-action"><button type="button" data-edit-truck-profile="${esc(truck.id)}">Edit</button>${currentRole === 'super_admin' ? `<button type="button" class="danger" data-remove-truck="${esc(truck.id)}">Remove</button>` : ''}</div></td>
      </tr>`).join('');
    $('truckFilterEmpty').classList.toggle('hidden', visible.length > 0);
  }

  async function loadTrucks() {
    if (loading) return;
    loading = true;
    $('trucksMsg').textContent = 'Loading truck records…';
    const { data: authData } = await client.auth.getUser();
    const [{ data, error }, { data: profiles }, { data: currentProfile }] = await Promise.all([
      client.from('trucks').select('*').is('deleted_at', null).order('truck_number'),
      client.from('employee_profiles').select('id,display_name,full_name').is('deleted_at', null),
      client.from('employee_profiles').select('role').eq('id', authData?.user?.id).single()
    ]);
    loading = false;
    if (error) {
      $('trucksMsg').textContent = error.message;
      return;
    }
    truckRecords = data || [];
    currentRole = currentProfile?.role || '';
    adminNames = Object.fromEntries((profiles || []).map((profile) => [
      profile.id, profile.display_name || profile.full_name || 'Administrator'
    ]));
    render();
    $('trucksMsg').textContent = '';
  }

  function openTruck(id = '') {
    $('truckForm').reset();
    $('truckFormMsg').textContent = '';
    $('truckId').value = id;
    const truck = truckRecords.find((item) => item.id === id);
    if (truck) {
      $('truckDialogTitle').textContent = 'Edit Truck';
      $('truckNumber').value = truck.truck_number || '';
      $('truckStatus').value = truck.status || 'active';
      $('truckStatusReason').value = truck.status_reason || '';
      $('truckYear').value = truck.year || '';
      $('truckMake').value = truck.make || '';
      $('truckModel').value = truck.model || '';
      $('truckVin').value = truck.vin || '';
      $('truckPlate').value = truck.license_plate || '';
      $('truckPlateState').value = truck.plate_state || '';
      $('truckNotes').value = truck.notes || '';
      setDateValue('truckQuarterlyInspection', truck.quarterly_inspection);
      setDateValue('truckAnnualInspection', truck.annual_inspection);
      setDateValue('truckInsurance', truck.insurance_expiration);
    } else {
      $('truckDialogTitle').textContent = 'Add Truck';
      $('truckStatus').value = 'active';
      $('truckStatusReason').value = '';
      setDateValue('truckQuarterlyInspection', '');
      setDateValue('truckAnnualInspection', '');
      setDateValue('truckInsurance', '');
    }
    updateStatusReason();
    $('truckDialog').showModal();
  }

  function updateStatusReason() {
    const needsReason = ['inactive', 'retired'].includes($('truckStatus').value);
    $('truckStatusReasonRow').classList.toggle('hidden', !needsReason);
    $('truckStatusReason').required = needsReason;
    if (!needsReason) $('truckStatusReason').value = '';
  }

  async function saveTruck() {
    const { data: authData } = await client.auth.getUser();
    const userId = authData?.user?.id;
    const { data: profile, error: profileError } = await client.from('employee_profiles')
      .select('company_id').eq('id', userId).single();
    if (profileError) throw profileError;
    const record = {
      company_id: profile.company_id,
      truck_number: $('truckNumber').value.trim(),
      status: $('truckStatus').value,
      status_reason: $('truckStatus').value === 'active' ? null : $('truckStatusReason').value.trim(),
      year: Number($('truckYear').value),
      make: $('truckMake').value.trim(),
      model: $('truckModel').value.trim(),
      vin: $('truckVin').value.trim().toUpperCase(),
      license_plate: $('truckPlate').value.trim().toUpperCase(),
      plate_state: $('truckPlateState').value.trim().toUpperCase(),
      quarterly_inspection: $('truckQuarterlyInspection').value,
      annual_inspection: $('truckAnnualInspection').value,
      insurance_expiration: $('truckInsurance').value,
      notes: $('truckNotes').value.trim() || null,
      updated_by: userId,
      updated_at: new Date().toISOString()
    };
    const previous = truckRecords.find((item) => item.id === $('truckId').value);
    if (!previous || previous.status !== record.status) {
      record.status_changed_at = new Date().toISOString();
      record.status_changed_by = userId;
      if (record.status === 'retired') {
        record.removed_at = record.status_changed_at;
        record.removed_by = userId;
      } else if (previous?.status === 'retired') {
        record.removed_at = null;
        record.removed_by = null;
      }
    }
    const id = $('truckId').value;
    if (id) {
      const { error } = await client.from('trucks').update(record).eq('id', id);
      if (error) throw error;
    } else {
      record.created_by = userId;
      const { error } = await client.from('trucks').insert(record);
      if (error) throw error;
    }
  }

  $('addTruck').addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    openTruck();
  }, true);
  $('saveTruck').addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!$('truckForm').checkValidity()) {
      $('truckForm').reportValidity();
      return;
    }
    if (!$('truckQuarterlyInspection').value || !$('truckAnnualInspection').value || !$('truckInsurance').value) {
      $('truckFormMsg').textContent = 'Enter complete valid dates as MM/DD/YYYY.';
      return;
    }
    try {
      $('saveTruck').disabled = true;
      $('truckFormMsg').textContent = 'Saving…';
      await saveTruck();
      $('truckDialog').close();
      await loadTrucks();
      $('trucksMsg').textContent = 'Truck saved successfully.';
    } catch (error) {
      $('truckFormMsg').textContent = error.message;
    } finally {
      $('saveTruck').disabled = false;
    }
  }, true);
  $('cancelTruck').onclick = () => $('truckDialog').close();
  $('truckStatus').addEventListener('change', updateStatusReason);
  $('refreshTrucks').onclick = loadTrucks;
  $('truckFilters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-truck-filter]');
    if (!button) return;
    truckFilter = button.dataset.truckFilter;
    document.querySelectorAll('#truckFilters button').forEach((item) =>
      item.classList.toggle('active', item === button));
    render();
  });
  $('trucksBody').addEventListener('click', (event) => {
    const button = event.target.closest('[data-edit-truck-profile]');
    if (button) {
      openTruck(button.dataset.editTruckProfile);
      return;
    }
    const removeButton = event.target.closest('[data-remove-truck]');
    if (!removeButton) return;
    const truck = truckRecords.find((item) => item.id === removeButton.dataset.removeTruck);
    const reason = prompt(`Why is truck ${truck?.truck_number || ''} being removed from Fleet Protect 365?`);
    if (!reason?.trim()) return;
    if (!confirm(`Remove truck ${truck?.truck_number || ''} from the Admin and Driver lists? Historical inspections will be preserved.`)) return;
    (async () => {
      const { data: authData } = await client.auth.getUser();
      const userId = authData?.user?.id;
      const removedAt = new Date().toISOString();
      const { error } = await client.from('trucks').update({
        status: 'retired',
        status_reason: reason.trim(),
        status_changed_at: removedAt,
        status_changed_by: userId,
        removed_at: removedAt,
        removed_by: userId,
        deleted_at: removedAt,
        deleted_by: userId,
        updated_at: removedAt,
        updated_by: userId
      }).eq('id', truck.id);
      if (error) {
        $('trucksMsg').textContent = error.message;
        return;
      }
      await loadTrucks();
      $('trucksMsg').textContent = `Truck ${truck.truck_number} was removed. Historical records were preserved.`;
    })();
  });
  document.querySelector('nav [data-view="trucks"]').addEventListener('click', () => {
    setTimeout(loadTrucks, 100);
  });

  setupDates();
})();
