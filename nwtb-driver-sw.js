const CACHE='nwtb-driver-shell-v9-android-alerts';
const DB='nwtb-driver-offline-v1';
const STORE='api_cache';
const SHELL=['./driver-custom-navigation-native.js?v=20261014-native1','./driver-nav-van-overlay.js?v=20260924-0725','./driver-priority-route-live.js?v=20261021-android1','./driver-alerts-auto-live.js?v=20261021-android1','https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js?v=20261014','https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css?v=20261014','./nwtb-notifications.js?v=20261021-android1','./driver-chat-live.js?v=20261020-presence1','./driver-phone-push.js?v=20261020-presence1','./driver-tracking-engine-native.js?v=20261020-presence1','./driver-gps.webmanifest','./driver-standard.webmanifest','./driver-live.html','./driver-standard.html','./driver-pod-live.js?v=20261021-android1','./driver-navigation-native.js?v=20261021-android1','./driver-voice-live.js?v=20261021-voice1','./driver-mobile-nav-fix.js?v=20261020-map1','./driver-route-pins-native.js?v=20261020-map1','./driver-ios-map-fallback.js?v=20261020-map1','./driver-exceptions-live.js?v=20261021-android1','./driver-offline-live.js?v=20261021-android1','./driver-depot-support-live.js','./driver-profiles-live.js','./nwtb-system-lock-live.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(SHELL.map(x=>c.add(new Request(new URL(x,self.registration.scope).href,{cache:'reload'}))))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('nwtb-driver-shell-')&&k!==CACHE)await caches.delete(k);await self.clients.claim()})())});
function openDb(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,3);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);if(!db.objectStoreNames.contains('write_queue')){const s=db.createObjectStore('write_queue',{keyPath:'id'});s.createIndex('created_at','created_at')}};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function dbPut(k,v){const db=await openDb();return new Promise((res,rej)=>{const t=db.transaction(STORE,'readwrite'),s=t.objectStore(STORE);s.put(v,k);t.oncomplete=()=>res();t.onerror=()=>rej(t.error)})}
async function dbGet(k){const db=await openDb();return new Promise((res,rej)=>{const t=db.transaction(STORE,'readonly'),r=t.objectStore(STORE).get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function isDriverRead(url,body){if(!url.includes('ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/'))return false;let a='';try{a=JSON.parse(body||'{}').action||''}catch{};return url.includes('/nwtb-delivery-tracking')&&['driver_routes','driver_route_state','route_changes'].includes(a)||url.includes('/nwtb-delivery')&&['drivers','route_get'].includes(a)||url.includes('/nwtb-delivery-profiles')&&a==='for_orders'}
async function postKey(req,body){const session=req.headers.get('x-nwtb-session')||'';const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(session));const identity=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');return 'session-v2|'+identity+'|'+req.url+'|'+body}
self.addEventListener('fetch',e=>{const req=e.request;if(req.method==='GET'){e.respondWith((async()=>{const cache=await caches.open(CACHE),url=new URL(req.url),shell=url.origin===self.location.origin&&/\.(?:html|js|webmanifest|svg)$/.test(url.pathname),leaflet=url.origin==='https://cdn.jsdelivr.net'&&/^\/npm\/leaflet@1\.9\.4\/dist\/leaflet\.(?:js|css)$/.test(url.pathname);try{const r=await fetch(req,shell?{cache:'no-store'}:undefined);if((r&&r.ok)||r.type==='opaque')cache.put(req,r.clone()).catch(()=>{});return r}catch{const c=await cache.match(req)||((shell||leaflet)?await cache.match(req,{ignoreSearch:true}):null);if(c)return c;if(req.mode==='navigate'){const path=new URL(req.url).pathname;if(path.endsWith('/driver-standard.html'))return await cache.match('./driver-standard.html')||new Response('Offline. Reconnect to load NWTB Driver Standard.',{status:503});if(path.endsWith('/driver-live.html'))return await cache.match('./driver-live.html')||new Response('Offline. Reconnect to load NWTB Driver GPS.',{status:503})}throw new Error('offline')}})());return}if(req.method==='POST'){e.respondWith((async()=>{const body=await req.clone().text();if(!isDriverRead(req.url,body))return fetch(req);const key=await postKey(req,body);try{const r=await fetch(req);if(r.ok){const text=await r.clone().text();await dbPut(key,{text,status:r.status,ts:Date.now()}).catch(()=>{})}return r}catch{const c=await dbGet(key).catch(()=>null);if(c)return new Response(c.text,{status:200,headers:{'content-type':'application/json','cache-control':'no-store','x-nwtb-offline':'1','x-nwtb-offline-age':String(Date.now()-c.ts)}});return new Response(JSON.stringify({error:'OFFLINE_NO_CACHED_DATA'}),{status:503,headers:{'content-type':'application/json'}})}})())}});
self.addEventListener('notificationclick',event=>{
 const tag=event.notification.tag||'',chat=tag==='nwtb-driver-chat',office=/^nwtb-office-(?:desktop-test|return-)/.test(tag),driver=chat||/^nwtb-(?:route|priority|arrival)-/.test(tag);
 if(!office&&!driver)return;
 event.notification.close();
 event.waitUntil((async()=>{
  const target=new URL(event.notification.data?.url||'./driver-live.html',self.registration.scope);
  const allowed=office?/^\/nwtb-route-creator\/(?:delivery-(?:live|standard)|dispatch-(?:native|live))\.html$/:/^\/nwtb-route-creator\/driver-(live|standard)\.html$/;
  if(target.origin!==self.location.origin||!allowed.test(target.pathname))return;
  target.hash=chat?'chat':'';
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const driverClient=clients.find(client=>{try{const u=new URL(client.url);return u.origin===target.origin&&u.pathname===target.pathname}catch{return false}});
  if(driverClient){await driverClient.focus();if(chat)driverClient.postMessage({type:'NWTB_OPEN_DRIVER_CHAT'});else if(office)driverClient.postMessage({type:'NWTB_OPEN_OFFICE_ALERTS'})}
  else await self.clients.openWindow(target.href);
 })());
});

self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let payload;try{payload=event.data?.json()}catch{payload={}}
  const binding=await dbGet('driver-push-binding-v1').catch(()=>null);
  const owned=!!binding&&binding.employee_number===String(payload?.driver_employee_number||'');
  const validType=['NWTB_DRIVER_CHAT','NWTB_DRIVER_PUSH_TEST'].includes(payload?.type);
  const allowedPaths=['/nwtb-route-creator/driver-live.html','/nwtb-route-creator/driver-standard.html'];
  const path=owned&&allowedPaths.includes(binding.page_path)?binding.page_path:'/nwtb-route-creator/driver-live.html';
  const title=owned&&validType?payload.type==='NWTB_DRIVER_PUSH_TEST'?'NWTB — PHONE ALERT TEST':'NWTB — DISPATCH MESSAGE':'NWTB — DISPATCH UPDATE';
  const options={body:owned&&validType?String(payload.body||'Open Dispatch Chat.').slice(0,300):'Open NWTB Driver to check Dispatch updates.',tag:'nwtb-driver-chat',renotify:true,requireInteraction:true,silent:false,icon:'./nwt-logo.svg',data:{url:path,message_id:owned?payload?.message_id:null}};
  await self.registration.showNotification(title,options);
  if(owned&&payload.type==='NWTB_DRIVER_CHAT'){
   const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
   for(const client of windows){try{const url=new URL(client.url);if(url.origin===self.location.origin&&allowedPaths.includes(url.pathname))client.postMessage({type:'NWTB_DRIVER_PUSH_MESSAGE',driver_employee_number:binding.employee_number,message_id:payload.message_id})}catch{}}
  }
 })());
});
