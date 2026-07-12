(() => {
const cfg=window.FP365_CONFIG||{};
const configured=cfg.supabaseUrl&&!cfg.supabaseUrl.includes("PASTE_")&&cfg.supabasePublishableKey&&!cfg.supabasePublishableKey.includes("PASTE_");
const screens=[...document.querySelectorAll(".screen")];
const backButton=document.getElementById("backButton"),homeButton=document.getElementById("homeButton");
let sb=null,profile=null,gpsStart=null,gpsSubmit=null,entries=[],currentInspectionId=null,currentEntry=null,currentPhotos=[],history=["loginScreen"];

const PHOTO_MAP={
  "53_trailer":["Fifth wheel plate connected","Landing gear raised","Air, brake, and electrical lines connected"],
  "single_pup":["Fifth wheel plate connected","Landing gear raised","Air, brake, and electrical lines connected"],
  "doubles":["Fifth wheel plate connected to Trailer 1","Trailer 1 landing gear raised","Pintle hook connected and closed","Safety chains connected","Air, brake, and electrical lines connected","Fifth wheel plate connected to Trailer 2","Trailer 2 landing gear raised"],
  "bobtail":["Front of truck","Driver side","Passenger side","Rear of truck"]
};

function show(id,push=true){
  screens.forEach(s=>s.classList.toggle("hidden",s.id!==id));
  const logged=!["loginScreen","setupScreen"].includes(id);
  homeButton.classList.toggle("hidden",!logged||id==="homeScreen");
  backButton.classList.toggle("hidden",!logged||id==="homeScreen");
  if(push&&history[history.length-1]!==id)history.push(id);
  window.scrollTo(0,0);
}
function goHome(){history=["homeScreen"];show("homeScreen",false)}
function goBack(){if(history.length<=1)return goHome();history.pop();show(history[history.length-1],false)}
function msg(id,text,error=false){const e=document.getElementById(id);e.textContent=text;e.className="message "+(error?"error":"success")}
function safe(v){return v===null||v===undefined||v===""?"N/A":v}
function readableType(v){return {"53_trailer":"53' Trailer","single_pup":"Single Pup","doubles":"Doubles","bobtail":"Bobtail"}[v]||v}
function nowIso(){return new Date().toISOString()}
function uuid(){return crypto.randomUUID?crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==="x"?r:(r&3|8);return v.toString(16)})}

if(!configured){show("setupScreen",false);return}
sb=supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

async function captureGps(kind){
  const status=document.getElementById("autoGpsStatus");
  status.textContent=`Capturing ${kind} GPS automatically…`;
  return new Promise(resolve=>{
    if(!navigator.geolocation){status.textContent="GPS unavailable: not supported.";return resolve(null)}
    navigator.geolocation.getCurrentPosition(p=>{
      const g={lat:+p.coords.latitude.toFixed(6),lng:+p.coords.longitude.toFixed(6),accuracy:Math.round(p.coords.accuracy),time:nowIso()};
      status.textContent=`GPS captured automatically · accuracy ${g.accuracy} m`;
      resolve(g);
    },e=>{status.textContent=`GPS unavailable: ${e.message}`;resolve(null)},{enableHighAccuracy:true,timeout:12000,maximumAge:0});
  });
}

async function loadProfile(uid){
  const{data,error}=await sb.from("employee_profiles").select("*").eq("id",uid).single();
  if(error)throw error;profile=data;
  document.getElementById("sessionLabel").textContent=`${data.full_name} · ${data.role}`;
  document.getElementById("welcome").textContent=`Welcome, ${data.full_name}`;
  document.getElementById("profileSummary").innerHTML=`<b>${data.full_name}</b><br>Employee ID: ${data.employee_id}<br>Role: ${data.role}<br>Status: ${data.status}`;
}
async function loadTrucks(){
  const{data,error}=await sb.from("trucks").select("id,truck_number,status").eq("company_id",profile.company_id).eq("status","active").is("deleted_at",null).order("truck_number");
  if(error)throw error;
  document.getElementById("truck").innerHTML='<option value="">Select truck</option>'+data.map(t=>`<option value="${t.id}" data-number="${t.truck_number}">${t.truck_number}</option>`).join("");
}
async function refreshDraftCard(){
  const{data,error}=await sb.from("inspections").select("*").eq("driver_id",profile.id).eq("status","draft").order("updated_at",{ascending:false}).limit(1);
  const btn=document.getElementById("continueDraftButton");
  if(error||!data?.length){btn.classList.add("hidden");return}
  const d=data[0];btn.dataset.id=d.id;
  document.getElementById("continueDraftText").textContent=`${readableType(d.equipment_type)} · Truck ${d.truck_number} · ${d.inspection_number}`;
  btn.classList.remove("hidden");
}
async function boot(){
  const{data}=await sb.auth.getSession();
  if(!data.session)return show("loginScreen",false);
  try{await loadProfile(data.session.user.id);await loadTrucks();await refreshDraftCard();show("homeScreen",false)}
  catch(e){await sb.auth.signOut();msg("loginMessage",e.message,true);show("loginScreen",false)}
}

