
(() => {
'use strict';
const DRIVER_KEY='fp365_drivers_v1',TRUCK_KEY='fp365_trucks_v1',DISPATCH_KEY='fp365_dispatch_delays_v1',SUPER_ADMIN_EMPLOYEE_ID='8739135';
let drivers=[],trucks=[],dispatchDelays=[],driverFilter='all',truckFilter='all';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const norm=v=>String(v||'').trim().toLowerCase();
const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const load=(k)=>{try{const x=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(x)?x:[]}catch{return[]}};
const save=()=>{localStorage.setItem(DRIVER_KEY,JSON.stringify(drivers));localStorage.setItem(TRUCK_KEY,JSON.stringify(trucks));localStorage.setItem(DISPATCH_KEY,JSON.stringify(dispatchDelays))};
const formatDate=v=>{if(!v)return'Not entered';const d=new Date(`${v}T12:00:00`);return isNaN(d)?v:d.toLocaleDateString()};
const expiryClass=v=>{if(!v)return'';const t=new Date();t.setHours(0,0,0,0);const d=new Date(`${v}T00:00:00`);const days=Math.ceil((d-t)/86400000);return days<0?'expired':days<=45?'expiring':''};
const csvCell=v=>`"${String(v??'').replace(/"/g,'""')}"`;
const firstValue=(obj,keys)=>{for(const k of keys){const v=obj?.[k];if(v!==undefined&&v!==null&&String(v).trim()!=='')return v}return''};
function normalizeDriver(d={}){
 const full=String(firstValue(d,['fullName','name','driverName','driver_name']));let first=String(firstValue(d,['firstName','first_name'])),last=String(firstValue(d,['lastName','last_name']));
 if((!first||!last)&&full){const p=full.trim().split(/\s+/);if(!first)first=p.shift()||'';if(!last)last=p.join(' ')}
 return {...d,id:d.id||uid(),firstName:first,lastName:last,employeeId:String(firstValue(d,['employeeId','employerId','employee_id','employer_id','driverId','driver_id'])),role:firstValue(d,['role','userRole','user_role'])||'driver',status:d.status||'active',phone:firstValue(d,['phone','phoneNumber','phone_number']),email:firstValue(d,['email','emailAddress','email_address']),licenseNumber:firstValue(d,['licenseNumber','license_number','driversLicenseNumber','drivers_license_number','dlNumber','dl_number']),licenseState:firstValue(d,['licenseState','license_state','driversLicenseState','drivers_license_state','dlState','dl_state']),licenseExpiration:firstValue(d,['licenseExpiration','license_expiration','driversLicenseExpiration','drivers_license_expiration','dlExpiration','dl_expiration']),medicalExpiration:firstValue(d,['medicalExpiration','medical_expiration','medicalCardExpiration','medical_card_expiration']),notes:d.notes||'',temporaryPassword:String(firstValue(d,['temporaryPassword','temporary_password'])),mustChangePassword:Boolean(firstValue(d,['mustChangePassword','must_change_password'])),failedAttempts:Number(firstValue(d,['failedAttempts','failed_attempts'])||0),lockedUntil:String(firstValue(d,['lockedUntil','locked_until'])),lastLogin:String(firstValue(d,['lastLogin','last_login'])),passwordHistory:Array.isArray(d.passwordHistory)?d.passwordHistory:[]};
}
function normalizeTruck(t={}){
 return {...t,id:t.id||uid(),number:String(firstValue(t,['number','truckNumber','truck_number'])),status:t.status||'active',year:t.year||'',make:t.make||'',model:t.model||'',vin:t.vin||'',plate:firstValue(t,['plate','licensePlate','license_plate']),plateState:firstValue(t,['plateState','plate_state']),odometer:t.odometer||'',quarterlyInspection:firstValue(t,['quarterlyInspection','quarterly_inspection']),annualInspection:firstValue(t,['annualInspection','annual_inspection','inspectionExpiration','inspection_expiration']),insurance:firstValue(t,['insurance','insuranceExpiration','insurance_expiration','registrationExpiration','registration_expiration']),notes:t.notes||''};
}
function setDateValue(id,value=''){
 const hidden=$(id),group=hidden?.previousElementSibling;if(!hidden||!group?.classList.contains('date-entry'))return;hidden.value=value||'';const [y='',m='',d='']=String(value||'').split('-');group.querySelector('.mm').value=m;group.querySelector('.dd').value=d;group.querySelector('.yyyy').value=y;
}
function readDateValue(id){
 const hidden=$(id),group=hidden?.previousElementSibling;if(!hidden||!group)return'';const m=group.querySelector('.mm').value.padStart(2,'0'),d=group.querySelector('.dd').value.padStart(2,'0'),y=group.querySelector('.yyyy').value;if(!m&&!d&&!y)return'';if(m.length!==2||d.length!==2||y.length!==4)return null;const iso=`${y}-${m}-${d}`,dt=new Date(`${iso}T12:00:00`);if(isNaN(dt)||dt.getFullYear()!=+y||dt.getMonth()+1!=+m||dt.getDate()!=+d)return null;hidden.value=iso;return iso;
}
function setupDateEntries(){document.querySelectorAll('.date-entry').forEach(group=>{const parts=[...group.querySelectorAll('.date-part')];parts.forEach((input,i)=>{input.addEventListener('input',()=>{input.value=input.value.replace(/\D/g,'').slice(0,+input.maxLength);if(input.value.length===+input.maxLength&&i<parts.length-1)parts[i+1].focus()});input.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!input.value&&i>0){parts[i-1].focus();parts[i-1].setSelectionRange(parts[i-1].value.length,parts[i-1].value.length)}});input.addEventListener('blur',()=>{if((i===0||i===1)&&input.value.length===1)input.value=input.value.padStart(2,'0')})})})}
function toast(message){let el=document.getElementById('saveToast');if(!el){el=document.createElement('div');el.id='saveToast';el.className='save-toast';document.body.appendChild(el)}el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2200)}

