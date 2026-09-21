(() => {
  const API='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-chat';
  const APIKEY='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
  const $=id=>document.getElementById(id);
  const token=()=>localStorage.getItem('nwtb_chat_token')||'';
  const h=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const when=s=>{const d=new Date(s);return isNaN(d)?'':d.toLocaleString()};
  let chatTimer=null;
  const visitMap=new Map();

  // FINAL 2026-09-21 FAIL-CLOSED LOCATION AUDIT.
  // Prospects keep the completed prospect audit gate.
  // GO FIRST existing customers use the completed 42-account audit.
  const auditNorm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  const auditKey=a=>auditNorm(a?.name)+'|'+auditNorm(a?.address);

  const COMMERCIAL_PROSPECT_KEYS=new Set([
    'ROGUE CARRIER INC|1312 MARQUETTE DR UNIT E ROMEOVILLE IL 60446',
    'BSL EXPRESS TRUCKING INC|1316 MARQUETTE DR ROMEOVILLE IL 60446',
    'TRUCK SERVICE POINT TRAILER SHOP|110 ANTON DR ROMEOVILLE IL 60446',
    'WILL COUNTY TRAILER REPAIR|1337 N ABBOTT RD ROMEOVILLE IL 60446',
    'BESTDRIVE COMMERCIAL TIRE CENTER|595 E S FRONTAGE RD BOLINGBROOK IL 60440',
    'CENTRAL FLEET REPAIR|675 PHELPS AVE ROMEOVILLE IL 60446',
    'GO NEAL LOGISTICS INC|1352 ENTERPRISE DR UNIT A ROMEOVILLE IL 60446',
    'TRANS QUALITY INC|465 CROSSROADS PKWY BOLINGBROOK IL 60440',
    'SELECT ONE INC|215 REMINGTON BLVD SUITE C BOLINGBROOK IL 60440',
    'USA LOGISTICS INC|3550 HOBSON RD STE 104 WOODRIDGE IL 60517',
    'INNOVATIVE INTERMODAL INC|940 S FRONTAGE RD SUITE 2000 WOODRIDGE IL 60517',
    'ALTEX TRANSPORTATION INC|11295 LEMONT RD LEMONT IL 60439',
    'AMERO LINE LLC|13769 MAIN ST SUITE 102 LEMONT IL 60439',
    'ASAP TRANS CORP|15120 E 127TH ST LEMONT IL 60439',
    'MARK IT EXPRESS LOGISTICS LLC|13555 MAIN ST LEMONT IL 60439',
    'BENTOS INC|400 N SCHMIDT RD SUITE 206 BOLINGBROOK IL 60440',
    'HEGELMANN USA|1124 WINDHAM PKWY ROMEOVILLE IL 60446',
    'KOROL TRUCKING INC|1336 ENTERPRISE DR UNIT 107 ROMEOVILLE IL 60446',
    'DAB TRUCKING SERVICES COMPANY|1407 CATON FARM RD LOCKPORT IL 60441',
    'ROLAND MACHINERY|220 E S FRONTAGE RD BOLINGBROOK IL 60440',
    'JRV LOGISTICS|1000 S HAMILTON ST STE G LOCKPORT IL 60441',
    'CLASSIC HEAVY DUTY TOWING|10119 CLOW CREEK RD B PLAINFIELD IL 60585',
    'WOLFDOM EXPRESS INC|1999 75TH ST UNIT 200 WOODRIDGE IL 60517',
    'EDWARD DON COMPANY LLC|9801 ADAM DON PKWY WOODRIDGE IL 60517',
    'FLYWAY SERVICE LLC|19464 W ARPT RD ROMEOVILLE IL 60446',
    'LNG HOLDING LOAD N GO INC|534 TERRITORIAL DR STE B BOLINGBROOK IL 60440',
    'U K A TRANSPORTATION LLC|125 W BOUGHTON RD BOLINGBROOK IL 60440',
    'PRESTIGE HAULING|13769 MAIN ST 110 LEMONT IL 60439',
    'TFORCE WORLDWIDE|1000 WINDHAM PKWY ROMEOVILLE IL 60446',
    'F T TRANSPORT CORP|101 ROYCE RD 18 BOLINGBROOK IL 60440',
    'DIJ CORP|1300 LAKEVIEW DR ROMEOVILLE IL 60446',
    'GREAT DANE CHICAGO|699 E S FRONTAGE RD BOLINGBROOK IL 60440',
    'HURSTHOUSE LANDSCAPE|751 N BOLINGBROOK DR 21 BOLINGBROOK IL 60440'
  ]);

  const RESIDENTIAL_ADDRESS_PARTS=[
    '1381 LILY CACHE LN','1373 LILY CACHE LN','2044 KENTLAND DR','208 BELMONT DR',
    '1763 RUDOLPH CT','288 HERITAGE PKWY','648 ASPEN DR','104 WILLIAMSBURG LN','1799 HELEN DR'
  ];

  const ADDRESS_OVERRIDES=new Map(Object.entries({
    '21267':{address:'1802 N Division St, Suite 304, Morris, IL 60450',lat:41.37691,lon:-88.422801,note:'VANNER current carrier location'},
    '11058':{address:'18202 W Union Rd, Union, IL 60180',lat:42.2342823,lon:-88.5523231,note:'INTREN current headquarters'},
    '27388':{address:'75 Executive Dr, Suite 441, Aurora, IL 60504',lat:41.7563751,lon:-88.2185473,note:'AZSAFI current carrier location'},
    '20672':{address:'1730 Park St, Suite 202, Naperville, IL 60563',lat:41.7998,lon:-88.1482,note:'MARTIAN EXPRESS current carrier location'},
    '26334':{address:'1200 Knell Rd, Montgomery, IL 60538',note:'SUNWAY current carrier/office location'},
    '10366':{address:'145 Tower Dr, Unit 12, Burr Ridge, IL 60527',lat:41.7617846,lon:-87.9119959,note:'CARGO RUNNER current carrier location'},
    '25846':{address:'4699 Auvergne Ave, Unit 7, Lisle, IL 60532',lat:41.8019244,lon:-88.0604841,note:'UBN LOGISTICS corrected commercial location'},
    '11935':{address:'850 Windham Pkwy, Bolingbrook, IL 60440',note:'ROADRUNNER current Chicago service center'},
    '22663':{address:'721 Parkwood Ave, Suite D, Romeoville, IL 60446',lat:41.656179,lon:-88.075574,note:'ROAD KING canonical route stop'},
    '27727':{address:'10S530 Thames Dr, Downers Grove, IL 60516',note:'UZB current residential registration'},
    '11771':{address:'1024 Brentwood Cir, Buffalo Grove, IL 60089',note:'PJ TWINS current residential registration'},
    '18153':{address:'2451 Sharon Ct, Naperville, IL 60565',note:'AFF TRANS current residential registration'},
    '11252':{address:'672 Banbury Way, Bolingbrook, IL 60440',note:'KZ EXPRESS current residential registration'},
    '16106':{address:'1226 N Webster St, Naperville, IL 60563',note:'US TRANS ONE current residential registration'},
    '12635':{address:'25015 Edison Ln, Plainfield, IL 60585',note:'GN EXPRESS current residential registration'},
    '12039':{address:'1738 Irish Indian Trail, Joliet, IL 60436',lat:41.4900651,lon:-88.1403365,note:'SCHWARZ current HQ; duplicate record remains suppressed'},
    '12038':{address:'1738 Irish Indian Trail, Joliet, IL 60436',lat:41.4900651,lon:-88.1403365,note:'SCHWARZ duplicate record; suppressed'},
    '25941':{address:'721 Parkwood Ave, Suite D, Romeoville, IL 60446',lat:41.656179,lon:-88.075574,note:'ROAD KING duplicate record; suppressed'}
  }));

  const COMMERCIAL_GO_FIRST_EXISTING_IDS=new Set([
    '21267','17772','11058','28276','28369','22663','20779','15491','20507','23325',
    '16350','27388','18091','20672','26334','19079','10366','11914','25846','26781',
    '11179','11935','24881','15474','11395','15096','12389','26423','11218','21986'
  ]);
  const RESIDENTIAL_GO_FIRST_EXISTING_IDS=new Set([
    '27727','11771','23016','18153','11252','26145','17219','16106','25606','12635','25909','25817'
  ]);
  const HOLD_GO_FIRST_EXISTING_IDS=new Set();
  const DUPLICATE_SUPPRESS_IDS=new Set(['25941','12038','12039']);

  function applyAddressOverrides(){
    try{
      accounts.forEach(a=>{
        const id=String(a?.customerNumber||'').trim();
        const o=ADDRESS_OVERRIDES.get(id);
        if(!o)return;
        if(!a.originalAddress)a.originalAddress=a.address;
        a.address=o.address;
        if(Number.isFinite(o.lat)){a.lat=o.lat;a.lon=o.lon}
        a.auditAddressCorrected=true;
        a.auditLocationNote=o.note;
      });
    }catch{}
  }

  // Google Maps launchers use recognizable business name + full address.
  // Road optimization still uses coordinates separately.
  window.enc=function(x){
    const name=String(x?.name||'').trim(),address=String(x?.address||'').trim();
    if(name&&address)return encodeURIComponent(`${name}, ${address}`);
    if(address)return encodeURIComponent(address);
    if(name)return encodeURIComponent(name);
    const lat=Number(x?.lat),lon=Number(x?.lon);
    return Number.isFinite(lat)&&Number.isFinite(lon)?encodeURIComponent(`${lat.toFixed(6)},${lon.toFixed(6)}`):'';
  };

  // Clear Google Maps labels. Desktop opens a route preview; a phone can hand the
  // same URL to the Google Maps app for turn-by-turn navigation.
  window.mapsLinks=function(order){
    const out=[];
    if(order.length<=9){
      out.push({
        label:'OPEN IN GOOGLE MAPS — FULL ROUND TRIP + RETURN TO NWTB',
        url:`https://www.google.com/maps/dir/?api=1&origin=${enc(depot)}&destination=${enc(depot)}&travelmode=driving&dir_action=navigate&waypoints=${order.map(enc).join('%7C')}`
      });
      return out;
    }
    let i=0,start=depot,part=1;
    while(i<order.length){
      const take=Math.min(9,order.length-i),chunk=order.slice(i,i+take),last=i+take>=order.length;
      const dest=last?depot:chunk[chunk.length-1],wps=last?chunk:chunk.slice(0,-1);
      out.push({
        label:last
          ?`PART ${part} — OPEN IN GOOGLE MAPS — STOPS ${i+1}-${i+take} + RETURN TO NWTB`
          :`PART ${part} — OPEN IN GOOGLE MAPS — STOPS ${i+1}-${i+take}`,
        url:`https://www.google.com/maps/dir/?api=1&origin=${enc(start)}&destination=${enc(dest)}&travelmode=driving&dir_action=navigate${wps.length?'&waypoints='+wps.map(enc).join('%7C'):''}`
      });
      start=dest;i+=take;part++;
    }
    return out;
  };

  function locationStatus(a){
    if(a?.broadType==='PROSPECT'){
      const addr=auditNorm(a?.address);
      if(RESIDENTIAL_ADDRESS_PARTS.some(x=>addr.includes(auditNorm(x))))return 'RESIDENTIAL_DO_NOT_ROUTE';
      if(COMMERCIAL_PROSPECT_KEYS.has(auditKey(a)))return 'COMMERCIAL_ROUTE_OK';
      return 'UNCERTAIN_HOLD';
    }
    if(a?.layer==='GO FIRST'&&a?.broadType==='EXISTING CUSTOMER'){
      const id=String(a?.customerNumber||'').trim();
      if(DUPLICATE_SUPPRESS_IDS.has(id))return 'DUPLICATE_SUPPRESSED';
      if(RESIDENTIAL_GO_FIRST_EXISTING_IDS.has(id))return 'RESIDENTIAL_DO_NOT_ROUTE';
      if(COMMERCIAL_GO_FIRST_EXISTING_IDS.has(id))return 'COMMERCIAL_ROUTE_OK';
      if(HOLD_GO_FIRST_EXISTING_IDS.has(id))return 'UNCERTAIN_HOLD';
      return 'UNCERTAIN_HOLD';
    }
    return 'NOT_APPLICABLE';
  }
  function locationLabel(s){
    return s==='COMMERCIAL_ROUTE_OK'?'COMMERCIAL — ROUTE OK':
      s==='RESIDENTIAL_DO_NOT_ROUTE'?'RESIDENTIAL — DO NOT ROUTE':
      s==='DUPLICATE_SUPPRESSED'?'DUPLICATE — DO NOT ROUTE':
      s==='UNCERTAIN_HOLD'?'UNCERTAIN — HOLD':'NOT YET AUDITED';
  }
  function locationClass(s){return s==='COMMERCIAL_ROUTE_OK'?'loc-ok':s==='RESIDENTIAL_DO_NOT_ROUTE'||s==='DUPLICATE_SUPPRESSED'?'loc-stop':'loc-hold'}
  function isLocationAuditedGroup(a){return a?.broadType==='PROSPECT'||(a?.layer==='GO FIRST'&&a?.broadType==='EXISTING CUSTOMER')}

  function enforceLocationVerification(){
    try{
      applyAddressOverrides();
      accounts.forEach(a=>{
        if(!isLocationAuditedGroup(a))return;
        const s=locationStatus(a);
        a.locationVerification=locationLabel(s);
        if(s!=='COMMERCIAL_ROUTE_OK')a.routeEligible=false;
      });
      updateAuditNotice();
      updateSafeStats();
    }catch{}
  }

  function updateSafeStats(){
    try{
      const usable=accounts.filter(a=>a.routeEligible);
      const go=usable.filter(a=>a.layer==='GO FIRST');
      const goExist=go.filter(a=>a.broadType==='EXISTING CUSTOMER').length;
      const goPros=go.filter(a=>a.broadType==='PROSPECT').length;
      if($('statGo'))$('statGo').textContent=go.length;
      if($('statGoSub'))$('statGoSub').textContent=`${goExist} existing • ${goPros} new potential`;
      if($('statPros'))$('statPros').textContent=usable.filter(a=>a.layer==='VERIFIED PROSPECTS').length;
      if($('statWin'))$('statWin').textContent=usable.filter(a=>a.layer==='WIN-BACK CUSTOMERS').length;
      if($('statActive'))$('statActive').textContent=usable.filter(a=>a.layer==='ACTIVE CUSTOMERS').length;
      if($('statTotal'))$('statTotal').textContent=usable.length;
    }catch{}
  }

  function updateAuditNotice(){
    try{
      const p=accounts.filter(a=>a.broadType==='PROSPECT');
      const pc=p.filter(a=>locationStatus(a)==='COMMERCIAL_ROUTE_OK').length;
      const pr=p.filter(a=>locationStatus(a)==='RESIDENTIAL_DO_NOT_ROUTE').length;
      const ph=p.filter(a=>locationStatus(a)==='UNCERTAIN_HOLD').length;
      const ge=accounts.filter(a=>a.layer==='GO FIRST'&&a.broadType==='EXISTING CUSTOMER'&&!DUPLICATE_SUPPRESS_IDS.has(String(a.customerNumber||'')));
      const gec=ge.filter(a=>locationStatus(a)==='COMMERCIAL_ROUTE_OK').length;
      const ger=ge.filter(a=>locationStatus(a)==='RESIDENTIAL_DO_NOT_ROUTE').length;
      const geh=ge.filter(a=>locationStatus(a)==='UNCERTAIN_HOLD').length;
      const n=$('safetyNotice');
      if(n)n.innerHTML=`<b>LOCATION SAFETY GATE:</b> Prospects: ${pc} commercial approved • ${pr} residential blocked • ${ph} hold. GO FIRST existing audit: ${gec} commercial approved • ${ger} residential blocked • ${geh} hold. Duplicate customer records stay suppressed. <b>Only audited commercial records in these groups can route.</b>`;
    }catch{}
  }

  const css=`
  button[onclick="openRouteXLAllStops()"]{display:none!important}
  #nwtbChatBtn{position:fixed;right:22px;bottom:22px;z-index:60;background:#17202a;color:#fff;border:0;border-radius:999px;padding:14px 18px;font-weight:800;box-shadow:0 6px 20px #0004;cursor:pointer}
  #nwtbChatPanel{position:fixed;right:22px;bottom:82px;width:min(420px,calc(100vw - 30px));height:min(650px,calc(100vh - 120px));z-index:59;background:#fff;border:1px solid #cfd6dd;border-radius:14px;box-shadow:0 10px 36px #0005;display:none;overflow:hidden}
  #nwtbChatPanel.open{display:flex;flex-direction:column}.nwtb-chat-head{background:#17202a;color:#fff;padding:13px 15px;display:flex;justify-content:space-between;align-items:center}.nwtb-chat-head button{background:#fff2;color:#fff;padding:6px 9px}.nwtb-chat-login{padding:20px}.nwtb-chat-login input{margin:9px 0}.nwtb-chat-login button{width:100%;background:#17202a;color:#fff}.nwtb-chat-body{display:none;flex:1;min-height:0}.nwtb-chat-body.on{display:flex;flex-direction:column}.nwtb-chat-who{padding:9px 12px;background:#eef2f6;border-bottom:1px solid #d9dee4;font-size:13px}.nwtb-chat-messages{flex:1;overflow:auto;padding:12px;background:#f7f9fb}.nwtb-msg{background:#fff;border:1px solid #d9dee4;border-radius:10px;padding:9px 10px;margin-bottom:9px}.nwtb-msg .meta{font-size:12px;color:#65717c;margin-bottom:5px}.nwtb-msg.route{border-left:5px solid #1a73e8}.nwtb-load-route{background:#1a73e8;color:#fff;padding:8px 10px}.nwtb-chat-send{padding:10px;border-top:1px solid #d9dee4}.nwtb-chat-send textarea{width:100%;height:68px;resize:none;padding:9px;border:1px solid #bcc6cf;border-radius:8px;font:inherit}.nwtb-chat-actions{display:flex;gap:7px;margin-top:7px}.nwtb-chat-actions button{flex:1}.nwtb-send-msg{background:#17202a;color:#fff}.nwtb-send-route{background:#18864b;color:#fff}.nwtb-chat-error{color:#b3261e;font-weight:700;font-size:13px;margin-top:7px}
  .visitbox,.locationbox{margin-top:16px;padding:14px;border:2px solid #d9dee4;border-radius:10px;background:#f8fafb}.visitbox h3,.locationbox h3{margin:0 0 8px}.visitstatus,.locationstatus{display:inline-block;padding:6px 10px;border-radius:999px;font-weight:800;font-size:12px}.vs-not{background:#e7eaee;color:#263238}.vs-follow{background:#fff2b3;color:#6b5500}.vs-stop{background:#ffd9d9;color:#8e1b1b}.loc-ok{background:#d8f3df;color:#0c5d2e}.loc-hold{background:#fff2b3;color:#6b5500}.loc-stop{background:#ffd9d9;color:#8e1b1b}.visit-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}.visit-actions button{padding:9px}.visit-note{margin-top:8px;font-size:12px;color:#52606d}.follow-toggle{margin-top:10px;font-size:13px;font-weight:700}.follow-toggle input{width:auto;margin-right:6px}
  #routeSubFilterWrap{margin-top:12px;max-width:520px;padding:12px;border:1px solid #d9dee4;border-radius:9px;background:#f8fafb}#routeSubFilterWrap label{margin-bottom:6px}#routeSubFilterHelp{margin-top:6px;font-size:12px;color:#5f6b76}`;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  const panel=document.createElement('div');
  panel.id='nwtbChatPanel';
  panel.innerHTML=`<div class="nwtb-chat-head"><b>NWTB CHAT + ROUTES</b><button id="nwtbChatClose">X</button></div><div id="nwtbChatLogin" class="nwtb-chat-login"><b>Enter your 4-digit employee number</b><input id="nwtbEmpNo" inputmode="numeric" maxlength="4" placeholder="0000"><button id="nwtbLoginBtn">ENTER CHAT</button><div id="nwtbLoginError" class="nwtb-chat-error"></div></div><div id="nwtbChatBody" class="nwtb-chat-body"><div class="nwtb-chat-who"><span id="nwtbWho"></span><button id="nwtbLogoutBtn" style="float:right;padding:3px 7px">LOG OUT</button></div><div id="nwtbMessages" class="nwtb-chat-messages"></div><div class="nwtb-chat-send"><textarea id="nwtbMessageText" placeholder="Type a message..."></textarea><div class="nwtb-chat-actions"><button class="nwtb-send-msg" id="nwtbSendMsg">SEND MESSAGE</button><button class="nwtb-send-route" id="nwtbSendRoute">SEND CURRENT ROUTE</button></div><div id="nwtbChatError" class="nwtb-chat-error"></div></div></div>`;
  document.body.appendChild(panel);
  const chatBtn=document.createElement('button');chatBtn.id='nwtbChatBtn';chatBtn.textContent='CHAT';document.body.appendChild(chatBtn);

  async function call(action,data={}){
    const headers={'Content-Type':'application/json','apikey':APIKEY};
    if(token())headers['x-nwtb-session']=token();
    const r=await fetch(API,{method:'POST',headers,body:JSON.stringify({action,...data})});
    let j={};try{j=await r.json()}catch{}
    if(!r.ok)throw new Error(j.error||'Service error');
    return j;
  }
  function setIdentity(t,n){if(t)localStorage.setItem('nwtb_chat_token',t);if(n)localStorage.setItem('nwtb_chat_name',n)}
  function clearIdentity(){localStorage.removeItem('nwtb_chat_token');localStorage.removeItem('nwtb_chat_name')}
  function showLoggedIn(name){$('nwtbChatLogin').style.display='none';$('nwtbChatBody').classList.add('on');$('nwtbWho').textContent='Signed in as '+name;loadMessages();if(chatTimer)clearInterval(chatTimer);chatTimer=setInterval(()=>{if(panel.classList.contains('open'))loadMessages(true)},5000)}
  function showLoggedOut(){$('nwtbChatBody').classList.remove('on');$('nwtbChatLogin').style.display='block';if(chatTimer){clearInterval(chatTimer);chatTimer=null}}
  async function login(){const n=$('nwtbEmpNo').value.trim();$('nwtbLoginError').textContent='';if(!/^\d{4}$/.test(n)){$('nwtbLoginError').textContent='Enter exactly 4 digits.';return}try{const j=await call('login',{employee_number:n});setIdentity(j.token,j.display_name);showLoggedIn(j.display_name)}catch(e){$('nwtbLoginError').textContent=e.message}}
  async function restore(){if(!token())return showLoggedOut();try{const j=await call('whoami');showLoggedIn(j.display_name)}catch{clearIdentity();showLoggedOut()}}
  async function loadMessages(quiet=false){
    try{
      const j=await call('list'),box=$('nwtbMessages');
      box.innerHTML=(j.messages||[]).map(m=>m.message_type==='route'?`<div class="nwtb-msg route"><div class="meta"><b>${h(m.display_name)}</b> - ${h(when(m.created_at))}</div><b>${h(m.route_payload?.title||'NWTB Sales Route')}</b><div>${(m.route_payload?.stops||[]).length} stops</div><button class="nwtb-load-route" data-id="${m.id}">LOAD ROUTE</button></div>`:`<div class="nwtb-msg"><div class="meta"><b>${h(m.display_name)}</b> - ${h(when(m.created_at))}</div>${h(m.body||'')}</div>`).join('');
      (j.messages||[]).filter(m=>m.message_type==='route').forEach(m=>{const b=box.querySelector(`[data-id="${m.id}"]`);if(b)b.onclick=()=>{currentRoute=(m.route_payload?.stops||[]).map(s=>({...s}));renderRoute(currentRoute,{shared:true});panel.classList.remove('open')}});
      if(!quiet)box.scrollTop=box.scrollHeight;
    }catch(e){if(!quiet)$('nwtbChatError').textContent=e.message}
  }
  async function sendText(){const body=$('nwtbMessageText').value.trim();if(!body)return;try{await call('send_text',{body});$('nwtbMessageText').value='';loadMessages()}catch(e){$('nwtbChatError').textContent=e.message}}
  async function sendRoute(){if(!currentRoute?.length){$('nwtbChatError').textContent='Create a route first.';return}try{await call('send_route',{route_payload:{title:'NWTB Sales Route - '+currentRoute.length+' Stops',stops:currentRoute,route_type:$('routeType')?.value||null,route_subtype:$('routeSubFilter')?.value||null,radius:$('radius')?.value||null}});loadMessages();alert('Route sent to NWTB Chat.')}catch(e){$('nwtbChatError').textContent=e.message}}

  chatBtn.onclick=()=>{panel.classList.toggle('open');if(panel.classList.contains('open'))restore()};
  $('nwtbChatClose').onclick=()=>panel.classList.remove('open');
  $('nwtbLoginBtn').onclick=login;
  $('nwtbEmpNo').onkeydown=e=>{if(e.key==='Enter')login()};
  $('nwtbSendMsg').onclick=sendText;
  $('nwtbSendRoute').onclick=sendRoute;
  $('nwtbLogoutBtn').onclick=async()=>{try{await call('logout')}catch{}clearIdentity();showLoggedOut()};

  function accountKey(a){const cn=String(a?.customerNumber||'').trim();return cn?'CUST:'+cn:'ADDR:'+String(a?.name||'').trim().toUpperCase()+'|'+String(a?.address||'').trim().toUpperCase()}
  function statusLabel(s){return s==='FOLLOW_UP'?'VISITED — FOLLOW UP':s==='DO_NOT_ROUTE'?'VISITED — DO NOT ROUTE':s==='NOT_A_FIT'?'NOT A FIT / DO NOT CALL':'NOT VISITED'}
  function statusClass(s){return s==='FOLLOW_UP'?'vs-follow':(s==='DO_NOT_ROUTE'||s==='NOT_A_FIT')?'vs-stop':'vs-not'}
  async function refreshVisitMap(){try{const j=await call('visit_list');visitMap.clear();(j.statuses||[]).forEach(x=>visitMap.set(x.account_key,x.status));accounts.forEach(a=>a.visitStatus=visitMap.get(accountKey(a))||'NOT_VISITED');enforceLocationVerification()}catch(e){console.warn(e)}}
  function waitForAccounts(tries=0){try{if(accounts?.length){enforceLocationVerification();refreshVisitMap();return}}catch{}if(tries<30)setTimeout(()=>waitForAccounts(tries+1),200)}
  waitForAccounts();

  // SIMPLIFIED SALES-DAY UI: five main choices with contextual subfilters.
  const routeType=$('routeType');
  if(routeType){
    const previous=routeType.value;
    routeType.innerHTML=`
      <option value="new_business">NEW BUSINESS — Find New Customers</option>
      <option value="go_first">GO FIRST — Highest Priority Accounts</option>
      <option value="winback">WIN-BACK — Recover Lost Business</option>
      <option value="existing">EXISTING CUSTOMERS — Protect & Grow</option>
      <option value="mixed">BEST OVERALL ROUTE — Mix Everything</option>`;
    if(['new_business','go_first','winback','existing','mixed'].includes(previous))routeType.value=previous;
  }

  let subWrap=$('routeSubFilterWrap');
  if(!subWrap&&routeType){
    subWrap=document.createElement('div');
    subWrap.id='routeSubFilterWrap';
    subWrap.innerHTML='<label id="routeSubFilterLabel" for="routeSubFilter">Prospect Type</label><select id="routeSubFilter"></select><div id="routeSubFilterHelp"></div>';
    const controls=routeType.closest('.controls');
    controls?.insertAdjacentElement('afterend',subWrap);
  }

  function refreshSubFilter(){
    const t=routeType?.value,wrap=$('routeSubFilterWrap'),sel=$('routeSubFilter'),lab=$('routeSubFilterLabel'),help=$('routeSubFilterHelp');
    if(!wrap||!sel)return;
    if(t==='new_business'){
      wrap.style.display='block';
      lab.textContent='Prospect Type';
      sel.innerHTML='<option value="all_prospects">All Prospects — Efficiency First</option><option value="go_first_prospects">GO FIRST Prospects Only</option><option value="regular_prospects">Regular Verified Prospects Only</option>';
      help.textContent='NEW BUSINESS is efficiency-first: color does not override the shortest practical driving route. Every route starts and finishes at Northwest Trucks – Bolingbrook.';
    }else if(t==='existing'){
      wrap.style.display='block';
      lab.textContent='Customer Type';
      sel.innerHTML='<option value="all_existing">All Existing Customers</option><option value="go_first_existing">GO FIRST Existing Customers Only</option><option value="winback_existing">Win-Back Customers Only</option><option value="active_existing">Active Customers Only</option>';
      help.textContent='All Existing includes GREEN GO FIRST existing, ORANGE Win-Back, and BLUE Active customers.';
    }else{
      wrap.style.display='none';
      sel.innerHTML='';
      help.textContent='';
    }
  }
  routeType?.addEventListener('change',refreshSubFilter);
  refreshSubFilter();

  if(!document.getElementById('includeFollowUps')){
    const div=document.createElement('div');div.className='follow-toggle';
    div.innerHTML='<label><input id="includeFollowUps" type="checkbox"> Include VISITED — FOLLOW UP prospects</label>';
    routeType?.closest('.panel')?.appendChild(div);
  }

  function applySubFilter(cand,t){
    const sub=$('routeSubFilter')?.value||'';
    if(t==='new_business'){
      if(sub==='go_first_prospects')return cand.filter(a=>a.broadType==='PROSPECT'&&a.layer==='GO FIRST');
      if(sub==='regular_prospects')return cand.filter(a=>a.broadType==='PROSPECT'&&a.layer==='VERIFIED PROSPECTS');
      return cand.filter(a=>a.broadType==='PROSPECT');
    }
    if(t==='existing'){
      if(sub==='go_first_existing')return cand.filter(a=>a.broadType==='EXISTING CUSTOMER'&&a.layer==='GO FIRST');
      if(sub==='winback_existing')return cand.filter(a=>a.broadType==='EXISTING CUSTOMER'&&a.layer==='WIN-BACK CUSTOMERS');
      if(sub==='active_existing')return cand.filter(a=>a.broadType==='EXISTING CUSTOMER'&&a.layer==='ACTIVE CUSTOMERS');
      return cand.filter(a=>a.broadType==='EXISTING CUSTOMER');
    }
    return cand;
  }

  // Efficiency-first subset selection for NEW BUSINESS.
  // It chooses the requested customer stops by the smallest added ROAD travel time
  // in a round trip that begins and ends at NWTB. Red/Purple status is not used
  // as a distance penalty, so priority color cannot force a wasteful drive.
  async function selectEfficientNewBusiness(cand,n){
    if(cand.length<=n)return cand.slice();
    try{
      const pts=[depot,...cand];
      const coords=pts.map(p=>`${p.lon},${p.lat}`).join(';');
      const matrix=await osrm(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration`);
      if(matrix.code!=='Ok'||!matrix.durations)throw new Error('Road matrix unavailable');
      const m=matrix.durations,remaining=new Set(Array.from({length:cand.length},(_,i)=>i+1));
      const tour=[0,0];
      while(tour.length-2<n&&remaining.size){
        let bestIdx=null,bestPos=null,bestDelta=Infinity;
        for(const idx of remaining){
          for(let pos=0;pos<tour.length-1;pos++){
            const a=tour[pos],b=tour[pos+1],ab=m[a]?.[b],ai=m[a]?.[idx],ib=m[idx]?.[b];
            if(ab==null||ai==null||ib==null)continue;
            const delta=ai+ib-ab;
            if(delta<bestDelta){bestDelta=delta;bestIdx=idx;bestPos=pos+1}
          }
        }
        if(bestIdx==null)break;
        tour.splice(bestPos,0,bestIdx);
        remaining.delete(bestIdx);
      }
      const chosen=tour.slice(1,-1).map(i=>cand[i-1]);
      if(chosen.length===n)return chosen;
    }catch(e){console.warn('Efficiency-first selection fallback:',e)}
    return cand.slice().sort((a,b)=>miles(depot,a)-miles(depot,b)).slice(0,n);
  }

  // Make the return to Northwest Trucks visible as the final stop in every route.
  const baseRenderRoute=window.renderRoute;
  window.renderRoute=function(order,meta={}){
    baseRenderRoute(order,meta);
    try{
      const out=$('output'),notice=out?.querySelector('.notice'),table=out?.querySelector('table');
      if(notice){
        const efficiency=meta.efficiencyFirst?' <b>NEW BUSINESS RULE:</b> Customer selection is efficiency-first.':'';
        notice.innerHTML+=`<br><b>ROUND TRIP:</b> Start at Northwest Trucks – Bolingbrook → customer stops → <b>FINAL STOP: Northwest Trucks – Bolingbrook</b>.${efficiency}<br><b>GOOGLE MAPS:</b> On a desktop, each button opens a route preview. On a phone, open the button in the Google Maps app for turn-by-turn navigation. If the route has multiple PARTS, run them in order; the final PART returns to NWTB.`;
      }
      if(table&&!table.querySelector('[data-nwtb-return="1"]')){
        const tr=document.createElement('tr');
        tr.dataset.nwtbReturn='1';
        tr.innerHTML=`<td>${order.length+1}</td><td><b>Northwest Trucks – Bolingbrook</b><div class="small">${h(depot.address)}</div></td><td><span class="badge blue">RETURN TO BASE</span></td><td>—</td><td><b>FINAL STOP</b></td><td>Return to NWTB</td>`;
        table.appendChild(tr);
      }
    }catch(e){console.warn(e)}
  };

  window.buildRoute=async function(){
    enforceLocationVerification();
    const out=$('output'),t=$('routeType').value,r=+$('radius').value,includeFollow=$('includeFollowUps')?.checked;
    let n=Math.max(1,Math.min(25,+$('stopCount').value||10));
    let cand=accounts.filter(a=>a.routeEligible)
      .filter(a=>!isLocationAuditedGroup(a)||locationStatus(a)==='COMMERCIAL_ROUTE_OK')
      .filter(filterFn(t))
      .filter(a=>r>=999||miles(depot,a)<=r);
    cand=applySubFilter(cand,t);
    cand=cand.filter(a=>{
      if(a.broadType!=='PROSPECT')return true;
      const s=visitMap.get(accountKey(a))||a.visitStatus||'NOT_VISITED';
      if(s==='DO_NOT_ROUTE'||s==='NOT_A_FIT')return false;
      if(t==='new_business'&&s==='FOLLOW_UP'&&!includeFollow)return false;
      return true;
    });
    if(!cand.length){alert('No eligible audited-commercial accounts matched these filters.');return}
    n=Math.min(n,cand.length);
    out.style.display='block';out.innerHTML='<b>Choosing the most efficient customer group and optimizing the road route...</b>';
    try{
      let sel;
      if(t==='new_business')sel=await selectEfficientNewBusiness(cand,n);
      else if(t==='mixed')sel=selectMixed(cand,n);
      else sel=selectCluster(cand,n,t);
      const j=await optimize(sel);
      renderRoute(j.order.map(i=>sel[i]),{miles:j.miles,minutes:j.minutes,efficiencyFirst:t==='new_business'});
    }catch(e){out.innerHTML=`<div class="notice"><b>ROUTE NOT CREATED:</b> ${esc(e.message||e)}</div>`}
  };

  const baseShowCard=window.showCard;
  window.showCard=async function(i){
    baseShowCard(i);
    const a=currentRoute[i];
    if(!a)return;
    const body=document.querySelector('#modal .modal-body');if(!body)return;
    body.querySelector('.locationbox')?.remove();
    body.querySelector('.visitbox')?.remove();

    if(isLocationAuditedGroup(a)){
      const loc=locationStatus(a),lbox=document.createElement('div');
      lbox.className='locationbox';
      const correction=a.auditAddressCorrected&&a.originalAddress&&a.originalAddress!==a.address?`<div class="visit-note"><b>Address corrected:</b> ${h(a.originalAddress)} → ${h(a.address)}</div>`:'';
      const note=a.auditLocationNote?`<div class="visit-note">${h(a.auditLocationNote)}</div>`:'';
      lbox.innerHTML=`<h3>LOCATION VERIFICATION</h3><span class="locationstatus ${locationClass(loc)}">${h(locationLabel(loc))}</span>${correction}${note}<div class="visit-note">Routing is fail-closed for this account group: only audited commercial locations can be selected.</div>`;
      body.insertBefore(lbox,body.children[1]||null);
    }

    if(a.broadType!=='PROSPECT')return;
    const key=accountKey(a);
    let v=null;try{v=(await call('visit_get',{account_key:key})).visit}catch{}
    const s=v?.status||visitMap.get(key)||'NOT_VISITED';
    const lbox=body.querySelector('.locationbox');
    const box=document.createElement('div');box.className='visitbox';
    box.innerHTML=`<h3>VISIT STATUS</h3><span id="cardVisitStatus" class="visitstatus ${statusClass(s)}">${h(statusLabel(s))}</span><div class="visit-note" id="cardVisitMeta">${v?.updated_by_name?`Last changed by ${h(v.updated_by_name)} • ${h(when(v.updated_at))}`:'No visit recorded yet.'}${v?.note?`<br><b>Note:</b> ${h(v.note)}`:''}</div><div class="visit-actions"><button data-vs="NOT_VISITED">NOT VISITED</button><button data-vs="FOLLOW_UP">FOLLOW UP</button><button data-vs="DO_NOT_ROUTE">DO NOT ROUTE</button><button data-vs="NOT_A_FIT">NOT A FIT</button></div><div class="small" style="margin-top:8px">Employee number is optional.</div>`;
    if(lbox)body.insertBefore(box,lbox.nextSibling);else body.insertBefore(box,body.children[1]||null);
    box.querySelectorAll('[data-vs]').forEach(b=>b.onclick=async()=>{
      const ns=b.dataset.vs;let employee='';
      if(!token()){const x=prompt('Optional 4-digit employee number. Leave blank to continue:','');if(x===null)return;employee=x.trim();if(employee&&!/^\d{4}$/.test(employee)){alert('Enter 4 digits or leave blank.');return}}
      const note=prompt('Optional visit note:',v?.note||'');if(note===null)return;
      try{
        v=(await call('visit_set',{account_key:key,name:a.name,address:a.address,status:ns,note,employee_number:employee})).visit;
        visitMap.set(key,ns);a.visitStatus=ns;
        $('cardVisitStatus').className='visitstatus '+statusClass(ns);$('cardVisitStatus').textContent=statusLabel(ns);
        $('cardVisitMeta').innerHTML=`Last changed by ${h(v.updated_by_name)} • ${h(when(v.updated_at))}${v.note?`<br><b>Note:</b> ${h(v.note)}`:''}`;
        alert(ns==='DO_NOT_ROUTE'||ns==='NOT_A_FIT'?'Saved. This prospect will be excluded from future routes.':ns==='FOLLOW_UP'?'Saved as FOLLOW UP.':'Saved.');
      }catch(e){alert(e.message)}
    });
  };
})();

(()=>{
  const s=document.createElement('script');
  s.src='./navigation.js?v=20260921A';
  s.defer=true;
  document.body.appendChild(s);
})();