function resetForm(){
  currentInspectionId=null;currentEntry=null;gpsStart=null;gpsSubmit=null;currentPhotos=[];
  ["equipmentType","truck","trailer1","dolly","trailer2","locationFrom","locationTo","notes"].forEach(id=>document.getElementById(id).value="");
  document.getElementById("inspectionHeading").textContent="New Inspection";
  document.getElementById("inspectionMessage").textContent="";
  document.getElementById("photoRequirements").innerHTML="";
}
async function startNewInspection(){
  resetForm();show("inspectionScreen");gpsStart=await captureGps("start");
}
function requiredPhotoLabels(){return PHOTO_MAP[document.getElementById("equipmentType").value]||[]}
function renderPhotoRequirements(){
  const labels=requiredPhotoLabels(),box=document.getElementById("photoRequirements");
  box.innerHTML=labels.map((label,index)=>{
    const photo=currentPhotos.find(p=>p.label===label);
    return `<div class="photo-card ${photo?"complete":""}" data-label="${encodeURIComponent(label)}">
      <h3>${photo?'<span class="status-pill ok">Completed</span>':'<span class="status-pill">Required</span>'} ${label}</h3>
      <div class="photo-actions">
        <button class="secondary take-photo" data-index="${index}">Take Photo</button>
        <button class="secondary upload-photo" data-index="${index}">Upload Photo</button>
      </div>
      <input class="camera-input hidden" data-index="${index}" type="file" accept="image/*" capture="environment">
      <input class="library-input hidden" data-index="${index}" type="file" accept="image/*">
      ${photo?`<img class="photo-preview" src="${photo.preview}"><div class="photo-meta">${photo.name}</div><button class="secondary remove-photo" data-index="${index}">Remove / Replace</button>`:""}
    </div>`;
  }).join("");
  box.querySelectorAll(".take-photo").forEach(b=>b.onclick=()=>box.querySelector(`.camera-input[data-index="${b.dataset.index}"]`).click());
  box.querySelectorAll(".upload-photo").forEach(b=>b.onclick=()=>box.querySelector(`.library-input[data-index="${b.dataset.index}"]`).click());
  box.querySelectorAll(".camera-input,.library-input").forEach(inp=>inp.onchange=()=>handlePhotoFile(labels[+inp.dataset.index],inp.files?.[0]));
  box.querySelectorAll(".remove-photo").forEach(b=>{b.onclick=()=>{currentPhotos=currentPhotos.filter(p=>p.label!==labels[+b.dataset.index]);renderPhotoRequirements()}});
}
function handlePhotoFile(label,file){
  if(!file)return;
  const existing=currentPhotos.find(p=>p.label===label);
  if(existing?.preview)URL.revokeObjectURL(existing.preview);
  currentPhotos=currentPhotos.filter(p=>p.label!==label);
  currentPhotos.push({label,file,name:file.name,preview:URL.createObjectURL(file),storage_path:null,id:null});
  renderPhotoRequirements();
}
async function loadInspectionPhotos(inspectionId){
  const{data,error}=await sb.from("inspection_photos").select("*").eq("inspection_id",inspectionId).is("deleted_at",null).order("captured_at");
  if(error){currentPhotos=[];return}
  currentPhotos=[];
  for(const row of data||[]){
    const signed=await sb.storage.from("inspection-photos").createSignedUrl(row.storage_path,3600);
    currentPhotos.push({id:row.id,label:row.photo_label||"Photo",name:row.original_file_name||"Photo",preview:signed.data?.signedUrl||"",storage_path:row.storage_path,file:null});
  }
}
async function populateInspection(i){
  currentInspectionId=i.id;currentEntry=i;
  document.getElementById("inspectionHeading").textContent=`Edit ${i.inspection_number}`;
  document.getElementById("equipmentType").value=i.equipment_type;
  document.getElementById("truck").value=i.truck_id||"";
  document.getElementById("trailer1").value=i.trailer_1_number||"";
  document.getElementById("dolly").value=i.dolly_number||"";
  document.getElementById("trailer2").value=i.trailer_2_number||"";
  document.getElementById("locationFrom").value=i.location_from||"";
  document.getElementById("locationTo").value=i.location_to||"";
  document.getElementById("notes").value=i.notes||"";
  gpsStart=i.start_latitude&&i.start_longitude?{lat:+i.start_latitude,lng:+i.start_longitude,accuracy:null,time:i.started_at}:null;
  document.getElementById("autoGpsStatus").textContent=gpsStart?`Start GPS already captured: ${gpsStart.lat}, ${gpsStart.lng}`:"Start GPS unavailable.";
  await loadInspectionPhotos(i.id);renderPhotoRequirements();show("inspectionScreen");
}
function getForm(){
  const ids=["equipmentType","truck","trailer1","dolly","trailer2","locationFrom","locationTo","notes"];
  const v=Object.fromEntries(ids.map(id=>[id,document.getElementById(id).value.trim()]));
  if(ids.some(id=>!v[id]))throw new Error("Complete every field. Use N/A where appropriate.");
  const sel=document.getElementById("truck");
  return {v,truckNumber:sel.options[sel.selectedIndex].dataset.number};
}
async function ensureInspectionDraft(){
  const{v,truckNumber}=getForm();
  const payload={company_id:profile.company_id,driver_id:profile.id,truck_id:v.truck,equipment_type:v.equipmentType,status:"draft",truck_number:truckNumber,trailer_1_number:v.trailer1,dolly_number:v.dolly,trailer_2_number:v.trailer2,location_from:v.locationFrom,location_to:v.locationTo,notes:v.notes,start_latitude:gpsStart?.lat??null,start_longitude:gpsStart?.lng??null,gps_start_status:gpsStart?"captured":"unavailable",updated_by:profile.id,updated_at:nowIso()};
  const result=currentInspectionId
    ? await sb.from("inspections").update(payload).eq("id",currentInspectionId).eq("driver_id",profile.id).select("*").single()
    : await sb.from("inspections").insert({...payload,created_by:profile.id}).select("*").single();
  if(result.error)throw result.error;
  currentInspectionId=result.data.id;currentEntry=result.data;return result.data;
}
async function uploadPendingPhotos(){
  for(const p of currentPhotos.filter(x=>x.file)){
    const ext=(p.file.name.split(".").pop()||"jpg").toLowerCase();
    const path=`${profile.company_id}/${currentInspectionId}/${uuid()}.${ext}`;
    const up=await sb.storage.from("inspection-photos").upload(path,p.file,{contentType:p.file.type||"image/jpeg",upsert:false});
    if(up.error)throw up.error;
    const meta=await sb.from("inspection_photos").insert({
      company_id:profile.company_id,inspection_id:currentInspectionId,driver_id:profile.id,
      storage_path:path,original_file_name:p.file.name,mime_type:p.file.type||"image/jpeg",
      file_size_bytes:p.file.size,photo_label:p.label,captured_at:nowIso(),created_by:profile.id
    }).select("*").single();
    if(meta.error)throw meta.error;
    p.id=meta.data.id;p.storage_path=path;p.file=null;
  }
}
async function saveDraft(){
  try{
    msg("inspectionMessage","Saving draft…");
    const row=await ensureInspectionDraft();
    await uploadPendingPhotos();
    msg("inspectionMessage",`Draft saved: ${row.inspection_number}`);
    await refreshDraftCard();setTimeout(goHome,700);
  }catch(e){msg("inspectionMessage",e.message,true)}
}
async function submitInspection(){
  try{
    const labels=requiredPhotoLabels();
    const missing=labels.filter(label=>!currentPhotos.some(p=>p.label===label));
    if(missing.length)throw new Error(`Missing required photos: ${missing.join(", ")}`);
    msg("inspectionMessage","Preparing submission…");
    await ensureInspectionDraft();await uploadPendingPhotos();
    gpsSubmit=await captureGps("submit");
    const update=await sb.from("inspections").update({
      status:"verified",submit_latitude:gpsSubmit?.lat??null,submit_longitude:gpsSubmit?.lng??null,
      gps_submit_status:gpsSubmit?"captured":"unavailable",submitted_at:nowIso(),driver_certified:true,
      updated_by:profile.id,updated_at:nowIso()
    }).eq("id",currentInspectionId).eq("driver_id",profile.id).select("*").single();
    if(update.error)throw update.error;
    currentEntry=update.data;
    document.getElementById("submitResultCard").innerHTML=`<b>${update.data.inspection_number}</b><br>${readableType(update.data.equipment_type)}<br>Truck ${update.data.truck_number}<br>${update.data.location_from} → ${update.data.location_to}`;
    await refreshDraftCard();show("submitResultScreen");
  }catch(e){msg("inspectionMessage",e.message,true)}
}
async function loadEntries(){
  const{data,error}=await sb.from("inspections").select("*").eq("driver_id",profile.id).order("started_at",{ascending:false});
  if(error)throw error;entries=data||[];
  const box=document.getElementById("entriesList");
  if(!entries.length){box.innerHTML='<div class="notice">No entries yet.</div>';return}
  box.innerHTML=entries.map((i,idx)=>`<div class="entry" data-index="${idx}"><div class="entry-number">${safe(i.inspection_number)}</div><div>${readableType(i.equipment_type)} · ${i.status}</div><div>Truck ${safe(i.truck_number)}</div><div>${safe(i.location_from)} → ${safe(i.location_to)}</div><div class="muted">${new Date(i.started_at).toLocaleString()}</div></div>`).join("");
  box.querySelectorAll(".entry").forEach(el=>el.onclick=()=>openEntry(entries[+el.dataset.index]));
}
async function openEntry(i){
  currentEntry=i;currentInspectionId=i.id;
  document.getElementById("entryDetails").innerHTML=`<div class="detail-grid"><b>Entry Number</b><span>${safe(i.inspection_number)}</span><b>Status</b><span>${safe(i.status)}</span><b>Equipment</b><span>${readableType(i.equipment_type)}</span><b>Truck</b><span>${safe(i.truck_number)}</span><b>Trailer 1</b><span>${safe(i.trailer_1_number)}</span><b>Dolly</b><span>${safe(i.dolly_number)}</span><b>Trailer 2</b><span>${safe(i.trailer_2_number)}</span><b>From</b><span>${safe(i.location_from)}</span><b>To</b><span>${safe(i.location_to)}</span><b>Started</b><span>${new Date(i.started_at).toLocaleString()}</span><b>Submitted</b><span>${i.submitted_at?new Date(i.submitted_at).toLocaleString():"Not submitted"}</span><b>Notes</b><span>${safe(i.notes)}</span></div>`;
  await loadInspectionPhotos(i.id);
  document.getElementById("entryPhotoList").innerHTML=currentPhotos.length?currentPhotos.map(p=>`<div class="photo-card complete"><h3>${p.label}</h3>${p.preview?`<img class="photo-preview" src="${p.preview}">`:""}</div>`).join(""):'<div class="notice">No photos attached.</div>';
  document.getElementById("editDraftButton").classList.toggle("hidden",i.status!=="draft");
  document.getElementById("editSubmittedButton").classList.toggle("hidden",i.status==="draft");
  show("entryDetailScreen");
}
function renderProfile(){
  document.getElementById("profileDetails").innerHTML=`<div class="detail-grid"><b>Full Name</b><span>${safe(profile.full_name)}</span><b>Phone</b><span>${safe(profile.phone)}</span><b>Employee ID</b><span>${safe(profile.employee_id)}</span><b>Email</b><span>${safe(profile.email)}</span><b>Title</b><span>${safe(profile.title||profile.role)}</span><b>DL Number</b><span>${safe(profile.drivers_license_number)}</span><b>State</b><span>${safe(profile.drivers_license_state)}</span><b>DL Expiration</b><span>${safe(profile.drivers_license_expires)}</span><b>Medical Card</b><span>${safe(profile.medical_card_expires)}</span></div>`;
}
function fillProfile(){
  document.getElementById("pFullName").value=profile.full_name||"";
  document.getElementById("pPhone").value=profile.phone||"";
  document.getElementById("pEmail").value=profile.email||"";
  document.getElementById("pTitle").value=profile.title||profile.role||"";
  document.getElementById("pDlNumber").value=profile.drivers_license_number||"";
  document.getElementById("pDlState").value=profile.drivers_license_state||"";
  document.getElementById("pDlExpires").value=profile.drivers_license_expires||"";
  document.getElementById("pMedicalExpires").value=profile.medical_card_expires||"";
}
async function saveProfile(){
  msg("profileMessage","Saving…");
  const{data,error}=await sb.rpc("update_my_profile",{p_full_name:document.getElementById("pFullName").value,p_phone:document.getElementById("pPhone").value,p_email:document.getElementById("pEmail").value,p_title:document.getElementById("pTitle").value,p_dl_number:document.getElementById("pDlNumber").value,p_dl_state:document.getElementById("pDlState").value,p_dl_expires:document.getElementById("pDlExpires").value||null,p_medical_expires:document.getElementById("pMedicalExpires").value||null});
  if(error)return msg("profileMessage",error.message,true);
  profile=Array.isArray(data)?data[0]:data;renderProfile();show("profileScreen");
}

