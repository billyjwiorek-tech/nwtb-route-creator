import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficeMapHandler } from '../supabase/functions/nwtb-office-map/handler.mjs';
import { officeConfigProblem, selectDestination, gpsProblem } from '../supabase/functions/nwtb-office-map/policy.mjs';

const now = Date.parse('2026-10-21T14:30:00Z');
const config = { environment: 'PRODUCTION', projectRef: 'ufnjyidhxuytrmbjzgtu', backendUrl: 'https://ufnjyidhxuytrmbjzgtu.supabase.co', siteOrigin: 'https://billyjwiorek-tech.github.io' };
const active = { id: 'fixture-route', driver_employee_number: '9001', status: 'ACTIVE', depot: 'BOLINGBROOK', end_mode: 'RETURN_DEPOT', returned_at: null, returning_started_at: null };
const point = { driver_employee_number: '9001', lat: 41.7, lon: -88.05, accuracy_m: 10, captured_at: new Date(now).toISOString() };
const stop = { id: 'fixture-stop', route_id: active.id, stop_sequence: 1, status: 'PENDING', delivery_orders: { customer_name: 'Fixture Pickup', address: 'Fixture physical address', lat: 41.8, lon: -88.1 } };

function fixture(options = {}) {
  const tables = { employees: [{ employee_number: '9001', active: true }], chat_sessions: [{ token: 'fixture-office', employee_number: options.employee || '9998', expires_at: new Date(now + 86400000).toISOString(), employees: { active: true } }], delivery_routes: [{ ...active, ...options.route }], delivery_driver_locations: [{ ...point, ...options.point }], delivery_route_stops: [{ ...stop }] };
  const requests = [], queries = []; let providerCalls = 0, writes = 0;
  const db = { from(table) {
    const predicates = [], q = { table, limitCount: null, single: false, orderBy: null,
      select() { return q; }, eq(key, value) { predicates.push(row => row[key] === value); return q; },
      gt(key, value) { predicates.push(row => row[key] > value); return q; }, order(key, opts = {}) { q.orderBy = [key, opts.ascending !== false]; return q; }, limit(n) { q.limitCount = n; return q; }, maybeSingle() { q.single = true; return q; },
      insert() { writes++; throw Error('No writes permitted'); }, update() { writes++; throw Error('No writes permitted'); }, delete() { writes++; throw Error('No writes permitted'); },
      then(resolve, reject) { try { queries.push(table); if (options.dbError === table) return resolve({ error: { message: 'Fixture failure' }, data: null }); let rows = (tables[table] || []).filter(row => predicates.every(p => p(row))); if (q.orderBy) { const [key, asc] = q.orderBy; rows = rows.toSorted((a,b) => String(a[key]).localeCompare(String(b[key])) * (asc ? 1 : -1)); } if (q.limitCount !== null) rows = rows.slice(0, q.limitCount); return resolve({ data: q.single ? rows[0] || null : rows, error: null }); } catch (error) { return reject(error); } }
    }; return q;
  } };
  const fetcher = async (url, init) => {
    providerCalls++; const u = new URL(url); requests.push({ url: u, init });
    if(u.origin==='https://photon.komoot.io') return new Response(JSON.stringify({features:options.businessFeatures||[]}));
    assert.equal(u.origin, 'https://api.tomtom.com'); assert.equal(u.searchParams.get('key'), 'fixture-provider-key');
    assert.equal(init.headers['x-nwtb-session'], undefined); assert.equal(init.headers.apikey, undefined);
    if (options.providerError) throw Error('Fixture provider failure');
    if (options.changeDuringRequest) options.changeDuringRequest(tables);
    if (u.pathname.includes('/traffic/')) return new Response(new Uint8Array([137,80,78,71,13,10,26,10]), { headers: { 'content-type': options.badTile ? 'text/html' : 'image/png' } });
    return new Response(JSON.stringify(options.providerPayload || { routes: [{ summary: { lengthInMeters: 16093.44, travelTimeInSeconds: 900, trafficDelayInSeconds: 120 } }] }), { headers: { 'content-type': 'application/json' } });
  };
  const handle = createOfficeMapHandler({ db, config: { ...config, ...options.config }, providerKey: options.providerKey === undefined ? 'fixture-provider-key' : options.providerKey, fetcher, clock: () => now });
  const call = async (body, extra = {}) => {
    const request = new Request(config.backendUrl + '/functions/v1/nwtb-office-map', { method: 'POST', headers: { origin: config.siteOrigin, 'content-type': 'application/json', 'x-nwtb-session': 'fixture-office', ...extra.headers }, body: JSON.stringify(body) });
    const response = await handle(request); return { status: response.status, body: await response.json() };
  };
  return { tables, call, handle, requests, queries, get providerCalls() { return providerCalls; }, get writes() { return writes; } };
}

