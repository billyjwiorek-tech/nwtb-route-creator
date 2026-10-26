/* Shared Office-only route overlay. Every request here is a read-only road calculation. */
(()=>{
'use strict';
const BASE='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/',PUB='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])),cache=new Map();
async function road(a,b,signal){
 const key=[a.lat,a.lon,b.lat,b.lon].join(':'),saved=cache.get(key);if(saved&&Date.now()-saved.at<600000)return saved.geometry;
 const r=await fetch(BASE+'nwtb-driver-navigation',{method:'POST',cache:'no-store',signal,headers:{'content-type':'application/json','apikey':PUB,'x-nwtb-session':localStorage.getItem('nwtb_delivery_token')||''},body:JSON.stringify({action:'route',origin:{lat:Number(a.lat),lon:Number(a.lon)},destination:{lat:Number(b.lat),lon:Number(b.lon)}})});
 const j=await r.json();if(!r.ok||!Array.isArray(j.geometry)||j.geometry.length<2||j.geometry.some(c=>!Array.isArray(c)||!window.NWTBOfficeRouteMap.valid({lat:c[1],lon:c[0]})))throw Error('Road path unavailable');
 cache.set(key,{at:Date.now(),geometry:j.geometry});if(cache.size>300)cache.delete(cache.keys().next().value);return j.geometry;
}
function create({map,L,onStatus=()=>{},showDriver=true,onOpen=()=>{}}){
 const group=L.layerGroup().addTo(map),path=L.layerGroup().addTo(map),phone=L.layerGroup().addTo(map),position=L.layerGroup().addTo(map);
 let generation=0,controller=null,key='',bounds=[],lastRoute='',destroyed=false,phoneKey='';
 const fit=()=>{if(bounds.length)map.fitBounds(L.latLngBounds(bounds),{padding:[38,38],maxZoom:14});};
 const line=(geometry,style,layer,label)=>L.polyline(geometry.map(c=>[c[1],c[0]]),style).addTo(layer).bindTooltip(label);
 async function update(detail){
  if(destroyed)return;
  const {route,stops=[],phone:report,location,driver}=detail;position.clearLayers();
  if(showDriver&&location&&window.NWTBOfficeRouteMap.valid(location)){
   const fresh=Date.now()-Date.parse(location.captured_at)<120000,icon=L.divIcon({className:'',html:'<div style="background:#101828;color:#fff;border:3px solid white;border-radius:10px;padding:6px;font-size:20px;box-shadow:0 3px 10px #10182866">'+(route?'🚐':'♟')+'</div>',iconSize:[42,42],iconAnchor:[21,21]});
   L.marker([location.lat,location.lon],{icon,zIndexOffset:1100}).addTo(position).bindPopup('<b>'+esc(driver?.display_name||'Driver')+'</b><br>'+esc(fresh?'LIVE GPS':'LAST KNOWN LOCATION')+'<br>'+esc(new Date(location.captured_at).toLocaleString()));
  }
  const actual=report?.live&&report.snapshot?.navigation_active&&Array.isArray(report.geometry)&&report.geometry.length>1,nextPhoneKey=actual?report.snapshot.geometry_key:'';
  if(nextPhoneKey!==phoneKey){phoneKey=nextPhoneKey;phone.clearLayers();if(actual)line(report.geometry,{color:'#7c3aed',weight:7,opacity:.95},phone,'CURRENT PATH DISPLAYED ON DRIVER PHONE');}
  const nextKey=JSON.stringify([route?.id,route?.updated_at,stops.map(s=>[s.id,s.status,s.stop_sequence,s.delivery_orders?.lat,s.delivery_orders?.lon])]);if(nextKey===key)return;
  key=nextKey;generation++;const current=generation;controller?.abort();controller=new AbortController();const signal=controller.signal;group.clearLayers();path.clearLayers();bounds=[];
  if(!route){onStatus('No assigned route. Driver GPS is shown only when a location is available.');return;}
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
 return {update,fit,destroy};
}
window.NWTBOfficeDriverMap={create};
})();
