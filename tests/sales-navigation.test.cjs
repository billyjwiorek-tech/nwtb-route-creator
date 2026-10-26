'use strict';
// Actual Sales navigation, route policy, voice transport and Leaflet; synthetic GPS only.
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {parseHTML}=require('linkedom'),policy=require('../sales-route-policy.js');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const settle=async()=>{for(let i=0;i<70;i++)await Promise.resolve()};
const A={lat:41.69,lon:-88.06};
const point=(x,y)=>({lat:A.lat+y/111195,lon:A.lon+x/(111195*Math.cos(A.lat*Math.PI/180))});
const B=point(2000,0),C=point(2000,1000),D=point(0,1000),E=point(2000,2000);
const geometry=[A,B,C,D].map(p=>[p.lon,p.lat]);
const itinerary={geometry,distance_m:5000,duration_s:600,traffic_aware:false,source:'OSRM',steps:[
 {name:'First road',distance_m:2000,duration_s:100,maneuver:{type:'depart',location:geometry[0]}},
 {name:'Second road',distance_m:1000,duration_s:400,maneuver:{type:'turn',modifier:'left',location:geometry[1]}},
 {name:'Final road',distance_m:2000,duration_s:100,maneuver:{type:'turn',modifier:'left',location:geometry[2]}},
 {name:'Destination',distance_m:0,duration_s:0,maneuver:{type:'arrive',location:geometry[3]}}
]};
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture({mobile='android',emptySteps=false,speech=true}={}){
 const {window:dom}=parseHTML('<html><head></head><body><button id="nwtbSalesLogoutBtn">LOG OUT</button><div id="output"></div></body></html>'),document=dom.document;
 const timers=new Map(),watches=new Map(),requests=[],spoken=[],warnings=[],local=new Map([['nwtb_chat_token','fixture-sales-session'],['nwtb_delivery_token','fixture-office-session']]);
 const records=[D,E].map((p,i)=>({salesAccountId:i+1,customerNumber:String(i+1),name:'Sample Sales Business '+(i+1),address:(i+1)+' Industrial Dr, Bolingbrook, IL',...p,finalIncluded:true,finalLayer:'ACTIVE CUSTOMERS',finalRouteApproved:true}));
 let now=1800000000000,serial=0,current=A,holdGps=false,permission=false,pendingValidation=null,failValidation=false,routeGate=null,routeOverride=null;
 const gpsRequests=[],pendingGps=[];
 const schedule=(fn,ms,interval=false)=>{const id=++serial;timers.set(id,{fn,at:now+Math.max(1,ms||1),ms:Math.max(1,ms||1),interval});return id};
 async function tick(ms){const end=now+ms;await settle();for(let n=0;n<4000;n++){let next;for(const item of timers)if(item[1].at<=end&&(!next||item[1].at<next[1].at))next=item;if(!next)break;const [id,t]=next;now=t.at;if(t.interval)t.at+=t.ms;else timers.delete(id);await t.fn();await settle()}now=end;await settle()}
 class Clock extends Date{static now(){return now}}
 Object.defineProperty(document,'visibilityState',{value:'visible',writable:true,configurable:true});
 Object.defineProperties(dom.HTMLElement.prototype,{clientWidth:{configurable:true,get:()=>400},clientHeight:{configurable:true,get:()=>360},offsetWidth:{configurable:true,get:()=>400},offsetHeight:{configurable:true,get:()=>360}});
 dom.HTMLElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:400,height:360,right:400,bottom:360});dom.HTMLElement.prototype.scrollIntoView=function(){};dom.HTMLElement.prototype.focus=function(){};
 const createNS=document.createElementNS.bind(document);document.createElementNS=(ns,tag)=>{const el=createNS(ns,tag);if(tag==='svg')el.createSVGRect=()=>({});return el};
 const position=(p=current,options={})=>({timestamp:options.timestamp??now,coords:{latitude:p.lat,longitude:p.lon,accuracy:options.accuracy??3,speed:options.speed??10,heading:options.heading??null}});
 const navigator={userAgent:mobile==='ios'?'iPhone Safari':'Android Chrome',platform:mobile==='ios'?'iPhone':'Linux',maxTouchPoints:5,geolocation:{
  getCurrentPosition(success,error,options){gpsRequests.push(options);if(permission)return error?.({code:1,message:'Fixture permission denied'});if(holdGps)pendingGps.push(success);else success(position())},
  watchPosition(success,error,options){gpsRequests.push(options);const id=serial++;watches.set(id,{success,error});return id},clearWatch(id){watches.delete(id)}
 }};
 const localStorage={getItem:key=>local.get(key)||null,setItem:(key,value)=>local.set(key,String(value)),removeItem:key=>local.delete(key)};
 const synth={getVoices:()=>[],addEventListener(){},cancel(){},resume(){},speak:u=>{u.onstart?.();spoken.push(u.text);u.onend?.()}};
 const window={document,navigator,localStorage,HTMLElement:dom.HTMLElement,screen:{deviceXDPI:1,logicalXDPI:1},addEventListener:document.addEventListener.bind(document),removeEventListener:document.removeEventListener.bind(document),matchMedia:()=>({matches:true}),requestAnimationFrame:fn=>schedule(fn,16),cancelAnimationFrame:id=>timers.delete(id),getComputedStyle:el=>({getPropertyValue:key=>el.style[key]||'',position:'relative'}),NwtbSalesPolicy:policy};
 dom.getComputedStyle=window.getComputedStyle;
 if(speech)window.speechSynthesis=synth;
 class Utterance{constructor(text){this.text=text}}
 const context={window,document,navigator,localStorage,console,Date:Clock,Map,Set,Promise,Request,Response,URL,AbortController,SpeechSynthesisUtterance:Utterance,speechSynthesis:synth,CustomEvent:dom.CustomEvent,setTimeout:(fn,ms)=>schedule(fn,ms),setInterval:(fn,ms)=>schedule(fn,ms,true),clearTimeout:id=>timers.delete(id),clearInterval:id=>timers.delete(id),accounts:clone(records),currentRoute:clone(records),currentMapLinks:[],depot:{...A,name:'Northwest Trucks - Bolingbrook',address:'Fixture depot'},alert:message=>warnings.push(message)};
 window.renderRoute=order=>{context.currentRoute=order};window.mapsLinks=()=>[];window.routeXLRouteText=()=>'';window.optimize=async()=>({});window.nwtbNormalizeSalesAccount=a=>a;
 window.nwtbSalesApi=async(action,body)=>{requests.push({action,body});assert.equal(action,'validate_route');if(pendingValidation){const gate=pendingValidation;pendingValidation=null;await new Promise(resolve=>gate.resolve=resolve)}if(failValidation)throw Error('Fixture verification unavailable');const result=policy.validate(body.stops,records);if(!result.ok)throw Error(policy.MESSAGE);return result};
 context.fetch=window.fetch=async(url,init)=>{
  const body=JSON.parse(init.body);requests.push({url,body,headers:init.headers});assert.ok(url.endsWith('/nwtb-driver-navigation'));
  const gate=routeGate;routeGate=null;if(gate)await new Promise(resolve=>gate.resolve=resolve);
  const data=routeOverride||((body.destination.lat===D.lat&&body.destination.lon===D.lon)?{...clone(itinerary),...(emptySteps?{steps:[]}:{})}:{geometry:[[body.origin.lon,body.origin.lat],[body.destination.lon,body.destination.lat]],steps:[],distance_m:1000,duration_s:120,source:'OSRM',traffic_aware:false});
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 };
 const ctx=vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('leaflet/dist/leaflet-src.js'),'utf8'),ctx);ctx.L=window.L;
 vm.runInContext(read('driver-voice-live.js'),ctx);
 let source=read('sales-built-in-navigation.js'),last=source.lastIndexOf('})();');
 source=source.slice(0,last)+'window.__salesNavTest={buildProgress,projectRoute,remainingProgress,applyRoute,receiveNavFix,reroute,trafficRefresh,beginTarget,feet,get target(){return navTarget},get map(){return navMap},get coords(){return navRouteCoords},get generation(){return navGeneration}};'+source.slice(last);
 vm.runInContext(source,ctx,{filename:'sales-built-in-navigation.js'});vm.runInContext(read('sales-route-safety.js'),ctx);
 const safety=window.nwtbSalesSafetyWarning;window.nwtbSalesSafetyWarning=error=>{warnings.push(error.message);safety(error)};
 return {window,document,ctx,records,requests,spoken,warnings,local,watches,gpsRequests,tick,position,private:window.__salesNavTest,
  metrics:()=>({eta:document.getElementById('nwtbEta')?.textContent,distance:document.getElementById('nwtbRemain')?.textContent,banner:document.getElementById('nwtbNavBanner')?.textContent}),
  async start(){await window.nwtbSalesStartNav();await settle();await tick(100);spoken.splice(0,spoken.indexOf('N W T B voice navigation on.')+1)},
  async emit(p,options={}){current=p;const fix=position(p,options);for(const w of [...watches.values()])w.success(fix);await settle()},
  holdGps(){holdGps=true},releaseGps(p=current){current=p;holdGps=false;for(const fn of pendingGps.splice(0))fn(position());return settle()},
  visibility(state){document.visibilityState=state;document.dispatchEvent(new dom.Event('visibilitychange'))},permission:v=>permission=v,
  holdValidation(){const gate={};pendingValidation=gate;return {release:()=>gate.resolve?.()}},failValidation:v=>failValidation=v,
  holdRoute(){const gate={};routeGate=gate;return {release:()=>gate.resolve?.()}},overrideRoute:data=>routeOverride=data,
  stop:()=>window.nwtbSalesEndNav()};
}

