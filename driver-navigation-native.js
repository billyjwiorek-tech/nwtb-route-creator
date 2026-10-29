(()=>{
const NAV='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-driver-navigation';
const DEPOTS_NAV={BOLINGBROOK:{name:'Northwest Trucks - Bolingbrook',address:'201 S W Frontage Rd, Bolingbrook, IL 60440',lat:41.682487,lon:-88.072262},PALATINE:{name:'Northwest Trucks - Palatine',address:'2120 N Rand Rd, Palatine, IL 60074',lat:42.148326,lon:-88.033080}};function depotTarget(r){const d=DEPOTS_NAV[String(r?.depot||'BOLINGBROOK').toUpperCase()]||DEPOTS_NAV.BOLINGBROOK;if(validCoord(r?.end_lat,r?.end_lon))return{name:r.end_name||d.name,address:r.end_address||d.address,lat:Number(r.end_lat),lon:Number(r.end_lon),final:true};if(validCoord(r?.start_lat,r?.start_lon))return{name:r.start_name||d.name,address:r.start_address||d.address,lat:Number(r.start_lat),lon:Number(r.start_lon),final:true};return{...d,final:true}}
const NEAR_STOP_M=152.4,ARRIVAL_M=6.096,ARRIVAL_SOFT_MAX_M=30,TRAFFIC_REFRESH_MS=90000;
const NAV_GPS_STALE_MS=25000,NAV_GPS_RECOVERY_MS=15000;
let navMap=null,navPanel=null,navLine=null,navPos=null,navGlow=null,navDest=null,navWatch=null,navTarget=null,navSteps=[],navStepIndex=0,navRouteCoords=[],navLastReroute=0,navLastSpoken='',navRouteId='',navRouteMeta=null,arrivalFor='',arrivalHits=0,navGeneration=0;
let navTrafficAware=false,navRouteSource='',navLastTrafficCheck=0,navTrafficBusy=false;
let navVoiceCues=[];
let navProgress=null,navLastFix=null,navHealthTimer=null,navWatchSerial=0,navLastRecovery=0,navPermissionBlocked=false,navRouteSequence=0,navRoutingRequest=0;
let navGeometryRevision=0;
let navManeuverAlong=[];
let navHandoffPending=null;
let navRoutingMeta=null,navLastRouteChange=0,navRequestController=null,navHeading=null,navHeadingAt=0,navOffRouteSince=0,navOffRouteCount=0,navTrafficFailed=false;
function syncVoiceStatus(){
 const panel=document.getElementById('nwtbNavPanel');if(!panel)return;
 let box=document.getElementById('nwtbVoiceHealth');if(!box){box=document.createElement('div');box.id='nwtbVoiceHealth';box.className='navBanner warn';box.innerHTML='<span>VOICE PAUSED — TAP TO RESUME VOICE. Keep NWTB visible for web navigation.</span> <button class="btn navVoice" type="button">RESUME VOICE</button>';box.querySelector('button').onclick=()=>{window.nwtbPrimeVoice?.(false);window.nwtbRepeatTurn();syncVoiceStatus();};panel.appendChild(box);}
 const state=window.nwtbVoiceScreenState?.();box.hidden=!state?.needs_tap;
}
document.addEventListener('nwtb-voice-status',syncVoiceStatus);
// Read-only screen state. Office observes these exact displayed values; this getter never starts GPS or navigation.
window.nwtbNavigationScreenState=()=>({route_id:navRouteId||null,navigation_active:!!navTarget&&!!document.getElementById('nwtbNavPanel')?.classList.contains('show'),
 target:navTarget?{...navTarget}:null,arrived_stop_id:navTarget?.stop_id&&arrivalFor===navTarget.stop_id?navTarget.stop_id:null,
 arrival_visible:!!document.getElementById('nwtbArrival')?.classList.contains('show'),
 eta:document.getElementById('nwtbEta')?.textContent||'',distance:document.getElementById('nwtbRemain')?.textContent||'',
 turn:document.getElementById('nwtbTurn')?.textContent||'',turn_distance:document.getElementById('nwtbTurnDist')?.textContent||'',
 banner:document.getElementById('nwtbNavBanner')?.textContent||'',mode:document.getElementById('nwtbNavMode')?.textContent||'',
 traffic_aware:navTrafficAware&&!navTrafficFailed,source:navRouteSource,fix_at:navLastFix?new Date(navLastFix.at).toISOString():null,
 position:navLastFix?.pos?{...navLastFix.pos}:null,geometry_key:navTarget&&navRouteCoords.length?navRouteId+':'+navGeometryRevision:null,geometry:navRouteCoords,
 handoff_pending:!!navHandoffPending,routing:navRoutingMeta});

const hav=(a,b)=>{const R=6371008.8,p=Math.PI/180,dLat=(b.lat-a.lat)*p,dLon=(b.lon-a.lon)*p,x=Math.sin(dLat/2)**2+Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x))};
const feet=m=>m<160.934?`${Math.max(10,Math.round(m/0.3048/10)*10)} ft`:`${(m/1609.344).toFixed(1)} mi`;
const eta=s=>{const min=Math.max(1,Math.round(Number(s||0)/60));return min<60?`${min} min`:`${Math.floor(min/60)} hr ${min%60?min%60+' min':''}`.trim()};
const validCoord=(lat,lon)=>Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))&&Math.abs(Number(lat))>1&&Math.abs(Number(lon))>1;

