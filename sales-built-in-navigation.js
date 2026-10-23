/* Sales adapter of the production NWTB Delivery navigation (20261021-progress1).
 * Road projection, segment ETA, GPS recovery, voice cues and map lifecycle use
 * the Delivery algorithms. Sales owns approval checks and visit progression.
 * No Delivery routes, stop statuses, tracking, POD or tables are written here.
 */
(()=>{
'use strict';
const NAV='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-driver-navigation';
const KEY='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
const NEAR_STOP_M=152.4,ARRIVAL_M=6.096,ARRIVAL_SOFT_MAX_M=30,TRAFFIC_REFRESH_MS=90000;
const NAV_GPS_STALE_MS=25000,NAV_GPS_RECOVERY_MS=15000;
let navMap=null,navPanel=null,navLine=null,navPos=null,navGlow=null,navDest=null,navWatch=null,navTarget=null,navSteps=[],navStepIndex=0,navRouteCoords=[],navLastReroute=0,navLastSpoken='',arrivalFor='',arrivalHits=0,navGeneration=0;
let navTrafficAware=false,navRouteSource='',navLastTrafficCheck=0,navTrafficBusy=false;
let navVoiceCues=[];
let navProgress=null,navLastFix=null,navHealthTimer=null,navWatchSerial=0,navLastRecovery=0,navPermissionBlocked=false,navRouteSequence=0,navRoutingRequest=0;

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
function speak(text,force=false){
 if(!text||!('speechSynthesis'in window)||!force&&text===navLastSpoken)return false;
 try{
  if(typeof window.nwtbVoiceSay==='function'){if(window.nwtbVoiceSay(text)===false)return false}
  else{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.rate=.95;u.pitch=1;speechSynthesis.speak(u)}
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
 if(cue.stage>=stage)return;
 if(speak((stage===2?'Now, ':'')+text,true))cue.stage=stage;
}
function routingLabel(){return navTrafficAware?'NWTB SALES • LIVE FLEET TRAFFIC':'NWTB SALES — BUILT-IN TURN-BY-TURN'}
function bannerText(base){return navTrafficAware?`LIVE TRAFFIC • ${base}`:base}
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
 navPermissionBlocked=false;navLastFix={pos,at,gps:{accuracy,speed:c.speed,heading:c.heading}};window.__nwtbLastSpeedMps=c.speed??null;
 if(!navProgress){if(routeIfMissing){initMap(pos.lat,pos.lon);reroute(pos,true)}return true;}
 if(navPos&&navMap)navPos.setLatLng([pos.lat,pos.lon]);updateDisplay(pos,false,navLastFix.gps);
 if(navMap&&document.visibilityState==='visible')navMap.panTo([pos.lat,pos.lon],{animate:true,duration:.4});
 const off=distanceToRoute(pos);if(off>120&&Date.now()-navLastReroute>25000)reroute(pos,true);else trafficRefresh(pos);
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
 #nwtbNavPanel{display:none;background:#101828;color:#fff;border-radius:16px;overflow:hidden;margin:0 0 14px;box-shadow:0 10px 28px rgba(16,24,40,.22)}#nwtbNavPanel.show{display:block}.navTop{padding:14px 16px;background:#0b1220}.navTop small{color:#98a2b3;font-weight:800}.navTurn{font-size:24px;font-weight:900;line-height:1.12;margin-top:5px}.navMeta{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:#d0d5dd}.navMeta b{color:#fff}.navMap{height:46vh;min-height:310px;background:#dbe4ea}.navActions{display:flex;gap:8px;flex-wrap:wrap;padding:11px;background:#fff}.navActions button{flex:1;min-width:120px;border:0;border-radius:9px;padding:12px;font-weight:900;cursor:pointer;color:#fff}.navActions .ghost{background:#e2e8f0;color:#0f172a}.salesNext{background:#15803d}.navDestination{padding:10px 14px;background:#111827;font-size:13px;font-weight:800}.salesNavHint{font-size:12px;line-height:1.4;margin-top:8px;color:#166534}#nwtbSalesReviewControls{margin:12px 0;padding:14px;border:2px solid #15803d;border-radius:12px;background:#ecfdf3}.salesStartNav{width:100%;padding:16px;background:#15803d;color:#fff;font-size:18px;font-weight:900}.salesGoogleBackup{background:#64748b!important}@media(max-width:600px){.navActions{display:grid;grid-template-columns:1fr 1fr}.navActions button{min-width:0;min-height:48px}.navTurn{font-size:22px}.navMap{height:50vh}}.navBanner{padding:9px 14px;font-size:12px;font-weight:800;background:#ecfdf3;color:#067647}.navBanner.warn{background:#fffaeb;color:#b54708}.navVoice{background:#6941c6!important}.navEnd{background:#b42318!important}.nwtbFullRouteBtn{background:#15803d!important;color:#fff!important;font-size:16px!important;padding:14px 18px!important}.nwtbException{font-size:12px!important;padding:8px 10px!important;margin-top:8px!important}.leaflet-control-attribution{font-size:9px!important}
 @keyframes nwtbNearPulse{0%,100%{stroke-opacity:.45;fill-opacity:.05;filter:drop-shadow(0 0 3px #2563eb)}50%{stroke-opacity:1;fill-opacity:.20;filter:drop-shadow(0 0 11px #2563eb)}}.nwtb-near-ring{animation:nwtbNearPulse 1.15s ease-in-out infinite;transform-origin:center;transform-box:fill-box}
 #nwtbArrival{display:none;position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.78);align-items:center;justify-content:center;padding:18px}#nwtbArrival.show{display:flex}.arrivalCard{width:min(520px,100%);background:#fff;color:#101828;border-radius:20px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.35);text-align:center}.arrivalCheck{width:64px;height:64px;border-radius:50%;background:#ecfdf3;color:#067647;display:grid;place-items:center;margin:0 auto 12px;font-size:34px;font-weight:900}.arrivalCard h2{margin:0;font-size:25px}.arrivalCard p{margin:7px 0 18px;color:#667085}.arrivalNext{width:100%;border:0;border-radius:14px;padding:18px 14px;background:#15803d;color:#fff;font-size:18px;font-weight:900;cursor:pointer}.arrivalBad{width:100%;border:1px solid #fecdca;border-radius:11px;padding:11px 12px;background:#fff;color:#b42318;font-size:13px;font-weight:850;cursor:pointer;margin-top:10px}
 `;document.head.appendChild(s)
 const layout=document.createElement('style');layout.textContent='#output{min-width:0;max-width:100%;overflow-x:auto}';document.head.appendChild(layout);
}

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
function currentStep(){return navSteps[Math.min(navStepIndex,Math.max(0,navSteps.length-1))]||null}
function updateDisplay(pos,forceSpeak=false,gps={}){
 const remaining=hav(pos,navTarget),arriveDistance=Math.min(remaining,routeArrivalDistance(pos)),threshold=arrivalThreshold(gps),exact=arriveDistance<=ARRIVAL_M,soft=arriveDistance<=threshold&&Number(gps.speed||0)<=3.5;
 if(exact)arrivalHits=2;else if(soft)arrivalHits++;else arrivalHits=0;
 const step=currentStep();if(step){const loc=step?.maneuver?.location||[],mpos=loc.length===2?{lat:Number(loc[1]),lon:Number(loc[0])}:navTarget;let d=hav(pos,mpos);
  while(d<28&&navStepIndex<navSteps.length-1){navStepIndex++;const n=currentStep(),nl=n?.maneuver?.location||[];if(nl.length===2)d=hav(pos,{lat:Number(nl[1]),lon:Number(nl[0])});else break}
  const now=currentStep(),txt=instruction(now);document.getElementById('nwtbTurn').textContent=txt;document.getElementById('nwtbTurnDist').textContent=feet(d);if(!arrivalFor&&!exact&&arrivalHits<2)announceTurn(now,d,forceSpeak)
 }
 const progress=remainingProgress(pos,gps),arrived=exact||arrivalHits>=2;document.getElementById('nwtbRemain').textContent=arrived?'0 ft':progress?feet(progress.meters):'—';document.getElementById('nwtbEta').textContent=arrived?'0 min':progress?.seconds!=null?eta(progress.seconds):'—';updateNearGlow(pos,remaining);document.getElementById('nwtbNavBanner').className='navBanner';
 if(exact||arrivalHits>=2){document.getElementById('nwtbNavBanner').textContent=bannerText(`ARRIVED: ${navTarget.name}`);showArrival()}else if(!progress){document.getElementById('nwtbNavBanner').className='navBanner warn';document.getElementById('nwtbNavBanner').textContent='UPDATING ROAD ROUTE — ETA AND DISTANCE WILL RESUME'}else document.getElementById('nwtbNavBanner').textContent=bannerText(remaining<=NEAR_STOP_M&&navTarget.stop_id?`NEAR STOP: ${navTarget.name}`:`Navigating to ${navTarget.name}`)
}
function distanceToRoute(pos){return projectRoute(pos)?.off??Infinity}
function applyRoute(j,pos,announce=false){
 document.dispatchEvent(new CustomEvent('nwtb-navigation-route',{detail:{geometry:j.geometry||[]}}));
 navSteps=j.steps||[];navRouteCoords=j.geometry||[];navProgress=buildProgress(j);navStepIndex=0;navTrafficAware=!!j.traffic_aware;navRouteSource=j.source||'';navLastTrafficCheck=Date.now();setRoutingMode();const latest=navLastFix?.pos||pos;drawRoute(latest);if(navLastFix&&Date.now()-navLastFix.at>NAV_GPS_STALE_MS)gpsWarning('GPS LOST — ETA AND DISTANCE PAUSED');else updateDisplay(latest,announce,navLastFix?.gps||{})
}
function startNavWatch(){if(navWatch!==null||!navigator.geolocation||!navTarget)return;const generation=navGeneration,serial=++navWatchSerial;navWatch=navigator.geolocation.watchPosition(p=>{if(serial===navWatchSerial)receiveNavFix(p,generation)},e=>{if(serial===navWatchSerial&&generation===navGeneration)gpsError(e)},{enableHighAccuracy:true,maximumAge:0,timeout:15000})}

// Sales owns its stops and approval checks; navigation never writes Delivery data.
let salesIndex=0,returningHome=false,salesTransition=false,salesOperation=0,salesKeys=[],wakeLock=null,assetPromise=null,salesMode='route';
const listVisited=new Set();
const salesKey=a=>String(a?.salesAccountId??a?.customerNumber??'');
function routeList(){return typeof currentRoute!=='undefined'&&Array.isArray(currentRoute)?currentRoute:[]}
function home(){return typeof depot!=='undefined'?depot:{name:'Northwest Trucks - Bolingbrook',address:'201 S W Frontage Rd, Bolingbrook, IL 60440',lat:41.682487,lon:-88.072262}}
function targetFor(a,final=false){
 if(!a||!validCoord(a.lat,a.lon)){const error=Error('This Sales stop does not have a usable physical location.');error.salesSafety=true;throw error}
 return {name:String(a.name||'Sales stop'),address:String(a.address||''),lat:Number(a.lat),lon:Number(a.lon),...(final?{final:true}:{stop_id:salesKey(a)})};
}
async function checkedSalesRoute(){
 try{return await window.nwtbRequireSalesRoute(routeList())}
 catch(error){error.salesSafety=true;throw error}
}
async function refreshTarget(generation){
 if(generation!==navGeneration||!navTarget)return null;
 if(returningHome)return navTarget;
 const fresh=await checkedSalesRoute();
 if(generation!==navGeneration||!navTarget)return null;
 if(fresh.length!==salesKeys.length||fresh.some((a,i)=>salesKey(a)!==salesKeys[i])){
  const error=Error('The Sales route changed. Finish reviewing it and start navigation again.');error.salesSafety=true;throw error;
 }
 currentRoute=fresh;navTarget=targetFor(fresh[salesIndex]);setDestination();return navTarget;
}
function setDestination(){
 const el=document.getElementById('nwtbNavDestination');
 if(el&&navTarget)el.textContent=`${returningHome?'RETURN TO NWTB':salesMode==='list'?'SELECTED STOP':`STOP ${salesIndex+1} OF ${salesKeys.length}`}: ${navTarget.name}${navTarget.address?' — '+navTarget.address:''}`;
}
function navigationError(error,generation=navGeneration){
 if(generation!==navGeneration)return;
 if(error.salesSafety){window.nwtbSalesSafetyWarning?.(error);window.nwtbSalesEndNav();return}
 const banner=document.getElementById('nwtbNavBanner');
 if(banner){banner.className='navBanner warn';banner.textContent=error.message||String(error)}
}
function loadAsset(id,tag,url){
 return new Promise((resolve,reject)=>{
  document.getElementById(id)?.remove();const el=document.createElement(tag);el.id=id;
  if(tag==='link'){el.rel='stylesheet';el.href=url}else el.src=url;
  el.onload=resolve;el.onerror=()=>{el.remove();reject(Error('Navigation map could not load. Check your connection.'))};document.head.appendChild(el);
 });
}
async function ensureAssets(){
 if(window.L)return;
 if(!assetPromise)assetPromise=(async()=>{
  if(!document.getElementById('nwtbSalesLeafletCss')){const css=document.createElement('link');css.id='nwtbSalesLeafletCss';css.rel='stylesheet';css.href='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(css)}
  await loadAsset('nwtbSalesLeafletJs','script','https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js');
 })().catch(error=>{assetPromise=null;throw error});
 await assetPromise;
}
async function requestWake(){
 if(!navTarget||wakeLock||!navigator.wakeLock)return;
 const generation=navGeneration;
 try{const lock=await navigator.wakeLock.request('screen');if(!navTarget||generation!==navGeneration){await lock.release();return}wakeLock=lock;lock.addEventListener?.('release',()=>{if(wakeLock===lock)wakeLock=null})}catch{}
}
function releaseWake(){const lock=wakeLock;wakeLock=null;try{lock?.release()?.catch?.(()=>{})}catch{}}

function ensurePanel(){
 ensureStyle();const out=document.getElementById('output');let host=document.getElementById('nwtbNavigationHost');
 if(!host&&out){host=document.createElement('div');host.id='nwtbNavigationHost';out.before(host)}
 let panel=document.getElementById('nwtbNavPanel')||navPanel;
 if(panel){if(host&&panel.parentNode!==host)host.appendChild(panel);return panel}
 panel=document.createElement('div');navPanel=panel;panel.id='nwtbNavPanel';
 panel.innerHTML=`<div class="navTop"><small id="nwtbNavMode">NWTB SALES — BUILT-IN TURN-BY-TURN</small><div id="nwtbTurn" class="navTurn" aria-live="polite">Ready</div><div class="navMeta"><span><b id="nwtbTurnDist">—</b> to turn</span><span><b id="nwtbEta">—</b> ETA</span><span><b id="nwtbRemain">—</b> remaining</span></div></div><div id="nwtbNavDestination" class="navDestination"></div><div id="nwtbNavBanner" class="navBanner" role="status">Navigation ready</div><div id="nwtbNavMap" class="navMap"></div><div class="navActions"><button type="button" class="navVoice" onclick="window.nwtbSalesRepeat()">🔊 REPEAT TURN</button><button type="button" class="ghost" onclick="window.nwtbSalesRecenter()">⌖ RECENTER</button><button type="button" class="salesNext" onclick="window.nwtbSalesCompleteStop()">VISIT COMPLETE / NEXT STOP</button><button type="button" class="ghost salesChooseAnother" onclick="window.nwtbSalesOpenListMode()" hidden>CHOOSE ANOTHER STOP</button><button type="button" class="navEnd" onclick="window.nwtbSalesEndNav()">END NAVIGATION</button></div>`;
 host?.appendChild(panel);return panel;
}
function ensureArrival(){
 ensureStyle();let el=document.getElementById('nwtbArrival');if(el)return el;
 el=document.createElement('div');el.id='nwtbArrival';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-labelledby','nwtbArrivalTitle');
 el.innerHTML='<div class="arrivalCard"><div class="arrivalCheck">✓</div><h2 id="nwtbArrivalTitle">ARRIVED AT SALES STOP</h2><p id="nwtbArrivalName"></p><button type="button" class="arrivalNext" onclick="window.nwtbSalesCompleteStop()">VISIT COMPLETE / NEXT STOP</button><button type="button" class="arrivalBad" onclick="document.getElementById(\'nwtbArrival\').classList.remove(\'show\')">KEEP NAVIGATING</button></div>';
 document.body.appendChild(el);return el;
}
function showArrival(){
 const key=navTarget?.stop_id||'FINAL';if(!navTarget||arrivalFor===key)return;arrivalFor=key;
 const el=ensureArrival();document.getElementById('nwtbArrivalTitle').textContent=returningHome?'BACK AT NORTHWEST TRUCKS':'ARRIVED AT SALES STOP';
 document.getElementById('nwtbArrivalName').textContent=returningHome?'Sales route complete.':salesMode==='list'?`${navTarget.name} — complete your visit, then choose another destination from your list.`:`${navTarget.name} — complete your visit, then continue to the next stop.`;
 el.querySelector('.arrivalNext').textContent=returningHome?'END SALES ROUTE':salesMode==='list'?'VISIT COMPLETE / BACK TO LIST':'VISIT COMPLETE / NEXT STOP';
 el.classList.add('show');
 speak(returningHome?'You have returned to Northwest Trucks. Sales route complete.':`You have arrived at ${navTarget.name}. ${salesMode==='list'?'Complete your visit to choose another stop from your list.':'Complete your visit to start directions to the next stop.'}`,true);
 if(navigator.vibrate)navigator.vibrate([300,120,300]);
}
function hideArrival(){document.getElementById('nwtbArrival')?.classList.remove('show')}

async function navPost(origin,destination){
 const headers={'content-type':'application/json','apikey':KEY,'x-nwtb-sales':'1'};
 const session=localStorage.getItem('nwtb_chat_token');if(session)headers['x-nwtb-session']=session;
 const controller=typeof AbortController==='function'?new AbortController():null;
 const timer=controller?setTimeout(()=>controller.abort(),20000):null;
 try{const response=await fetch(NAV,{method:'POST',headers,body:JSON.stringify({action:'route',origin,destination:{lat:destination.lat,lon:destination.lon}}),...(controller?{signal:controller.signal}:{})});
  const result=await response.json().catch(()=>({error:'Navigation response error'}));if(!response.ok)throw Error(result.error||'Navigation failed');
  if(!Array.isArray(result.geometry)||!buildProgress(result))throw Error('The routing service did not return a usable road route. Try again.');return result;
 }finally{if(timer!==null)clearTimeout(timer)}
}
async function reroute(pos,announce=false){
 if(!navTarget)return;
 const generation=navGeneration,now=Date.now();if(now-navLastReroute<12000||!navProgress&&navRoutingRequest)return;
 navLastReroute=now;const request=++navRouteSequence;navRoutingRequest=request;
 const banner=document.getElementById('nwtbNavBanner');if(banner)banner.textContent=navTrafficAware?'LIVE TRAFFIC • Recalculating fastest route…':'Calculating route…';
 try{const target=await refreshTarget(generation);if(!target||request!==navRouteSequence)return;
  const result=await navPost(pos,target);if(generation!==navGeneration||request!==navRouteSequence)return;applyRoute(result,pos,announce);
 }catch(error){if(request===navRouteSequence)navigationError(error,generation)}
 finally{if(navRoutingRequest===request)navRoutingRequest=0}
}
async function trafficRefresh(pos){
 if(!navTarget||!navProgress||navTrafficBusy||navRoutingRequest||Date.now()-navLastTrafficCheck<TRAFFIC_REFRESH_MS)return;
 navTrafficBusy=true;navLastTrafficCheck=Date.now();const generation=navGeneration,request=++navRouteSequence;
 try{const target=await refreshTarget(generation);if(!target||request!==navRouteSequence)return;
  const result=await navPost(pos,target);if(generation===navGeneration&&request===navRouteSequence)applyRoute(result,pos,false);
 }catch(error){if(generation===navGeneration&&request===navRouteSequence)navigationError(error,generation)}
 finally{if(generation===navGeneration)navTrafficBusy=false}
}
function resetTarget(){
 navGeneration++;navRouteSequence++;navRoutingRequest=0;clearNavWatch();navProgress=null;navLastFix=null;navLastRecovery=0;navPermissionBlocked=false;navLastReroute=0;
 navRouteCoords=[];navSteps=[];navLastSpoken='';navVoiceCues=[];navStepIndex=0;arrivalFor='';arrivalHits=0;navTrafficAware=false;navRouteSource='';navLastTrafficCheck=0;navTrafficBusy=false;
 hideArrival();clearNearGlow();try{window.speechSynthesis?.cancel()}catch{}
 if(navLine&&navMap)navMap.removeLayer(navLine);if(navDest&&navMap)navMap.removeLayer(navDest);navLine=null;navDest=null;
}
async function beginTarget(index,final=false){
 resetTarget();navTarget=null;salesIndex=index;returningHome=final;
 navTarget=targetFor(final?home():routeList()[index],final);
 const generation=navGeneration,panel=ensurePanel();panel.classList.add('show');clearMetrics();setRoutingMode();setDestination();
 const next=panel.querySelector('.salesNext');if(next)next.textContent=final?'END SALES ROUTE':salesMode==='list'?'VISIT COMPLETE / BACK TO LIST':'VISIT COMPLETE / NEXT STOP';
 panel.querySelector('.salesChooseAnother').hidden=salesMode!=='list';
 document.getElementById('nwtbNavBanner').textContent='Checking the current Sales stop…';
 try{await refreshTarget(generation);if(generation!==navGeneration)return;
  await ensureAssets().catch(error=>{navigationError(error,generation)});if(generation!==navGeneration)return;
  if(!navigator.geolocation)throw Error('This phone/browser does not provide GPS.');
  document.getElementById('nwtbNavBanner').textContent='Getting your location…';startNavHealth();startNavWatch();
  navigator.geolocation.getCurrentPosition(p=>receiveNavFix(p,generation),error=>{if(generation===navGeneration)gpsError(error)},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  requestWake();
 }catch(error){navigationError(error,generation)}
}
function stopNavigation(){
 salesOperation++;salesTransition=false;resetTarget();navTarget=null;
 if(navHealthTimer!==null){clearInterval(navHealthTimer);navHealthTimer=null}
 salesIndex=0;returningHome=false;salesKeys=[];salesMode='route';clearMetrics();hideArrival();hideList();releaseWake();document.getElementById('nwtbNavPanel')?.classList.remove('show');
}
window.nwtbSalesStartNav=async function(){
 if(salesTransition)return;
 const route=routeList();if(!route.length){alert('Create and review a Sales route first.');return}
 stopNavigation();const operation=++salesOperation;salesTransition=true;salesKeys=route.map(salesKey);window.nwtbPrimeVoice?.();
 try{await beginTarget(0);if(operation===salesOperation)ensurePanel().scrollIntoView({behavior:'smooth',block:'start'})}
 catch(error){navigationError(error)}finally{if(operation===salesOperation)salesTransition=false}
};
window.nwtbSalesCompleteStop=async function(){
 if(!navTarget||salesTransition)return;
 if(returningHome){stopNavigation();return}
 if(salesMode==='list'){listVisited.add(salesKeys[salesIndex]);await window.nwtbSalesOpenListMode();return}
 const operation=++salesOperation;salesTransition=true;hideArrival();
 try{const next=salesIndex+1;await beginTarget(next,next>=salesKeys.length)}
 catch(error){navigationError(error)}finally{if(operation===salesOperation)salesTransition=false}
};
window.nwtbSalesRepeat=()=>{const step=currentStep();if(step)speak(instruction(step)+' '+(document.getElementById('nwtbTurnDist')?.textContent||''),true)};
window.nwtbSalesRecenter=()=>{if(navMap&&navPos)navMap.setView(navPos.getLatLng(),16)};
window.nwtbSalesEndNav=stopNavigation;

function ensureList(){
 let dialog=document.getElementById('nwtbSalesList');if(dialog)return dialog;
 const style=document.createElement('style');style.textContent=`
 .salesNavChoices{display:grid;grid-template-columns:1fr 1fr;gap:10px}.salesListMode{background:#174e83;color:#fff;width:100%;font-size:18px;min-height:52px}
 #nwtbSalesList{display:none;position:fixed;inset:0;z-index:100000;background:#0f172a99;padding:24px;align-items:center;justify-content:center}#nwtbSalesList.show{display:flex}
 .salesListSheet{width:min(820px,100%);min-height:0;max-height:92dvh;background:#f4f6f8;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px #0006}.salesListTop,.salesListFooter{flex-shrink:0;position:relative;z-index:2}.salesListEntries{min-height:0;flex:1 1 auto;position:relative;z-index:1}
 .salesListTop{display:flex;gap:12px;justify-content:space-between;align-items:start;padding:20px;background:#17202a;color:#fff}.salesListTop h2{margin:0 0 6px;font-size:24px}.salesListTop p{margin:0;font-size:14px;line-height:1.45;color:#d9e2eb}.salesListTop button{background:#fff;color:#17202a;min-height:44px;white-space:nowrap}
 .salesListEntries{overflow-y:auto;padding:16px;display:grid;gap:10px}.salesListEntry{width:100%;display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:12px;align-items:center;text-align:left;padding:16px;background:#fff;border:1px solid #cbd5e1;border-radius:12px;color:#17202a;cursor:pointer}.salesListEntry:hover,.salesListEntry:focus-visible{border-color:#174e83;outline:2px solid #174e83;outline-offset:1px}.salesListNumber{background:#e4effc;border-radius:50%;width:34px;height:34px;display:grid;place-items:center;color:#174e83;font-size:16px}.salesListBusiness{font-size:17px;overflow-wrap:anywhere}.salesListDetails{display:block;margin-top:6px;font-size:13px;line-height:1.45;font-weight:400;overflow-wrap:anywhere;color:#52606d}.salesListGo{background:#15803d;border-radius:8px;color:#fff;padding:10px 12px;font-size:12px}.salesListVisited{display:block;margin-top:7px;color:#17613b;font-size:12px}.salesListFooter{padding:14px 18px;border-top:1px solid #d9dee4;background:#fff}.salesListFooter button{background:#e4effc;color:#174e83;min-height:44px;width:100%}
 @media(max-width:600px){.salesNavChoices{grid-template-columns:1fr}#nwtbSalesList{padding:0}.salesListSheet{width:100%;height:100dvh;max-height:100dvh;border-radius:0}.salesListTop{padding:16px}.salesListTop h2{font-size:22px}.salesListEntries{padding:12px}.salesListEntry{grid-template-columns:28px minmax(0,1fr);gap:10px;padding:14px}.salesListNumber{width:28px;height:28px;font-size:14px}.salesListGo{grid-column:2;justify-self:start}.salesListBusiness{font-size:16px}}
 `;document.head.appendChild(style);
 dialog=document.createElement('div');dialog.id='nwtbSalesList';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','nwtbSalesListTitle');
 dialog.innerHTML='<section class="salesListSheet"><div class="salesListTop"><div><h2 id="nwtbSalesListTitle">SALES LIST MODE</h2><p id="nwtbSalesListSummary">Choose any business to navigate directly to it.</p></div><button type="button" data-sales-list="close">BACK</button></div><div id="nwtbSalesListEntries" class="salesListEntries"></div><div class="salesListFooter"><button type="button" data-sales-list="home">RETURN TO NWTB</button></div></section>';
 dialog.addEventListener('click',event=>{const button=event.target.closest?.('button[data-sales-list]');if(!button)return;const action=button.dataset.salesList;if(action==='close'){salesOperation++;salesTransition=false;hideList()}else if(action==='go')window.nwtbSalesNavigateToStop(button.dataset.key);else if(action==='home')window.nwtbSalesNavigateToStop(null,true)});
 dialog.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();salesOperation++;salesTransition=false;hideList();return}
  if(event.key!=='Tab')return;const buttons=[...dialog.querySelectorAll('button:not([disabled])')],first=buttons[0],last=buttons.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
 });
 document.body.appendChild(dialog);return dialog;
}
function hideList(){const dialog=document.getElementById('nwtbSalesList');if(dialog?.classList.contains('show')){dialog.classList.remove('show');document.querySelector('[data-sales-open-list]')?.focus()}}
function renderList(){
 const list=routeList(),container=document.getElementById('nwtbSalesListEntries');container.replaceChildren();
 const visited=list.filter(a=>listVisited.has(salesKey(a))).length;
 document.getElementById('nwtbSalesListSummary').textContent=`${list.length} stops • ${visited} visited this session. Tap any business to navigate directly to it. You choose the order.`;
 list.forEach((account,index)=>{
  const button=document.createElement('button');button.type='button';button.className='salesListEntry';button.dataset.salesList='go';button.dataset.key=salesKey(account);
  const number=document.createElement('span');number.className='salesListNumber';number.textContent=index+1;
  const body=document.createElement('span'),business=document.createElement('b');business.className='salesListBusiness';business.textContent=account.name;body.appendChild(business);
  const details=document.createElement('span');details.className='salesListDetails';details.textContent=[account.address,account.layer||account.finalLayer,account.customerNumber?'Customer #'+account.customerNumber:'',account.phone||''].filter(Boolean).join(' • ');body.appendChild(details);
  if(listVisited.has(salesKey(account))){const badge=document.createElement('span');badge.className='salesListVisited';badge.textContent='✓ Visited this session';body.appendChild(badge)}
  const go=document.createElement('span');go.className='salesListGo';go.textContent='NAVIGATE HERE';button.append(number,body,go);container.appendChild(button);
 });
}
window.nwtbSalesOpenListMode=async function(){
 if(!routeList().length){alert('Create your Sales route and finish the preview with DONE first.');return}
 stopNavigation();salesMode='list';const operation=++salesOperation;salesTransition=true;
 const dialog=ensureList();dialog.classList.add('show');document.getElementById('nwtbSalesListEntries').textContent='Checking current Sales route approvals…';dialog.querySelector('[data-sales-list="close"]').focus();
 try{const fresh=await checkedSalesRoute();if(operation!==salesOperation)return;currentRoute=fresh;salesKeys=fresh.map(salesKey);renderList()}
 catch(error){if(operation===salesOperation){hideList();navigationError(error)}}finally{if(operation===salesOperation)salesTransition=false}
};
window.nwtbSalesNavigateToStop=async function(key,final=false){
 if(salesTransition)return;
 const list=routeList(),index=final?list.length:list.findIndex(a=>salesKey(a)===String(key));
 if(!list.length||index<0){alert('That business is no longer in this Sales route. Reopen List Mode.');return}
 stopNavigation();salesMode='list';salesKeys=list.map(salesKey);const operation=++salesOperation;salesTransition=true;window.nwtbPrimeVoice?.();
 try{await beginTarget(index,final);if(operation===salesOperation)ensurePanel().scrollIntoView({behavior:'smooth',block:'start'})}
 catch(error){navigationError(error)}finally{if(operation===salesOperation)salesTransition=false}
};

function decorateRoute(){
 ensureStyle();const out=document.getElementById('output');if(!out||out.style.display==='none'||!routeList().length)return;
 const old=document.getElementById('nwtbNavigationPanel');if(old)old.innerHTML='<b>NWTB BUILT-IN NAVIGATION</b><br>Review the optimized customer list, then start the same NWTB navigation used by Delivery. Live road-distance and ETA updates, spoken turns, rerouting, and Sales stop progression stay inside this app.';
 out.querySelector('#nwtbSalesReviewControls')?.remove();const box=document.createElement('div');box.id='nwtbSalesReviewControls';
 box.innerHTML='<div class="salesNavChoices"><button type="button" class="salesStartNav" onclick="window.nwtbSalesStartNav()">START NWTB TURN-BY-TURN</button><button type="button" class="salesListMode" data-sales-open-list onclick="window.nwtbSalesOpenListMode()">LIST MODE</button></div><div class="salesNavHint">Turn-by-turn follows the route order. List Mode lets you choose any stop. Allow phone Location access. Traffic adjustments use available NWTB fleet observations.</div>';
 if(old)old.after(box);else out.prepend(box);
 out.querySelectorAll('a.routebtn').forEach((link,i)=>{link.classList.add('salesGoogleBackup');link.textContent=i===0?'GOOGLE MAPS BACKUP':'GOOGLE MAPS BACKUP — PART '+(i+1)});
}
const previousRender=window.renderRoute;
if(typeof previousRender==='function')window.renderRoute=function(order,meta={}){stopNavigation();listVisited.clear();ensureList();const result=previousRender(order,meta);setTimeout(decorateRoute,0);return result};
document.addEventListener('visibilitychange',()=>{resumeNavGps();if(document.visibilityState==='visible'&&navTarget)requestWake()});
window.addEventListener('pageshow',resumeNavGps);window.addEventListener('online',resumeNavGps);
// Stop GPS immediately on sign-out, including a click before the logout request finishes.
document.addEventListener('click',event=>{if(event.target.closest?.('#nwtbSalesLogoutBtn'))stopNavigation()},true);
const previousLogout=window.nwtbSalesCloudLogout;
if(typeof previousLogout==='function')window.nwtbSalesCloudLogout=function(){stopNavigation();return previousLogout.apply(this,arguments)};
window.addEventListener('storage',event=>{if(event.key==='nwtb_chat_token'&&!event.newValue)stopNavigation()});
setTimeout(decorateRoute,500);

})();
