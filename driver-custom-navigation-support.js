(()=>{
'use strict';
const API='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-delivery';
const HOME={name:'Northwest Trucks - Bolingbrook',address:'201 S W Frontage Rd, Bolingbrook, IL 60440',lat:41.682487,lon:-88.072262};
const baseFetch=window.fetch.bind(window);
const good=(lat,lon)=>Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))&&Math.abs(Number(lat))>1&&Math.abs(Number(lon))>1;

async function geocode(address,init){
 if(!address)return null;
 try{
  const headers=new Headers(init?.headers||{});headers.set('content-type','application/json');
  const r=await baseFetch(API,{method:'POST',headers,body:JSON.stringify({action:'geocode',address})});
  const j=await r.json().catch(()=>null);if(!r.ok||!j||!good(j.lat,j.lon))return null;
  return {lat:Number(j.lat),lon:Number(j.lon)};
 }catch{return null}
}

async function enrichCustomRoute(j,init){
 const r=j?.route;if(!r||r.route_mode!=='CUSTOM')return j;
 if(!good(r.start_lat,r.start_lon)&&r.start_address){const g=await geocode(r.start_address,init);if(g){r.start_lat=g.lat;r.start_lon=g.lon}}
 const mode=r.end_mode||'RETURN_DEPOT';
 if(mode==='SAME_AS_START'){
  if(good(r.start_lat,r.start_lon)){r.end_lat=Number(r.start_lat);r.end_lon=Number(r.start_lon);r.end_name=r.start_name||'Custom Start';r.end_address=r.start_address||''}
 }else if(mode==='RETURN_DEPOT'){
  r.end_lat=HOME.lat;r.end_lon=HOME.lon;r.end_name=HOME.name;r.end_address=HOME.address;
 }else if(mode!=='LAST_STOP'&&!good(r.end_lat,r.end_lon)&&r.end_address){const g=await geocode(r.end_address,init);if(g){r.end_lat=g.lat;r.end_lon=g.lon}}
 return j;
}

window.fetch=async function(input,init={}){
 const r=await baseFetch(input,init);
 try{
  const url=typeof input==='string'?input:(input?.url||'');
  if(url!==API||!init?.body)return r;
  const body=typeof init.body==='string'?JSON.parse(init.body):null;
  if(body?.action!=='route_get')return r;
  const j=await r.clone().json();await enrichCustomRoute(j,init);
  return new Response(JSON.stringify(j),{status:r.status,statusText:r.statusText,headers:{'content-type':'application/json'}});
 }catch{return r}
};
})();
