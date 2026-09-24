(()=>{
'use strict';
if(window.__nwtbDriverMapTileRepair)return;window.__nwtbDriverMapTileRepair=true;
const TILE_URL='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
let map=null,tile=null,installed=false,resizeObserver=null,panelObserver=null;
function getMap(){return window.__nwtbNavMapInstance||map}
function panel(){return document.getElementById('nwtbNavPanel')}
function visible(){const p=panel(),el=document.getElementById('nwtbNavMap');if(!p||!el||!p.classList.contains('show'))return false;const r=el.getBoundingClientRect();return r.width>200&&r.height>200}
function replaceTiles(){
 const m=getMap();if(!m||!window.L)return false;map=m;
 let old=[];try{m.eachLayer(l=>{if(l instanceof L.TileLayer)old.push(l)})}catch{}
 if(old.length===1&&String(old[0]._url||'')===TILE_URL){tile=old[0];return true}
 for(const l of old){try{m.removeLayer(l)}catch{}}
 try{tile=L.tileLayer(TILE_URL,{maxZoom:19,attribution:'© OpenStreetMap contributors',updateWhenIdle:false,keepBuffer:3,crossOrigin:true}).addTo(m);return true}catch(e){console.warn('NWTB tile layer repair failed',e);return false}
}
function stabilize(){
 const m=getMap();if(!m||!visible())return;
 replaceTiles();
 let c=null,z=null;try{c=m.getCenter();z=m.getZoom()}catch{}
 const run=()=>{try{m.invalidateSize({pan:false,animate:false});if(c&&Number.isFinite(z))m.setView(c,z,{animate:false});if(tile&&typeof tile.redraw==='function')tile.redraw()}catch{}};
 requestAnimationFrame(()=>requestAnimationFrame(run));
 setTimeout(run,120);setTimeout(run,350);
}
window.nwtbRepairDriverMap=stabilize;
function installWatchers(){
 if(installed)return;installed=true;
 const el=document.getElementById('nwtbNavMap');
 const p=panel();
 if(el&&'ResizeObserver'in window){resizeObserver=new ResizeObserver(()=>{if(visible())stabilize()});resizeObserver.observe(el)}
 if(p){panelObserver=new MutationObserver(()=>{if(visible())stabilize()});panelObserver.observe(p,{attributes:true,attributeFilter:['class','style']})}
 window.addEventListener('resize',()=>{if(visible())stabilize()},{passive:true});
 window.addEventListener('orientationchange',()=>setTimeout(stabilize,150),{passive:true});
 if(window.visualViewport)window.visualViewport.addEventListener('resize',()=>{if(visible())stabilize()},{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(stabilize,120)});
}
function boot(){
 const m=getMap();if(m){map=m;installWatchers();if(visible())stabilize();return true}
 return false
}
let tries=0;const t=setInterval(()=>{if(boot()||++tries>200)clearInterval(t)},50);
})();
