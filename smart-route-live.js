(()=>{
'use strict';
if(window.__nwtbSmartRouteShim)return;window.__nwtbSmartRouteShim=true;
const SMART='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-smart-route';
const oldFetch=window.fetch.bind(window);
window.fetch=async function(input,init={}){try{const url=typeof input==='string'?input:input?.url||'',method=String(init?.method||'GET').toUpperCase();if(method==='POST'&&init?.body){const body=JSON.parse(init.body);let action='';if(url.includes('/functions/v1/nwtb-delivery')&&body?.action==='route_create')action='create_route';else if(url.includes('/functions/v1/nwtb-custom-route')&&body?.action==='create_exact_custom_route')action='create_custom_route';else if(url.includes('/functions/v1/nwtb-route-priority')&&['set_priority_and_reoptimize','reoptimize_remaining'].includes(body?.action))action=body.action;if(action){const next={...body,action};return oldFetch(SMART,{...init,body:JSON.stringify(next)})}}}catch(e){console.warn('NWTB smart route shim fallback',e)}return oldFetch(input,init)};
})();