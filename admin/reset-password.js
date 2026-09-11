(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.FP365_ADMIN_CONFIG;
  const client = supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: { persistSession: false, detectSessionInUrl: true, flowType: 'implicit' }
  });
  let recoveryReady = false;
  const fragment = new URLSearchParams(location.hash.slice(1));
  const recoveryLink = fragment.get('type') === 'recovery';
  if (recoveryLink) {
    $('requestForm').hidden = true;
    $('status').textContent = 'Checking your reset link…';
  }
  if (fragment.has('error')) {
    $('status').textContent = 'This reset link is invalid or expired. Request a new link below.';
    history.replaceState(null, '', location.pathname);
  }
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session) {
      recoveryReady = true;
      $('heading').textContent = 'Choose a new password';
      $('requestForm').hidden = true;
      $('passwordForm').hidden = false;
      $('status').textContent = '';
      history.replaceState(null, '', location.pathname);
    }
  });
  client.auth.getSession().then(({ error }) => {
    if (recoveryLink && !recoveryReady) {
      $('requestForm').hidden = false;
      $('status').textContent = 'This reset link could not be verified. Please request a new link.';
    } else if (error) {
      $('status').textContent = 'Unable to verify the reset link. Please request a new link.';
    }
  });
  $('requestForm').onsubmit = async event => {
    event.preventDefault();
    $('sendReset').disabled = true;
    $('status').textContent = 'Requesting reset link…';
    try {
      const { error } = await client.auth.resetPasswordForEmail($('resetEmail').value.trim(), {
        redirectTo: new URL('reset-password.html', location.href).href.split('#')[0].split('?')[0]
      });
      if (error) throw error;
      $('status').textContent = 'If this email is eligible for password recovery, a reset link will arrive shortly. Check your inbox and spam folder.';
    } catch (error) {
      $('status').textContent = error.message || 'Unable to send the reset link. Please try again.';
    } finally { $('sendReset').disabled = false; }
  };
  $('passwordForm').onsubmit = async event => {
    event.preventDefault();
    if (!recoveryReady) return;
    const password = $('newPassword').value;
    if (password !== $('confirmPassword').value) {
      $('status').textContent = 'The passwords do not match.'; return;
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      $('status').textContent = 'Use at least 8 characters, including a capital letter and a number.'; return;
    }
    $('savePassword').disabled = true;
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      recoveryReady = false;
      $('passwordForm').reset();
      $('passwordForm').hidden = true;
      $('heading').textContent = 'Password updated';
      $('status').textContent = 'Your new password is saved. Return to Admin Login to sign in.';
      await client.auth.signOut({ scope: 'local' });
    } catch (error) {
      $('status').textContent = error.message || 'Unable to update your password. Please try again.';
    } finally { $('savePassword').disabled = false; }
  };
})();