test('Sales uses the Delivery road-progress/ETA, voice cue and GPS algorithms',()=>{
 const sales=read('sales-built-in-navigation.js'),driver=read('driver-navigation-native.js');
 for(const [start,end]of [['function buildProgress','function clearMetrics'],['function instruction','function routingLabel'],['function recoverNavGps','function ensureStyle'],['function initMap','function drawRoute']]){
  const extract=text=>text.slice(text.indexOf(start),text.indexOf(end));
  assert.equal(extract(sales),extract(driver),'Copied Delivery algorithm drift: '+start);
 }
 for(const entry of ['index.html','app.html']){const html=read(entry);assert.ok(html.includes('sales-built-in-navigation.js?v=20261026-SALESVOICE1'));assert.ok(html.includes('driver-voice-live.js?v=20261026-returnvoice1'));assert.ok(!html.includes('driver-navigation-native.js'));}
});

test('iPhone/Android movement updates road miles and segment ETA; standing still invents no progress',async()=>{
 for(const mobile of ['android','ios']){
  const f=fixture({mobile});assert.equal(f.watches.size,0);await f.start();assert.equal(f.metrics().distance,'3.1 mi');assert.equal(f.metrics().eta,'10 min');
  await f.emit(point(1000,0));assert.equal(f.metrics().distance,'2.5 mi');assert.equal(f.metrics().eta,'9 min');
  await f.emit(point(2000,500));assert.equal(f.metrics().distance,'1.6 mi');assert.equal(f.metrics().eta,'5 min');
  await f.emit(point(1000,1000));assert.equal(f.metrics().distance,'0.6 mi');assert.equal(f.metrics().eta,'1 min');
  for(let i=0;i<10;i++){await f.tick(3000);await f.emit(point(1000,1000),{speed:0})}assert.equal(f.metrics().distance,'0.6 mi');assert.equal(f.metrics().eta,'1 min');
  const request=f.requests.find(r=>r.url);assert.equal(request.headers['x-nwtb-sales'],'1');assert.equal(request.headers['x-nwtb-session'],'fixture-sales-session');
  assert.equal(f.local.get('nwtb_delivery_token'),'fixture-office-session');assert.ok(f.private.map.getContainer().isConnected);f.stop();assert.equal(f.watches.size,0);
 }
 const f=fixture({emptySteps:true});await f.start();await f.emit(point(1000,0));assert.equal(f.metrics().distance,'2.5 mi');assert.equal(f.metrics().eta,'8 min');f.stop();
});

