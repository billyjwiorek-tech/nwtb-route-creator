(()=>{
'use strict';

const ENGINE='NWTB BUILT-IN GPS';
const TRACK_URL='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-live-tracking-v2';
const CHAT_URL='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-chat';
const API_KEY='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
const QUEUE_KEY='nwtb_builtin_gps_queue_v2';
const SEND_INTERVAL_MS=15000;
const HEARTBEAT_MS=30000;
const STALE_MS=45000;
const HARD_STALE_MS=90000;
const MIN_MOVE_M=10;
const MAX_QUEUE=120;

let running=false;
let watch=null;
let healthTimer=null;
let heartbeatTimer=null;
let lastFix=null;
let lastFixAt=0;
let lastSent=null;
let lastSentAt=0;
let sending=false;
let wakeLock=null;
let recoveries=0;

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const rad=x=>x*Math.PI/180;
function meters(a,b){if(!a||!b)return Infinity;const R=6371008.8,dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon),x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
function bearing(a,b){if(!a||!b)return null;const y=Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat));const x=Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon));const v=(Math.atan2(y,x)*180/Math.PI+360)%360;return Number.isFinite(v)?v:null}
function nowTime(){return new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit'})}
function context(){
 let emp='',rid='',tok='';
 try{if(typeof driver!=='undefined')emp=String(driver||'')}catch{}
 try{if(typeof route!=='undefined')rid=String(route||'')}catch{}
 try{if(typeof token!=='undefined')tok=String(token||'')}catch{}
 if(!emp)emp=localStorage.getItem('nwtb_delivery_driver')||'';
 if(!tok)tok=localStorage.getItem('nwtb_delivery_token')||'';
 return {driver:emp,route:rid,token:tok};
}
function trackEl(){return $('track')}
function status(text,kind='info'){
 const e=trackEl();if(!e)return;
 const color=kind==='ok'?'#176b3a':kind==='bad'?'#b42318':kind==='warn'?'#b54708':'#175cd3';
 e.innerHTML=`<span style="font-weight:900;color:${color}">${esc(ENGINE)}: ${esc(text)}</span>`;
}
function queueRead(){try{const q=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');return Array.isArray(q)?q:[]}catch{return []}}
function queueWrite(q){try{localStorage.setItem(QUEUE_KEY,JSON.stringify(q.slice(-MAX_QUEUE)))}catch{}}
function enqueue(p){const q=queueRead();q.push(p);queueWrite(q)}
async function freshToken(){
 const r=await fetch(CHAT_URL,{method:'POST',headers:{'content-type':'application/json','apikey':API_KEY},body:JSON.stringify({action:'delivery_guest_start'})});
 const j=await r.json().catch(()=>({}));if(!r.ok||!j.token)throw Error(j.error||'Could not refresh delivery session');
 localStorage.setItem('nwtb_delivery_token',j.token);
 try{if(typeof token!=='undefined')token=j.token}catch{}
 return j.token;
}
async function upload(payload,allowRefresh=true){
 let ctx=context(),tok=ctx.token;if(!tok)tok=await freshToken();
 let r=await fetch(TRACK_URL,{method:'POST',headers:{'content-type':'application/json','apikey':API_KEY,'x-nwtb-session':tok},body:JSON.stringify(payload)});
 if(r.status===401&&allowRefresh){tok=await freshToken();r=await fetch(TRACK_URL,{method:'POST',headers:{'content-type':'application/json','apikey':API_KEY,'x-nwtb-session':tok},body:JSON.stringify(payload)})}
 const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'GPS upload failed');return j;
}
function makePayload(fix){const c=context();return {action:'location_update',driver_employee_number:c.driver,route_id:c.route,lat:fix.lat,lon:fix.lon,accuracy_m:fix.accuracy,heading_deg:fix.heading,speed_mps:fix.speed,captured_at:fix.captured_at}}
async function flushQueue(){
 if(sending||!navigator.onLine)return;const ctx=context();if(!ctx.driver||!ctx.route)return;
 const q=queueRead();if(!q.length)return;sending=true;
 try{
  const keep=[];
  for(let i=0;i<q.length;i++){
   try{await upload(q[i])}catch(e){keep.push(...q.slice(i));break}
  }
  queueWrite(keep);
 }finally{sending=false}
}
async function sendFix(fix,force=false){
 const ctx=context();if(!ctx.driver||!ctx.route){status('WAITING FOR ACTIVE ROUTE','warn');return}
 const age=Date.now()-lastSentAt,move=meters(lastSent,fix);
 if(!force&&age<SEND_INTERVAL_MS&&move<MIN_MOVE_M)return;
 const payload=makePayload(fix);lastSentAt=Date.now();lastSent={lat:fix.lat,lon:fix.lon};
 if(!navigator.onLine){enqueue(payload);status(`OFFLINE — SAVING GPS • ${queueRead().length} queued`,'warn');return}
 try{
  await flushQueue();await upload(payload);
  const acc=Number.isFinite(fix.accuracy)?` • ±${Math.round(fix.accuracy)} m`:'';
  status(`LIVE • ${nowTime()}${acc}`,'ok');
 }catch(e){enqueue(payload);status(`UPLOAD DELAYED — SAVING GPS • ${queueRead().length} queued`,'warn')}
}
function normalizePosition(p){const c=p.coords||{},lat=Number(c.latitude),lon=Number(c.longitude);let heading=Number.isFinite(Number(c.heading))?Number(c.heading):null;if(heading===null&&lastFix&&Number.isFinite(lat)&&Number.isFinite(lon)&&meters(lastFix,{lat,lon})>=4)heading=bearing(lastFix,{lat,lon});return {lat,lon,accuracy:Number(c.accuracy),heading,speed:Number.isFinite(Number(c.speed))?Math.max(0,Number(c.speed)):null,captured_at:new Date(p.timestamp||Date.now()).toISOString()}}
function onFix(p){
 const f=normalizePosition(p);if(!Number.isFinite(f.lat)||!Number.isFinite(f.lon))return;
 lastFix=f;lastFixAt=Date.now();recoveries=0;sendFix(f,false);
}
function onError(e){
 const msg=e?.code===1?'LOCATION PERMISSION BLOCKED':e?.code===2?'GPS UNAVAILABLE':'GPS TIMEOUT';
 status(msg,e?.code===1?'bad':'warn');
 if(e?.code!==1)scheduleRecovery(3500);
}
function startWatch(){
 if(!running||!navigator.geolocation||watch!==null)return;
 status('STARTING…','info');
 watch=navigator.geolocation.watchPosition(onFix,onError,{enableHighAccuracy:true,maximumAge:2000,timeout:15000});
 navigator.geolocation.getCurrentPosition(onFix,()=>{}, {enableHighAccuracy:true,maximumAge:0,timeout:12000});
}
function clearWatch(){if(watch!==null&&navigator.geolocation){try{navigator.geolocation.clearWatch(watch)}catch{}watch=null}}
function scheduleRecovery(delay=1000){if(!running)return;setTimeout(()=>{if(!running)return;clearWatch();recoveries++;startWatch()},delay)}
async function getWakeLock(){
 try{if('wakeLock'in navigator&&document.visibilityState==='visible'){if(!wakeLock||wakeLock.released)wakeLock=await navigator.wakeLock.request('screen')}}catch{}
}
function releaseWakeLock(){try{if(wakeLock&&!wakeLock.released)wakeLock.release()}catch{}wakeLock=null}
function healthCheck(){
 if(!running)return;const age=Date.now()-lastFixAt;
 if(!lastFixAt){status('SEARCHING FOR GPS…','info');return}
 if(age>HARD_STALE_MS){status('GPS LOST — RESTARTING','bad');scheduleRecovery(0);return}
 if(age>STALE_MS){status('GPS DELAYED — REACQUIRING','warn');scheduleRecovery(0);return}
 if(navigator.onLine&&queueRead().length)flushQueue();
}
function heartbeat(){if(running&&lastFix)sendFix(lastFix,true)}
function startTimers(){
 if(!healthTimer)healthTimer=setInterval(healthCheck,10000);
 if(!heartbeatTimer)heartbeatTimer=setInterval(heartbeat,HEARTBEAT_MS);
}
function stopTimers(){if(healthTimer){clearInterval(healthTimer);healthTimer=null}if(heartbeatTimer){clearInterval(heartbeatTimer);heartbeatTimer=null}}
function start(){
 const ctx=context();if(!ctx.driver){status('SELECT DRIVER','warn');return}
 if(!ctx.route){status('OPEN OR START A ROUTE','warn');return}
 if(!navigator.geolocation){status('GPS NOT SUPPORTED','bad');return}
 if(running){getWakeLock();return}
 running=true;lastFixAt=0;recoveries=0;startTimers();startWatch();getWakeLock();
 window.__nwtbBuiltInTracker={engine:ENGINE,running:true,receiver:'V2'};
}
function stop(){running=false;clearWatch();stopTimers();releaseWakeLock();window.__nwtbBuiltInTracker={engine:ENGINE,running:false,receiver:'V2'};status('OFF','warn')}

window.addEventListener('online',()=>{if(running){status('CONNECTION RESTORED — SENDING SAVED GPS','info');flushQueue();if(lastFix)sendFix(lastFix,true)}});
window.addEventListener('offline',()=>{if(running)status('OFFLINE — GPS WILL BE SAVED','warn')});
document.addEventListener('visibilitychange',()=>{if(!running)return;if(document.visibilityState==='visible'){getWakeLock();navigator.geolocation?.getCurrentPosition(onFix,()=>scheduleRecovery(0),{enableHighAccuracy:true,maximumAge:0,timeout:12000});if(watch===null)startWatch()}else{releaseWakeLock()}});
window.addEventListener('pageshow',()=>{if(running){getWakeLock();scheduleRecovery(0)}});

try{if(typeof startTracking==='function')startTracking=start}catch{window.startTracking=start}
try{if(typeof stopTracking==='function')stopTracking=stop}catch{window.stopTracking=stop}
window.nwtbStartBuiltInTracking=start;
window.nwtbStopBuiltInTracking=stop;

setInterval(()=>{try{const ctx=context(),txt=$('routes')?.textContent||'';if(!running&&ctx.driver&&ctx.route&&/ACTIVE/i.test(txt))start()}catch{}},5000);

})();
