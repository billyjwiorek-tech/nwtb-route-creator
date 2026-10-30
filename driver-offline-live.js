(()=>{
'use strict';
if(window.NWTBOffline)return;
const DB='nwtb-driver-offline-v1',STORE='write_queue',nativeFetch=window.fetch.bind(window);
function openDb(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,3);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains('api_cache'))db.createObjectStore('api_cache');if(!db.objectStoreNames.contains(STORE)){const s=db.createObjectStore(STORE,{keyPath:'id'});s.createIndex('created_at','created_at')}};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function all(){const db=await openDb();return new Promise((res,rej)=>{const t=db.transaction(STORE,'readonly'),r=t.objectStore(STORE).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
async function put(v){const db=await openDb();return new Promise((res,rej)=>{const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).put(v);t.oncomplete=()=>res(v);t.onerror=()=>rej(t.error)})}
async function del(id){const db=await openDb();return new Promise((res,rej)=>{const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).delete(id);t.oncomplete=()=>res();t.onerror=()=>rej(t.error)})}
const owner=()=>localStorage.getItem('nwtb_delivery_driver')||'';
const itemOwner=item=>String(item.driver_employee_number||item.payload?.driver_employee_number||'');
const ownItems=items=>items.filter(item=>itemOwner(item)===owner());
 const pendingItems=items=>items.filter(item=>!item.review_required);
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let syncing=false;
const uid=()=>crypto.randomUUID?crypto.randomUUID():'q-'+Date.now()+'-'+Math.random().toString(36).slice(2);
function isNetworkError(e){return !navigator.onLine||e instanceof TypeError||/network|fetch|offline|failed to fetch/i.test(String(e?.message||e||''))}
function banner(){let b=document.getElementById('nwtbOfflineBanner');if(b)return b;const s=document.createElement('style');s.textContent='#nwtbOfflineBanner{position:fixed;left:10px;right:10px;top:10px;z-index:2147482600;padding:10px 12px;border-radius:10px;background:#7a2e0e;color:white;font:900 12px Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);display:none}#nwtbOfflineBanner.online{background:#175cd3}';document.head.appendChild(s);b=document.createElement('div');b.id='nwtbOfflineBanner';document.body.appendChild(b);return b}
async function refresh(){
 const b=banner(),items=ownItems(await all().catch(()=>[])),rejected=items.filter(x=>x.review_required),q=pendingItems(items);
 if(rejected.length){b.className='';b.style.display='block';b.textContent=rejected.length+' SAVED UPDATE(S) NEED DISPATCH REVIEW — PROOF RETAINED ON THIS PHONE. ';const button=document.createElement('button');button.type='button';button.textContent='REVIEW SAVED UPDATES';button.onclick=review;button.style.cssText='margin-left:8px;padding:7px;font-weight:bold';b.appendChild(button);return;}
 if(!navigator.onLine){b.className='';b.style.display='block';b.textContent='OFFLINE DRIVER MODE • USING SAVED ROUTE DATA'+(q.length?' • '+q.length+' UPDATE(S) WAITING TO SYNC':'');return;}
 if(q.length){b.className='online';b.style.display='block';b.textContent='BACK ONLINE • '+q.length+' SAVED UPDATE(S) WAITING TO SYNC';return;}b.style.display='none';
}
async function retry(id){const item=ownItems(await all()).find(x=>x.id===id);if(!item)return;delete item.review_required;delete item.last_error;await put(item);await sync();}
async function review(){
 let panel=document.getElementById('nwtbSavedUpdateReview');if(panel)panel.remove();panel=document.createElement('section');panel.id='nwtbSavedUpdateReview';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Saved updates needing review');panel.style.cssText='position:fixed;inset:30px 10px;z-index:2147482700;background:white;color:#182230;padding:20px;overflow:auto;border:3px solid #b54708;border-radius:12px;font:14px Arial';
 const h=document.createElement('h2');h.textContent='SAVED PROOF — DISPATCH REVIEW NEEDED';panel.appendChild(h);const close=document.createElement('button');close.textContent='CLOSE';close.onclick=()=>panel.remove();panel.appendChild(close);
 for(const item of ownItems(await all()).filter(x=>x.review_required)){
  const card=document.createElement('article'),p=item.payload||{};card.style.cssText='border-top:1px solid #ccc;margin-top:16px;padding-top:12px';
  const text=document.createElement('p');text.textContent=(item.type==='POD'?'PROOF OF DELIVERY':'DELIVERY EXCEPTION')+' • '+(p.recipient_name||'Saved stop update')+' • '+(p.captured_at||new Date(item.created_at).toLocaleString())+' — '+(item.last_error||'Server rejected this update. Contact Dispatch.');card.appendChild(text);
  for(const data of [p.signature_data,p.photo_data])if(typeof data==='string'&&/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(data)){const img=document.createElement('img');img.src=data;img.alt='Saved delivery evidence';img.style.cssText='display:block;max-width:100%;max-height:240px;margin:8px 0';card.appendChild(img);}
  const download=document.createElement('button');download.textContent='SAVE PROOF COPY';download.onclick=()=>{
   const images=[p.signature_data,p.photo_data].filter(v=>typeof v==='string'&&/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v));
   const html='<!doctype html><meta charset="utf-8"><title>NWTB saved proof</title><h1>NWTB SAVED PROOF — NOT ACCEPTED BY SERVER</h1><p>'+esc(p.recipient_name||'')+'</p><p>'+esc(p.captured_at||new Date(item.created_at).toISOString())+'</p><p>'+esc(p.notes||'')+'</p>'+images.map(v=>'<img style="display:block;max-width:100%" src="'+v+'" alt="Saved delivery evidence">').join('');
   const url=URL.createObjectURL(new Blob([html],{type:'text/html'})),a=document.createElement('a');a.href=url;a.download='NWTB-saved-proof-'+String(item.created_at)+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  };card.appendChild(download);const again=document.createElement('button');again.textContent='RETRY UPLOAD';again.style.marginLeft='8px';again.onclick=async()=>{again.disabled=true;try{await retry(item.id);await review()}finally{again.disabled=false}};card.appendChild(again);panel.appendChild(card);
 }document.body.appendChild(panel);
}
async function enqueue(type,url,payload){const driver=owner();if(!/^\d{4}$/.test(driver)||driver==='9998'||!localStorage.getItem('nwtb_driver_token')||String(payload?.driver_employee_number||'')!==driver)throw Error('Sign in as the delivery driver before saving offline.');const existing=pendingItems(ownItems(await all().catch(()=>[]))).find(x=>x.type===type&&x.payload?.stop_id===payload?.stop_id);if(existing){existing.payload=payload;existing.created_at=Date.now();await put(existing);await refresh();return existing}const item={id:uid(),type,url,payload,driver_employee_number:driver,created_at:Date.now(),attempts:0};await put(item);await refresh();return item}
function queuedSuccess(type){return new Response(JSON.stringify(type==='POD'?{ok:true,offline_queued:true,pod:{pod_number:'OFFLINE'}}:{ok:true,offline_queued:true,exception:{exception_number:'OFFLINE'}}),{status:200,headers:{'content-type':'application/json','cache-control':'no-store','x-nwtb-offline-queued':'1'}})}
async function patchRouteResponse(resp){try{const q=pendingItems(ownItems(await all()));if(!q.length)return resp;const j=await resp.clone().json();if(!Array.isArray(j?.stops))return resp;const state=new Map(q.filter(x=>x.payload?.stop_id).map(x=>[x.payload.stop_id,x.type==='POD'?'DELIVERED':'NOT_DELIVERED']));let changed=false;j.stops=j.stops.map(s=>{const st=state.get(s.id);if(!st)return s;changed=true;return {...s,status:st,completed_at:s.completed_at||new Date().toISOString(),driver_note:s.driver_note||(st==='DELIVERED'?'Saved offline — awaiting sync':'Exception saved offline — awaiting sync')}});if(!changed)return resp;return new Response(JSON.stringify(j),{status:resp.status,headers:{'content-type':'application/json','cache-control':'no-store','x-nwtb-local-queue':'1'}})}catch{return resp}}
window.fetch=async function(input,init){const url=typeof input==='string'?input:input?.url||'',method=String(init?.method||(typeof input!=='string'&&input?.method)||'GET').toUpperCase();if(method!=='POST')return nativeFetch(input,init);let body={};try{body=JSON.parse(String(init?.body||'{}'))}catch{}
 const pod=url.includes('/nwtb-pod')&&body.action==='submit',ex=url.includes('/nwtb-delivery-exceptions')&&body.action==='submit';if(pod||ex){const type=pod?'POD':'EXCEPTION';if(!navigator.onLine){await enqueue(type,url,body);return queuedSuccess(type)}try{return await nativeFetch(input,init)}catch(e){if(isNetworkError(e)){await enqueue(type,url,body);return queuedSuccess(type)}throw e}}
 const r=await nativeFetch(input,init);if(url.includes('/nwtb-delivery')&&body.action==='route_get')return patchRouteResponse(r);return r};
