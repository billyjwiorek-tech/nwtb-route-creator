(()=>{
'use strict';
if(window.__nwtbIosMapFallbackV2)return;window.__nwtbIosMapFallbackV2=true;
const IS_IOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
if(!IS_IOS)return;
const NAV_MATCH='nwtb-driver-navigation';
const TILE=256;
let box=null,tiles=null,svg=null,van=null,badge=null,gpsWatch=null,lastGps=null,lastHeading=0,route=[],timer=null,active=false,lastRenderKey='';
const rad=x=>x*Math.PI/180,deg=x=>x*180/Math.PI;
function bearing(a,b){const y=Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat));const x=Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon));return (deg(Math.atan2(y,x))+360)%360}
function clampLat(lat){return Math.max(-85.05112878,Math.min(85.05112878,lat))}
function world(lat,lon,z){lat=clampLat(lat);const n=Math.pow(2,z),x=(lon+180)/360*n*TILE,s=Math.sin(rad(lat)),y=(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n*TILE;return{x,y}}
function toLocal(lat,lon,z,cx,cy,w,h){const p=world(lat,lon,z);return{x:p.x-cx+w/2,y:p.y-cy+h/2}}
function currentZoom(){const sp=Number(lastGps?.speed||0);return sp>22?14:sp>10?15:16}
function ensure(){
 const map=document.getElementById('nwtbNavMap');if(!map||box)return !!box;
 map.style.position='relative';map.style.overflow='hidden';
 const s=document.createElement('style');s.id='nwtbIosStableMapStyle';s.textContent=`
 #nwtbIosStableMap{position:absolute;inset:0;z-index:50000;background:#dfe7ec;overflow:hidden;display:none}#nwtbIosStableMap.show{display:block!important}
 #nwtbIosStableTiles{position:absolute;inset:0;overflow:hidden;background:#dfe7ec}#nwtbIosStableTiles img{position:absolute;width:256px;height:256px;max-width:none!important;max-height:none!important;user-select:none;-webkit-user-drag:none}
 #nwtbIosStableSvg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden}
 #nwtbIosStableVan{position:absolute;left:50%;top:50%;width:62px;height:46px;transform:translate(-50%,-50%);pointer-events:none;filter:drop-shadow(0 3px 5px rgba(15,23,42,.45))}
 #nwtbIosStableVan .body{position:absolute;left:4px;top:8px;width:40px;height:25px;background:#fff;border:2px solid #17202a;border-radius:7px}#nwtbIosStableVan .body b{position:absolute;left:5px;top:6px;color:#f58220;font:900 italic 10px Arial}
 #nwtbIosStableVan .cab{position:absolute;left:42px;top:14px;width:16px;height:19px;background:#fff;border:2px solid #17202a;border-left:0;border-radius:0 6px 4px 0}#nwtbIosStableVan .wheel{position:absolute;top:30px;width:9px;height:9px;border-radius:50%;background:#17202a;border:1.5px solid #fff}.w1{left:11px}.w2{left:44px}
 #nwtbIosStableVan .pulse{position:absolute;left:50%;top:50%;width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;transform:translate(-50%,-50%);box-shadow:0 0 0 0 rgba(37,99,235,.45);animation:nwtbStablePulse 1.5s infinite}@keyframes nwtbStablePulse{70%{box-shadow:0 0 0 15px rgba(37,99,235,0)}100%{box-shadow:0 0 0 0 rgba(37,99,235,0)}}
 #nwtbIosStableBadge{position:absolute;right:8px;bottom:8px;z-index:4;background:rgba(15,23,42,.82);color:#fff;border-radius:8px;padding:5px 7px;font:800 9px Arial;letter-spacing:.25px}
 `;document.head.appendChild(s);
 box=document.createElement('div');box.id='nwtbIosStableMap';box.innerHTML='<div id="nwtbIosStableTiles"></div><svg id="nwtbIosStableSvg"></svg><div id="nwtbIosStableVan"><span class="pulse"></span><div class="body"><b>NWTB</b></div><div class="cab"></div><span class="wheel w1"></span><span class="wheel w2"></span></div><div id="nwtbIosStableBadge">NWTB STABLE MAP</div>';
 map.appendChild(box);tiles=box.querySelector('#nwtbIosStableTiles');svg=box.querySelector('#nwtbIosStableSvg');van=box.querySelector('#nwtbIosStableVan');badge=box.querySelector('#nwtbIosStableBadge');return true;
}
function renderTiles(z,cx,cy,w,h){
 const minTx=Math.floor((cx-w/2)/TILE)-1,maxTx=Math.floor((cx+w/2)/TILE)+1,minTy=Math.floor((cy-h/2)/TILE)-1,maxTy=Math.floor((cy+h/2)/TILE)+1,n=Math.pow(2,z),wanted=new Set();
 for(let ty=minTy;ty<=maxTy;ty++)for(let tx=minTx;tx<=maxTx;tx++){
  if(ty<0||ty>=n)continue;const wrap=((tx%n)+n)%n,key=`${z}/${wrap}/${ty}`;wanted.add(key);let img=tiles.querySelector(`img[data-k="${key}"]`);if(!img){img=document.createElement('img');img.dataset.k=key;img.alt='';img.decoding='async';img.src=`https://tile.openstreetmap.org/${z}/${wrap}/${ty}.png`;tiles.appendChild(img)}img.style.left=(tx*TILE-cx+w/2)+'px';img.style.top=(ty*TILE-cy+h/2)+'px';
 }
 [...tiles.querySelectorAll('img')].forEach(img=>{if(!wanted.has(img.dataset.k))img.remove()});
}
function renderOverlay(z,cx,cy,w,h){
 let out='';if(route.length>1){const stride=Math.max(1,Math.floor(route.length/300)),pts=[];for(let i=0;i<route.length;i+=stride){const c=route[i];if(!Array.isArray(c)||c.length<2)continue;const p=toLocal(Number(c[1]),Number(c[0]),z,cx,cy,w,h);pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`)}const e=route[route.length-1];if(Array.isArray(e)&&e.length>=2){const p=toLocal(Number(e[1]),Number(e[0]),z,cx,cy,w,h);pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`)}if(pts.length>1)out+=`<polyline points="${pts.join(' ')}" fill="none" stroke="white" stroke-opacity=".92" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${pts.join(' ')}" fill="none" stroke="#2563eb" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;
  if(Array.isArray(e)&&e.length>=2){const p=toLocal(Number(e[1]),Number(e[0]),z,cx,cy,w,h);out+=`<circle cx="${p.x}" cy="${p.y}" r="12" fill="#f58220" stroke="#fff" stroke-width="4"/><circle cx="${p.x}" cy="${p.y}" r="4" fill="#17202a"/>`}
 }
 svg.setAttribute('viewBox',`0 0 ${Math.max(1,w)} ${Math.max(1,h)}`);svg.innerHTML=out;
}
function render(){if(!active||!lastGps||!ensure())return;const r=box.getBoundingClientRect(),w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height));if(w<150||h<180)return;const z=currentZoom(),c=world(lastGps.lat,lastGps.lon,z),key=`${z}:${Math.round(c.x)}:${Math.round(c.y)}:${w}:${h}:${route.length}`;if(key!==lastRenderKey){renderTiles(z,c.x,c.y,w,h);renderOverlay(z,c.x,c.y,w,h);lastRenderKey=key}else renderOverlay(z,c.x,c.y,w,h);van.style.transform=`translate(-50%,-50%) rotate(${lastHeading-90}deg)`;badge.textContent=route.length?'NWTB ROUTE • STABLE MAP':'NWTB GPS • STABLE MAP'}
function startGps(){if(gpsWatch!==null||!navigator.geolocation)return;gpsWatch=navigator.geolocation.watchPosition(p=>{const next={lat:Number(p.coords.latitude),lon:Number(p.coords.longitude),speed:Number(p.coords.speed)||0};if(lastGps){const d=Math.abs(lastGps.lat-next.lat)+Math.abs(lastGps.lon-next.lon);if(d>.000015)lastHeading=bearing(lastGps,next)}if(Number.isFinite(Number(p.coords.heading)))lastHeading=Number(p.coords.heading);lastGps=next;render()},()=>{},{enableHighAccuracy:true,maximumAge:1000,timeout:15000})}
function activate(){if(!ensure())return;active=true;box.classList.add('show');startGps();render();if(!timer)timer=setInterval(render,900)}
function deactivate(){active=false;if(box)box.classList.remove('show');if(timer){clearInterval(timer);timer=null}}
function inspect(){const panel=document.getElementById('nwtbNavPanel');if(panel&&panel.classList.contains('show'))activate();else deactivate()}
const origFetch=window.fetch.bind(window);window.fetch=async function(input,init){const res=await origFetch(input,init);try{const url=typeof input==='string'?input:(input?.url||'');if(url.includes(NAV_MATCH)){const j=await res.clone().json();if(Array.isArray(j?.geometry)&&j.geometry.length){route=j.geometry;lastRenderKey='';render()}}}catch{}return res};
let tries=0;const finder=setInterval(()=>{const panel=document.getElementById('nwtbNavPanel');if(panel){new MutationObserver(inspect).observe(panel,{attributes:true,attributeFilter:['class','style']});inspect();clearInterval(finder)}else if(++tries>200)clearInterval(finder)},100);
window.addEventListener('resize',()=>{lastRenderKey='';render()},{passive:true});window.addEventListener('orientationchange',()=>setTimeout(()=>{lastRenderKey='';render()},250),{passive:true});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){inspect();setTimeout(()=>{lastRenderKey='';render()},200)}});
})();