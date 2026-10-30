'use strict';
// Actual Driver page/modules + Leaflet 1.9.4 in an isolated DOM. No production requests or sessions.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
const PNG='data:image/png;base64,fixture';let checks=0;
function ok(value,message){assert.ok(value,message);checks++}
function eq(a,b,message){assert.deepEqual(a,b,message);checks++}
const settle=async()=>{for(let i=0;i<35;i++)await Promise.resolve()};
function fixture({ios=false,android=false,standard=false,original=false,navigationSource=null}={}){
 const html=read(standard?'driver-standard.html':'driver-live.html'),{window:dom}=parseHTML(html),document=dom.document;
 const timers=new Map(),watches=new Map(),cleared=[],requests=[],alerts=[],resizeObservers=[];
 let now=1800000000000,timerId=0,watchId=0,fixes=0,holdFix=false,fixCallbacks=[],holdNavigation=null,podFailure=false;
 const setTimer=(fn,ms,interval=false)=>{const id=++timerId;timers.set(id,{fn,at:now+Math.max(1,Number(ms)||1),ms:Math.max(1,Number(ms)||1),interval});return id};
 const setTimeout=(fn,ms)=>setTimer(fn,ms),setInterval=(fn,ms)=>setTimer(fn,ms,true),clearTimeout=id=>timers.delete(id);
 async function tick(ms){const until=now+ms;let count=0;await settle();while(true){let next=null;for(const [id,t]of timers)if(t.at<=until&&(!next||t.at<next[1].at))next=[id,t];if(!next)break;if(++count>3000)throw Error('Fixture timer loop');const [id,t]=next;now=t.at;if(t.interval)t.at+=t.ms;else timers.delete(id);await t.fn();await settle()}now=until;await settle()}
 class Clock extends Date{static now(){return now}}
 Object.defineProperties(dom.HTMLElement.prototype,{clientWidth:{configurable:true,get:()=>400},clientHeight:{configurable:true,get:()=>360},offsetWidth:{configurable:true,get:()=>400},offsetHeight:{configurable:true,get:()=>360}});
 dom.HTMLElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:400,height:360,right:400,bottom:360});
 Object.defineProperty(dom.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.getAttribute('value')||''},set(v){for(const option of this.querySelectorAll('option')){if(option.getAttribute('value')===v)option.setAttribute('selected','');else option.removeAttribute('selected')}}});
 dom.HTMLElement.prototype.scrollIntoView=function(){};dom.HTMLElement.prototype.focus=function(){};
 dom.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}});
 dom.HTMLCanvasElement.prototype.toDataURL=()=>PNG;
 const createNS=document.createElementNS.bind(document);document.createElementNS=(ns,tag)=>{const el=createNS(ns,tag);if(tag==='svg')el.createSVGRect=()=>({});return el};
 const currentPosition=()=>({timestamp:now,coords:{latitude:41.69,longitude:-88.06,accuracy:3,speed:4,heading:90}});
 const navigator={userAgent:ios?'iPhone Safari':android?'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/141.0.0.0 Mobile Safari/537.36':'Fixture browser',platform:ios?'iPhone':'Linux',maxTouchPoints:ios||android?5:0,onLine:true,geolocation:{getCurrentPosition(fn){fixes++;if(holdFix)fixCallbacks.push(fn);else fn(currentPosition())},watchPosition(fn){const id=watchId++;watches.set(id,fn);return id},clearWatch(id){cleared.push(id);watches.delete(id)}}};
 class ResizeObserver{constructor(fn){this.fn=fn;resizeObservers.push(this)}observe(el){this.el=el}disconnect(){this.disconnected=true}}
 const local=new Map([['nwtb_driver_token','fixture-driver-token'],['nwtb_delivery_driver','1234'],['nwtb_delivery_token','fixture-office-token']]);
 const localStorage={getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)};
 const window={document,navigator,localStorage,HTMLElement:dom.HTMLElement,MutationObserver:dom.MutationObserver,ResizeObserver,addEventListener:document.addEventListener.bind(document),removeEventListener:document.removeEventListener.bind(document),dispatchEvent:document.dispatchEvent.bind(document),screen:{deviceXDPI:1,logicalXDPI:1},requestAnimationFrame:fn=>setTimeout(fn,16),cancelAnimationFrame:clearTimeout,matchMedia:()=>({matches:true}),getComputedStyle:el=>({getPropertyValue:k=>el.style[k]||'',position:'relative',width:'400px',height:'360px'})};
 dom.getComputedStyle=window.getComputedStyle;
 const data={route:{id:'fixture-r1',status:'ACTIVE',depot:'BOLINGBROOK',route_mode:'MULTI_DRIVER_OPTIMIZED',route_date:'2026-10-20',released_to_driver:true},stops:[{id:'fixture-s1',order_id:'o1',stop_sequence:1,status:'PENDING',delivery_orders:{customer_name:'Fixture pickup',address:'Fixture address 1',lat:41.70,lon:-88.04,stop_type:'VENDOR_PICKUP'}},{id:'fixture-s2',order_id:'o2',stop_sequence:2,status:'PENDING',delivery_orders:{customer_name:'Fixture delivery',address:'Fixture address 2',lat:41.72,lon:-88.02,stop_type:'DELIVERY'}}]};
 const clone=x=>JSON.parse(JSON.stringify(x));
 const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
 const fetch=async(url,init)=>{const body=JSON.parse(init?.body||'{}');requests.push({url,body});
  if(String(url).endsWith('/nwtb-driver-navigation')){const result={geometry:[[body.origin.lon,body.origin.lat],[body.destination.lon,body.destination.lat]],steps:[{name:'Fixture road',maneuver:{type:'depart',location:[body.origin.lon,body.origin.lat]}},{name:'Destination',maneuver:{type:'arrive',location:[body.destination.lon,body.destination.lat]}}],distance_m:1000,duration_s:100,traffic_aware:true,source:'fixture'};if(holdNavigation){const hold=holdNavigation;holdNavigation=null;return hold(result)}return response(result)}
  if(body.action==='route_get')return response({route:{...clone(data.route),id:body.route_id},stops:clone(data.stops)});
  if(body.action==='driver_routes')return response({routes:[clone(data.route)]});
  if(body.action==='driver_route_state')return response({route:clone(data.route)});
  if(body.action==='route_changes')return response({events:[]});
  if(body.action==='route_start_driver'){data.route.status='ACTIVE';return response({ok:true})}
  if(body.action==='submit'&&/nwtb-pod|nwtb-delivery-exceptions/.test(url)){if(podFailure)return response({error:'Fixture save failure'},503);data.stops.find(s=>s.id===body.stop_id).status=String(url).endsWith('/nwtb-pod')?'DELIVERED':'NOT_DELIVERED';if(data.stops.every(s=>s.status!=='PENDING'))data.route.status='COMPLETED';return response({ok:true,pod:{pod_number:1},exception:{exception_number:1}})}
  if(body.action==='stop_status_driver'){data.stops.find(s=>s.id===body.stop_id).status=body.status;return response({ok:true})}
  throw Error('Unexpected fixture request: '+url+' '+body.action)
 };
 window.fetch=fetch;
 window.self=window;window.top=window;
 const ctx=vm.createContext({CustomEvent:dom.CustomEvent,Element:dom.Element,HTMLElement:dom.HTMLElement,window,document,navigator,localStorage,fetch,console,Date:Clock,URL,Headers,Request,Response,AbortController,Promise,Map,Set,setTimeout,clearTimeout,setInterval,clearInterval:clearTimeout,MutationObserver:dom.MutationObserver,ResizeObserver,requestAnimationFrame:window.requestAnimationFrame,location:{pathname:'/nwtb-route-creator/driver-live.html',href:'https://billyjwiorek-tech.github.io/nwtb-route-creator/driver-live.html'},alert:x=>alerts.push(x),confirm:()=>true,prompt:()=>''});
 Object.defineProperty(ctx,'fetch',{get:()=>window.fetch,set:value=>window.fetch=value,configurable:true});
 vm.runInContext(fs.readFileSync(require.resolve('leaflet/dist/leaflet-src.js'),'utf8'),ctx);ctx.L=window.L;
 const inline=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(s=>s.includes('async function openRoute'));
 vm.runInContext(inline.replace(/\bboot\(\);\s*$/, ''),ctx);
 for(const name of ['openRoute','loadRoutes','finish','startRoute','enableAlerts'])Object.defineProperty(window,name,{get:()=>ctx[name],set:value=>ctx[name]=value,configurable:true});
 vm.runInContext("token='fixture-driver-token';driver='1234';route='fixture-r1';currentRouteState={status:'ACTIVE'};",ctx);
 let source=navigationSource||(original?require('node:child_process').execFileSync('git',['show','aa8c608d3b1af922958621aba35256a4206cb0ae:driver-navigation-native.js'],{cwd:root,encoding:'utf8'}):read('driver-navigation-native.js'));
 const last=source.lastIndexOf('})();');source=source.slice(0,last)+"window.__navTest={beginNavigation,navigateNext,initMap,decorateRoute,reroute,feet,...(typeof buildProgress==='function'?{buildProgress,projectRoute,remainingProgress,applyRoute,receiveNavFix}:{}),get map(){return navMap},get target(){return navTarget},get coords(){return navRouteCoords}};"+source.slice(last);
 if(!standard)vm.runInContext(source,ctx);
 function load(name){vm.runInContext(read(name),ctx,{filename:name})}
 return {window,document,ctx,data,requests,alerts,tick,load,cleared,watches,resizeObservers,local,private:window.__navTest,fixes:()=>fixes,holdFix:()=>holdFix=true,releaseFix(){holdFix=false;for(const cb of fixCallbacks.splice(0))cb(currentPosition())},holdNextNav(fn){holdNavigation=fn},failSave:v=>podFailure=v,response,async open(){await window.openRoute(data.route.id);await tick(150)},async begin(){await window.__navTest.navigateNext(data.route.id);await settle();await tick(100)}};
}
async function proveOriginal(){const f=fixture({original:true});await f.tick(110);await f.open();await f.begin();const map=f.private.map;ok(map.getContainer().isConnected,'Original initially displays a real Leaflet map');await f.window.openRoute(f.data.route.id);eq(map.getContainer().isConnected,false,'Original refresh detaches the live map while retaining its object');console.log('CONFIRMED original defect: route refresh detaches the Leaflet map container.');}
async function lifecycle(){
 const f=fixture();f.load('driver-mobile-nav-fix.js');f.load('driver-route-pins-native.js');await f.tick(150);await f.open();
 eq(f.fixes(),0,'Opening an ACTIVE route alone does not request navigation GPS');ok(f.document.querySelector('.nwtbFullRouteBtn').textContent.includes('CONTINUE'),'Active routes can resume directions without starting again');
 await f.begin();const map=f.private.map,container=map.getContainer();
 ok(container.isConnected,'Map attached');ok(container.closest('#nwtbNavigationHost'),'Map owned by persistent host');ok(container.querySelectorAll('.leaflet-tile').length>0,'Real Leaflet creates street tile elements');ok(container.querySelectorAll('svg path').length>0,'Real Leaflet draws route geometry');ok(container.querySelector('.leaflet-control-zoom'),'Map controls rendered');
 await f.window.openRoute(f.data.route.id);await f.tick(250);eq(f.private.map,map,'Route refresh preserves map object');eq(map.getContainer(),container,'Route refresh preserves exact container');ok(container.isConnected,'Refreshed map remains attached');
 f.data.stops[0].status='DELIVERED';await f.window.nwtbAfterStopSaved('fixture-s1');await f.tick(250);eq(f.private.target.stop_id,'fixture-s2','Saved stop moves directions to next assigned stop');eq(f.private.map,map,'Next stop reuses attached map');ok(container.isConnected);eq(f.requests.filter(r=>r.url.endsWith('/nwtb-driver-navigation')).length,2,'Immediate next-stop directions are not blocked by prior reroute throttle');
 f.data.stops[1].status='DELIVERED';f.data.route.status='COMPLETED';await f.window.nwtbAfterStopSaved('fixture-s2');await f.tick(250);eq(f.private.target.name,'Northwest Trucks - Bolingbrook','Last stop routes to saved return depot');eq(f.private.map,map);ok(container.isConnected,'Return navigation remains visible');
 eq(f.requests.filter(r=>r.body.action==='route_start_driver').length,0,'Refresh/completion/return never starts a route');eq(f.local.get('nwtb_delivery_token'),'fixture-office-token','Office session untouched');
 await f.window.loadRoutes();eq(f.private.target,null,'Route-list navigation ends old directions');eq(f.document.getElementById('nwtbNavPanel').classList.contains('show'),false);ok(f.cleared.includes(0),'Navigation watch id zero cleared');
 f.data.route.status='ACTIVE';await f.open();await f.document.querySelector('.nwtbFullRouteBtn').onclick();await f.tick(150);eq(f.requests.filter(r=>r.body.action==='route_start_driver').length,0,'CONTINUE never invokes START');
 f.data.route.status='PLANNED';f.data.route.id='fixture-r2';const before=f.fixes();await f.open();eq(f.fixes(),before,'Opening a new planned route does not request GPS');eq(f.private.target,null,'Switching routes clears old target');ok(f.document.querySelector('.nwtbFullRouteBtn').textContent.includes('START ROUTE'),'Planned route still requires explicit start');
 await assert.rejects(()=>f.private.navigateNext('fixture-r2'),/Start or resume/);checks++;eq(f.fixes(),before,'Planned route cannot navigate before start');
 // Recover if a container is replaced by a future renderer or restored browser view.
 const replacement=f.document.createElement('div');replacement.id='nwtbNavMap';container.replaceWith(replacement);f.private.initMap(41.7,-88.0);eq(f.private.map.getContainer(),replacement,'New container gets its own real Leaflet map');ok(f.private.map!==map);eq(f.window.__nwtbNavMapInstance,f.private.map,'Pins and resize helpers receive current map');ok(f.resizeObservers.some(o=>o.el===replacement),'Resize observer follows replacement');
 f.window.nwtbStopNavigation();
}
async function asyncGuards(){
 const f=fixture();await f.tick(110);await f.open();f.holdFix();await f.private.beginNavigation({lat:41.7,lon:-88.04,name:'Old target'},f.data.route.id);f.window.nwtbStopNavigation();f.releaseFix();await f.tick(100);eq(f.private.map,null,'Late GPS callback cannot restart ended navigation');eq(f.watches.size,0);
 let release;f.holdNextNav(result=>new Promise(resolve=>release=()=>resolve(f.response(result))));await f.private.beginNavigation({lat:41.7,lon:-88.04,name:'Old target'},f.data.route.id);await settle();ok(release,'Old route response is pending');
 f.window.nwtbStopNavigation();await f.private.beginNavigation({lat:41.72,lon:-88.02,name:'New target'},f.data.route.id);await settle();release();await f.tick(100);eq(f.private.target.name,'New target');eq(Number(f.private.coords.at(-1)[0]),-88.02,'Late previous response cannot replace new route line');f.window.nwtbStopNavigation();
}
async function iosLifecycle(){
 const f=fixture({ios:true});f.load('driver-mobile-nav-fix.js');f.load('driver-ios-map-fallback.js');await f.tick(150);await f.open();await f.begin();await f.tick(150);
 const box=f.document.getElementById('nwtbIosStableMap');ok(box?.isConnected,'iPhone map fallback is attached');const watched=[...f.watches.values()];for(const fn of watched)fn({coords:{latitude:41.69,longitude:-88.06,speed:4,heading:90,accuracy:3}});await f.tick(50);ok(box.querySelectorAll('img').length>0,'iPhone fallback draws street tiles');ok(box.querySelector('svg polyline'),'iPhone fallback draws route overlay');
 await f.window.openRoute(f.data.route.id);await f.tick(200);eq(f.document.getElementById('nwtbIosStableMap'),box);ok(box.isConnected,'iPhone overlay survives delivery-view refresh');f.window.nwtbStopNavigation();await f.tick(50);eq(f.watches.size,0,'Ending navigation clears main and fallback GPS watches');
}
async function completion(){
 const f=fixture();f.load('driver-pod-live.js');f.load('driver-exceptions-live.js');await f.tick(600);await f.open();await f.begin();const map=f.private.map;
 await f.window.nwtbCompleteNext();eq(f.data.stops[0].status,'PENDING','Arrival COMPLETE waits for POD');eq(f.private.target.stop_id,'fixture-s1','No next-stop navigation before save');ok(f.document.getElementById('nwtbPodOverlay').classList.contains('show'),'Arrival uses current POD wrapper');
 await f.document.getElementById('podSubmit').onclick();eq(f.requests.filter(r=>r.body.action==='submit').length,0,'Missing recipient blocks submission');
 f.document.getElementById('podRecipient').value='Fixture receiver';await f.document.getElementById('podSubmit').onclick();eq(f.requests.filter(r=>r.body.action==='submit').length,0,'Missing proof blocks submission');
 function sign(){const c=f.document.getElementById('podSignature');for(const [type,x,y]of [['pointerdown',5,5],['pointermove',20,15],['pointerup',20,15]]){const e=new f.document.defaultView.Event(type);Object.assign(e,{clientX:x,clientY:y,pointerId:1});c.dispatchEvent(e)}}sign();
 f.failSave(true);await f.document.getElementById('podSubmit').onclick();eq(f.data.stops[0].status,'PENDING');eq(f.private.target.stop_id,'fixture-s1','Failed save retains current navigation');eq(f.document.getElementById('podSubmit').disabled,false,'Failed proof can retry');
 f.failSave(false);await f.document.getElementById('podSubmit').onclick();eq(f.private.target.stop_id,'fixture-s1','Acknowledgement finishes before view transitions');await f.tick(1000);eq(f.private.target.stop_id,'fixture-s2','Saved proof advances to next stop');eq(f.private.map,map);ok(map.getContainer().isConnected,'Map remains attached after actual POD handoff');
 await f.window.nwtbCompleteNext();eq(f.document.getElementById('podSubmit').disabled,false,'Second stop resets submit control');eq(f.document.getElementById('podRecipient').value,'','Previous recipient cleared');f.document.getElementById('podRecipient').value='Second fixture receiver';await f.document.getElementById('podSubmit').onclick();ok(f.document.getElementById('podMsg').textContent.includes('signature or delivery photo'),'Previous signature cleared');f.document.getElementById('podCancel').onclick();eq(f.data.stops[1].status,'PENDING','Cancel does not complete delivery');
 await f.window.nwtbNotCompleted();ok(f.document.getElementById('nwtbExceptionOverlay').classList.contains('show'),'Arrival exception uses current exception wrapper');f.document.getElementById('exReason').value='CUSTOMER_CLOSED';await f.document.getElementById('exSubmit').onclick();await f.tick(1000);eq(f.private.target.name,'Northwest Trucks - Bolingbrook','Saved exception preserves return map');eq(f.private.map,map);ok(map.getContainer().isConnected);eq(f.requests.filter(r=>r.body.action==='stop_status_driver').length,0,'Arrival completion cannot bypass POD/exception endpoints');f.window.nwtbStopNavigation();
}
function wiring(){for(const name of ['driver-live.html','driver-standard.html']){const html=read(name);for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1],{filename:name});ok(html.includes('driver-pod-live.js?v=20261030-integrity1'),'Both editions get completion refresh');}for(const name of ['driver-navigation-native.js','driver-mobile-nav-fix.js','driver-route-pins-native.js','driver-ios-map-fallback.js','driver-pod-live.js','driver-exceptions-live.js','nwtb-driver-sw.js'])new vm.Script(read(name),{filename:name});for(const file of ['delivery-live.html','delivery-standard.html']){ok(read(file).includes('office-driver-preview.html?v=20261029-trafficnav1'),'Office shell uses its dedicated route preview');ok(!/src="driver-(?:live|standard)\.html/.test(read(file)),'Office cannot load an authenticated Driver app in an iframe');}ok(!read('driver-standard.html').includes('driver-navigation-native.js'),'Standard retains its existing no-background-GPS edition');}
module.exports={fixture,settle};
if(require.main===module)(async()=>{if(process.argv.includes('--prove-original')){await proveOriginal();return}wiring();await lifecycle();await asyncGuards();await iosLifecycle();await completion();console.log('PASS: '+checks+' Driver map/lifecycle checks using real Leaflet; refresh, next stop, return depot, iPhone overlay, active continuation, cancellation, async races, signed POD, exceptions and session isolation. Fixtures only.');})().catch(e=>{console.error(e);process.exitCode=1});
