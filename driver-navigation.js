(()=>{
const NAV='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-driver-navigation';
const HOME_NAV={name:'Northwest Trucks - Bolingbrook',address:'201 S W Frontage Rd, Bolingbrook, IL 60440',lat:41.682487,lon:-88.072262};
const NEAR_STOP_M=152.4,ARRIVAL_M=6.096,ARRIVAL_SOFT_MAX_M=30,TRAFFIC_REFRESH_MS=90000;
let navMap=null,navLine=null,navPos=null,navGlow=null,navDest=null,navWatch=null,navTarget=null,navSteps=[],navStepIndex=0,navRouteCoords=[],navLastReroute=0,navLastSpoken='',navRouteId='',navRouteMeta=null,baseFinish=null,arrivalFor='',arrivalHits=0;
let navTrafficAware=false,navRouteSource='',navEtaAnchorS=0,navEtaAnchorAt=0,navLastTrafficCheck=0,navTrafficBusy=false;

const hav=(a,b)=>{const R=6371008.8,p=Math.PI/180,dLat=(b.lat-a.lat)*p,dLon=(b.lon-a.lon)*p,x=Math.sin(dLat/2)**2+Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x))};
const feet=m=>m<160.934?`${Math.max(10,Math.round(m/10)*10)} ft`:`${(m/1609.344).toFixed(1)} mi`;
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
function speak(text){if(!text||!('speechSynthesis'in window)||text===navLastSpoken)return;navLastSpoken=text;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.rate=.95;u.pitch=1;speechSynthesis.speak(u)}catch{}}
function routingLabel(){return navTrafficAware?'NWTB TURN-BY-TURN • LIVE TRAFFIC':'NWTB TURN-BY-TURN'}
function bannerText(base){return navTrafficAware?`LIVE TRAFFIC • ${base}`:base}
function setRoutingMode(){const x=document.getElementById('nwtbNavMode');if(x)x.textContent=routingLabel()}
function etaRemaining(fallback){if(navEtaAnchorS>0){const elapsed=(Date.now()-navEtaAnchorAt)/1000;return Math.max(1,navEtaAnchorS-elapsed)}return fallback}

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
 if('Notification'in window&&Notification.permission==='granted'){try{new Notification('NWTB — ARRIVED AT STOP',{body:`${navTarget.name||'Stop'} — complete stop and go to the next stop.`,tag:'nwtb-arrival-'+navTarget.stop_id,renotify:true})}catch{}}
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
 ensureStyle();let p=document.getElementById('nwtbNavPanel');if(p)return p;p=document.createElement('div');p.id='nwtbNavPanel';p.innerHTML=`<div class="navTop"><small id="nwtbNavMode">NWTB TURN-BY-TURN</small><div id="nwtbTurn" class="navTurn">Ready</div><div class="navMeta"><span><b id="nwtbTurnDist">—</b> to turn</span><span><b id="nwtbEta">—</b> ETA</span><span><b id="nwtbRemain">—</b> remaining</span></div></div><div id="nwtbNavBanner" class="navBanner">Navigation ready</div><div id="nwtbNavMap" class="navMap"></div><div class="navActions"><button class="btn navVoice" onclick="window.nwtbRepeatTurn()">🔊 REPEAT TURN</button><button class="btn ghost" onclick="window.nwtbRecenter()">⌖ RECENTER</button><button class="btn navEnd" onclick="window.nwtbStopNavigation()">END NAVIGATION</button></div>`;const routes=document.getElementById('routes');if(routes)routes.prepend(p);return p
}
function initMap(lat,lon){const p=ensurePanel();p.classList.add('show');if(!window.L){document.getElementById('nwtbNavBanner').className='navBanner warn';document.getElementById('nwtbNavBanner').textContent='Map library failed to load. Turn instructions will still work.';return}if(!navMap){navMap=L.map('nwtbNavMap',{zoomControl:true}).setView([lat,lon],15);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(navMap)}setTimeout(()=>navMap.invalidateSize(),80)}
function drawRoute(current){if(!navMap||!window.L)return;if(navLine)navMap.removeLayer(navLine);if(navRouteCoords.length){const ll=navRouteCoords.map(c=>[c[1],c[0]]);navLine=L.polyline(ll,{weight:7,opacity:.8}).addTo(navMap);const b=navLine.getBounds();if(b.isValid())navMap.fitBounds(b,{padding:[28,28],maxZoom:16})}clearNearGlow();if(navPos)navMap.removeLayer(navPos);navPos=L.circleMarker([current.lat,current.lon],{radius:9,weight:4,fillOpacity:1}).addTo(navMap).bindTooltip('You',{permanent:false});if(navDest)navMap.removeLayer(navDest);navDest=L.marker([navTarget.lat,navTarget.lon]).addTo(navMap).bindPopup(navTarget.name||'Destination')}
async function navPost(payload){const h={'content-type':'application/json','apikey':KEY,'x-nwtb-session':token};const r=await fetch(NAV,{method:'POST',headers:h,body:JSON.stringify(payload)}),j=await r.json().catch(()=>({error:'Navigation response error'}));if(!r.ok)throw Error(j.error||'Navigation failed');return j}
function currentStep(){return navSteps[Math.min(navStepIndex,Math.max(0,navSteps.length-1))]||null}
function updateDisplay(pos,forceSpeak=false,gps={}){
 const remaining=hav(pos,navTarget),arriveDistance=Math.min(remaining,routeArrivalDistance(pos)),threshold=arrivalThreshold(gps),exact=arriveDistance<=ARRIVAL_M,soft=arriveDistance<=threshold&&Number(gps.speed||0)<=3.5;
 if(exact)arrivalHits=2;else if(soft)arrivalHits++;else arrivalHits=0;
 const step=currentStep();if(step){const loc=step?.maneuver?.location||[],mpos=loc.length===2?{lat:Number(loc[1]),lon:Number(loc[0])}:navTarget;let d=hav(pos,mpos);
  while(d<28&&navStepIndex<navSteps.length-1){navStepIndex++;const n=currentStep(),nl=n?.maneuver?.location||[];if(nl.length===2)d=hav(pos,{lat:Number(nl[1]),lon:Number(nl[0])});else break}
  const now=currentStep(),txt=instruction(now);document.getElementById('nwtbTurn').textContent=txt;document.getElementById('nwtbTurnDist').textContent=feet(d);const speed=Math.max(6,Number(window.__nwtbLastSpeedMps||0)||13.4);document.getElementById('nwtbEta').textContent=eta(etaRemaining(remaining/speed));if(forceSpeak||d<220)speak(`${d<45?'Now, ':''}${txt}`)
 }
 document.getElementById('nwtbRemain').textContent=feet(remaining);updateNearGlow(pos,remaining);
 if(exact||arrivalHits>=2){document.getElementById('nwtbNavBanner').textContent=bannerText(`ARRIVED: ${navTarget.name}`);if(navTarget.stop_id)showArrival();else speak(`You have arrived at ${navTarget.name}`)}else document.getElementById('nwtbNavBanner').textContent=bannerText(remaining<=NEAR_STOP_M&&navTarget.stop_id?`NEAR STOP: ${navTarget.name}`:`Navigating to ${navTarget.name}`)
}
function distanceToRoute(pos){if(!navRouteCoords.length)return Infinity;let best=Infinity;const stride=Math.max(1,Math.floor(navRouteCoords.length/180));for(let i=0;i<navRouteCoords.length;i+=stride){const c=navRouteCoords[i],d=hav(pos,{lat:c[1],lon:c[0]});if(d<best)best=d}return best}
function applyRoute(j,pos,announce=false){
 navSteps=j.steps||[];navRouteCoords=j.geometry||[];navStepIndex=0;navTrafficAware=!!j.traffic_aware;navRouteSource=j.source||'';navEtaAnchorS=Number(j.duration_s)||0;navEtaAnchorAt=Date.now();navLastTrafficCheck=Date.now();setRoutingMode();drawRoute(pos);document.getElementById('nwtbEta').textContent=eta(navEtaAnchorS);document.getElementById('nwtbRemain').textContent=feet(j.distance_m);updateDisplay(pos,announce)
}
async function reroute(pos,announce=false){if(!navTarget)return;const now=Date.now();if(now-navLastReroute<12000)return;navLastReroute=now;document.getElementById('nwtbNavBanner').textContent=navTrafficAware?'LIVE TRAFFIC • Recalculating fastest route…':'Calculating route…';try{const j=await navPost({action:'route',origin:pos,destination:{lat:navTarget.lat,lon:navTarget.lon}});applyRoute(j,pos,announce)}catch(e){document.getElementById('nwtbNavBanner').className='navBanner warn';document.getElementById('nwtbNavBanner').textContent=e.message}}
async function trafficRefresh(pos){
 if(!navTarget||!navTrafficAware||navTrafficBusy||Date.now()-navLastTrafficCheck<TRAFFIC_REFRESH_MS)return;navTrafficBusy=true;navLastTrafficCheck=Date.now();
 try{const j=await navPost({action:'route',origin:pos,destination:{lat:navTarget.lat,lon:navTarget.lon}});if(j?.traffic_aware)applyRoute(j,pos,false)}catch(e){console.warn('Live traffic refresh failed',e)}finally{navTrafficBusy=false}
}
function startNavWatch(){if(navWatch!==null||!navigator.geolocation)return;navWatch=navigator.geolocation.watchPosition(p=>{const c=p.coords,pos={lat:c.latitude,lon:c.longitude};window.__nwtbLastSpeedMps=c.speed||0;if(navPos&&navMap)navPos.setLatLng([pos.lat,pos.lon]);updateDisplay(pos,false,{accuracy:c.accuracy,speed:c.speed});if(navMap&&document.visibilityState==='visible')navMap.panTo([pos.lat,pos.lon],{animate:true,duration:.4});const off=distanceToRoute(pos);if(off>120&&Date.now()-navLastReroute>25000)reroute(pos,true);else if(navTrafficAware)trafficRefresh(pos)},e=>{const b=document.getElementById('nwtbNavBanner');if(b){b.className='navBanner warn';b.textContent='Navigation GPS: '+e.message}},{enableHighAccuracy:true,maximumAge:3000,timeout:15000})}
async function beginNavigation(target,routeId){navTarget=target;navRouteId=routeId||route||'';navLastSpoken='';navStepIndex=0;arrivalFor='';arrivalHits=0;navTrafficAware=false;navRouteSource='';navEtaAnchorS=0;navEtaAnchorAt=0;navLastTrafficCheck=0;navTrafficBusy=false;hideArrival();clearNearGlow();const p=ensurePanel();p.classList.add('show');setRoutingMode();document.getElementById('nwtbNavBanner').className='navBanner';document.getElementById('nwtbNavBanner').textContent='Getting your location…';if(!navigator.geolocation){document.getElementById('nwtbNavBanner').className='navBanner warn';document.getElementById('nwtbNavBanner').textContent='This phone/browser does not provide GPS.';return}navigator.geolocation.getCurrentPosition(async g=>{const pos={lat:g.coords.latitude,lon:g.coords.longitude};initMap(pos.lat,pos.lon);await reroute(pos,true);startNavWatch();try{if(typeof requestWakeLock==='function')requestWakeLock()}catch{}},e=>{document.getElementById('nwtbNavBanner').className='navBanner warn';document.getElementById('nwtbNavBanner').textContent='Allow Location access to use NWTB navigation: '+e.message},{enableHighAccuracy:true,maximumAge:3000,timeout:15000})}

