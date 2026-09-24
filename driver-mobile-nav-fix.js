(()=>{
'use strict';
if(window.__nwtbMobileNavFixInstalled)return;
window.__nwtbMobileNavFixInstalled=true;

function injectStyles(){
 if(document.getElementById('nwtbMobileNavFixStyle'))return;
 const s=document.createElement('style');
 s.id='nwtbMobileNavFixStyle';
 s.textContent=`
 #nwtbNavMap{width:100%!important;position:relative!important;overflow:hidden!important}
 #nwtbNavMap.leaflet-container{width:100%!important;background:#dbe4ea!important}
 #nwtbNavPanel{width:100%!important;box-sizing:border-box!important}
 .navActions button{white-space:normal!important;line-height:1.15!important}
 body.nwtb-nav-starting .nwtbFullRouteBtn,body.nwtb-nav-active .nwtbFullRouteBtn{display:none!important}
 body.nwtb-nav-starting #nwtbDriverChatBtn,body.nwtb-nav-active #nwtbDriverChatBtn{bottom:88px!important}
 @media(max-width:720px){
   body{overflow-x:hidden!important}
   .wrap{max-width:none!important;margin:8px auto!important;padding:0 8px!important}
   #nwtbNavPanel{border-radius:14px!important;margin:0 0 10px!important;box-shadow:0 8px 22px rgba(16,24,40,.18)!important}
   .navTop{padding:12px 14px!important}
   .navTop small{font-size:12px!important;letter-spacing:.3px!important}
   .navTurn{font-size:30px!important;line-height:1.06!important;margin-top:4px!important}
   .navMeta{gap:10px!important;font-size:13px!important;margin-top:7px!important}
   .navBanner{padding:9px 12px!important;font-size:13px!important}
   .navMap{height:48vh!important;min-height:330px!important;max-height:500px!important;width:100%!important}
   .navActions{display:grid!important;grid-template-columns:1fr 1fr 1fr!important;gap:6px!important;padding:8px!important;background:#fff!important}
   .navActions button{min-width:0!important;width:100%!important;padding:12px 5px!important;font-size:12px!important;border-radius:10px!important}
   .leaflet-control-zoom a{width:34px!important;height:34px!important;line-height:34px!important}
   .leaflet-control-attribution{font-size:8px!important;max-width:72vw!important}
 }
 @media(max-width:390px){
   .navTurn{font-size:27px!important}
   .navMeta{font-size:12px!important;gap:8px!important}
   .navMap{height:45vh!important;min-height:300px!important}
   .navActions button{font-size:11px!important;padding:11px 3px!important}
 }
 `;
 document.head.appendChild(s);
}

let map=null,resizeObserver=null,lastW=0,lastH=0,resizeTimer=null,panelObserver=null;
function panel(){return document.getElementById('nwtbNavPanel')}
function shown(){return !!panel()?.classList.contains('show')}
function safeInvalidate(){
 if(!map||!shown())return;
 const el=document.getElementById('nwtbNavMap');
 if(!el)return;
 const r=el.getBoundingClientRect();
 if(r.width<100||r.height<100)return;
 try{map.invalidateSize({pan:false,animate:false})}catch{try{map.invalidateSize()}catch{}}
}
function scheduleResize(){
 clearTimeout(resizeTimer);
 resizeTimer=setTimeout(()=>{
   safeInvalidate();
   setTimeout(safeInvalidate,120);
   setTimeout(safeInvalidate,350);
 },80);
}
function watchMapElement(){
 const el=document.getElementById('nwtbNavMap');
 if(!el||resizeObserver)return;
 if('ResizeObserver'in window){
   resizeObserver=new ResizeObserver(entries=>{
     const cr=entries[0]?.contentRect;if(!cr)return;
     const w=Math.round(cr.width),h=Math.round(cr.height);
     if(w===lastW&&h===lastH)return;
     lastW=w;lastH=h;scheduleResize();
   });
   resizeObserver.observe(el);
 }
}
function syncState(){
 const active=shown();
 document.body.classList.toggle('nwtb-nav-active',active);
 if(active){
   document.body.classList.remove('nwtb-nav-starting');
   document.querySelectorAll('.nwtbFullRouteBtn').forEach(b=>b.disabled=true);
   watchMapElement();scheduleResize();
 }else if(!document.body.classList.contains('nwtb-nav-starting')){
   document.querySelectorAll('.nwtbFullRouteBtn').forEach(b=>{b.disabled=false;if(b.dataset.nwtbOriginalText)b.textContent=b.dataset.nwtbOriginalText});
 }
}
function watchPanel(){
 const p=panel();if(!p||panelObserver)return;
 panelObserver=new MutationObserver(syncState);
 panelObserver.observe(p,{attributes:true,attributeFilter:['class']});
 syncState();
}
function captureLeaflet(){
 if(!window.L||typeof L.map!=='function')return false;
 if(L.map.__nwtbSafeWrapped)return true;
 const original=L.map;
 function wrapped(id,opts){
   const m=original.call(this,id,opts);
   const el=typeof id==='string'?document.getElementById(id):id;
   if((typeof id==='string'&&id==='nwtbNavMap')||el?.id==='nwtbNavMap'){
     map=m;window.__nwtbNavMapInstance=m;watchMapElement();watchPanel();scheduleResize();
   }
   return m;
 }
 Object.assign(wrapped,original);wrapped.__nwtbSafeWrapped=true;L.map=wrapped;return true;
}
function lockStart(e){
 const b=e.target?.closest?.('.nwtbFullRouteBtn');if(!b)return;
 if(b.disabled){e.preventDefault();e.stopPropagation();return}
 b.dataset.nwtbOriginalText=b.textContent||'ROUTE FULL ROUTE IN NWTB';
 b.disabled=true;b.textContent='NWTB GPS STARTING…';document.body.classList.add('nwtb-nav-starting');
 setTimeout(()=>{watchPanel();syncState()},100);
 setTimeout(()=>{if(!shown()){document.body.classList.remove('nwtb-nav-starting');syncState()}},15000);
}
function wrapStop(){
 if(typeof window.nwtbStopNavigation!=='function'||window.nwtbStopNavigation.__nwtbWrapped)return false;
 const old=window.nwtbStopNavigation;
 const wrapped=function(...args){try{return old.apply(this,args)}finally{document.body.classList.remove('nwtb-nav-active','nwtb-nav-starting');setTimeout(syncState,0)}};
 wrapped.__nwtbWrapped=true;window.nwtbStopNavigation=wrapped;return true;
}

injectStyles();
document.addEventListener('click',lockStart,true);
let leafTries=0;const leafTimer=setInterval(()=>{if(captureLeaflet()||++leafTries>100)clearInterval(leafTimer)},50);
let panelTries=0;const panelTimer=setInterval(()=>{watchPanel();if(panel()||++panelTries>120)clearInterval(panelTimer)},100);
let stopTries=0;const stopTimer=setInterval(()=>{if(wrapStop()||++stopTries>120)clearInterval(stopTimer)},100);
window.addEventListener('resize',scheduleResize,{passive:true});
window.addEventListener('orientationchange',()=>setTimeout(scheduleResize,150),{passive:true});
if(window.visualViewport)window.visualViewport.addEventListener('resize',scheduleResize,{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleResize()});
})();
