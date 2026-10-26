import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficeMapHandler } from '../supabase/functions/nwtb-office-map/handler.mjs';
import { previewContext } from '../supabase/functions/nwtb-office-map/preview.mjs';

const start=Date.parse('2026-10-22T14:00:00Z'),id='11111111-1111-4111-8111-111111111111';
const config={environment:'PRODUCTION',projectRef:'ufnjyidhxuytrmbjzgtu',backendUrl:'https://ufnjyidhxuytrmbjzgtu.supabase.co',siteOrigin:'https://billyjwiorek-tech.github.io'};
const route={id,updated_at:new Date(start).toISOString(),status:'PLANNED',released_to_driver:false,depot:'BOLINGBROOK',driver_employee_number:'9001',route_mode:'MULTI_DRIVER_OPTIMIZED',end_mode:'RETURN_DEPOT',service_minutes:25};
const stops=[{id:'s1',route_id:id,stop_sequence:1,status:'PENDING',delivery_orders:{customer_name:'Fixture Pickup',address:'Fixture A',lat:41.70,lon:-88.05,stop_type:'VENDOR_PICKUP'}},{id:'s2',route_id:id,stop_sequence:2,status:'PENDING',delivery_orders:{customer_name:'Fixture Delivery',address:'Fixture B',lat:41.72,lon:-88.07,stop_type:'CUSTOMER_DELIVERY'}}];
const gps={driver_employee_number:'9001',lat:41.71,lon:-88.06,accuracy_m:8,captured_at:new Date(start).toISOString()};
function fixture(options={}){
 let now=start,writes=0;const requests=[],queries=[];
 const tables={chat_sessions:[{token:'fixture-office',employee_number:options.employee||'9998',expires_at:new Date(start+86400000).toISOString(),employees:{active:true}}],employees:[{employee_number:'9001',active:true}],delivery_routes:[{...route,...options.route}],delivery_route_stops:structuredClone(options.stops||stops),delivery_driver_locations:[{...gps,...options.gps}]};
 const db={from(table){queries.push(table);const predicates=[];let order,limit,single=false;const q={select(){return q},eq(k,v){predicates.push(row=>row[k]===v);return q},gt(k,v){predicates.push(row=>row[k]>v);return q},order(k,o={}){order=[k,o.ascending!==false];return q},limit(n){limit=n;return q},maybeSingle(){single=true;return q},insert(){writes++;throw Error('No writes')},update(){writes++;throw Error('No writes')},delete(){writes++;throw Error('No writes')},then(resolve,reject){try{let rows=(tables[table]||[]).filter(row=>predicates.every(p=>p(row)));if(order)rows=[...rows].sort((a,b)=>String(a[order[0]]).localeCompare(String(b[order[0]]))*(order[1]?1:-1));if(limit)rows=rows.slice(0,limit);return resolve({data:single?rows[0]||null:rows,error:null})}catch(e){return reject(e)}}};return q}};
 const handle=createOfficeMapHandler({db,config,providerKey:options.noKey?'':'fixture-provider-key',clock:()=>now,fetcher:async(url,init)=>{
  const u=new URL(url);requests.push({url:u,init});assert.equal(u.origin,'https://api.tomtom.com');assert.equal(init.headers['x-nwtb-session'],undefined);assert.equal(init.headers.apikey,undefined);
  if(options.outage)throw Error('Provider offline');if(options.during)await options.during(tables,()=>now,n=>{now=n});
  if(options.payload)return Response.json(options.payload);
  const count=u.pathname.split('/calculateRoute/')[1].split('/json')[0].split(':').length-1;
  return Response.json({routes:[{legs:Array.from({length:count},(_,i)=>({summary:{travelTimeInSeconds:[600,1200,900][i]||600,lengthInMeters:1000*(i+1),trafficDelayInSeconds:[60,120,0][i]||0}}))}]});
 }});
 const call=async(input={},headers={})=>{const r=await handle(new Request(config.backendUrl+'/functions/v1/nwtb-office-map',{method:'POST',headers:{origin:config.siteOrigin,'content-type':'application/json','x-nwtb-session':'fixture-office',...headers},body:JSON.stringify({action:'route_preview_eta',route_id:id,...input})}));return {status:r.status,body:await r.json()}};
 return {tables,requests,queries,call,get writes(){return writes},advance(ms){now+=ms}};
}