document.getElementById("loginButton").onclick=async()=>{msg("loginMessage","Signing in…");const{data,error}=await sb.auth.signInWithPassword({email:document.getElementById("email").value.trim(),password:document.getElementById("password").value});if(error)return msg("loginMessage",error.message,true);try{await loadProfile(data.user.id);await loadTrucks();await refreshDraftCard();show("homeScreen")}catch(e){await sb.auth.signOut();msg("loginMessage",e.message,true)}};
document.getElementById("forgotButton").onclick=async()=>{const email=document.getElementById("email").value.trim();if(!email)return msg("loginMessage","Enter your email first.",true);const{error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.href.split("?")[0]});msg("loginMessage",error?error.message:"Password reset email requested.",!!error)};
document.querySelector('[data-action="newInspection"]').onclick=startNewInspection;
document.querySelector('[data-action="viewEntries"]').onclick=async()=>{await loadEntries();show("entriesScreen")};
document.querySelector('[data-action="profile"]').onclick=()=>{renderProfile();show("profileScreen")};
document.querySelector('[data-action="logout"]').onclick=async()=>{await sb.auth.signOut();profile=null;history=["loginScreen"];show("loginScreen",false)};
document.getElementById("equipmentType").onchange=renderPhotoRequirements;
document.getElementById("continueDraftButton").onclick=async()=>{const id=document.getElementById("continueDraftButton").dataset.id;const{data,error}=await sb.from("inspections").select("*").eq("id",id).single();if(error)return alert(error.message);await populateInspection(data)};
document.getElementById("saveDraftButton").onclick=saveDraft;
document.getElementById("submitInspectionButton").onclick=submitInspection;
document.getElementById("editDraftButton").onclick=()=>populateInspection(currentEntry);
document.getElementById("editSubmittedButton").onclick=()=>{if(confirm("Make changes to this submitted inspection?"))populateInspection(currentEntry)};
document.getElementById("doneEntryButton").onclick=goHome;
document.getElementById("reviewSubmittedButton").onclick=()=>openEntry(currentEntry);
document.getElementById("returnHomeAfterSubmitButton").onclick=goHome;
document.getElementById("editProfileButton").onclick=()=>{fillProfile();show("profileEditScreen")};
document.getElementById("saveProfileButton").onclick=saveProfile;
document.getElementById("cancelProfileButton").onclick=()=>{renderProfile();show("profileScreen")};
homeButton.onclick=goHome;backButton.onclick=goBack;

if("serviceWorker"in navigator)navigator.serviceWorker.register("./service-worker.js").catch(console.error);
boot();
})();