'use strict';
// Mobile capability fixtures run the production sources, without production logins, GPS or deliveries.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{parseHTML}=require('linkedom');
const {fixture:mapFixture,settle}=require('./driver-map-lifecycle.test.cjs');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),baseline='28f753efd12787eb852b37d543550090cbce5074';
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++},eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++},plain=v=>JSON.parse(JSON.stringify(v));
function noticeSurface({file='driver-live.html',permission='granted',android=true,serviceWorker=true,registerFailure=false,embedded=false,source=null}={}){
 const html=source||read(file),{document,window:dom}=parseHTML(html),storage=new Map([['nwtb_driver_token','fixture-driver'],['nwtb_delivery_driver','1234'],['nwtb_delivery_token','fixture-office']]);
 Object.defineProperties(document,{readyState:{value:'complete'},hidden:{value:false,writable:true},visibilityState:{value:'visible',writable:true}});
 dom.HTMLElement.prototype.focus=function(){};dom.HTMLElement.prototype.scrollIntoView=function(){};
 const calls=[],notices=[],timers=[],events=new Map();let permissionRequests=0,nativeAttempts=0,registered=0,registrationExists=true,registrationGate=null,failAuth=false;
 const data={route:{id:'fixture-route',status:'PLANNED',released_to_driver:true,depot:'BOLINGBROOK',route_date:'2026-10-21'},stops:[{id:'fixture-stop',order_id:'fixture-order',stop_sequence:1,status:'PENDING',delivery_orders:{customer_name:'Fixture customer',address:'Fixture business address',stop_type:'DELIVERY',lat:41.7,lon:-88.04}}]};
 class Notice{static permission=permission;static async requestPermission(){permissionRequests++;Notice.permission='granted';return 'granted'}constructor(title,options){nativeAttempts++;if(android)throw TypeError('Illegal constructor. Use ServiceWorkerRegistration.showNotification().');notices.push({title,options,native:true})}}
 const registration={active:{},showNotification:async(title,options)=>notices.push({title,options}),getNotifications:async({tag})=>notices.filter(n=>n.options.tag===tag).map(n=>({close(){n.closed=true}}))};
 const sw={ready:Promise.resolve(registration),getRegistration:async()=>{if(registrationGate)await registrationGate;return registrationExists?registration:null},register:async()=>{registered++;if(registerFailure)throw Error('Worker blocked');return registration},addEventListener:(name,fn)=>events.set(name,fn)};
 const navigator={userAgent:android?'Mozilla/5.0 (Linux; Android 15) Chrome/141.0 Mobile Safari/537.36':'Desktop fixture',maxTouchPoints:android?5:0,platform:'Linux',onLine:true,vibrate(){},...(serviceWorker?{serviceWorker:sw}:{})};
 const window={document,navigator,Notification:Notice,addEventListener:document.addEventListener.bind(document),removeEventListener:document.removeEventListener.bind(document),focus(){},frameElement:embedded?{}:null};window.self=window;window.top=embedded?{}:window;
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 const schedule=(fn,ms)=>{timers.push({fn,ms});return timers.length};
 const fetch=async(url,init)=>{const body=JSON.parse(init.body),headers=init.headers;calls.push({url,body,headers});let status=200,result={ok:true};
  if(body.action==='whoami')result=failAuth?{error:'Session expired'}:{employee_number:'1234',display_name:'Fixture driver'};
  if(body.action==='whoami'&&failAuth)status=401;
  if(body.action==='delivery_driver_login')result={token:'fixture-new-driver',employee_number:body.employee_number,display_name:'Fixture driver'};
  if(body.action==='driver_routes')result={routes:[plain(data.route)]};
  if(body.action==='route_get')result=plain(data);
  if(body.action==='driver_route_state')result={route:plain(data.route)};
  if(body.action==='route_changes'||body.action==='office_route_alerts')result={events:[],last_id:0};
  if(body.action==='route_priority_changes')result={events:[{id:12,created_at:new Date().toISOString(),note:'Fixture changed stop order'}]};
  if(body.action==='route_start_driver')data.route.status='ACTIVE';
  if(body.action==='route_pause_driver')data.route.paused=true;
  if(body.action==='route_resume_driver')data.route.paused=false;
  return new Response(JSON.stringify(result),{status,headers:{'content-type':'application/json'}});
 };
 const location={pathname:'/nwtb-route-creator/'+file,href:'https://billyjwiorek-tech.github.io/nwtb-route-creator/'+file,hash:''};
 const context=vm.createContext({window,document,navigator,Notification:Notice,localStorage,location,fetch,console,Date,URL,Promise,Map,Set,Response,setTimeout:schedule,setInterval:schedule,clearTimeout(){},clearInterval(){},confirm:()=>true,prompt:()=>'',alert(){}});
 vm.runInContext(read('nwtb-notifications.js'),context);
 function load(file){vm.runInContext(read(file),context,{filename:file})}
 function inline(){const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('async function driverLogin'));vm.runInContext(script.replace(/\bboot\(\);\s*$/,''),context,{filename:file});for(const name of ['enableAlerts','openRoute','loadRoutes','finish'])Object.defineProperty(window,name,{configurable:true,get:()=>context[name],set:v=>context[name]=v})}
 return {document,window,navigator,context,storage,calls,notices,timers,events,data,load,inline,Notice,registration,location,get permissionRequests(){return permissionRequests},get nativeAttempts(){return nativeAttempts},get registered(){return registered},noRegistration(){registrationExists=false},deferRegistration(p){registrationGate=p},failAuth(v){failAuth=v}};
}
async function notifications(){
 for(const file of ['driver-live.html','driver-standard.html']){
  const f=noticeSurface({file});f.inline();vm.runInContext("route='fixture-route';driver='1234';token='fixture-driver';",f.context);
  for(const event_type of ['STOP_ADDED_ACTIVE','STOP_REMOVED_ACTIVE']){f.context.showRouteAlert({event_type,note:'Fixture route change'});await settle()}
  eq(f.notices.length,2,file+' uses Android service-worker notifications for add/remove alerts');eq(f.nativeAttempts,0,'Android does not reach the rejected Notification constructor');
  ok(f.document.getElementById('routeAlert').textContent.includes('STOP REMOVED'),'In-app route banner remains available');
  f.load('driver-priority-route-live.js');await f.timers.find(t=>t.ms===1800).fn();await settle();eq(f.notices.at(-1).title,'NWTB — ROUTE UPDATED','Reoptimization alert uses the same Android-safe path');
  eq(f.storage.get('nwtb_delivery_token'),'fixture-office','Mobile notifications preserve Office session');ok(f.calls.every(c=>!['route_start_driver','stop_status_driver'].includes(c.body.action)),'Receiving an alert does not start or complete a route');
 }
 for(const permission of ['denied','default']){const f=noticeSurface({permission});eq(await f.window.NWTBNotifications.show('Fixture alert'),false,'Blocked/unrequested notification permission fails safely');eq(f.permissionRequests,0,'Showing a route alert never asks for permission');eq(f.registered,0,'No worker registration without granted permission')}
 const absent=noticeSurface();delete absent.window.Notification;eq(await absent.window.NWTBNotifications.show('Fixture alert'),false,'Missing Notification API is safe');
 const fresh=noticeSurface();fresh.noRegistration();ok(await fresh.window.NWTBNotifications.show('Fixture alert'),'First permitted alert registers existing NWTB worker');eq(fresh.registered,1);eq(fresh.nativeAttempts,0);
 const failure=noticeSurface({registerFailure:true});failure.noRegistration();eq(await failure.window.NWTBNotifications.show('Fixture alert'),false,'Worker failure and Android constructor rejection do not escape into delivery workflow');
 const desktop=noticeSurface({android:false,serviceWorker:false});ok(await desktop.window.NWTBNotifications.show('Fixture alert'),'Desktop notification fallback preserved');eq(desktop.nativeAttempts,1);
 const embedded=noticeSurface({embedded:true});eq(await embedded.window.NWTBNotifications.show('Fixture alert'),false,'Embedded Driver preview cannot create a Driver notification');
 const wrongPage=noticeSurface({file:'office-driver-preview.html'});eq(await wrongPage.window.NWTBNotifications.show('Fixture alert'),false,'Read-only Office preview never initializes Driver notification worker');
 let release;const late=noticeSurface();late.deferRegistration(new Promise(resolve=>release=resolve));const pending=late.window.NWTBNotifications.show('Old driver message');late.storage.set('nwtb_driver_token','different-driver');release();eq(await pending,false,'Late notification is discarded after Driver identity changes');eq(late.notices.length,0);
 for(const file of ['delivery-live.html','delivery-standard.html','dispatch-native.html','dispatch-live.html']){
  const f=noticeSurface({file});f.load('office-pause-alerts.js');await settle();await f.document.getElementById('officeRouteDesktopEnable').onclick();await settle();
  eq(f.notices.length,1,file+' can show Office pop-up through worker when mobile constructor is rejected');eq(f.notices[0].options.data.url,f.location.pathname,'Office notification targets Office');eq(f.notices[0].options.silent,true,'Office retains its separate seven-second sound');
  ok(!f.document.getElementById('officeRouteDesktopStatus').textContent.includes('FAILED'),'Successful mobile fallback does not report pop-up failure');eq(f.storage.get('nwtb_driver_token'),'fixture-driver','Office notification does not change Driver identity');
 }
}
async function loginAndRouteControls(){
 for(const file of ['driver-live.html','driver-standard.html']){
  const f=noticeSurface({file,permission:'default'});f.inline();f.storage.delete('nwtb_driver_token');f.storage.delete('nwtb_delivery_driver');await f.context.boot();eq(f.calls.length,0,'Driver startup never trusts Office token');ok(f.document.getElementById('loginPanel').style.display==='block');
  f.document.getElementById('employeeNumber').value='12x4';await f.context.driverLogin();eq(f.calls.length,0,'Invalid employee number is blocked without request');
  f.document.getElementById('employeeNumber').value='0012';await f.context.driverLogin();await settle();eq(f.calls[0].body.employee_number,'0012','Leading-zero four-digit employee number is preserved');eq(f.storage.get('nwtb_delivery_token'),'fixture-office');
  ok(f.document.getElementById('routes').textContent.includes('OPEN ROUTE'),'Released planned route can be inspected before start');await f.context.openRoute('fixture-route');eq(f.data.route.status,'PLANNED','Opening a route does not activate it');eq(f.calls.filter(c=>c.body.action==='route_start_driver').length,0);
  await f.context.enableAlerts(false);eq(f.permissionRequests,0,'Automatic audio unlock cannot consume notification permission prompt');
  if(file==='driver-live.html'){f.load('driver-alerts-auto-live.js');await settle();for(const name of ['pointerup','touchend'])f.document.dispatchEvent(new f.document.defaultView.Event(name));await settle();eq(f.permissionRequests,0,'Automatic first-tap setup leaves permission to explicit controls')}
  await f.context.startRoute('fixture-route');await settle();eq(f.data.route.status,'ACTIVE','Explicit START activates assigned route');eq(f.calls.filter(c=>c.body.action==='route_start_driver').length,1);
  f.context.openPauseModal();await f.context.submitPause();eq(f.calls.filter(c=>c.body.action==='route_pause_driver').length,0,'Pause requires a reason');f.document.getElementById('pauseReasonInput').value='Fixture rest break';await f.context.submitPause();eq(f.data.route.paused,true,'Pause reaches authenticated Driver endpoint');
  const before=f.calls.length;await f.context.finish('fixture-stop','DELIVERED');eq(f.calls.length,before,'Paused base completion remains blocked');await f.context.resumePausedRoute();eq(f.data.route.paused,false,'Resume keeps the same route');
  await f.context.enableAlerts(true);eq(f.permissionRequests,1,'Explicit alert control can request permission');eq(f.storage.get('nwtb_delivery_token'),'fixture-office');
  f.context.driverLogout();await settle();eq(f.storage.get('nwtb_driver_token'),undefined,'Logout removes Driver token');eq(f.storage.get('nwtb_delivery_token'),'fixture-office','Logout does not log Office out');
  const expired=noticeSurface({file});expired.inline();expired.failAuth(true);await expired.context.boot();eq(expired.storage.get('nwtb_driver_token'),undefined,'Expired Driver session returns to sign-in');eq(expired.storage.get('nwtb_delivery_token'),'fixture-office');
 }
}
async function mapCameraAndTouch(){
 const f=mapFixture({android:true});f.load('driver-mobile-nav-fix.js');f.load('driver-route-pins-native.js');f.load('driver-ios-map-fallback.js');f.load('driver-pod-live.js');f.load('driver-exceptions-live.js');await f.tick(600);await f.open();await f.begin();
 const map=f.private.map,container=map.getContainer();ok(container.isConnected,'Android has an attached real Leaflet map');ok(container.querySelectorAll('.leaflet-tile').length>0,'Android receives street tile elements');ok(container.querySelector('svg path'),'Android route geometry is drawn');eq(f.document.getElementById('nwtbIosStableMap'),null,'iPhone fallback does not cover Android Leaflet map');
 eq(f.private.feet(30.48),'100 ft','30.48 meters is displayed as 100 feet');eq(f.private.feet(15.24),'50 ft');eq(f.private.feet(1609.344),'1.0 mi');
 const arrivals=[];f.window.Notification=class{static permission='granted';constructor(){throw TypeError('Android requires worker notifications')}};f.window.navigator.serviceWorker={getRegistration:async()=>({active:{},showNotification:async(title,options)=>arrivals.push({title,options})})};f.load('nwtb-notifications.js');
 for(let i=0;i<3;i++){for(const callback of f.watches.values())callback({timestamp:Date.now(),coords:{latitude:41.7,longitude:-88.04,accuracy:3,speed:0}});await settle()}
 eq(arrivals.length,1,'Android arrival uses worker notification once');eq(arrivals[0].title,'NWTB — ARRIVED AT STOP');
 f.document.dispatchEvent(new f.document.defaultView.Event('orientationchange'));await f.tick(800);eq(f.private.map,map,'Orientation handling preserves route map');
 // Android camera images are decoded and resized before upload. GPS denial must not block POD.
 let photoDraw,photoEncoding;f.document.defaultView.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},drawImage(img,x,y,w,h){photoDraw={w,h}}});
 f.document.defaultView.HTMLCanvasElement.prototype.toDataURL=function(type,quality){photoEncoding={type,quality};return 'data:'+type+';base64,fixture'};
 f.ctx.FileReader=class{readAsDataURL(){this.result='data:image/jpeg;base64,fixture';this.onload()}};
 f.ctx.Image=class{constructor(){this.width=4032;this.height=3024}set src(v){this.onload()}};
 f.window.navigator.geolocation.getCurrentPosition=(success,error)=>error({code:1,message:'Location denied'});
 await f.window.nwtbCompleteNext();ok(f.document.getElementById('nwtbPodOverlay').classList.contains('show'),'Touch completion opens existing POD form');const photo=f.document.getElementById('podPhoto');eq(photo.getAttribute('capture'),'environment','Phone camera uses rear-camera hint');eq(photo.getAttribute('accept'),'image/*');
 f.document.getElementById('podRecipient').value='Fixture receiver';Object.defineProperty(photo,'files',{configurable:true,value:[{name:'Android-photo.jpg',type:'image/jpeg'}]});await f.document.getElementById('podSubmit').onclick();await settle();
 eq(photoDraw,{w:1600,h:1200},'Large Android photo is scaled to upload size');eq(photoEncoding,{type:'image/jpeg',quality:.76},'Photo is encoded as compressed JPEG');
 const submitted=f.requests.find(r=>r.url.endsWith('/nwtb-pod'));ok(submitted?.body.photo_data.startsWith('data:image/jpeg'),'POD includes prepared camera image');eq(submitted.body.lat,undefined,'Denied GPS is not replaced with fabricated coordinates');await f.tick(1000);ok(container.isConnected,'Completing photo POD retains map');eq(f.private.target.stop_id,'fixture-s2','Successful photo POD advances navigation');
 await f.window.nwtbCompleteNext();const canvas=f.document.getElementById('podSignature');ok(f.document.getElementById('nwtbPodStyle').textContent.includes('touch-action:none'),'Signature canvas keeps touch drawing separate from scrolling');
 for(const [type,x,y]of [['pointerdown',5,5],['pointermove',30,20],['pointerup',30,20]]){const e=new f.document.defaultView.Event(type);Object.assign(e,{clientX:x,clientY:y,pointerId:1,pointerType:'touch'});canvas.dispatchEvent(e)}
 Object.defineProperty(photo,'files',{configurable:true,value:[]});f.document.getElementById('podRecipient').value='Second receiver';await f.document.getElementById('podSubmit').onclick();await f.tick(1000);const signed=f.requests.filter(r=>r.url.endsWith('/nwtb-pod')).at(-1);ok(signed.body.signature_data.startsWith('data:image/png'),'Android touch signature can complete delivery without photo or GPS');ok(f.private.target.final,'Final stop retains return navigation');ok(container.isConnected);eq(f.local.get('nwtb_delivery_token'),'fixture-office-token');f.window.nwtbStopNavigation();
}
function worker(){
 const handlers=new Map(),focused=[],opened=[],posted=[],clientPaths=['delivery-live.html','driver-live.html','driver-standard.html'];
 const self={location:{origin:'https://billyjwiorek-tech.github.io'},registration:{scope:'https://billyjwiorek-tech.github.io/nwtb-route-creator/'},addEventListener:(name,fn)=>handlers.set(name,fn),clients:{matchAll:async()=>clientPaths.map(file=>({url:self.registration.scope+file,focus:async()=>focused.push(file),postMessage:message=>posted.push({file,message})})),openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(read('nwtb-driver-sw.js'),{self,URL,console});
 return {focused,opened,posted,clientPaths,async click(tag,url){let promise;handlers.get('notificationclick')({notification:{tag,data:{url},close(){}},waitUntil:p=>promise=p});await promise}};
}
function offlineDb(){
 const rows=new Map();
 const db={objectStoreNames:{contains:()=>true},close(){},transaction(){const tx={objectStore(){return {getAll(){const request={result:[...rows.values()].map(plain)};Promise.resolve().then(()=>request.onsuccess?.());return request},put(value){rows.set(value.id,plain(value));Promise.resolve().then(()=>tx.oncomplete?.())},delete(id){rows.delete(id);Promise.resolve().then(()=>tx.oncomplete?.())}}}};return tx}};
 return {rows,open(){const request={result:db};Promise.resolve().then(()=>request.onsuccess?.());return request}};
}
async function offlineReconnection(){
 const f=mapFixture({android:true}),db=offlineDb(),sent=[];f.ctx.indexedDB=db;f.ctx.crypto={randomUUID:()=>String(db.rows.size+1)};
 f.navigator=f.window.navigator;f.navigator.serviceWorker={register:async()=>({}),ready:Promise.resolve({})};
 const native=f.window.fetch;f.window.fetch=async(url,init)=>{if(String(url).endsWith('/nwtb-pod')){sent.push({token:init.headers['x-nwtb-session'],body:JSON.parse(init.body)});if(init.headers['x-nwtb-session']!=='fixture-driver-token')return f.response({error:'Wrong Driver'},403)}return native(url,init)};
 f.load('driver-offline-live.js');await settle();f.navigator.onLine=false;
 const body={action:'submit',stop_id:'fixture-s1',driver_employee_number:'1234',recipient_name:'Fixture receiver',signature_data:'data:image/png;base64,fixture'};
 let r=await f.window.fetch('https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-pod',{method:'POST',headers:{'x-nwtb-session':'fixture-driver-token'},body:JSON.stringify(body)});eq((await r.json()).offline_queued,true,'Offline proof is saved locally before claiming it is queued');eq(sent.length,0,'Offline save makes no network delivery write');eq(db.rows.size,1);
 r=await f.window.fetch('https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-delivery',{method:'POST',headers:{'x-nwtb-session':'fixture-driver-token'},body:JSON.stringify({action:'route_get',route_id:'fixture-r1'})});eq((await r.json()).stops[0].status,'DELIVERED','Queued proof appears completed locally while awaiting sync');
 f.local.set('nwtb_delivery_driver','5678');f.local.set('nwtb_driver_token','fixture-other-driver');f.navigator.onLine=true;await f.window.NWTBOffline.sync();eq(sent.length,0,'Reconnection under another Driver cannot submit saved proof');eq(db.rows.size,1,'Changing Driver does not delete previous Driver proof');
 f.local.set('nwtb_delivery_driver','1234');f.local.set('nwtb_driver_token','fixture-driver-token');f.failSave(true);await f.window.NWTBOffline.sync();eq(db.rows.size,1,'Server outage retains queued proof for retry');
 f.failSave(false);await Promise.all([f.window.NWTBOffline.sync(),f.window.NWTBOffline.sync()]);eq(db.rows.size,0,'Correct Driver reconnect uploads and removes confirmed proof');eq(sent.length,2,'Concurrent reconnect hooks do not double-submit proof');eq(sent.at(-1).token,'fixture-driver-token');eq(f.data.stops[0].status,'DELIVERED');eq(f.local.get('nwtb_delivery_token'),'fixture-office-token');
}
async function offlineShell(){
 const handlers=new Map(),lookups=[],self={location:{origin:'https://billyjwiorek-tech.github.io'},registration:{scope:'https://billyjwiorek-tech.github.io/nwtb-route-creator/'},addEventListener:(name,fn)=>handlers.set(name,fn)};
 const context=vm.createContext({self,URL,console,Response,caches:{open:async()=>({match:async(req,options)=>{lookups.push({url:req.url,ignoreSearch:options?.ignoreSearch===true});return options?.ignoreSearch?new Response('fixture cached shell'):null}})},fetch:async()=>{throw TypeError('Network unavailable')}});
 vm.runInContext(read('nwtb-driver-sw.js'),context);const shell=vm.runInContext('SHELL',context);ok(shell.some(x=>x.includes('leaflet@1.9.4/dist/leaflet.js')),'First install precaches Leaflet engine');ok(shell.some(x=>x.includes('leaflet@1.9.4/dist/leaflet.css')),'First install precaches map stylesheet');
 async function get(url){let response;handlers.get('fetch')({request:{url,method:'GET',mode:'cors'},respondWith:p=>response=p});return response}
 let r=await get('https://billyjwiorek-tech.github.io/nwtb-route-creator/driver-pod-live.js?v=20261021-android1');eq(await r.text(),'fixture cached shell','Versioned completion module can use current shell cache offline');
 r=await get('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js?v=20261014');eq(await r.text(),'fixture cached shell','Leaflet query version can use cached map engine');
 const count=lookups.length;await assert.rejects(()=>get('https://photon.komoot.io/api/?q=different-business'),/offline/);checks++;ok(lookups.slice(count).every(x=>!x.ignoreSearch),'Offline asset fallback cannot return another business query result');
}
async function notificationClicks(){
 for(const [tag,file]of [['nwtb-route-fixture','driver-live.html'],['nwtb-priority-fixture','driver-standard.html'],['nwtb-arrival-fixture','driver-live.html'],['nwtb-office-return-42','delivery-live.html']]){const w=worker();await w.click(tag,'/nwtb-route-creator/'+file);eq(w.focused,[file],'Notification click focuses correct app edition');ok(!w.posted.some(p=>p.message.type==='NWTB_OPEN_DRIVER_CHAT'),'Route/Office alert never opens Driver chat');}
 const chat=worker();await chat.click('nwtb-driver-chat','/nwtb-route-creator/driver-live.html');eq(chat.posted[0].message.type,'NWTB_OPEN_DRIVER_CHAT','Existing Dispatch message click still opens Driver chat');
 for(const [tag,url]of [['nwtb-route-fixture','/nwtb-route-creator/delivery-live.html'],['nwtb-office-return-42','/nwtb-route-creator/driver-live.html'],['nwtb-arrival-fixture','https://evil.invalid/driver-live.html']]){const w=worker();await w.click(tag,url);eq(w.focused.length+w.opened.length,0,'Notification cannot cross Office/Driver boundary or external origin')}
 const closed=worker();closed.clientPaths.length=0;await closed.click('nwtb-route-fixture','/nwtb-route-creator/driver-standard.html');eq(closed.opened,['https://billyjwiorek-tech.github.io/nwtb-route-creator/driver-standard.html'],'Closed-app alert opens the correct edition without starting a route');
}
function productionInventory(){
 const files=new Set(['driver-live.html','driver-standard.html','delivery-live.html','delivery-standard.html','dispatch-native.html','dispatch-live.html','tracker-live.html','office-driver-preview.html']);
 for(let pass=0;pass<6;pass++)for(const file of [...files])for(const match of read(file).matchAll(/["']([a-zA-Z0-9_-]+\.(?:js|mjs|html))(?:\?[^"']*)?["']/g))if(fs.existsSync(path.join(root,match[1])))files.add(match[1]);
 for(const file of files){if(file.endsWith('.html')){for(const match of read(file).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1],{filename:file});ok(/<meta[^>]*name="viewport"/.test(read(file)),file+' declares mobile viewport')}else{execFileSync(process.execPath,['--check',path.join(root,file)],{stdio:'pipe'});checks++}}
 for(const file of ['driver-gps.webmanifest','driver-standard.webmanifest']){const m=JSON.parse(read(file));eq(m.display,'standalone');ok(m.start_url.startsWith('./driver-'),'Home Screen opens correct Driver page');eq(m.scope,'./');for(const icon of m.icons)ok(fs.existsSync(path.join(root,icon.src)),'Manifest icon exists')}
 for(const file of ['driver-live.html','driver-standard.html','delivery-live.html','delivery-standard.html','dispatch-native.html','dispatch-live.html'])ok(read(file).includes('nwtb-notifications.js?v=20261021-android1'),file+' loads shared mobile notifications');
 ok(!read('driver-standard.html').includes('driver-tracking-engine-native.js'),'Standard remains the no-GPS edition');ok(read('nwtb-driver-sw.js').includes('./nwtb-notifications.js?v=20261021-android1'),'Updated offline shell includes notification helper');
 for(const file of ['driver.html','driver-v2.html'])ok(read(file).includes('driver-live.html'),'Legacy QR links still forward to GPS Driver');
 console.log('Inventory: '+files.size+' production pages/modules checked for syntax and mobile entry wiring.');
}
async function proveOriginal(){for(const file of ['driver-live.html','driver-standard.html']){const source=execFileSync('git',['show',baseline+':'+file],{cwd:root,encoding:'utf8'}),f=noticeSurface({file,source});f.inline();f.context.showRouteAlert({event_type:'STOP_ADDED_ACTIVE'});await settle();eq(f.nativeAttempts,1,'Original calls Android-rejected constructor');eq(f.notices.length,0,'Original silently loses phone notification')}console.log('CONFIRMED original Android defect in both Driver editions: route banner appears, phone notification is lost.');}
(async()=>{if(process.argv.includes('--prove-original'))return proveOriginal();await notifications();await loginAndRouteControls();await mapCameraAndTouch();await notificationClicks();await offlineReconnection();await offlineShell();productionInventory();console.log('PASS: '+checks+' Android capability, both-edition route/session, mobile notification, Office fallback, touch signature, camera, GPS-denial, offline ownership/retry/cache and production inventory checks. Fixtures only; no real phone certification.');})().catch(e=>{console.error(e);process.exitCode=1});
