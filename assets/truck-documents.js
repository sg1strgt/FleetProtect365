(() => {
  'use strict';
  const client = window.FP365_ADMIN_CLIENT || window.FP365_DRIVER_CLIENT;
  if (!client) return;
  const isAdmin = Boolean(window.FP365_ADMIN_CLIENT);
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  let dialog, content, selectedTruck, documents=[], nextPage=null, generation=0, busy=false;
  async function call(body) {
    const {data,error} = await client.functions.invoke('truck-documents',{body});
    if(error) {
      let message='Truck documents could not be loaded. Check your connection and try again.';
      try { const detail=await error.context?.json(); if(detail?.error) message=detail.error; } catch {}
      throw new Error(message);
    }
    if(data?.error) throw new Error(data.error);
    return data;
  }
  function message(text) { $('truckDocumentsStatus').textContent=text; }
  function ensure() {
    if(dialog) return;
    dialog=document.createElement('dialog'); dialog.id='truckDocumentsDialog'; dialog.className='truck-documents-dialog';
    dialog.innerHTML='<div class="truck-documents-heading"><h2 id="truckDocumentsHeading">Truck Documents</h2><button type="button" id="truckDocumentsClose">Close</button></div><p id="truckDocumentsStatus" role="status"></p><div id="truckDocumentsContent"></div>';
    document.body.appendChild(dialog); content=$('truckDocumentsContent');
    $('truckDocumentsClose').onclick=()=>{if(!busy){generation++;dialog.close();}};
    dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();else generation++;});
  }
  function lock(value) { busy=value; dialog.querySelectorAll('button,input').forEach(e=>e.disabled=value); }
  async function showList(more=false) {
    const ticket=++generation;
    message('Loading documents…');
    if(!more) { documents=[]; nextPage=null; content.innerHTML=''; }
    try {
      const result=await call({action:'list',truckId:selectedTruck.id,pageToken:more?nextPage:null});
      if(ticket!==generation || !dialog.open) return;
      documents.push(...result.documents); nextPage=result.nextPageToken;
      renderList(); message('');
    } catch(e) { if(ticket===generation) { renderList(); message(e.message); } }
  }
  function renderList() {
    $('truckDocumentsHeading').textContent=`Truck ${selectedTruck.number} — Documents`;
    content.innerHTML=`<div class="truck-documents-actions">${isAdmin?'<button type="button" class="primary" data-doc-add>Add Document</button>':'<button type="button" data-doc-trucks>Select Another Truck</button>'}<button type="button" data-doc-retry>Refresh</button></div><div class="truck-document-list">${documents.length?documents.map((doc,index)=>`<article class="truck-document-row"><div><button type="button" class="truck-document-title" data-doc-open="${index}">${esc(doc.title)}</button><small>Date added: ${esc(doc.dateAdded||'Not recorded')}</small></div>${isAdmin?`<button type="button" data-doc-edit="${index}">Edit</button>`:''}</article>`).join(''):'<p>No documents have been added for this truck.</p>'}</div>${nextPage?'<button type="button" data-doc-more>Load More Documents</button>':''}`;
    content.querySelector('[data-doc-add]')?.addEventListener('click',()=>edit());
    content.querySelector('[data-doc-trucks]')?.addEventListener('click',chooseTruck);
    content.querySelector('[data-doc-retry]').onclick=()=>showList();
    content.querySelector('[data-doc-more]')?.addEventListener('click',()=>{content.querySelector('[data-doc-more]').disabled=true;showList(true);});
    content.querySelectorAll('[data-doc-open]').forEach(el=>el.onclick=()=>openDocument(documents[Number(el.dataset.docOpen)]));
    content.querySelectorAll('[data-doc-edit]').forEach(el=>el.onclick=()=>edit(documents[Number(el.dataset.docEdit)]));
  }
  function edit(doc=null) {
    message('');
    content.innerHTML=`<form id="truckDocumentForm"><h3>${doc?'Edit Document':'Add Document'}</h3><label for="truckDocumentUpload">${doc?'Replace document (optional)':'Upload document'}</label><input id="truckDocumentUpload" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.doc,.docx,.xls,.xlsx" ${doc?'':'required'}><p class="truck-document-help">No fixed limit on document count. Up to 20 MB per file. PDFs and images open in the browser; Word and Excel files download to open in their application.</p><label for="truckDocumentTitle">Title</label><input id="truckDocumentTitle" required maxlength="110" value="${esc(doc?.title||'')}"><div class="truck-document-save-row"><div><label for="truckDocumentDate">Date added</label><input id="truckDocumentDate" type="date" required value="${esc(doc?.dateAdded||today())}"></div><button type="submit" class="primary">Save</button><button type="button" class="danger" id="truckDocumentDelete">Delete</button></div><div id="truckDocumentDeleteConfirm" hidden><p>Move this document to Google Drive Trash? It will no longer appear for drivers.</p><button type="button" id="truckDocumentConfirmDelete" class="danger">Move to Trash</button><button type="button" id="truckDocumentKeep">Keep Document</button></div><button type="button" id="truckDocumentCancel">Back to Documents</button></form>`;
    $('truckDocumentCancel').onclick=()=>{renderList();message('');};
    $('truckDocumentUpload').onchange=()=>{if(!$('truckDocumentTitle').value) $('truckDocumentTitle').value=$('truckDocumentUpload').files[0]?.name.replace(/\.[^.]+$/,'')||'';};
    $('truckDocumentForm').onsubmit=async e=>{
      e.preventDefault(); if(busy)return;
      const file=$('truckDocumentUpload').files[0],title=$('truckDocumentTitle').value.trim();
      if(!title) return message('Enter a document title.');
      if(new TextEncoder().encode(title).length>110) return message('Please shorten the title (110 bytes maximum).');
      if(file?.size>20*1024*1024) return message('Each upload must be 20 MB or smaller.');
      const body=new FormData();body.set('action','save');body.set('truckId',selectedTruck.id);body.set('title',title);body.set('dateAdded',$('truckDocumentDate').value);if(doc)body.set('documentId',doc.id);if(file)body.set('file',file);
      lock(true);message('Saving document…');
      try {await call(body);lock(false);await showList(); if(!$('truckDocumentsStatus').textContent) message('Document saved. Select Add Document to add another.');}
      catch(e){lock(false);message(e.message);}
    };
    $('truckDocumentDelete').onclick=()=>{
      if(!doc){renderList();message('Unsaved document cleared.');return;}
      $('truckDocumentDeleteConfirm').hidden=false;
    };
    $('truckDocumentKeep').onclick=()=>{$('truckDocumentDeleteConfirm').hidden=true;};
    $('truckDocumentConfirmDelete').onclick=async()=>{
      lock(true);message('Deleting document…');
      try{await call({action:'delete',truckId:selectedTruck.id,documentId:doc.id});lock(false);await showList();if(!$('truckDocumentsStatus').textContent)message('Document moved to Google Drive Trash.');}
      catch(e){lock(false);message(e.message);}
    };
  }
  async function openDocument(doc) {
    const popup=window.open('about:blank','_blank');
    if(!popup) return message('Allow pop-ups to open the document, then try again.');
    popup.opener=null; popup.document.title=doc.title;popup.document.body.textContent='Opening document…';
    try {
      const data=await call({action:'open',truckId:selectedTruck.id,documentId:doc.id});
      const mime=String(doc.mimeType).startsWith('application/vnd.google-apps.')?'application/pdf':doc.mimeType;
      const blob=new Blob([data],{type:mime});
      const url=URL.createObjectURL(blob);
      if(['application/pdf','image/jpeg','image/png','image/webp','text/plain'].includes(blob.type))popup.location.replace(url);
      else {popup.document.body.textContent='';const link=popup.document.createElement('a');link.href=url;link.download=doc.name||doc.title;link.textContent=`Download ${doc.title}`;popup.document.body.appendChild(link);link.click();}
      setTimeout(()=>URL.revokeObjectURL(url),300000);
    } catch(e){popup.close();message(e.message);}
  }
  async function chooseTruck() {
    const ticket=++generation;selectedTruck=null;documents=[];nextPage=null;
    $('truckDocumentsHeading').textContent='Truck Documents';content.innerHTML='';message('Loading trucks…');
    try {
      const result=await call({action:'trucks'});if(ticket!==generation||!dialog.open)return;
      content.innerHTML='<label for="truckDocumentSelect">Select truck number</label><select id="truckDocumentSelect"><option value="">Choose a truck</option>'+result.trucks.map(t=>`<option value="${esc(t.id)}">${esc(t.truck_number)}</option>`).join('')+'</select>';
      message(result.trucks.length?'':'No trucks are available for your company.');
      $('truckDocumentSelect').onchange=()=>{const truck=result.trucks.find(t=>t.id===$('truckDocumentSelect').value);if(truck){selectedTruck={id:truck.id,number:truck.truck_number};showList();}};
    }catch(e){message(e.message);content.innerHTML='<button type="button" id="truckDocumentsRetry">Try Again</button>';$('truckDocumentsRetry').onclick=chooseTruck;}
  }
  if(isAdmin) {
    const notes=$('truckNotes'),label=notes?.previousElementSibling;
    if(notes && label) {
      const button=document.createElement('button');button.type='button';button.id='truckDocumentsButton';button.className='truck-documents-launch';button.textContent='Documents';label.before(button);
      button.onclick=()=>{const id=$('truckId').value;if(!id){$('truckFormMsg').textContent='Save this truck before adding documents.';return;}ensure();selectedTruck={id,number:$('truckNumber').value};dialog.showModal();showList();};
    }
  } else document.addEventListener('click',event=>{if(event.target.closest('[data-open-truck-documents]')){ensure();if($('modal')?.open)$('modal').close();dialog.showModal();chooseTruck();}});
})();
