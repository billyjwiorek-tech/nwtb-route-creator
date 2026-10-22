import { officeConfigProblem, gpsProblem, selectDestination, destinationKey, unavailableMessage, DEPOTS, validPoint } from './policy.mjs';
import { previewContext, previewEstimate } from './preview.mjs';

const BUSINESS_RADII = new Set([5, 10, 25, 50, 100]);
function businessRadius(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!['number', 'string'].includes(typeof value) || !BUSINESS_RADII.has(Number(value))) return undefined;
  return Number(value);
}
function businessBounds(depot, miles) {
  const radians = Math.PI / 180, angle = miles / 3958.7613;
  const latSpan = angle / radians, lonSpan = Math.asin(Math.sin(angle) / Math.cos(depot.lat * radians)) / radians;
  return [depot.lon - lonSpan, depot.lat - latSpan, depot.lon + lonSpan, depot.lat + latSpan].join(',');
}

// Directory candidates are reviewed by Office. Search never saves a location or creates a stop.
export function normalizeBusiness(feature, depot) {
  const p = feature?.properties || {}, coordinates = feature?.geometry?.coordinates;
  const point = { lat: coordinates?.[1], lon: coordinates?.[0] };
  if (!validPoint(point) || !p.name || ['highway', 'boundary', 'place', 'natural', 'waterway', 'railway', 'landuse'].includes(p.osm_key)) return null;
  if (p.countrycode && String(p.countrycode).toUpperCase() !== 'US') return null;
  const street = [p.housenumber, p.street].filter(Boolean).join(' '), city = p.city || p.town || p.village || p.district || '';
  if (!street || !city) return null;
  const address = [street, city, [p.state, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const rad = n => Number(n) * Math.PI / 180, lat = Number(point.lat), lon = Number(point.lon);
  const a = Math.sin(rad(lat - depot.lat) / 2) ** 2 + Math.cos(rad(depot.lat)) * Math.cos(rad(lat)) * Math.sin(rad(lon - depot.lon) / 2) ** 2;
  return { name: String(p.name).slice(0, 240), address: address.slice(0, 500), lat, lon, phone: '', source_type: 'OTHER',
    source_ref: 'OSM:' + String(p.osm_type || '').slice(0, 1) + ':' + String(p.osm_id || '').slice(0, 30),
    source: 'OPENSTREETMAP', address_complete: !!(p.housenumber && p.street && city),
    distance_miles: 3958.7613 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a))) };
}

