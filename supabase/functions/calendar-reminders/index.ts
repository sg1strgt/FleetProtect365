import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {submitReminder} from './delivery.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers});
 if(req.method!=='POST') return json({error:'Method not allowed'},405);
 try {
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token=req.headers.get('X-Calendar-Token');
  if(!token) {
   const bearer=(req.headers.get('Authorization') || '').replace(/^Bearer /,'');
   const {data:auth,error}=await client.auth.getUser(bearer);
   if(error || !auth.user) return json({error:'Sign in to use Calendar.'},401);
   const {data:profile}=await client.from('employee_profiles').select('company_id,role,status,deleted_at').eq('id',auth.user.id).single();
   if(!profile || profile.status!=='active' || profile.deleted_at || !['admin','super_admin'].includes(profile.role)) return json({error:'Active Admin access required.'},403);
   const {data:settings}=await client.from('admin_calendar_settings').select('text_email').eq('company_id',profile.company_id).maybeSingle();
   return json({ok:true,email_ready:!!Deno.env.get('RESEND_API_KEY'),text_ready:!!Deno.env.get('RESEND_API_KEY') && !!settings?.text_email,text_destination:settings?.text_email || null,time_zone:'America/Chicago'});
  }
  const {data:authorized,error:authError}=await client.rpc('authorize_calendar_dispatch',{token});
  if(authError || !authorized) return json({error:'Unauthorized'},401);
  const apiKey=Deno.env.get('RESEND_API_KEY');
  if(!apiKey) return json({error:'Reminder email service is unavailable.'},503);
  const {data:jobs,error}=await client.rpc('claim_calendar_reminders');
  if(error) throw error;
  let submitted=0,failed=0;
  for(const job of jobs || []) {
   // Recheck cancellations immediately before contacting the provider.
   const {data:current,error:readError}=await client.from('admin_calendar_reminders').select('status').eq('id',job.id).single();
   if(readError) throw readError;
   if(current.status!=='processing') continue;
   const result=await submitReminder(job,apiKey,Deno.env.get('RESEND_FROM_EMAIL') || Deno.env.get('REPORT_FROM_EMAIL') || 'Fleet Protect 365 <reports@fleetprotect365.com>');
   const retry=!result.ok && result.retry && job.attempts<5;
   const patch=result.ok ? {status:'submitted',provider_id:result.providerId,submitted_at:new Date().toISOString(),last_error:null} : {status:retry?'scheduled':'failed',last_error:result.error,next_attempt_at:new Date(Date.now()+Math.min(30,2**job.attempts)*60000).toISOString()};
   const {error:saveError}=await client.from('admin_calendar_reminders').update(patch).eq('id',job.id).eq('status','processing');
   if(saveError) throw saveError;
   if(result.ok) submitted++;else failed++;
  }
  return json({ok:true,processed:jobs?.length || 0,submitted,failed});
 }catch(error){console.error('Calendar dispatcher:',error instanceof Error?error.message:'Unknown error');return json({error:'Calendar reminders could not be processed. Scheduled reminders remain available for retry.'},500);}
});
