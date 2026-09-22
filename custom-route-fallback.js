(function(){
'use strict';
const RESOLVER='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-location-resolver';
const DELIVERY_API='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-delivery';
const originalPost=window.post;
if(typeof originalPost!=='function')return;
window.post=async function(url,payload,need=true){
 try{return await originalPost(url,payload,need)}catch(primaryError){
  if(url!==RESOLVER)throw primaryError;
  const address=String(payload?.address||'').trim();
  if(!address)throw primaryError;
  try{
   const backup=await originalPost(DELIVERY_API,{action:'geocode',address},need);
   const lat=Number(backup?.lat),lon=Number(backup?.lon);
   if(!Number.isFinite(lat)||!Number.isFinite(lon))throw primaryError;
   return {ok:true,address,lat,lon,source:'DELIVERY_GEOCODE_FALLBACK',matched_address:backup.display_name||address};
  }catch{
   throw primaryError;
  }
 }
};
})();
