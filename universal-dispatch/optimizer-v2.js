(()=>{
'use strict';
if(window.__udpOptimizerV2)return;window.__udpOptimizerV2=true;
const BASE='https://khvhcmncwzywqowfodnb.supabase.co/functions/v1';
const OLD=BASE+'/udp-routing';
const OPT=BASE+'/udp-route-optimizer-v2';
const KEY='sb_publishable_oTafXfr-ok1F-Kk_LEbsHg_yv8lovc-';
const token=()=>localStorage.getItem('udp_session')||'';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
async function post(url,payload){const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','apikey':KEY,'x-udp-session':token()},body:JSON.stringify(payload)}),j=await r.json().catch(()=>({error:'Bad server response'}));if(!r.ok)throw Error(j.error||'Request failed');return j}

/* All newly created routes are automatically optimized. The old preserve-order checkbox is ignored at the network boundary. */
const nativeFetch=window.fetch.bind(window);
window.fetch=async function(input,init={}){
 try{
  const url=typeof input==='string'?input:(input?.url||'');
  if(url===OLD&&init?.body){
   const body=JSON.parse(init.body);
   if(body?.action==='route_create'){
    delete body.preserve_order;
    return nativeFetch(OPT,{...init,body:JSON.stringify(body)});
   }
  }
 }catch{}
 return nativeFetch(input,init);
};

function style(){if(document.getElementById('udpOptStyle'))return;const s=document.createElement('style');s.id='udpOptStyle';s.textContent=`
.udpOptNote{margin-top:12px;padding:11px 12px;border:1px solid #b2ccff;background:#eef4ff;color:#175cd3;border-radius:9px;font-size:11px;line-height:1.45}.udpOptNote b{color:#1849a9}.udpPriority{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:8px}.udpPriority select{width:auto;min-width:120px;padding:7px;border:1px solid #d0d5dd;border-radius:8px;background:#fff}.udpPurple{background:#7c3aed!important;color:#fff!important}.udpHot{background:#b42318!important;color:#fff!important}.udpRouteAlert{position:fixed;left:12px;right:12px;top:12px;z-index:99999;background:#7c3aed;color:#fff;padding:14px 16px;border-radius:12px;font-weight:900;box-shadow:0 14px 40px #0004;text-align:center}.udpRouteAlert small{display:block;margin-top:5px;font-size:11px;font-weight:700}.udpActionBtn{padding:7px 9px!important;font-size:10px!important}
`;document.head.appendChild(s)}
function askPin(label){const p=prompt(label+'\n\nEnter management change PIN:');if(p===null)return null;const v=String(p).trim();return v||null}
function showAlert(text){let x=document.getElementById('udpRouteAlert');if(!x){x=document.createElement('div');x.id='udpRouteAlert';x.className='udpRouteAlert';document.body.appendChild(x)}x.innerHTML='ROUTE UPDATED BY DISPATCH<small>'+esc(text||'Your remaining stop order changed.')+'</small>';try{if(navigator.vibrate)navigator.vibrate([350,120,350,120,650])}catch{};if('Notification'in window&&Notification.permission==='granted'){try{new Notification('Route updated by Dispatch',{body:text||'Your remaining stop order changed.',tag:'udp-route-update',renotify:true})}catch{}}setTimeout(()=>x.remove(),9000)}

function enhanceDispatch(){
 const h=[...document.querySelectorAll('#v h1')].find(x=>x.textContent.trim()==='Dispatch');if(!h)return;
 const po=document.getElementById('po');if(po){const lab=po.closest('label');if(lab)lab.style.display='none';po.checked=false}
 const rc=document.getElementById('rc');if(rc&&!document.getElementById('udpRouteCreateNote')){const n=document.createElement('div');n.id='udpRouteCreateNote';n.className='udpOptNote';n.innerHTML='<b>AUTOMATIC ROUTE OPTIMIZATION:</b> Every route is optimized when it is created. Priority is optional. After reviewing the finished route, Dispatch can change a pending stop to PRIORITY / HOT SHOT / MUST FIRST from the Routes screen and re-optimize the remaining stops.';rc.insertAdjacentElement('afterend',n)}
}

let routesBusy=false,lastRoutesSignature='';
async function enhanceRoutes(){
 if(routesBusy)return;const h=[...document.querySelectorAll('#v h1')].find(x=>x.textContent.trim()==='Routes');if(!h||document.getElementById('udpEnhancedRoutes'))return;routesBusy=true;
 try{
  const j=await post(OLD,{action:'routes_list'}),routes=j.routes||[];
  const sig=routes.map(r=>r.id+':'+r.updated_at).join('|');lastRoutesSignature=sig;
  const v=document.getElementById('v');if(!v||![...v.querySelectorAll('h1')].some(x=>x.textContent.trim()==='Routes'))return;
  const rows=routes.map(r=>`<tr><td>${esc(r.route_date)}</td><td><b>${esc((r.app_users||{}).full_name||'')}</b></td><td>${esc(r.status)}</td><td>${esc(r.route_mode||'')}</td><td>${r.estimated_miles!=null?Number(r.estimated_miles).toFixed(1)+' mi':'—'}</td><td>${['PLANNED','ACTIVE','PAUSED'].includes(r.status)?`<button class="btn blue udpActionBtn" onclick="udpOpenRoute('${r.id}')">VIEW / PRIORITY</button>`:'<button class="btn ghost udpActionBtn" onclick="udpOpenRoute(\''+r.id+'\')">VIEW</button>'}</td></tr>`).join('');
  v.innerHTML=`<h1>Routes</h1><div class="sub">Routes are optimized automatically when created. Priority changes are optional and are made after reviewing the route.</div><div id="udpEnhancedRoutes" class="panel"><div class="table"><table><tr><th>Date</th><th>Driver</th><th>Status</th><th>Mode</th><th>Miles</th><th>Actions</th></tr>${rows||'<tr><td colspan="6">No routes yet.</td></tr>'}</table></div></div>`;
 }catch(e){console.warn('Universal enhanced Routes view failed',e)}finally{routesBusy=false}
}

window.udpOpenRoute=async function(routeId){
 try{
  const j=await post(OPT,{action:'route_get',route_id:routeId}),r=j.route,stops=j.stops||[],editable=['PLANNED','ACTIVE','PAUSED'].includes(r.status),driver=(r.app_users||{}).full_name||'';
  const v=document.getElementById('v');if(!v)return;
  v.innerHTML=`<h1>Route Details</h1><div class="sub">${esc(driver)} • ${esc(r.route_date)} • ${esc(r.status)}</div><div class="toolbar"><button class="btn ghost" onclick="document.querySelector('[data-v=routes]')?.click()">← BACK TO ROUTES</button>${editable?`<button class="btn udpPurple" onclick="udpReoptimize('${r.id}')">RE-OPTIMIZE REMAINING STOPS</button>`:''}</div><div class="udpOptNote"><b>HOW PRIORITY WORKS:</b> This route was optimized automatically when it was created. Leave stops NORMAL unless Dispatch decides a pending stop needs to move earlier. Changing a priority re-optimizes the remaining pending stops; completed/arrived work is not moved.</div><div class="panel"><h2>Stops</h2>${stops.map(s=>{const o=s.delivery_orders||{},pending=s.status==='PENDING'&&editable,id='udpprio_'+String(s.id).replace(/[^a-zA-Z0-9]/g,'');return `<div class="routeStop"><b>STOP ${s.stop_sequence}: ${esc(o.customer_name||'')}</b><div class="sub">${esc(o.address||'')} • ${esc(s.status)} • ${esc(o.priority||'NORMAL')}</div>${pending?`<div class="udpPriority"><label style="font-size:10px;font-weight:900">DISPATCH PRIORITY</label><select id="${id}"><option value="NORMAL" ${o.priority==='NORMAL'?'selected':''}>NORMAL</option><option value="PRIORITY" ${o.priority==='PRIORITY'?'selected':''}>PRIORITY</option><option value="HOT_SHOT" ${o.priority==='HOT_SHOT'?'selected':''}>HOT SHOT</option><option value="MUST_FIRST" ${o.priority==='MUST_FIRST'?'selected':''}>MUST FIRST</option></select><button class="btn udpPurple udpActionBtn" onclick="udpSetPriority('${r.id}','${s.id}','${id}')">SET + RE-OPTIMIZE</button></div>`:''}</div>`}).join('')||'<div class="sub">No stops.</div>'}</div>`;
 }catch(e){alert(e.message||'Could not open route.')}
};
window.udpSetPriority=async function(routeId,stopId,selectId){const pin=askPin('CHANGE STOP PRIORITY + RE-OPTIMIZE');if(!pin)return;const priority=document.getElementById(selectId)?.value||'NORMAL';try{await post(OPT,{action:'set_priority_and_reoptimize',route_id:routeId,route_stop_id:stopId,priority,pin});await window.udpOpenRoute(routeId)}catch(e){alert(e.message||'Could not change priority.')}};
window.udpReoptimize=async function(routeId){const pin=askPin('RE-OPTIMIZE REMAINING STOPS');if(!pin)return;try{await post(OPT,{action:'reoptimize_remaining',route_id:routeId,pin});await window.udpOpenRoute(routeId)}catch(e){alert(e.message||'Could not re-optimize route.')}};

let pollBusy=false;
async function driverPoll(){
 if(pollBusy||!token())return;const drv=document.querySelector('.driverShell');if(!drv)return;pollBusy=true;
 try{
  const rj=await post(OLD,{action:'routes_list',statuses:['PLANNED','ACTIVE','PAUSED']}),r=(rj.routes||[])[0];if(!r)return;const key='udp_opt_event_'+r.id,stored=localStorage.getItem(key),after=Math.max(0,Number(stored)||0),j=await post(OPT,{action:'route_priority_changes',route_id:r.id,after_id:after}),events=j.events||[];if(!events.length)return;const last=events[events.length-1];localStorage.setItem(key,String(last.id));const fresh=events.filter(e=>Date.now()-new Date(e.created_at).getTime()<10*60*1000);if(!stored&&!fresh.length)return;for(const ev of fresh)showAlert(ev.note);if(fresh.length)document.getElementById('drvRoute')?.click()
 }catch(e){console.warn('Universal route update poll failed',e)}finally{pollBusy=false}
}

function scan(){style();enhanceDispatch();enhanceRoutes();driverPoll()}
const mo=new MutationObserver(()=>{enhanceDispatch();enhanceRoutes()});mo.observe(document.documentElement,{childList:true,subtree:true});setInterval(scan,5000);setTimeout(scan,300);
})();