test('GPS loss pauses figures, rejects inaccurate/stale fixes and recovers on visibility change',async()=>{
 const f=fixture();await f.start();await f.emit(point(1000,0));const old=[...f.watches.values()][0].success;
 f.holdGps();await f.tick(30000);assert.equal(f.metrics().distance,'—');assert.match(f.metrics().banner,/GPS LOST/);
 await f.releaseGps(point(2000,500));assert.equal(f.metrics().eta,'5 min');assert.equal(f.metrics().distance,'1.6 mi');
 old(f.position(D));await settle();assert.equal(f.metrics().distance,'1.6 mi');
 await f.emit(D,{timestamp:f.ctx.Date.now()-90000});assert.equal(f.metrics().distance,'1.6 mi');await f.emit(D,{accuracy:1500});assert.equal(f.metrics().distance,'—');
 await f.emit(point(1000,1000));assert.equal(f.metrics().distance,'0.6 mi');
 await f.tick(1001);f.permission(true);f.visibility('hidden');f.visibility('visible');await settle();assert.match(f.metrics().banner,/LOCATION BLOCKED/);
 f.permission(false);await f.tick(16000);await f.emit(point(500,1000));f.visibility('hidden');f.visibility('visible');await settle();assert.equal(f.metrics().distance,'0.3 mi');
 assert.ok(f.gpsRequests.every(o=>o.maximumAge===0));f.stop();const count=f.gpsRequests.length;f.visibility('hidden');f.visibility('visible');await f.tick(40000);assert.equal(f.gpsRequests.length,count);
});

