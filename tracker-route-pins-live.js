/* Live Drivers: draw assigned road routes, return legs and optional actual phone paths. */
(()=>{
'use strict';
if(window.__nwtbTrackerRoutePinsLive)return;window.__nwtbTrackerRoutePinsLive=true;
const BASE='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/',PUB='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
const overlays=new Map();let busy=false,control=null,fitOnce=false;
async function read(endpoint,body){const r=await fetch(BASE+endpoint,{method:'POST',cache:'no-store',headers:{'content-type':'application/json','apikey':PUB,'x-nwtb-session':localStorage.getItem('nwtb_delivery_token')||''},body:JSON.stringify(body)}),j=await r.json();if(!r.ok)throw Error(j.error||'Route unavailable');return j;}
function shell(){let w=window;for(let n=0;n<5;n++){if(typeof w.nwtbOpenOfficeDriverView==='function')return w;if(w===w.parent)break;w=w.parent;}return null;}
function fitAll(){const map=window.__nwtbTrackerMap,points=[...overlays.values()].flatMap(overlay=>overlay.getBoundsPoints());if(map&&points.length)map.fitBounds(L.latLngBounds(points),{padding:[38,38],maxZoom:14});}
function addControl(map){
 if(control)return;control=L.control({position:'topright'});control.onAdd=()=>{const div=L.DomUtil.create('div');div.style.cssText='background:white;border-radius:8px;padding:8px;max-width:270px;font:11px/1.5 Arial;box-shadow:0 2px 8px #0003';div.innerHTML='<button type="button" style="border:0;padding:7px;background:#15304e;color:white;border-radius:6px;font-weight:bold">ALL ROUTE STOPS</button><div id="nwtbAssignedRoadStatus" role="status">Loading assigned routes…</div>';div.querySelector('button').onclick=()=>{fitAll();};L.DomEvent.disableClickPropagation(div);return div;};control.addTo(map);
}
async function refresh(){
 const map=window.__nwtbTrackerMap;if(busy||!map||!window.NWTBOfficeDriverMap||!localStorage.getItem('nwtb_delivery_token'))return;busy=true;
 try{
  const saved=await read('nwtb-delivery',{action:'routes_list'});
  const rows=saved.routes.filter(r=>r.status==='ACTIVE'||r.status==='PLANNED'&&r.released_to_driver===true);
  const current=new Set(rows.map(r=>r.id));for(const [id,overlay]of overlays)if(!current.has(id)){overlay.destroy();overlays.delete(id);}
  addControl(map);let next=0,failed=0;
  async function worker(){while(next<rows.length){const route=rows[next++];try{
   const j=await read('nwtb-office-driver-view',{action:'view',route_id:route.id});
   if(!overlays.has(route.id))overlays.set(route.id,window.NWTBOfficeDriverMap.create({map,L,showDriver:false,onStatus:(msg,warn)=>{const el=document.getElementById('nwtbAssignedRoadStatus');if(el){el.textContent=msg;el.style.color=warn?'#b42318':'#344054';}},onOpen:r=>shell()?.nwtbOpenOfficeDriverView(r.driver_employee_number,r.id)}));
   await overlays.get(route.id).update(j);
  }catch{failed++;}}}
  await Promise.all([worker(),worker()]);const el=document.getElementById('nwtbAssignedRoadStatus');if(el&&!rows.length)el.textContent='No released or active routes. Online driver locations remain visible.';else if(el&&failed)el.textContent='Some route paths are temporarily unavailable. Driver markers remain visible.';
  if(!fitOnce&&overlays.size){fitOnce=true;fitAll();}
 }catch{const el=document.getElementById('nwtbAssignedRoadStatus');if(el)el.textContent='Route paths unavailable. Driver locations continue to refresh.';}finally{busy=false;}
}
document.addEventListener('click',e=>{const button=e.target.closest?.('[data-office-driver-view],[data-office-driver-chat]');if(!button)return;const host=shell();if(button.dataset.officeDriverChat)host?.nwtbChatWithDriver(button.dataset.officeDriverChat);else host?.nwtbOpenOfficeDriverView(button.dataset.officeDriverView,button.dataset.routeId);});
let tries=0;const timer=setInterval(()=>{if(window.__nwtbTrackerMap&&window.NWTBOfficeDriverMap){clearInterval(timer);void refresh();setInterval(refresh,10000);}else if(++tries>150)clearInterval(timer);},100);
window.nwtbShowAllOfficeRouteStops=()=>{fitAll();};
})();
