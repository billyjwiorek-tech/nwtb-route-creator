(()=>{
'use strict';
const RESOLVER='/functions/v1/nwtb-location-resolver';
const CUSTOM='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-custom-geocoder-v2';
const DELIVERY='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-delivery';
if(window.__nwtbCustomGeocodeFetchFallback)return;
window.__nwtbCustomGeocodeFetchFallback=true;
const originalFetch=window.fetch.bind(window);

async function callJson(url,init,body){
 const headers=new Headers(init?.headers||{});
 headers.set('content-type','application/json');
 const r=await originalFetch(url,{method:'POST',headers,body:JSON.stringify(body)});
 const j=await r.json().catch(()=>({error:'Invalid geocoder response'}));
 return {r,j};
}

window.fetch=async function(input,init){
 const url=typeof input==='string'?input:(input&&input.url)||'';
 if(!String(url).includes(RESOLVER))return originalFetch(input,init);

 let payload={};
 try{payload=JSON.parse(init?.body||'{}')}catch{}
 const address=String(payload?.address||'').trim();
 const name=String(payload?.name||'').trim();
 if(!address)return originalFetch(input,init);

 // Live Custom Route Builder: always use the dedicated multi-source geocoder first.
 // This fixes the old behavior where fetch() returned an HTTP 404 without throwing,
 // so the backup geocoder was never reached.
 try{
  const {r,j}=await callJson(CUSTOM,init,{address,name});
  if(r.ok&&Number.isFinite(Number(j?.lat))&&Number.isFinite(Number(j?.lon))){
   return new Response(JSON.stringify({
    ok:true,
    lat:Number(j.lat),
    lon:Number(j.lon),
    address:j.address||address,
    matched_address:j.matched_address||address,
    source:j.source||'NWTB_CUSTOM_GEOCODER_V2'
   }),{status:200,headers:{'content-type':'application/json'}});
  }
 }catch{}

 // Last-resort backup through the existing delivery geocoder.
 try{
  const {r,j}=await callJson(DELIVERY,init,{action:'geocode',address});
  if(r.ok&&Number.isFinite(Number(j?.lat))&&Number.isFinite(Number(j?.lon))){
   return new Response(JSON.stringify({
    ok:true,
    lat:Number(j.lat),
    lon:Number(j.lon),
    address,
    matched_address:j.display_name||address,
    source:'DELIVERY_GEOCODE_FALLBACK'
   }),{status:200,headers:{'content-type':'application/json'}});
  }
 }catch{}

 return new Response(JSON.stringify({error:`Address could not be located: ${address}`,status:'NOT_FOUND'}),{status:404,headers:{'content-type':'application/json'}});
};
})();
