(()=>{
'use strict';
if(window.__nwtbDispatchChangePinLive)return;window.__nwtbDispatchChangePinLive=true;
const ROUTE_ADMIN='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-delivery-route-admin';
const BOARD_ADMIN='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-delivery-board-admin';
const KEY='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
const token=()=>localStorage.getItem('nwtb_delivery_token')||'';
async function adminPost(url,payload){const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','apikey':KEY,'x-nwtb-session':token()},body:JSON.stringify(payload)}),j=await r.json().catch(()=>({error:'Invalid server response'}));if(!r.ok)throw Error(j.error||'Request failed');return j}
function askPin(action){const p=prompt(action+'\n\nEnter management PIN:');if(p===null)return null;const pin=String(p).trim();if(!pin)return null;return pin}
function banner(text,kind='ok'){try{if(typeof window.showBanner==='function'&&document.getElementById('routeMsg'))window.showBanner('routeMsg',text,kind);else alert(text)}catch{alert(text)}}
async function refresh(){if(typeof window.refreshAll==='function')await window.refreshAll()}

window.clearAllRoutesWithPin=async function(){const pin=askPin('CLEAR ALL ROUTES');if(pin===null)return;try{const j=await adminPost(ROUTE_ADMIN,{action:'clear_all_routes',pin});banner(`All routes deleted. ${j.stops_returned||0} unfinished stop(s) returned to AVAILABLE.`,'ok');await refresh()}catch(e){alert(e.message||'Could not clear routes.')}};
window.clearAvailableWithConfirm=async function(){const pin=askPin('CLEAR ALL AVAILABLE STOPS');if(pin===null)return;try{const j=await adminPost(BOARD_ADMIN,{action:'clear_available',pin});banner(`${j.available_cleared||0} AVAILABLE stop(s) cleared.`,'ok');await refresh()}catch(e){alert(e.message||'Could not clear AVAILABLE stops.')}};

window.removeStopFromRoute=async function(orderId){const pin=askPin('REMOVE THIS STOP FROM THE ROUTE');if(pin===null)return;try{banner('Removing stop from route…','info');const j=await adminPost(ROUTE_ADMIN,{action:'remove_stop',order_id:orderId,pin});if(typeof window.closeRouteModal==='function')window.closeRouteModal();banner(j.route_status==='ACTIVE'?`Stop removed. ${j.driver_name} will be notified on the Driver Route page.`:'Stop returned to the AVAILABLE queue.','ok');await refresh()}catch(e){banner(e.message||'Could not remove stop.','err')}};
window.unassignStop=window.removeStopFromRoute;

window.addStopToRoute=async function(orderId,routeId){const pin=askPin('ADD THIS STOP TO THE ROUTE');if(pin===null)return;try{const j=await adminPost(ROUTE_ADMIN,{action:'add_stop',order_id:orderId,route_id:routeId,pin});if(typeof window.closeRouteModal==='function')window.closeRouteModal();banner(j.route_status==='ACTIVE'?`Stop added to ${j.driver_name} at stop ${j.stop_sequence}. Driver alert sent.`:`Stop added to ${j.driver_name} at stop ${j.stop_sequence}.`,'ok');await refresh()}catch(e){banner(e.message||'Could not add stop to route.','err')}};

window.reassignRoute=async function(routeId){const driver=document.getElementById('modalDriver')?.value||'';const pin=askPin('REASSIGN THIS ROUTE');if(pin===null)return;const box=document.getElementById('modalMsg');if(box){box.className='banner show info';box.textContent='Reassigning route…'}try{const j=await adminPost(ROUTE_ADMIN,{action:'reassign_route',route_id:routeId,driver_employee_number:driver,pin});if(box){box.className='banner show ok';box.textContent='Route reassigned to '+j.driver_name+'.'}await refresh();if(typeof window.closeRouteModal==='function')setTimeout(window.closeRouteModal,900)}catch(e){if(box){box.className='banner show err';box.textContent=e.message||'Could not reassign route.'}else alert(e.message||'Could not reassign route.')}};

function rewire(){const a=document.getElementById('clearAllRoutesBtn');if(a)a.onclick=window.clearAllRoutesWithPin;const b=document.getElementById('clearAvailableStopsBtn');if(b)b.onclick=window.clearAvailableWithConfirm}
rewire();let tries=0;const t=setInterval(()=>{rewire();if(++tries>50)clearInterval(t)},200);
})();