test('Office-only planned preview computes ordered traffic arrivals and return without any writes or GPS session',async()=>{
 const f=fixture(),before=JSON.stringify(f.tables),{status,body}=await f.call({origin:{lat:0,lon:0},destination:{lat:0,lon:0},service_minutes:0});
 assert.equal(status,200);assert.equal(body.available,true);assert.equal(body.basis,'PLANNED_DEPART_NOW');assert.equal(body.route_status,'PLANNED');assert.equal(body.source,'TOMTOM');assert.equal(body.traffic_aware,true);
 assert.deepEqual(body.arrivals.map(r=>r.id),['s1','s2','return']);assert.deepEqual(body.arrivals.map(r=>r.arrival_at),['2026-10-22T14:10:00.000Z','2026-10-22T14:45:00.000Z','2026-10-22T15:10:00.000Z']);assert.equal(body.service_seconds,1500);assert.equal(body.drive_seconds,2700);assert.equal(body.traffic_delay_seconds,180);
 assert.equal(JSON.stringify(f.tables),before);assert.equal(f.writes,0);assert.ok(!f.queries.includes('delivery_driver_locations'));assert.ok(!f.queries.includes('employees'));
 const {url,init}=f.requests[0];assert.ok(url.pathname.includes('41.682487,-88.072262:41.7,-88.05:41.72,-88.07:41.682487,-88.072262'));assert.equal(url.searchParams.get('computeBestOrder'),'false');assert.equal(url.searchParams.get('traffic'),'true');assert.equal(url.searchParams.get('departAt'),new Date(start).toISOString());
 assert.deepEqual(JSON.parse(init.body).legs.map(r=>r.routeStop.pauseTimeInSeconds),[900,600,0]);
});
test('active preview starts from existing GPS, skips completed stops and keeps the return leg active',async()=>{
 const f=fixture({route:{status:'ACTIVE'},stops:[{...stops[0],status:'DELIVERED'},stops[1]]}),{body}=await f.call();
 assert.equal(body.basis,'CURRENT_GPS');assert.equal(body.gps_captured_at,gps.captured_at);assert.deepEqual(body.arrivals.map(r=>r.id),['s2','return']);assert.equal(body.service_seconds,600);assert.ok(f.requests[0].url.pathname.includes('/41.71,-88.06:41.72,-88.07:41.682487,-88.072262/'));
 const returning=fixture({route:{status:'ACTIVE',returning_started_at:new Date(start).toISOString(),depot:'PALATINE'},stops:stops.map(s=>({...s,status:'DELIVERED'}))});
 const result=await returning.call();assert.deepEqual(result.body.arrivals.map(r=>r.id),['return']);assert.equal(result.body.arrivals[0].name,'NWTB Palatine');assert.equal(result.body.service_seconds,0);assert.ok(returning.requests[0].url.pathname.includes(':42.148326,-88.03308/json'));assert.equal(returning.tables.delivery_routes[0].status,'ACTIVE');
});
test('custom start/return and last-stop endings preserve the saved endpoint choices',async()=>{
 for(const mode of ['CUSTOM','SAME_AS_START','LAST_STOP']){
  const f=fixture({route:{route_mode:'CUSTOM',start_name:'Fixture start',start_lat:41.8,start_lon:-88.2,end_mode:mode,end_name:'Fixture end',end_lat:42.1,end_lon:-88.1}}),{body}=await f.call();
  assert.equal(body.available,true);assert.ok(f.requests[0].url.pathname.includes('/41.8,-88.2:'));
  if(mode==='LAST_STOP'){assert.deepEqual(body.arrivals.map(r=>r.id),['s1','s2']);assert.equal(JSON.parse(f.requests[0].init.body).legs.at(-1).routeStop.pauseTimeInSeconds,0)}
  else assert.ok(f.requests[0].url.pathname.endsWith(mode==='CUSTOM'?':42.1,-88.1/json':':41.8,-88.2/json'));
 }
});
test('stale, absent, inaccurate or blocked driver context cannot become a fresh active ETA',async()=>{
 for(const options of [{gps:{captured_at:new Date(start-120001).toISOString()}},{gps:{lat:null}},{gps:{accuracy_m:501}},{route:{paused_at:new Date(start).toISOString()}}]){
  const f=fixture({...options,route:{status:'ACTIVE',...options.route}}),{body}=await f.call();assert.equal(body.available,false);assert.match(body.code,/GPS_|ROUTE_PAUSED/);assert.equal(f.requests.length,0);assert.equal(f.writes,0);
 }
 const f=fixture({route:{status:'ACTIVE'}});f.tables.employees[0].active=false;assert.equal((await f.call()).body.code,'DRIVER_UNAVAILABLE');assert.equal(f.requests.length,0);
});
test('unknown/closed routes, missing saved coordinates and too many stops fail without routing or skipping stops',async()=>{
 for(const options of [{route:{status:'COMPLETED'}},{route:{route_mode:'CUSTOM'}},{route:{status:'ACTIVE',route_mode:'CUSTOM',end_mode:'SAME_AS_START'}},{route:{status:'ACTIVE',depot:'UNKNOWN'}},{stops:[stops[0],{...stops[1],delivery_orders:{...stops[1].delivery_orders,lat:null}}]},{stops:Array.from({length:152},(_,i)=>({...stops[0],id:'s'+i,stop_sequence:i+1}))}]){
  const f=fixture(options),{body}=await f.call();assert.equal(body.available,false);assert.equal(f.requests.length,0);assert.equal(f.writes,0);
 }
 const f=fixture();assert.equal((await f.call({route_id:'bad-id'})).status,400);assert.equal((await f.call({expected_updated_at:'2020-01-01T00:00:00Z'})).body.code,'ROUTE_CHANGED');assert.equal(f.requests.length,0);
});
test('driver, expired and inactive Office sessions cannot request preview estimates',async()=>{
 const driver=fixture({employee:'9001'});assert.equal((await driver.call()).status,403);assert.equal(driver.requests.length,0);assert.deepEqual(driver.queries,['chat_sessions']);
 for(const state of ['missing','expired','inactive']){const f=fixture();if(state==='expired')f.tables.chat_sessions[0].expires_at=new Date(start-1).toISOString();if(state==='inactive')f.tables.chat_sessions[0].employees.active=false;assert.equal((await f.call({},state==='missing'?{'x-nwtb-session':''}:{})).status,401);assert.equal(f.requests.length,0);assert.equal(f.writes,0)}
});
test('route changes during routing discard arrivals and never mutate the delivery lifecycle',async()=>{
 for(const change of [t=>{t.delivery_routes[0].status='COMPLETED'},t=>{t.delivery_route_stops[0].status='DELIVERED'},t=>{t.delivery_route_stops[1].stop_sequence=0},t=>{t.delivery_routes[0].driver_employee_number='9002'},t=>{t.delivery_routes[0].end_lat=42.2;t.delivery_routes[0].end_lon=-88.1}]){
  const f=fixture({during:change}),{body}=await f.call();assert.equal(body.available,false);assert.ok(['ROUTE_CHANGED','PREVIEW_ROUTE_UNAVAILABLE'].includes(body.code));assert.equal(f.writes,0);
 }
 const f=fixture({route:{status:'ACTIVE'},during:(t,now,setNow)=>{setNow(now()+125000);t.delivery_driver_locations[0].captured_at=new Date(start+125000).toISOString()}});assert.equal((await f.call()).body.code,'GPS_STALE');
});
test('bounded preview caching rechecks saved state and expires rather than reporting old traffic as new',async()=>{
 const f=fixture();const first=await f.call();await f.call();assert.equal(f.requests.length,1);f.advance(31000);const second=await f.call();assert.equal(f.requests.length,2);assert.notEqual(first.body.calculated_at,second.body.calculated_at);
 f.tables.delivery_route_stops[0].status='DELIVERED';const changed=await f.call();assert.deepEqual(changed.body.arrivals.map(r=>r.id),['s2','return']);assert.equal(f.requests.length,3);assert.equal(f.writes,0);
});
test('an explicit refresh recalculates traffic immediately instead of reusing the automatic-poll cache',async()=>{
 const f=fixture(),before=JSON.stringify(f.tables),first=(await f.call()).body;
 f.advance(1000);const automatic=(await f.call()).body;assert.equal(f.requests.length,1);assert.equal(automatic.calculated_at,first.calculated_at);
 const refreshed=(await f.call({refresh:true})).body;
 assert.equal(f.requests.length,2,'The Refresh ETA button must reach the traffic provider even inside the 30-second cache window');
 assert.equal(refreshed.calculated_at,new Date(start+1000).toISOString());assert.notEqual(refreshed.calculated_at,first.calculated_at);
 assert.equal(refreshed.cache_hit,false);assert.equal(refreshed.checked_at,refreshed.calculated_at);
 f.advance(1000);const reused=(await f.call()).body;assert.equal(f.requests.length,2);assert.equal(reused.cache_hit,true);assert.equal(reused.calculated_at,refreshed.calculated_at);assert.equal(reused.checked_at,new Date(start+2000).toISOString());
 assert.equal(JSON.stringify(f.tables),before);assert.equal(f.writes,0);
});
test('manual refresh preserves Office authorization and saved-route revision checks',async()=>{
 const f=fixture({employee:'9001'});assert.equal((await f.call({refresh:true})).status,403);assert.equal(f.requests.length,0);
 const changed=fixture();assert.equal((await changed.call({refresh:true,expected_updated_at:'2020-01-01T00:00:00Z'})).body.code,'ROUTE_CHANGED');assert.equal(changed.requests.length,0);
 const invalid=fixture();assert.equal((await invalid.call({refresh:'true'})).status,400);assert.equal(invalid.requests.length,0);
});
test('an older automatic request cannot overwrite the cache after a newer manual refresh finishes',async()=>{
 const pending=[],f=fixture({during:()=>new Promise(resolve=>pending.push(resolve))});
 const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve()};
 const automatic=f.call();await flush();assert.equal(pending.length,1);f.advance(1000);
 const manual=f.call({refresh:true});await flush();assert.equal(pending.length,2);pending[1]();const fresh=(await manual).body;
 pending[0]();const older=(await automatic).body;assert.ok(Date.parse(older.calculated_at)<Date.parse(fresh.calculated_at));
 const cached=(await f.call()).body;assert.equal(cached.calculated_at,fresh.calculated_at);assert.equal(cached.cache_hit,true);assert.equal(f.requests.length,2);assert.equal(f.writes,0);
});
test('provider outages and malformed legs cannot produce fabricated arrivals or OSRM fallback',async()=>{
 for(const options of [{noKey:true},{outage:true},{payload:{routes:[{legs:[]}]}},{payload:{routes:[{legs:Array.from({length:3},()=>({summary:{travelTimeInSeconds:-1,lengthInMeters:100}}))}]}}]){
  const f=fixture(options),{body}=await f.call();assert.equal(body.available,false);assert.ok(['TRAFFIC_NOT_CONFIGURED','TRAFFIC_UNAVAILABLE'].includes(body.code));assert.equal(body.arrivals,undefined);assert.equal(f.writes,0);
 }
 const f=fixture({payload:{routes:[{legs:Array.from({length:3},()=>({summary:{travelTimeInSeconds:60,lengthInMeters:100}}))}]}});const {body}=await f.call();assert.equal(body.available,true);assert.equal(body.traffic_delay_seconds,null);assert.ok(body.arrivals.every(r=>r.traffic_delay_seconds===null));
});
test('service allocation keeps the exact saved total even with many stops and rounding',()=>{
 for(const service_minutes of [0,1,2,35,100]){const rows=Array.from({length:150},(_,i)=>({...stops[i%2],id:'s'+i,stop_sequence:i+1}));const ctx=previewContext({...route,service_minutes},rows,null,start);assert.equal(ctx.targets.reduce((sum,p)=>sum+p.service_seconds,0),service_minutes*60);assert.ok(ctx.targets.every(p=>p.service_seconds>=0))}
});
test('legacy routes without a saved service total use explicit pickup/delivery estimates',async()=>{
 const f=fixture({route:{service_minutes:null}}),{body}=await f.call();assert.equal(body.available,true);assert.equal(body.service_seconds,25*60);assert.equal(body.service_basis,'DEFAULT_STOP_ESTIMATE');
});
