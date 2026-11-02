(() => {
 'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.FP365_CREATE_NOTE_PHOTOS=({client:s,onChange,onMessage})=>{
  const $=id=>document.getElementById(id),bucket=s.storage.from('admin-note-photos'),cache=new Map();
  let draft=[],removed=[],noteId,operationId,expectedUpdatedAt=null,processing=false,busy=false,generation=0;
  const section=document.createElement('section');section.className='note-photo-editor';
  section.innerHTML='<div class="note-photo-editor-head"><strong>Photos</strong><button type="button" id="addNotePhotos">Add Photos</button><input id="notePhotoFiles" class="hidden" type="file" accept="image/*" multiple aria-label="Choose photos for this note"></div><p class="note-photo-help">Add up to 10 photos. Thumbnails will appear inside the saved note. Click a photo to expand it.</p><div id="notePhotoDraft" class="note-photo-gallery"></div><p id="notePhotoStatus" role="status" aria-live="polite"></p>';
  $('noteBody').closest('label').after(section);
  const viewer=document.createElement('dialog');viewer.id='notePhotoViewer';viewer.className='note-photo-viewer';viewer.setAttribute('aria-label','Expanded note photo');
  viewer.innerHTML='<div class="note-photo-viewer-frame"><button type="button" class="note-photo-close" aria-label="Close expanded photo">×</button><img alt=""></div>';
  document.body.append(viewer);viewer.querySelector('button').onclick=()=>viewer.close();
  viewer.onclick=event=>{if(event.target===viewer)viewer.close();};viewer.addEventListener('close',()=>{viewer.querySelector('img').removeAttribute('src');});
  function preview(photo){return photo.preview||cache.get(photo.storage_path)?.url||'';}
  function gallery(photos){return photos.length?`<div class="note-photo-gallery">${photos.map(photo=>`<button type="button" class="note-photo-thumb" data-note-photo="${esc(photo.id)}" aria-label="Expand photo: ${esc(photo.file_name)}">${preview(photo)?`<img src="${esc(preview(photo))}" alt="${esc(photo.file_name)}" loading="lazy">`:'<span>Open photo</span>'}</button>`).join('')}</div>`:'';}
  function renderDraft(){
   $('notePhotoDraft').innerHTML=draft.map(photo=>`<div class="note-photo-draft-item"><button type="button" class="note-photo-thumb" data-draft-photo="${photo.id}" aria-label="Expand photo: ${esc(photo.file_name)}">${preview(photo)?`<img src="${esc(preview(photo))}" alt="${esc(photo.file_name)}">`:'<span>Open photo</span>'}</button><button type="button" class="note-photo-remove" data-remove-note-photo="${photo.id}" aria-label="Remove photo: ${esc(photo.file_name)}" ${busy||processing?'disabled':''}>×</button></div>`).join('');
   $('addNotePhotos').disabled=busy||processing||draft.length>=10;$('notePhotoFiles').disabled=busy||processing;
   $('notePhotoStatus').textContent=processing?'Preparing photos…':`${draft.length} / 10 photos${draft.length?' · saved with your note':''}`;
  }
  function cleanup(paths){if(paths.length)bucket.remove(paths).catch(()=>{});}
  function reset(){generation++;cleanup(draft.filter(p=>p.uploaded).map(p=>p.storage_path));draft.forEach(p=>{if(p.preview)URL.revokeObjectURL(p.preview);});draft=[];removed=[];processing=false;renderDraft();}
  function begin(row,updateMode){reset();noteId=row?.id||crypto.randomUUID();operationId=crypto.randomUUID();expectedUpdatedAt=row?.updated_at||null;draft=updateMode?[]:(row?.photos||[]).filter(p=>!p.update_id).map(p=>({...p}));renderDraft();}
  async function compress(file){
   if(file.size>30*1024*1024)throw Error(`${file.name}: choose a photo smaller than 30 MB.`);
   if(file.type&&!file.type.startsWith('image/'))throw Error(`${file.name} is not a photo.`);
   const url=URL.createObjectURL(file);
   try{
    const img=new Image();img.src=url;await img.decode();
    if(!img.naturalWidth||!img.naturalHeight)throw Error('empty image');
    const scale=Math.min(1,2000/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));
    if(!blob||blob.size>10*1024*1024)throw Error('image too large');
    return blob;
   }catch(error){if(error.message.includes('30 MB')||error.message.includes('not a photo'))throw error;throw Error(`${file.name} could not be opened. Try a JPEG, PNG, or another supported photo.`);}
   finally{URL.revokeObjectURL(url);}
  }
  async function add(files){
   if(busy||processing||!files.length)return;
   if(files.length+draft.length>10){onMessage('Each note or update can have up to 10 photos.');return;}
   const token=generation;processing=true;renderDraft();onChange();
   try{
    for(const file of files){const blob=await compress(file);if(token!==generation)return;draft.push({id:crypto.randomUUID(),file_name:(file.name||'Photo').slice(0,250),byte_size:blob.size,blob,preview:URL.createObjectURL(blob)});renderDraft();}
    onMessage('Photos added. Select Save to save them with the note.');
   }catch(error){onMessage(error.message);}
   finally{if(token===generation){processing=false;renderDraft();onChange();}}
  }
  async function hydrate(rows){
   const paths=rows.flatMap(row=>row.photos||[]).map(p=>p.storage_path).filter(path=>!cache.has(path)||cache.get(path).expires<Date.now());
   for(let at=0;at<paths.length;at+=100){const slice=paths.slice(at,at+100),{data,error}=await bucket.createSignedUrls(slice,3600);if(error)continue;for(const item of data||[])if(item.signedUrl)cache.set(item.path,{url:item.signedUrl,expires:Date.now()+50*60000});}
  }
  async function expand(photo){
   if(!photo)return;
   let url=photo.preview;
   if(!url){let signed=cache.get(photo.storage_path);if(!signed||signed.expires<Date.now()){const {data,error}=await bucket.createSignedUrl(photo.storage_path,3600);if(error){onMessage(`Unable to open photo: ${error.message}`);return;}signed={url:data.signedUrl,expires:Date.now()+50*60000};cache.set(photo.storage_path,signed);}url=signed.url;}
   viewer.querySelector('img').src=url;viewer.querySelector('img').alt=photo.file_name;viewer.showModal();
  }
  $('addNotePhotos').onclick=()=>$('notePhotoFiles').click();
  $('notePhotoFiles').onchange=()=>{const files=[...$('notePhotoFiles').files];$('notePhotoFiles').value='';add(files);};
  $('notePhotoDraft').onclick=event=>{const remove=event.target.closest('[data-remove-note-photo]'),open=event.target.closest('[data-draft-photo]');if(remove&&!busy&&!processing){const photo=draft.find(p=>p.id===remove.dataset.removeNotePhoto);if(!photo)return;if(photo.blob){if(photo.uploaded)cleanup([photo.storage_path]);URL.revokeObjectURL(photo.preview);}else removed.push(photo.id);draft=draft.filter(p=>p.id!==photo.id);renderDraft();}else if(open)expand(draft.find(p=>p.id===open.dataset.draftPhoto));};
  async function upload(companyId){
   for(const photo of draft.filter(p=>p.blob&&!p.uploaded)){
    photo.storage_path=`${companyId}/${noteId}/${photo.id}.jpg`;
    const {error}=await bucket.upload(photo.storage_path,photo.blob,{contentType:'image/jpeg',upsert:false});if(error)throw Error(`Unable to upload ${photo.file_name}: ${error.message}. Your note is still open; retry Save.`);photo.uploaded=true;
   }
   return {operation_id:operationId,target_note_id:noteId,expected_updated_at:expectedUpdatedAt,new_photos:draft.filter(p=>p.blob).map(({id,file_name,byte_size})=>({id,file_name,byte_size})),removed_photo_ids:removed};
  }
  function committed(){draft.forEach(p=>{if(p.preview)URL.revokeObjectURL(p.preview);});draft=[];removed=[];generation++;renderDraft();}
  return {gallery,begin,reset,hydrate,expand,upload,committed,cleanup,get processing(){return processing;},setBusy(value){busy=value;renderDraft();},clear(){reset();cache.clear();if(viewer.open)viewer.close();}};
 };
})();