function instruction(step){
 const direct=String(step?.instruction_text||'').replace(/\s+/g,' ').trim();if(direct)return direct;
 const m=step?.maneuver||{},road=step?.name||step?.ref||'',mod=m.modifier||'',type=m.type||'';
 if(type==='arrive')return `Arrive at ${navTarget?.name||'destination'}`;
 if(type==='depart')return road?`Head ${mod||'forward'} on ${road}`:`Head ${mod||'forward'}`;
 if(type==='roundabout'||type==='rotary'){const ex=m.exit?` and take exit ${m.exit}`:'';return `Enter the roundabout${ex}${road?' onto '+road:''}`}
 if(type==='merge')return `Merge ${mod||''}${road?' onto '+road:''}`.trim();
 if(type==='on ramp'||type==='off ramp')return `${type==='on ramp'?'Take the ramp':'Take the exit'} ${mod||''}${road?' toward '+road:''}`.trim();
 if(type==='fork')return `Keep ${mod||'ahead'}${road?' toward '+road:''}`;
 if(type==='end of road')return `At the end of the road, turn ${mod||''}${road?' onto '+road:''}`.trim();
 if(type==='continue'||type==='new name'||type==='notification')return `Continue ${mod||''}${road?' on '+road:''}`.trim();
 if(type==='turn')return `Turn ${mod||''}${road?' onto '+road:''}`.trim();
 return `${type||'Continue'} ${mod||''}${road?' on '+road:''}`.trim();
}
function speak(text,force=false,callbacks={}){
 if(!text||!('speechSynthesis'in window)||!force&&text===navLastSpoken)return false;
 try{
  if(typeof window.nwtbVoiceSay==='function'){if(window.nwtbVoiceSay(text,callbacks)===false)return false}
  else{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.rate=.95;u.pitch=1;speechSynthesis.speak(u);callbacks.onStart?.()}
  navLastSpoken=text;return true;
 }catch{return false}
}
function announceTurn(step,distance,initial=false){
 if(!step||!Number.isFinite(distance)||!initial&&distance>=220)return;
 const text=instruction(step),m=step.maneuver||{},loc=m.location||[];
 const point=loc.length===2&&validCoord(loc[1],loc[0])?{lat:Number(loc[1]),lon:Number(loc[0])}:null;
 const identity=JSON.stringify([text.toLowerCase(),m.type||'',m.modifier||'',m.exit||'']);
 // Keep progress across traffic refreshes and small changes to the same junction.
 let cue=navVoiceCues.find(c=>c.identity===identity&&(point&&c.point?hav(point,c.point)<=20:!point&&!c.point&&c.index===navStepIndex));
 if(!cue){cue={identity,point,index:navStepIndex,stage:0};navVoiceCues.push(cue)}
 const stage=distance<45?2:1;
 if(cue.stage>=stage||cue.pending>=stage)return;
 const prior=cue.stage;cue.pending=stage;
 if(!speak((stage===2?'Now, ':'')+text,true,{onStart:()=>{cue.stage=Math.max(cue.stage,stage);cue.pending=0},onError:()=>{cue.pending=0;cue.stage=prior}}))cue.pending=0;
}
function routingLabel(){return navTrafficAware&&!navTrafficFailed?'NWTB TURN-BY-TURN • LIVE TRAFFIC':navRouteSource?'NWTB TURN-BY-TURN • NO LIVE TRAFFIC':'NWTB TURN-BY-TURN'}
function bannerText(base){return navTrafficFailed?`TRAFFIC UPDATE UNAVAILABLE • ${base}`:navTrafficAware?`LIVE TRAFFIC • ${base}`:base}
function setRoutingMode(){const x=document.getElementById('nwtbNavMode');if(x)x.textContent=routingLabel()}
function buildProgress(data){
 const points=(data.geometry||[]).filter(c=>Array.isArray(c)&&validCoord(c[1],c[0])).map(c=>({lat:Number(c[1]),lon:Number(c[0])}));
 const cumulative=[0];for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+hav(points[i-1],points[i]));
 const length=cumulative.at(-1)||0;if(points.length<2||length<=0)return null;
 const distance=Number(data.distance_m)>0?Number(data.distance_m):length,duration=Number(data.duration_s)>0?Number(data.duration_s):null;
 const steps=(data.steps||[]).filter(s=>Number(s.distance_m)>0&&Number(s.duration_s)>=0),stepMeters=steps.reduce((n,s)=>n+Number(s.distance_m),0),stepSeconds=steps.reduce((n,s)=>n+Number(s.duration_s),0),bands=[];
 let meters=0,seconds=0;
 if(duration&&stepMeters>0&&stepSeconds>0)for(const step of steps){const end=meters+Number(step.distance_m)/stepMeters*length,time=Number(step.duration_s)/stepSeconds*duration;bands.push({start:meters,end,seconds:time,elapsed:seconds});meters=end;seconds+=time}
 return {points,cumulative,length,distance,duration,bands,lastAlong:null};
}
function projectRoute(pos,model=navProgress){
 if(!model)return null;let best=null;
 for(let i=1;i<model.points.length;i++){
  const a=model.points[i-1],b=model.points[i],cos=Math.cos((a.lat+b.lat+pos.lat)/3*Math.PI/180),dx=(b.lon-a.lon)*cos,dy=b.lat-a.lat,denom=dx*dx+dy*dy;
  if(!denom)continue;const t=Math.max(0,Math.min(1,((pos.lon-a.lon)*cos*dx+(pos.lat-a.lat)*dy)/denom)),point={lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t},off=hav(pos,point),along=model.cumulative[i-1]+(model.cumulative[i]-model.cumulative[i-1])*t;
  if(!best||off<best.off-8||Math.abs(off-best.off)<=8&&(model.lastAlong===null?along<best.along:Math.abs(along-model.lastAlong)<Math.abs(best.along-model.lastAlong)))best={off,along};
 }
 return best;
}
function remainingProgress(pos,gps={}){
 const p=projectRoute(pos);if(!p)return null;
 if(p.off>Math.max(60,Math.min(100,Number(gps.accuracy)||0)))return null;
 navProgress.lastAlong=p.along;
 const fraction=Math.max(0,1-p.along/navProgress.length),meters=navProgress.distance*fraction;
 let seconds=navProgress.duration===null?null:navProgress.duration*fraction;
 if(navProgress.bands.length){const band=navProgress.bands.find(b=>p.along<=b.end)||navProgress.bands.at(-1),done=band.elapsed+band.seconds*Math.max(0,Math.min(1,(p.along-band.start)/(band.end-band.start)));seconds=Math.max(0,navProgress.duration-done)}
 return {meters,seconds};
}
function clearMetrics(){for(const id of ['nwtbEta','nwtbRemain','nwtbTurnDist']){const el=document.getElementById(id);if(el)el.textContent='—'}}
function gpsWarning(message){if(!navTarget)return;clearMetrics();const b=document.getElementById('nwtbNavBanner');if(b){b.className='navBanner warn';b.textContent=message}}
function clearNavWatch(){navWatchSerial++;if(navWatch!==null){try{navigator.geolocation?.clearWatch(navWatch)}catch{}navWatch=null}}
function gpsError(error){if(!navTarget)return;navPermissionBlocked=error?.code===1;gpsWarning(navPermissionBlocked?'LOCATION BLOCKED — ALLOW GPS TO UPDATE ETA AND DISTANCE':'GPS UPDATE DELAYED — ETA AND DISTANCE PAUSED')}
function receiveNavFix(position,generation=navGeneration,routeIfMissing=true){
 if(!navTarget||generation!==navGeneration)return false;
 const c=position?.coords||{},pos={lat:Number(c.latitude),lon:Number(c.longitude)},at=Number(position?.timestamp)||Date.now(),age=Date.now()-at,accuracy=Number(c.accuracy)||0;
 if(!validCoord(pos.lat,pos.lon)||age>NAV_GPS_STALE_MS||age< -5000||navLastFix&&at<navLastFix.at)return false;
 if(accuracy>100){gpsWarning('GPS ACCURACY LOW — WAITING TO UPDATE ETA AND DISTANCE');return false}
 const previous=navLastFix;
 if(Number.isFinite(c.heading)&&c.heading>=0&&c.heading<360&&Number(c.speed)>=2.2&&accuracy<=50){navHeading=c.heading;navHeadingAt=at;}
 else if(previous&&accuracy<=50&&previous.gps.accuracy<=50&&at-previous.at<=15000&&hav(previous.pos,pos)>=15){const p=Math.PI/180,a=previous.pos.lat*p,b=pos.lat*p,d=(pos.lon-previous.pos.lon)*p;navHeading=(Math.atan2(Math.sin(d)*Math.cos(b),Math.cos(a)*Math.sin(b)-Math.sin(a)*Math.cos(b)*Math.cos(d))*180/Math.PI+360)%360;}
 navPermissionBlocked=false;navLastFix={pos,at,gps:{accuracy,speed:c.speed,heading:navHeading}};window.__nwtbLastSpeedMps=c.speed??null;
 if(navHandoffPending){clearMetrics();return true;}
 if(!navProgress){if(routeIfMissing){initMap(pos.lat,pos.lon);reroute(pos,true)}return true;}
 if(navPos&&navMap)navPos.setLatLng([pos.lat,pos.lon]);updateDisplay(pos,false,navLastFix.gps);
 if(navMap&&document.visibilityState==='visible')navMap.panTo([pos.lat,pos.lon],{animate:true,duration:.4});
 if(navigationAtStop()){navOffRouteCount=0;navOffRouteSince=0;return true;}
 const off=distanceToRoute(pos),reliable=accuracy<=50;
 if(reliable&&off>Math.max(120,accuracy*2.5)){if(!navOffRouteCount)navOffRouteSince=at;navOffRouteCount++;if(navOffRouteCount>=3&&at-navOffRouteSince>=8000&&Date.now()-navLastReroute>25000)reroute(pos,true,'off_route');}
 else{navOffRouteCount=0;navOffRouteSince=0;if(off<=60)trafficRefresh(pos);}
 return true;
}
function recoverNavGps(force=false){
 if(!navTarget||!navigator.geolocation||navLastRecovery&&Date.now()-navLastRecovery<(force?1000:NAV_GPS_RECOVERY_MS))return;
 navLastRecovery=Date.now();const generation=navGeneration;clearNavWatch();startNavWatch();
 navigator.geolocation.getCurrentPosition(p=>receiveNavFix(p,generation),e=>{if(generation===navGeneration)gpsError(e)},{enableHighAccuracy:true,maximumAge:0,timeout:12000});
}
function startNavHealth(){if(navHealthTimer!==null)return;navHealthTimer=setInterval(()=>{
 if(!navTarget)return;
 if(!navLastFix||Date.now()-navLastFix.at>NAV_GPS_STALE_MS){gpsWarning(navPermissionBlocked?'LOCATION BLOCKED — ALLOW GPS TO UPDATE ETA AND DISTANCE':'GPS LOST — ETA AND DISTANCE PAUSED');if(document.visibilityState!=='hidden'&&!navPermissionBlocked)recoverNavGps()}
},5000)}
function resumeNavGps(){if(!navTarget||document.visibilityState==='hidden'||navLastRecovery&&Date.now()-navLastRecovery<1000)return;gpsWarning('UPDATING GPS — ETA AND DISTANCE WILL RESUME');recoverNavGps(true)}

