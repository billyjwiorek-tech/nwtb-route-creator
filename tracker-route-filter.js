(function(){
'use strict';
function currentRouteDriver(r){return !!(r&&r.route_id&&r.route&&['PLANNED','ACTIVE'].includes(String(r.route.status||'').toUpperCase()));}
function install(){
  if(typeof renderMap!=='function'||typeof renderDrivers!=='function'||typeof live==='undefined')return false;
  if(window.__nwtbRouteOnlyTrackerInstalled)return true;
  window.__nwtbRouteOnlyTrackerInstalled=true;
  const originalRenderMap=renderMap;
  const originalRenderDrivers=renderDrivers;
  renderMap=function(){const all=live;try{live=(all||[]).filter(currentRouteDriver);return originalRenderMap();}finally{live=all;}};
  renderDrivers=function(){const all=live;try{live=(all||[]).filter(currentRouteDriver);return originalRenderDrivers();}finally{live=all;}};
  try{renderMap();renderDrivers();}catch(e){console.warn('NWTB route-only tracker refresh failed',e);}
  return true;
}
let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>100)clearInterval(timer)},100);
})();