test('production map service refuses Universal, staging projects, URL and origin mismatches', () => {
 assert.equal(officeConfigProblem(config), null);
 for (const bad of [{environment:'STAGING'}, {projectRef:'khvhcmncwzywqowfodnb'}, {projectRef:'abcdefghijklmnopqrst'}, {backendUrl:'https://khvhcmncwzywqowfodnb.supabase.co'}, {siteOrigin:'https://universal.example'}]) assert.ok(officeConfigProblem({...config,...bad}));
});

test('destination follows stop sequence, then the actual return depot or custom endpoint', () => {
  const later = { ...stop, id: 'second', stop_sequence: 2, delivery_orders: { ...stop.delivery_orders, customer_name: 'Second' } };
  const rows = [later, { ...stop, status: 'DELIVERED' }];
  assert.equal(selectDestination(active, rows).name, 'Second');
  const returning = { ...active, returning_started_at: new Date(now).toISOString() };
  assert.equal(selectDestination(returning, []).name, 'NWTB Bolingbrook');
  assert.equal(selectDestination({ ...returning, depot: 'PALATINE' }, []).lat, 42.148326);
  assert.equal(selectDestination({ ...returning, end_mode: 'CUSTOM', end_name: 'Fixture return', end_lat: 41.9, end_lon: -88.2 }, []).name, 'Fixture return');
  assert.equal(selectDestination({ ...returning, end_mode: 'SAME_AS_START', start_name: 'Fixture start', start_lat: 41.9, start_lon: -88.2 }, []).lat, 41.9);
  for (const route of [{ ...active, status: 'PLANNED' }, { ...returning, returned_at: new Date(now).toISOString() }]) assert.equal(selectDestination(route, []).problem, 'NO_ACTIVE_ROUTE');
  assert.equal(selectDestination({ ...returning, end_mode: 'LAST_STOP' }, []).problem, 'NO_CURRENT_DESTINATION');
  assert.equal(selectDestination(active, [{ ...stop, delivery_orders: { lat: null, lon: -88 } }]).problem, 'DESTINATION_UNAVAILABLE');
});

test('GPS rejects missing, blank, non-finite, future, stale and inaccurate positions', () => {
  assert.equal(gpsProblem(point, now), null);
  for (const p of [{ lat: null }, { lat: '' }, { lon: Infinity }, { lat: 0, lon: 0 }]) assert.equal(gpsProblem({ ...point, ...p }, now), 'GPS_UNAVAILABLE');
  for (const age of [-16000, 120001, 17 * 3600000]) assert.equal(gpsProblem({ ...point, captured_at: new Date(now - age).toISOString() }, now), 'GPS_STALE');
  assert.equal(gpsProblem({ ...point, accuracy_m: 501 }, now), 'GPS_INACCURATE');
});

test('Office auth and NWTB guards reject unauthorized requests without provider access', async () => {
  let f = fixture({ employee: '9001' }); assert.equal((await f.call({ action: 'driver_eta', driver_employee_number: '9001' })).status, 403); assert.equal(f.providerCalls, 0);
  f = fixture(); assert.equal((await f.call({ action: 'config' }, { headers: { 'x-nwtb-session': '' } })).status, 401);
  assert.equal((await f.call({ action: 'config' }, { headers: { origin: 'https://other.example' } })).status, 403);
  f = fixture({ config: { environment: 'STAGING' } }); assert.equal((await f.call({ action: 'config' })).status, 503); assert.equal(f.queries.length, 0);
  f = fixture(); for (const value of ['7480x', '9998', '', 'abc']) assert.equal((await f.call({ action: 'driver_eta', driver_employee_number: value })).status, 400);
  assert.equal(f.providerCalls, 0); assert.equal(f.writes, 0);
});

