(()=>{
'use strict';

const V2_ROUTE_API='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-v2-multi-route';
const V2_ID='nwtbV2FinalRuntime';
if(window[V2_ID])return;
window[V2_ID]=true;

let lastUseButton=null;
let busy=false;

function qs(s,r=document){return r.querySelector(s)}
function qsa(s,r=document){return [...r.querySelectorAll(s)]}

function installStyles(){
 if(document.getElementById('nwtbV2FinalStyles'))return;
 const s=document.createElement('style');
 s.id='nwtbV2FinalStyles';
 s.textContent=`
  .nwtbV2UseBtn{
    transition:transform .08s ease,box-shadow .08s ease,background .12s ease,border-color .12s ease!important;
    cursor:pointer!important;
  }
  .nwtbV2UseBtn:hover{background:#eef4ff!important;border-color:#84adff!important}
  .nwtbV2UseBtn:active,.nwtbV2UseBtn.nwtbV2Pressed{
    transform:translateY(2px) scale(.985)!important;
    box-shadow:inset 0 3px 7px rgba(16,24,40,.22)!important;
    background:#dbeafe!important;
    border-color:#175cd3!important;
  }
  .nwtbV2UseBtn.nwtbV2Loading{
    background:#175cd3!important;color:#fff!important;border-color:#175cd3!important;
    transform:translateY(2px)!important;box-shadow:inset 0 3px 7px rgba(0,0,0,.22)!important;
  }
  .nwtbV2UseBtn.nwtbV2Done{
    background:#067647!important;color:#fff!important;border-color:#067647!important;
  }
  #v2AutoAssignmentBox{
    border:1px solid #84adff;background:#f5f8ff;border-radius:13px;padding:14px;margin-top:12px;
  }
  #v2AutoAssignmentBox b{display:block;font-size:13px;color:#1849a9}
  #v2AutoAssignmentBox p{margin:5px 0 11px;font-size:10px;color:#475467;line-height:1.45}
  #v2AutoAssignmentBox .v2AutoBtn{
    border:0;border-radius:9px;padding:10px 13px;background:#175cd3;color:#fff;font-weight:900;font-size:11px;cursor:pointer;
  }
  .nwtbV2LegacyRouteControls{display:none!important}
  .nwtbV2QueueFlash{animation:nwtbV2Flash 1.8s ease}
  @keyframes nwtbV2Flash{0%,45%{background:#dcfae6}100%{background:transparent}}
 `;
 document.head.appendChild(s);
}

function decorateUseButtons(){
 qsa('#searchResults button').forEach(b=>{
  if((b.textContent||'').trim().toUpperCase()==='USE LOCATION')b.classList.add('nwtbV2UseBtn');
 });
}

function sendDispatchSelection(){
 try{
  const order_ids=qsa('.pick:checked').map(x=>x.value).filter(Boolean);
  window.parent.postMessage({type:'nwtb-v2-selection-changed',order_ids},location.origin);
 }catch{}
}
function installButtonCapture(){
 document.addEventListener('change',e=>{
  if(e.target?.classList?.contains('pick'))setTimeout(sendDispatchSelection,0);
 },true);
 document.addEventListener('pointerdown',e=>{
  const b=e.target.closest?.('button');
  if(!b)return;
  if((b.textContent||'').trim().toUpperCase()==='USE LOCATION'){
   lastUseButton=b;
   b.classList.add('nwtbV2UseBtn','nwtbV2Pressed');
  }
 },true);
 document.addEventListener('pointerup',e=>{
  const b=e.target.closest?.('button');
  if(b)setTimeout(()=>b.classList.remove('nwtbV2Pressed'),90);
 },true);
 const box=document.getElementById('searchResults');
 if(box)new MutationObserver(decorateUseButtons).observe(box,{childList:true,subtree:true});
 decorateUseButtons();
}

function installAutoAssignmentPanel(){
 const panel=qsa('.panel').find(p=>p.querySelector('h2')?.textContent.trim()==='Route Planning');
 if(!panel)return false;
 const h2=panel.querySelector('h2');
 if(h2)h2.textContent='Automatic Multi-Driver Assignment';
 const sub=panel.querySelector('.sub');
 if(sub)sub.textContent='No driver is assigned manually here in V2. Add stops to the Dispatch Queue, then open Auto Route Builder. Choose who is driving today and V2 automatically divides, optimizes and assigns the stops across those drivers.';
 const grid=panel.querySelector('.grid.g4');
 if(grid)grid.classList.add('nwtbV2LegacyRouteControls');
 const toolbar=grid?.nextElementSibling;
 if(toolbar?.classList.contains('toolbar'))toolbar.classList.add('nwtbV2LegacyRouteControls');
 const routeMsg=document.getElementById('routeMsg');
 if(routeMsg)routeMsg.classList.add('nwtbV2LegacyRouteControls');
 const routeResult=document.getElementById('routeResult');
 if(routeResult)routeResult.classList.add('nwtbV2LegacyRouteControls');
 if(!document.getElementById('v2AutoAssignmentBox')){
  const box=document.createElement('div');
  box.id='v2AutoAssignmentBox';
  box.innerHTML='<b>NO MANUAL DRIVER ASSIGNMENT</b><p>Driver Queue + V2 optimizer handles assignment automatically. Add every stop you need to the queue first, then select today\'s drivers and optimize them together.</p><button class="v2AutoBtn" type="button">OPEN AUTO ROUTE BUILDER</button>';
  box.querySelector('button').onclick=()=>{
   try{window.parent.document.querySelector('.nav[data-v="planner"]')?.click()}
   catch{try{window.parent.location.hash='planner'}catch{}}
  };
  panel.appendChild(box);
 }
 return true;
}

function sourceTypeFor(r){
 return r.source_type||((document.getElementById('dirKind')?.value)==='VENDOR'?'VENDOR':'CUSTOMER');
}
function rawAddressFor(r){return r.address||[r.addr1,r.addr2,r.city,r.state].filter(Boolean).join(', ')}

window.useResult=async function(i,saved){
 if(busy)return;
 const r=window['_search_'+i];
 if(!r)return;
 busy=true;

 const b=lastUseButton||document.activeElement?.closest?.('button');
 const original=b?.textContent||'USE LOCATION';
 if(b){
  b.classList.add('nwtbV2UseBtn','nwtbV2Pressed','nwtbV2Loading');
  b.disabled=true;
  b.textContent='ADDING…';
 }

 try{
  const sourceType=sourceTypeFor(r);
  const sourceRef=r.source_ref||r.customer_number||r.vendor_id||'';
  const address=rawAddressFor(r)||'ADDRESS NEEDS VERIFICATION';
  let stopType=document.getElementById('stopType')?.value||'CUSTOMER_DELIVERY';
  if(sourceType==='VENDOR'&&stopType==='CUSTOMER_DELIVERY')stopType='VENDOR_PICKUP';

  // Resolve the best physical coordinates when possible, but never turn USE LOCATION
  // back into a "fill the form first" workflow.
  let lat=null,lon=null,resolvedAddress=address,savedId=saved?(r.id||null):null;
  try{
   const resolver='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-location-resolver';
   const j=await post(resolver,{
    source_type:sourceType,
    source_ref:sourceRef,
    saved_location_id:savedId||'',
    name:r.name||'',
    address
   });
   if(j?.address)resolvedAddress=j.address;
   if(validCoord(j?.lat,j?.lon)){lat=Number(j.lat);lon=Number(j.lon)}
   if(j?.saved_location_id)savedId=j.saved_location_id;
  }catch{}

  const created=await post(API,{
   action:'order_create',
   stop_type:stopType,
   source_type:sourceType,
   source_ref:sourceRef||null,
   saved_location_id:savedId,
   sales_order_no:null,
   reference_no:null,
   customer_number:sourceType==='CUSTOMER'?(sourceRef||null):null,
   customer_name:r.name||'Unnamed Location',
   address:resolvedAddress,
   phone:r.phone||r.phone_work||r.phone_home||'',
   pieces:1,
   priority:'NORMAL',
   promised_by:null,
   notes:'Added directly from V2 USE LOCATION',
   lat,lon
  });

  if(b){
   b.classList.remove('nwtbV2Loading');
   b.classList.add('nwtbV2Done');
   b.textContent='ADDED ✓';
  }

  if(typeof showBanner==='function')showBanner('addMsg',(r.name||'Location')+' added to the AVAILABLE Dispatch Queue.','ok');
  if(document.getElementById('dirQ'))document.getElementById('dirQ').value='';
  if(document.getElementById('searchResults'))document.getElementById('searchResults').innerHTML='';

  if(typeof refreshAll==='function')await refreshAll();
  try{window.parent.postMessage({type:'nwtb-v2-queue-changed',order_id:created?.order?.id||null},location.origin)}catch{}
  if(typeof setQueue==='function'){
   const available=qsa('.filter').find(x=>x.dataset.q==='AVAILABLE');
   if(available)setQueue('AVAILABLE',available);
  }

  const id=created?.order?.id;
  if(id){
   const checkbox=qsa('.pick').find(x=>x.value===id);
   const tr=checkbox?.closest('tr');
   if(tr){tr.classList.add('nwtbV2QueueFlash');tr.scrollIntoView({behavior:'smooth',block:'center'})}
   else document.getElementById('ordersBody')?.scrollIntoView({behavior:'smooth',block:'start'});
  }else document.getElementById('ordersBody')?.scrollIntoView({behavior:'smooth',block:'start'});

  if(b)setTimeout(()=>{
   b.disabled=false;
   b.classList.remove('nwtbV2Done','nwtbV2Pressed');
   b.textContent=original;
  },850);
 }catch(e){
  if(b){
   b.disabled=false;
   b.classList.remove('nwtbV2Loading','nwtbV2Pressed');
   b.textContent='TRY AGAIN';
  }
  if(typeof showBanner==='function')showBanner('addMsg','Could not add location to queue: '+(e?.message||e),'err');
 }finally{
  busy=false;
  lastUseButton=null;
 }
};


async function decorateV2RoutedRows(){
 try{
  const j=await post(V2_ROUTE_API,{action:'routed_status'});
  const map=j?.order_map||{};
  qsa('#ordersBody .pick').forEach(cb=>{
   const info=map[String(cb.value)];
   if(!info)return;
   cb.checked=false;cb.disabled=true;
   const tr=cb.closest('tr');if(!tr)return;
   tr.dataset.v2Routed='1';
   tr.style.background='#f5f8ff';
   const cells=tr.querySelectorAll('td');
   if(cells[7])cells[7].innerHTML='<span class="pill" style="background:#eef4ff;color:#175cd3">V2 ROUTED</span>';
   if(cells[9])cells[9].innerHTML='<div style="font-size:9px;font-weight:900;color:#175cd3;margin-bottom:5px">'+
     String(info.driver_display_name||info.driver_employee_number||'DRIVER')+' • STOP '+String(info.stop_sequence||'')+
     '</div><button class="btn blue mini nwtbV2ViewRoute" type="button">VIEW V2 ROUTE</button>';
   const btn=cells[9]?.querySelector('.nwtbV2ViewRoute');
   if(btn)btn.onclick=()=>{try{window.parent.postMessage({type:'nwtb-v2-view-plan',plan_id:info.plan_id},location.origin)}catch{}};
  });
 }catch{}
}

function startV2RoutedOverlay(){
 decorateV2RoutedRows();
 setInterval(decorateV2RoutedRows,4000);
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||!e.data)return;
  if(e.data.type==='nwtb-v2-routes-released')setTimeout(decorateV2RoutedRows,250);
 });
}
function boot(){
 installStyles();
 installButtonCapture();
 startV2RoutedOverlay();
 if(!installAutoAssignmentPanel()){
  let n=0;const t=setInterval(()=>{n++;if(installAutoAssignmentPanel()||n>40)clearInterval(t)},150);
 }
 // Reassert last-in-chain behavior in case any delayed legacy installer writes useResult again.
 const v2Use=window.useResult;
 let n=0;
 const guard=setInterval(()=>{
  n++;
  if(window.useResult!==v2Use)window.useResult=v2Use;
  decorateUseButtons();
  installAutoAssignmentPanel();
  if(n>40)clearInterval(guard);
 },250);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();