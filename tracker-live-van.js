(()=>{
'use strict';
const NEAR_STOP_M=152.4; // 500 ft
const targetCache=new Map();
const prevPos=new Map();
const prevHeading=new Map();
let refreshBusy=false;

const rad=x=>x*Math.PI/180;
const deg=x=>x*180/Math.PI;
function meters(a,b){if(!a||!b)return Infinity;const R=6371008.8,dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon),x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
function bearing(a,b){if(!a||!b)return null;const y=Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat));const x=Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon));let v=(deg(Math.atan2(y,x))+360)%360;return Number.isFinite(v)?v:null}
function smoothHeading(current,target){if(!Number.isFinite(target))return current;const d=((target-current+540)%360)-180;return (current+d*.48+360)%360}
function good(lat,lon){return Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))&&Math.abs(Number(lat))>1&&Math.abs(Number(lon))>1}
function smallScreen(){return window.matchMedia&&window.matchMedia('(max-width:720px)').matches}
function escv(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

function style(){
 if(document.getElementById('nwtbLiveVanStyle'))return;
 const s=document.createElement('style');s.id='nwtbLiveVanStyle';s.textContent=`
 .nwtbVanShell{position:relative;transform-origin:50% 58%;filter:drop-shadow(0 3px 5px rgba(15,23,42,.32));will-change:transform;pointer-events:none}
 .nwtbVanShell.desktop{width:82px;height:54px}.nwtbVanShell.mobile{width:58px;height:40px}
 .nwtbVanBody{position:absolute;left:4px;top:9px;width:57px;height:32px;background:linear-gradient(180deg,#fff,#eef2f6);border:2px solid #17202a;border-radius:7px 5px 5px 7px;overflow:hidden;box-sizing:border-box}
 .desktop .nwtbVanBody{left:5px;top:9px;width:60px;height:34px;border-width:2.5px}.mobile .nwtbVanBody{left:4px;top:8px;width:40px;height:24px;border-width:2px}
 .nwtbVanCab{position:absolute;left:56px;top:16px;width:22px;height:25px;background:#fff;border:2.5px solid #17202a;border-left:0;border-radius:0 8px 5px 0;box-sizing:border-box}.mobile .nwtbVanCab{left:40px;top:13px;width:15px;height:19px;border-width:2px;border-left:0;border-radius:0 6px 4px 0}
 .nwtbVanWindow{position:absolute;left:4px;top:4px;width:11px;height:8px;background:#bfdbfe;border:1.5px solid #17202a;border-radius:2px;box-sizing:border-box}.mobile .nwtbVanWindow{left:3px;top:3px;width:8px;height:6px;border-width:1px}
 .nwtbWheel{position:absolute;width:12px;height:12px;border-radius:50%;background:#17202a;border:2px solid #fff;top:38px;box-sizing:border-box}.desktop .nwtbWheel{top:38px}.mobile .nwtbWheel{width:9px;height:9px;top:29px;border-width:1.5px}
 .nwtbWheel.a{left:14px}.nwtbWheel.b{left:59px}.mobile .nwtbWheel.a{left:10px}.mobile .nwtbWheel.b{left:42px}
 .nwtbVanLogo{position:absolute;left:7px;top:5px;width:43px;height:23px;object-fit:contain}.mobile .nwtbVanLogo{display:none}
 .nwtbVanText{display:none;position:absolute;left:5px;top:4px;color:#f58220;font:950 italic 12px/1 Arial,sans-serif;letter-spacing:-.6px}.mobile .nwtbVanText{display:block;font-size:10px;top:5px;left:4px}
 .nwtbLiveDot{position:absolute;right:-5px;top:-5px;width:10px;height:10px;border-radius:50%;background:#22c55e;border:2px solid #fff;box-shadow:0 0 0 0 rgba(34,197,94,.48);animation:nwtbLivePulse 1.7s infinite}.mobile .nwtbLiveDot{width:8px;height:8px;right:-4px;top:-4px}
 @keyframes nwtbLivePulse{70%{box-shadow:0 0 0 10px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
 .nwtbNearStopRing{position:absolute;left:50%;top:50%;width:92px;height:92px;border:4px solid #2563eb;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 0 11px 4px rgba(37,99,235,.75),inset 0 0 9px rgba(37,99,235,.35);animation:nwtbNearStopPulse 1.05s ease-in-out infinite;pointer-events:none}.mobile .nwtbNearStopRing{width:66px;height:66px;border-width:3px}
 @keyframes nwtbNearStopPulse{0%,100%{opacity:.35;transform:translate(-50%,-50%) scale(.88)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.08)}}
 `;document.head.appendChild(s)
}

function vanIcon(heading,near){
 style();const mobile=smallScreen(),cls=mobile?'mobile':'desktop',w=mobile?66:94,h=mobile?50:66,angle=((Number.isFinite(Number(heading))?Number(heading):0)-90+360)%360;
 const html=`<div class="nwtbVanShell ${cls}" style="transform:rotate(${angle}deg)">${near?'<span class="nwtbNearStopRing"></span>':''}<div class="nwtbVanBody"><img class="nwtbVanLogo" src="nwt-logo.svg" alt="NWTB"><span class="nwtbVanText">NWTB</span></div><div class="nwtbVanCab"><span class="nwtbVanWindow"></span></div><span class="nwtbWheel a"></span><span class="nwtbWheel b"></span><span class="nwtbLiveDot"></span></div>`;
 return L.divIcon({className:'',html,iconSize:[w,h],iconAnchor:[w/2,h/2],popupAnchor:[0,-h/2]})
}

function rowHeading(r){
 const id=String(r?.driver_employee_number||'');let h=Number(r?.heading_deg);const now={lat:Number(r?.lat),lon:Number(r?.lon)};
 const previousHeading=Number(prevHeading.get(id)??0);
 if(!Number.isFinite(h)){
  const prev=prevPos.get(id);if(prev&&good(now.lat,now.lon)&&meters(prev,now)>=4)h=bearing(prev,now)
 }
 if(good(now.lat,now.lon))prevPos.set(id,now);
 const smooth=smoothHeading(previousHeading,Number.isFinite(h)?h:previousHeading);prevHeading.set(id,smooth);return smooth
}
function nearStop(r){
 const t=targetCache.get(String(r?.route_id||''));if(!t||!good(r?.lat,r?.lon))return false;
 return meters({lat:Number(r.lat),lon:Number(r.lon)},t)<=NEAR_STOP_M
}
function decorateMarkers(){
 if(typeof live==='undefined'||typeof markers==='undefined'||typeof L==='undefined')return;
 for(const r of live||[]){
  const m=markers.get(r.driver_employee_number);if(!m)continue;
  const near=nearStop(r),h=rowHeading(r);m.setIcon(vanIcon(h,near));
  const t=targetCache.get(String(r.route_id||''));
  if(near&&t){const p=m.getPopup();if(p){let c=p.getContent()||'';if(!String(c).includes('NEAR NEXT STOP'))p.setContent(String(c)+`<div style="margin-top:7px;padding:6px 8px;border-radius:8px;background:#eef4ff;color:#175cd3;font-weight:900">NEAR NEXT STOP: ${escv(t.name||'Stop')}</div>`)}}
 }
}

async function loadRouteTarget(routeId){
 if(!routeId||typeof post!=='function'||typeof API==='undefined')return;
 try{
  const j=await post(API,{action:'route_get',route_id:routeId});
  const next=(j.stops||[]).find(s=>String(s.status||'').toUpperCase()==='PENDING');
  if(!next){targetCache.delete(String(routeId));return}
  const o=next.delivery_orders||{},lat=Number(o.lat),lon=Number(o.lon);
  if(good(lat,lon))targetCache.set(String(routeId),{lat,lon,name:o.customer_name||'Next stop',stop_id:next.id});
  else targetCache.delete(String(routeId));
 }catch{}
}
async function refreshTargets(){
 if(refreshBusy||typeof live==='undefined')return;refreshBusy=true;
 try{const ids=[...new Set((live||[]).map(r=>r.route_id).filter(Boolean))];await Promise.all(ids.map(loadRouteTarget));decorateMarkers()}finally{refreshBusy=false}
}
function install(){
 if(typeof renderMap!=='function'||typeof live==='undefined'||typeof markers==='undefined')return false;
 if(window.__nwtbLiveVanInstalled)return true;window.__nwtbLiveVanInstalled=true;style();
 const original=renderMap;renderMap=function(){const out=original.apply(this,arguments);setTimeout(()=>{decorateMarkers();refreshTargets()},0);return out};
 setInterval(()=>{try{refreshTargets();decorateMarkers()}catch{}},10000);
 setTimeout(()=>{refreshTargets();decorateMarkers()},500);
 return true
}
let tries=0;const timer=setInterval(()=>{if(install()||++tries>120)clearInterval(timer)},100);
})();
