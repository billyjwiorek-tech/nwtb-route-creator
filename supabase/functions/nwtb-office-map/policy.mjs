// Shared by the existing NWTB Office map and its read-only map service.
export const MAX_GPS_AGE_MS = 120000;
export const MAX_ETA_AGE_MS = 60000;
export const DEPOTS = Object.freeze({
  BOLINGBROOK: { name: 'NWTB Bolingbrook', lat: 41.682487, lon: -88.072262 },
  PALATINE: { name: 'NWTB Palatine', lat: 42.148326, lon: -88.033080 }
});

export function validPoint(point) {
  if (!point || [point.lat, point.lon].some(v => v === null || v === undefined || String(v).trim() === '')) return false;
  const lat = Number(point.lat), lon = Number(point.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 20 && lat <= 60 && lon >= -135 && lon <= -55;
}

export function gpsProblem(point, clock = Date.now()) {
  if (!validPoint(point)) return 'GPS_UNAVAILABLE';
  const captured = Date.parse(point.captured_at);
  if (!Number.isFinite(captured) || captured > clock + 15000 || clock - captured > MAX_GPS_AGE_MS) return 'GPS_STALE';
  if (point.accuracy_m !== null && point.accuracy_m !== undefined && (!Number.isFinite(Number(point.accuracy_m)) || Number(point.accuracy_m) < 0 || Number(point.accuracy_m) > 500)) return 'GPS_INACCURATE';
  return null;
}

export function officeConfigProblem(config) {
  if (config?.environment !== 'PRODUCTION' || config.projectRef !== 'ufnjyidhxuytrmbjzgtu') return 'NWTB production project required.';
  if (config.backendUrl !== 'https://ufnjyidhxuytrmbjzgtu.supabase.co' || config.siteOrigin !== 'https://billyjwiorek-tech.github.io') return 'NWTB Office configuration does not match.';
  return null;
}

export function selectDestination(route, stops = []) {
  if (!route || route.status !== 'ACTIVE' || route.returned_at) return { problem: 'NO_ACTIVE_ROUTE' };
  if (route.paused_at && (!route.resumed_at || Date.parse(route.paused_at) > Date.parse(route.resumed_at))) return { problem: 'ROUTE_PAUSED' };
  const pending = stops.filter(s => s.status === 'PENDING').sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence))[0];
  if (pending) {
    const order = pending.delivery_orders || {};
    if (!validPoint(order)) return { problem: 'DESTINATION_UNAVAILABLE' };
    return { kind: 'NEXT_STOP', id: String(pending.id), name: String(order.customer_name || 'Next stop'), address: String(order.address || ''), lat: Number(order.lat), lon: Number(order.lon) };
  }
  if (!route.returning_started_at) return { problem: 'NO_CURRENT_DESTINATION' };
  const mode = route.end_mode || 'RETURN_DEPOT';
  if (mode === 'LAST_STOP') return { problem: 'NO_CURRENT_DESTINATION' };
  let point, name, kind;
  if (mode === 'RETURN_DEPOT') {
    const depot = DEPOTS[route.depot];
    if (!depot) return { problem: 'DESTINATION_UNAVAILABLE' };
    point = validPoint({ lat: route.end_lat, lon: route.end_lon }) ? { lat: route.end_lat, lon: route.end_lon } : depot;
    name = depot.name; kind = 'RETURN_TO_NWTB';
  } else if (mode === 'SAME_AS_START') {
    point = { lat: route.start_lat, lon: route.start_lon };
    name = route.start_name || 'Route start'; kind = 'RETURN_DESTINATION';
  } else if (['FIXED', 'CUSTOM'].includes(mode)) {
    point = { lat: route.end_lat, lon: route.end_lon };
    name = route.end_name || 'Return destination'; kind = 'RETURN_DESTINATION';
  } else return { problem: 'DESTINATION_UNAVAILABLE' };
  if (!validPoint(point)) return { problem: 'DESTINATION_UNAVAILABLE' };
  return { kind, id: 'return', name: String(name), address: String(route.end_address || ''), lat: Number(point.lat), lon: Number(point.lon) };
}

export function destinationKey(route, destination) {
  return JSON.stringify([route?.id, route?.status, route?.paused_at, route?.resumed_at, route?.returned_at, destination?.kind, destination?.id, destination?.lat, destination?.lon, destination?.problem]);
}

export function unavailableMessage(code) {
  return ({
    GPS_STALE: 'ETA UNAVAILABLE — GPS IS OUT OF DATE',
    GPS_UNAVAILABLE: 'ETA UNAVAILABLE — NO GPS LOCATION',
    GPS_INACCURATE: 'ETA UNAVAILABLE — GPS ACCURACY IS TOO LOW',
    NO_ACTIVE_ROUTE: 'NO ACTIVE ROUTE — NO ETA',
    ROUTE_PAUSED: 'ROUTE PAUSED — ETA UNAVAILABLE',
    NO_CURRENT_DESTINATION: 'ETA UNAVAILABLE — NO CURRENT DESTINATION',
    DESTINATION_UNAVAILABLE: 'ETA UNAVAILABLE — DESTINATION NEEDS A LOCATION',
    ROUTE_CHANGED: 'ROUTE CHANGED — REFRESHING ETA',
    TRAFFIC_NOT_CONFIGURED: 'ETA UNAVAILABLE — TRAFFIC SERVICE NOT CONNECTED',
    TRAFFIC_UNAVAILABLE: 'ETA UNAVAILABLE — TRAFFIC SERVICE DID NOT RESPOND',
    DRIVER_UNAVAILABLE: 'ETA UNAVAILABLE — DRIVER IS NOT ACTIVE',
    SESSION_EXPIRED: 'ETA UNAVAILABLE — OFFICE SIGN-IN REQUIRED',
    PREVIEW_ROUTE_UNAVAILABLE: 'ETA UNAVAILABLE — ROUTE IS NO LONGER PLANNED OR ACTIVE',
    PREVIEW_TOO_MANY_STOPS: 'ETA UNAVAILABLE — TOO MANY STOPS FOR A SINGLE TRAFFIC ESTIMATE'
  })[code] || 'ETA UNAVAILABLE';
}