test('Turn advance and NOW cues do not repeat during GPS jitter, reroutes or traffic refresh',async()=>{
 const f=fixture();await f.start();f.spoken.length=0;
 const step={instruction_text:'Turn right onto Sample Road',maneuver:{type:'turn',modifier:'right',location:[B.lon,B.lat]}};
 const route={...clone(itinerary),steps:[step]};
 f.private.applyRoute(route,point(1850,0),true);await f.emit(point(1850,0));
 assert.deepEqual(f.spoken,['Turn right onto Sample Road']);
 for(const x of [1851,1852,1851,1860])await f.emit(point(x,0));assert.equal(f.spoken.length,1);
 f.private.applyRoute({...route,traffic_aware:true},point(1850,0),true);assert.equal(f.spoken.length,1);
 await f.emit(point(1962,0));assert.equal(f.spoken.at(-1),'Now, Turn right onto Sample Road');
 for(const x of [1952,1960,1945,1961])await f.emit(point(x,0));assert.equal(f.spoken.length,2);
 f.window.nwtbSalesRepeat();assert.equal(f.spoken.length,3);await f.emit(point(1961,0));assert.equal(f.spoken.length,3);f.stop();
 const silent=fixture({speech:false});await silent.start();assert.ok(silent.document.getElementById('nwtbTurn').textContent);assert.equal(silent.spoken.length,0);silent.stop();
});

