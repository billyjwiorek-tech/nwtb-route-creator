(()=>{
'use strict';
if(window.__nwtbDriverAlertsAuto)return;window.__nwtbDriverAlertsAuto=true;
localStorage.setItem('nwtb_driver_alerts','1');
let armed=false,arming=false;
const STATUS='<span class="ok">DRIVER ALERTS ON AUTOMATICALLY</span> • sound + vibration active after your first tap on this page';
function markOn(){
 const b=document.getElementById('alertsBtn');
 if(b){
  if(b.textContent!=='DRIVER ALERTS ON')b.textContent='DRIVER ALERTS ON';
  if(b.className!=='btn green')b.className='btn green';
  if(!b.disabled)b.disabled=true;
  if(b.style.cursor!=='default')b.style.cursor='default';
  if(b.style.opacity!=='1')b.style.opacity='1';
 }
 const s=document.getElementById('alertStatus');
 if(s&&s.innerHTML!==STATUS)s.innerHTML=STATUS;
}
async function arm(){
 if(arming)return;arming=true;
 try{
  localStorage.setItem('nwtb_driver_alerts','1');
  if(typeof window.enableAlerts==='function')await window.enableAlerts(false);
  armed=true;
 }catch{}
 finally{arming=false;markOn()}
}
function userArm(){
 arm();
 if('Notification'in window&&Notification.permission==='default'){
  try{Notification.requestPermission()}catch{}
 }
 document.removeEventListener('pointerup',userArm,true);
 document.removeEventListener('touchend',userArm,true);
}
function boot(){
 markOn();arm();
 document.addEventListener('pointerup',userArm,true);
 document.addEventListener('touchend',userArm,{capture:true,passive:true});
 setTimeout(markOn,300);
 setTimeout(markOn,1200);
 setInterval(markOn,5000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();