async function targetForStop(stop){const o=stop?.delivery_orders||{};let lat=Number(o.lat),lon=Number(o.lon);if(!validCoord(lat,lon)){try{const g=await post(API,{action:'geocode',address:o.address});lat=Number(g.lat);lon=Number(g.lon)}catch{}}if(!validCoord(lat,lon))throw Error('This stop does not have a usable physical location.');return {name:o.customer_name||'Stop',address:o.address||'',lat,lon,stop_id:stop.id}}
async function finalTarget(r){
 if(!r||r.route_mode!=='CUSTOM')return {...HOME_NAV,final:true};
 const mode=r.end_mode||'RETURN_DEPOT';if(mode==='LAST_STOP')return null;
 if(mode==='SAME_AS_START'&&validCoord(r.start_lat,r.start_lon))return {name:r.start_name||'Custom Start',address:r.start_address||'',lat:Number(r.start_lat),lon:Number(r.start_lon),final:true};
 if(validCoord(r.end_lat,r.end_lon))return {name:r.end_name||'Custom End',address:r.end_address||'',lat:Number(r.end_lat),lon:Number(r.end_lon),final:true};
 if(mode==='RETURN_DEPOT')return {...HOME_NAV,final:true};
 return null
}
async function navigateNext(routeId){
 const fresh=await post(API,{action:'route_get',route_id:routeId});navRouteMeta=fresh.route||navRouteMeta;const next=(fresh.stops||[]).find(s=>s.status==='PENDING');if(next){await beginNavigation(await targetForStop(next),routeId);return}
 const end=await finalTarget(navRouteMeta);if(end){await beginNavigation(end,routeId);document.getElementById('nwtbNavBanner').textContent=bannerText(`All stops complete — returning to ${end.name}`);speak(`All stops complete. Returning to ${end.name}`)}else{window.nwtbStopNavigation();speak('Route complete')}
}

