(() => {
  'use strict';
  const client = window.FP365_ADMIN_CLIENT;
  if (!client) return;
  const $ = (id) => document.getElementById(id);

  $('saveRecipient').addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const name = $('recipientName').value.trim();
    const email = $('recipientEmail').value.trim().toLowerCase();
    const type = $('recipientType').value;
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      $('recipientFormMsg').textContent = 'Enter a display name and valid email address.';
      return;
    }
    const button = $('saveRecipient');
    button.disabled = true;
    $('recipientFormMsg').textContent = 'Saving recipient…';
    const { data: auth } = await client.auth.getUser();
    const { data: profile, error: profileError } = await client
      .from('employee_profiles').select('company_id').eq('id', auth.user?.id).single();
    if (profileError) {
      button.disabled = false;
      $('recipientFormMsg').textContent = profileError.message;
      return;
    }
    const { data: existing, error: lookupError } = await client
      .from('report_recipients').select('id,active,deleted_at')
      .eq('company_id', profile.company_id).ilike('email', email).maybeSingle();
    if (lookupError) {
      button.disabled = false;
      $('recipientFormMsg').textContent = lookupError.message;
      return;
    }
    let error;
    if (existing) {
      ({ error } = await client.from('report_recipients').update({
        display_name: name,
        recipient_type: type,
        receive_end_of_shift: true,
        active: true,
        deleted_at: null,
        updated_by: auth.user.id,
        updated_at: new Date().toISOString()
      }).eq('id', existing.id));
    } else {
      ({ error } = await client.from('report_recipients').insert({
        company_id: profile.company_id,
        display_name: name,
        email,
        recipient_type: type,
        receive_end_of_shift: true,
        active: true,
        created_by: auth.user.id,
        updated_by: auth.user.id
      }));
    }
    button.disabled = false;
    if (error) {
      $('recipientFormMsg').textContent = error.message;
      return;
    }
    $('recipientFormMsg').textContent = existing ? 'Existing recipient activated and updated.' : 'Recipient added successfully.';
    setTimeout(() => {
      $('recipientDialog').close();
      document.querySelector('[data-view="recipients"]').click();
    }, 650);
  }, true);

  $('addRecipient').addEventListener('click', () => {
    $('recipientFormMsg').textContent = '';
  }, true);
})();
