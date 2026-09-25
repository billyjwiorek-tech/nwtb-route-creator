(()=>{
'use strict';
if(window.__nwtbDriverAlertsAuto)return;window.__nwtbDriverAlertsAuto=true;
localStorage.setItem('nwtb_driver_alerts','1');
let armed=false;
function markOn(){
 const b=document.getElementById('alertsBtn');if(b){b.textContent='DRIVER ALERTS ON';b.className='btn green';b.disabled=true;b.style.cursor='default';b.style.opacity='1'}
 const s=document.getElementById('alertStatus');if(s)s.innerHTML='<span class="ok">DRIVER ALERTS ON AUTOMATICALLY</span> • sound + vibration active after your first tap on this page';
}
async function arm(){
 try{if(typeof window.enableAlerts==='function')await window.enableAlerts(false)}catch{}
 markOn();armed=true;
}
function userArm(){
 arm();
 try{const AC=window.AudioContext||window.webkitAudioContext;if(AC){const a=new AC();a.resume?.();setTimeout(()=>a.close?.(),300)}}catch{}
 if('Notification'in window&&Notification.permission==='default'){try{Notification.requestPermission()}catch{}}
 document.removeEventListener('pointerup',userArm,true);document.removeEventListener('touchend',userArm,true);
}
function boot(){arm();markOn();document.addEventListener('pointerup',userArm,true);document.addEventListener('touchend',userArm,{capture:true,passive:true});const mo=new MutationObserver(markOn);mo.observe(document.body,{childList:true,subtree:true});setInterval(markOn,3000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();