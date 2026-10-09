const {stripTypeScriptTypes}=require('node:module');
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
let code=fs.readFileSync('supabase/functions/truck-documents/index.ts','utf8').replace(/^import .*\n/,'').replace('export async function handleRequest','async function handleRequest').replace('export default { fetch: handleRequest };','globalThis.handleRequest=handleRequest;');
code=stripTypeScriptTypes(code,{mode:'transform'});
async function test(opts={}){
 const calls=[];let saved;
 const profile={company_id:'company-a',role:opts.role||'admin',status:opts.inactive?'inactive':'active',deleted_at:null};
 const db={auth:{getUser:async()=>({data:{user:opts.noUser?null:{id:'user-a'}}})},from(table){const filters={};const q={select(){return q},eq(k,v){filters[k]=v;return q},is(){return q},order(){return q},single:async()=>({data:table==='employee_profiles'?profile:table==='companies'?{documents_drive_folder_id:'root-a'}:opts.foreignTruck?null:{id:'truck-a',truck_number:'335826',company_id:'company-a'}}),range:async()=>({data:[{id:'truck-a',truck_number:'335826'}]})};return q}};
 const fetch=async(url,init={})=>{
  calls.push([url,init]);
  if(url.includes('oauth2'))return Response.json({access_token:'google-test'});
  const u=new URL(url);
  if(url.includes('upload/drive')) {saved=await init.body.text();return Response.json({id:'new-file'});}
  if(u.pathname.endsWith('/files') && u.searchParams.get('q')?.includes("mimeType ="))return Response.json({files:opts.noFolder?[]:opts.duplicate?[{id:'folder-a'},{id:'folder-b'}]:[{id:'folder-a'}]});
  if(u.pathname.endsWith('/files'))return Response.json({files:[{id:'file-a',name:'registration.pdf',mimeType:'application/pdf',createdTime:'2026-10-08T12:00:00Z'}],nextPageToken:'page-two'});
  if(init.method==='PATCH'){saved=init.body;return Response.json({id:'file-a'});}
  if(u.searchParams.get('alt')==='media'||u.pathname.endsWith('/export'))return new Response('document-bytes');
  return Response.json({id:'file-a',name:'registration.pdf',mimeType:opts.mime||'application/pdf',parents:[opts.foreignFile?'other-folder':'folder-a'],trashed:false,properties:{}});
 };
 const context={createClient:()=>db,Deno:{env:{get:key=> key==='TRUCK_DOCUMENT_COMPANY_FOLDERS'?JSON.stringify(opts.unmapped?{}:{'company-a':'root-a'}):'configured'}},fetch,Request,Response,URL,URLSearchParams,Blob,File,FormData,TextEncoder,crypto,console};vm.createContext(context);vm.runInContext(code,context);
 const fields={action:opts.action||'list',truckId:'truck-a',documentId:opts.action==='save'&&!opts.edit?'': 'file-a',title:'Registration',dateAdded:'2026-10-08',pageToken:'next'};
 let body=JSON.stringify(fields),headers={'Content-Type':'application/json',Authorization:'Bearer test'};
 if(opts.upload){body=new FormData();Object.entries(fields).forEach(([k,v])=>body.set(k,v));body.set('file',new File(['sample'],'reg.pdf',{type:opts.uploadMime||'application/pdf'}));delete headers['Content-Type'];}
 if(opts.noAuth)delete headers.Authorization;
 const r=await context.handleRequest(new Request('https://test/functions/v1/truck-documents',{method:'POST',headers,body}));
 return {status:r.status,data:r.headers.get('content-type').includes('json')?await r.json():await r.text(),calls,saved};
}
(async()=>{
 let r=await test({noAuth:true});assert.equal(r.status,401);assert.equal(r.calls.length,0);
 for(const o of [{noUser:true},{inactive:true},{role:'driver',action:'save'},{role:'driver',action:'delete'},{foreignTruck:true}]){r=await test(o);assert(r.status>=400);assert.equal(r.calls.length,0);}
 for(const action of ['open','save','delete']){r=await test({action,edit:true,foreignFile:true});assert.equal(r.status,404);assert(!r.calls.some(([,i])=>i.method==='PATCH'));}
 for(const o of [{noFolder:true},{duplicate:true},{unmapped:true}])assert.equal((await test(o)).status,409);
 r=await test({role:'driver'});assert.equal(r.status,200);assert.equal(r.data.nextPageToken,'page-two');assert.equal(r.data.documents[0].title,'registration.pdf');assert(r.calls.some(([u])=>u.includes('pageToken=next')));
 r=await test({action:'open',role:'driver'});assert.equal(r.data,'document-bytes');
 r=await test({action:'save',upload:true});assert.equal(r.status,200);assert(r.saved.includes('"parents":["folder-a"]'));assert(r.saved.includes('fp365_title'));assert(r.saved.includes('Registration'));
 r=await test({action:'save',edit:true});assert.equal(r.status,200);assert.equal(JSON.parse(r.saved).properties.fp365_date_added,'2026-10-08');
 r=await test({action:'save',upload:true,uploadMime:'text/html'});assert.equal(r.status,415);
 r=await test({action:'delete'});assert.equal(r.status,200);assert.deepEqual(JSON.parse(r.saved),{trashed:true});
 r=await test({action:'trucks',role:'driver'});assert.equal(r.status,200);assert.equal(r.calls.length,0);
 console.log('PASS: authentication, active roles, driver read-only, company/truck boundaries, foreign-file denial, folder ambiguity, pagination, direct Drive files, upload metadata, edit, trash, and document streaming.');
})().catch(e=>{console.error(e);process.exitCode=1});
