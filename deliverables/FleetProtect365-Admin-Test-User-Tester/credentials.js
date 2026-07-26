(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const client = window.FP365_ADMIN_CLIENT;
  if (!client) throw new Error('Admin connection is unavailable. Refresh the page and try again.');
  let currentUser = null;
  let profileFilter = 'all';

  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || String(event.reason || 'Unknown loading error');
    const status = $('driversMsg');
    if (status) status.textContent = `Unable to load driver records: ${message}`;
  });

  const formatDateTime = (value) => value ? new Date(value).toLocaleString() : 'None';
  const formatDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString() : 'Not entered';
  const roleLabel = (role) => role === 'super_admin' ? 'Super Admin' :
    role === 'admin' ? 'Admin' : role === 'driver' ? 'Driver' :
    role === 'user' ? 'User' : String(role || 'Other').replaceAll('_', ' ');
  const isSuperAdmin = () => String($('session')?.textContent || '').includes('super_admin');
  const validPassword = (password, employeeId) =>
    password.length >= 8 && /[A-Z]/.test(password) && /[A-Za-z]/.test(password) &&
    /\d/.test(password) && /^[A-Za-z0-9]+$/.test(password) &&
    !password.toLowerCase().includes(employeeId.toLowerCase());

  function generatePassword(employeeId) {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ', lower = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789', all = upper + lower + digits;
    const random = (chars) => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length];
    let password;
    do {
      const chars = [random(upper), random(lower), random(digits), ...Array.from({ length: 7 }, () => random(all))];
      for (let i = chars.length - 1; i; i--) {
        const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
      }
      password = chars.join('');
    } while (employeeId && password.toLowerCase().includes(employeeId.toLowerCase()));
    return password;
  }

  function setDateValue(id, value = '') {
    const hidden = $(id);
    const group = document.querySelector(`[data-date-target="${id}"]`);
    if (!hidden || !group) return;
    hidden.value = value || '';
    const [year = '', month = '', day = ''] = String(value || '').split('-');
    group.querySelector('.mm').value = month;
    group.querySelector('.dd').value = day;
    group.querySelector('.yyyy').value = year;
  }

  function syncDateValue(group) {
    const month = group.querySelector('.mm').value.padStart(2, '0');
    const day = group.querySelector('.dd').value.padStart(2, '0');
    const year = group.querySelector('.yyyy').value;
    const hidden = $(group.dataset.dateTarget);
    if (!month && !day && !year) {
      hidden.value = '';
      return;
    }
    if (month.length !== 2 || day.length !== 2 || year.length !== 4) {
      hidden.value = '';
      return;
    }
    const iso = `${year}-${month}-${day}`;
    const date = new Date(`${iso}T12:00:00`);
    hidden.value = !Number.isNaN(date.getTime()) &&
      date.getFullYear() === Number(year) &&
      date.getMonth() + 1 === Number(month) &&
      date.getDate() === Number(day) ? iso : '';
  }

  function setupDateEntries() {
    document.querySelectorAll('.date-entry').forEach((group) => {
      const parts = [...group.querySelectorAll('.date-part')];
      parts.forEach((input, index) => {
        input.addEventListener('input', () => {
          input.value = input.value.replace(/\D/g, '').slice(0, Number(input.maxLength));
          syncDateValue(group);
          if (input.value.length === Number(input.maxLength) && index < parts.length - 1) {
            parts[index + 1].focus();
          }
        });
        input.addEventListener('blur', () => {
          if (index < 2 && input.value.length === 1) input.value = input.value.padStart(2, '0');
          syncDateValue(group);
        });
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Backspace' && !input.value && index > 0) parts[index - 1].focus();
        });
      });
    });
  }

  async function invoke(body) {
    const { data, error } = await client.functions.invoke('manage-user', { body });
    if (error) throw error;
    if (!data?.ok) throw Error(data?.error || 'Unable to update user.');
    return data;
  }

  async function openEditor(userId) {
    $('editUserMsg').textContent = 'Loading…';
    $('editUserDialog').showModal();
    const { data, error } = await client.from('employee_profiles').select('*').eq('id', userId).single();
    if (error) {
      $('editUserMsg').textContent = error.message;
      return;
    }
    currentUser = data;
    $('editUserId').value = data.id;
    $('editDisplayName').value = data.display_name || '';
    $('editFullName').value = data.full_name || '';
    $('editEmployeeId').value = data.employee_id || '';
    $('editPhone').value = data.phone || '';
    $('editEmail').value = data.email || '';
    $('editStatus').value = data.status || 'active';
    $('editDlNumber').value = data.drivers_license_number || '';
    $('editDlState').value = data.drivers_license_state || '';
    setDateValue('editDlExpires', data.drivers_license_expires || '');
    setDateValue('editMedExpires', data.medical_card_expires || '');
    $('editPassword').value = '';
    $('editForcePasswordChange').checked = Boolean(data.password_reset_required || data.must_change_password);
    $('editIsTester').checked = Boolean(data.is_tester);
    $('testerAccessEditRow').classList.toggle('hidden', !isSuperAdmin());

    if (data.role === 'super_admin') {
      $('editRole').innerHTML = '<option value="super_admin">Super Admin (protected)</option>';
      $('editRole').disabled = true;
    } else {
      $('editRole').innerHTML = '<option value="driver">Driver</option><option value="user">User</option><option value="admin">Admin</option>';
      $('editRole').disabled = false;
      $('editRole').value = data.role;
    }
    $('deleteUser').classList.toggle('hidden', data.role === 'super_admin');

    const failed = Math.max(Number(data.failed_login_count || 0), Number(data.failed_login_attempts || 0));
    $('editCredentialStatus').innerHTML =
      `Failed attempts: <b>${failed}</b><br>` +
      `Locked until: <b>${formatDateTime(data.locked_until)}</b><br>` +
      `Last password reset: <b>${formatDateTime(data.last_password_reset_at)}</b>`;
    $('editUserMsg').textContent = '';
  }

  async function openViewer(userId) {
    $('viewFullName').textContent = 'Loading profile…';
    $('viewUserDialog').showModal();
    const { data, error } = await client.from('employee_profiles').select('*').eq('id', userId).single();
    if (error) {
      $('viewFullName').textContent = 'Unable to load profile';
      $('viewDisplayName').textContent = error.message;
      return;
    }
    $('viewFullName').textContent = data.full_name || data.display_name || 'User Profile';
    $('viewDisplayName').textContent = data.display_name && data.display_name !== data.full_name
      ? `Display name: ${data.display_name}` : '';
    $('viewEmployeeId').textContent = data.employee_id || 'Not entered';
    $('viewRole').textContent = roleLabel(data.role);
    $('viewStatus').textContent = roleLabel(data.status);
    $('viewTesterAccess').textContent = data.is_tester ? 'Yes' : 'No';
    $('viewPhone').textContent = data.phone || 'Not entered';
    $('viewEmail').textContent = data.email || 'Not entered';
    $('viewLicenseNumber').textContent = data.drivers_license_number || 'Not entered';
    $('viewLicenseState').textContent = data.drivers_license_state || 'Not entered';
    $('viewLicenseExpiration').textContent = formatDate(data.drivers_license_expires);
    $('viewMedicalExpiration').textContent = formatDate(data.medical_card_expires);
    $('viewPasswordRequired').textContent =
      data.password_reset_required || data.must_change_password ? 'Yes' : 'No';
    $('viewFailedAttempts').textContent =
      Math.max(Number(data.failed_login_count || 0), Number(data.failed_login_attempts || 0));
    $('viewLockedUntil').textContent = formatDateTime(data.locked_until);
  }

  function applyProfileFilter() {
    let visible = 0;
    document.querySelectorAll('#driversBody tr').forEach((row) => {
      const role = row.dataset.profileRole || '';
      const matches = profileFilter === 'all' ||
        (profileFilter === 'admin' && ['admin', 'super_admin'].includes(role)) ||
        (profileFilter === 'other' && !['driver', 'user', 'admin', 'super_admin'].includes(role)) ||
        role === profileFilter;
      row.classList.toggle('hidden', !matches);
      if (matches) visible++;
    });
    $('profileFilterEmpty').classList.toggle('hidden', visible > 0);
  }

  function attachEditButtons() {
    document.querySelectorAll('#driversBody button[data-user]').forEach((statusButton) => {
      const row = statusButton.closest('tr');
      if (row?.querySelector('.badge')?.textContent.trim().toLowerCase() === 'terminated') {
        row.remove();
        return;
      }
      row.dataset.profileRole = row.cells[2]?.textContent.trim().toLowerCase() || '';
      if (!statusButton.parentElement.querySelector('[data-profile-view]')) {
        const viewButton = document.createElement('button');
        viewButton.type = 'button';
        viewButton.textContent = 'View';
        viewButton.dataset.profileView = statusButton.dataset.user;
        statusButton.insertAdjacentElement('afterend', viewButton);
      }
      if (statusButton.parentElement.querySelector('[data-credential-edit]')) {
        applyProfileFilter();
        return;
      }
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.textContent = 'Edit';
      editButton.dataset.credentialEdit = statusButton.dataset.user;
      editButton.style.marginLeft = '6px';
      statusButton.parentElement.appendChild(editButton);
      statusButton.classList.add('hidden');
    });
    applyProfileFilter();
  }

  const observer = new MutationObserver(attachEditButtons);
  observer.observe($('driversBody'), { childList: true, subtree: true });
  attachEditButtons();

  $('driversBody').addEventListener('click', (event) => {
    const viewButton = event.target.closest('[data-profile-view]');
    if (viewButton) {
      openViewer(viewButton.dataset.profileView);
      return;
    }
    const button = event.target.closest('[data-credential-edit]');
    if (button) openEditor(button.dataset.credentialEdit);
  });
  $('profileFilters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-profile-filter]');
    if (!button) return;
    profileFilter = button.dataset.profileFilter;
    document.querySelectorAll('#profileFilters button').forEach((item) =>
      item.classList.toggle('active', item === button));
    applyProfileFilter();
  });
  $('closeViewUser').onclick = $('closeViewUserBottom').onclick = () => $('viewUserDialog').close();

  $('editGeneratePassword').onclick = () => {
    $('editPassword').value = generatePassword($('editEmployeeId').value.trim());
    $('editForcePasswordChange').checked = true;
  };
  $('generatePassword').onclick = () => {
    $('driverPassword').value = generatePassword($('driverEmployeeId').value.trim());
    $('forcePasswordChange').checked = true;
  };
  $('cancelDriver').onclick = () => $('driverDialog').close();

  $('saveDriver').addEventListener('click', (event) => {
    const requiredIds = [
      'driverDisplayName', 'driverFullName', 'driverEmployeeId', 'driverPhone',
      'driverEmail', 'driverRole', 'driverStatus', 'driverPassword',
      'driverDlNumber', 'driverDlState', 'driverDlExpires', 'driverMedExpires'
    ];
    const missing = requiredIds.map($).find((field) => !String(field?.value || '').trim());
    const passwordChangeRequired = $('forcePasswordChange').checked;
    const formValid = $('driverForm').checkValidity();
    if (!missing && passwordChangeRequired && formValid) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const field = missing || $('forcePasswordChange');
    const details = field.closest('details');
    if (details) details.open = true;
    $('driverFormMsg').textContent =
      'Complete every required field and keep “Require password change at next login” selected.';
    if (!formValid && !missing && passwordChangeRequired) $('driverForm').reportValidity();
    else field.focus();
  }, true);

  $('editUnlockUser').onclick = async () => {
    try {
      $('editUserMsg').textContent = 'Clearing lockout…';
      await invoke({ action: 'unlock_user', userId: $('editUserId').value });
      $('editUserMsg').textContent = 'Lockout and failed attempts cleared.';
      $('editCredentialStatus').innerHTML = 'Failed attempts: <b>0</b><br>Locked until: <b>None</b>';
    } catch (error) {
      $('editUserMsg').textContent = error.message;
    }
  };

  $('deleteUser').onclick = async () => {
    if (!currentUser || currentUser.role === 'super_admin') return;
    const name = currentUser.full_name || currentUser.display_name || 'this driver';
    if (!confirm(`Delete ${name}? The driver will be removed from the active roster and will no longer have active status.`)) return;
    try {
      $('deleteUser').disabled = true;
      $('editUserMsg').textContent = 'Deleting driver…';
      await invoke({
        action: 'delete_user',
        userId: currentUser.id,
        reason: 'Deleted from the admin portal'
      });
      $('editUserDialog').close();
      $('refreshDrivers').click();
      $('driversMsg').textContent = `${name} was deleted from the active roster.`;
    } catch (error) {
      $('editUserMsg').textContent = error.message;
    } finally {
      $('deleteUser').disabled = false;
    }
  };

  $('cancelEditUser').onclick = () => $('editUserDialog').close();
  $('editUserForm').onsubmit = async (event) => {
    event.preventDefault();
    const password = $('editPassword').value;
    const employeeId = $('editEmployeeId').value.trim();
    if (password && !validPassword(password, employeeId)) {
      $('editUserMsg').textContent = 'Password must be 8+ letters/numbers, include a capital and a number, use no special characters, and not contain the Employee ID.';
      return;
    }
    const body = {
      action: 'update_user',
      userId: $('editUserId').value,
      displayName: $('editDisplayName').value.trim(),
      fullName: $('editFullName').value.trim(),
      employeeId,
      phone: $('editPhone').value.trim(),
      email: $('editEmail').value.trim().toLowerCase(),
      role: $('editRole').value,
      status: $('editStatus').value,
      password,
      forcePasswordChange: $('editForcePasswordChange').checked,
      driversLicenseNumber: $('editDlNumber').value.trim() || null,
      driversLicenseState: $('editDlState').value.trim().toUpperCase() || null,
      driversLicenseExpires: $('editDlExpires').value || null,
      medicalCardExpires: $('editMedExpires').value || null
      ,isTester: $('editIsTester').checked
    };
    if (!body.displayName || !body.fullName || !body.employeeId || !body.phone || !body.email) {
      $('editUserMsg').textContent = 'Complete all required fields.';
      return;
    }
    try {
      $('saveEditUser').disabled = true;
      $('editUserMsg').textContent = 'Saving…';
      await invoke(body);
      $('editUserDialog').close();
      document.getElementById('refreshDrivers').click();
      document.getElementById('driversMsg').textContent = password
        ? 'User updated and temporary password set.'
        : 'User updated successfully.';
    } catch (error) {
      $('editUserMsg').textContent = error.message;
    } finally {
      $('saveEditUser').disabled = false;
    }
  };
  setupDateEntries();
})();