function ensureStyle(){
 if(document.getElementById('nwtbNavStyle'))return;
 const s=document.createElement('style');s.id='nwtbNavStyle';s.textContent=`
 #nwtbNavPanel{display:none;background:#101828;color:#fff;border-radius:16px;overflow:hidden;margin:0 0 14px;box-shadow:0 10px 28px rgba(16,24,40,.22)}#nwtbNavPanel.show{display:block}.navTop{padding:14px 16px;background:#0b1220}.navTop small{color:#98a2b3;font-weight:800}.navTurn{font-size:24px;font-weight:900;line-height:1.12;margin-top:5px}.navMeta{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:#d0d5dd}.navMeta b{color:#fff}.navMap{height:46vh;min-height:310px;background:#dbe4ea}.navActions{display:flex;gap:8px;flex-wrap:wrap;padding:11px;background:#fff}.navActions button{flex:1;min-width:120px}.navBanner{padding:9px 14px;font-size:12px;font-weight:800;background:#ecfdf3;color:#067647}.navBanner.warn{background:#fffaeb;color:#b54708}.navVoice{background:#6941c6!important}.navEnd{background:#b42318!important}.nwtbFullRouteBtn{background:#15803d!important;color:#fff!important;font-size:16px!important;padding:14px 18px!important}.nwtbException{font-size:12px!important;padding:8px 10px!important;margin-top:8px!important}.leaflet-control-attribution{font-size:9px!important}
 @keyframes nwtbNearPulse{0%,100%{stroke-opacity:.45;fill-opacity:.05;filter:drop-shadow(0 0 3px #2563eb)}50%{stroke-opacity:1;fill-opacity:.20;filter:drop-shadow(0 0 11px #2563eb)}}.nwtb-near-ring{animation:nwtbNearPulse 1.15s ease-in-out infinite;transform-origin:center;transform-box:fill-box}
 #nwtbArrival{display:none;position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.78);align-items:center;justify-content:center;padding:18px}#nwtbArrival.show{display:flex}.arrivalCard{width:min(520px,100%);background:#fff;color:#101828;border-radius:20px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.35);text-align:center}.arrivalCheck{width:64px;height:64px;border-radius:50%;background:#ecfdf3;color:#067647;display:grid;place-items:center;margin:0 auto 12px;font-size:34px;font-weight:900}.arrivalCard h2{margin:0;font-size:25px}.arrivalCard p{margin:7px 0 18px;color:#667085}.arrivalNext{width:100%;border:0;border-radius:14px;padding:18px 14px;background:#15803d;color:#fff;font-size:18px;font-weight:900;cursor:pointer}.arrivalBad{width:100%;border:1px solid #fecdca;border-radius:11px;padding:11px 12px;background:#fff;color:#b42318;font-size:13px;font-weight:850;cursor:pointer;margin-top:10px}
 `;document.head.appendChild(s)
}

