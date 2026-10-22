import { DEPOTS, gpsProblem, validPoint } from './policy.mjs';

export function previewContext(route, stops, point, now) {
  if (!route || !['PLANNED', 'ACTIVE'].includes(route.status) || route.returned_at) return { problem: 'PREVIEW_ROUTE_UNAVAILABLE' };
  if (route.paused_at && (!route.resumed_at || Date.parse(route.paused_at) > Date.parse(route.resumed_at))) return { problem: 'ROUTE_PAUSED' };
  const depot = Object.hasOwn(DEPOTS, route.depot) ? DEPOTS[route.depot] : null;
  const rows = [...stops].sort((a,b) => Number(a.stop_sequence) - Number(b.stop_sequence));
  const start = validPoint({ lat: route.start_lat, lon: route.start_lon })
    ? { lat: Number(route.start_lat), lon: Number(route.start_lon), name: route.start_name || 'Route start' }
    : String(route.route_mode || '').startsWith('CUSTOM') ? null : depot;
  let end;
  switch (route.end_mode || 'RETURN_DEPOT') {
    case 'LAST_STOP': end = null; break;
    case 'SAME_AS_START': end = start; break;
    case 'RETURN_DEPOT': end = validPoint({ lat: route.end_lat, lon: route.end_lon }) ? { lat: Number(route.end_lat), lon: Number(route.end_lon), name: route.end_name || depot?.name || 'Return depot' } : depot; break;
    case 'CUSTOM': case 'FIXED': end = { lat: route.end_lat, lon: route.end_lon, name: route.end_name || 'Return destination' }; break;
    default: return { problem: 'DESTINATION_UNAVAILABLE' };
  }
  if ((route.end_mode || 'RETURN_DEPOT') !== 'LAST_STOP' && !validPoint(end)) return { problem: 'DESTINATION_UNAVAILABLE' };
  // The database stores route-level service totals. Allocate that saved estimate
  // using the route builder's pickup/delivery weights; do not rewrite its metrics.
  const weights = rows.map(s => String(s.delivery_orders?.stop_type || '').includes('PICKUP') ? 15 : 10);
  const weightTotal = weights.reduce((a,b) => a+b, 0);
  const savedService = route.service_minutes == null ? null : Number(route.service_minutes);
  const totalService = Number.isFinite(savedService) && savedService >= 0 ? Math.round(savedService * 60) : weightTotal * 60;
  let allocated = 0, weighted = 0;
  const services = rows.map((s,i) => { weighted += weights[i]; const through = Math.round(totalService*weighted/weightTotal), seconds = through-allocated; allocated = through; return seconds; });
  const targets = rows.flatMap((s,i) => {
    if (s.status !== 'PENDING') return [];
    const o = s.delivery_orders || {};
    return [{ id: String(s.id), kind: 'STOP', sequence: Number(s.stop_sequence), name: String(o.customer_name || 'Stop'), address: String(o.address || ''), lat: o.lat, lon: o.lon, service_seconds: services[i] }];
  });
  if (!targets.length && (route.status === 'PLANNED' || !route.returning_started_at)) return { problem: 'NO_CURRENT_DESTINATION' };
  if (end) targets.push({ ...end, id: 'return', kind: 'RETURN', sequence: null, address: String(route.end_address || ''), service_seconds: 0 });
  if (!targets.length) return { problem: 'NO_CURRENT_DESTINATION' };
  if (targets.length > 151) return { problem: 'PREVIEW_TOO_MANY_STOPS' };
  if (targets.some(p => !validPoint(p))) return { problem: 'DESTINATION_UNAVAILABLE' };
  let origin = start;
  if (route.status === 'ACTIVE') {
    const problem = gpsProblem(point, now); if (problem) return { problem };
    origin = { lat: Number(point.lat), lon: Number(point.lon), name: 'Latest driver GPS' };
  }
  if (!validPoint(origin)) return { problem: 'DESTINATION_UNAVAILABLE' };
  const viewStops = rows.map(s => ({ id: String(s.id), sequence: Number(s.stop_sequence), status: s.status }));
  const revision = JSON.stringify([route.id, route.updated_at, route.driver_employee_number, route.status, route.paused_at, route.resumed_at, route.returning_started_at, route.returned_at, start, end, totalService, rows.map(s => [s.id,s.stop_sequence,s.status,s.arrived_at,s.delivery_orders])]);
  return { route, origin, targets, viewStops, revision, gps: route.status === 'ACTIVE' ? { ...point } : null, basis: route.status === 'ACTIVE' ? 'CURRENT_GPS' : 'PLANNED_DEPART_NOW', serviceBasis: Number.isFinite(savedService) && savedService >= 0 ? 'SAVED_ROUTE_ALLOCATION' : 'DEFAULT_STOP_ESTIMATE' };
}