function downloadCsv(name,headers,rows){const csv=[headers,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
function showPage(name){document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));$(`${name}Page`).classList.remove('hidden');document.querySelectorAll('#mainNav [data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===name));renderDashboard()}
$('mainNav').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)showPage(b.dataset.page)});

function renderDashboard(){
 $('dashboardDriverCount').textContent=drivers.length;
 $('dashboardTruckCount').textContent=trucks.filter(t=>t.status==='active').length;
 $('dashboardFrozenCount').textContent=drivers.filter(d=>d.status==='frozen').length;
 $('dashboardOosCount').textContent=trucks.filter(t=>t.status==='out_of_service').length;
}

function driverRole(d){return d.employeeId===SUPER_ADMIN_EMPLOYEE_ID?'super_admin':d.role}
function randomIndex(length){const values=new Uint32Array(1);crypto.getRandomValues(values);return values[0]%length}
function shuffle(value){const chars=[...value];for(let i=chars.length-1;i>0;i--){const j=randomIndex(i+1);[chars[i],chars[j]]=[chars[j],chars[i]]}return chars.join('')}
function generateTemporaryPassword(employeeId=''){
 const upper='ABCDEFGHJKLMNPQRSTUVWXYZ',lower='abcdefghijkmnopqrstuvwxyz',numbers='23456789',all=upper+lower+numbers;
 let password='';
 do{password=shuffle(upper[randomIndex(upper.length)]+lower[randomIndex(lower.length)]+numbers[randomIndex(numbers.length)]+Array.from({length:7},()=>all[randomIndex(all.length)]).join(''))}while(employeeId&&password.toLowerCase().includes(String(employeeId).toLowerCase()));
 return password;
}
function setAuthenticationFields(d={}){
 $('temporaryPassword').value=d.temporaryPassword||'';
 $('mustChangePassword').checked=Boolean(d.mustChangePassword);
 $('failedAttempts').value=Number(d.failedAttempts||0);
 $('lockedUntil').value=d.lockedUntil||'';
 $('lastLogin').value=d.lastLogin||'';
}
function renderDrivers(){
 const q=norm($('driverSearchInput').value);
 const list=drivers.filter(d=>{
  const r=driverRole(d);
  const filter=driverFilter==='all'||(driverFilter==='admin'&&(r==='admin'||r==='super_admin'))||(driverFilter==='driver'&&r==='driver')||d.status===driverFilter;
  const search=!q||[d.firstName,d.lastName,d.employeeId,d.phone,d.email,d.licenseNumber,d.notes].some(v=>norm(v).includes(q));
  return filter&&search;
 }).sort((a,b)=>`${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
 $('driverTableBody').innerHTML=list.map(d=>{
  const r=driverRole(d),roleText=r==='super_admin'?'Super Admin':r==='admin'?'Admin':'Driver';
  const displayName=`${d.firstName||''} ${d.lastName||''}`.trim()||'Name missing';
  return `<tr><td><div class="driver-name">${esc(displayName)}</div><div class="driver-sub">${esc(d.notes||'No notes')}</div></td><td><div class="row-actions"><button data-edit-driver="${esc(d.id)}">Edit</button></div></td><td>${esc(d.employeeId||'ID missing')}</td><td><span class="role-badge ${r==='super_admin'?'role-super-admin':''}">${roleText}</span></td><td><span class="status-badge status-${esc(d.status)}">${esc(d.status)}</span></td><td>${esc(d.phone||'—')}</td><td>${d.email?`<a class="email-link" href="mailto:${esc(d.email)}">Email</a>`:'—'}</td><td><span class="expiry ${expiryClass(d.licenseExpiration)}">DL ${formatDate(d.licenseExpiration)}</span><span class="expiry ${expiryClass(d.medicalExpiration)}">Medical ${formatDate(d.medicalExpiration)}</span></td></tr>`;
 }).join('');
 $('driverEmptyState').classList.toggle('hidden',list.length>0);
 $('countAll').textContent=drivers.length;$('countActive').textContent=drivers.filter(d=>d.status==='active').length;$('countFrozen').textContent=drivers.filter(d=>d.status==='frozen').length;$('countSuspended').textContent=drivers.filter(d=>d.status==='suspended').length;
 renderDashboard();
}
function openDriver(id=''){
 $('driverForm').reset();$('driverFormError').classList.add('hidden');$('driverId').value=id;
 if(id){const d=drivers.find(x=>x.id===id);if(!d)return;['firstName','lastName','employeeId','role','status','phone','email','licenseNumber','licenseState','notes'].forEach(k=>$(k).value=d[k]||'');setDateValue('licenseExpiration',d.licenseExpiration);setDateValue('medicalExpiration',d.medicalExpiration);setAuthenticationFields(d);$('driverDialogTitle').textContent='Edit Driver';$('deleteDriverBtn').classList.remove('hidden');}
 else{$('role').value='driver';$('status').value='active';setDateValue('licenseExpiration','');setDateValue('medicalExpiration','');setAuthenticationFields();$('driverDialogTitle').textContent='Add Driver';$('deleteDriverBtn').classList.add('hidden')}
 $('driverDialog').showModal();
}
$('addDriverBtn').onclick=()=>openDriver();$('closeDriverDialogBtn').onclick=$('cancelDriverBtn').onclick=()=>$('driverDialog').close();
$('generateTemporaryPasswordBtn').onclick=()=>{const employeeId=$('employeeId').value.trim();$('temporaryPassword').value=generateTemporaryPassword(employeeId);$('mustChangePassword').checked=true;$('failedAttempts').value='0';$('lockedUntil').value='';toast('Temporary password generated. Save the driver to keep it.')};
$('resetAuthenticationBtn').onclick=()=>{$('failedAttempts').value='0';$('lockedUntil').value='';toast('Login attempts reset. Save the driver to keep the change.')};
$('driverTableBody').onclick=e=>{const b=e.target.closest('[data-edit-driver]');if(b)openDriver(b.dataset.editDriver)};
$('driverForm').onsubmit=e=>{e.preventDefault();const licenseExpiration=readDateValue('licenseExpiration'),medicalExpiration=readDateValue('medicalExpiration');if(licenseExpiration===null||medicalExpiration===null){$('driverFormError').textContent='Enter complete valid dates as MM/DD/YYYY.';$('driverFormError').classList.remove('hidden');return}const existing=drivers.find(x=>x.id===$('driverId').value);const d={id:$('driverId').value||uid(),firstName:$('firstName').value.trim(),lastName:$('lastName').value.trim(),employeeId:$('employeeId').value.trim(),role:$('role').value,status:$('status').value,phone:$('phone').value.trim(),email:$('email').value.trim(),licenseNumber:$('licenseNumber').value.trim(),licenseState:$('licenseState').value.trim().toUpperCase(),licenseExpiration,medicalExpiration,notes:$('notes').value.trim(),temporaryPassword:$('temporaryPassword').value,mustChangePassword:$('mustChangePassword').checked,failedAttempts:Number($('failedAttempts').value||0),lockedUntil:$('lockedUntil').value,lastLogin:$('lastLogin').value,passwordHistory:existing?.passwordHistory||[]};
 const err=!d.firstName||!d.lastName||!d.employeeId?'First name, last name, and employee ID are required.':drivers.some(x=>norm(x.employeeId)===norm(d.employeeId)&&x.id!==d.id)?'That employee ID is already assigned.':'';
 if(err){$('driverFormError').textContent=err;$('driverFormError').classList.remove('hidden');return}
 const i=drivers.findIndex(x=>x.id===d.id);if(i>=0)drivers[i]={...drivers[i],...d};else drivers.push(d);save();$('driverDialog').close();renderDrivers();toast(i>=0?'Driver updated successfully':'Driver added successfully');
};
$('deleteDriverBtn').onclick=()=>{const id=$('driverId').value;if(confirm('Delete this driver record?')){drivers=drivers.filter(d=>d.id!==id);save();$('driverDialog').close();renderDrivers()}};
$('driverSearchInput').oninput=renderDrivers;$('driverFilterTabs').onclick=e=>{const b=e.target.closest('[data-filter]');if(!b)return;driverFilter=b.dataset.filter;document.querySelectorAll('#driverFilterTabs .filter-tab').forEach(x=>x.classList.toggle('active',x===b));renderDrivers()};
$('exportDriversBtn').onclick=()=>downloadCsv(`FleetProtect365-Drivers-${new Date().toISOString().slice(0,10)}.csv`,['First Name','Last Name','Employee ID','Role','Status','Phone','Email','License Number','License State','License Expiration','Medical Expiration','Notes'],drivers.map(d=>[d.firstName,d.lastName,d.employeeId,driverRole(d),d.status,d.phone,d.email,d.licenseNumber,d.licenseState,d.licenseExpiration,d.medicalExpiration,d.notes]));

function renderTrucks(){
 const q=norm($('truckSearchInput').value);
 const list=trucks.filter(t=>(truckFilter==='all'||t.status===truckFilter)&&(!q||[t.number,t.year,t.make,t.model,t.vin,t.plate,t.notes].some(v=>norm(v).includes(q)))).sort((a,b)=>String(a.number).localeCompare(String(b.number),undefined,{numeric:true}));
 $('truckTableBody').innerHTML=list.map(t=>`<tr><td><div class="truck-name">${esc(t.number||'Truck missing')}</div><div class="truck-sub">${esc(t.notes||'No notes')}</div></td><td><div class="row-actions"><button data-edit-truck="${esc(t.id)}">Edit</button></div></td><td>${esc([t.year,t.make,t.model].filter(Boolean).join(' ')||'—')}</td><td>${esc(t.vin||'—')}</td><td>${esc(t.plate||'—')} ${esc(t.plateState||'')}</td><td><span class="status-badge status-${esc(t.status)}">${esc(t.status.replaceAll('_',' '))}</span></td><td>${t.odometer?Number(t.odometer).toLocaleString():'—'}</td><td><span class="expiry ${expiryClass(t.quarterlyInspection)}">Quarterly ${formatDate(t.quarterlyInspection)}</span><span class="expiry ${expiryClass(t.annualInspection)}">Annual ${formatDate(t.annualInspection)}</span><span class="expiry ${expiryClass(t.insurance)}">Insurance ${formatDate(t.insurance)}</span></td></tr>`).join('');
 $('truckEmptyState').classList.toggle('hidden',list.length>0);
 $('truckCountAll').textContent=trucks.length;$('truckCountActive').textContent=trucks.filter(t=>t.status==='active').length;$('truckCountMaintenance').textContent=trucks.filter(t=>t.status==='maintenance').length;$('truckCountOos').textContent=trucks.filter(t=>t.status==='out_of_service').length;
 renderDashboard();
}
function openTruck(id=''){
 $('truckForm').reset();$('truckFormError').classList.add('hidden');$('truckId').value=id;
 if(id){const t=trucks.find(x=>x.id===id);if(!t)return;const map={truckNumber:'number',truckStatus:'status',truckYear:'year',truckMake:'make',truckModel:'model',truckVin:'vin',truckPlate:'plate',truckPlateState:'plateState',truckOdometer:'odometer',truckNotes:'notes'};Object.entries(map).forEach(([a,b])=>$(a).value=t[b]||'');setDateValue('truckQuarterlyInspection',t.quarterlyInspection);setDateValue('truckAnnualInspection',t.annualInspection);setDateValue('truckInsurance',t.insurance);$('truckDialogTitle').textContent='Edit Truck';$('deleteTruckBtn').classList.remove('hidden')}
 else{$('truckStatus').value='active';setDateValue('truckQuarterlyInspection','');setDateValue('truckAnnualInspection','');setDateValue('truckInsurance','');$('truckDialogTitle').textContent='Add Truck';$('deleteTruckBtn').classList.add('hidden')}
 $('truckDialog').showModal();
}
$('addTruckBtn').onclick=()=>openTruck();$('closeTruckDialogBtn').onclick=$('cancelTruckBtn').onclick=()=>$('truckDialog').close();
$('truckTableBody').onclick=e=>{const b=e.target.closest('[data-edit-truck]');if(b)openTruck(b.dataset.editTruck)};
$('truckForm').onsubmit=e=>{e.preventDefault();const quarterlyInspection=readDateValue('truckQuarterlyInspection'),annualInspection=readDateValue('truckAnnualInspection'),insurance=readDateValue('truckInsurance');if([quarterlyInspection,annualInspection,insurance].includes(null)){$('truckFormError').textContent='Enter complete valid dates as MM/DD/YYYY.';$('truckFormError').classList.remove('hidden');return}const t={id:$('truckId').value||uid(),number:$('truckNumber').value.trim(),status:$('truckStatus').value,year:$('truckYear').value.trim(),make:$('truckMake').value.trim(),model:$('truckModel').value.trim(),vin:$('truckVin').value.trim().toUpperCase(),plate:$('truckPlate').value.trim().toUpperCase(),plateState:$('truckPlateState').value.trim().toUpperCase(),odometer:$('truckOdometer').value.trim(),quarterlyInspection,annualInspection,insurance,notes:$('truckNotes').value.trim()};
 const err=!t.number?'Truck number is required.':trucks.some(x=>norm(x.number)===norm(t.number)&&x.id!==t.id)?'That truck number already exists.':t.vin&&t.vin.length!==17?'VIN must contain 17 characters.':'';
 if(err){$('truckFormError').textContent=err;$('truckFormError').classList.remove('hidden');return}
 const i=trucks.findIndex(x=>x.id===t.id);if(i>=0)trucks[i]={...trucks[i],...t};else trucks.push(t);save();$('truckDialog').close();renderTrucks();toast(i>=0?'Truck updated successfully':'Truck added successfully');
};
$('deleteTruckBtn').onclick=()=>{const id=$('truckId').value;if(confirm('Delete this truck record?')){trucks=trucks.filter(t=>t.id!==id);save();$('truckDialog').close();renderTrucks()}};
$('truckSearchInput').oninput=renderTrucks;$('truckFilterTabs').onclick=e=>{const b=e.target.closest('[data-filter]');if(!b)return;truckFilter=b.dataset.filter;document.querySelectorAll('#truckFilterTabs .filter-tab').forEach(x=>x.classList.toggle('active',x===b));renderTrucks()};
$('exportTrucksBtn').onclick=()=>downloadCsv(`FleetProtect365-Trucks-${new Date().toISOString().slice(0,10)}.csv`,['Truck Number','Status','Year','Make','Model','VIN','Plate','Plate State','Odometer','Quarterly Inspection','Annual Inspection','Insurance','Notes'],trucks.map(t=>[t.number,t.status,t.year,t.make,t.model,t.vin,t.plate,t.plateState,t.odometer,t.quarterlyInspection,t.annualInspection,t.insurance,t.notes]));


function normalizeDispatch(x={}){
 return {
  ...x,
  id:x.id||uid(),
  date:firstValue(x,['date','dispatchDate','dispatch_date']),
  driverId:firstValue(x,['driverId','driver_id']),
  driverName:firstValue(x,['driverName','driver_name']),
  employeeId:String(firstValue(x,['employeeId','employee_id'])),
  truckNumber:String(firstValue(x,['truckNumber','truck_number','truck'])),
  trailerNumber:String(firstValue(x,['trailerNumber','trailer_number','trailer'])),
  scheduled:firstValue(x,['scheduled','scheduledTime','scheduled_time']),
  actual:firstValue(x,['actual','actualTime','actual_time']),
  minutes:Number(firstValue(x,['minutes','delayMinutes','delay_minutes'])||0),
  reason:firstValue(x,['reason','delayReason','delay_reason']),
  notes:x.notes||''
 };
}
function todayIso(){
 const d=new Date(),off=d.getTimezoneOffset();
 return new Date(d.getTime()-off*60000).toISOString().slice(0,10);
}
function timeToMinutes(value){
 if(!value||!/^\d{2}:\d{2}$/.test(value))return null;
 const [h,m]=value.split(':').map(Number);
 return h*60+m;
}
function calculateDelayMinutes(scheduled,actual){
 const s=timeToMinutes(scheduled),a=timeToMinutes(actual);
 if(s===null||a===null)return 0;
 let diff=a-s;
 if(diff<0)diff+=1440;
 return diff;
}
function formatTime(value){
 if(!value)return'—';
 const [h,m]=value.split(':').map(Number);
 const suffix=h>=12?'PM':'AM';
 return `${h%12||12}:${String(m).padStart(2,'0')} ${suffix}`;
}
function refreshDispatchOptions(){
 const driverSelect=$('dispatchDriver'),truckSelect=$('dispatchTruck');
 const currentDriver=driverSelect.value,currentTruck=truckSelect.value;
 driverSelect.innerHTML='<option value="">Select driver</option>'+drivers
  .filter(d=>d.status==='active')
  .sort((a,b)=>`${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
  .map(d=>`<option value="${esc(d.id)}">${esc(`${d.firstName} ${d.lastName}`.trim())}</option>`).join('');
 truckSelect.innerHTML='<option value="">Select truck</option>'+trucks
  .filter(t=>t.status==='active')
  .sort((a,b)=>String(a.number).localeCompare(String(b.number),undefined,{numeric:true}))
  .map(t=>`<option value="${esc(t.number)}">${esc(t.number)}</option>`).join('');
 if([...driverSelect.options].some(o=>o.value===currentDriver))driverSelect.value=currentDriver;
 if([...truckSelect.options].some(o=>o.value===currentTruck))truckSelect.value=currentTruck;
}
function updateDispatchDuration(){
 const minutes=calculateDelayMinutes($('dispatchScheduled').value,$('dispatchActual').value);
 $('dispatchDuration').value=`${minutes} minute${minutes===1?'':'s'}`;
 return minutes;
}
function renderDispatch(){
 const q=norm($('dispatchSearchInput')?.value);
 const list=dispatchDelays.filter(d=>!q||[d.date,d.driverName,d.employeeId,d.truckNumber,d.trailerNumber,d.reason,d.notes].some(v=>norm(v).includes(q)))
  .sort((a,b)=>`${b.date} ${b.actual}`.localeCompare(`${a.date} ${a.actual}`));
 $('dispatchTableBody').innerHTML=list.map(d=>`<tr>
  <td>${esc(formatDate(d.date))}</td>
  <td><div class="row-actions"><button data-edit-dispatch="${esc(d.id)}">Edit</button></div></td>
  <td><div class="driver-name">${esc(d.driverName||'—')}</div>${d.notes?`<div class="driver-sub">${esc(d.notes)}</div>`:''}</td>
  <td>${esc(d.employeeId||'—')}</td>
  <td>${esc(d.truckNumber||'—')}</td>
  <td>${esc(d.trailerNumber||'—')}</td>
  <td>${esc(formatTime(d.scheduled))}</td>
  <td>${esc(formatTime(d.actual))}</td>
  <td><span class="delay-badge">${esc(d.minutes)} min</span></td>
  <td>${esc(d.reason||'—')}</td>
 </tr>`).join('');
 $('dispatchEmptyState').classList.toggle('hidden',list.length>0);
 const today=todayIso(),total=dispatchDelays.reduce((sum,d)=>sum+Number(d.minutes||0),0);
 $('dispatchCountAll').textContent=dispatchDelays.length;
 $('dispatchCountToday').textContent=dispatchDelays.filter(d=>d.date===today).length;
 $('dispatchMinutesTotal').textContent=total.toLocaleString();
 $('dispatchMinutesAverage').textContent=dispatchDelays.length?`${Math.round(total/dispatchDelays.length)} min`:'0 min';
}
function openDispatch(id=''){
 $('dispatchForm').reset();
 $('dispatchFormError').classList.add('hidden');
 $('dispatchId').value=id;
 refreshDispatchOptions();
 if(id){
  const d=dispatchDelays.find(x=>x.id===id);if(!d)return;
  $('dispatchDate').value=d.date||todayIso();
  $('dispatchDriver').value=d.driverId||'';
  if(!$('dispatchDriver').value&&d.driverName){
   const found=drivers.find(x=>`${x.firstName} ${x.lastName}`.trim()===d.driverName);
   if(found)$('dispatchDriver').value=found.id;
  }
  $('dispatchEmployeeId').value=d.employeeId||'';
  $('dispatchTruck').value=d.truckNumber||'';
  $('dispatchTrailer').value=d.trailerNumber||'';
  $('dispatchScheduled').value=d.scheduled||'';
  $('dispatchActual').value=d.actual||'';
  $('dispatchReason').value=d.reason||'';
  $('dispatchNotes').value=d.notes||'';
  $('dispatchDialogTitle').textContent='Edit Dispatch Delay';
  $('deleteDispatchBtn').classList.remove('hidden');
 }else{
  $('dispatchDate').value=todayIso();
  $('dispatchDialogTitle').textContent='Add Dispatch Delay';
  $('deleteDispatchBtn').classList.add('hidden');
 }
 updateDispatchDuration();
 $('dispatchDialog').showModal();
}
$('addDispatchBtn').onclick=()=>openDispatch();
$('closeDispatchDialogBtn').onclick=$('cancelDispatchBtn').onclick=()=>$('dispatchDialog').close();
$('dispatchDriver').onchange=()=>{
 const d=drivers.find(x=>x.id===$('dispatchDriver').value);
 $('dispatchEmployeeId').value=d?.employeeId||'';
};
$('dispatchScheduled').oninput=$('dispatchActual').oninput=updateDispatchDuration;
$('dispatchTableBody').onclick=e=>{const b=e.target.closest('[data-edit-dispatch]');if(b)openDispatch(b.dataset.editDispatch)};
$('dispatchForm').onsubmit=e=>{
 e.preventDefault();
 const driver=drivers.find(x=>x.id===$('dispatchDriver').value);
 const item={
  id:$('dispatchId').value||uid(),
  date:$('dispatchDate').value,
  driverId:driver?.id||'',
  driverName:driver?`${driver.firstName} ${driver.lastName}`.trim():'',
  employeeId:driver?.employeeId||$('dispatchEmployeeId').value,
  truckNumber:$('dispatchTruck').value,
  trailerNumber:$('dispatchTrailer').value.trim()||'NA',
  scheduled:$('dispatchScheduled').value,
  actual:$('dispatchActual').value,
  minutes:updateDispatchDuration(),
  reason:$('dispatchReason').value,
  notes:$('dispatchNotes').value.trim()
 };
 const error=!item.date||!item.driverId||!item.truckNumber||!item.scheduled||!item.actual||!item.reason
  ?'Dispatch date, driver, truck, scheduled time, actual time, and reason are required.'
  :'';
 if(error){$('dispatchFormError').textContent=error;$('dispatchFormError').classList.remove('hidden');return}
 const i=dispatchDelays.findIndex(x=>x.id===item.id);
 if(i>=0)dispatchDelays[i]={...dispatchDelays[i],...item};else dispatchDelays.push(item);
 save();$('dispatchDialog').close();renderDispatch();toast(i>=0?'Dispatch delay updated successfully':'Dispatch delay added successfully');
};
$('deleteDispatchBtn').onclick=()=>{
 const id=$('dispatchId').value;
 if(confirm('Delete this dispatch delay?')){
  dispatchDelays=dispatchDelays.filter(d=>d.id!==id);save();$('dispatchDialog').close();renderDispatch();
 }
};
$('dispatchSearchInput').oninput=renderDispatch;
$('exportDispatchBtn').onclick=()=>downloadCsv(
 `FleetProtect365-Dispatch-Delays-${todayIso()}.csv`,
 ['Dispatch Date','Driver','Employee ID','Truck Number','Trailer Number','Scheduled Dispatch','Actual Dispatch','Delay Minutes','Delay Reason','Notes'],
 dispatchDelays.map(d=>[d.date,d.driverName,d.employeeId,d.truckNumber,d.trailerNumber,d.scheduled,d.actual,d.minutes,d.reason,d.notes])
);

setupDateEntries();drivers=load(DRIVER_KEY).map(normalizeDriver);trucks=load(TRUCK_KEY).map(normalizeTruck);dispatchDelays=load(DISPATCH_KEY).map(normalizeDispatch);save();renderDrivers();renderTrucks();refreshDispatchOptions();renderDispatch();showPage('drivers');
})();
