(() => {
  const API = 'https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-chat';
  const APIKEY = 'sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
  let chatTimer = null;

  const css = `
  #nwtbChatBtn{position:fixed;right:22px;bottom:22px;z-index:60;background:#17202a;color:#fff;border:0;border-radius:999px;padding:14px 18px;font-weight:800;box-shadow:0 6px 20px #0004;cursor:pointer}
  #nwtbChatPanel{position:fixed;right:22px;bottom:82px;width:min(420px,calc(100vw - 30px));height:min(650px,calc(100vh - 120px));z-index:59;background:#fff;border:1px solid #cfd6dd;border-radius:14px;box-shadow:0 10px 36px #0005;display:none;overflow:hidden}
  #nwtbChatPanel.open{display:flex;flex-direction:column}.nwtb-chat-head{background:#17202a;color:#fff;padding:13px 15px;display:flex;justify-content:space-between;align-items:center}.nwtb-chat-head button{background:#fff2;color:#fff;padding:6px 9px}.nwtb-chat-login{padding:20px}.nwtb-chat-login input{margin:9px 0}.nwtb-chat-login button{width:100%;background:#17202a;color:#fff}.nwtb-chat-body{display:none;flex:1;min-height:0}.nwtb-chat-body.on{display:flex;flex-direction:column}.nwtb-chat-who{padding:9px 12px;background:#eef2f6;border-bottom:1px solid #d9dee4;font-size:13px}.nwtb-chat-messages{flex:1;overflow:auto;padding:12px;background:#f7f9fb}.nwtb-msg{background:#fff;border:1px solid #d9dee4;border-radius:10px;padding:9px 10px;margin-bottom:9px}.nwtb-msg .meta{font-size:12px;color:#65717c;margin-bottom:5px}.nwtb-msg.route{border-left:5px solid #1a73e8}.nwtb-route-title{font-weight:800;margin-bottom:5px}.nwtb-route-stops{font-size:12px;color:#52606d;margin-bottom:8px}.nwtb-load-route{background:#1a73e8;color:#fff;padding:8px 10px}.nwtb-chat-send{padding:10px;border-top:1px solid #d9dee4;background:#fff}.nwtb-chat-send textarea{width:100%;height:68px;resize:none;padding:9px;border:1px solid #bcc6cf;border-radius:8px;font:inherit}.nwtb-chat-actions{display:flex;gap:7px;margin-top:7px}.nwtb-chat-actions button{flex:1}.nwtb-send-msg{background:#17202a;color:#fff}.nwtb-send-route{background:#18864b;color:#fff}.nwtb-chat-error{color:#b3261e;font-weight:700;font-size:13px;margin-top:7px}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'nwtbChatPanel';
  panel.innerHTML = `
    <div class="nwtb-chat-head"><b>NWTB CHAT + ROUTES</b><button id="nwtbChatClose">X</button></div>
    <div id="nwtbChatLogin" class="nwtb-chat-login">
      <b>Enter your 4-digit employee number</b>
      <input id="nwtbEmpNo" inputmode="numeric" maxlength="4" placeholder="0000">
      <button id="nwtbLoginBtn">ENTER CHAT</button>
      <div id="nwtbLoginError" class="nwtb-chat-error"></div>
    </div>
    <div id="nwtbChatBody" class="nwtb-chat-body">
      <div class="nwtb-chat-who"><span id="nwtbWho"></span> <button id="nwtbLogoutBtn" style="float:right;padding:3px 7px">LOG OUT</button></div>
      <div id="nwtbMessages" class="nwtb-chat-messages"></div>
      <div class="nwtb-chat-send">
        <textarea id="nwtbMessageText" placeholder="Type a message..."></textarea>
        <div class="nwtb-chat-actions"><button class="nwtb-send-msg" id="nwtbSendMsg">SEND MESSAGE</button><button class="nwtb-send-route" id="nwtbSendRoute">SEND CURRENT ROUTE</button></div>
        <div id="nwtbChatError" class="nwtb-chat-error"></div>
      </div>
    </div>`;
  document.body.appendChild(panel);

  const btn = document.createElement('button'); btn.id='nwtbChatBtn'; btn.textContent='CHAT'; document.body.appendChild(btn);

  const $ = id => document.getElementById(id);
  function token(){ return localStorage.getItem('nwtb_chat_token') || ''; }
  function setIdentity(t,n){ if(t) localStorage.setItem('nwtb_chat_token',t); if(n) localStorage.setItem('nwtb_chat_name',n); }
  function clearIdentity(){ localStorage.removeItem('nwtb_chat_token'); localStorage.removeItem('nwtb_chat_name'); }
  function h(s){ return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
  function when(s){ const d=new Date(s); return isNaN(d)?'':d.toLocaleString(); }

  async function call(action, data={}){
    const headers={'Content-Type':'application/json','apikey':APIKEY};
    if(token()) headers['x-nwtb-session']=token();
    const r=await fetch(API,{method:'POST',headers,body:JSON.stringify({action,...data})});
    let j={}; try{j=await r.json()}catch{}
    if(!r.ok) throw new Error(j.error||'Chat service error');
    return j;
  }

  function showLoggedIn(name){
    $('nwtbChatLogin').style.display='none'; $('nwtbChatBody').classList.add('on'); $('nwtbWho').textContent='Signed in as '+name;
    loadMessages(); if(chatTimer) clearInterval(chatTimer); chatTimer=setInterval(()=>{ if(panel.classList.contains('open')) loadMessages(true); },5000);
  }
  function showLoggedOut(){
    $('nwtbChatBody').classList.remove('on'); $('nwtbChatLogin').style.display='block'; $('nwtbWho').textContent=''; if(chatTimer){clearInterval(chatTimer);chatTimer=null;}
  }

  async function login(){
    $('nwtbLoginError').textContent='';
    const n=$('nwtbEmpNo').value.trim();
    if(!/^\d{4}$/.test(n)){ $('nwtbLoginError').textContent='Enter exactly 4 digits.'; return; }
    try{ const j=await call('login',{employee_number:n}); setIdentity(j.token,j.display_name); showLoggedIn(j.display_name); }
    catch(e){ $('nwtbLoginError').textContent=e.message; }
  }

  async function restore(){
    if(!token()) return showLoggedOut();
    try{ const j=await call('whoami'); setIdentity(token(),j.display_name); showLoggedIn(j.display_name); }
    catch{ clearIdentity(); showLoggedOut(); }
  }

  async function loadMessages(quiet=false){
    try{
      const j=await call('list');
      const box=$('nwtbMessages'); const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<80;
      box.innerHTML=(j.messages||[]).map(m=>{
        if(m.message_type==='route'){
          const p=m.route_payload||{}; const count=Array.isArray(p.stops)?p.stops.length:0;
          return `<div class="nwtb-msg route"><div class="meta"><b>${h(m.display_name)}</b> - ${h(when(m.created_at))}</div><div class="nwtb-route-title">${h(p.title||'NWTB Sales Route')}</div>${m.body?`<div>${h(m.body)}</div>`:''}<div class="nwtb-route-stops">${count} stops${p.miles!=null?` - ${h(p.miles)} miles`:''}${p.minutes!=null?` - ${h(p.minutes)} min`:''}</div><button class="nwtb-load-route" data-route-id="${m.id}">LOAD ROUTE</button></div>`;
        }
        return `<div class="nwtb-msg"><div class="meta"><b>${h(m.display_name)}</b> - ${h(when(m.created_at))}</div><div>${h(m.body||'')}</div></div>`;
      }).join('');
      (j.messages||[]).filter(m=>m.message_type==='route').forEach(m=>{ const b=box.querySelector(`[data-route-id="${m.id}"]`); if(b) b.onclick=()=>loadSharedRoute(m.route_payload); });
      if(nearBottom||!quiet) box.scrollTop=box.scrollHeight;
    } catch(e){ if(!quiet) $('nwtbChatError').textContent=e.message; if(/expired/i.test(e.message)){clearIdentity();showLoggedOut();} }
  }

  async function sendText(){
    const body=$('nwtbMessageText').value.trim(); if(!body) return;
    $('nwtbChatError').textContent='';
    try{ await call('send_text',{body}); $('nwtbMessageText').value=''; await loadMessages(); }
    catch(e){ $('nwtbChatError').textContent=e.message; }
  }

  async function sendRoute(){
    $('nwtbChatError').textContent='';
    if(typeof currentRoute==='undefined'||!Array.isArray(currentRoute)||!currentRoute.length){ $('nwtbChatError').textContent='Create a route first, then send it.'; return; }
    const note=prompt('Optional note for this route:', '') ?? '';
    const payload={title:'NWTB Sales Route - '+currentRoute.length+' Stops',sent_note:note,route_type:(document.getElementById('routeType')||{}).value||null,radius:(document.getElementById('radius')||{}).value||null,stops:currentRoute};
    try{ await call('send_route',{route_payload:payload}); await loadMessages(); alert('Route sent to NWTB Chat.'); }
    catch(e){ $('nwtbChatError').textContent=e.message; }
  }

  function loadSharedRoute(p){
    if(!p||!Array.isArray(p.stops)||!p.stops.length) return alert('This route has no stops.');
    currentRoute=p.stops.map(s=>({...s}));
    currentMapLinks=mapsLinks(currentRoute);
    const out=document.getElementById('output'); out.style.display='block';
    const rows=currentRoute.map((a,i)=>`<tr><td>${i+1}</td><td><b>${esc(a.name)}</b><div class="small">${esc(a.address)}</div></td><td><span class="badge ${pinColor(a)}">${esc(displayType(a))}</span></td><td>${a.customerNumber?'#'+esc(a.customerNumber):'—'}</td><td><b>${esc(objective(a))}</b></td><td><button class="cardbtn" onclick="showCard(${i})">STOP CARD</button></td></tr>`).join('');
    out.innerHTML=`<h2>Shared NWTB Route</h2><div>${currentMapLinks.map(x=>`<a class="routebtn" target="_blank" rel="noopener" href="${x.url}">${x.label}</a>`).join('')}</div><div class="notice" style="margin-top:12px"><b>SHARED ROUTE:</b> Loaded ${currentRoute.length} stops from NWTB Chat.</div><table><tr><th>Stop</th><th>Business</th><th>Map / Account Type</th><th>Customer #</th><th>Call Objective</th><th>Brief</th></tr>${rows}</table>`;
    panel.classList.remove('open'); window.scrollTo({top:out.offsetTop-20,behavior:'smooth'});
  }

  btn.onclick=()=>{ panel.classList.toggle('open'); if(panel.classList.contains('open')) restore(); };
  $('nwtbChatClose').onclick=()=>panel.classList.remove('open');
  $('nwtbLoginBtn').onclick=login;
  $('nwtbEmpNo').addEventListener('keydown',e=>{if(e.key==='Enter')login();});
  $('nwtbSendMsg').onclick=sendText;
  $('nwtbSendRoute').onclick=sendRoute;
  $('nwtbMessageText').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendText();}});
  $('nwtbLogoutBtn').onclick=async()=>{try{await call('logout')}catch{} clearIdentity(); showLoggedOut();};
})();