import { validPoint, distance, reviewedReference, vehicleProfile, calculateRoute, staticFallback } from './routing.mjs';
const ORIGIN='https://billyjwiorek-tech.github.io',UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEPOTS={BOLINGBROOK:{lat:41.682487,lon:-88.072262},PALATINE:{lat:42.148326,lon:-88.033080}};
export function returnDestination(r){
 if(r.route_mode==='CUSTOM'&&r.end_mode==='LAST_STOP')return null;
 if(r.route_mode==='CUSTOM'&&r.end_mode==='SAME_AS_START'&&validPoint({lat:r.start_lat,lon:r.start_lon}))return {lat:Number(r.start_lat),lon:Number(r.start_lon)};
 if(validPoint({lat:r.end_lat,lon:r.end_lon}))return {lat:Number(r.end_lat),lon:Number(r.end_lon)};
 if(validPoint({lat:r.start_lat,lon:r.start_lon}))return {lat:Number(r.start_lat),lon:Number(r.start_lon)};
 return DEPOTS[r.depot]||DEPOTS.BOLINGBROOK;
}
export function createNavigationHandler({db,providerKey,vehicle={},fetcher=fetch,clock=Date.now}){
 const limits=new Map();let purgeAt=0;
 const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'content-type, x-nwtb-session, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Max-Age':'600','Cache-Control':'no-store','Content-Type':'application/json','Vary':'Origin'};
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 const checked=async q=>{const result=await q;if(result.error)throw Error('DATABASE_UNAVAILABLE');return result.data;};
 async function context(employee,input){
  let q=db.from('delivery_routes').select('id,driver_employee_number,status,released_to_driver,updated_at,paused_at,resumed_at,depot,route_mode,end_mode,end_lat,end_lon,start_lat,start_lon').eq('driver_employee_number',employee).eq('status','ACTIVE');
  if(input.route_id){if(!UUID.test(input.route_id))return null;q=q.eq('id',input.route_id);}
  const routes=await checked(q.limit(2));if(routes.length!==1)return null;const r=routes[0];
  if(!r.released_to_driver||r.paused_at&&(!r.resumed_at||Date.parse(r.paused_at)>Date.parse(r.resumed_at)))return null;
  const stops=await checked(db.from('delivery_route_stops').select('id,delivery_orders(lat,lon)').eq('route_id',r.id).eq('status','PENDING').order('stop_sequence').limit(1));
  const stop=stops[0],target=stop?stop.delivery_orders:returnDestination(r);
  // Preserve the Driver's existing address-geocoding fallback for its explicitly identified next stop.
  const geocodedOwnStop=!!stop&&input.stop_id===stop.id&&!validPoint(target);
  if(!geocodedOwnStop&&(!validPoint(target)||distance(target,input.destination)>30)||input.stop_id&&input.stop_id!==stop?.id)return null;
  return {route:r,stop_id:stop?.id||null,target_kind:stop?'STOP':'RETURN'};
 }
 async function record(ctx,data){
  const routing=data.routing;
  const {error}=await db.from('nwtb_navigation_audit').insert({route_id:ctx.route.id,driver_employee_number:ctx.route.driver_employee_number,stop_id:ctx.stop_id,target_kind:ctx.target_kind,source:data.source,traffic_aware:data.traffic_aware,calculated_at:routing.calculated_at,decision:routing.decision,vehicle_profile:routing.vehicle_profile,heading_used:routing.heading_used,saving_seconds:routing.saving_seconds,alternatives:routing.alternatives});
  if(!error&&clock()-purgeAt>3600000){purgeAt=clock();await db.from('nwtb_navigation_audit').delete().lt('calculated_at',new Date(clock()-14*86400000).toISOString());}
  return !error;
 }
 return async req=>{
  if(req.headers.get('origin')&&req.headers.get('origin')!==ORIGIN)return json({error:'NWTB origin required.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return json({error:'POST required.'},405);
  try{
   const token=req.headers.get('x-nwtb-session');if(!token||!UUID.test(token))return json({error:'Navigation sign-in required.'},401);
   const session=await checked(db.from('chat_sessions').select('employee_number,expires_at,employees(active)').eq('token',token).gt('expires_at',new Date(clock()).toISOString()).maybeSingle());
   if(!session?.employees?.active)return json({error:'Navigation session expired.'},401);
   const raw=await req.text();if(raw.length>150000)return json({error:'Navigation request too large.'},413);
   let input;try{input=JSON.parse(raw);}catch{return json({error:'Invalid navigation request.'},400);}
   if(input?.action!=='route'||!validPoint(input.origin)||!validPoint(input.destination))return json({error:'Valid route endpoints are required.'},400);
   const desk=session.employee_number==='9998';
   if(!desk){const role=await checked(db.from('nwtb_delivery_roles').select('role,active').eq('employee_number',session.employee_number).maybeSingle());if(role?.role!=='DRIVER'||!role.active)return json({error:'Active Driver role required.'},403);}
   const now=clock(),limit=limits.get(session.employee_number);if(limit&&now-limit.at<60000&&limit.count>=(desk?180:30))return json({error:'Wait briefly before another route calculation.'},429);
   limits.set(session.employee_number,!limit||now-limit.at>=60000?{at:now,count:1}:{at:limit.at,count:limit.count+1});if(limits.size>500)for(const[k,v]of limits)if(now-v.at>60000)limits.delete(k);
   const ctx=desk?null:await context(session.employee_number,input);if(!desk&&!ctx)return json({error:'The assigned route or next stop changed. Refresh the route.',code:'ROUTE_CHANGED'},409);
   let reference,profile;try{reference=reviewedReference(input.reference,input.origin,input.destination);profile=vehicleProfile(vehicle);}catch(e){return json({error:e.message==='VEHICLE_PROFILE_NOT_CONFIGURED'?'Vehicle routing profile requires configuration.':'The current road route needs a fresh calculation.',code:e.message},e.message==='VEHICLE_PROFILE_NOT_CONFIGURED'?503:400);}
   if(input.purpose==='traffic'&&!reference)return json({error:'Current road route is required for a traffic reassessment.',code:'INVALID_REFERENCE_ROUTE'},400);
   const heading=typeof input.heading==='number'&&Number.isFinite(input.heading)&&input.heading>=0&&input.heading<360?input.heading:undefined;
   let result;
   try{result=await calculateRoute({origin:input.origin,destination:input.destination,heading,reference,profile,providerKey,fetcher,clock,signal:req.signal});if(input.purpose==='off_route')result.routing.decision='OFF_ROUTE_REROUTE';}
   catch{
    if(input.purpose==='traffic'||profile.travelMode!=='car'||req.signal.aborted)return json({error:'Live traffic routing is unavailable. Keep the current route until a fresh calculation is available.',code:'TRAFFIC_UNAVAILABLE'},503);
    try{result=await staticFallback({origin:input.origin,destination:input.destination,fetcher,clock,signal:req.signal});}catch{return json({error:'Navigation routing is temporarily unavailable.',code:'ROUTING_UNAVAILABLE'},503);}
   }
   if(ctx){const fresh=await context(session.employee_number,input);if(!fresh||fresh.route.id!==ctx.route.id||fresh.stop_id!==ctx.stop_id||fresh.route.updated_at!==ctx.route.updated_at)return json({error:'The assigned route changed during calculation. Refresh it.',code:'ROUTE_CHANGED'},409);
    result.routing.audit_saved=await record(ctx,result);result.route_id=ctx.route.id;result.stop_id=ctx.stop_id;
   }
   return json(result);
  }catch{return json({error:'Navigation service is temporarily unavailable.'},503);}
 };
}
