(()=>{
'use strict';
if(window.__nwtbActiveRouteGuard)return;window.__nwtbActiveRouteGuard=true;
let busy=false;
async function reconcile(){
 if(busy||typeof post!=='function'||typeof API==='undefined'||typeof live==='undefined')return;
 busy=true;
 try{
  const j=await post(API,{action:'routes_list'});
  const active=(j.routes||[]).filter(r=>['PLANNED','ACTIVE'].includes(String(r.status||'').toUpperCase()));
  const ids=new Set(active.map(r=>String(r.id)));
  live=(live||[]).filter(r=>ids.has(String(r.route_id||''))&&r.route&&['PLANNED','ACTIVE'].includes(String(r.route.status||'').toUpperCase()));
  if(typeof renderMap==='function')renderMap();
  if(typeof renderDrivers==='function')renderDrivers();
  const u=document.getElementById('updated');
  if(u&&active.length===0)u.textContent='Updated '+new Date().toLocaleTimeString()+' • No active routes';
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