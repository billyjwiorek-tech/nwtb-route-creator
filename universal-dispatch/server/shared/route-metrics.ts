export function coord(p:any){return p&&p.lat!==null&&p.lon!==null&&p.lat!==undefined&&p.lon!==undefined&&p.lat!==''&&p.lon!==''&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon))&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lon))<=180&&!(Number(p.lat)===0&&Number(p.lon)===0)}
export async function measureRoute(start:any,stops:any[],end:any|null){
 const service=stops.reduce((sum,o)=>sum+Math.max(0,Math.min(180,Number(o.service_minutes??10)||0)),0),points=[start,...stops,...(end?[end]:[])];
 const missing={estimated_miles:null,estimated_minutes:null,drive_minutes:null,service_minutes:Math.round(service),return_miles:null,return_minutes:null,traffic_aware:false,matrix_source:'UNAVAILABLE',route_geometry:null,route_leg_geometry:null};
 if(points.some(p=>!coord(p))||points.length<2||points.length>90)return missing;
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),12000);
 try{
  const coords=points.map(p=>`${Number(p.lon)},${Number(p.lat)}`).join(';');
  const response=await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&alternatives=false`,{signal:ac.signal,headers:{'User-Agent':'UniversalDispatch/3.0'}});
  if(!response.ok)return missing;const j=await response.json(),r=j?.routes?.[0];
  if(j.code!=='Ok'||!r||!Number.isFinite(Number(r.duration))||!Number.isFinite(Number(r.distance))||!Array.isArray(r.geometry?.coordinates))return missing;
  const drive=Math.round(Number(r.duration)/60),last=end?r.legs?.[r.legs.length-1]:null;
  const legs=(r.legs||[]).map((leg:any)=>({coordinates:(leg.steps||[]).flatMap((s:any)=>s.geometry?.coordinates||[]),distance_m:Number(leg.distance),duration_s:Number(leg.duration)}));
  return {estimated_miles:Number((Number(r.distance)/1609.344).toFixed(2)),estimated_minutes:drive+Math.round(service),drive_minutes:drive,service_minutes:Math.round(service),return_miles:last?Number(last.distance)/1609.344:0,return_minutes:last?Math.round(Number(last.duration)/60):0,traffic_aware:false,matrix_source:'OSRM',route_geometry:r.geometry,route_leg_geometry:legs};
 }catch{return missing}finally{clearTimeout(timer)}
}
export async function refreshRouteMetrics(db:any,routeId:string){
 const {data:r,error}=await db.from('delivery_routes').select('*').eq('id',routeId).maybeSingle();if(error||!r)return;
 const {data:rows,error:se}=await db.from('delivery_route_stops').select('stop_sequence,delivery_orders(*)').eq('route_id',routeId).order('stop_sequence');if(se)return;
 const start={lat:r.start_lat,lon:r.start_lon},end=r.end_mode==='LAST_STOP'?null:r.end_mode==='SAME_AS_START'?start:{lat:r.end_lat,lon:r.end_lon};
 const patch=await measureRoute(start,(rows||[]).map((s:any)=>s.delivery_orders),end);
 // Do not overwrite a concurrent route edit with metrics for an older stop order.
 await db.from('delivery_routes').update({...patch,updated_at:new Date().toISOString()}).eq('id',routeId).eq('updated_at',r.updated_at);
 return patch;
}

export function visibleRoute(user:any,r:any){return ['ADMIN','DISPATCH'].includes(user?.role)||user?.role==='DRIVER'&&r?.driver_user_id===user.id&&(['ACTIVE','PAUSED'].includes(r.status)||r.status==='PLANNED'&&r.released_to_driver===true)}
