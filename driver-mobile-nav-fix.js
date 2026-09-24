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
 body.nwtb-nav-active .nwtbFullRouteBtn,body.nwtb-nav-starting .nwtbFullRouteBtn{display:none!important}
 body.nwtb-nav-active #nwtbDriverChatBtn,body.nwtb-nav-starting #nwtbDriverChatBtn{bottom:88px!important}
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

let navMap=null,lastW=0,lastH=0,lastViewport='';
function navShown(){return !!document.getElementById('nwtbNavPanel')?.classList.contains('show')}
function redrawTiles(){
 if(!navMap)return;
 try{navMap.eachLayer(layer=>{if(layer&&typeof layer.redraw==='function')layer.redraw()})}catch{}
}
function forceResize(redraw=false){
 const el=document.getElementById('nwtbNavMap');
 if(!el||!navMap||typeof navMap.invalidateSize!=='function')return;
 const r=el.getBoundingClientRect();
 if(r.width<100||r.height<100)return;
 const w=Math.round(r.width),h=Math.round(r.height);
 lastW=w;lastH=h;
 let center=null,zoom=null;
 try{center=navMap.getCenter();zoom=navMap.getZoom();navMap.stop()}catch{}
 try{navMap.invalidateSize({pan:true,animate:false,debounceMoveend:true})}catch{try{navMap.invalidateSize()}catch{}}
 requestAnimationFrame(()=>{
   try{if(center&&Number.isFinite(zoom))navMap.setView(center,zoom,{animate:false})}catch{}
   if(redraw)redrawTiles();
 });
}
function settle(redraw=false){
 requestAnimationFrame(()=>requestAnimationFrame(()=>forceResize(redraw)));
 setTimeout(()=>forceResize(redraw),80);
 setTimeout(()=>forceResize(redraw),220);
 setTimeout(()=>forceResize(redraw),500);
 setTimeout(()=>forceResize(redraw),1000);
}
function watchContainer(){
 const el=document.getElementById('nwtbNavMap');
 if(!el||el.__nwtbResizeWatched)return;
 el.__nwtbResizeWatched=true;
 if('ResizeObserver' in window){
  const ro=new ResizeObserver(entries=>{
   const cr=entries[0]?.contentRect;if(!cr)return;
   const w=Math.round(cr.width),h=Math.round(cr.height);
   if(w!==lastW||h!==lastH){lastW=w;lastH=h;settle(true)}
  });
  ro.observe(el);
 }
 settle(true);
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
   settle(true);
   try{
    m.on('moveend zoomend',()=>setTimeout(()=>forceResize(false),40));
    m.on('layeradd',()=>setTimeout(()=>forceResize(true),80));
   }catch{}
  }
  return m;
 }
 Object.assign(wrapped,original);
 wrapped.__nwtbWrapped=true;
 L.map=wrapped;
 return true;
}

function restoreRouteButtons(){
 document.querySelectorAll('.nwtbFullRouteBtn').forEach(b=>{
   if(b.dataset.nwtbOriginalText)b.textContent=b.dataset.nwtbOriginalText;
   b.disabled=false;
 });
}
function syncNavState(){
 const active=navShown();
 document.body.classList.toggle('nwtb-nav-active',active);
 if(active){document.body.classList.remove('nwtb-nav-starting');document.querySelectorAll('.nwtbFullRouteBtn').forEach(b=>b.disabled=true);settle(true)}
 else if(!document.body.classList.contains('nwtb-nav-starting'))restoreRouteButtons();
}
function lockOnStart(e){
 const b=e.target?.closest?.('.nwtbFullRouteBtn');if(!b)return;
 if(b.disabled){e.preventDefault();e.stopPropagation();return}
 b.dataset.nwtbOriginalText=b.textContent||'ROUTE FULL ROUTE IN NWTB';
 b.disabled=true;b.textContent='STARTING NWTB NAVIGATION…';
 document.body.classList.add('nwtb-nav-starting');
 setTimeout(syncNavState,100);
 setTimeout(()=>{if(!navShown()){document.body.classList.remove('nwtb-nav-starting');restoreRouteButtons()}},15000);
}

injectStyles();
document.addEventListener('click',lockOnStart,true);
let tries=0;const t=setInterval(()=>{if(captureLeaflet()||++tries>100)clearInterval(t)},40);
const mo=new MutationObserver(()=>{watchContainer();syncNavState();if(navShown())settle(false)});
mo.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
window.addEventListener('resize',()=>settle(true),{passive:true});
window.addEventListener('orientationchange',()=>setTimeout(()=>settle(true),120),{passive:true});
if(window.visualViewport)window.visualViewport.addEventListener('resize',()=>settle(true),{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')settle(true)});
setInterval(()=>{
 if(!navShown()||!navMap)return;
 const vv=window.visualViewport,el=document.getElementById('nwtbNavMap'),r=el?.getBoundingClientRect();
 if(!r)return;
 const sig=`${Math.round(r.width)}x${Math.round(r.height)}:${Math.round(vv?.width||innerWidth)}x${Math.round(vv?.height||innerHeight)}`;
 const noTiles=el.querySelectorAll('.leaflet-tile-loaded').length===0;
 if(sig!==lastViewport||noTiles){lastViewport=sig;settle(true)}
},1500);
syncNavState();
})();
