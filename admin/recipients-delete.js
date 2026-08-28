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
  actions.appendChild(addButton);

  const deleteButton = document.createElement('button');
  deleteButton.id = 'deleteRecipient';
  deleteButton.type = 'button';
  deleteButton.className = 'danger';
  deleteButton.textContent = 'Delete Recipient';
  actions.appendChild(deleteButton);

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

  const select = document.getElementById('deleteRecipientSelect');
  const detail = document.getElementById('deleteRecipientDetail');
  const message = document.getElementById('deleteRecipientMsg');
  const confirmButton = document.getElementById('confirmDeleteRecipient');
  let recipients = [];
  let companyId = '';
  let userId = '';

  select.onchange = () => {
    const recipient = recipients.find(item => item.id === select.value);
    detail.textContent = recipient ? `Delete ${recipient.display_name} (${recipient.email})?` : '';
    confirmButton.disabled = !recipient;
  };

  document.getElementById('cancelDeleteRecipient').onclick = () => dialog.close();

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
