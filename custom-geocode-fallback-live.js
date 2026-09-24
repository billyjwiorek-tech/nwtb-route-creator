(()=>{
'use strict';
const RESOLVER='/functions/v1/nwtb-location-resolver';
const DELIVERY='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-delivery';
function install(){
 if(typeof window.post!=='function'||window.__nwtbCustomGeocodeFallback)return false;
 window.__nwtbCustomGeocodeFallback=true;
 const original=window.post;
 window.post=async function(url,payload,need=true){
  const isResolver=String(url||'').includes(RESOLVER);
  if(!isResolver)return original(url,payload,need);
  try{return await original(url,payload,need)}catch(primaryErr){
   try{
    const j=await original(DELIVERY,{action:'geocode',address:payload?.address||''},need);
    if(!Number.isFinite(Number(j?.lat))||!Number.isFinite(Number(j?.lon)))throw primaryErr;
    return {ok:true,lat:Number(j.lat),lon:Number(j.lon),address:payload?.address||'',matched_address:j.display_name||payload?.address||'',source:'DELIVERY_GEOCODE_FALLBACK'};
   }catch(backupErr){
    throw primaryErr?.message&&primaryErr.message!=='Failed to fetch'?primaryErr:backupErr;
   }
  }
 };
 return true;
}
let tries=0;const t=setInterval(()=>{if(install()||++tries>100)clearInterval(t)},50);
})();
