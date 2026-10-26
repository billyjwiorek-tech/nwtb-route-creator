/* Shared Office-only route overlay. Every request here is a read-only road calculation. */
(()=>{
'use strict';
const BASE='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/',PUB='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])),cache=new Map();
function driverIcon(L,assigned,fresh){
 const dot=fresh?'#22c55e':'#98a2b3';
 const person='<path d="M30 31C21 25 22 12 28 6C34 0 47 1 53 8C60 16 58 26 50 31L73 48Q77 51 73 56L68 63Q66 66 62 63L53 57L54 75L64 102Q66 107 61 107L51 107Q47 107 46 104L40 91L35 103Q33 107 30 107L21 107Q16 107 18 102L27 75L28 57L19 63Q15 66 13 63L8 56Q4 52 8 48Z" fill="#fff" stroke="#15304e" stroke-width="2.5"/><g fill="#f58220" font-family="Arial" font-size="12" font-weight="900" text-anchor="middle"><text x="40" y="46">N</text><text x="40" y="58">W</text><text x="40" y="70">T</text><text x="40" y="82">B</text></g><circle cx="59" cy="36" r="6" fill="'+dot+'" stroke="white" stroke-width="2.5"/>';
 const van='<path d="M5 20Q5 12 13 12H57V52H5Z" fill="white" stroke="#15304e" stroke-width="3"/><path d="M57 25H73L85 37V52H57Z" fill="white" stroke="#15304e" stroke-width="3"/><path d="M63 30H71L78 38H63Z" fill="#bfdbfe" stroke="#15304e"/><text x="11" y="38" fill="#f58220" font-family="Arial" font-size="15" font-weight="900">NWTB</text><circle cx="22" cy="53" r="8" fill="#15304e" stroke="white" stroke-width="2"/><circle cx="70" cy="53" r="8" fill="#15304e" stroke="white" stroke-width="2"/><circle cx="80" cy="16" r="6" fill="'+dot+'" stroke="white" stroke-width="2"/>';
 return L.divIcon({className:'',html:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+(assigned?'0 0 92 68':'0 0 80 112')+'" width="100%" height="100%" role="img" aria-label="'+(assigned?'NWTB driver van':'NWTB driver without a route')+'">'+(assigned?van:person)+'</svg>',iconSize:assigned?[76,58]:[48,70],iconAnchor:assigned?[38,29]:[24,65]});
}
async function road(a,b,signal){
 const key=[a.lat,a.lon,b.lat,b.lon].join(':'),saved=cache.get(key);if(saved&&Date.now()-saved.at<600000)return saved.geometry;
 const r=await fetch(BASE+'nwtb-driver-navigation',{method:'POST',cache:'no-store',signal,headers:{'content-type':'application/json','apikey':PUB,'x-nwtb-session':localStorage.getItem('nwtb_delivery_token')||''},body:JSON.stringify({action:'route',origin:{lat:Number(a.lat),lon:Number(a.lon)},destination:{lat:Number(b.lat),lon:Number(b.lon)}})});
 const j=await r.json();if(!r.ok||!Array.isArray(j.geometry)||j.geometry.length<2||j.geometry.some(c=>!Array.isArray(c)||!window.NWTBOfficeRouteMap.valid({lat:c[1],lon:c[0]})))throw Error('Road path unavailable');
 cache.set(key,{at:Date.now(),geometry:j.geometry});if(cache.size>300)cache.delete(cache.keys().next().value);return j.geometry;
}
function create({map,L,onStatus=()=>{},showDriver=true,onOpen=()=>{}}){
 const group=L.layerGroup().addTo(map),path=L.layerGroup().addTo(map),phone=L.layerGroup().addTo(map),position=L.layerGroup().addTo(map);
 let generation=0,controller=null,key='',bounds=[],lastRoute='',destroyed=false,phoneKey='',driverMarker=null,currentLocation=null;
 const getBoundsPoints=()=>[...bounds,...(window.NWTBOfficeRouteMap.valid(currentLocation)?[[Number(currentLocation.lat),Number(currentLocation.lon)]]:[])];
 const fit=()=>{const points=getBoundsPoints();if(points.length)map.fitBounds(L.latLngBounds(points),{padding:[38,38],maxZoom:14});};
 const line=(geometry,style,layer,label)=>L.polyline(geometry.map(c=>[c[1],c[0]]),style).addTo(layer).bindTooltip(label);
 async function update(detail){
  if(destroyed)return;
  const {route,stops=[],phone:report,location,driver}=detail;currentLocation=location;
  if(showDriver&&location&&window.NWTBOfficeRouteMap.valid(location)){
   const age=Date.now()-Date.parse(location.captured_at),fresh=age>=-15000&&age<120000&&!(Number(location.accuracy_m)>500),icon=driverIcon(L,!!route&&['ACTIVE','PLANNED'].includes(route.status)&&(route.status==='ACTIVE'||route.released_to_driver===true),fresh),popup='<b>'+esc(driver?.display_name||'Driver')+'</b><br>'+esc(fresh?'LIVE GPS':'LAST KNOWN LOCATION')+'<br>'+esc(new Date(location.captured_at).toLocaleString());
   if(driverMarker)driverMarker.setLatLng([location.lat,location.lon]).setIcon(icon).setPopupContent(popup);else driverMarker=L.marker([location.lat,location.lon],{icon,zIndexOffset:1100}).addTo(position).bindPopup(popup);
  }else{position.clearLayers();driverMarker=null;}
  const actual=report?.live&&report.snapshot?.navigation_active&&Array.isArray(report.geometry)&&report.geometry.length>1,nextPhoneKey=actual?report.snapshot.geometry_key:'';
  if(nextPhoneKey!==phoneKey){phoneKey=nextPhoneKey;phone.clearLayers();if(actual)line(report.geometry,{color:'#7c3aed',weight:7,opacity:.95},phone,'CURRENT PATH DISPLAYED ON DRIVER PHONE');}
  const nextKey=JSON.stringify([route?.id,route?.updated_at,stops.map(s=>[s.id,s.status,s.stop_sequence,s.delivery_orders?.lat,s.delivery_orders?.lon])]);if(nextKey===key)return;
  key=nextKey;generation++;const current=generation;controller?.abort();controller=new AbortController();const signal=controller.signal;group.clearLayers();path.clearLayers();bounds=[];
  if(!route){if(lastRoute!=='idle-'+driver?.employee_number){lastRoute='idle-'+driver?.employee_number;fit();}onStatus('No selected route. Location is labeled LIVE GPS or LAST KNOWN LOCATION by its update time.');return;}
  const model=window.NWTBOfficeRouteMap.model(route,stops),valid=window.NWTBOfficeRouteMap.valid;
  for(const p of model.points){if(!valid(p))continue;bounds.push([Number(p.lat),Number(p.lon)]);
   const color=p.kind!=='STOP'?'#101828':p.status==='DELIVERED'?'#15803d':p.status==='NOT_DELIVERED'?'#b42318':'#f58220',icon=L.divIcon({className:'',html:'<div style="background:'+color+';color:white;border:2px solid white;border-radius:9px;padding:7px;min-width:28px;text-align:center;font:bold 11px Arial;box-shadow:0 2px 8px #10182855">'+esc(p.label)+'</div>',iconSize:[p.kind==='STOP'?34:64,32],iconAnchor:[p.kind==='STOP'?17:32,16]});
   L.marker([p.lat,p.lon],{icon,zIndexOffset:500}).addTo(group).bindPopup('<b>'+esc(p.kind==='STOP'?'STOP '+p.label:p.label)+' — '+esc(p.name)+'</b><br>'+esc(p.address)+(p.status?'<br>'+esc(p.status):'')).on('dblclick',()=>onOpen(route));
  }
  if(lastRoute!==route.id){lastRoute=route.id;fit();}if(model.missing.length){onStatus('Some stops need coordinates. Every saved stop remains listed; the road path is incomplete.',true);return;}
  onStatus('Drawing saved road route…');let failed=0,next=0;const legs=model.points.slice(1).map((b,i)=>({a:model.points[i],b}));
  async function worker(){while(next<legs.length&&current===generation){const {a,b}=legs[next++];try{if(Number(a.lat)!==Number(b.lat)||Number(a.lon)!==Number(b.lon)){const geometry=await road(a,b,signal);if(current!==generation||destroyed)return;line(geometry,{color:b.kind==='RETURN'?'#f58220':'#2563eb',weight:4,opacity:.75},path,b.kind==='RETURN'?'ASSIGNED RETURN LEG':'ASSIGNED ROUTE TO STOP '+b.label);}}catch{if(signal.aborted)return;failed++;}}}
  await Promise.all([worker(),worker()]);if(current===generation&&!destroyed)onStatus(failed?'Road path incomplete — '+failed+' leg(s) unavailable. Stop pins remain visible.':'Blue: assigned road route • Orange: return leg • Purple: current path reported by the driver phone.',failed>0);
 }
 function destroy(){destroyed=true;generation++;controller?.abort();for(const layer of [group,path,phone,position])map.removeLayer(layer);}
 return {update,fit,destroy,getBoundsPoints};
}
window.NWTBOfficeDriverMap={create};
})();