window.nwtbCompleteNext=async()=>{if(!navTarget?.stop_id||!baseFinish)return;const id=navTarget.stop_id;hideArrival();clearNearGlow();arrivalHits=0;try{await baseFinish(id,'DELIVERED');await new Promise(r=>setTimeout(r,250));await navigateNext(navRouteId)}catch(e){alert(e.message||e)}};
window.nwtbNotCompleted=async()=>{if(!navTarget?.stop_id||!baseFinish)return;const id=navTarget.stop_id;hideArrival();clearNearGlow();arrivalHits=0;try{await baseFinish(id,'NOT_DELIVERED');await new Promise(r=>setTimeout(r,250));await navigateNext(navRouteId)}catch(e){alert(e.message||e)}};
window.nwtbRepeatTurn=()=>{const s=currentStep();if(s)speak(instruction(s)+' '+(document.getElementById('nwtbTurnDist')?.textContent||''))};
window.nwtbRecenter=()=>{if(navMap&&navPos)navMap.setView(navPos.getLatLng(),16)};
window.nwtbStopNavigation=()=>{if(navWatch!==null){navigator.geolocation.clearWatch(navWatch);navWatch=null}clearNearGlow();navTarget=null;navSteps=[];navRouteCoords=[];navStepIndex=0;arrivalFor='';arrivalHits=0;navTrafficAware=false;navRouteSource='';navEtaAnchorS=0;navEtaAnchorAt=0;navLastTrafficCheck=0;navTrafficBusy=false;hideArrival();try{speechSynthesis.cancel()}catch{}const p=document.getElementById('nwtbNavPanel');if(p)p.classList.remove('show')};