function ensureArrival(){
 ensureStyle();let x=document.getElementById('nwtbArrival');if(x)return x;
 x=document.createElement('div');x.id='nwtbArrival';x.innerHTML=`<div class="arrivalCard"><div class="arrivalCheck">✓</div><h2 id="nwtbArrivalTitle">ARRIVED AT STOP</h2><p id="nwtbArrivalName"></p><button class="arrivalNext" onclick="window.nwtbCompleteNext()">COMPLETE STOP + GO TO NEXT STOP</button><button class="arrivalBad" onclick="window.nwtbNotCompleted()">NOT COMPLETED</button></div>`;document.body.appendChild(x);return x
}
function showArrival(){
 if(!navTarget?.stop_id||arrivalFor===navTarget.stop_id)return;
 arrivalFor=navTarget.stop_id;const x=ensureArrival();document.getElementById('nwtbArrivalName').textContent=`${navTarget.name||'Current stop'} — tap complete to start directions to the next stop.`;x.classList.add('show');
 speak(`You have arrived at ${navTarget.name||'the stop'}. Complete the stop to start directions to the next stop.`);if(navigator.vibrate)navigator.vibrate([300,120,300,120,500]);
 window.NWTBNotifications?.show('NWTB — ARRIVED AT STOP',{body:`${navTarget.name||'Stop'} — complete stop and go to the next stop.`,tag:'nwtb-arrival-'+navTarget.stop_id,renotify:true});
}
function hideArrival(){const x=document.getElementById('nwtbArrival');if(x)x.classList.remove('show')}
function clearNearGlow(){if(navGlow&&navMap){try{navMap.removeLayer(navGlow)}catch{}}navGlow=null}
function updateNearGlow(pos,remaining){
 if(!navMap||!window.L||!navTarget?.stop_id||remaining>NEAR_STOP_M){clearNearGlow();return}
 if(!navGlow)navGlow=L.circleMarker([pos.lat,pos.lon],{radius:25,weight:4,color:'#2563eb',fillColor:'#2563eb',fillOpacity:.10,opacity:.9,className:'nwtb-near-ring',interactive:false}).addTo(navMap);
 else navGlow.setLatLng([pos.lat,pos.lon]);
}
function routeArrivalDistance(pos){
 if(!navRouteCoords.length||!navTarget)return Infinity;const c=navRouteCoords[navRouteCoords.length-1],end={lat:Number(c?.[1]),lon:Number(c?.[0])};
 if(!validCoord(end.lat,end.lon)||hav(end,navTarget)>60)return Infinity;return hav(pos,end)
}
function arrivalThreshold(gps={}){
 const accuracy=Math.max(0,Number(gps.accuracy)||0),speed=Math.max(0,Number(gps.speed)||0);
 if(speed>3.5)return ARRIVAL_M;
 return Math.min(ARRIVAL_SOFT_MAX_M,Math.max(ARRIVAL_M,accuracy+ARRIVAL_M))
}

