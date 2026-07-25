(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const client = window.FP365_ADMIN_CLIENT;
  if (!client) throw new Error('Admin connection is unavailable. Refresh the page and try again.');
  let currentUser = null;

  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || String(event.reason || 'Unknown loading error');
    const status = $('driversMsg');
    if (status) status.textContent = `Unable to load driver records: ${message}`;
  });

  const formatDateTime = (value) => value ? new Date(value).toLocaleString() : 'None';
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
    $('editDlExpires').value = data.drivers_license_expires || '';
    $('editMedExpires').value = data.medical_card_expires || '';
    $('editPassword').value = '';
    $('editForcePasswordChange').checked = Boolean(data.password_reset_required || data.must_change_password);

    if (data.role === 'super_admin') {
      $('editRole').innerHTML = '<option value="super_admin">Super Admin (protected)</option>';
      $('editRole').disabled = true;
    } else {
      $('editRole').innerHTML = '<option value="driver">Driver</option><option value="admin">Admin</option>';
      $('editRole').disabled = false;
      $('editRole').value = data.role;
    }

    const failed = Math.max(Number(data.failed_login_count || 0), Number(data.failed_login_attempts || 0));
    $('editCredentialStatus').innerHTML =
      `Failed attempts: <b>${failed}</b><br>` +
      `Locked until: <b>${formatDateTime(data.locked_until)}</b><br>` +
      `Last password reset: <b>${formatDateTime(data.last_password_reset_at)}</b>`;
    $('editUserMsg').textContent = '';
  }

  function attachEditButtons() {
    document.querySelectorAll('#driversBody button[data-user]').forEach((statusButton) => {
      statusButton.textContent = 'Status';
      if (statusButton.parentElement.querySelector('[data-credential-edit]')) return;
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.textContent = 'Edit';
      editButton.dataset.credentialEdit = statusButton.dataset.user;
      editButton.style.marginLeft = '6px';
      statusButton.insertAdjacentElement('afterend', editButton);
    });
  }

  const observer = new MutationObserver(attachEditButtons);
  observer.observe($('driversBody'), { childList: true, subtree: true });
  attachEditButtons();

  $('driversBody').addEventListener('click', (event) => {
    const button = event.target.closest('[data-credential-edit]');
    if (button) openEditor(button.dataset.credentialEdit);
  });

  $('editGeneratePassword').onclick = () => {
    $('editPassword').value = generatePassword($('editEmployeeId').value.trim());
    $('editForcePasswordChange').checked = true;
  };
  $('generatePassword').onclick = () => {
    $('driverPassword').value = generatePassword($('driverEmployeeId').value.trim());
    $('forcePasswordChange').checked = true;
  };
  $('cancelDriver').onclick = () => $('driverDialog').close();

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
})();
