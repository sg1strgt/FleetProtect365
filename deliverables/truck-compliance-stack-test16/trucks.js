(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const client = window.FP365_ADMIN_CLIENT;
  if (!client) return;
  let truckRecords = [];
  let loading = false;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
  const formatDate = (value) => value
    ? new Date(`${value}T12:00:00`).toLocaleDateString()
    : 'Not entered';
  const expiryClass = (value) => {
    if (!value) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(`${value}T00:00:00`);
    const days = Math.ceil((date - today) / 86400000);
    return days < 0 ? 'truck-expired' : days <= 45 ? 'truck-expiring' : '';
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
    $('trucksBody').innerHTML = truckRecords.map((truck) => `
      <tr data-enhanced-truck="${esc(truck.id)}">
        <td><b>${esc(truck.truck_number)}</b>${truck.notes ? `<span class="truck-sub">${esc(truck.notes)}</span>` : ''}</td>
        <td>${esc([truck.year, truck.make, truck.model].filter(Boolean).join(' ') || 'Not entered')}</td>
        <td>${esc(truck.vin || 'Not entered')}</td>
        <td>${esc(truck.license_plate || 'Not entered')} ${esc(truck.plate_state || '')}</td>
        <td><span class="badge ${esc(truck.status)}">${esc(String(truck.status).replaceAll('_', ' '))}</span></td>
        <td>
          <div class="truck-compliance ${expiryClass(truck.quarterly_inspection)}">Quarterly: ${esc(formatDate(truck.quarterly_inspection))}</div>
          <div class="truck-compliance ${expiryClass(truck.annual_inspection)}">Annual: ${esc(formatDate(truck.annual_inspection))}</div>
          <div class="truck-compliance ${expiryClass(truck.insurance_expiration)}">Insurance: ${esc(formatDate(truck.insurance_expiration))}</div>
        </td>
        <td><div class="truck-action"><button type="button" data-edit-truck-profile="${esc(truck.id)}">Edit</button></div></td>
      </tr>`).join('');
  }

  async function loadTrucks() {
    if (loading) return;
    loading = true;
    $('trucksMsg').textContent = 'Loading truck records…';
    const { data, error } = await client.from('trucks').select('*')
      .is('deleted_at', null).order('truck_number');
    loading = false;
    if (error) {
      $('trucksMsg').textContent = error.message;
      return;
    }
    truckRecords = data || [];
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
      setDateValue('truckQuarterlyInspection', '');
      setDateValue('truckAnnualInspection', '');
      setDateValue('truckInsurance', '');
    }
    $('truckDialog').showModal();
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
  $('refreshTrucks').onclick = loadTrucks;
  $('trucksBody').addEventListener('click', (event) => {
    const button = event.target.closest('[data-edit-truck-profile]');
    if (button) openTruck(button.dataset.editTruckProfile);
  });
  document.querySelector('nav [data-view="trucks"]').addEventListener('click', () => {
    setTimeout(loadTrucks, 100);
  });

  setupDates();
})();