test('configured ETA uses live traffic, returns arrival and preserves every stored record', async () => {
  const f = fixture(), before = JSON.stringify(f.tables);
  const result = await f.call({ action: 'driver_eta', driver_employee_number: '9001', lat: 0, lon: 0, destination: { lat: 0, lon: 0 } });
  assert.equal(result.status, 200); assert.equal(result.body.available, true); assert.equal(result.body.traffic_aware, true);
  assert.equal(result.body.minutes, 15); assert.equal(result.body.arrival_at, '2026-10-21T14:45:00.000Z'); assert.equal(result.body.miles, 10); assert.equal(result.body.destination.name, 'Fixture Pickup'); assert.equal(result.body.traffic_delay_seconds, 120);
  assert.equal(f.requests[0].url.searchParams.get('traffic'), 'true'); assert.equal(f.requests[0].url.searchParams.get('departAt'), 'now');
  assert.ok(f.requests[0].url.pathname.includes('41.7,-88.05:41.8,-88.1')); assert.equal(JSON.stringify(f.tables), before); assert.equal(f.writes, 0);
  await f.call({ action: 'driver_eta', driver_employee_number: '9001' }); assert.equal(f.providerCalls, 1, 'Repeated popup refreshes reuse bounded traffic estimate after rechecking destination');
});

test('return ETA points to Palatine, not a default Bolingbrook depot', async () => {
  const f = fixture({ route: { depot: 'PALATINE', returning_started_at: new Date(now).toISOString() } }); f.tables.delivery_route_stops = [];
  const { body } = await f.call({ action: 'driver_eta', driver_employee_number: '9001' });
  assert.equal(body.destination.kind, 'RETURN_TO_NWTB'); assert.equal(body.destination.name, 'NWTB Palatine'); assert.ok(f.requests[0].url.pathname.includes('42.148326,-88.03308'));
});

test('no estimate for stale GPS, no active route, paused route or missing traffic key', async () => {
  for (const [options, code] of [[{ point: { captured_at: new Date(now - 17 * 3600000).toISOString() } }, 'GPS_STALE'], [{ route: { status: 'PLANNED' } }, 'NO_ACTIVE_ROUTE'], [{ route: { paused_at: new Date(now).toISOString() } }, 'ROUTE_PAUSED'], [{ providerKey: '' }, 'TRAFFIC_NOT_CONFIGURED']]) {
    const f = fixture(options), { body } = await f.call({ action: 'driver_eta', driver_employee_number: '9001' });
    assert.equal(body.available, false); assert.equal(body.code, code); assert.equal(body.arrival_at, undefined); assert.equal(f.providerCalls, 0);
  }
});

test('traffic outage and malformed result fail closed without OSRM fallback', async () => {
  for (const options of [{ providerError: true }, { providerPayload: { routes: [] } }, { providerPayload: { routes: [{ summary: { lengthInMeters: 10, travelTimeInSeconds: -5 } }] } }]) {
    const f = fixture(options), { body } = await f.call({ action: 'driver_eta', driver_employee_number: '9001' });
    assert.equal(body.available, false); assert.equal(body.code, 'TRAFFIC_UNAVAILABLE'); assert.equal(body.traffic_aware, undefined); assert.equal(f.providerCalls, 1);
  }
});

test('a completed stop or changed route during provider request invalidates its ETA', async () => {
  for (const change of [t => { t.delivery_route_stops[0].status = 'DELIVERED'; t.delivery_routes[0].returning_started_at = new Date(now).toISOString(); }, t => { t.delivery_routes[0].paused_at = new Date(now).toISOString(); }]) {
    const f = fixture({ changeDuringRequest: change }), { body } = await f.call({ action: 'driver_eta', driver_employee_number: '9001' });
    assert.equal(body.available, false); assert.ok(['ROUTE_CHANGED', 'ROUTE_PAUSED'].includes(body.code)); assert.equal(body.arrival_at, undefined);
  }
});

