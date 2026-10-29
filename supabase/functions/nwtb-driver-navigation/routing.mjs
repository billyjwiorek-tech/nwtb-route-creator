// Provider boundary. Synthetic fixtures inject fetch; provider errors never expose URLs or keys.
export const MIN_SAVING_SECONDS = 120, MIN_SAVING_FRACTION = .10, ROUTE_HOLD_SECONDS = 180;
export const validPoint = p => p && p.lat != null && p.lon != null && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)) && Number(p.lat) >= 20 && Number(p.lat) <= 60 && Number(p.lon) >= -135 && Number(p.lon) <= -55;
const number = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const clean = (v, max = 500) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
export function distance(a,b){const p=Math.PI/180,x=(Number(b.lat)-Number(a.lat))*p,y=(Number(b.lon)-Number(a.lon))*p,z=Math.sin(x/2)**2+Math.cos(Number(a.lat)*p)*Math.cos(Number(b.lat)*p)*Math.sin(y/2)**2;return 12742017.6*Math.asin(Math.min(1,Math.sqrt(z)));}
function modifier(code, angle){if(/UTURN/.test(code))return 'uturn';if(/SHARP_LEFT/.test(code))return 'sharp left';if(/SHARP_RIGHT/.test(code))return 'sharp right';if(/BEAR_LEFT/.test(code))return 'slight left';if(/BEAR_RIGHT/.test(code))return 'slight right';if(/LEFT/.test(code))return 'left';if(/RIGHT/.test(code))return 'right';return number(angle)<0?'left':number(angle)>0?'right':'straight';}
function maneuver(i){const code=clean(i.maneuver,80),mod=modifier(code,i.turnAngleInDecimalDegrees);let type='continue';
 if(/^ARRIVE/.test(code)||i.instructionType==='LOCATION_ARRIVAL')type='arrive';else if(code==='DEPART'||i.instructionType==='LOCATION_DEPARTURE')type='depart';else if(code.startsWith('ROUNDABOUT')||i.junctionType==='ROUNDABOUT')type='roundabout';else if(/EXIT/.test(code))type='off ramp';else if(/ENTER_MOTORWAY|ENTER_FREEWAY|ENTER_HIGHWAY|ENTRANCE_RAMP/.test(code))type='on ramp';else if(code.startsWith('KEEP_')||i.junctionType==='BIFURCATION')type='fork';else if(/TURN|BEAR|SHARP/.test(code))type='turn';
 return {type,modifier:mod,...(number(i.roundaboutExitNumber)>0?{exit:number(i.roundaboutExitNumber)}:{}),location:[Number(i.point.longitude),Number(i.point.latitude)]};
}
export function normalizeTomTomRoute(raw){
 const s=raw?.summary,legs=raw?.legs;
 if(!s||!Number.isFinite(s.lengthInMeters)||s.lengthInMeters<0||!Number.isFinite(s.travelTimeInSeconds)||s.travelTimeInSeconds<0||s.travelTimeInSeconds>172800||!Array.isArray(legs)||legs.length!==1)throw Error('INVALID_PROVIDER_ROUTE');
 const geometry=(legs[0].points||[]).map(p=>[p.longitude,p.latitude]);
 if(geometry.length<2||geometry.length>20000||geometry.some(c=>!validPoint({lat:c[1],lon:c[0]})))throw Error('INVALID_PROVIDER_GEOMETRY');
 const input=raw.guidance?.instructions;
 if(!Array.isArray(input)||!input.length)throw Error('PROVIDER_GUIDANCE_UNAVAILABLE');
 let previousOffset=-1,previousSeconds=-1;
 const instructions=input.map(i=>{
  if(!validPoint({lat:i.point?.latitude,lon:i.point?.longitude}))throw Error('INVALID_PROVIDER_GUIDANCE');
  const offset=number(i.routeOffsetInMeters,-1),elapsed=number(i.travelTimeInSeconds,-1),index=number(i.pointIndex,-1);
  if(offset<previousOffset||elapsed<previousSeconds||offset<0||offset>s.lengthInMeters+10||elapsed<0||elapsed>s.travelTimeInSeconds+10||!Number.isInteger(index)||index<0||index>=geometry.length)throw Error('INVALID_PROVIDER_GUIDANCE');
  previousOffset=offset;previousSeconds=elapsed;return {...i,offset,elapsed,index};
 });
 if(!instructions.length)throw Error('PROVIDER_GUIDANCE_UNAVAILABLE');
 if(instructions[0].offset>1)instructions.unshift({maneuver:'DEPART',point:{longitude:geometry[0][0],latitude:geometry[0][1]},index:0,offset:0,elapsed:0});
 if(!/^ARRIVE/.test(instructions.at(-1).maneuver||''))instructions.push({maneuver:'ARRIVE',point:{longitude:geometry.at(-1)[0],latitude:geometry.at(-1)[1]},index:geometry.length-1,offset:s.lengthInMeters,elapsed:s.travelTimeInSeconds});
 const steps=instructions.map((i,k)=>{const next=instructions[k+1],end=next?.index??geometry.length-1;return {
  name:clean(i.street,160),ref:(i.roadNumbers||[]).map(v=>clean(v,30)).join('; '),destinations:clean(i.signpostText),exits:clean(i.exitNumber,40),driving_side:i.drivingSide==='LEFT'?'left':'right',
  instruction_text:clean(i.message),maneuver:maneuver(i),point_index:i.index,route_offset_m:i.offset,
  distance_m:next?Math.max(0,next.offset-i.offset):0,duration_s:next?Math.max(0,next.elapsed-i.elapsed):0,geometry:geometry.slice(i.index,Math.max(i.index+1,end+1))
 };});
 return {geometry,steps,distance_m:s.lengthInMeters,duration_s:s.travelTimeInSeconds,static_duration_s:number(s.noTrafficTravelTimeInSeconds,s.travelTimeInSeconds),traffic_delay_s:Math.max(0,number(s.trafficDelayInSeconds)),
  closed:(raw.sections||[]).some(section=>section.simpleCategory==='ROAD_CLOSURE'),planning_reason:clean(s.planningReason,80),roads:[...new Set(steps.flatMap(step=>step.ref?step.ref.split('; '):step.name?[step.name]:[]))].slice(0,12)};
}
export function chooseRoute(routes,{reference=false,changeAgeSeconds=0}={}){
 const candidates=routes.map((r,index)=>({...r,index})),available=candidates.filter(r=>!r.closed);
 if(!available.length)throw Error('NO_OPEN_ROUTE');
 const fastest=available.reduce((a,b)=>b.duration_s<a.duration_s?b:a);
 let chosen=fastest,decision='INITIAL_ROUTE',saving=0;
 if(reference){const current=candidates[0];saving=Math.max(0,current.duration_s-fastest.duration_s);
  if(current.closed){decision='ROAD_CLOSURE_REROUTE';}
  else if(fastest.index===0||changeAgeSeconds<ROUTE_HOLD_SECONDS||saving<Math.max(MIN_SAVING_SECONDS,current.duration_s*MIN_SAVING_FRACTION)){chosen=current;decision='ROUTE_RETAINED';}
  else decision='TRAFFIC_REROUTE';
 }
 return {chosen,decision,saving,alternatives:candidates.map(r=>({index:r.index,seconds:Math.round(r.duration_s),meters:Math.round(r.distance_m),traffic_delay_seconds:Math.round(r.traffic_delay_s),closed:r.closed,selected:r.index===chosen.index,roads:r.roads}))};
}
export function vehicleProfile(env={}){
 const mode=env.mode||'car';if(!['car','truck'].includes(mode))throw Error('VEHICLE_PROFILE_NOT_CONFIGURED');
 if(mode==='car')return {travelMode:'car'};
 const fields={vehicleHeight:env.height,vehicleWidth:env.width,vehicleLength:env.length,vehicleWeight:env.weight};
 if(Object.values(fields).some(v=>!(Number(v)>0)||!Number.isFinite(Number(v))))throw Error('VEHICLE_PROFILE_NOT_CONFIGURED');
 return {travelMode:'truck',...Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,Number(v)]))};
}
export function reviewedReference(value,origin,destination){
 if(!value)return null;const points=value.geometry;
 if(!Array.isArray(points)||points.length<2||points.length>2000||points.some(c=>!Array.isArray(c)||c.length!==2||!validPoint({lat:c[1],lon:c[0]})))throw Error('INVALID_REFERENCE_ROUTE');
 if(distance(origin,{lat:points[0][1],lon:points[0][0]})>150||distance(destination,{lat:points.at(-1)[1],lon:points.at(-1)[0]})>200)throw Error('INVALID_REFERENCE_ROUTE');
 return {points,changeAgeSeconds:Math.max(0,Math.min(86400,number(value.change_age_s)))};
}
async function fetchJson(fetcher,url,options={},signal){
 const controller=new AbortController(),cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)controller.abort();const timer=setTimeout(cancel,12000);
 try{const r=await fetcher(url,{...options,headers:{Accept:'application/json',...(options.headers||{})},signal:controller.signal});if(!r.ok)throw Error('PROVIDER_UNAVAILABLE');return await r.json();}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
