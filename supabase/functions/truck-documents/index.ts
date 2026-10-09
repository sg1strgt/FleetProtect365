import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, "Content-Type": "application/json" } });
const folderMime = "application/vnd.google-apps.folder";
const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
const exportsToPdf = new Set(["application/vnd.google-apps.document", "application/vnd.google-apps.spreadsheet", "application/vnd.google-apps.presentation"]);
const quote = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
class RequestError extends Error { constructor(message: string, public status = 400) { super(message); } }
const assert = (ok: unknown, message: string, status = 400) => { if (!ok) throw new RequestError(message, status); };

async function accessToken() {
  const client_id = Deno.env.get("GOOGLE_CLIENT_ID"), client_secret = Deno.env.get("GOOGLE_CLIENT_SECRET"), refresh_token = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  assert(client_id && client_secret && refresh_token, "Truck document storage is not configured.", 503);
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: client_id!, client_secret: client_secret!, refresh_token: refresh_token!, grant_type: "refresh_token" }) });
  const data = await response.json();
  assert(response.ok && data.access_token, "Google Drive authorization is unavailable.", 503);
  return data.access_token;
}
function dateValid(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value; }
function fileResult(file: any) { return { id: file.id, title: file.properties?.fp365_title || file.name, dateAdded: file.properties?.fp365_date_added || String(file.createdTime || "").slice(0,10), name: file.name, mimeType: file.mimeType, size: file.size }; }

