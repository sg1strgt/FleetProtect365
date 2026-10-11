(()=>{
 const form=document.getElementById('login'),message=document.getElementById('result'),button=form.querySelector('button'),value=id=>document.getElementById(id).value.trim();
 form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;button.textContent='Verifying…';message.textContent='';
 try{
 const response=await fetch('https://ahoejwyxfclndcbcxhwv.supabase.co/functions/v1/website-services',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',company:value('company'),first:value('first'),last:value('last'),email:value('email'),password:document.getElementById('password').value}),signal:AbortSignal.timeout(45000)});
 const data=await response.json();document.getElementById('password').value='';
 if(!response.ok||!data.ok)throw Error(data.error||'Unable to sign in. Please contact support.');
 const config=window.FP365_ADMIN_CONFIG;
 const client=supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,detectSessionInUrl:false}});
 const {error}=await client.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});
 if(error)throw Error('Your identity was verified, but the browser could not open a session. Please try again.');
 location.replace('./');
 }catch(error){document.getElementById('password').value='';message.textContent=error.message||'Unable to connect. Please contact support.';message.focus();button.disabled=false;button.textContent='Log In';}
 });
})();