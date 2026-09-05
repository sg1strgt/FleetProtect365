(()=>{
  'use strict';
  const s=window.FP365_ADMIN_CLIENT;if(!s)return;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  async function renderDetails(){
    if(document.getElementById('messages')?.classList.contains('hidden'))return;
    try{
      const {data:session}=await s.auth.getSession(),user=session.session?.user;if(!user)return;
      const {data:profile,error:profileError}=await s.from('employee_profiles').select('company_id').eq('id',user.id).single();if(profileError)throw profileError;
      const [messages,people]=await Promise.all([
        s.from('app_messages').select('id,app_message_replies(id,author_id,body,created_at)').eq('company_id',profile.company_id).order('created_at',{ascending:false}).limit(100),
        s.from('employee_profiles').select('id,display_name,full_name,employee_id').eq('company_id',profile.company_id)
      ]);
      if(messages.error)throw messages.error;if(people.error)throw people.error;
      const names=Object.fromEntries((people.data||[]).map(x=>[x.id,x.display_name||x.full_name||x.employee_id||'Employee'])),articles=[...document.querySelectorAll('#messageHistory article')];
      (messages.data||[]).forEach((message,index)=>{
        const article=articles[index];if(!article)return;
        article.querySelector('.message-replies')?.remove();article.querySelector('.message-delete')?.remove();
        const remove=document.createElement('button');remove.type='button';remove.className='danger message-delete';remove.textContent='Delete This Message';remove.onclick=()=>deleteMessage(message.id);article.appendChild(remove);
        const replies=(message.app_message_replies||[]).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));if(!replies.length)return;
        const box=document.createElement('div');box.className='message-replies';box.innerHTML=`<h4>Replies (${replies.length})</h4>${replies.map(reply=>`<div><b>${esc(names[reply.author_id]||'Employee')}</b><p>${esc(reply.body)}</p><small>${new Date(reply.created_at).toLocaleString()}</small></div>`).join('')}`;article.insertBefore(box,remove);
      });
    }catch(error){console.warn('Message details unavailable:',error.message);}
  }
  async function deleteMessage(id){
    if(!confirm('Delete this sent message and its replies for every recipient? This cannot be undone.'))return;
    const {error}=await s.from('app_messages').delete().eq('id',id);if(error){alert(error.message);return;}
    document.getElementById('refreshMessages')?.click();
  }
  setTimeout(()=>{document.querySelector('nav [data-view="messages"]')?.addEventListener('click',()=>setTimeout(renderDetails,500));document.getElementById('refreshMessages')?.addEventListener('click',()=>setTimeout(renderDetails,500));},300);
  setInterval(renderDetails,10000);
})();
