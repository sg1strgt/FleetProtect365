(() => {
  'use strict';
  const client = window.FP365_ADMIN_CLIENT;
  const addButton = document.getElementById('addRecipient');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  if (!client || !addButton || document.getElementById('deleteRecipient')) return;

  const actions = document.createElement('div');
  actions.className = 'recipient-header-actions';
  Object.assign(actions.style, { display: 'flex', gap: '8px', flexWrap: 'wrap' });
  addButton.before(actions);
  addButton.textContent = 'ADD';
  actions.appendChild(addButton);

  const deleteButton = document.createElement('button');
  deleteButton.id = 'deleteRecipient';
  deleteButton.type = 'button';
  deleteButton.className = 'danger';
  deleteButton.textContent = 'DELETE';
  actions.appendChild(deleteButton);

  const editButton = document.createElement('button');
  editButton.id = 'editRecipient';
  editButton.type = 'button';
  editButton.textContent = 'EDIT';
  actions.appendChild(editButton);

  const dialog = document.createElement('dialog');
  dialog.id = 'deleteRecipientDialog';
  dialog.innerHTML = `<form>
    <h3>Delete Report Recipient</h3>
    <p>Select the recipient to remove. They will stop receiving reports immediately.</p>
    <label>Recipient *</label>
    <select id="deleteRecipientSelect" required><option value="">Select recipient</option></select>
    <p id="deleteRecipientDetail"></p>
    <p id="deleteRecipientMsg"></p>
    <div class="actions">
      <button id="cancelDeleteRecipient" type="button">Cancel</button>
      <button id="confirmDeleteRecipient" class="danger" type="button" disabled>Delete Recipient</button>
    </div>
  </form>`;
  document.body.appendChild(dialog);

  const editDialog = document.createElement('dialog');
  editDialog.id = 'editRecipientDialog';
  editDialog.innerHTML = `<form>
    <h3>Edit Report Recipient</h3>
    <label>Recipient *</label>
    <select id="editRecipientSelect" required><option value="">Select recipient</option></select>
    <label>Display Name *</label>
    <input id="editRecipientName" required>
    <label>Email Address *</label>
    <input id="editRecipientEmail" type="email" required>
    <label>Recipient Type *</label>
    <select id="editRecipientType" required>
      <option value="additional">External / Additional</option>
      <option value="admin">Admin</option>
      <option value="super_admin">Super Admin</option>
    </select>
    <label class="check-row"><input id="editRecipientEndShift" type="checkbox"> Receive End-of-Shift reports</label>
    <label class="check-row"><input id="editRecipientActive" type="checkbox"> Active</label>
    <p id="editRecipientMsg"></p>
    <div class="actions">
      <button id="cancelEditRecipient" type="button">Cancel</button>
      <button id="saveEditRecipient" class="primary" type="button" disabled>Save Changes</button>
    </div>
  </form>`;
  document.body.appendChild(editDialog);

  const select = document.getElementById('deleteRecipientSelect');
  const detail = document.getElementById('deleteRecipientDetail');
  const message = document.getElementById('deleteRecipientMsg');
  const confirmButton = document.getElementById('confirmDeleteRecipient');
  let recipients = [];
  let companyId = '';
  let userId = '';
  let editRecipients = [];
  let editCompanyId = '';
  let editUserId = '';

  const editSelect = document.getElementById('editRecipientSelect');
  const editName = document.getElementById('editRecipientName');
  const editEmail = document.getElementById('editRecipientEmail');
  const editType = document.getElementById('editRecipientType');
  const editEndShift = document.getElementById('editRecipientEndShift');
  const editActive = document.getElementById('editRecipientActive');
  const editMessage = document.getElementById('editRecipientMsg');
  const saveEditButton = document.getElementById('saveEditRecipient');

  select.onchange = () => {
    const recipient = recipients.find(item => item.id === select.value);
    detail.textContent = recipient ? `Delete ${recipient.display_name} (${recipient.email})?` : '';
    confirmButton.disabled = !recipient;
  };

  document.getElementById('cancelDeleteRecipient').onclick = () => dialog.close();
  document.getElementById('cancelEditRecipient').onclick = () => editDialog.close();

  editSelect.onchange = () => {
    const recipient = editRecipients.find(item => item.id === editSelect.value);
    editName.value = recipient?.display_name || '';
    editEmail.value = recipient?.email || '';
    editType.value = recipient?.recipient_type || 'additional';
    editEndShift.checked = Boolean(recipient?.receive_end_of_shift);
    editActive.checked = Boolean(recipient?.active);
    saveEditButton.disabled = !recipient;
    editMessage.textContent = '';
  };

  deleteButton.onclick = async () => {
    message.textContent = 'Loading recipients…';
    detail.textContent = '';
    confirmButton.disabled = true;
    select.innerHTML = '<option value="">Select recipient</option>';
    dialog.showModal();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) {
      message.textContent = authError?.message || 'Admin session is unavailable.';
      return;
    }
    userId = auth.user.id;
    const { data: profile, error: profileError } = await client
      .from('employee_profiles').select('company_id').eq('id', userId).single();
    if (profileError) {
      message.textContent = profileError.message;
      return;
    }
    companyId = profile.company_id;
    const { data, error } = await client.from('report_recipients')
      .select('id,display_name,email').eq('company_id', companyId)
      .is('deleted_at', null).order('display_name');
    if (error) {
      message.textContent = error.message;
      return;
    }
    recipients = data || [];
    select.innerHTML = '<option value="">Select recipient</option>' + recipients
      .map(item => `<option value="${esc(item.id)}">${esc(item.display_name)} — ${esc(item.email)}</option>`).join('');
    message.textContent = recipients.length ? '' : 'There are no recipients available to delete.';
  };

  editButton.onclick = async () => {
    editMessage.textContent = 'Loading recipients…';
    editSelect.innerHTML = '<option value="">Select recipient</option>';
    editName.value = '';
    editEmail.value = '';
    saveEditButton.disabled = true;
    editDialog.showModal();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) {
      editMessage.textContent = authError?.message || 'Admin session is unavailable.';
      return;
    }
    editUserId = auth.user.id;
    const { data: profile, error: profileError } = await client
      .from('employee_profiles').select('company_id').eq('id', editUserId).single();
    if (profileError) {
      editMessage.textContent = profileError.message;
      return;
    }
    editCompanyId = profile.company_id;
    const { data, error } = await client.from('report_recipients')
      .select('id,display_name,email,recipient_type,receive_end_of_shift,active')
      .eq('company_id', editCompanyId).is('deleted_at', null).order('display_name');
    if (error) {
      editMessage.textContent = error.message;
      return;
    }
    editRecipients = data || [];
    editSelect.innerHTML = '<option value="">Select recipient</option>' + editRecipients
      .map(item => `<option value="${esc(item.id)}">${esc(item.display_name)} — ${esc(item.email)}</option>`).join('');
    editMessage.textContent = editRecipients.length ? '' : 'There are no recipients available to edit.';
  };

  saveEditButton.onclick = async () => {
    const recipient = editRecipients.find(item => item.id === editSelect.value);
    const name = editName.value.trim();
    const email = editEmail.value.trim().toLowerCase();
    if (!recipient || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      editMessage.textContent = 'Select a recipient and enter a display name and valid email address.';
      return;
    }
    saveEditButton.disabled = true;
    editMessage.textContent = `Saving ${name}…`;
    const { error } = await client.from('report_recipients').update({
      display_name: name,
      email,
      recipient_type: editType.value,
      receive_end_of_shift: editEndShift.checked,
      active: editActive.checked,
      updated_at: new Date().toISOString(),
      updated_by: editUserId
    }).eq('id', recipient.id).eq('company_id', editCompanyId);
    if (error) {
      saveEditButton.disabled = false;
      editMessage.textContent = error.message;
      return;
    }
    editDialog.close();
    document.querySelector('nav [data-view="recipients"]')?.click();
  };

  confirmButton.onclick = async () => {
    const recipient = recipients.find(item => item.id === select.value);
    if (!recipient) return;
    confirmButton.disabled = true;
    message.textContent = `Deleting ${recipient.display_name}…`;
    const now = new Date().toISOString();
    const { error } = await client.from('report_recipients').update({
      active: false,
      receive_end_of_shift: false,
      deleted_at: now,
      updated_at: now,
      updated_by: userId
    }).eq('id', recipient.id).eq('company_id', companyId);
    if (error) {
      confirmButton.disabled = false;
      message.textContent = error.message;
      return;
    }
    dialog.close();
    document.querySelector('nav [data-view="recipients"]')?.click();
  };
})();
