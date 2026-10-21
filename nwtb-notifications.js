(()=>{
'use strict';
if(window.NWTBNotifications)return;
const DRIVER=new Set(['/nwtb-route-creator/driver-live.html','/nwtb-route-creator/driver-standard.html']);
const OFFICE=new Set(['/nwtb-route-creator/delivery-live.html','/nwtb-route-creator/delivery-standard.html','/nwtb-route-creator/dispatch-native.html','/nwtb-route-creator/dispatch-live.html']);
function identity(){
 const path=location.pathname,isDriver=DRIVER.has(path);
 if(!isDriver&&!OFFICE.has(path))return null;
 try{if(isDriver&&window.top!==window.self)return null}catch{return null}
 return {path,key:isDriver?'nwtb_driver_token':'nwtb_delivery_token',token:localStorage.getItem(isDriver?'nwtb_driver_token':'nwtb_delivery_token')||''};
}
const same=s=>!!s?.token&&localStorage.getItem(s.key)===s.token;
async function registration(){
 const sw=navigator.serviceWorker;if(!sw)return null;
 let reg=await sw.getRegistration?.(location.href);
 if(!reg&&sw.register)reg=await sw.register('./nwtb-driver-sw.js',{scope:'./',updateViaCache:'none'});
 if(reg&&!reg.active&&sw.ready){
  let timer;try{reg=await Promise.race([sw.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Notification worker is not ready.')),8000)})])}finally{clearTimeout(timer)}
 }
 return reg;
}
async function show(title,options={},onClick){
 const s=identity();if(!same(s)||window.Notification?.permission!=='granted')return false;
 const data={...(options.data||{}),url:s.path};
 try{
  const reg=await registration();if(!same(s))return false;
  if(reg?.showNotification){await reg.showNotification(title,{icon:'./nwt-logo.svg',silent:false,...options,data});return true}
 }catch{}
 if(!same(s))return false;
 // Desktop fallback. Android rejects this constructor; its service-worker path is above.
 try{const notice=new window.Notification(title,{...options,data});if(onClick)notice.onclick=onClick;return true}catch{return false}
}
async function close(tag){try{const reg=await navigator.serviceWorker?.getRegistration?.(location.href);for(const notice of await reg?.getNotifications?.({tag})||[])notice.close()}catch{}}
window.NWTBNotifications={show,close};
})();