// Factory injection keeps tests offline; no route, session or location writes are made.
export function createOfficeMapHandler({ db, config, providerKey, fetcher = fetch, clock = Date.now }) {
  const configProblem = officeConfigProblem(config);
  const tiles = new Map(), estimates = new Map(), inFlight = new Map(), businesses = new Map(), searchLimits = new Map(), previews = new Map();
  const headers = origin => ({ 'Access-Control-Allow-Origin': origin === config?.siteOrigin ? origin : 'null', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'content-type, apikey, x-nwtb-session', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store' });
  const json = (origin, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers(origin), 'Content-Type': 'application/json' } });
  const unavailable = (origin, code, extra = {}) => json(origin, { ok: true, available: false, code, message: unavailableMessage(code), ...extra });

  async function routePreviewContext(id) {
    const routeResult = await db.from('delivery_routes').select('id,updated_at,route_date,status,depot,driver_employee_number,route_mode,service_minutes,paused_at,resumed_at,returning_started_at,returned_at,start_name,start_lat,start_lon,end_mode,end_name,end_address,end_lat,end_lon').eq('id', id).maybeSingle();
    if (routeResult.error) throw Error('DATABASE_UNAVAILABLE');
    const route = routeResult.data;
    if (!route || !['PLANNED','ACTIVE'].includes(route.status)) return { problem: 'PREVIEW_ROUTE_UNAVAILABLE' };
    const stops = await db.from('delivery_route_stops').select('id,stop_sequence,status,arrived_at,delivery_orders(customer_name,address,lat,lon,stop_type)').eq('route_id', id).order('stop_sequence').limit(152);
    if (stops.error) throw Error('DATABASE_UNAVAILABLE');
    if (stops.data?.length >= 152) return { problem: 'PREVIEW_TOO_MANY_STOPS' };
    let point;
    if (route.status === 'ACTIVE') {
      const [employee, location] = await Promise.all([
        db.from('employees').select('active').eq('employee_number', route.driver_employee_number).maybeSingle(),
        db.from('delivery_driver_locations').select('lat,lon,accuracy_m,captured_at').eq('driver_employee_number', route.driver_employee_number).order('captured_at', { ascending: false }).limit(1)
      ]);
      if (employee.error || location.error) throw Error('DATABASE_UNAVAILABLE');
      if (!employee.data?.active) return { problem: 'DRIVER_UNAVAILABLE' };
      point = location.data?.[0];
    }
    return previewContext(route, stops.data || [], point, clock());
  }

  async function context(driver) {
    const [employee, routes, locations] = await Promise.all([
      db.from('employees').select('employee_number,active').eq('employee_number', driver).maybeSingle(),
      db.from('delivery_routes').select('id,status,depot,paused_at,resumed_at,returning_started_at,returned_at,end_mode,end_name,end_address,end_lat,end_lon,start_name,start_lat,start_lon').eq('driver_employee_number', driver).eq('status', 'ACTIVE').limit(2),
      db.from('delivery_driver_locations').select('lat,lon,accuracy_m,captured_at').eq('driver_employee_number', driver).order('captured_at', { ascending: false }).limit(1)
    ]);
    if (employee.error || routes.error || locations.error) throw Error('DATABASE_UNAVAILABLE');
    if (!employee.data?.active) return { problem: 'DRIVER_UNAVAILABLE' };
    if (routes.data?.length !== 1) return { problem: 'NO_ACTIVE_ROUTE' };
    const route = routes.data[0], point = locations.data?.[0];
    const problem = gpsProblem(point, clock());
    if (problem) return { problem, gps_captured_at: point?.captured_at || null };
    const stops = await db.from('delivery_route_stops').select('id,stop_sequence,status,delivery_orders(customer_name,address,lat,lon)').eq('route_id', route.id).eq('status', 'PENDING').order('stop_sequence').limit(1);
    if (stops.error) throw Error('DATABASE_UNAVAILABLE');
    const destination = selectDestination(route, stops.data || []);
    if (destination.problem) return { problem: destination.problem, route_id: route.id };
    return { route, point, destination, key: destinationKey(route, destination) };
  }

  async function providerEstimate(ctx) {
    const target = ctx.destination, p = ctx.point;
    const u = new URL('https://api.tomtom.com/routing/1/calculateRoute/' + Number(p.lat) + ',' + Number(p.lon) + ':' + target.lat + ',' + target.lon + '/json');
    u.searchParams.set('key', providerKey); u.searchParams.set('traffic', 'true'); u.searchParams.set('departAt', 'now');
    u.searchParams.set('routeType', 'fastest'); u.searchParams.set('travelMode', 'car'); u.searchParams.set('computeTravelTimeFor', 'all');
    const response = await fetcher(u, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
    if (!response.ok) throw Error('TRAFFIC_UNAVAILABLE');
    const data = await response.json(), summary = data.routes?.[0]?.summary;
    if (!summary || !Number.isFinite(summary.travelTimeInSeconds) || summary.travelTimeInSeconds < 0 || summary.travelTimeInSeconds > 86400 || !Number.isFinite(summary.lengthInMeters) || summary.lengthInMeters < 0) throw Error('TRAFFIC_UNAVAILABLE');
    const generated = clock(), seconds = Math.round(summary.travelTimeInSeconds);
    return { ok: true, available: true, traffic_aware: true, source: 'TOMTOM', route_id: ctx.route.id, destination: target,
      drive_seconds: seconds, minutes: Math.ceil(seconds / 60), miles: summary.lengthInMeters / 1609.344,
      traffic_delay_seconds: Number.isFinite(summary.trafficDelayInSeconds) && summary.trafficDelayInSeconds >= 0 ? Math.round(summary.trafficDelayInSeconds) : null,
      calculated_at: new Date(generated).toISOString(), arrival_at: new Date(generated + seconds * 1000).toISOString(), gps_captured_at: p.captured_at };
  }

  return async function handle(req) {
    const origin = req.headers.get('origin') || '';
    if (configProblem) return json(origin, { error: 'NWTB Office map service is not configured.', code: 'NWTB_ONLY' }, 503);
    if (origin && origin !== config.siteOrigin) return json(origin, { error: 'NWTB Office origin required.' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
    if (!['GET', 'POST'].includes(req.method)) return json(origin, { error: 'GET or POST required.' }, 405);
    const token = req.headers.get('x-nwtb-session');
    if (!token) return json(origin, { error: 'Office sign-in required.', code: 'SESSION_EXPIRED' }, 401);
    let session;
    try { session = await db.from('chat_sessions').select('employee_number,expires_at,employees(active)').eq('token', token).gt('expires_at', new Date(clock()).toISOString()).maybeSingle(); }
    catch { return json(origin, { error: 'Office authentication is temporarily unavailable.' }, 503); }
    if (session.error || !session.data || !session.data.employees?.active) return json(origin, { error: 'Office sign-in required.', code: 'SESSION_EXPIRED' }, 401);
    if (session.data.employee_number !== '9998') return json(origin, { error: 'Office view only.' }, 403);
    let input;
    try {
      if (Number(req.headers.get('content-length') || 0) > 4096) return json(origin, { error: 'Request is too large.' }, 413);
      input = req.method === 'GET' ? Object.fromEntries(new URL(req.url).searchParams) : JSON.parse(await req.text().then(s => { if (s.length > 4096) throw Error('Invalid request.'); return s; }));
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid request.');
    }
    catch { return json(origin, { error: 'Invalid request.' }, 400); }
    if (input.action === 'config') return json(origin, { ok: true, enabled: !!providerKey, source: 'TOMTOM', environment: 'PRODUCTION', business_search: true, tile_refresh_seconds: 60, eta_refresh_seconds: 30 });

    if (input.action === 'route_preview_eta') {
      if (req.method !== 'POST') return json(origin, { error: 'POST required.' }, 405);
      const id = String(input.route_id || '');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return json(origin, { error: 'A saved route ID is required.' }, 400);
      if (!providerKey) return unavailable(origin, 'TRAFFIC_NOT_CONFIGURED');
      try {
        const ctx = await routePreviewContext(id);
        if (ctx.problem) return unavailable(origin, ctx.problem);
        if (input.expected_updated_at && Date.parse(input.expected_updated_at) !== Date.parse(ctx.route.updated_at)) return unavailable(origin, 'ROUTE_CHANGED');
        const key = JSON.stringify([id, ctx.revision, Number(ctx.origin.lat).toFixed(3), Number(ctx.origin.lon).toFixed(3)]), cached = previews.get(key);
        if (cached && clock()-Date.parse(cached.calculated_at) < 30000 && (!ctx.gps || !gpsProblem({ ...ctx.gps, captured_at: cached.gps_captured_at },clock()))) return json(origin,cached);
        const pendingKey = 'preview:'+key;
        let result;
        try {
          if (!inFlight.has(pendingKey)) inFlight.set(pendingKey, previewEstimate(ctx,{providerKey,fetcher,clock}));
          result = await inFlight.get(pendingKey);
        } finally { inFlight.delete(pendingKey); }
        const current = await routePreviewContext(id);
        if (current.problem) return unavailable(origin,current.problem);
        if (current.revision !== ctx.revision) return unavailable(origin,'ROUTE_CHANGED');
        if (ctx.gps && gpsProblem(ctx.gps,clock())) return unavailable(origin,'GPS_STALE');
        if (previews.size >= 128) previews.delete(previews.keys().next().value);
        previews.set(key,result); return json(origin,result);
      } catch { return unavailable(origin,'TRAFFIC_UNAVAILABLE'); }
    }

    if (input.action === 'business_search') {
      if (req.method !== 'POST') return json(origin, { error: 'POST required.' }, 405);
      const q = String(input.q || '').trim().replace(/\s+/g, ' '), depotName = String(input.depot || 'BOLINGBROOK'), depot = Object.hasOwn(DEPOTS, depotName) ? DEPOTS[depotName] : null, radius = businessRadius(input.radius_miles);
      if (q.length < 3 || q.length > 160 || /[\u0000-\u001f\u007f]/.test(q) || !depot) return json(origin, { error: 'Enter a business name of 3–160 characters and select a depot.' }, 400);
      if (radius === undefined) return json(origin, { error: 'Choose No radius, 5, 10, 25, 50 or 100 miles.' }, 400);
      const key = JSON.stringify([depotName, radius, q.toLowerCase()]), cached = businesses.get(key);
      if (cached && clock() - cached.at < 900000) return json(origin, cached.data);
      const limit = searchLimits.get(token);
      if (limit && clock() - limit.start < 60000 && limit.count >= 12) return json(origin, { error: 'Please wait a minute before searching again.', code: 'SEARCH_RATE_LIMIT' }, 429);
      if (!limit || clock() - limit.start >= 60000) {
        if (searchLimits.size >= 256) searchLimits.delete(searchLimits.keys().next().value);
        searchLimits.set(token, { start: clock(), count: 1 });
      } else limit.count++;
      try {
        const pendingKey = 'business:' + key;
        if (!inFlight.has(pendingKey)) inFlight.set(pendingKey, (async () => {
          const u = new URL('https://photon.komoot.io/api/');
          for (const [name, value] of Object.entries({ q, countrycode: 'US', limit: 50, lang: 'en' })) u.searchParams.set(name, String(value));
          if (radius !== null) {
            u.searchParams.set('bbox', businessBounds(depot, radius));
            u.searchParams.set('lat', String(depot.lat)); u.searchParams.set('lon', String(depot.lon));
            u.searchParams.set('location_bias_scale', '0');
          }
          const response = await fetcher(u, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json', 'User-Agent': 'NWTB-Delivery/1.0 (Office business lookup)' } });
          if (!response.ok) throw Error('DIRECTORY_UNAVAILABLE');
          const data = await response.json();
          if (!Array.isArray(data.features)) throw Error('DIRECTORY_UNAVAILABLE');
          const seen = new Set(), results = data.features.map(f => normalizeBusiness(f, depot)).filter(r => {
            // The provider's bounding box includes corners outside the actual circle.
            if (!r || (radius !== null && r.distance_miles > radius)) return false;
            const identity = [r.name, r.address].join('|').toLowerCase();
            if (seen.has(identity)) return false;
            seen.add(identity); return true;
          });
          if (radius !== null) results.sort((a, b) => a.distance_miles - b.distance_miles);
          const result = { ok: true, results: results.slice(0, 50), source: 'OPENSTREETMAP', attribution: '© OpenStreetMap contributors', search_scope: radius === null ? 'US_NAME' : 'DEPOT_RADIUS', radius_miles: radius, searched_near: radius === null ? null : depot.name, distance_from: depot.name, queried_at: new Date(clock()).toISOString() };
          if (businesses.size >= 128) businesses.delete(businesses.keys().next().value);
          businesses.set(key, { at: clock(), data: result }); return result;
        })());
        return json(origin, await inFlight.get(pendingKey));
      } catch { return json(origin, { error: 'Business directory is temporarily unavailable. Existing NWTB locations and manual address entry are still available.', code: 'DIRECTORY_UNAVAILABLE' }, 503); }
      finally { inFlight.delete('business:' + key); }
    }
    if (!['flow_tile', 'driver_eta'].includes(input.action)) return json(origin, { error: 'Unknown traffic action.' }, 400);
    if (!providerKey) return unavailable(origin, 'TRAFFIC_NOT_CONFIGURED');

    if (input.action === 'flow_tile') {
      const raw = [input.z, input.x, input.y];
      if (raw.some(v => !/^\d+$/.test(String(v)))) return json(origin, { error: 'Invalid traffic tile.' }, 400);
      const [z, x, y] = raw.map(Number);
      if (z < 0 || z > 20 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return json(origin, { error: 'Invalid traffic tile.' }, 400);
      const key = [z, x, y].join('/'), cached = tiles.get(key);
      const tileReply = value => new Response(value.body, { headers: { ...headers(origin), 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=30', 'X-NWTB-Traffic-Fetched-At': value.at, 'Access-Control-Expose-Headers': 'X-NWTB-Traffic-Fetched-At' } });
      if (cached && clock() - Date.parse(cached.at) < 60000) return tileReply(cached);
      try {
        const pendingKey = 'tile:' + key;
        if (!inFlight.has(pendingKey)) inFlight.set(pendingKey, (async () => {
          const u = new URL('https://api.tomtom.com/traffic/map/4/tile/flow/relative0/' + key + '.png'); u.searchParams.set('key', providerKey);
          const response = await fetcher(u, { signal: AbortSignal.timeout(6000), headers: { Accept: 'image/png' } });
          if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')) throw Error('TRAFFIC_UNAVAILABLE');
          const body = await response.arrayBuffer();
          if (body.byteLength < 8 || body.byteLength > 2 * 1024 * 1024) throw Error('TRAFFIC_UNAVAILABLE');
          const value = { body, at: new Date(clock()).toISOString() };
          if (tiles.size >= 128) tiles.delete(tiles.keys().next().value);
          tiles.set(key, value); return value;
        })());
        const value = await inFlight.get(pendingKey); return tileReply(value);
      } catch { return json(origin, { error: 'Traffic overlay unavailable.', code: 'TRAFFIC_UNAVAILABLE' }, 503); }
      finally { inFlight.delete('tile:' + key); }
    }

    const driver = String(input.driver_employee_number || '');
    if (!/^\d{4}$/.test(driver) || driver === '9998') return json(origin, { error: 'A valid driver is required.' }, 400);
    try {
      const ctx = await context(driver);
      if (ctx.problem) return unavailable(origin, ctx.problem, { gps_captured_at: ctx.gps_captured_at || null });
      const key = driver + ':' + ctx.key + ':' + Number(ctx.point.lat).toFixed(3) + ',' + Number(ctx.point.lon).toFixed(3);
      const cached = estimates.get(key);
      if (cached && clock() - Date.parse(cached.calculated_at) < 30000 && !gpsProblem({ ...ctx.point, captured_at: cached.gps_captured_at }, clock())) return json(origin, cached);
      const pendingKey = 'eta:' + key;
      let result;
      try {
        if (!inFlight.has(pendingKey)) inFlight.set(pendingKey, providerEstimate(ctx));
        result = await inFlight.get(pendingKey);
      } finally { inFlight.delete(pendingKey); }
      // Reject estimates if a stop was completed, a route held/paused, or return destination changed during the request.
      const current = await context(driver);
      if (current.problem) return unavailable(origin, current.problem);
      if (current.key !== ctx.key) return unavailable(origin, 'ROUTE_CHANGED');
      if (estimates.size >= 128) estimates.delete(estimates.keys().next().value);
      estimates.set(key, result); return json(origin, result);
    } catch { return unavailable(origin, 'TRAFFIC_UNAVAILABLE'); }
  };
}
