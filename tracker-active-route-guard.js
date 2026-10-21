(()=>{
'use strict';
if(window.__nwtbActiveRouteGuard)return;window.__nwtbActiveRouteGuard=true;
let busy=false;
async function reconcile(){
 if(busy||typeof post!=='function'||typeof API==='undefined'||typeof live==='undefined')return;
 busy=true;
 try{
  const j=await post(API,{action:'routes_list'});
  const active=(j.routes||[]).filter(r=>r.status==='ACTIVE'||r.status==='PLANNED'&&r.released_to_driver===true);
  active.sort((a,b)=>(a.status==='ACTIVE'?0:1)-(b.status==='ACTIVE'?0:1)||String(a.route_date||'').localeCompare(String(b.route_date||''))||String(a.id).localeCompare(String(b.id)));
  const ids=new Set(active.map(r=>String(r.id)));
  live=(live||[]).map(r=>{const current=active.find(a=>a.driver_employee_number===r.driver_employee_number)||(ids.has(String(r.route_id||''))?active.find(a=>a.id===r.route_id):null);if(current){const route={...(r.route_id===current.id?r.route||{}:{}),...current};return {...r,route,route_id:route.id,marker_type:'VAN'}}return r.logged_in===true?{...r,route:null,route_id:null,marker_type:'PERSON'}:null}).filter(Boolean);
  if(typeof renderMap==='function')renderMap();
  if(typeof renderDrivers==='function')renderDrivers();
  const u=document.getElementById('updated');
  if(u&&active.length===0)u.textContent='Updated '+new Date().toLocaleTimeString()+' • '+live.filter(r=>window.NWTBDriverStatus.online(r)).length+' online driver(s) • No released or active routes';
 }catch(e){console.warn('Active route guard failed',e)}finally{busy=false}
}
function install(){
 if(typeof refreshAll!=='function')return false;
 if(window.__nwtbActiveRouteGuardInstalled)return true;
 window.__nwtbActiveRouteGuardInstalled=true;
 const original=refreshAll;
 refreshAll=async function(){const out=await original.apply(this,arguments);await reconcile();return out};
 reconcile();
 setInterval(reconcile,2500);
 window.addEventListener('focus',reconcile);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reconcile()});
 return true;
}
let tries=0;const t=setInterval(()=>{if(install()||++tries>100)clearInterval(t)},100);
})();