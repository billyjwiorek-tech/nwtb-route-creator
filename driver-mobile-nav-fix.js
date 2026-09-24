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

let navMap=null,lastW=0,lastH=0;
function forceResize(){
 const el=document.getElementById('nwtbNavMap');
 if(!el||!navMap||typeof navMap.invalidateSize!=='function')return;
 const r=el.getBoundingClientRect();
 if(r.width<100||r.height<100)return;
 lastW=Math.round(r.width);lastH=Math.round(r.height);
 try{navMap.invalidateSize({pan:false,animate:false})}catch{try{navMap.invalidateSize()}catch{}}
}
function settle(){
 requestAnimationFrame(()=>requestAnimationFrame(forceResize));
 setTimeout(forceResize,80);
 setTimeout(forceResize,220);
 setTimeout(forceResize,500);
 setTimeout(forceResize,1000);
}
function watchContainer(){
 const el=document.getElementById('nwtbNavMap');
 if(!el||el.__nwtbResizeWatched)return;
 el.__nwtbResizeWatched=true;
 if('ResizeObserver' in window){
  const ro=new ResizeObserver(entries=>{
   const cr=entries[0]?.contentRect;if(!cr)return;
   const w=Math.round(cr.width),h=Math.round(cr.height);
   if(w!==lastW||h!==lastH){lastW=w;lastH=h;settle()}
  });
  ro.observe(el);
 }
 settle();
}

function captureLeaflet(){
 if(!window.L||typeof L.map!=='function')return false;
 if(L.map.__nwtbWrapped)return true;
 const original=L.map;
 function wrapped(id,opts){
  const m=original.call(this,id,opts);
  const el=typeof id==='string'?document.getElementById(id):id;
  if((typeof id==='string'&&id==='nwtbNavMap')||el?.id==='nwtbNavMap'){
   navMap=m;
   window.__nwtbNavMapInstance=m;
   watchContainer();
   settle();
  }
  return m;
 }
 Object.assign(wrapped,original);
 wrapped.__nwtbWrapped=true;
 L.map=wrapped;
 return true;
}

injectStyles();
let tries=0;const t=setInterval(()=>{if(captureLeaflet()||++tries>100)clearInterval(t)},40);
const mo=new MutationObserver(()=>{watchContainer();if(document.getElementById('nwtbNavPanel')?.classList.contains('show'))settle()});
mo.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
window.addEventListener('resize',settle,{passive:true});
window.addEventListener('orientationchange',()=>setTimeout(settle,120),{passive:true});
if(window.visualViewport)window.visualViewport.addEventListener('resize',settle,{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')settle()});
})();
