(()=>{
  const API='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-sales-app';
  const APIKEY='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
  const TOKEN_KEY='nwtb_chat_token';
  let me=null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const token=()=>localStorage.getItem(TOKEN_KEY)||'';

  async function api(action,body={}){
    const headers={'content-type':'application/json','apikey':APIKEY};
    const t=token();if(t)headers['x-nwtb-session']=t;
    const r=await fetch(API,{method:'POST',headers,body:JSON.stringify({action,...body})});
    const j=await r.json().catch(()=>({error:'Invalid cloud response.'}));
    if(!r.ok){const e=new Error(j.error||'NWTB Sales cloud request failed.');e.status=r.status;throw e}
    return j;
  }

  function ensureUI(){
    if(!document.getElementById('nwtbSalesCloudStyle')){
      const s=document.createElement('style');s.id='nwtbSalesCloudStyle';s.textContent=`
      #nwtbSalesGate{position:fixed;inset:0;z-index:100000;background:#0f172a;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Arial,sans-serif}
      #nwtbSalesGate.hidden{display:none}.nwtbSalesLoginCard{width:min(440px,100%);background:#fff;border-radius:16px;padding:24px;box-shadow:0 24px 70px #0008;color:#17202a}.nwtbSalesLoginCard h1{font-size:24px;margin:0 0 8px}.nwtbSalesLoginCard p{color:#52606d;line-height:1.45}.nwtbSalesLoginCard input{width:100%;padding:13px;border:1px solid #aab4be;border-radius:9px;font-size:20px;letter-spacing:4px;text-align:center}.nwtbSalesLoginCard button{width:100%;margin-top:12px;padding:13px;border:0;border-radius:9px;background:#17202a;color:#fff;font-weight:800;font-size:16px;cursor:pointer}.nwtbSalesLoginError{min-height:20px;color:#b91c1c;font-size:13px;font-weight:700;margin-top:9px}.nwtbSalesLoginSmall{font-size:12px;color:#6b7280;margin-top:12px}.nwtbCloudUser{position:fixed;right:12px;bottom:12px;z-index:9999;background:#17202a;color:#fff;border-radius:999px;padding:8px 11px;font:12px Arial;box-shadow:0 3px 10px #0004}.nwtbCloudUser button{margin-left:8px;border:0;background:#fff;color:#17202a;border-radius:999px;padding:4px 8px;font-weight:700;cursor:pointer}`;document.head.appendChild(s)
    }
    let g=document.getElementById('nwtbSalesGate');
    if(!g){g=document.createElement('div');g.id='nwtbSalesGate';g.innerHTML=`<div class="nwtbSalesLoginCard"><h1>NWTB Sales Route Creator</h1><p><b>Employee sign-in required.</b><br>This Sales system loads its customer/prospect database from the NWTB cloud. The office PC and local Windows server are not required.</p><input id="nwtbSalesEmployeeNo" inputmode="numeric" maxlength="4" placeholder="4-digit employee #" autocomplete="off"><button id="nwtbSalesLoginBtn">SIGN IN</button><div id="nwtbSalesLoginError" class="nwtbSalesLoginError"></div><div class="nwtbSalesLoginSmall">Internet connection required. Authorized NWTB employees only.</div></div>`;document.body.appendChild(g);g.querySelector('#nwtbSalesLoginBtn').onclick=loginFromUI;g.querySelector('#nwtbSalesEmployeeNo').addEventListener('keydown',e=>{if(e.key==='Enter')loginFromUI()})}
    return g;
  }

  function setError(msg){const e=document.getElementById('nwtbSalesLoginError');if(e)e.textContent=msg||''}
  function showGate(msg=''){const g=ensureUI();g.classList.remove('hidden');setError(msg);setTimeout(()=>document.getElementById('nwtbSalesEmployeeNo')?.focus(),30)}
  function hideGate(){ensureUI().classList.add('hidden')}
  function showUser(){if(!me)return;let b=document.getElementById('nwtbCloudUser');if(!b){b=document.createElement('div');b.id='nwtbCloudUser';b.className='nwtbCloudUser';document.body.appendChild(b)}b.innerHTML=`Cloud: <b>${esc(me.display_name)}</b><button id="nwtbSalesLogoutBtn">LOG OUT</button>`;document.getElementById('nwtbSalesLogoutBtn').onclick=window.nwtbSalesCloudLogout}

  async function loginFromUI(){
    const input=document.getElementById('nwtbSalesEmployeeNo'),btn=document.getElementById('nwtbSalesLoginBtn');
    const employee_number=String(input?.value||'').trim();if(!/^\d{4}$/.test(employee_number)){setError('Enter your 4-digit employee number.');return}
    if(btn){btn.disabled=true;btn.textContent='SIGNING IN…'}setError('');
    try{const j=await api('login',{employee_number});localStorage.setItem(TOKEN_KEY,j.token);me={employee_number:j.employee_number,display_name:j.display_name};hideGate();showUser();window.dispatchEvent(new CustomEvent('nwtb-sales-authenticated',{detail:me}))}
    catch(e){localStorage.removeItem(TOKEN_KEY);setError(e.message||String(e))}
    finally{if(btn){btn.disabled=false;btn.textContent='SIGN IN'}}
  }

  async function ensureSession(){
    ensureUI();
    if(token()){
      try{const j=await api('whoami');me={employee_number:j.employee_number,display_name:j.display_name};hideGate();showUser();return me}catch{localStorage.removeItem(TOKEN_KEY)}
    }
    showGate();
    return new Promise(resolve=>window.addEventListener('nwtb-sales-authenticated',e=>resolve(e.detail),{once:true}));
  }

  window.nwtbLoadSalesAccounts=async function(){
    await ensureSession();
    try{
      const j=await api('accounts');
      if(!Array.isArray(j.accounts)||j.accounts.length<400)throw new Error('Private Sales database returned an unexpected account count.');
      window.nwtbSalesCloudSource=j.source||'SUPABASE_PRIVATE';
      return j.accounts;
    }catch(e){
      if(e.status===401){localStorage.removeItem(TOKEN_KEY);showGate('Your Sales session expired. Sign in again.');await ensureSession();return window.nwtbLoadSalesAccounts()}
      showGate('Could not load the private Sales database: '+(e.message||e));throw e
    }
  };

  window.nwtbSalesCloudLogout=async function(){
    try{await api('logout')}catch{}
    localStorage.removeItem(TOKEN_KEY);me=null;document.getElementById('nwtbCloudUser')?.remove();showGate('Signed out.');
  };

  ensureUI();
  showGate('Checking your Sales session…');
})();