export async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" },405);
  try {
    const authorization = req.headers.get("Authorization") || "";
    assert(authorization.startsWith("Bearer "), "Sign in to view truck documents.",401);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: auth, error: authError } = await db.auth.getUser(authorization.slice(7));
    assert(!authError && auth.user, "Your session has expired. Sign in again.",401);
    const { data: profile, error: profileError } = await db.from("employee_profiles").select("company_id,role,status,deleted_at").eq("id",auth.user!.id).single();
    assert(!profileError && profile && !profile.deleted_at && profile.status === "active" && ["driver","user","admin","super_admin"].includes(profile.role), "Active company access is required.",403);
    const multipart = req.headers.get("Content-Type")?.startsWith("multipart/form-data");
    assert(Number(req.headers.get("Content-Length") || 0) <= 22 * 1024 * 1024, "Each upload must be 20 MB or smaller.",413);
    const body: any = multipart ? await req.formData() : await req.json();
    const field = (key: string) => String(multipart ? body.get(key) || "" : body[key] || "");
    const action = field("action");
    assert(["trucks","list","open","save","delete"].includes(action), "Unknown document action.");
    const canManage = ["admin","super_admin"].includes(profile.role);
    if (["save","delete"].includes(action)) assert(canManage,"Administrator access is required.",403);
    if (action === "trucks") {
      // Page through the database instead of silently imposing its default row limit.
      const trucks: any[] = [];
      for (let offset = 0;; offset += 500) {
        const { data, error } = await db.from("trucks").select("id,truck_number,status").eq("company_id",profile.company_id).is("deleted_at",null).order("truck_number").order("id").range(offset,offset+499);
        assert(!error,"Truck records could not be loaded.",503);
        trucks.push(...data!); if (data!.length < 500) break;
      }
      return json({ trucks });
    }
    const { data: truck, error: truckError } = await db.from("trucks").select("id,truck_number,company_id").eq("id",field("truckId")).eq("company_id",profile.company_id).is("deleted_at",null).single();
    assert(!truckError && truck,"Truck not found in your company.",404);
    const { data: company, error: companyError } = await db.from("companies").select("documents_drive_folder_id").eq("id",profile.company_id).single();
    assert(!companyError && company?.documents_drive_folder_id,"Your company's document folder is not configured.",409);
    const token = await accessToken();
    async function drive(path: string, init: RequestInit = {}) {
      const response = await fetch("https://www.googleapis.com/drive/v3/"+path, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
      assert(response.ok, response.status === 404 ? "Document or truck folder is no longer available." : "Google Drive could not complete the request. Try again.",response.status === 404 ? 404 : 502);
      return response;
    }
    const q = `'${quote(company.documents_drive_folder_id)}' in parents and name = '${quote(truck.truck_number)}' and mimeType = '${folderMime}' and trashed = false`;
    const folders = await (await drive("files?"+new URLSearchParams({ q, fields:"files(id),nextPageToken", pageSize:"2", supportsAllDrives:"true", includeItemsFromAllDrives:"true" }))).json();
    assert(folders.files?.length === 1 && !folders.nextPageToken, folders.files?.length ? "More than one folder matches this truck. Ask your administrator to resolve the duplicate folders." : `Create a folder named ${truck.truck_number} inside your company document folder first.`,409);
    const folder = folders.files[0].id;
    if (action === "list") {
      const query = new URLSearchParams({ q:`'${quote(folder)}' in parents and trashed = false and mimeType != '${folderMime}' and mimeType != 'application/vnd.google-apps.shortcut'`, fields:"files(id,name,mimeType,createdTime,size,properties),nextPageToken", pageSize:"100", orderBy:"name", supportsAllDrives:"true", includeItemsFromAllDrives:"true" });
      if (field("pageToken")) query.set("pageToken",field("pageToken"));
      const files = await (await drive("files?"+query)).json();
      return json({ documents: files.files.map(fileResult), nextPageToken: files.nextPageToken || null });
    }
    const id = field("documentId");
    let file: any;
    if (id) {
      file = await (await drive(`files/${encodeURIComponent(id)}?fields=id,name,mimeType,parents,trashed,properties,createdTime,size&supportsAllDrives=true`)).json();
      assert(!file.trashed && file.parents?.includes(folder) && file.mimeType !== folderMime && file.mimeType !== "application/vnd.google-apps.shortcut", "Document not found for this truck.",404);
    }
    if (action === "open") {
      assert(file,"Choose a document.");
      const exportPdf = exportsToPdf.has(file.mimeType);
      assert(exportPdf || allowed.has(file.mimeType),"This document type is not supported. Ask an administrator to upload a PDF copy.",415);
      const response = await drive(`files/${encodeURIComponent(id)}`+(exportPdf ? "/export?mimeType=application%2Fpdf" : "?alt=media&supportsAllDrives=true"));
      return new Response(response.body, { headers: { ...cors, "Content-Type": "application/octet-stream", "X-Content-Type-Options":"nosniff" } });
    }
    if (action === "delete") {
      assert(file,"Choose a saved document.");
      await drive(`files/${encodeURIComponent(id)}?supportsAllDrives=true`, { method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({trashed:true}) });
      return json({ok:true});
    }
    const title = field("title").trim(), date = field("dateAdded");
    assert(title.length > 0 && new TextEncoder().encode(title).length <= 110,"Enter a title of no more than 110 bytes.");
    assert(dateValid(date),"Enter a valid date added.");
    const upload = multipart ? body.get("file") : null;
    const metadata: any = { properties: { ...(file?.properties || {}), fp365_title:title, fp365_date_added:date } };
    if (upload instanceof File && upload.size) {
      assert(upload.size <= 20*1024*1024,"Each upload must be 20 MB or smaller.",413);
      assert(allowed.has(upload.type),"Upload a PDF, JPG, PNG, WebP, text, Word, or Excel document.",415);
      metadata.name = upload.name;
      if (!id) metadata.parents = [folder];
      const boundary = "fp365_"+crypto.randomUUID();
      const blob = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${upload.type}\r\n\r\n`,upload,`\r\n--${boundary}--`]);
      const response = await fetch("https://www.googleapis.com/upload/drive/v3/files"+(id ? "/"+encodeURIComponent(id) : "")+"?uploadType=multipart&supportsAllDrives=true&fields=id", { method:id?"PATCH":"POST",headers:{ Authorization:`Bearer ${token}`,"Content-Type":`multipart/related; boundary=${boundary}` },body:blob });
      assert(response.ok,"The document was not saved. Check Drive and retry if it is missing.",502);
      return json({ok:true,...await response.json()});
    }
    assert(file,"Choose a document to upload.");
    await drive(`files/${encodeURIComponent(id)}?supportsAllDrives=true`, { method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(metadata) });
    return json({ok:true,id});
  } catch (error) {
    return json({error:error instanceof RequestError ? error.message : "Truck documents are temporarily unavailable. Try again."}, error instanceof RequestError ? error.status : 500);
  }
}
export default { fetch: handleRequest };
