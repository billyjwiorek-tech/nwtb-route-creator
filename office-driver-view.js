/* Office observer and explicit PIN override controls. Never creates a Driver session or starts GPS. */
(()=>{
'use strict';
const BASE='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/',PUB='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const stamp=s=>s?new Date(s).toLocaleString('en-US',{timeZone:'America/Chicago'}):'Not reported';
const session=()=>localStorage.getItem('nwtb_delivery_token')||'';
let roster={drivers:[],routes:[]},detail=null,busy=false,selection=0,editing=null,temporaryPin='',pinTimer=null,requestId='',lastSession='',mapOverlay=null,refreshQueued=false,lastChatDriver='',lastRosterAt=0,followDriver=true,podSequence=0;
async function post(body,endpoint='nwtb-office-driver-view'){
 const token=session();if(!token)throw Error('Office is still connecting. Open this screen from NWTB Office.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{const r=await fetch(BASE+endpoint,{method:'POST',cache:'no-store',signal:controller.signal,headers:{'content-type':'application/json','apikey':PUB,'x-nwtb-session':token},body:JSON.stringify(body)}),j=await r.json();if(!r.ok)throw Object.assign(Error(j.error||'Request failed.'),{code:j.code});return j;}finally{clearTimeout(timer);}
}
function visible(){if(document.visibilityState==='hidden')return false;try{return window.frameElement?.closest('.view')?.classList.contains('active')!==false}catch{return false}}
function viewStatus(text,error=false){$('viewStatus').textContent=text;$('viewStatus').className='small'+(error?' error':'');}
function routePhase(r){return !r?'NO ROUTE':r.status==='ACTIVE'&&r.returning_started_at&&!r.returned_at?'RETURNING TO '+(r.end_name||'NWTB '+r.depot):r.status==='PLANNED'?(r.released_to_driver?'RELEASED TO DRIVER':'OFFICE ONLY — NOT RELEASED'):r.status;}
function fillRoutes(preferred){
 const rank=r=>r.status==='ACTIVE'?0:r.status==='PLANNED'?1:2;
 const driver=$('driverSelect').value,rows=roster.routes.filter(r=>r.driver_employee_number===driver).sort((a,b)=>rank(a)-rank(b)||(a.status==='COMPLETED'?String(b.updated_at).localeCompare(String(a.updated_at)):String(a.route_date).localeCompare(String(b.route_date))));
 const keep=preferred===undefined?$('routeSelect').value:preferred;
 $('routeSelect').innerHTML='<option value="">DRIVER — NO ROUTE SELECTED</option>'+rows.map(r=>'<option value="'+esc(r.id)+'">'+esc(routePhase(r)+' • '+r.route_date+' • '+r.depot)+'</option>').join('');
 const active=followDriver&&preferred===undefined?rows.find(r=>r.status==='ACTIVE'):null;
 if(active)$('routeSelect').value=active.id;else if(keep&&rows.some(r=>r.id===keep))$('routeSelect').value=keep;else if(rows.length)$('routeSelect').value=rows[0].id;
}
async function refreshRoster(preferredDriver,preferredRoute){
 const result=await post({action:'roster'}),driver=preferredDriver||$('driverSelect').value;
 roster=result;lastRosterAt=Date.now();const active=new Set(roster.routes.filter(r=>r.status==='ACTIVE').map(r=>r.driver_employee_number));
 roster.drivers.sort((a,b)=>Number(active.has(b.employee_number))-Number(active.has(a.employee_number))||a.display_name.localeCompare(b.display_name));
 $('driverSelect').innerHTML=roster.drivers.map(d=>'<option value="'+esc(d.employee_number)+'">'+esc(d.display_name+' ('+d.employee_number+')'+(active.has(d.employee_number)?' • ACTIVE ROUTE':''))+'</option>').join('');
 if(roster.drivers.some(d=>d.employee_number===driver))$('driverSelect').value=driver;
 fillRoutes(preferredRoute);
}
function displayPhone(j){
 const p=j.phone||{},s=p.snapshot||{},live=p.live===true,active=live&&s.navigation_active;
 const labels={ROUTE_ENDED:'ROUTE ENDED BY OFFICE',AWAITING_DRIVER_SYNC:'AWAITING DRIVER SCREEN SYNC',DRIVER_SIGNED_OUT:'DRIVER SESSION ENDED',DRIVER_VIEWING_ANOTHER_SCREEN:'DRIVER IS VIEWING A DIFFERENT SCREEN',SCREEN_UPDATE_STALE:'DRIVER SCREEN UPDATE STALE',PHONE_APP_IN_BACKGROUND:'DRIVER APP IS IN BACKGROUND',ROUTE_CHANGED:'ROUTE CHANGED — AWAITING DRIVER REFRESH'};
 $('syncState').textContent=live?'LIVE DRIVER SCREEN':labels[p.reason]||'SCREEN SYNC UNAVAILABLE';$('syncState').className='state '+(live?'ok':'warn');
 $('syncDetail').textContent=p.reason==='ROUTE_ENDED'?'Dispatch ended this route. Route history and saved proof of delivery remain available.':p.captured_at?'Last phone screen report: '+stamp(p.captured_at)+' Central. '+(live?'Values below come from the phone.':'Live ETA is paused until a fresh matching report arrives.'):'Route and saved POD records are available. The driver must open the updated Driver app while parked to begin screen syncing.';
 $('navMode').textContent=active?s.mode||'NWTB TURN-BY-TURN':live?'DRIVER APP — '+(s.edition||'GPS'):'DRIVER SCREEN SYNC';
 $('navTurn').textContent=active?s.turn||'Navigation is starting':live?(s.pod_phase!=='CLOSED'?'PROOF OF DELIVERY OPEN':s.view==='ROUTE_LIST'?'DRIVER IS VIEWING THEIR ROUTE LIST':'DRIVER IS VIEWING THE ROUTE'):'Live phone navigation is unavailable';
 $('driverEta').textContent=active?s.eta||'—':'—';$('driverDistance').textContent=active?s.distance||'—':'—';$('turnDistance').textContent=active?s.turn_distance||'—':'—';
 $('navBanner').textContent=active?s.banner||'Navigation is active':live?'Driver has not started turn-by-turn navigation on this screen.':'Saved route and stop status remain visible below.';
 const arrived=live&&s.arrived_stop_id&&j.stops.some(x=>x.id===s.arrived_stop_id&&x.status==='PENDING');
 $('arrivalState').innerHTML=arrived?'<p class="driverControl">ARRIVED AT STOP'+(s.arrival_visible?' — ARRIVAL POPUP IS OPEN ON THE PHONE':'')+'</p>':'';
 $('podState').innerHTML=live&&s.pod_phase&&s.pod_phase!=='CLOSED'?'<p class="driverControl">'+esc(s.pod_phase==='SAVING'?'DRIVER IS SAVING PROOF OF DELIVERY':s.pod_phase==='OFFLINE_QUEUED'?'POD SAVED ON PHONE — AWAITING UPLOAD':'DRIVER HAS THE POD FORM OPEN')+'</p>':'';
 if(live&&s.voice?.needs_tap)$('podState').innerHTML+='<p class="state warn">PHONE VOICE PAUSED — DRIVER CAN TAP RESUME VOICE</p>';
 if(live&&s.handoff_pending)$('podState').innerHTML+='<p class="state warn">STOP SAVED — PHONE IS RECONNECTING NEXT / RETURN DIRECTIONS</p>';
}
function render(j){
 detail=j;const r=j.route,byPod=new Map(j.pods.map(p=>[p.stop_id,p])),phone=j.phone?.live?j.phone.snapshot:null;
 displayPhone(j);$('chatDriver').disabled=!j.driver;$('officeOverride').disabled=!r||!['ACTIVE','PLANNED'].includes(r.status);$('endRoute').disabled=!r||!['ACTIVE','PLANNED'].includes(r.status);$('savedRoute').disabled=!r;
 $('routeState').textContent=routePhase(r)+(r?' • '+r.route_date+' • '+r.depot:'')+(r?.status==='ACTIVE'&&r.returning_started_at&&!r.returned_at?' • Route remains active until the driver confirms arrival back.':'');
 $('stops').innerHTML=(j.stops||[]).map(s=>{const o=s.delivery_orders||{},pod=byPod.get(s.id),override=j.audit.find(a=>a.stop_id===s.id&&a.operation==='complete_stop'),arrived=phone?.arrived_stop_id===s.id&&s.status==='PENDING',podOpen=phone?.pod_stop_id===s.id&&phone.pod_phase!=='CLOSED';
  const localStatus=phone?.displayed_stops?.find(x=>x.id===s.id)?.status;const status=podOpen?'POD '+phone.pod_phase:arrived?'ARRIVED':localStatus&&localStatus!==s.status?localStatus+' ON PHONE — AWAITING SYNC':s.status;
  return '<article class="stop"><div class="stopName">STOP '+esc(s.stop_sequence)+': '+esc(o.customer_name||'Stop')+'</div><div class="actions" style="margin-top:7px"><span class="pill">'+esc(o.stop_type||'STOP')+'</span><span class="pill">'+esc(o.priority||'NORMAL')+'</span><span class="pill">'+esc(status)+'</span></div><div class="address">'+esc(o.address||'')+'</div>'+(o.notes?'<div class="small">'+esc(o.notes)+'</div>':'')+(s.completed_at?'<p class="small">Completed: '+esc(stamp(s.completed_at))+' Central</p>':'')+(s.arrived_at?'<p class="small">Arrival recorded: '+esc(stamp(s.arrived_at))+' Central</p>':'')+(pod?'<div class="driverControl">POD #'+esc(pod.pod_number)+' SAVED • Received by '+esc(pod.recipient_name)+'</div><div class="actions"><button class="btn" data-pod="'+esc(pod.id)+'">VIEW SAVED POD'+(pod.has_photo?' / PHOTO':'')+(pod.has_signature?' / SIGNATURE':'')+'</button></div>':override?'<div class="state warn">COMPLETED BY OFFICE OVERRIDE — NO POD CAPTURED BY THIS OVERRIDE</div>':'<div class="small">POD: '+(s.status==='PENDING'?'Not yet saved':'No saved proof of delivery')+'</div>')+(s.status==='PENDING'&&r&&['PLANNED','ACTIVE'].includes(r.status)?'<div class="actions"><button class="btn ghost" data-stop-override="'+esc(s.id)+'">OFFICE OVERRIDE 🔒</button></div>':'')+'</article>';
 }).join('')||'<section class="panel">'+(r?'No stops remain on this route.':'Choose an assigned route to see its stops.')+'</section>';
 $('stops').querySelectorAll('[data-pod]').forEach(b=>b.onclick=()=>viewPod(b.dataset.pod));
 $('stops').querySelectorAll('[data-stop-override]').forEach(b=>b.onclick=()=>openOverride(b.dataset.stopOverride));
 $('audit').innerHTML=j.audit.map(a=>'<div class="audit"><b>'+esc(a.operation.replace(/_/g,' ').toUpperCase())+'</b><br>'+esc(a.reason)+'<br><span class="small">Office '+esc(a.employee_number)+' • '+esc(stamp(a.created_at))+' Central</span></div>').join('')||'No Office overrides recorded for this route.';
 void mapOverlay?.update(j);
 viewStatus(j.driver.display_name+' ('+j.driver.employee_number+') • Updated '+stamp(j.server_at)+' Central');
}
async function refresh(full=false){
 if(busy){refreshQueued=true;return;}busy=true;const request=selection;
 try{
  if(session()!==lastSession){closeOverride();lastSession=session();full=true;}
  if(full||!roster.drivers.length||Date.now()-lastRosterAt>30000)await refreshRoster();
  if(request!==selection)return;
  const no=$('driverSelect').value;if(!no){viewStatus('No active drivers are registered.');return;}
  const route=$('routeSelect').value,j=await post({action:'view',driver_employee_number:no,...(route?{route_id:route}:{})});
  if(request===selection&&no===$('driverSelect').value&&route===$('routeSelect').value)render(j);
 }catch(e){if(request===selection){viewStatus(e.message,true);if(detail){detail.phone={...detail.phone,live:false,reason:'SCREEN_UPDATE_STALE'};displayPhone(detail);void mapOverlay?.update(detail);}}}finally{busy=false;if(refreshQueued){refreshQueued=false;void refresh();}}
}
async function viewPod(id){
 const request=++podSequence;
 $('podDialog').hidden=false;$('podDetail').textContent='Loading saved POD…';
 try{const {pod:p}=await post({action:'get',pod_id:id},'nwtb-pod');if($('podDialog').hidden||request!==podSequence)return;
  $('podDetail').innerHTML='<p><b>POD #'+esc(p.pod_number)+' — '+esc(p.order?.customer_name||'Delivery')+'</b></p><p>Received by '+esc(p.recipient_name)+'<br>'+esc(stamp(p.captured_at))+' Central</p><p>'+esc(p.notes||'')+'</p><div class="podImages">'+(p.photo_url?'<div><b>DELIVERY PHOTO</b><img alt="Saved delivery photo" src="'+esc(p.photo_url)+'"></div>':'')+(p.signature_url?'<div><b>SIGNATURE</b><img alt="Saved recipient signature" src="'+esc(p.signature_url)+'"></div>':'')+'</div>';
 }catch(e){if(request===podSequence)$('podDetail').textContent=e.message;}
}
function clearPin(){temporaryPin='';if(pinTimer!==null)clearTimeout(pinTimer);pinTimer=null;$('overridePin').value='';}
function closeOverride(){clearPin();editing=null;requestId='';$('overrideDialog').hidden=true;$('overrideControls').hidden=true;$('pinStep').hidden=false;$('overrideStatus').textContent='';}
function openOverride(stopId,operation){
 if(!detail?.route||!['ACTIVE','PLANNED'].includes(detail.route.status))return;closeOverride();editing=JSON.parse(JSON.stringify(detail));requestId=crypto.randomUUID();
 $('overrideDialog').hidden=false;$('overrideTitle').textContent='OFFICE OVERRIDE — '+detail.driver.display_name;
 $('overrideStop').innerHTML=editing.stops.filter(s=>s.status==='PENDING').map(s=>'<option value="'+esc(s.id)+'">STOP '+esc(s.stop_sequence)+' — '+esc(s.delivery_orders?.customer_name||'Stop')+'</option>').join('');
 if(stopId)$('overrideStop').value=stopId;
 $('overrideOperation').value=operation||(!editing.stops.length?'end_route':editing.route.status==='ACTIVE'?'complete_stop':'priority');$('overrideReason').value='';$('overrideNext').checked=false;
 $('insertAfter').innerHTML='<option value="">APPEND AT END</option>'+editing.stops.map(s=>'<option value="'+esc(s.id)+'">STOP '+esc(s.stop_sequence)+' — '+esc(s.delivery_orders?.customer_name||'Stop')+'</option>').join('');
 operationFields();$('overridePin').focus();
}
function operationFields(){
 const op=$('overrideOperation').value;$('targetLabel').hidden=op==='add_stop'||op==='end_route';$('priorityFields').hidden=op!=='priority';$('addFields').hidden=op!=='add_stop';
 $('overrideTitle').textContent=(op==='end_route'?'END ROUTE':'OFFICE OVERRIDE')+' — '+(editing?.driver.display_name||'');$('applyOverride').textContent=op==='end_route'?'END ROUTE':'REVIEW OVERRIDE';
 $('overrideNotice').textContent=op==='end_route'?'End this '+editing.route.status+' route for '+editing.driver.display_name+' • '+editing.route.route_date+' • '+editing.route.depot+'. '+editing.stops.filter(s=>s.status==='PENDING').length+' unfinished stop(s) will return to AVAILABLE. Completed deliveries, POD and route history are kept. This records CANCELED / ENDED BY OFFICE, not a driver return. The driver stays logged in.':op==='complete_stop'?'Marks this stop delivered by Office override. It does not create a signature or photo. Any required return leg remains active.':op==='remove_stop'?'Removes the pending stop from this route and returns it to AVAILABLE. Customer and order records are retained.':op==='priority'?'Changes the priority. Select “Make this the next pending stop” only when you want to change the remaining stop order.':'Adds an existing available stop to this route. Office-only routes stay hidden until explicitly released.';
 const s=editing?.stops.find(s=>s.id===$('overrideStop').value);$('overridePriority').value=s?.delivery_orders?.priority||'NORMAL';
}
async function findAvailable(){
 $('overrideStatus').textContent='Loading available stops…';
 try{const j=await post({action:'available_stops',search:$('availableSearch').value});const orders=j.orders.filter(o=>window.NWTBOfficeRouteMap.valid(o));
  $('availableStop').innerHTML=orders.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.customer_name+' — '+o.address)+'</option>').join('');$('overrideStatus').textContent=orders.length+' located available stop(s). Search by business name to narrow the list.';
 }catch(e){$('overrideStatus').textContent=e.message;}
}
$('pinForm').onsubmit=async e=>{
 e.preventDefault();const candidate=$('overridePin').value,expectedSession=session(),expectedEdit=editing;$('overridePin').value='';$('overrideStatus').textContent='Verifying PIN…';
 try{await post({action:'verify_override_pin',pin:candidate});if($('overrideDialog').hidden||editing!==expectedEdit||session()!==expectedSession)return;temporaryPin=candidate;pinTimer=setTimeout(()=>{clearPin();$('overrideControls').hidden=true;$('pinStep').hidden=false;$('overrideStatus').textContent='PIN authorization expired. Enter your PIN again.';},300000);
  $('pinStep').hidden=true;$('overrideControls').hidden=false;$('overrideStatus').textContent='PIN verified. Review the selected driver, stop and reason before applying.';
 }catch(e){clearPin();$('overrideStatus').textContent=e.message;}
};
$('overrideForm').onsubmit=async e=>{
 e.preventDefault();if(!editing||!temporaryPin||$('applyOverride').disabled)return;
 const op=$('overrideOperation').value,s=editing.stops.find(s=>s.id===$('overrideStop').value),reason=$('overrideReason').value.trim();
 if(reason.length<3){$('overrideStatus').textContent='Enter a reason of at least three characters.';return;}
 if(!['add_stop','end_route'].includes(op)&&!s||op==='add_stop'&&!$('availableStop').value){$('overrideStatus').textContent='Choose a stop.';return;}
 const chosen=op==='end_route'?'ENTIRE ROUTE':op==='add_stop'?$('availableStop').selectedOptions[0]?.textContent:s.delivery_orders?.customer_name;
 if(!confirm((op==='end_route'?'END THIS ROUTE?':'Apply '+op.replace(/_/g,' ').toUpperCase()+'?')+'\n\nDriver: '+editing.driver.display_name+' ('+editing.driver.employee_number+')\nRoute: '+editing.route.route_date+' • '+editing.route.depot+' • '+editing.route.status+'\n'+(op==='end_route'?$('overrideNotice').textContent:'Stop: '+chosen)+'\nReason: '+reason+'\n\nThis will change the saved route and notify the updated Driver app.'))return;
 const override={operation:op,request_id:requestId,route_id:editing.route.id,expected_updated_at:editing.route.updated_at,reason,
  ...(op==='end_route'?{expected_stops:editing.stops.map(s=>({id:s.id,status:s.status,updated_at:s.updated_at??null}))}:op==='add_stop'?{order_id:$('availableStop').value,after_stop_id:$('insertAfter').value||null}:{stop_id:s.id,expected_stop_updated_at:s.updated_at}),
  ...(op==='priority'?{priority:$('overridePriority').value,make_next:$('overrideNext').checked}:{})};
 $('applyOverride').disabled=true;$('overrideStatus').textContent='Applying audited override…';
 try{const result=await post({action:'override',pin:temporaryPin,override});closeOverride();await refresh(true);viewStatus(op==='end_route'?'ROUTE ENDED BY OFFICE. '+result.returned_to_queue+' unfinished stop(s) returned to AVAILABLE. Completed deliveries and saved POD retained.':'Office override saved. Review the updated route below.');}
 catch(e){$('overrideStatus').textContent=e.message;if(e.code==='ADMIN_PIN_REQUIRED'||e.code==='PIN_LOCKED'){clearPin();$('overrideControls').hidden=true;$('pinStep').hidden=false;}}
 finally{$('applyOverride').disabled=false;}
};
$('driverSelect').onchange=()=>{selection++;followDriver=true;closeOverride();$('closeDriverChat').click();fillRoutes(null);void refresh();};$('routeSelect').onchange=()=>{selection++;followDriver=false;closeOverride();void refresh();};
$('refreshView').onclick=()=>refresh(true);$('officeOverride').onclick=()=>openOverride();$('endRoute').onclick=()=>openOverride(undefined,'end_route');$('overrideOperation').onchange=()=>{operationFields();if($('overrideOperation').value==='add_stop')void findAvailable();};$('overrideStop').onchange=operationFields;$('findAvailable').onclick=findAvailable;
$('availableSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void findAvailable();}});
document.querySelectorAll('[data-close-override]').forEach(b=>b.onclick=closeOverride);$('closePod').onclick=()=>{podSequence++;$('podDialog').hidden=true;$('podDetail').innerHTML='';};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeOverride();$('closePod').click();$('closeDriverChat').click();}});
window.nwtbOpenSelectedDriverChat=async(no=detail?.driver.employee_number)=>{if(!no)return;$('driverChatDialog').hidden=false;$('chatTab').classList.remove('hidden');$('driverChatTitle').textContent='CHAT WITH DRIVER — '+(roster.drivers.find(d=>d.employee_number===no)?.display_name||no)+' ('+no+')';if(lastChatDriver!==no&&$('chatInput'))$('chatInput').value='';lastChatDriver=no;await window.nwtbOpenDriverChat?.(no);};
$('chatDriver').onclick=()=>window.nwtbOpenSelectedDriverChat();
$('closeDriverChat').onclick=()=>{$('driverChatDialog').hidden=true;$('chatTab').classList.add('hidden');};
$('savedRoute').onclick=async()=>{try{const desk=window.parent.document.getElementById('fDispatch')?.contentWindow;window.parent.openView('dispatch');await desk.viewOfficeRoute(detail.route.id);}catch{viewStatus('Full Route Screen is still connecting. Try again shortly.',true);}};
window.nwtbSelectOfficeDriver=async(no,routeId)=>{selection++;followDriver=!routeId;closeOverride();$('closeDriverChat').click();while(busy)await new Promise(resolve=>setTimeout(resolve,50));await refreshRoster(no,routeId);await refresh();};
window.nwtbBeginOfficeEndRoute=(expectedRoute,expectedDriver)=>{if(expectedRoute&&detail?.route?.id!==expectedRoute||expectedDriver&&detail?.driver.employee_number!==expectedDriver){viewStatus('The selected route changed. Select and review the intended driver route before ending it.',true);return;}openOverride(undefined,'end_route');};
if(window.L){const map=L.map('driverMap',{scrollWheelZoom:false}).setView([41.682487,-88.072262],10);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
 mapOverlay=window.NWTBOfficeDriverMap.create({map,L,onStatus:(msg,warn)=>{$('mapStatus').textContent=msg;$('mapStatus').className='small'+(warn?' error':'');}});$('fitMap').onclick=()=>{map.invalidateSize();mapOverlay.fit();};
 void import('./office-map-live.mjs?v=20261026-etarefresh1').then(({installOfficeTraffic})=>installOfficeTraffic({map,L,config:{environment:'PRODUCTION',projectRef:'ufnjyidhxuytrmbjzgtu',backendUrl:'https://ufnjyidhxuytrmbjzgtu.supabase.co',siteOrigin:location.origin,publishableKey:PUB,officeTokenKey:'nwtb_delivery_token'},getRows:()=>[],getMarkers:()=>new Map(),getOfficeToken:session,isVisible:visible})).catch(()=>{});
 window.addEventListener('resize',()=>map.invalidateSize());window.addEventListener('nwtb-office-view-visible',()=>{map.invalidateSize();void refresh(true);});
 if(typeof ResizeObserver==='function'){const sizeObserver=new ResizeObserver(()=>map.invalidateSize());sizeObserver.observe($('driverMap'));}
}
setInterval(()=>{if(visible())void refresh();},5000);document.addEventListener('visibilitychange',()=>{if(visible())void refresh(true);});window.addEventListener('focus',()=>{if(visible())void refresh(true);});
window.addEventListener('storage',e=>{if(e.key==='nwtb_delivery_token'){closeOverride();detail=null;void refresh(true);}});window.addEventListener('pagehide',closeOverride);
void (async()=>{await refresh(true);const query=new URLSearchParams(location.search||''),no=query.get('driver'),id=query.get('route');if(/^\d{4}$/.test(no||'')&&/^[0-9a-f-]{36}$/i.test(id||'')){await window.nwtbSelectOfficeDriver(no,id);if(query.get('end')==='1')window.nwtbBeginOfficeEndRoute(id,no);}})();
})();
