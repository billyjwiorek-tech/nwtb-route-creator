import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateRoute,normalizeTomTomRoute,chooseRoute,vehicleProfile,reviewedReference,MIN_SAVING_SECONDS} from '../supabase/functions/nwtb-driver-navigation/routing.mjs';
import {createNavigationHandler} from '../supabase/functions/nwtb-driver-navigation/handler.mjs';
import {origin,destination,providerRoute} from './driver-traffic-fixtures.mjs';
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
test('TomTom guidance retains exact text, highway references, roundabout exits and cumulative road timings',()=>{
 const n=normalizeTomTomRoute(providerRoute());assert.equal(n.steps[1].instruction_text,'Turn right onto Synthetic east road');assert.equal(n.steps[1].ref,'I-55');assert.equal(n.steps[2].maneuver.type,'roundabout');assert.equal(n.steps[2].maneuver.exit,2);assert.equal(n.steps.at(-1).maneuver.type,'arrive');assert.equal(n.steps.reduce((s,x)=>s+x.distance_m,0),5000);assert.equal(n.steps.reduce((s,x)=>s+x.duration_s,0),600);assert.deepEqual(n.steps[1].maneuver.location,[-88.055,41.69]);assert.equal(n.steps[1].point_index,1);
 const bad=providerRoute();bad.guidance.instructions[1].travelTimeInSeconds=-1;assert.throws(()=>normalizeTomTomRoute(bad));
 const missing=providerRoute();delete missing.guidance;assert.throws(()=>normalizeTomTomRoute(missing));
 const invalidPoint=providerRoute();invalidPoint.guidance.instructions[1].point.latitude=0;assert.throws(()=>normalizeTomTomRoute(invalidPoint));
 const unknown=providerRoute();unknown.guidance.instructions[1].maneuver='NEW_PROVIDER_CODE';assert.equal(normalizeTomTomRoute(unknown).steps[1].instruction_text,'Turn right onto Synthetic east road');
});
test('small ETA fluctuations retain the current road route; meaningful gains wait for the hold period',()=>{
 const a=normalizeTomTomRoute(providerRoute({seconds:600})),b=normalizeTomTomRoute(providerRoute({west:true,seconds:599}));
 let result=chooseRoute([a,b],{reference:true,changeAgeSeconds:600});assert.equal(result.chosen.index,0);assert.equal(result.decision,'ROUTE_RETAINED');
 result=chooseRoute([a,{...b,duration_s:400}],{reference:true,changeAgeSeconds:20});assert.equal(result.chosen.index,0);
 result=chooseRoute([a,{...b,duration_s:400}],{reference:true,changeAgeSeconds:600});assert.equal(result.chosen.index,1);assert.equal(result.decision,'TRAFFIC_REROUTE');assert.equal(result.saving,200);assert.equal(MIN_SAVING_SECONDS,120);
 result=chooseRoute([{...a,closed:true},b],{reference:true,changeAgeSeconds:0});assert.equal(result.chosen.index,1);assert.equal(result.decision,'ROAD_CLOSURE_REROUTE');
 assert.throws(()=>chooseRoute([{...a,closed:true}]),/NO_OPEN_ROUTE/);
});
test('routing requests enable current traffic, fastest time, guidance, correct heading and available highways',async()=>{
 let captured;const out=await calculateRoute({origin,destination,heading:90,providerKey:'fixture-key',fetcher:async(url,options)=>{captured={url:new URL(url),options};return response({routes:[providerRoute()]});}});
 const p=captured.url.searchParams;for(const [key,value]of Object.entries({routeType:'fastest',traffic:'true',departAt:'now',instructionsType:'text',vehicleHeading:'90',travelMode:'car',computeBestOrder:'false'}))assert.equal(p.get(key),value);
 assert.equal(p.has('avoid'),false);assert.equal(out.source,'TOMTOM');assert.equal(out.traffic_aware,true);assert.ok(out.routing.calculated_at);assert.equal(out.routing.alternatives[0].selected,true);assert.ok(!JSON.stringify(out).includes('fixture-key'));
});
test('traffic reassessment uses the remaining road path as reference and requests meaningful alternatives',async()=>{
 const points=normalizeTomTomRoute(providerRoute()).geometry;let captured;
 const out=await calculateRoute({origin,destination,reference:reviewedReference({geometry:points,change_age_s:600},origin,destination),providerKey:'fixture-key',fetcher:async(url,options)=>{captured={url:new URL(url),options};return response({routes:[providerRoute(),providerRoute({west:true,seconds:599})]});}});
 assert.equal(captured.url.searchParams.get('alternativeType'),'betterRoute');assert.equal(captured.url.searchParams.get('reconstructionMode'),'strict');assert.equal(captured.options.method,'POST');assert.equal(JSON.parse(captured.options.body).supportingPoints.length,4);assert.equal(out.routing.decision,'ROUTE_RETAINED');
 assert.throws(()=>reviewedReference({geometry:[[0,0],[0,0]]},origin,destination));
});
test('truck restrictions require complete positive dimensions and remain in the provider request',async()=>{
 assert.throws(()=>vehicleProfile({mode:'truck'}));const profile=vehicleProfile({mode:'truck',height:3,width:2.3,length:7,weight:8000});let captured;
 await calculateRoute({origin,destination,profile,providerKey:'fixture-key',fetcher:async(url)=>{captured=new URL(url);return response({routes:[providerRoute()]});}});assert.equal(captured.searchParams.get('vehicleHeight'),'3');assert.equal(captured.searchParams.get('vehicleWeight'),'8000');
});
test('initial provider failure falls back honestly to a static road route and excludes the traffic credential',async()=>{
 const {staticFallback}=await import('../supabase/functions/nwtb-driver-navigation/routing.mjs');let requested;
 const f=await staticFallback({origin,destination,fetcher:async(url)=>{requested=new URL(url);return response({code:'Ok',routes:[{distance:5000,duration:600,geometry:{coordinates:[[-88.06,41.69],[-88.04,41.70]]},legs:[{steps:[{name:'Synthetic road',distance:5000,duration:600,maneuver:{type:'depart',location:[-88.06,41.69]},geometry:{coordinates:[[-88.06,41.69],[-88.04,41.70]]}}]}]}]});}});
 assert.equal(requested.hostname,'router.project-osrm.org');assert.equal(requested.searchParams.has('key'),false);assert.equal(f.source,'OSRM');assert.equal(f.traffic_aware,false);assert.equal(f.routing.decision,'NO_LIVE_TRAFFIC');
});
const token='40000000-0000-4000-8000-000000000001',rid='10000000-0000-4000-8000-000000000001',sid='20000000-0000-4000-8000-000000000001';
function handlerFixture(options={}){
 const writes=[],calls=[],state={route:{id:rid,driver_employee_number:'1234',status:'ACTIVE',released_to_driver:true,updated_at:'2026-10-29T12:00:00Z',depot:'BOLINGBROOK',end_lat:destination.lat,end_lon:destination.lon},stops:[{id:sid,delivery_orders:destination}]};
 Object.assign(state.route,options.route||{});if(options.returning)state.stops=[];
 const db={from(table){const filters=[];let mutation=null,payload=null;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},gt(){return q},order(){return q},limit(){return q},lt(){return q},insert(row){mutation='insert';payload=row;return q},delete(){mutation='delete';return q},maybeSingle(){return run()},then(a,b){return run().then(a,b)}};
 async function run(){if(mutation){writes.push({table,mutation,payload});return {error:null};}let data=[];
 if(table==='chat_sessions')data=options.expired?null:{employee_number:options.office?'9998':'1234',employees:{active:true}};
 if(table==='nwtb_delivery_roles')data={role:options.role||'DRIVER',active:true};
 if(table==='delivery_routes')data=filters.every(([k,v])=>state.route[k]===v)?[state.route]:[];
 if(table==='delivery_route_stops')data=state.stops;
 return {data,error:null};}return q;}};
 const handler=createNavigationHandler({db,providerKey:options.noKey?'':'fixture-key',vehicle:options.vehicle||{},clock:()=>Date.parse('2026-10-29T14:00:00Z'),fetcher:async(url,init)=>{calls.push({url:new URL(url),init});if(options.fail)throw Error('fixture private provider detail');if(options.race)state.route.status='CANCELED';return response({routes:[providerRoute()]});}});
 const request=async(input={},auth=token)=>{const r=await handler(new Request('https://fixture/navigation',{method:'POST',headers:{'x-nwtb-session':auth,origin:'https://billyjwiorek-tech.github.io','content-type':'application/json'},body:JSON.stringify({action:'route',origin,destination,route_id:rid,stop_id:options.returning?null:sid,...input})}));return {status:r.status,body:await r.json()};};
 return {request,writes,calls,state};
}
test('Driver navigation requires their own active released next stop and preserves route/POD/session state',async()=>{
 const f=handlerFixture(),r=await f.request();assert.equal(r.status,200);assert.equal(r.body.routing.audit_saved,true);assert.equal(f.writes.filter(w=>w.mutation==='insert').length,1);assert.ok(f.writes.every(w=>w.table==='nwtb_navigation_audit'));const row=f.writes[0].payload;assert.equal(row.target_kind,'STOP');assert.equal(row.stop_id,sid);for(const field of ['origin','destination','geometry','key','pin','session_token'])assert.equal(row[field],undefined);
 for(const options of [{route:{status:'PLANNED'}},{route:{released_to_driver:false}},{route:{driver_employee_number:'5678'}},{route:{paused_at:'2026-10-29T13:00:00Z'}}]){const f=handlerFixture(options);assert.equal((await f.request()).status,409);assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);}
 const geocoded=handlerFixture();geocoded.state.stops[0].delivery_orders={lat:null,lon:null};assert.equal((await geocoded.request()).status,200,'Existing Driver geocoding fallback remains available for its identified assigned stop');
 const bad=handlerFixture();assert.equal((await bad.request({destination:origin})).status,409);assert.equal((await bad.request({},'')).status,401);assert.equal((await handlerFixture({role:'ADMIN'}).request()).status,403);
});
test('return navigation uses the assigned depot and Office preview makes no routing-audit writes',async()=>{
 const f=handlerFixture({returning:true}),r=await f.request();assert.equal(r.status,200);assert.equal(f.writes[0].payload.target_kind,'RETURN');assert.equal(f.writes[0].payload.stop_id,null);assert.equal((await f.request({destination:origin})).status,409);
 const office=handlerFixture({office:true});assert.equal((await office.request()).status,200);assert.equal(office.writes.length,0);
});
test('late provider results cannot outlive a canceled or changed route',async()=>{
 const f=handlerFixture({race:true});assert.equal((await f.request()).status,409);assert.equal(f.writes.length,0);
});
test('traffic failure keeps the current route and never leaks provider details or ignores truck restrictions',async()=>{
 const ref={geometry:normalizeTomTomRoute(providerRoute()).geometry,change_age_s:600};
 for(const options of [{fail:true},{noKey:true}]){const f=handlerFixture(options),r=await f.request({purpose:'traffic',reference:ref});assert.equal(r.status,503);assert.equal(r.body.code,'TRAFFIC_UNAVAILABLE');assert.equal(r.body.traffic_aware,undefined);assert.ok(!JSON.stringify(r).includes('fixture private'));assert.equal(f.writes.length,0);}
 const f=handlerFixture({vehicle:{mode:'truck'}});assert.equal((await f.request()).status,503);assert.equal(f.calls.length,0);
});
