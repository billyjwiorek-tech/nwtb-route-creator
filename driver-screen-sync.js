/* Passive screen reporter. It never requests GPS, starts a route, logs in, or reads the Office token. */
(()=>{
'use strict';
if(window.__nwtbDriverScreenSync)return;window.__nwtbDriverScreenSync=true;
const API='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-office-driver-view';
const PUB='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
const page=crypto.randomUUID(),token=()=>localStorage.getItem('nwtb_driver_token')||'';
let sequence=0,busy=false,lastToken='',lastGeometry='',geometrySentAt=0,controller=null;
function capture(){
 const nav=window.nwtbNavigationScreenState?.()||{},pod=window.nwtbPodScreenState?.()||{},view=window.__nwtbDriverScreenView;
 let selected='';try{selected=typeof route==='string'?route:''}catch{}
 const active=nav.navigation_active===true,routeId=active?nav.route_id:view==='ROUTE'?selected||null:null;
 return {version:1,edition:location.pathname.endsWith('/driver-standard.html')?'STANDARD':'GPS',view:routeId?'ROUTE':'ROUTE_LIST',
  visible:document.visibilityState==='visible',...nav,...pod,route_id:routeId,
  route_updated_at:window.__nwtbDriverScreenRoute?.updated_at||null,displayed_stops:routeId?(window.__nwtbDriverScreenRoute?.stops||[]):[],voice:window.nwtbVoiceScreenState?.()||null,
  geometry_key:nav.geometry_key?page+':'+nav.geometry_key:null,
  ...(!active?{navigation_active:false,target:null,arrived_stop_id:null,arrival_visible:false,eta:'',distance:'',turn:'',turn_distance:'',banner:'',mode:'',fix_at:null,position:null,geometry_key:null,geometry:null}:{})};
}
async function report(){
 const session=token();
 if(session!==lastToken){controller?.abort();lastToken=session;lastGeometry='';geometrySentAt=0;}
 if(!session||busy||navigator.onLine===false)return;
 let snapshot;try{snapshot=capture()}catch{return}
 const geometry=snapshot.geometry;delete snapshot.geometry;
 const include=!!snapshot.geometry_key&&(lastGeometry!==snapshot.geometry_key||Date.now()-geometrySentAt>60000);
 const payload={action:'driver_snapshot',page_id:page,sequence:++sequence,captured_at:new Date().toISOString(),snapshot,...(include?{geometry}:{})};
 busy=true;const request=new AbortController();controller=request;const timeout=setTimeout(()=>request.abort(),10000);
 try{
  const r=await fetch(API,{method:'POST',cache:'no-store',headers:{'content-type':'application/json','apikey':PUB,'x-nwtb-session':session},signal:request.signal,body:JSON.stringify(payload),keepalive:!include});
  const j=await r.json();if(r.ok&&j.stored&&token()===session&&include){lastGeometry=snapshot.geometry_key;geometrySentAt=Date.now();}
 }catch{/* Screen sync must never interrupt a delivery or create an offline mutation queue. */}
 finally{clearTimeout(timeout);if(controller===request)controller=null;busy=false;}
}
setInterval(report,5000);setTimeout(report,2000);
document.addEventListener('visibilitychange',report);window.addEventListener('online',report);window.addEventListener('pageshow',report);
window.addEventListener('storage',e=>{if(e.key==='nwtb_driver_token'){controller?.abort();lastGeometry='';void report();}});
})();
