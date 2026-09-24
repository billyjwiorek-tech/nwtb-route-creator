(()=>{
'use strict';
function install(){
 if(!window.L||!L.circleMarker||window.__nwtbNavVanOverlayInstalled)return false;
 window.__nwtbNavVanOverlayInstalled=true;
 const original=L.circleMarker;
 const rad=x=>x*Math.PI/180,deg=x=>x*180/Math.PI;
 function meters(a,b){if(!a||!b)return Infinity;const R=6371008.8,dLat=rad(b.lat-a.lat),dLon=rad(b.lng-a.lng),x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
 function bearing(a,b){const y=Math.sin(rad(b.lng-a.lng))*Math.cos(rad(b.lat));const x=Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lng-a.lng));const v=(deg(Math.atan2(y,x))+360)%360;return Number.isFinite(v)?v:0}
 function smoothHeading(current,target){const d=((target-current+540)%360)-180;return (current+d*.48+360)%360}
 function mobile(){return window.matchMedia&&window.matchMedia('(max-width:720px)').matches}
 function addStyle(){if(document.getElementById('nwtbDriverVanStyle'))return;const s=document.createElement('style');s.id='nwtbDriverVanStyle';s.textContent=`
 .nwtbDriverVan{position:relative;transform-origin:50% 58%;filter:drop-shadow(0 3px 5px rgba(15,23,42,.38));will-change:transform;pointer-events:none}.nwtbDriverVan.desktop{width:82px;height:54px}.nwtbDriverVan.mobile{width:58px;height:40px}
 .nwtbDriverVan .body{position:absolute;left:5px;top:9px;width:60px;height:34px;background:linear-gradient(180deg,#fff,#eef2f6);border:2.5px solid #17202a;border-radius:7px 5px 5px 7px;overflow:hidden;box-sizing:border-box}.nwtbDriverVan.mobile .body{left:4px;top:8px;width:40px;height:24px;border-width:2px}
 .nwtbDriverVan .cab{position:absolute;left:56px;top:16px;width:22px;height:25px;background:#fff;border:2.5px solid #17202a;border-left:0;border-radius:0 8px 5px 0;box-sizing:border-box}.nwtbDriverVan.mobile .cab{left:40px;top:13px;width:15px;height:19px;border-width:2px;border-left:0;border-radius:0 6px 4px 0}
 .nwtbDriverVan .window{position:absolute;left:4px;top:4px;width:11px;height:8px;background:#bfdbfe;border:1.5px solid #17202a;border-radius:2px;box-sizing:border-box}.nwtbDriverVan.mobile .window{left:3px;top:3px;width:8px;height:6px;border-width:1px}
 .nwtbDriverVan .wheel{position:absolute;width:12px;height:12px;border-radius:50%;background:#17202a;border:2px solid #fff;top:38px;box-sizing:border-box}.nwtbDriverVan.mobile .wheel{width:9px;height:9px;top:29px;border-width:1.5px}.nwtbDriverVan .w1{left:14px}.nwtbDriverVan .w2{left:59px}.nwtbDriverVan.mobile .w1{left:10px}.nwtbDriverVan.mobile .w2{left:42px}
 .nwtbDriverVan .logo{position:absolute;left:7px;top:5px;width:43px;height:23px;object-fit:contain}.nwtbDriverVan.mobile .logo{display:none}.nwtbDriverVan .text{display:none;position:absolute;left:4px;top:5px;color:#f58220;font:950 italic 10px/1 Arial,sans-serif;letter-spacing:-.5px}.nwtbDriverVan.mobile .text{display:block}
 .nwtbDriverVan .dot{position:absolute;right:-5px;top:-5px;width:10px;height:10px;border-radius:50%;background:#22c55e;border:2px solid #fff;box-shadow:0 0 0 0 rgba(34,197,94,.48);animation:nwtbDriverLivePulse 1.7s infinite}.nwtbDriverVan.mobile .dot{width:8px;height:8px;right:-4px;top:-4px}@keyframes nwtbDriverLivePulse{70%{box-shadow:0 0 0 10px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
 `;document.head.appendChild(s)}
 function icon(heading){addStyle();const m=mobile(),w=m?66:94,h=m?50:66,cls=m?'mobile':'desktop';const angle=(Number(heading||0)-90+360)%360;return L.divIcon({className:'',html:`<div class="nwtbDriverVan ${cls}" style="transform:rotate(${angle}deg)"><div class="body"><img class="logo" src="nwt-logo.svg" alt="NWTB"><span class="text">NWTB</span></div><div class="cab"><span class="window"></span></div><span class="wheel w1"></span><span class="wheel w2"></span><span class="dot"></span></div>`,iconSize:[w,h],iconAnchor:[w/2,h/2]})}
 L.circleMarker=function(latlng,opts={}){
  const isNavPosition=Number(opts?.radius)===9&&Number(opts?.weight)===4&&Number(opts?.fillOpacity)===1&&!opts?.className;
  if(!isNavPosition)return original.call(this,latlng,opts);
  let heading=0,prev=L.latLng(latlng);const marker=L.marker(latlng,{icon:icon(heading),zIndexOffset:1200,keyboard:false});const nativeSet=marker.setLatLng.bind(marker);
  marker.setLatLng=function(next){const n=L.latLng(next);if(meters(prev,n)>=3){heading=smoothHeading(heading,bearing(prev,n));this.setIcon(icon(heading));prev=n}return nativeSet(n)};
  return marker
 };
 return true
}
let tries=0;const t=setInterval(()=>{if(install()||++tries>100)clearInterval(t)},50);
})();