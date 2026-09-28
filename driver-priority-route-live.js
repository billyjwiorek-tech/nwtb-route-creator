(()=>{
'use strict';
if(window.__nwtbDriverPriorityRouteLive)return;window.__nwtbDriverPriorityRouteLive=true;
const API='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-route-priority';
const KEY='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
let busy=false;
const session=()=>localStorage.getItem('nwtb_delivery_token')||'';
async function post(payload){const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json','apikey':KEY,'x-nwtb-session':session()},body:JSON.stringify(payload)}),j=await r.json().catch(()=>({error:'Bad response'}));if(!r.ok)throw Error(j.error||'Request failed');return j}
function show(ev){
 const bar=document.getElementById('routeAlert');if(bar){bar.className='alertbar show';bar.style.background='#7c3aed';bar.innerHTML='ROUTE RE-OPTIMIZED BY DISPATCH<div class="sub">'+String(ev.note||'Your remaining stop order changed.').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))+'</div>';setTimeout(()=>{bar.className='alertbar';bar.style.background=''},10000)}
 try{if(typeof playAlertTone==='function')playAlertTone(true)}catch{}
 try{if(navigator.vibrate)navigator.vibrate([350,120,350,120,650])}catch{}
 if('Notification'in window&&Notification.permission==='granted'){try{new Notification('NWTB — ROUTE UPDATED',{body:ev.note||'Dispatch re-optimized your remaining stops.',tag:'nwtb-priority-'+String(typeof route!=='undefined'?route:''),renotify:true})}catch{}}
}
async function check(){
 if(busy)return;
 let rid='',drv='';try{rid=String(typeof route!=='undefined'?route:'');drv=String(typeof driver!=='undefined'?driver:'')}catch{}
 if(!rid||!drv)return;busy=true;
 const key='nwtb_priority_event_'+rid,stored=localStorage.getItem(key),after=Math.max(0,Number(stored)||0);
 try{
  const j=await post({action:'route_priority_changes',route_id:rid,driver_employee_number:drv,after_id:after}),events=j.events||[];if(!events.length)return;
  const last=events[events.length-1];localStorage.setItem(key,String(last.id));
  const fresh=events.filter(e=>{const t=new Date(e.created_at).getTime();return Number.isFinite(t)&&Date.now()-t<10*60*1000});
  if(!stored&&fresh.length===0)return;
  for(const ev of fresh)show(ev);
  if(fresh.length&&typeof openRoute==='function')setTimeout(()=>openRoute(rid,true),250);
 }catch(e){console.warn('Priority route update check failed',e)}finally{busy=false}
}
setInterval(check,5000);setTimeout(check,1800);
})();