test('authenticated traffic tiles validate coordinates, cache briefly and never disclose provider key', async () => {
  const f = fixture();
  const tile = (x = '1', z = '2') => f.handle(new Request(config.backendUrl + '/functions/v1/nwtb-office-map?action=flow_tile&z=' + z + '&x=' + x + '&y=1', { headers: { origin: config.siteOrigin, 'x-nwtb-session': 'fixture-office' } }));
  let response = await tile(); assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png'); assert.equal(response.headers.get('x-nwtb-traffic-fetched-at'), new Date(now).toISOString()); assert.equal((await response.arrayBuffer()).byteLength, 8);
  response = await tile(); assert.equal(f.providerCalls, 1); assert.ok(!JSON.stringify([...response.headers]).includes('fixture-provider-key'));
  for (const [x, z] of [['4','2'], ['-1','2'], ['1','21'], ['1.5','2'], ['','2']]) assert.equal((await tile(x,z)).status, 400);
  assert.equal(f.writes, 0);
});

const businessFeature={geometry:{coordinates:[-88.0662781,41.7045999]},properties:{name:'Fixture Business',street:'Fixture Street',housenumber:'123',city:'Bolingbrook',state:'Illinois',postcode:'60440',countrycode:'us',osm_key:'shop',osm_type:'N',osm_id:42}};
test('business lookup works without traffic key, preserves data and caches explicit searches',async()=>{
 const f=fixture({providerKey:'',businessFeatures:[businessFeature,businessFeature]}),before=JSON.stringify(f.tables);
 let r=await f.call({action:'business_search',q:'Fixture Business',depot:'BOLINGBROOK'});
 assert.equal(r.status,200);assert.equal(r.body.results.length,1);assert.equal(r.body.results[0].address_complete,true);assert.match(r.body.results[0].address,/123 Fixture Street/);assert.equal(r.body.results[0].source_type,'OTHER');assert.equal(r.body.results[0].source_ref,'OSM:N:42');
 await f.call({action:'business_search',q:'Fixture Business',depot:'BOLINGBROOK'});assert.equal(f.providerCalls,1);assert.equal(JSON.stringify(f.tables),before);assert.equal(f.writes,0);
});
test('public business results reject road names and invalid coordinates, and flag incomplete addresses',async()=>{
 const incomplete={...businessFeature,properties:{...businessFeature.properties,housenumber:null}};
 const f=fixture({businessFeatures:[incomplete,{...businessFeature,properties:{...businessFeature.properties,osm_key:'highway'}},{...businessFeature,geometry:{coordinates:[0,0]}}]});
 const {body}=await f.call({action:'business_search',q:'Fixture',depot:'PALATINE'});assert.equal(body.results.length,1);assert.equal(body.results[0].address_complete,false);assert.equal(body.distance_from,'NWTB Palatine');assert.equal(body.searched_near,null);
});
test('business lookup is Office-only, validates queries, and does not forward Office credentials',async()=>{
 const driver=fixture({employee:'9001'});assert.equal((await driver.call({action:'business_search',q:'Fixture'})).status,403);assert.equal(driver.providerCalls,0);
 const f=fixture();for(const q of ['', 'ab','a'.repeat(161)])assert.equal((await f.call({action:'business_search',q})).status,400);
 assert.equal((await f.call({action:'business_search',q:'Fixture',depot:'OTHER'})).status,400);assert.equal(f.providerCalls,0);assert.equal(f.writes,0);
});
test('expired and inactive Office sessions cannot query business locations or traffic',async()=>{
 for(const mode of ['expired','inactive']){const f=fixture();if(mode==='expired')f.tables.chat_sessions[0].expires_at=new Date(now-1).toISOString();else f.tables.chat_sessions[0].employees.active=false;
  for(const action of ['config','business_search','driver_eta'])assert.equal((await f.call({action,q:'Fixture',driver_employee_number:'9001'})).status,401);assert.equal(f.providerCalls,0);assert.equal(f.writes,0);}
});

