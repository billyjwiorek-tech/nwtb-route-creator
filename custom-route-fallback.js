(function(){
'use strict';
const RESOLVER='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-location-resolver';
const DELIVERY_API='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-delivery';
const $=id=>document.getElementById(id);
function validCoord(lat,lon){lat=Number(lat);lon=Number(lon);return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=20&&lat<=60&&lon>=-135&&lon<=-55}
function setMsg(text,type='info'){const e=$('customRouteMsg');if(!e)return;e.textContent=text||'';e.className='customMsg'+(text?' show '+type:'')}
function token(){return localStorage.getItem('nwtb_delivery_token')||''}
const KEY='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
async function directPost(url,payload,timeoutMs=12000){const c=new AbortController(),to=setTimeout(()=>c.abort(),timeoutMs);try{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','apikey':KEY,'x-nwtb-session':token()},body:JSON.stringify(payload),signal:c.signal,cache:'no-store'});const j=await r.json().catch(()=>({error:'Invalid server response'}));if(!r.ok)throw Error(j.error||('Request failed ('+r.status+')'));return j}finally{clearTimeout(to)}}
function install(){if(typeof window.locateCustomAddress!=='function'||!$('customAddress'))return false;window.locateCustomAddress=async function(){const address=$('customAddress')?.value.trim()||'',name=$('customName')?.value.trim()||'Custom Stop';if(!address){setMsg('Paste the full physical street address first.','err');return null}setMsg('Locating address…','info');let primaryError='';try{const j=await directPost(RESOLVER,{source_type:'OTHER',source_ref:'',name,address},14000);if(!validCoord(j.lat,j.lon))throw Error('The address did not return usable coordinates.');window.__nwtbCustomFallbackCoords={lat:Number(j.lat),lon:Number(j.lon),address:j.address||address};$('customAddress').value=j.address||address;if($('customFound'))$('customFound').textContent=j.matched_address?'Located: '+j.matched_address:'Address located successfully.';setMsg('Address located. You can add this stop to the custom route.','ok');return {lat:Number(j.lat),lon:Number(j.lon)}}catch(e){primaryError=e?.message||'Primary location service unavailable.'}
 setMsg('Primary location service unavailable. Trying backup…','info');try{const j=await directPost(DELIVERY_API,{action:'geocode',address},12000);if(!validCoord(j.lat,j.lon))throw Error('Backup geocoder returned unusable coordinates.');window.__nwtbCustomFallbackCoords={lat:Number(j.lat),lon:Number(j.lon),address};if($('customFound'))$('customFound').textContent=j.display_name?'Located by backup: '+j.display_name:'Address located by backup service.';setMsg('Address located by backup service. You can add this stop to the custom route.','ok');return {lat:Number(j.lat),lon:Number(j.lon)}}catch(e2){setMsg('Could not locate this address. '+(e2?.message||primaryError||'Verify the full street address and try again.'),'err');return null}}
 };
 return true}
let n=0;const t=setInterval(()=>{n++;if(install()||n>80)clearInterval(t)},150);if(document.readyState!=='loading')install();
})();