function ensurePanel(){
 ensureStyle();const routes=document.getElementById('routes');let host=document.getElementById('nwtbNavigationHost');
 if(!host&&routes){host=document.createElement('div');host.id='nwtbNavigationHost';routes.parentNode.insertBefore(host,routes)}
 let p=document.getElementById('nwtbNavPanel')||navPanel;if(p){if(host&&p.parentNode!==host)host.appendChild(p);return p}p=document.createElement('div');navPanel=p;p.id='nwtbNavPanel';p.innerHTML=`<div class="navTop"><small id="nwtbNavMode">NWTB TURN-BY-TURN</small><div id="nwtbTurn" class="navTurn">Ready</div><div class="navMeta"><span><b id="nwtbTurnDist">—</b> to turn</span><span><b id="nwtbEta">—</b> ETA</span><span><b id="nwtbRemain">—</b> remaining</span></div></div><div id="nwtbNavBanner" class="navBanner">Navigation ready</div><div id="nwtbNavMap" class="navMap"></div><div class="navActions"><button class="btn navVoice" onclick="window.nwtbRepeatTurn()">🔊 REPEAT TURN</button><button class="btn ghost" onclick="window.nwtbRecenter()">⌖ RECENTER</button><button class="btn navEnd" onclick="window.nwtbStopNavigation()">END NAVIGATION</button></div>`;if(host)host.appendChild(p);return p
}
function initMap(lat,lon){
 const p=ensurePanel();p.classList.add('show');
 if(!window.L){document.getElementById('nwtbNavBanner').className='navBanner warn';document.getElementById('nwtbNavBanner').textContent='Map library failed to load. Turn instructions will still work.';return}
 const el=document.getElementById('nwtbNavMap');
 // A same-named replacement div is a different map container. Never draw into a detached one.
 if(navMap&&navMap.getContainer()!==el){try{navMap.remove()}catch{}navMap=null;navLine=null;navPos=null;navGlow=null;navDest=null;window.__nwtbNavMapInstance=null}
 if(!navMap){navMap=L.map(el,{zoomControl:true,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([lat,lon],15);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors',updateWhenIdle:true,keepBuffer:3}).addTo(navMap);window.__nwtbNavMapInstance=navMap}
 const current=navMap;setTimeout(()=>{if(current===navMap&&el.isConnected)current.invalidateSize({pan:false,animate:false})},80)
}
function drawRoute(current){if(!navMap||!window.L)return;if(navLine)navMap.removeLayer(navLine);if(navRouteCoords.length){const ll=navRouteCoords.map(c=>[c[1],c[0]]);navLine=L.polyline(ll,{weight:7,opacity:.8}).addTo(navMap);const b=navLine.getBounds();if(b.isValid())navMap.fitBounds(b,{padding:[28,28],maxZoom:16})}clearNearGlow();if(navPos)navMap.removeLayer(navPos);navPos=L.circleMarker([current.lat,current.lon],{radius:9,weight:4,fillOpacity:1}).addTo(navMap).bindTooltip('You',{permanent:false});if(navDest)navMap.removeLayer(navDest);navDest=L.marker([navTarget.lat,navTarget.lon]).addTo(navMap).bindPopup(navTarget.name||'Destination')}
async function navPost(payload){navRequestController?.abort();const controller=new AbortController();navRequestController=controller;const h={'content-type':'application/json','apikey':KEY,'x-nwtb-session':token},timer=setTimeout(()=>controller.abort(),20000);try{const r=await fetch(NAV,{method:'POST',headers:h,body:JSON.stringify(payload),signal:controller.signal}),j=await r.json().catch(()=>({error:'Navigation response error'}));if(!r.ok)throw Object.assign(Error(j.error||'Navigation failed'),{code:j.code});return j}finally{clearTimeout(timer);if(navRequestController===controller)navRequestController=null}}
function navigationAtStop(){const phase=window.nwtbPodScreenState?.().pod_phase;return !!navHandoffPending||!!arrivalFor||['OPEN','SAVING','OFFLINE_QUEUED'].includes(phase);}
function navigationRequest(pos,purpose='initial'){
 const request={action:'route',origin:pos,destination:{lat:navTarget.lat,lon:navTarget.lon},route_id:navRouteId,stop_id:navTarget.stop_id||null,purpose,...(Number.isFinite(navHeading)&&Date.now()-navHeadingAt<=15000&&(navLastFix?.gps.speed==null||Number(navLastFix.gps.speed)>=2.2)?{heading:navHeading}:{})};
 if(purpose==='traffic'){
  const hit=projectRoute(pos);if(!hit||hit.off>60)return null;
  const index=Math.max(1,navProgress.cumulative.findIndex(value=>value>=hit.along)),a=navProgress.points[index-1],b=navProgress.points[index],span=navProgress.cumulative[index]-navProgress.cumulative[index-1],fraction=Math.max(0,Math.min(1,(hit.along-navProgress.cumulative[index-1])/(span||1))),projected=[a.lon+(b.lon-a.lon)*fraction,a.lat+(b.lat-a.lat)*fraction];const remaining=[projected,...navRouteCoords.slice(index)],stride=Math.max(1,Math.ceil(remaining.length/1998)),geometry=remaining.filter((_,i)=>i===0||i===remaining.length-1||i%stride===0);
  if(geometry.length<2)return null;request.reference={geometry,change_age_s:Math.max(0,(Date.now()-navLastRouteChange)/1000)};
 }
 return request;
}
function currentStep(){return navSteps[Math.min(navStepIndex,Math.max(0,navSteps.length-1))]||null}
function updateDisplay(pos,forceSpeak=false,gps={}){
 const remaining=hav(pos,navTarget),arriveDistance=Math.min(remaining,routeArrivalDistance(pos)),threshold=arrivalThreshold(gps),exact=arriveDistance<=ARRIVAL_M,soft=arriveDistance<=threshold&&Number(gps.speed||0)<=3.5;
 if(exact)arrivalHits=2;else if(soft)arrivalHits++;else arrivalHits=0;
 const step=currentStep();if(step){const loc=step?.maneuver?.location||[],mpos=loc.length===2?{lat:Number(loc[1]),lon:Number(loc[0])}:navTarget;let d=hav(pos,mpos);
  const onRoad=projectRoute(pos),onRoadValid=onRoad&&onRoad.off<=Math.max(60,Math.min(100,Number(gps.accuracy)||0));const turnDistance=()=>onRoadValid&&Number.isFinite(navManeuverAlong[navStepIndex])?Math.max(0,navManeuverAlong[navStepIndex]-onRoad.along):hav(pos,(currentStep()?.maneuver?.location||[]).length===2?{lat:Number(currentStep().maneuver.location[1]),lon:Number(currentStep().maneuver.location[0])}:navTarget);d=turnDistance();const passed=()=>onRoadValid&&navManeuverAlong[navStepIndex]!=null&&onRoad.along>navManeuverAlong[navStepIndex]+20;
  // A phone can report on either side of a turn without ever entering its 28 m radius.
  // Use progress along the road to retire passed instructions instead of remaining silent on the old turn.
  while((d<28||passed())&&navStepIndex<navSteps.length-1){navStepIndex++;const n=currentStep(),nl=n?.maneuver?.location||[];if(nl.length===2)d=turnDistance();else break}
  const now=currentStep(),txt=instruction(now);document.getElementById('nwtbTurn').textContent=txt;document.getElementById('nwtbTurnDist').textContent=feet(d);if(!arrivalFor&&!exact&&arrivalHits<2)announceTurn(now,d,forceSpeak)
 }
 const progress=remainingProgress(pos,gps),arrived=exact||arrivalHits>=2;document.getElementById('nwtbRemain').textContent=arrived?'0 ft':progress?feet(progress.meters):'—';document.getElementById('nwtbEta').textContent=arrived?'0 min':progress?.seconds!=null?eta(progress.seconds):'—';updateNearGlow(pos,remaining);document.getElementById('nwtbNavBanner').className='navBanner';
 if(exact||arrivalHits>=2){document.getElementById('nwtbNavBanner').textContent=bannerText(`ARRIVED: ${navTarget.name}`);if(navTarget.stop_id)showArrival();else if(arrivalFor!=='FINAL'&&speak(`You have arrived at ${navTarget.name}`,true))arrivalFor='FINAL'}else if(!progress){document.getElementById('nwtbNavBanner').className='navBanner warn';document.getElementById('nwtbNavBanner').textContent='UPDATING ROAD ROUTE — ETA AND DISTANCE WILL RESUME'}else document.getElementById('nwtbNavBanner').textContent=bannerText(remaining<=NEAR_STOP_M&&navTarget.stop_id?`NEAR STOP: ${navTarget.name}`:`Navigating to ${navTarget.name}`)
}
function distanceToRoute(pos){return projectRoute(pos)?.off??Infinity}
function applyRoute(j,pos,announce=false){
 navRoutingMeta=j.routing||null;navTrafficFailed=false;if(j.routing?.decision!=='ROUTE_RETAINED')navLastRouteChange=Date.now();navOffRouteCount=0;navOffRouteSince=0;
 navGeometryRevision++;
 document.dispatchEvent(new CustomEvent('nwtb-navigation-route',{detail:{geometry:j.geometry||[]}}));
 navSteps=j.steps||[];navRouteCoords=j.geometry||[];navProgress=buildProgress(j);navStepIndex=0;
 let previous=0;navManeuverAlong=navSteps.map(step=>{if(!navProgress)return null;if(step.maneuver?.type==='arrive')return navProgress.length;if(Number.isInteger(step.point_index)&&step.point_index>=0&&step.point_index<navProgress.points.length){const i=step.point_index,a=navProgress.points[i],b=navProgress.points[i+1],loc=step.maneuver?.location||[];if(!b)return navProgress.cumulative[i];if(validCoord(loc[1],loc[0])){const length=hav(a,b),hit=projectRoute({lat:Number(loc[1]),lon:Number(loc[0])},{points:[a,b],cumulative:[0,length],lastAlong:null});if(hit&&hit.off<=100)return navProgress.cumulative[i]+hit.along;}}const loc=step.maneuver?.location||[];if(!validCoord(loc[1],loc[0]))return null;const hit=projectRoute({lat:Number(loc[1]),lon:Number(loc[0])},{...navProgress,lastAlong:previous});if(!hit||hit.off>100)return null;previous=Math.max(previous,hit.along);return previous;});
 navTrafficAware=!!j.traffic_aware;navRouteSource=j.source||'';navLastTrafficCheck=Date.now();setRoutingMode();const latest=navLastFix?.pos||pos;drawRoute(latest);if(navLastFix&&Date.now()-navLastFix.at>NAV_GPS_STALE_MS)gpsWarning('GPS LOST — ETA AND DISTANCE PAUSED');else updateDisplay(latest,announce,navLastFix?.gps||{})
}
async function reroute(pos,announce=false,purpose='initial'){if(!navTarget)return;const generation=navGeneration,now=Date.now();if(now-navLastReroute<12000||!navProgress&&navRoutingRequest)return;navLastReroute=now;const request=++navRouteSequence;navRoutingRequest=request;document.getElementById('nwtbNavBanner').textContent=navTrafficAware?'LIVE TRAFFIC • Recalculating fastest route…':'Calculating route…';try{const j=await navPost(navigationRequest(pos,purpose));if(generation!==navGeneration||request!==navRouteSequence)return;applyRoute(j,pos,announce)}catch(e){if(generation!==navGeneration||request!==navRouteSequence)return;document.getElementById('nwtbNavBanner').className='navBanner warn';document.getElementById('nwtbNavBanner').textContent=e.message}finally{if(navRoutingRequest===request)navRoutingRequest=0}}
async function trafficRefresh(pos){
 if(!navTarget||navigationAtStop()||document.visibilityState==='hidden'||!navLastFix||Date.now()-navLastFix.at>15000||navLastFix.gps.accuracy>50||navTrafficBusy||navRoutingRequest||Date.now()-navLastTrafficCheck<TRAFFIC_REFRESH_MS)return;
 const payload=navigationRequest(pos,'traffic');if(!payload)return;
 const hit=projectRoute(pos),next=navManeuverAlong[navStepIndex];if(hit&&Number.isFinite(next)&&next-hit.along>0&&next-hit.along<100)return;
 navTrafficBusy=true;navLastTrafficCheck=Date.now();const generation=navGeneration,request=++navRouteSequence;
 try{const j=await navPost(payload);if(generation===navGeneration&&request===navRouteSequence){if(j?.traffic_aware)applyRoute(j,pos,false);else{navTrafficFailed=true;setRoutingMode();updateDisplay(navLastFix.pos,false,navLastFix.gps)}}}catch(e){if(generation===navGeneration&&request===navRouteSequence){navTrafficFailed=true;setRoutingMode();if(navLastFix)updateDisplay(navLastFix.pos,false,navLastFix.gps);console.warn('Live traffic refresh unavailable')}}finally{if(generation===navGeneration)navTrafficBusy=false}
}
function startNavWatch(){if(navWatch!==null||!navigator.geolocation||!navTarget)return;const generation=navGeneration,serial=++navWatchSerial;navWatch=navigator.geolocation.watchPosition(p=>{if(serial===navWatchSerial)receiveNavFix(p,generation)},e=>{if(serial===navWatchSerial&&generation===navGeneration)gpsError(e)},{enableHighAccuracy:true,maximumAge:0,timeout:15000})}
async function beginNavigation(target,routeId){navRequestController?.abort();navRoutingMeta=null;navHeading=null;navHeadingAt=0;navOffRouteCount=0;navOffRouteSince=0;navTrafficFailed=false;const generation=++navGeneration;navHandoffPending=null;document.getElementById('nwtbHandoffRetry')?.remove();clearNavWatch();navRouteSequence++;navRoutingRequest=0;navProgress=null;navLastFix=null;navLastRecovery=0;navPermissionBlocked=false;navLastReroute=0;navRouteCoords=[];navSteps=[];navTarget=target;navRouteId=routeId||route||'';navLastSpoken='';navVoiceCues=[];navStepIndex=0;arrivalFor='';arrivalHits=0;navTrafficAware=false;navRouteSource='';navLastTrafficCheck=0;navTrafficBusy=false;hideArrival();clearNearGlow();const p=ensurePanel();p.classList.add('show');clearMetrics();setRoutingMode();document.getElementById('nwtbNavBanner').className='navBanner';document.getElementById('nwtbNavBanner').textContent='Getting your location…';if(!navigator.geolocation){document.getElementById('nwtbNavBanner').className='navBanner warn';document.getElementById('nwtbNavBanner').textContent='This phone/browser does not provide GPS.';return}startNavHealth();navigator.geolocation.getCurrentPosition(async g=>{if(generation!==navGeneration||!receiveNavFix(g,generation,false))return;const pos=navLastFix.pos;initMap(pos.lat,pos.lon);await reroute(pos,true);if(generation!==navGeneration)return;startNavWatch();try{if(typeof requestWakeLock==='function')requestWakeLock()}catch{}},e=>{if(generation===navGeneration)gpsError(e)},{enableHighAccuracy:true,maximumAge:0,timeout:15000})}

async function targetForStop(stop){const o=stop?.delivery_orders||{};let lat=Number(o.lat),lon=Number(o.lon);if(!validCoord(lat,lon)){try{const g=await post(API,{action:'geocode',address:o.address});lat=Number(g.lat);lon=Number(g.lon)}catch{}}if(!validCoord(lat,lon))throw Error('This stop does not have a usable physical location.');return {name:o.customer_name||'Stop',address:o.address||'',lat,lon,stop_id:stop.id}}
async function finalTarget(r){
 if(!r||r.route_mode!=='CUSTOM')return depotTarget(r);
 const mode=r.end_mode||'RETURN_DEPOT';if(mode==='LAST_STOP')return null;
 if(mode==='SAME_AS_START'&&validCoord(r.start_lat,r.start_lon))return {name:r.start_name||'Custom Start',address:r.start_address||'',lat:Number(r.start_lat),lon:Number(r.start_lon),final:true};
 if(validCoord(r.end_lat,r.end_lon))return {name:r.end_name||'Custom End',address:r.end_address||'',lat:Number(r.end_lat),lon:Number(r.end_lon),final:true};
 if(mode==='RETURN_DEPOT')return depotTarget(r);
 return null
}
async function navigateNext(routeId){
 const fresh=await post(API,{action:'route_get',route_id:routeId});if(routeId!==route)return;navRouteMeta=fresh.route||navRouteMeta;const next=(fresh.stops||[]).find(s=>s.status==='PENDING');if(navRouteMeta?.paused||!['ACTIVE','COMPLETED'].includes(navRouteMeta?.status)||next&&navRouteMeta?.status!=='ACTIVE')throw Error('Start or resume this assigned route before navigating.');if(next){await beginNavigation(await targetForStop(next),routeId);return}
 const end=await finalTarget(navRouteMeta);if(end){speak(`All stops complete. Returning to ${end.name}`);await beginNavigation(end,routeId);document.getElementById('nwtbNavBanner').textContent=bannerText(`All stops complete — returning to ${end.name}`)}else{window.nwtbStopNavigation();speak('Route complete')}
}

window.nwtbCompleteNext=async()=>{if(!navTarget?.stop_id||typeof window.finish!=='function')return;const id=navTarget.stop_id;hideArrival();clearNearGlow();arrivalHits=0;try{await window.finish(id,'DELIVERED')}catch(e){alert(e.message||e)}};
window.nwtbNotCompleted=async()=>{if(!navTarget?.stop_id||typeof window.finish!=='function')return;const id=navTarget.stop_id;hideArrival();clearNearGlow();arrivalHits=0;try{await window.finish(id,'NOT_DELIVERED')}catch(e){alert(e.message||e)}};
// Called only after the POD/exception endpoint acknowledges the saved outcome.
async function resumeSavedNavigation(id){
 if(!id||id!==route||!navHandoffPending)return;
 try{await navigateNext(id);if(route===id){navHandoffPending=null;document.getElementById('nwtbHandoffRetry')?.remove();syncVoiceStatus();}}
 catch{if(route!==id||!navHandoffPending)return;clearMetrics();const panel=ensurePanel(),banner=document.getElementById('nwtbNavBanner');banner.className='navBanner warn';banner.textContent='STOP SAVED — NEXT / RETURN DIRECTIONS NEED TO RECONNECT';
  if(!document.getElementById('nwtbHandoffRetry')){const retry=document.createElement('button');retry.id='nwtbHandoffRetry';retry.className='btn navVoice';retry.textContent='RESUME NEXT / RETURN DIRECTIONS';retry.onclick=()=>{window.nwtbPrimeVoice?.(false);void resumeSavedNavigation(id);};panel.appendChild(retry);}
 }
}
window.nwtbAfterStopSaved=async stopId=>{const id=route,advance=!!navTarget&&navRouteId===id&&navTarget.stop_id===stopId;if(!id)return;
 if(advance)navHandoffPending={routeId:id,generation:navGeneration};await window.openRoute(id);
 if(advance&&route===id){await resumeSavedNavigation(id);const pending=navHandoffPending;if(pending)setTimeout(()=>{if(navHandoffPending===pending&&route===id)void resumeSavedNavigation(id);},2500);}
};
window.nwtbDriverViewChanged=id=>{if(!id||navRouteId&&navRouteId!==id)window.nwtbStopNavigation()};
// Explicit Office changes reconcile the current target only after canonical data is refreshed.
// Merely viewing a route from Office never calls this hook.
window.nwtbOfficeRouteChanged=async(id)=>{
 if(!id||id!==route||navRouteId!==id||!navTarget)return;
 const j=await post(API,{action:'route_get',route_id:id});if(id!==route||navRouteId!==id||!navTarget)return;
 const next=(j.stops||[]).find(s=>s.status==='PENDING');
 if(navTarget.stop_id&&(!next||next.id!==navTarget.stop_id)||navTarget.final&&next)await navigateNext(id);
};
window.nwtbRepeatTurn=()=>{const s=currentStep();if(s)speak(instruction(s)+' '+(document.getElementById('nwtbTurnDist')?.textContent||''),true)};
window.nwtbRecenter=()=>{if(navMap&&navPos)navMap.setView(navPos.getLatLng(),16)};
window.nwtbStopNavigation=()=>{navRequestController?.abort();navRequestController=null;navRoutingMeta=null;navHeading=null;navHeadingAt=0;navOffRouteCount=0;navOffRouteSince=0;navTrafficFailed=false;navHandoffPending=null;navManeuverAlong=[];document.getElementById('nwtbHandoffRetry')?.remove();navGeneration++;navRouteSequence++;navRoutingRequest=0;clearNavWatch();if(navHealthTimer!==null){clearInterval(navHealthTimer);navHealthTimer=null}navProgress=null;navLastFix=null;navLastRecovery=0;navPermissionBlocked=false;navRouteId='';clearNearGlow();navTarget=null;navSteps=[];navRouteCoords=[];navStepIndex=0;navVoiceCues=[];navLastSpoken='';arrivalFor='';arrivalHits=0;navTrafficAware=false;navRouteSource='';navLastTrafficCheck=0;navTrafficBusy=false;hideArrival();try{if(window.nwtbCancelVoice)window.nwtbCancelVoice();else speechSynthesis.cancel()}catch{}const p=document.getElementById('nwtbNavPanel');if(p)p.classList.remove('show')};

async function decorateRoute(routeId){
 try{
  const j=await post(API,{action:'route_get',route_id:routeId});if(routeId!==route)return;navRouteMeta=j.route||null;const stops=j.stops||[];
  document.querySelectorAll('#routes .stop').forEach((el,i)=>{
    const stop=stops[i];if(!stop)return;
    [...el.querySelectorAll('a,button')].forEach(x=>{const t=(x.textContent||'').trim();if(/NAVIGATE/i.test(t))x.remove()});
    const bad=[...el.querySelectorAll('button')].find(b=>/NOT COMPLETED/i.test(b.textContent||''));if(bad){bad.classList.add('nwtbException');bad.textContent='NOT COMPLETED'}
  });
  const panel=document.querySelector('#routes > .panel');if(panel){
    panel.querySelectorAll('a.btn.return').forEach(a=>a.remove());
    const planned=j.route?.status==='PLANNED',active=j.route?.status==='ACTIVE'&&!j.route?.paused;
    const start=[...panel.querySelectorAll('button')].find(b=>/START ROUTE/i.test(b.textContent||''));
    if((planned&&start||active)&&!panel.querySelector('.nwtbFullRouteBtn')){
      const nb=document.createElement('button');nb.className='btn nwtbFullRouteBtn';nb.textContent=planned?'START ROUTE + NWTB NAVIGATION':'CONTINUE NWTB NAVIGATION';nb.onclick=async()=>{try{window.nwtbPrimeVoice?.();if(planned)await window.startRoute(routeId);await navigateNext(routeId)}catch(e){alert(e.message||e)}};if(start)start.replaceWith(nb);else panel.appendChild(nb)
    }
  }
 }catch(e){console.warn('Navigation decoration failed',e)}
}

function install(){
 const originalOpen=window.openRoute;if(typeof originalOpen!=='function')return false;
 window.openRoute=async function(id,fromChange=false){window.nwtbDriverViewChanged(id);const r=await originalOpen.apply(this,arguments);setTimeout(()=>decorateRoute(id),100);return r};
 return true
}
document.addEventListener('visibilitychange',resumeNavGps);window.addEventListener('pageshow',resumeNavGps);window.addEventListener('online',resumeNavGps);
let tries=0;const t=setInterval(()=>{if(install()||++tries>80)clearInterval(t)},100);
})();