async function decorateRoute(routeId){
 try{
  const j=await post(API,{action:'route_get',route_id:routeId});navRouteMeta=j.route||null;const stops=j.stops||[];
  document.querySelectorAll('#routes .stop').forEach((el,i)=>{
    const stop=stops[i];if(!stop)return;
    [...el.querySelectorAll('a,button')].forEach(x=>{const t=(x.textContent||'').trim();if(/NAVIGATE/i.test(t)||t==='COMPLETE')x.remove()});
    const bad=[...el.querySelectorAll('button')].find(b=>/NOT COMPLETED/i.test(b.textContent||''));if(bad){bad.classList.add('nwtbException');bad.textContent='NOT COMPLETED'}
  });
  const panel=document.querySelector('#routes > .panel');if(panel){
    panel.querySelectorAll('a.btn.return').forEach(a=>a.remove());
    [...panel.querySelectorAll('button')].filter(b=>/START ROUTE/i.test(b.textContent||'')).forEach(b=>{
      const nb=document.createElement('button');nb.className='btn nwtbFullRouteBtn';nb.textContent='ROUTE FULL ROUTE IN NWTB';nb.onclick=async()=>{try{if(typeof window.startRoute==='function')await window.startRoute(routeId);else if(typeof startRoute==='function')await startRoute(routeId);await new Promise(r=>setTimeout(r,500));await navigateNext(routeId)}catch(e){alert(e.message||e)}};b.replaceWith(nb)
    })
  }
 }catch(e){console.warn('Navigation decoration failed',e)}
}

function install(){
 const originalOpen=window.openRoute;if(typeof originalOpen!=='function')return false;baseFinish=window.finish;
 window.openRoute=async function(id,fromChange=false){const r=await originalOpen.apply(this,arguments);setTimeout(()=>decorateRoute(id),100);return r};
 return true
}
let tries=0;const t=setInterval(()=>{if(install()||++tries>80)clearInterval(t)},100);
})();