export async function calculateRoute({origin,destination,heading,reference,profile={travelMode:'car'},providerKey,fetcher=fetch,clock=Date.now,signal}){
 if(!providerKey)throw Error('TRAFFIC_NOT_CONFIGURED');
 const url=new URL('https://api.tomtom.com/routing/1/calculateRoute/'+Number(origin.lat)+','+Number(origin.lon)+':'+Number(destination.lat)+','+Number(destination.lon)+'/json');
 for(const [k,v]of Object.entries({key:providerKey,routeType:'fastest',traffic:'true',departAt:'now',computeTravelTimeFor:'all',instructionsType:'text',language:'en-US',maxAlternatives:'2',routeRepresentation:'polyline',computeBestOrder:'false',...profile}))url.searchParams.set(k,String(v));
 url.searchParams.append('sectionType','traffic');url.searchParams.append('sectionType','motorway');
 if(Number.isFinite(heading)&&heading>=0&&heading<360)url.searchParams.set('vehicleHeading',String(Math.round(heading)%360));
 const options={};
 if(reference){url.searchParams.set('alternativeType','betterRoute');url.searchParams.set('reconstructionMode','strict');url.searchParams.set('supportingPointIndexOfOrigin','0');url.searchParams.set('minDeviationTime','20');options.method='POST';options.headers={'Content-Type':'application/json'};options.body=JSON.stringify({supportingPoints:reference.points.map(c=>({latitude:c[1],longitude:c[0]}))});}
 const raw=await fetchJson(fetcher,url,options,signal);if(!Array.isArray(raw.routes)||!raw.routes.length)throw Error('PROVIDER_UNAVAILABLE');
 const normalized=raw.routes.map(normalizeTomTomRoute),selection=chooseRoute(normalized,{reference:!!reference,changeAgeSeconds:reference?.changeAgeSeconds});
 const {index,closed,planning_reason,roads,...route}=selection.chosen;
 return {code:'Ok',source:'TOMTOM',traffic_aware:true,...route,routing:{source:'TOMTOM',calculated_at:new Date(clock()).toISOString(),decision:selection.decision,saving_seconds:Math.round(selection.saving),vehicle_profile:profile.travelMode,heading_used:Number.isFinite(heading)&&!reference,alternatives:selection.alternatives}};
}
export async function staticFallback({origin,destination,fetcher=fetch,clock=Date.now,signal}){
 const url='https://router.project-osrm.org/route/v1/driving/'+Number(origin.lon)+','+Number(origin.lat)+';'+Number(destination.lon)+','+Number(destination.lat)+'?alternatives=false&steps=true&geometries=geojson&overview=full';
 const data=await fetchJson(fetcher,url,{},signal),r=data.routes?.[0];
 if(data.code!=='Ok'||!r||!Array.isArray(r.geometry?.coordinates)||r.geometry.coordinates.length<2||r.geometry.coordinates.length>20000||r.geometry.coordinates.some(c=>!Array.isArray(c)||c.length!==2||!validPoint({lat:c[1],lon:c[0]}))||!Number.isFinite(r.distance)||r.distance<0||!Number.isFinite(r.duration)||r.duration<0)throw Error('PROVIDER_UNAVAILABLE');
 return {code:'Ok',source:'OSRM',traffic_aware:false,geometry:r.geometry.coordinates,distance_m:r.distance,duration_s:r.duration,static_duration_s:r.duration,traffic_delay_s:0,
  steps:(r.legs||[]).flatMap(l=>(l.steps||[]).map(s=>({name:clean(s.name),ref:clean(s.ref),destinations:clean(s.destinations),exits:clean(s.exits),driving_side:clean(s.driving_side),distance_m:number(s.distance),duration_s:number(s.duration),maneuver:s.maneuver,geometry:s.geometry?.coordinates||[]}))),
  routing:{source:'OSRM',calculated_at:new Date(clock()).toISOString(),decision:'NO_LIVE_TRAFFIC',saving_seconds:0,vehicle_profile:'car',heading_used:false,alternatives:[{index:0,seconds:Math.round(r.duration),meters:Math.round(r.distance),traffic_delay_seconds:0,selected:true,closed:false,roads:[]}]}};
}
