(()=>{
'use strict';
if(window.__nwtbCustomAutoOptimize)return;window.__nwtbCustomAutoOptimize=true;
const launchText='Add multiple one-time addresses. Every finished route is automatically optimized when it is created.';
const subText='Review the stops below. Staging order does not control the final route — the system automatically optimizes the stop order when the route is created.';
function setText(el,text){if(el&&el.textContent!==text)el.textContent=text}
function fixText(){
 const launch=document.querySelector('#customRouteLauncher span');setText(launch,launchText);
 const modal=document.getElementById('customRouteModal');if(!modal)return;
 const subs=[...modal.querySelectorAll('.customCardSub')];if(subs[1])setText(subs[1],subText);
 const info=document.getElementById('customRouteInfo');if(info&&/Exact-order|CREATE ROUTE IN THIS ORDER/i.test(info.textContent||'')){const d=document.getElementById('driver'),w=document.getElementById('wave'),dt=document.getElementById('routeDate'),nm=d&&d.value?d.options[d.selectedIndex]?.text:'No driver selected';info.innerHTML='Optimized custom route settings: <b>'+String(nm||'')+'</b> • <b>'+String(w?.value||'CUSTOM')+'</b> • <b>'+String(dt?.value||new Date().toISOString().slice(0,10))+'</b>. The route will be optimized automatically using the selected start and end locations.'}
 const b=document.getElementById('customExactBtn');if(b){if(b.textContent!=='CREATE OPTIMIZED CUSTOM ROUTE')b.textContent='CREATE OPTIMIZED CUSTOM ROUTE';if(b.title!=='Creates and automatically optimizes this custom route.')b.title='Creates and automatically optimizes this custom route.'}
 [...modal.querySelectorAll('.customMini')].forEach(x=>{if(['↑','↓'].includes((x.textContent||'').trim())&&x.style.display!=='none')x.style.display='none'});
 const m=document.getElementById('customRouteMsg');if(m&&m.textContent){const next=m.textContent.replace(/Creating the route in your exact stop order…/gi,'Creating and optimizing the custom route…').replace(/in the exact order shown\.?/gi,'with an automatically optimized stop order.').replace(/Manual stop order preserved\.?/gi,'Stop order optimized automatically.');if(next!==m.textContent)m.textContent=next}
 const r=document.getElementById('routeMsg');if(r&&r.textContent){const next=r.textContent.replace(/Manual stop order preserved\.?/gi,'Stop order optimized automatically.');if(next!==r.textContent)r.textContent=next}
}
const originalFetch=window.fetch.bind(window);window.fetch=async function(input,init={}){try{const url=typeof input==='string'?input:input?.url||'',body=init?.body?JSON.parse(init.body):null;if(url.includes('/functions/v1/nwtb-custom-route')&&body?.action==='create_exact_custom_route'){body.route_note='Custom optimized route created from Custom Route Builder.';init={...init,body:JSON.stringify(body)}}}catch{}return originalFetch(input,init)};
const obs=new MutationObserver(()=>fixText());obs.observe(document.documentElement,{childList:true,subtree:true});setInterval(fixText,1500);fixText();
})();