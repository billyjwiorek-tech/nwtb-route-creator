(() => {
  const API = 'https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-chat';
  const APIKEY = 'sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
  let chatTimer = null;

  const css = `
  button[onclick="openRouteXLAllStops()"]{display:none!important}
  #nwtbChatBtn{position:fixed;right:22px;bottom:22px;z-index:60;background:#17202a;color:#fff;border:0;border-radius:999px;padding:14px 18px;font-weight:800;box-shadow:0 6px 20px #0004;cursor:pointer}
  #nwtbChatPanel{position:fixed;right:22px;bottom:82px;width:min(420px,calc(100vw - 30px));height:min(650px,calc(100vh - 120px));z-index:59;background:#fff;border:1px solid #cfd6dd;border-radius:14px;box-shadow:0 10px 36px #0005;display:none;overflow:hidden}
  #nwtbChatPanel.open{display:flex;flex-direction:column}.nwtb-chat-head{background:#17202a;color:#fff;padding:13px 15px;display:flex;justify-content:space-between;align-items:center}.nwtb-chat-head button{background:#fff2;color:#fff;padding:6px 9px}.nwtb-chat-login{padding:20px}.nwtb-chat-login input{margin:9px 0}.nwtb-chat-login button{width:100%;background:#17202a;color:#fff}.nwtb-chat-body{display:none;flex:1;min-height:0}.nwtb-chat-body.on{display:flex;flex-direction:column}.nwtb-chat-who{padding:9px 12px;background:#eef2f6;border-bottom:1px solid #d9dee4;font-size:13px}.nwtb-chat-messages{flex:1;overflow:auto;padding:12px;background:#f7f9fb}.nwtb-msg{background:#fff;border:1px solid #d9dee4;border-radius:10px;padding:9px 10px;margin-bottom:9px}.nwtb-msg .meta{font-size:12px;color:#65717c;margin-bottom:5px}.nwtb-msg.route{border-left:5px solid #1a73e8}.nwtb-route-title{font-weight:800;margin-bottom:5px}.nwtb-route-stops{font-size:12px;color:#52606d;margin-bottom:8px}.nwtb-load-route{background:#1a73e8;color:#fff;padding:8px 10px}.nwtb-chat-send{padding:10px;border-top:1px solid #d9dee4;background:#fff}.nwtb-chat-send textarea{width:100%;height:68px;resize:none;padding:9px;border:1px solid #bcc6cf;border-radius:8px;font:inherit}.nwtb-chat-actions{display:flex;gap:7px;margin-top:7px}.nwtb-chat-actions button{flex:1}.nwtb-send-msg{background:#17202a;color:#fff}.nwtb-send-route{background:#18864b;color:#fff}.nwtb-chat-error{color:#b3261e;font-weight:700;font-size:13px;margin-top:7px}
  .visitbox{margin-top:16px;padding:14px;border:2px solid #d9dee4;border-radius:10px;background:#f8fafb}.visitbox h3{margin:0 0 8px}.visitstatus{display:inline-block;padding:6px 10px;border-radius:999px;font-weight:800;font-size:12px}.vs-not{background:#e7eaee;color:#263238}.vs-follow{background:#fff2b3;color:#6b5500}.vs-done{background:#d8f0df;color:#17652f}.vs-stop{background:#ffd9d9;color:#8e1b1b}.visit-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}.visit-actions button{padding:9px}.visit-note{margin-top:8px;font-size:12px;color:#52606d}.follow-toggle{margin-top:10px;font-size:13px;font-weight:700}.follow-toggle input{width:auto;margin-right:6px}
  `;
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
  async function call(action,data={}){const headers={'Content-Type':'application/json','apikey':APIKEY};if(token())headers['x-nwtb-session']=token();const r=await fetch(API,{method:'POST',headers,body:JSON.stringify({action,...data})});let j={};try{j=await r.json()}catch{}if(!r.ok)throw new Error(j.error||'Chat service error');return j}
  function showLoggedIn(name){$('nwtbChatLogin').style.display='none';$('nwtbChatBody').classList.add('on');$('nwtbWho').textContent='Signed in as '+name;loadMessages();if(chatTimer)clearInterval(chatTimer);chatTimer=setInterval(()=>{if(panel.classList.contains('open'))loadMessages(true)},5000)}
  function showLoggedOut(){$('nwtbChatBody').classList.remove('on');$('nwtbChatLogin').style.display='block';$('nwtbWho').textContent='';if(chatTimer){clearInterval(chatTimer);chatTimer=null}}
  async function login(){$('nwtbLoginError').textContent='';const n=$('nwtbEmpNo').value.trim();if(!/^\d{4}$/.test(n)){$('nwtbLoginError').textContent='Enter exactly 4 digits.';return}try{const j=await call('login',{employee_number:n});setIdentity(j.token,j.display_name);showLoggedIn(j.display_name)}catch(e){$('nwtbLoginError').textContent=e.message}}
  async function restore(){if(!token())return showLoggedOut();try{const j=await call('whoami');setIdentity(token(),j.display_name);showLoggedIn(j.display_name)}catch{clearIdentity();showLoggedOut()}}
  async function loadMessages(quiet=false){try{const j=await call('list');const box=$('nwtbMessages'),nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<80;box.innerHTML=(j.messages||[]).map(m=>{if(m.message_type==='route'){const p=m.route_payload||{},count=Array.isArray(p.stops)?p.stops.length:0;return `<div class="nwtb-msg route"><div class="meta"><b>${h(m.display_name)}</b> - ${h(when(m.created_at))}</div><div class="nwtb-route-title">${h(p.title||'NWTB Sales Route')}</div>${m.body?`<div>${h(m.body)}</div>`:''}<div class="nwtb-route-stops">${count} stops${p.miles!=null?` - ${h(p.miles)} miles`:''}${p.minutes!=null?` - ${h(p.minutes)} min`:''}</div><button class="nwtb-load-route" data-route-id="${m.id}">LOAD ROUTE</button></div>`}return `<div class="nwtb-msg"><div class="meta"><b>${h(m.display_name)}</b> - ${h(when(m.created_at))}</div><div>${h(m.body||'')}</div></div>`}).join('');(j.messages||[]).filter(m=>m.message_type==='route').forEach(m=>{const b=box.querySelector(`[data-route-id="${m.id}"]`);if(b)b.onclick=()=>loadSharedRoute(m.route_payload)});if(nearBottom||!quiet)box.scrollTop=box.scrollHeight}catch(e){if(!quiet)$('nwtbChatError').textContent=e.message;if(/expired/i.test(e.message)){clearIdentity();showLoggedOut()}}}
  async function sendText(){const body=$('nwtbMessageText').value.trim();if(!body)return;$('nwtbChatError').textContent='';try{await call('send_text',{body});$('nwtbMessageText').value='';await loadMessages()}catch(e){$('nwtbChatError').textContent=e.message}}
  async function sendRoute(){$('nwtbChatError').textContent='';if(typeof currentRoute==='undefined'||!Array.isArray(currentRoute)||!currentRoute.length){$('nwtbChatError').textContent='Create a route first, then send it.';return}const note=prompt('Optional note for this route:','')??'';const payload={title:'NWTB Sales Route - '+currentRoute.length+' Stops',sent_note:note,route_type:(document.getElementById('routeType')||{}).value||null,radius:(document.getElementById('radius')||{}).value||null,stops:currentRoute};try{await call('send_route',{route_payload:payload});await loadMessages();alert('Route sent to NWTB Chat.')}catch(e){$('nwtbChatError').textContent=e.message}}
  function loadSharedRoute(p){if(!p||!Array.isArray(p.stops)||!p.stops.length)return alert('This route has no stops.');currentRoute=p.stops.map(s=>({...s}));currentMapLinks=mapsLinks(currentRoute);if(typeof renderRoute==='function')renderRoute(currentRoute,{shared:true});panel.classList.remove('open');const out=document.getElementById('output');window.scrollTo({top:out.offsetTop-20,behavior:'smooth'})}
  btn.onclick=()=>{panel.classList.toggle('open');if(panel.classList.contains('open'))restore()};$('nwtbChatClose').onclick=()=>panel.classList.remove('open');$('nwtbLoginBtn').onclick=login;$('nwtbEmpNo').addEventListener('keydown',e=>{if(e.key==='Enter')login()});$('nwtbSendMsg').onclick=sendText;$('nwtbSendRoute').onclick=sendRoute;$('nwtbMessageText').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendText()}});$('nwtbLogoutBtn').onclick=async()=>{try{await call('logout')}catch{}clearIdentity();showLoggedOut()};

  const visitMap=new Map();
  function accountKey(a){const cn=String(a?.customerNumber||'').trim();if(cn)return 'CUST:'+cn;return 'ADDR:'+String(a?.name||'').trim().toUpperCase()+'|'+String(a?.address||'').trim().toUpperCase()}
  function statusLabel(s){return s==='FOLLOW_UP'?'VISITED — FOLLOW UP':s==='DO_NOT_ROUTE'?'VISITED — DO NOT ROUTE':s==='NOT_A_FIT'?'NOT A FIT / DO NOT CALL':'NOT VISITED'}
  function statusClass(s){return s==='FOLLOW_UP'?'vs-follow':s==='DO_NOT_ROUTE'||s==='NOT_A_FIT'?'vs-stop':s==='NOT_VISITED'?'vs-not':'vs-done'}
  async function refreshVisitMap(){try{const j=await call('visit_list');visitMap.clear();(j.statuses||[]).forEach(x=>visitMap.set(x.account_key,x.status));if(Array.isArray(window.accounts))window.accounts.forEach(a=>a.visitStatus=visitMap.get(accountKey(a))||'NOT_VISITED')}catch(e){console.warn('Visit status load failed',e)}}
  window.nwtbRefreshVisitMap=refreshVisitMap;

  function addFollowToggle(){if(document.getElementById('includeFollowUps'))return;const rt=document.getElementById('routeType');if(!rt)return;const p=rt.closest('.panel');if(!p)return;const div=document.createElement('div');div.className='follow-toggle';div.innerHTML='<label style="font-weight:700"><input id="includeFollowUps" type="checkbox"> Include VISITED — FOLLOW UP prospects</label>';p.appendChild(div)}
  addFollowToggle();

  const oldBuild=window.buildRoute;
  if(typeof oldBuild==='function')window.buildRoute=async function(){await refreshVisitMap();const t=document.getElementById('routeType')?.value;const includeFollow=document.getElementById('includeFollowUps')?.checked;const saved=window.accounts.map(a=>({a,routeEligible:a.routeEligible}));window.accounts.forEach(a=>{if(a.broadType==='PROSPECT'){const s=visitMap.get(accountKey(a))||'NOT_VISITED';a.visitStatus=s;if(s==='DO_NOT_ROUTE'||s==='NOT_A_FIT')a.routeEligible=false;else if((t==='new_business'||t==='prospects_regular')&&s==='FOLLOW_UP'&&!includeFollow)a.routeEligible=false;else if((t==='new_business'||t==='prospects_regular')&&s!=='NOT_VISITED'&&s!=='FOLLOW_UP')a.routeEligible=false}});try{return await oldBuild()}finally{saved.forEach(x=>x.a.routeEligible=x.routeEligible)}};

  const oldBoost=window.boost;
  if(typeof oldBoost==='function')window.boost=function(a,t){let b=oldBoost(a,t);const s=visitMap.get(accountKey(a))||'NOT_VISITED';if(s==='FOLLOW_UP')b-=700;return b};

  const oldRender=window.renderRoute;
  if(typeof oldRender==='function')window.renderRoute=function(order,meta={}){order.forEach(a=>a.visitStatus=visitMap.get(accountKey(a))||a.visitStatus||'NOT_VISITED');oldRender(order,meta);const table=document.querySelector('#output table');if(!table)return;const rows=table.querySelectorAll('tr');if(rows[0]){const th=document.createElement('th');th.textContent='Visit Status';rows[0].insertBefore(th,rows[0].lastElementChild)}order.forEach((a,i)=>{const tr=rows[i+1];if(!tr)return;const td=document.createElement('td');const s=a.visitStatus||'NOT_VISITED';td.innerHTML=`<span class="visitstatus ${statusClass(s)}">${h(statusLabel(s))}</span>`;tr.insertBefore(td,tr.lastElementChild)})};

  const oldShowCard=window.showCard;
  if(typeof oldShowCard==='function')window.showCard=async function(i){
    oldShowCard(i);
    const a=currentRoute[i];if(!a||a.broadType!=='PROSPECT')return;
    const key=accountKey(a);let v=null;
    try{const j=await call('visit_get',{account_key:key});v=j.visit}catch{}
    const s=v?.status||visitMap.get(key)||'NOT_VISITED';const body=document.querySelector('#modal .modal-body');if(!body)return;
    const old=body.querySelector('.visitbox');if(old)old.remove();
    const box=document.createElement('div');box.className='visitbox';
    box.innerHTML=`<h3>VISIT STATUS</h3><div><span id="cardVisitStatus" class="visitstatus ${statusClass(s)}">${h(statusLabel(s))}</span></div><div class="visit-note" id="cardVisitMeta">${v?.updated_by_name?`Last changed by ${h(v.updated_by_name)} • ${h(when(v.updated_at))}`:'No visit recorded yet.'}${v?.note?`<br><b>Note:</b> ${h(v.note)}`:''}</div><div class="visit-actions"><button data-vs="NOT_VISITED">NOT VISITED</button><button data-vs="FOLLOW_UP">FOLLOW UP</button><button data-vs="DO_NOT_ROUTE">DO NOT ROUTE</button><button data-vs="NOT_A_FIT">NOT A FIT</button></div><div class="small" style="margin-top:8px">Employee number is optional. If you are signed into CHAT, your name is recorded automatically.</div>`;
    body.insertBefore(box,body.firstChild.nextSibling);
    box.querySelectorAll('[data-vs]').forEach(b=>b.addEventListener('click',async()=>{
      const ns=b.getAttribute('data-vs');
      let optionalEmployee='';
      if(!token()){
        const entered=prompt('Optional 4-digit employee number. Leave blank to save without a name:','');
        if(entered===null)return;
        optionalEmployee=entered.trim();
        if(optionalEmployee&&!/^\d{4}$/.test(optionalEmployee)){alert('Employee number must be 4 digits, or leave it blank.');return}
      }
      const note=prompt('Optional visit note:',v?.note||'');if(note===null)return;
      try{
        const j=await call('visit_set',{account_key:key,name:a.name,address:a.address,status:ns,note,employee_number:optionalEmployee});
        visitMap.set(key,ns);a.visitStatus=ns;v=j.visit;
        document.getElementById('cardVisitStatus').className='visitstatus '+statusClass(ns);document.getElementById('cardVisitStatus').textContent=statusLabel(ns);
        document.getElementById('cardVisitMeta').innerHTML=`Last changed by ${h(v.updated_by_name)} • ${h(when(v.updated_at))}${v.note?`<br><b>Note:</b> ${h(v.note)}`:''}`;
        if(ns==='DO_NOT_ROUTE'||ns==='NOT_A_FIT')alert('Saved. This prospect will be excluded from future routes.');
        else if(ns==='FOLLOW_UP')alert('Saved. This prospect is now FOLLOW UP and will not appear in normal New Business routes unless Include Follow-Up Prospects is checked.');
        else alert('Saved. This prospect is eligible for normal New Business routing again.');
        if(typeof renderRoute==='function')renderRoute(currentRoute,{shared:false});
      }catch(e){alert(e.message)}
    }))
  };

  setTimeout(refreshVisitMap,800);
})();