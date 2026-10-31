export type Reminder = {id:string;channel:'email'|'text';recipient:string;payload:{title:string;body:string;date:string;time?:string};attempts:number};
export function reminderMessage(job:Reminder) {
 const {title,body,date,time}=job.payload;
 const [y,m,d]=date.split('-');
 const when=`${m}/${d}/${y}${time ? ` ${time.slice(0,5)} Central` : ''}`;
 if(job.channel==='text') {
  // Vtext's 160-character budget includes the subject and recipient address.
  const subject='FP365';
  const budget=Math.max(0,160-subject.length-job.recipient.length-4);
  const text=`${when}: ${title}${body ? ` - ${body}` : ''}`.replace(/[^\x20-\x7e]/g,' ').replace(/\s+/g,' ').trim();
  return {subject,text:text.length>budget ? `${text.slice(0,budget-3)}...` : text};
 }
 return {subject:`Calendar reminder: ${title}`,text:`Fleet Protect 365 Calendar\n${when}\n\n${title}\n\n${body}\n\nOpen Calendar: https://app.fleetprotect365.com/admin/`};
}
export async function submitReminder(job:Reminder,apiKey:string,from:string,fetcher:typeof fetch=fetch) {
 const message=reminderMessage(job);
 try {
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`calendar/${job.id}`},body:JSON.stringify({from,to:[job.recipient],...message}),signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok || !data.id) return {ok:false,retry:response.status===429 || response.status>=500,error:`Email service did not accept the ${job.channel==='text'?'Verizon text':'email'} reminder (status ${response.status}).`};
  return {ok:true,providerId:String(data.id)};
 } catch { return {ok:false,retry:true,error:'No confirmation from the email service. The same reminder will be retried safely.'}; }
}
