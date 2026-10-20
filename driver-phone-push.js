(()=>{
'use strict';
if(window.__nwtbDriverPhonePush)return;window.__nwtbDriverPhonePush=true;
try{if(window.top!==window.self||window.frameElement)return}catch{return}
const CHAT='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-delivery-chat',KEY='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc',BINDING='driver-push-binding-v1';
const validPaths=['/nwtb-route-creator/driver-live.html','/nwtb-route-creator/driver-standard.html'];
if(!validPaths.includes(location.pathname))return;
let registrationPromise=null,busy=false,lastIdentity='',generation=0,testing=false;
const get=id=>document.getElementById(id);
function identity(){return {token:localStorage.getItem('nwtb_driver_token')||'',no:localStorage.getItem('nwtb_delivery_driver')||'',generation}}
function same(s){const c=identity();return s.token===c.token&&s.no===c.no&&s.generation===generation}
function valid(s){return window.__nwtbDriverSignedIn===true&&!!s.token&&/^\d{4}$/.test(s.no)&&s.no!=='9998'}
const installed=()=>window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
const ios=()=>/iPhone|iPad|iPod/.test(navigator.userAgent||'')||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
function status(text,kind='info'){const el=get('nwtbPhonePushStatus');if(el){el.textContent=text;el.style.color=kind==='ok'?'#067647':kind==='bad'?'#b42318':'#667085'}}
async function post(body,s=identity()){
 const response=await fetch(CHAT,{method:'POST',cache:'no-store',headers:{'content-type':'application/json','apikey':KEY,'x-nwtb-session':s.token},body:JSON.stringify(body)}),data=await response.json().catch(()=>({error:'Phone notification response error.'}));
 if(!response.ok||data.error)throw Error(data.error||'Phone notification request failed.');return data;
}
function register(){
 if(!registrationPromise)registrationPromise=navigator.serviceWorker.register('./nwtb-driver-sw.js',{scope:'./',updateViaCache:'none'}).then(async registration=>{await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Phone notification service is still loading. Try again.')),20000))]);return registration}).catch(error=>{registrationPromise=null;throw error});
 return registrationPromise;
}
function binding(value){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('nwtb-driver-offline-v1',3);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('api_cache'))db.createObjectStore('api_cache');if(!db.objectStoreNames.contains('write_queue')){const store=db.createObjectStore('write_queue',{keyPath:'id'});store.createIndex('created_at','created_at')}};
  request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('api_cache','readwrite');tx.objectStore('api_cache').put(value,BINDING);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}};
 });
}
function decodeKey(key){const padded=key.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-key.length%4)%4);return Uint8Array.from(atob(padded),c=>c.charCodeAt(0))}
function sameApplicationKey(subscription,key){const existing=subscription.options?.applicationServerKey;if(!existing)return true;const a=new Uint8Array(existing),b=decodeKey(key);return a.length===b.length&&a.every((value,index)=>value===b[index])}
async function bindSubscription(subscription,s){
 if(!same(s)||!valid(s))return;
 await binding({employee_number:s.no,page_path:location.pathname});
 if(!same(s)||!valid(s))return;
 await post({action:'phone_push_subscribe',subscription:subscription.toJSON(),page_path:location.pathname},s);
 if(!same(s)||!valid(s))return;
 window.nwtbDriverPushEnabled=true;get('nwtbEnablePhonePush').textContent='PHONE NOTIFICATIONS ENABLED';get('nwtbTestPhonePush').disabled=false;
 status('Phone notifications enabled. Lock-screen alerts and sound follow your phone’s notification and Focus settings.','ok');
}
async function enable(){
 const before=identity(),key=before.no+'|'+before.token+'|'+String(window.__nwtbDriverSignedIn===true);if(key!==lastIdentity){lastIdentity=key;generation++}
 const s=identity();if(!valid(s)){status('Sign in with your employee number first.','bad');return}
 if(ios()&&!installed()){status('On iPhone: open this link in Safari → Share → Add to Home Screen. Open the new NWTB Driver icon, sign in, then tap ENABLE PHONE NOTIFICATIONS.');return}
 if(!('Notification'in window)||!('PushManager'in window)||!navigator.serviceWorker){status('This browser does not support phone push. Use the current Safari Home Screen app on iPhone or Chrome on Android.','bad');return}
 if(busy)return;busy=true;get('nwtbEnablePhonePush').disabled=true;status('Enabling phone notifications…');
 try{
  let permission=Notification.permission;if(permission==='default')permission=await Notification.requestPermission();
  if(permission!=='granted')throw Error('Notifications are blocked. Allow notifications for NWTB Driver in your phone or browser settings, then try again.');
  const registration=await register(),config=await post({action:'phone_push_config'},s);if(!same(s)||!valid(s))return;
  let subscription=await registration.pushManager.getSubscription();
  if(subscription&&!sameApplicationKey(subscription,config.public_key)){await subscription.unsubscribe();subscription=null}
  if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(config.public_key)});
  await bindSubscription(subscription,s);
 }catch(error){if(same(s))status(error.message||'Could not enable phone notifications.','bad')}
 finally{busy=false;get('nwtbEnablePhonePush').disabled=false}
}
async function test(){
 const s=identity();if(testing||!valid(s)||!window.nwtbDriverPushEnabled)return;testing=true;get('nwtbTestPhonePush').disabled=true;
 try{await post({action:'phone_push_test'},s);if(same(s))status('TEST QUEUED — lock your phone now. The test alert is sent in about 5 seconds. Check the lock-screen alert and phone sound.','ok')}
 catch(error){if(same(s))status(error.message,'bad')}
 finally{setTimeout(()=>{testing=false;if(get('nwtbTestPhonePush'))get('nwtbTestPhonePush').disabled=!window.nwtbDriverPushEnabled},12000)}
}
async function sync(){
 const current=identity(),key=current.no+'|'+current.token+'|'+String(window.__nwtbDriverSignedIn===true);
 if(key===lastIdentity)return;lastIdentity=key;generation++;window.nwtbDriverPushEnabled=false;
 if(get('nwtbTestPhonePush'))get('nwtbTestPhonePush').disabled=true;
 const s=identity();try{await binding(valid(s)?{employee_number:s.no,page_path:location.pathname}:null)}catch{}
 if(!valid(s))return;
 if(ios()&&!installed()){status('For locked-phone alerts, add this app to your iPhone Home Screen, open that icon, and enable phone notifications.');return}
 if(!('Notification'in window)||!('PushManager'in window)||!navigator.serviceWorker){status('Phone push is not supported in this browser.');return}
 try{
  const registration=await register();if(!same(s))return;
  const subscription=Notification.permission==='granted'?await registration.pushManager.getSubscription():null;
  if(subscription){const config=await post({action:'phone_push_config'},s);if(!sameApplicationKey(subscription,config.public_key))throw Error('Phone notification setup needs refreshing. Tap ENABLE PHONE NOTIFICATIONS.');await bindSubscription(subscription,s)}else status('Enable phone notifications to receive Dispatch alerts while your phone is locked.');
 }catch(error){if(same(s))status(error.message,'bad')}
}
function logout(){
 generation++;lastIdentity='';window.nwtbDriverPushEnabled=false;binding(null).catch(()=>{});
 if(get('nwtbTestPhonePush'))get('nwtbTestPhonePush').disabled=true;
}
function boot(){
 const app=get('app');if(!app)return;
 const panel=document.createElement('section');panel.id='nwtbDriverPhonePushPanel';panel.className='panel';panel.innerHTML='<b>PHONE NOTIFICATIONS</b><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px"><button type="button" class="btn blue" id="nwtbEnablePhonePush">ENABLE PHONE NOTIFICATIONS</button><button type="button" class="btn ghost" id="nwtbTestPhonePush" disabled>TEST PHONE ALERT</button></div><p id="nwtbPhonePushStatus" class="small" role="status" style="line-height:1.5;margin-bottom:0">Enable alerts for Dispatch messages, including when your phone is locked.</p>';app.prepend(panel);
 get('nwtbEnablePhonePush').onclick=enable;get('nwtbTestPhonePush').onclick=test;
 if(navigator.serviceWorker)register().catch(()=>{});sync();setInterval(sync,2000);
 window.addEventListener('storage',sync);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){lastIdentity='';sync()}});
}
window.nwtbDriverPushLogout=logout;window.nwtbEnableDriverPhonePush=enable;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
