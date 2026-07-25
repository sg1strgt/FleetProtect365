(()=>{const c=window.FP365_ADMIN_CONFIG,s=supabase.createClient(c.supabaseUrl,c.supabasePublishableKey,{auth:{persistSession:true}}),$=x=>document.getElementById(x);window.FP365_ADMIN_CLIENT=s;let p,co,users=[];const V=['login','dashboard','drivers','trucks','recipients','audit','settings'],e=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])),f=d=>d?new Date(d).toLocaleString():'—';function show(v){V.forEach(x=>$(x).classList.toggle('hidden',x!==v));document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));$('title').textContent={dashboard:'Super Admin Dashboard',drivers:'Drivers and Users',trucks:'Truck Assets',recipients:'Report Recipients',audit:'Audit Trail',settings:'Company Settings',login:'Admin Login'}[v];if(v!=='login')load(v)}async function identity(u){let{data,error}=await s.from('employee_profiles').select('*,companies(*)').eq('id',u.id).single();if(error)throw error;p=data;co=Array.isArray(data.companies)?data.companies[0]:data.companies;co=co||{id:data.company_id};if(!['admin','super_admin'].includes(p.role))throw Error('Admin access required.');$('session').textContent=`${p.full_name} · ${p.role}`;$('logout').classList.remove('hidden');show('dashboard')}async function boot(){let{data}=await s.auth.getSession();data.session?identity(data.session.user):show('login')}async function load(v){if(v==='dashboard')return dashboard();if(v==='drivers')return drivers();if(v==='trucks')return trucks();if(v==='recipients')return recipients();if(v==='audit')return audit();if(v==='settings')return settings()}async function dashboard(){let[d,t,r,i]=await Promise.all([s.from('employee_profiles').select('*').eq('company_id',co.id).is('deleted_at',null),s.from('trucks').select('*').eq('company_id',co.id).is('deleted_at',null),s.from('report_recipients').select('*').eq('company_id',co.id).is('deleted_at',null),s.from('inspections').select('*').eq('company_id',co.id).order('submitted_at',{ascending:false}).limit(8)]);users=d.data||[];$('userCount').textContent=users.length;$('truckCount').textContent=(t.data||[]).length;$('recipientCount').textContent=(r.data||[]).filter(x=>x.active&&x.receive_end_of_shift).length;let st=new Date();st.setHours(0,0,0,0);$('entryCount').textContent=(i.data||[]).filter(x=>x.submitted_at&&new Date(x.submitted_at)>=st).length;let z={active:0,inactive:0,suspended:0,terminated:0};users.forEach(x=>z[x.status]=(z[x.status]||0)+1);$('statusSummary').innerHTML=Object.entries(z).map(([k,v])=>`<div class="item"><b>${e(k)}</b>: ${v}</div>`).join('');$('recentEntries').innerHTML=(i.data||[]).map(x=>`<div class="item"><b>${e(x.inspection_number||'Inspection')}</b><div>${e(x.truck_number)} · ${e(x.location_from)} → ${e(x.location_to)}</div><small>${f(x.submitted_at)}</small></div>`).join('')||'<p>No submissions yet.</p>'}async function drivers(){let{data,error}=await s.from('employee_profiles').select('*').eq('company_id',co.id).is('deleted_at',null).order('display_name');if(error)throw error;users=data||[];$('driversBody').innerHTML=users.map(x=>`<tr><td><b>${e(x.display_name||x.full_name)}</b><br><small>${e(x.full_name)}</small></td><td>${e(x.employee_id)}</td><td>${e(x.role)}</td><td><span class="badge ${x.status}">${e(x.status)}</span></td><td>${e(x.email)}</td><td><button data-user="${x.id}" data-status="${x.status}">Change</button></td></tr>`).join('');document.querySelectorAll('[data-user]').forEach(b=>b.onclick=()=>{$('statusUser').value=b.dataset.user;$('newStatus').value=b.dataset.status;$('statusReason').value='';$('statusDialog').showModal()})}async function saveStatus(){let id=$('statusUser').value,n=$('newStatus').value,r=$('statusReason').value.trim(),old=users.find(x=>x.id===id);let{error}=await s.from('employee_profiles').update({status:n,status_reason:r||null,updated_by:p.id,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;await s.from('employee_status_audit').insert({employee_profile_id:id,company_id:co.id,previous_status:old.status,new_status:n,reason:r||null,changed_by:p.id});drivers()}function validPassword(password,employeeId){return password.length>=8&&/[A-Z]/.test(password)&&/[A-Za-z]/.test(password)&&/\d/.test(password)&&/^[A-Za-z0-9]+$/.test(password)&&!password.includes(employeeId)}async function createDriver(){const payload={action:'create_user',displayName:$('driverDisplayName').value.trim(),fullName:$('driverFullName').value.trim(),employeeId:$('driverEmployeeId').value.trim(),phone:$('driverPhone').value.trim(),email:$('driverEmail').value.trim().toLowerCase(),role:$('driverRole').value,status:$('driverStatus').value,password:$('driverPassword').value,driversLicenseNumber:$('driverDlNumber').value.trim()||null,driversLicenseState:$('driverDlState').value.trim().toUpperCase()||null,driversLicenseExpires:$('driverDlExpires').value||null,medicalCardExpires:$('driverMedExpires').value||null};if(!payload.displayName||!payload.fullName||!payload.employeeId||!payload.phone||!payload.email||!payload.password){$('driverFormMsg').textContent='Complete all required fields.';return}if(!validPassword(payload.password,payload.employeeId)){$('driverFormMsg').textContent='Password must be 8+ letters/numbers, include a capital and a number, use no special characters, and not contain the Employee ID.';return}$('saveDriver').disabled=true;$('driverFormMsg').textContent='Creating user…';const{data,error}=await s.functions.invoke('manage-user',{body:payload});$('saveDriver').disabled=false;if(error){$('driverFormMsg').textContent=error.message;return}if(!data?.ok){$('driverFormMsg').textContent=data?.error||'Unable to create user.';return}$('driverFormMsg').textContent='User created successfully.';setTimeout(()=>{$('driverDialog').close();$('driverForm').reset();$('driverFormMsg').textContent='';drivers()},600)}async function trucks(){let{data,error}=await s.from('trucks').select('*').eq('company_id',co.id).is('deleted_at',null).order('truck_number');if(error)throw error;$('trucksBody').innerHTML=(data||[]).map(x=>`<tr><td><b>${e(x.truck_number)}</b></td><td><span class="badge ${x.status}">${e(x.status)}</span></td><td><button data-truck="${x.id}" data-ts="${x.status}">${x.status==='active'?'Set Inactive':'Set Active'}</button></td></tr>`).join('');document.querySelectorAll('[data-truck]').forEach(b=>b.onclick=async()=>{await s.from('trucks').update({status:b.dataset.ts==='active'?'inactive':'active',updated_by:p.id,updated_at:new Date().toISOString()}).eq('id',b.dataset.truck);trucks()})}async function addTruck(){let n=$('truckNumber').value.trim();if(!n)return;let{error}=await s.from('trucks').insert({company_id:co.id,truck_number:n,status:'active',created_by:p.id,updated_by:p.id});if(error)throw error;$('truckNumber').value='';trucks()}async function recipients(){let{data,error}=await s.from('report_recipients').select('*').eq('company_id',co.id).is('deleted_at',null).order('display_name');if(error)throw error;$('recipientsBody').innerHTML=(data||[]).map(x=>`<tr><td>${e(x.display_name)}</td><td>${e(x.email)}</td><td>${e(x.recipient_type)}</td><td>${x.receive_end_of_shift?'Yes':'No'}</td><td>${x.active?'Active':'Inactive'}</td><td><button data-rec="${x.id}" data-ra="${x.active}">${x.active?'Disable':'Enable'}</button></td></tr>`).join('');document.querySelectorAll('[data-rec]').forEach(b=>b.onclick=async()=>{await s.from('report_recipients').update({active:b.dataset.ra!=='true',updated_by:p.id,updated_at:new Date().toISOString()}).eq('id',b.dataset.rec);recipients()})}async function addRecipient(){let n=$('recipientName').value.trim(),m=$('recipientEmail').value.trim(),t=$('recipientType').value;if(!n||!m)return;let{error}=await s.from('report_recipients').insert({company_id:co.id,display_name:n,email:m,recipient_type:t,receive_end_of_shift:true,active:true,created_by:p.id,updated_by:p.id});if(error)throw error;recipients()}async function audit(){let{data,error}=await s.from('employee_status_audit').select('*,employee_profiles!employee_status_audit_employee_profile_id_fkey(display_name,full_name)').eq('company_id',co.id).order('changed_at',{ascending:false}).limit(100);$('auditList').innerHTML=error?`<p>${e(error.message)}</p>`:(data||[]).map(x=>`<div class="item"><b>${e(x.employee_profiles?.display_name||x.employee_profiles?.full_name||'User')}</b><div>${e(x.previous_status||'none')} → ${e(x.new_status)}</div><div>${e(x.reason||'No reason')}</div><small>${f(x.changed_at)}</small></div>`).join('')||'<p>No changes yet.</p>'}function settings(){$('companyName').value=co.company_name||'';$('companyCode').value=co.company_code||'';$('driveFolder').value=co.storage_location||'';$('contactName').value=co.contact_name||'';$('contactEmail').value=co.contact_email||'';$('contactPhone').value=co.contact_phone||''}async function saveSettings(){let u={storage_location:$('driveFolder').value.trim(),contact_name:$('contactName').value.trim(),contact_email:$('contactEmail').value.trim(),contact_phone:$('contactPhone').value.trim()},q=await s.from('companies').update(u).eq('id',co.id).select('*').single();if(q.error)return $('settingsMsg').textContent=q.error.message;co=q.data;$('settingsMsg').textContent='Saved.'}$('loginBtn').onclick=async()=>{let{data,error}=await s.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)return $('loginMsg').textContent=error.message;identity(data.user).catch(x=>$('loginMsg').textContent=x.message)};$('logout').onclick=async()=>{await s.auth.signOut();location.reload()};document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>show(b.dataset.view));$('refreshDrivers').onclick=drivers;$('refreshAudit').onclick=audit;$('addDriver').onclick=()=>{$('driverForm').reset();$('driverFormMsg').textContent='';$('driverDialog').showModal()};$('saveDriver').onclick=x=>{x.preventDefault();createDriver()};$('addTruck').onclick=()=>$('truckDialog').showModal();$('saveTruck').onclick=x=>{x.preventDefault();addTruck();$('truckDialog').close()};$('addRecipient').onclick=()=>$('recipientDialog').showModal();$('saveRecipient').onclick=x=>{x.preventDefault();addRecipient();$('recipientDialog').close()};$('saveStatus').onclick=x=>{x.preventDefault();saveStatus();$('statusDialog').close()};$('saveSettings').onclick=saveSettings;boot().catch(x=>$('loginMsg').textContent=x.message)})();

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