const candidate=(id,lat,lon,name='Fixture Business')=>({geometry:{coordinates:[lon,lat]},properties:{...businessFeature.properties,name,osm_id:id,housenumber:String(id)}});
test('no radius searches by name without a depot bias or area restriction',async()=>{
 const f=fixture({businessFeatures:[candidate(1,40.7,-74,'Fixture Business'),candidate(2,41.7,-88.07,'Fixture Business')]});
 for(const radius_miles of [undefined,null,'']){
  const {body,status}=await f.call({action:'business_search',q:"Fixture's Business",depot:'PALATINE',radius_miles});
  assert.equal(status,200);assert.equal(body.search_scope,'US_NAME');assert.equal(body.radius_miles,null);assert.equal(body.searched_near,null);assert.equal(body.results.length,2);
  assert.equal(body.results[0].source_ref,'OSM:N:1','Directory relevance order is preserved across distant branches');
 }
 const params=f.requests[0].url.searchParams;
 assert.equal(params.get('q'),"Fixture's Business");assert.equal(params.get('countrycode'),'US');assert.equal(params.get('limit'),'50');
 for(const key of ['lat','lon','zoom','bbox','location_bias_scale'])assert.equal(params.has(key),false,key+' must not bias a name-only search');
 assert.equal(f.providerCalls,1);assert.equal(f.writes,0);
});
test('radius filters the actual circle and sorts nearest first before returning results',async()=>{
 const f=fixture({businessFeatures:[candidate(4,41.7547,-88.072262),candidate(3,41.744,-87.99),candidate(2,41.73,-88.072262),candidate(1,41.70,-88.072262,'Fixture Business Nearby'),candidate(5,41.755,-88.072262)]});
 const {body,status}=await f.call({action:'business_search',q:'Fixture Business',depot:'BOLINGBROOK',radius_miles:5});
 assert.equal(status,200);assert.equal(body.search_scope,'DEPOT_RADIUS');assert.equal(body.searched_near,'NWTB Bolingbrook');assert.equal(body.radius_miles,5);
 assert.deepEqual(body.results.map(r=>r.source_ref),['OSM:N:1','OSM:N:2','OSM:N:4']);
 assert.ok(body.results.every(r=>r.distance_miles<=5));
 const u=f.requests[0].url,box=u.searchParams.get('bbox').split(',').map(Number);
 assert.ok(-87.99>box[0]&&-87.99<box[2]&&41.744>box[1]&&41.744<box[3],'The rejected corner candidate is inside the provider box but outside the circle');
 assert.equal(u.searchParams.get('lat'),'41.682487');assert.equal(u.searchParams.get('lon'),'-88.072262');assert.equal(f.writes,0);
});
test('radius uses the selected depot and separate caches for each area',async()=>{
 const f=fixture({businessFeatures:[candidate(1,41.7,-88.07),candidate(2,42.15,-88.03)]});
 const call=(depot,radius_miles)=>f.call({action:'business_search',q:'Fixture Business',depot,radius_miles});
 for(const radius of [5,10,25,50,100]){const {body}=await call('PALATINE',radius);assert.equal(body.radius_miles,radius);assert.ok(body.results.every(r=>r.distance_miles<=radius));}
 const palatine=await call('PALATINE',5);assert.deepEqual(palatine.body.results.map(r=>r.source_ref),['OSM:N:2']);
 const bolingbrook=await call('BOLINGBROOK',5);assert.deepEqual(bolingbrook.body.results.map(r=>r.source_ref),['OSM:N:1']);
 const all=await call('PALATINE',null);assert.equal(all.body.results.length,2);assert.equal(f.providerCalls,7);
 await call('PALATINE',10);await call('BOLINGBROOK','5');assert.equal(f.providerCalls,7,'String and numeric forms share only the same scope cache');assert.equal(f.writes,0);
});
test('invalid radius or inherited depot names cannot broaden a local search',async()=>{
 const f=fixture();
 for(const radius_miles of [-1,0,1,101,'bad',false,true,[],{},'Infinity'])assert.equal((await f.call({action:'business_search',q:'Fixture',radius_miles})).status,400);
 for(const depot of ['OTHER','__proto__','toString'])assert.equal((await f.call({action:'business_search',q:'Fixture',depot})).status,400);
 assert.equal(f.providerCalls,0);assert.equal(f.writes,0);
});
test('business search retains more than the previous fifteen candidates',async()=>{
 const f=fixture({businessFeatures:Array.from({length:30},(_,i)=>candidate(i+1,41.7+i/100000,-88.07))});
 const {body}=await f.call({action:'business_search',q:'Fixture Business',radius_miles:5});assert.equal(body.results.length,30);assert.equal(f.writes,0);
});