test('Arrival announces once, requires a visit tap, advances immediately and returns to NWTB',async()=>{
 const f=fixture();await f.start();const map=f.private.map,container=map.getContainer();
 await f.emit(D,{speed:0});for(let i=0;i<20;i++)await f.emit(D,{speed:0});
 assert.equal(f.metrics().distance,'0 ft');assert.equal(f.spoken.filter(t=>t.includes('You have arrived')).length,1);assert.ok(f.document.getElementById('nwtbArrival').classList.contains('show'));
 assert.equal(f.private.target.stop_id,'1');await Promise.all([f.window.nwtbSalesCompleteStop(),f.window.nwtbSalesCompleteStop()]);await settle();assert.equal(f.private.target.stop_id,'2');
 assert.equal(f.private.map,map);assert.ok(container.isConnected);assert.equal(f.requests.filter(r=>r.url).length,2);
 await f.window.nwtbSalesCompleteStop();await settle();assert.equal(f.private.target.final,true);assert.equal(f.private.target.name,'Northwest Trucks - Bolingbrook');assert.equal(f.requests.filter(r=>r.url).length,3);
 await f.emit(A,{speed:0});for(let i=0;i<5;i++)await f.emit(A,{speed:0});assert.equal(f.spoken.filter(t=>t.includes('returned to Northwest Trucks')).length,1);
 await f.window.nwtbSalesCompleteStop();assert.equal(f.private.target,null);assert.equal(f.watches.size,0);assert.ok(f.requests.every(r=>!r.action||r.action==='validate_route'));
});

test('HOLD, approval revocation, validation outage and changed routes cannot launch or continue navigation',async()=>{
 for(const scenario of ['hold','outage']){const f=fixture();if(scenario==='hold')f.records[0].finalRouteApproved=false;else f.failValidation(true);await f.start();assert.equal(f.requests.filter(r=>r.url).length,0);assert.equal(f.watches.size,0);assert.equal(f.ctx.currentRoute.length,0);}
 const f=fixture();await f.start();f.records[1].finalRouteApproved=false;await f.window.nwtbSalesCompleteStop();await settle();assert.equal(f.private.target,null);assert.equal(f.watches.size,0);assert.equal(f.requests.filter(r=>r.url).length,1);
 const changed=fixture();await changed.start();changed.ctx.currentRoute.reverse();await changed.tick(26000);await changed.emit(point(3000,0));assert.equal(changed.private.target,null);assert.match(changed.warnings.at(-1),/route changed/);
});

test('Traffic availability updates its label and duration without duplicate speech or stale request overwrite',async()=>{
 const f=fixture();await f.start();assert.ok(!f.document.getElementById('nwtbNavMode').textContent.includes('LIVE'));
 f.overrideRoute({...clone(itinerary),duration_s:1200,traffic_aware:true,source:'NWTB_FLEET_TRAFFIC'});
 // Seed a recent GPS fix when the scheduled traffic refresh becomes due.
 await f.tick(91000);await f.emit(point(2000,500));assert.match(f.document.getElementById('nwtbNavMode').textContent,/LIVE FLEET TRAFFIC/);assert.equal(f.metrics().eta,'10 min');
 f.overrideRoute({...clone(itinerary),traffic_aware:false});await f.tick(91000);await f.emit(point(2000,500));assert.ok(!f.document.getElementById('nwtbNavMode').textContent.includes('LIVE'));f.stop();
});

test('Late GPS, safety and route responses cannot revive ended navigation or overwrite the next stop',async()=>{
 const f=fixture();const gate=f.holdRoute();await f.start();assert.equal(f.requests.filter(r=>r.url).length,1);await f.window.nwtbSalesCompleteStop();await settle();assert.equal(f.private.target.stop_id,'2');gate.release();await settle();assert.equal(f.private.coords.at(-1)[0],E.lon);
 const validation=f.holdValidation();await f.tick(26000);const request=f.private.reroute(A);await settle();f.stop();validation.release();await request;assert.equal(f.private.target,null);assert.equal(f.watches.size,0);
 const waiting=fixture();waiting.holdGps();await waiting.start();waiting.stop();await waiting.releaseGps();assert.equal(waiting.requests.filter(r=>r.url).length,0);assert.equal(waiting.watches.size,0);
});

