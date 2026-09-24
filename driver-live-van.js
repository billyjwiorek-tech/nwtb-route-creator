(()=>{
'use strict';
const MOBILE_MAX=720;
const HEADING_MOVE_M=3;
let lastPoint=null,lastHeading=0;

const rad=x=>x*Math.PI/180;
const deg=x=>x*180/Math.PI;
function meters(a,b){if(!a||!b)return Infinity;const R=6371008.8,dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon),x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
function bearing(a,b){if(!a||!b)return null;const y=Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat));const x=Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon));const v=(deg(Math.atan2(y,x))+360)%360;return Number.isFinite(v)?v:null}
function smoothHeading(current,target){if(!Number.isFinite(target))return current;const d=((target-current+540)%360)-180;return (current+d*.48+360)%360}
function smallScreen(){return window.matchMedia&&window.matchMedia(`(max-width:${MOBILE_MAX}px)`).matches}
function point(v){if(Array.isArray(v))return {lat:Number(v[0]),lon:Number(v[1])};return {lat:Number(v?.lat),lon:Number(v?.lng??v?.lon)}}
function good(p){return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)}

function ensureStyle(){
 if(document.getElementById('nwtbDriverVanStyle'))return;
 const s=document.createElement('style');s.id='nwtbDriverVanStyle';s.textContent=`
 .nwtbDriverVanShell{position:relative;transform-origin:50% 58%;filter:drop-shadow(0 3px 5px rgba(15,23,42,.34));will-change:transform;pointer-events:none}
 .nwtbDriverVanShell.desktop{width:82px;height:54px}.nwtbDriverVanShell.mobile{width:58px;height:40px}
 .nwtbDriverVanBody{position:absolute;left:5px;top:9px;width:60px;height:34px;background:linear-gradient(180deg,#fff,#eef2f6);border:2.5px solid #17202a;border-radius:7px 5px 5px 7px;overflow:hidden;box-sizing:border-box}
 .mobile .nwtbDriverVanBody{left:4px;top:8px;width:40px;height:24px;border-width:2px;border-radius:6px 4px 4px 6px}
 .nwtbDriverVanCab{position:absolute;left:56px;top:16px;width:22px;height:25px;background:#fff;border:2.5px solid #17202a;border-left:0;border-radius:0 8px 5px 0;box-sizing:border-box}
 .mobile .nwtbDriverVanCab{left:40px;top:13px;width:15px;height:19px;border-width:2px;border-left:0;border-radius:0 6px 4px 0}
 .nwtbDriverVanWindow{position:absolute;left:4px;top:4px;width:11px;height:8px;background:#bfdbfe;border:1.5px solid #17202a;border-radius:2px;box-sizing:border-box}.mobile .nwtbDriverVanWindow{left:3px;top:3px;width:8px;height:6px;border-width:1px}
 .nwtbDriverVanWheel{position:absolute;width:12px;height:12px;border-radius:50%;background:#17202a;border:2px solid #fff;top:38px;box-sizing:border-box}.nwtbDriverVanWheel.a{left:14px}.nwtbDriverVanWheel.b{left:59px}
 .mobile .nwtbDriverVanWheel{width:9px;height:9px;top:29px;border-width:1.5px}.mobile .nwtbDriverVanWheel.a{left:10px}.mobile .nwtbDriverVanWheel.b{left:42px}
 .nwtbDriverVanLogo{position:absolute;left:8px;top:5px;width:42px;height:23px;object-fit:contain}.mobile .nwtbDriverVanLogo{display:none}
 .nwtbDriverVanText{display:none;position:absolute;color:#f58220;font:950 italic 10px/1 Arial,sans-serif;letter-spacing:-.55px;left:4px;top:5px}.mobile .nwtbDriverVanText{display:block}
 .nwtbDriverLiveDot{position:absolute;right:-5px;top:-5px;width:10px;height:10px;border-radius:50%;background:#22c55e;border:2px solid #fff;box-shadow:0 0 0 0 rgba(34,197,94,.48);animation:nwtbDriverLivePulse 1.7s infinite}.mobile .nwtbDriverLiveDot{width:8px;height:8px;right:-4px;top:-4px}
 @keyframes nwtbDriverLivePulse{70%{box-shadow:0 0 0 10px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
 `;document.head.appendChild(s)
}

function vanIcon(heading){
 ensureStyle();
 const mobile=smallScreen(),cls=mobile?'mobile':'desktop',w=mobile?66:94,h=mobile?50:66,angle=Number.isFinite(Number(heading))?Number(heading):0;
 const html=`<div class="nwtbDriverVanShell ${cls}" style="transform:rotate(${angle}deg)"><div class="nwtbDriverVanBody"><img class="nwtbDriverVanLogo" src="nwt-logo.svg" alt="NWTB"><span class="nwtbDriverVanText">NWTB</span></div><div class="nwtbDriverVanCab"><span class="nwtbDriverVanWindow"></span></div><span class="nwtbDriverVanWheel a"></span><span class="nwtbDriverVanWheel b"></span><span class="nwtbDriverLiveDot"></span></div>`;
 return L.divIcon({className:'',html,iconSize:[w,h],iconAnchor:[w/2,h/2],popupAnchor:[0,-h/2]})
}

function install(){
 if(!window.L||typeof L.circleMarker!=='function')return false;
 if(window.__nwtbDriverVanInstalled)return true;
 window.__nwtbDriverVanInstalled=true;ensureStyle();
 const original=L.circleMarker.bind(L);
 L.circleMarker=function(latlng,opts){
   const o=opts||{};
   if(o.className==='nwtb-near-ring')return original(latlng,opts);
   const isDriver=Number(o.radius)===9&&Number(o.weight)===4&&Number(o.fillOpacity)===1;
   if(!isDriver)return original(latlng,opts);
   const start=point(latlng);if(good(start))lastPoint=start;
   const m=L.marker(latlng,{icon:vanIcon(lastHeading),zIndexOffset:1000,keyboard:false});
   const nativeSet=m.setLatLng.bind(m);
   m.setLatLng=function(next){
     const p=point(next);
     if(good(p)){
       if(good(lastPoint)&&meters(lastPoint,p)>=HEADING_MOVE_M){const b=bearing(lastPoint,p);if(Number.isFinite(b))lastHeading=smoothHeading(lastHeading,b);lastPoint=p}
       else if(!good(lastPoint))lastPoint=p;
       try{this.setIcon(vanIcon(lastHeading))}catch{}
     }
     return nativeSet(next)
   };
   return m
 };
 return true
}
let tries=0;const timer=setInterval(()=>{if(install()||++tries>120)clearInterval(timer)},50);
})();