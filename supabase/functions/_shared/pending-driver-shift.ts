// Resolve reports by authenticated profile UUID, independently of device storage,
// employee-number changes, calendar dates, and the driver's time zone.
export const sortedIds = (ids: string[]) => [...new Set(ids)].sort();
export function partitionPending(inspections: any[], reports: any[]) {
  const sent = new Set(reports.filter(r => r.email_status === 'sent').flatMap(r => r.inspection_ids || []));
  const owned = new Set(inspections.map(i => i.id));
  const confirmed = new Map<string,string>();
  for(const report of reports) {
    if(report.email_status !== 'sent') continue;
    const value = report.emailed_at || report.completed_at;
    const time = Date.parse(value || '');
    if(!Number.isFinite(time)) continue;
    for(const id of report.inspection_ids || []) {
      if(!owned.has(id)) continue;
      if(!confirmed.has(id) || time < Date.parse(confirmed.get(id)!)) confirmed.set(id,new Date(time).toISOString());
    }
  }
  return { sent, pending: inspections.filter(i => !sent.has(i.id)), confirmations:[...confirmed].map(([id,emailed_at])=>({id,emailed_at})) };
}
async function allRows(query: (from: number, to: number) => any) {
  const rows: any[] = [];
  for(let from=0;;from+=500) {
    const {data,error} = await query(from,from+499);
    if(error) throw error;
    rows.push(...(data || []));
    if(!data || data.length<500) return rows;
  }
}
export async function pendingDriverShift(client: any, userId: string) {
  const {data:driver,error} = await client.from('employee_profiles').select('id,company_id,full_name,employee_id,email,status,deleted_at').eq('id',userId).single();
  if(error || !driver || driver.deleted_at || driver.status !== 'active') throw Error('An active driver session is required. Please sign in again.');
  const inspections = await allRows((from,to) => client.from('inspections').select('*').eq('company_id',driver.company_id).eq('driver_id',userId).is('deleted_at',null).not('submitted_at','is',null).order('submitted_at').order('id').range(from,to));
  const reports = await allRows((from,to) => client.from('end_shift_reports').select('id,email_status,inspection_ids,emailed_at,completed_at').eq('company_id',driver.company_id).eq('driver_id',userId).eq('email_status','sent').order('id').range(from,to));
  return { driver,...partitionPending(inspections,reports) };
}
const base64 = (bytes: Uint8Array) => { let text=''; for(let i=0;i<bytes.length;i+=0x8000) text+=String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(text); };
export async function recoverShiftEntries(client: any, inspections: any[], driver: any) {
  const entries = [];
  for(const inspection of inspections) {
    if(!inspection.driver_certified) throw Error(`Inspection ${inspection.inspection_number || inspection.id} is missing driver certification. Contact Admin before completing End of Shift.`);
    const {data:photos,error} = await client.from('inspection_photos').select('photo_key,photo_label,is_required,storage_path,mime_type').eq('company_id',driver.company_id).eq('inspection_id',inspection.id).is('deleted_at',null).order('display_order');
    if(error) throw error;
    const expected = ({doubles:9,'53_trailer':4,container:4,single_pup:4} as Record<string,number>)[inspection.equipment_type] || 0;
    if(new Set((photos || []).filter((p:any)=>p.is_required && p.storage_path).map((p:any)=>p.photo_key)).size<expected) throw Error(`Photos for inspection ${inspection.inspection_number || inspection.id} are still missing. Keep the app open to finish uploading, then retry End of Shift.`);
    const required: Record<string,any> = {}, extras = [];
    for(const photo of photos || []) {
      if(!photo.storage_path) throw Error('An inspection photo has not finished uploading. Retry after uploads complete.');
      const {data:file,error:fileError} = await client.storage.from('inspection-photos').download(photo.storage_path);
      if(fileError || !file) throw Error(`Unable to load ${photo.photo_label || 'an inspection photo'}. Retry End of Shift when the connection is available.`);
      const image={name:photo.photo_label || 'Photo',type:photo.mime_type || file.type || 'image/jpeg',data_url:`data:${photo.mime_type || file.type || 'image/jpeg'};base64,${base64(new Uint8Array(await file.arrayBuffer()))}`};
      if(photo.is_required) required[String(photo.photo_key).replace(/^required-/,'')]=image; else extras.push(image);
    }
    entries.push({id:inspection.id,employee_id:driver.employee_id,driver_name:driver.full_name,type:({'53_trailer':'53',single_pup:'pup'} as Record<string,string>)[inspection.equipment_type] || inspection.equipment_type,submitted_at:inspection.submitted_at,created_at:inspection.started_at || inspection.created_at,truck:inspection.truck_number,trailer1:inspection.trailer_1_number,trailer2:inspection.trailer_2_number,dolly:inspection.dolly_number,chassis:inspection.chassis_id,from:inspection.location_from,to:inspection.location_to,notes:inspection.notes,bypass:inspection.has_bypass,bypass_reason:inspection.template_snapshot?.bypass_reason,photos:required,extra_photos:extras});
  }
  return entries;
}
export async function shiftSequence(ids: string[]) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sortedIds(ids).join(',')));
  return parseInt([...new Uint8Array(digest)].slice(0,6).map(x=>x.toString(16).padStart(2,'0')).join(''),16) || 1;
}
