(()=>{
'use strict';
const RESOLVER='/functions/v1/nwtb-location-resolver';
const CUSTOM='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-custom-geocoder-v2';
const DELIVERY='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-delivery';
if(window.__nwtbCustomGeocodeFetchFallback)return;
window.__nwtbCustomGeocodeFetchFallback=true;
const originalFetch=window.fetch.bind(window);
async function asJsonResponse(r){const j=await r.json().catch(()=>({error:'Invalid geocoder response'}));if(!r.ok)throw Error(j.error||'Address could not be located.');if(!Number.isFinite(Number(j?.lat))||!Number.isFinite(Number(j?.lon)))throw Error('Address did not return usable coordinates.');return new Response(JSON.stringify(j),{status:200,headers:{'content-type':'application/json'}})}
window.fetch=async function(input,init){
 const url=typeof input==='string'?input:(input&&input.url)||'';
 if(!String(url).includes(RESOLVER))return originalFetch(input,init);
 let payload={};try{payload=JSON.parse(init?.body||'{}')}catch{}
 const address=String(payload?.address||'').trim(),name=String(payload?.name||'').trim();
 if(!address)return originalFetch(input,init);
 const headers=new Headers(init?.headers||{});headers.set('content-type','application/json');
 try{
  const r=await originalFetch(CUSTOM,{method:'POST',headers,body:JSON.stringify({address,name})});
  return await asJsonResponse(r);
 }catch(customErr){
  try{
   const r=await originalFetch(input,init);
   if(r.ok)return r;
  }catch{}
  try{
   const r=await originalFetch(DELIVERY,{method:'POST',headers,body:JSON.stringify({action:'geocode',address})});
   const j=await r.json().catch(()=>({error:'Invalid geocoder response'}));
   if(!r.ok)throw Error(j.error||'Address could not be located.');
   if(!Number.isFinite(Number(j?.lat))||!Number.isFinite(Number(j?.lon)))throw Error('Address did not return usable coordinates.');
   return new Response(JSON.stringify({ok:true,lat:Number(j.lat),lon:Number(j.lon),address,matched_address:j.display_name||address,source:'DELIVERY_GEOCODE_FALLBACK'}),{status:200,headers:{'content-type':'application/json'}});
  }catch(backupErr){throw customErr?.message?customErr:backupErr}
 }
};
})();