async function sync(){
 if(syncing||!navigator.onLine)return;const driver=owner(),token=localStorage.getItem('nwtb_driver_token')||'';if(!driver||!token)return;syncing=true;
 const unchanged=()=>owner()===driver&&localStorage.getItem('nwtb_driver_token')===token;
 try{
  const items=pendingItems(ownItems(await all().catch(()=>[])));if(!items.length)return;await refresh();
  for(const item of items.sort((a,b)=>a.created_at-b.created_at)){
   if(!unchanged()||!navigator.onLine)break;
   try{const r=await nativeFetch(item.url,{method:'POST',cache:'no-store',headers:{'content-type':'application/json','apikey':'sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc','x-nwtb-session':token},body:JSON.stringify(item.payload)});const j=await r.json().catch(()=>({error:'Invalid response'}));if(r.ok&&j.ok===true){await del(item.id);continue}if(r.ok)break;if(r.status===401||r.status===423||r.status>=500)break;if(r.status===409||r.status===400||r.status===403){item.review_required=true;item.rejected_at=Date.now();item.rejection_status=r.status;item.last_error=String(j.error||'Server rejected this update. Contact Dispatch.').slice(0,240);await put(item);continue}}catch(e){if(isNetworkError(e))break}
  }
  if(unchanged())try{const current=typeof route==='string'?route:'';if(current&&typeof openRoute==='function')await openRoute(current,true);else if(typeof loadRoutes==='function')await loadRoutes()}catch{}
 }finally{syncing=false;await refresh()}
}
async function register(){if('serviceWorker'in navigator){try{await navigator.serviceWorker.register('./nwtb-driver-sw.js',{scope:'./'});await navigator.serviceWorker.ready}catch(e){console.warn('NWTB offline service worker registration failed',e)}}}
function loadScript(src,key){if(document.querySelector(`script[data-${key}]`))return;const s=document.createElement('script');s.src=src;s.setAttribute(`data-${key}`,'1');document.head.appendChild(s)}
window.NWTBOffline={enqueue,sync,all,isNetworkError,refresh,review,retry};window.addEventListener('online',()=>setTimeout(sync,500));window.addEventListener('offline',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)sync()});
(async()=>{loadScript('driver-depot-support-live.js?v=20260929-1555','nwtb-depot-support');loadScript('driver-profiles-live.js?v=20261015-releasegate2','nwtb-driver-profiles');await register();await refresh();if(navigator.onLine)setTimeout(sync,1200)})();
})();