export async function previewEstimate(ctx, { providerKey, fetcher, clock }) {
  const points = [ctx.origin, ...ctx.targets], generated = clock();
  const url = new URL('https://api.tomtom.com/routing/1/calculateRoute/' + points.map(p => Number(p.lat)+','+Number(p.lon)).join(':') + '/json');
  for (const [key,value] of Object.entries({ key: providerKey, traffic: 'true', departAt: new Date(generated).toISOString(), routeType: 'fastest', travelMode: 'car', computeBestOrder: 'false', routeRepresentation: 'summaryOnly', computeTravelTimeFor: 'all' })) url.searchParams.set(key,value);
  const pauses = ctx.targets.map((p,i) => ({ routeStop: { pauseTimeInSeconds: i === ctx.targets.length-1 ? 0 : p.service_seconds } }));
  const response = await fetcher(url, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ legs: pauses }) });
  if (!response.ok) throw Error('TRAFFIC_UNAVAILABLE');
  const data = await response.json(), legs = data.routes?.[0]?.legs;
  if (!Array.isArray(legs) || legs.length !== ctx.targets.length) throw Error('TRAFFIC_UNAVAILABLE');
  let elapsed = 0, drive = 0, service = 0, meters = 0, delay = 0;
  const arrivals = legs.map((leg,i) => {
    const s = leg.summary, target = ctx.targets[i];
    if (!s || !Number.isFinite(s.travelTimeInSeconds) || s.travelTimeInSeconds < 0 || s.travelTimeInSeconds > 86400 || !Number.isFinite(s.lengthInMeters) || s.lengthInMeters < 0) throw Error('TRAFFIC_UNAVAILABLE');
    const seconds = Math.round(s.travelTimeInSeconds), trafficDelay = Number.isFinite(s.trafficDelayInSeconds) && s.trafficDelayInSeconds >= 0 ? Math.round(s.trafficDelayInSeconds) : null;
    elapsed += seconds; drive += seconds; meters += s.lengthInMeters; delay = delay === null || trafficDelay === null ? null : delay+trafficDelay;
    const arrival = new Date(generated + elapsed * 1000).toISOString();
    const row = { id: target.id, kind: target.kind, sequence: target.sequence, name: target.name, arrival_at: arrival, minutes: Math.ceil(elapsed / 60), leg_drive_seconds: seconds, traffic_delay_seconds: trafficDelay, service_seconds: target.service_seconds, miles: s.lengthInMeters / 1609.344 };
    elapsed += target.service_seconds; service += target.service_seconds;
    if (elapsed > 7*86400) throw Error('TRAFFIC_UNAVAILABLE');
    return row;
  });
  return { ok: true, available: true, traffic_aware: true, source: 'TOMTOM', route_id: ctx.route.id, route_updated_at: ctx.route.updated_at || null, route_status: ctx.route.status, basis: ctx.basis, origin_name: ctx.origin.name, gps_captured_at: ctx.gps?.captured_at || null, view_stops: ctx.viewStops, calculated_at: new Date(generated).toISOString(), departure_at: new Date(generated).toISOString(), finish_at: new Date(generated+elapsed*1000).toISOString(), drive_seconds: drive, service_seconds: service, service_basis: ctx.serviceBasis, traffic_delay_seconds: delay, miles: meters/1609.344, arrivals };
}