test('Leaving the road requests a new route from current GPS and keeps the same approved destination',async()=>{
 const f=fixture();await f.start();const off=point(3000,3000);
 f.overrideRoute({geometry:[[off.lon,off.lat],[D.lon,D.lat]],steps:[],distance_m:2200,duration_s:300,traffic_aware:false});
 await f.tick(26000);await f.emit(off);
 const calls=f.requests.filter(r=>r.url);assert.equal(calls.length,2);assert.equal(calls[1].body.origin.lat,off.lat);assert.equal(calls[1].body.destination.lat,D.lat);
 assert.equal(f.private.coords[0][0],off.lon);assert.equal(f.metrics().eta,'5 min');assert.equal(f.metrics().distance,'1.4 mi');f.stop();
});

test('Fresh canonical coordinates are used; sign-out ends GPS without touching Delivery',async()=>{
 const f=fixture();f.records[0].lat+=0.001;await f.start();assert.equal(f.requests.find(r=>r.url).body.destination.lat,f.records[0].lat);
 const event=new f.document.defaultView.Event('click',{bubbles:true});f.document.getElementById('nwtbSalesLogoutBtn').dispatchEvent(event);assert.equal(f.private.target,null);assert.equal(f.watches.size,0);assert.equal(f.local.get('nwtb_delivery_token'),'fixture-office-session');
});

test('List Mode starts no GPS until a stop is selected and navigates directly to any entry',async()=>{
 const f=fixture();await f.window.nwtbSalesOpenListMode();await settle();
 assert.ok(f.document.getElementById('nwtbSalesList').classList.contains('show'));assert.equal(f.document.querySelectorAll('.salesListEntry').length,2);
 assert.equal(f.gpsRequests.length,0);assert.equal(f.requests.filter(r=>r.url).length,0);
 await f.window.nwtbSalesNavigateToStop('2');await settle();assert.equal(f.private.target.stop_id,'2');
 assert.equal(f.requests.find(r=>r.url).body.destination.lon,E.lon);assert.equal(f.requests.filter(r=>r.url).length,1);
 assert.ok(!f.document.getElementById('nwtbSalesList').classList.contains('show'));assert.match(f.document.getElementById('nwtbNavDestination').textContent,/SELECTED STOP/);
 assert.equal(f.document.querySelector('.salesNext').textContent,'VISIT COMPLETE / BACK TO LIST');
 await f.emit(E,{speed:0});await f.window.nwtbSalesCompleteStop();await settle();
 assert.equal(f.private.target,null);assert.equal(f.watches.size,0);assert.ok(f.document.getElementById('nwtbSalesList').classList.contains('show'));
 assert.equal(f.document.querySelectorAll('.salesListVisited').length,1);assert.match(f.document.getElementById('nwtbSalesListSummary').textContent,/1 visited this session/);
 assert.equal(f.requests.filter(r=>r.url).length,1,'Completing a List Mode visit does not automatically navigate to another stop');
 await f.window.nwtbSalesNavigateToStop('1');await settle();assert.equal(f.private.target.stop_id,'1');assert.equal(f.ctx.currentRoute.length,2);f.stop();
});

test('List Mode rechecks HOLD changes on selection, can return to NWTB and cancels pending list checks',async()=>{
 const f=fixture();await f.window.nwtbSalesOpenListMode();f.records[1].finalRouteApproved=false;await f.window.nwtbSalesNavigateToStop('2');await settle();assert.equal(f.private.target,null);assert.equal(f.gpsRequests.length,0);assert.equal(f.requests.filter(r=>r.url).length,0);
 const back=fixture();await back.window.nwtbSalesOpenListMode();await back.window.nwtbSalesNavigateToStop(null,true);await settle();assert.equal(back.private.target.final,true);assert.equal(back.private.target.name,'Northwest Trucks - Bolingbrook');back.stop();
 const pending=fixture(),gate=pending.holdValidation();const opening=pending.window.nwtbSalesOpenListMode();await settle();pending.stop();gate.release();await opening;assert.ok(!pending.document.getElementById('nwtbSalesList').classList.contains('show'));assert.equal(pending.gpsRequests.length,0);
});
