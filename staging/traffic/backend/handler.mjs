import { stagingConfigProblem, gpsProblem, selectDestination, destinationKey, unavailableMessage } from '../policy.mjs';

// Factory injection keeps tests offline; no route, session or location writes are made.
export function createTrafficHandler({ db, config, providerKey, fetcher = fetch, clock = Date.now }) {
  const configProblem = stagingConfigProblem(config);
  const tiles = new Map(), estimates = new Map(), inFlight = new Map();
  const headers = origin => ({ 'Access-Control-Allow-Origin': origin === config?.siteOrigin ? origin : 'null', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'content-type, apikey, x-nwtb-session', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store' });
  const json = (origin, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers(origin), 'Content-Type': 'application/json' } });
  const unavailable = (origin, code, extra = {}) => json(origin, { ok: true, available: false, code, message: unavailableMessage(code), ...extra });

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
    if (configProblem) return json(origin, { error: 'The separate test environment is not configured.', code: 'STAGING_ONLY' }, 503);
    if (origin && origin !== config.siteOrigin) return json(origin, { error: 'Test Office origin required.' }, 403);
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
    try { input = req.method === 'GET' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json(); }
    catch { return json(origin, { error: 'Invalid request.' }, 400); }
    if (input.action === 'config') return json(origin, { ok: true, enabled: !!providerKey, source: 'TOMTOM', environment: 'STAGING', tile_refresh_seconds: 60, eta_refresh_seconds: 30 });
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
