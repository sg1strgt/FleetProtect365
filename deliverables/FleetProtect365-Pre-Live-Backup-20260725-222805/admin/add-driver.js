(()=>{
const cfg=window.FP365_ADMIN_CONFIG||{};
const client=supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true}});
const $=id=>document.getElementById(id);
function validPassword(password,employeeId){return password.length>=8&&/[A-Z]/.test(password)&&/[A-Za-z]/.test(password)&&/\d/.test(password)&&/^[A-Za-z0-9]+$/.test(password)&&!password.includes(employeeId)}
async function createUser(){
 const payload={action:'create_user',displayName:$('driverDisplayName').value.trim(),fullName:$('driverFullName').value.trim(),employeeId:$('driverEmployeeId').value.trim(),phone:$('driverPhone').value.trim(),email:$('driverEmail').value.trim().toLowerCase(),role:$('driverRole').value,status:$('driverStatus').value,password:$('driverPassword').value,driversLicenseNumber:$('driverDlNumber').value.trim()||null,driversLicenseState:$('driverDlState').value.trim().toUpperCase()||null,driversLicenseExpires:$('driverDlExpires').value||null,medicalCardExpires:$('driverMedExpires').value||null};
 if(!payload.displayName||!payload.fullName||!payload.employeeId||!payload.phone||!payload.email||!payload.password){$('driverFormMsg').textContent='Complete all required fields.';return}
 if(!validPassword(payload.password,payload.employeeId)){$('driverFormMsg').textContent='Password must be 8+ letters/numbers, include a capital and number, contain no special characters, and not contain the Employee ID.';return}
 $('saveDriver').disabled=true;$('driverFormMsg').textContent='Creating user…';
 const {data,error}=await client.functions.invoke('manage-user',{body:payload});
 $('saveDriver').disabled=false;
 if(error){$('driverFormMsg').textContent=error.message;return}
 if(!data?.ok){$('driverFormMsg').textContent=data?.error||'Unable to create user.';return}
 $('driverFormMsg').textContent='User created successfully.';
 setTimeout(()=>{location.reload()},700);
}
window.addEventListener('DOMContentLoaded',()=>{
 $('addDriver').onclick=()=>{$('driverForm').reset();$('driverFormMsg').textContent='';$('driverDialog').showModal()};
 $('saveDriver').onclick=e=>{e.preventDefault();createUser()};
});
})();
