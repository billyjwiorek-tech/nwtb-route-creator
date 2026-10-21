(()=>{
'use strict';
if(window.__nwtbDriverPresenceMap)return;window.__nwtbDriverPresenceMap=true;
const pos=r=>r?.has_location!==false&&r?.lat!=null&&r?.lon!=null&&Number.isFinite(Number(r.lat))&&Number.isFinite(Number(r.lon))&&Math.abs(Number(r.lat))<=90&&Math.abs(Number(r.lon))<=180;
const assigned=r=>!!(r?.route&&r.route_id&&(r.route.status==='ACTIVE'||r.route.status==='PLANNED'&&r.route.released_to_driver===true));
const phase=r=>window.NWTBDriverStatus.phase(r);
function install(){
 if(typeof renderMap!=='function'||typeof renderDrivers!=='function'||typeof live==='undefined')return false;
 if(window.__nwtbDriverPresenceInstalled)return true;window.__nwtbDriverPresenceInstalled=true;
 renderMap=function(){
  const current=new Set(),bounds=[];
  for(const r of live||[]){if(!pos(r))continue;const lat=Number(r.lat),lon=Number(r.lon);current.add(r.driver_employee_number);bounds.push([lat,lon]);
   const popup='<b>'+esc(r.display_name)+' ('+esc(r.driver_employee_number)+')</b><br>'+esc(phase(r))+'<br>LAST GPS: '+esc(r.captured_at?age(r.captured_at):'not reported');
   if(markers.has(r.driver_employee_number))markers.get(r.driver_employee_number).setLatLng([lat,lon]).setPopupContent(popup);
   else markers.set(r.driver_employee_number,L.marker([lat,lon],{icon:truckIcon(),zIndexOffset:1000}).addTo(map).bindPopup(popup));
  }
  for(const [id,marker]of markers)if(!current.has(id)){map.removeLayer(marker);markers.delete(id)}
  if(!mapFitted&&bounds.length){map.fitBounds(L.latLngBounds(bounds.concat([[41.682487,-88.072262]])).pad(.22),{maxZoom:12});mapFitted=true}
 };
 renderDrivers=function(){
  const cand=(orders||[]).find(x=>x.id===$('candidate')?.value);
  let rows=(live||[]).map(r=>({...r,dist:cand&&pos(r)&&window.NWTBDriverStatus.gpsFresh(r)?miles(Number(r.lat),Number(r.lon),Number(cand.lat),Number(cand.lon)):null}));
  if(cand)rows.sort((a,b)=>(a.dist??Infinity)-(b.dist??Infinity));
  $('drivers').innerHTML=rows.map((r,i)=>{
   const fixed=pos(r),stale=!window.NWTBDriverStatus.gpsFresh(r),canAdd=!!cand&&assigned(r);
   return '<div class="card"><b>'+esc(r.display_name)+' ('+esc(r.driver_employee_number)+')</b><div class="small" style="margin-top:7px;font-weight:900">'+esc(phase(r))+'</div><div class="'+(stale?'warn':'ok')+'">'+(fixed?(stale?'LAST KNOWN LOCATION':'LIVE GPS')+' • '+esc(age(r.captured_at)):'WAITING FOR DRIVER GPS')+'</div><div class="small">Accuracy: '+(r.accuracy_m==null?'—':Math.round(Number(r.accuracy_m))+' m')+(window.NWTBDriverStatus.speed(r)?' • '+window.NWTBDriverStatus.speed(r):'')+'</div>'+(cand&&r.dist!=null?'<p class="near">Approx. '+r.dist.toFixed(1)+' mi straight-line from selected stop</p>':'')+'<div class="actions">'+(fixed?'<button class="btn blue" data-locate-driver="'+esc(r.driver_employee_number)+'">SHOW ON NWTB MAP</button>':'')+(assigned(r)?'<button class="btn ghost" onclick="showRoute(\''+esc(r.route_id)+'\')">VIEW / EDIT ROUTE</button>':'')+(canAdd?'<button class="btn green" onclick="addSelected(\''+esc(r.route_id)+'\')">ADD SELECTED TO ROUTE</button>':'')+'</div></div>';
  }).join('')||'<div class="card">No logged-in drivers or released routes are currently reporting.</div>';
  document.querySelectorAll('[data-locate-driver]').forEach(button=>button.onclick=()=>{const marker=markers.get(button.dataset.locateDriver);if(marker){map.setView(marker.getLatLng(),Math.max(map.getZoom(),15));marker.openPopup();document.getElementById('map')?.scrollIntoView({block:'center',behavior:'smooth'})}});
 };
 const title=document.querySelector('.mapHead .small');if(title)title.textContent='White NWTB person without a route; van after route release. ONLINE/OFFLINE uses recent app activity. Old positions are LAST KNOWN LOCATION.';
 renderMap();renderDrivers();return true;
}
let tries=0;const timer=setInterval(()=>{if(install()||++tries>100)clearInterval(timer)},50);
})();
