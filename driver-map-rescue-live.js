(()=>{
'use strict';
if(window.__nwtbMapRescueInstalled)return;window.__nwtbMapRescueInstalled=true;
let switched=false,armed=false;
function map(){return window.__nwtbNavMapInstance||null}
function panel(){return document.getElementById('nwtbNavPanel')}
function mapEl(){return document.getElementById('nwtbNavMap')}
function loadedTiles(){return mapEl()?.querySelectorAll('.leaflet-tile-loaded').length||0}
function usable(){const m=map(),el=mapEl();if(!m||!el||!panel()?.classList.contains('show'))return false;const r=el.getBoundingClientRect();return r.width>250&&r.height>250}
function addFallback(){
 const m=map();if(!m||!window.L||switched)return;switched=true;
 try{
  const old=[];m.eachLayer(l=>{if(l instanceof L.TileLayer)old.push(l)});old.forEach(l=>{try{m.removeLayer(l)}catch{}});
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:20,subdomains:'abcd',attribution:'© OpenStreetMap contributors © CARTO'}).addTo(m);
  try{m.invalidateSize({pan:false,animate:false})}catch{}
 }catch(e){console.warn('NWTB map fallback failed',e)}
}
function check(){
 if(!usable())return;
 const m=map();
 try{m.invalidateSize({pan:false,animate:false})}catch{}
 setTimeout(()=>{if(usable()&&loadedTiles()===0)addFallback()},1800);
}
function arm(){if(armed)return;armed=true;setTimeout(check,250);setTimeout(check,1200);setTimeout(check,3000)}
const mo=new MutationObserver(()=>{if(panel()?.classList.contains('show'))arm();else{armed=false;switched=false}});
let tries=0;const t=setInterval(()=>{const p=panel();if(p){mo.observe(p,{attributes:true,attributeFilter:['class']});if(p.classList.contains('show'))arm();clearInterval(t)}else if(++tries>120)clearInterval(t)},100);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&panel()?.classList.contains('show')){armed=false;arm()}});
})();