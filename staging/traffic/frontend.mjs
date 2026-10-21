import { stagingConfigProblem, gpsProblem, MAX_ETA_AGE_MS, unavailableMessage } from './policy.mjs';

// Install after the existing tracker decorators. Preserve the existing map, markers and popups.
export function installOfficeTraffic({ map, L, config, getRows, getMarkers, getOfficeToken, fetcher = fetch, document = globalThis.document, window = globalThis.window, clock = Date.now, timers = globalThis, isVisible }) {
  if (stagingConfigProblem(config) || window.location.origin !== config.siteOrigin) throw Error('Isolated NWTB test configuration required.');
  const endpoint = config.backendUrl.replace(/\/$/, '') + '/functions/v1/nwtb-office-traffic';
  const ownRequests = new Set(), tileRequests = new Set(), popupListeners = new Map();
  let enabled = true, available = false, disposed = false, intersects = true, layer, selected = null, epoch = 0, lastToken = '', configBusy = false, etaBusy = false, lastFetched = null, trafficError = false;
  const visible = () => !disposed && document.visibilityState !== 'hidden' && (isVisible ? isVisible() : intersects);
  const token = () => String(getOfficeToken() || '');
  const rowFor = id => getRows().find(row => row.driver_employee_number === id);
  const popupFor = id => getMarkers().get(id)?.getPopup();
  const abortAll = set => { for (const controller of set) controller.abort(); set.clear(); };
  const time = iso => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

  const style = document.createElement('style');
  style.textContent = '.nwtbTrafficControl{max-width:240px;padding:9px;background:#fff;border:1px solid #d0d5dd;border-radius:10px;box-shadow:0 2px 10px #0002;font:11px Arial,sans-serif;color:#344054}.nwtbTrafficControl button{border:0;border-radius:7px;background:#15304e;color:#fff;font-weight:900;padding:8px;cursor:pointer}.nwtbTrafficStatus{padding-top:6px;line-height:1.4}.nwtbTrafficLegend{padding-top:6px;font-size:10px}.nwtbEtaBlock{margin-top:9px;border:1px solid #b2ccff;border-radius:9px;padding:9px;background:#eff6ff;font:12px/1.5 Arial,sans-serif;color:#17202a}.nwtbEtaBlock b,.nwtbEtaBlock span{display:block}.nwtbEtaBlock small{display:block;margin-top:4px;color:#475467}';
  document.head.appendChild(style);
  const panel = document.createElement('div'); panel.className = 'nwtbTrafficControl';
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = 'LIVE TRAFFIC ON'; toggle.setAttribute('aria-pressed', 'true');
  const status = document.createElement('div'); status.className = 'nwtbTrafficStatus'; status.setAttribute('role', 'status'); status.textContent = 'CONNECTING TO TRAFFIC…';
  const legend = document.createElement('div'); legend.className = 'nwtbTrafficLegend'; legend.textContent = 'GREEN: NORMAL • YELLOW/ORANGE: SLOW • RED: HEAVY';
  panel.append(toggle, status, legend);
  const control = L.control({ position: 'topright' }); control.onAdd = () => panel; control.addTo(map);
  L.DomEvent?.disableClickPropagation(panel); L.DomEvent?.disableScrollPropagation(panel);
  const pane = map.getPane('nwtbTraffic') || map.createPane('nwtbTraffic'); pane.style.zIndex = '250'; pane.style.pointerEvents = 'none';

  async function request(action, extra = {}, { method = 'POST', signal } = {}) {
    const session = token();
    if (!session) throw Object.assign(Error('Office sign-in required.'), { code: 'SESSION_EXPIRED' });
    const headers = { apikey: config.publishableKey, 'x-nwtb-session': session };
    let url = endpoint, body;
    if (method === 'GET') url += '?' + new URLSearchParams({ action, ...extra });
    else { headers['content-type'] = 'application/json'; body = JSON.stringify({ action, ...extra }); }
    const response = await fetcher(url, { method, headers, body, signal, cache: 'no-store' });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw Object.assign(Error('Traffic service unavailable.'), { code: data.code || (response.status === 401 ? 'SESSION_EXPIRED' : 'TRAFFIC_UNAVAILABLE') }); }
    return response;
  }

  const FlowLayer = L.GridLayer.extend({
    createTile(coords, done) {
      const image = document.createElement('img'); image.alt = ''; image.setAttribute('role', 'presentation');
      const controller = new AbortController(); tileRequests.add(controller);
      let objectUrl;
      const finish = error => { tileRequests.delete(controller); if (objectUrl) window.URL.revokeObjectURL(objectUrl); done(error, image); };
      image.onload = () => finish(null); image.onerror = () => { trafficError = true; finish(Error('Traffic tile unavailable.')); };
      if (!visible() || !enabled || !available || !token()) { finish(Error('Traffic inactive.')); return image; }
      request('flow_tile', { z: String(coords.z), x: String(coords.x), y: String(coords.y) }, { method: 'GET', signal: controller.signal }).then(async response => {
        if (controller.signal.aborted || !enabled || !visible()) return;
        if (!response.headers.get('content-type')?.startsWith('image/png')) throw Error('Traffic tile unavailable.');
        const fetched = response.headers.get('x-nwtb-traffic-fetched-at');
        if (!Number.isFinite(Date.parse(fetched)) || clock() - Date.parse(fetched) > 120000 || Date.parse(fetched) > clock() + 15000) throw Error('Traffic tile is out of date.');
        lastFetched = fetched; objectUrl = window.URL.createObjectURL(await response.blob());
        if (controller.signal.aborted || !enabled || !visible()) { window.URL.revokeObjectURL(objectUrl); return; }
        image.src = objectUrl;
      }).catch(() => { if (!controller.signal.aborted) { trafficError = true; status.textContent = 'TRAFFIC UNAVAILABLE — RETRYING'; finish(Error('Traffic unavailable.')); } });
      return image;
    }
  });
  layer = new FlowLayer({ pane: 'nwtbTraffic', opacity: 0.85, tileSize: 256, minZoom: 0, maxZoom: 22, maxNativeZoom: 20, attribution: 'Traffic © TomTom', keepBuffer: 1 });
  layer.on('loading', () => { trafficError = false; status.textContent = 'REFRESHING TRAFFIC…'; });
  layer.on('load', () => { status.textContent = trafficError ? 'TRAFFIC PARTLY UNAVAILABLE — RETRYING' : lastFetched ? 'TRAFFIC ON • LOADED ' + time(lastFetched) : 'TRAFFIC UNAVAILABLE'; });

  function syncOverlay(refresh = false) {
    if (available && enabled && visible() && token()) {
      if (!map.hasLayer(layer)) layer.addTo(map);
      else if (refresh) { abortAll(tileRequests); layer.redraw(); }
    } else {
      abortAll(tileRequests); if (map.hasLayer(layer)) map.removeLayer(layer);
      if (!token()) status.textContent = 'OFFICE SIGN-IN REQUIRED';
      else if (!enabled) status.textContent = 'TRAFFIC OVERLAY OFF';
      else if (!available) status.textContent = 'TRAFFIC SERVICE NOT CONFIGURED';
      else status.textContent = 'TRAFFIC PAUSED WHILE TAB IS HIDDEN';
    }
  }

  function currentProblem(row) {
    if (!row || row.route?.status !== 'ACTIVE' || row.route?.returned_at) return 'NO_ACTIVE_ROUTE';
    if (row.route.paused || row.route.paused_at && (!row.route.resumed_at || Date.parse(row.route.paused_at) > Date.parse(row.route.resumed_at))) return 'ROUTE_PAUSED';
    return gpsProblem(row, clock());
  }

  function renderEta() {
    if (!selected) return;
    const popup = popupFor(selected.id), root = popup?.getElement()?.querySelector('.leaflet-popup-content');
    if (!root) return;
    let box = root.querySelector('.nwtbEtaBlock');
    if (!box) { box = document.createElement('div'); box.className = 'nwtbEtaBlock'; box.setAttribute('aria-live', 'polite'); root.appendChild(box); }
    box.replaceChildren();
    const heading = document.createElement('b'); heading.textContent = 'TRAFFIC-BASED ETA'; box.appendChild(heading);
    const row = rowFor(selected.id), data = selected.data;
    const problem = !token() ? 'SESSION_EXPIRED' : currentProblem(row) || (!available ? 'TRAFFIC_NOT_CONFIGURED' : null);
    if (problem || selected.problem || data && (data.route_id !== row?.route_id || clock() - Date.parse(data.calculated_at) > MAX_ETA_AGE_MS)) {
      const text = document.createElement('span'); text.textContent = unavailableMessage(problem || selected.problem || 'ROUTE_CHANGED'); box.appendChild(text);
    } else if (!data) {
      const text = document.createElement('span'); text.textContent = 'CALCULATING ARRIVAL…'; box.appendChild(text);
    } else {
      const target = document.createElement('b'); target.textContent = (data.destination.kind === 'RETURN_TO_NWTB' ? 'RETURN TO ' : 'TO ') + data.destination.name.toUpperCase();
      const arrival = document.createElement('span'); arrival.textContent = 'ARRIVAL: ' + time(data.arrival_at) + ' CENTRAL • ' + data.minutes + ' MIN';
      const detail = document.createElement('small'); detail.textContent = 'Includes traffic' + (data.traffic_delay_seconds == null ? '' : ' • Traffic delay: ' + Math.ceil(data.traffic_delay_seconds / 60) + ' min') + ' • Calculated ' + time(data.calculated_at);
      box.append(target, arrival, detail);
    }
    // Do not call popup.update(): Leaflet would restore its base HTML, emit
    // contentupdate again and recursively erase/rebuild this appended block.
  }

  async function refreshEta(force = false) {
    if (!selected || !visible() || !popupFor(selected.id)?.isOpen?.()) return;
    const row = rowFor(selected.id), problem = currentProblem(row);
    if (problem || !available || !token()) { selected.data = null; selected.problem = problem || (!token() ? 'SESSION_EXPIRED' : 'TRAFFIC_NOT_CONFIGURED'); renderEta(); return; }
    if (etaBusy && !force) { renderEta(); return; }
    const id = selected.id, initialToken = token(), routeId = row.route_id, requestEpoch = ++epoch;
    const controller = new AbortController(); ownRequests.add(controller); etaBusy = true;
    selected.problem = null; renderEta();
    try {
      const response = await request('driver_eta', { driver_employee_number: id }, { signal: controller.signal });
      const data = await response.json();
      if (disposed || controller.signal.aborted || epoch !== requestEpoch || selected?.id !== id || token() !== initialToken || rowFor(id)?.route_id !== routeId || !popupFor(id)?.isOpen?.()) return;
      if (data.available === false) { selected.data = null; selected.problem = data.code || 'TRAFFIC_UNAVAILABLE'; }
      else if (data.ok === true && data.traffic_aware === true && data.source === 'TOMTOM' && data.route_id === routeId && data.destination?.name && ['NEXT_STOP', 'RETURN_TO_NWTB', 'RETURN_DESTINATION'].includes(data.destination.kind) && Number.isFinite(data.minutes) && data.minutes >= 0 && Number.isFinite(Date.parse(data.arrival_at)) && Number.isFinite(Date.parse(data.calculated_at)) && clock() - Date.parse(data.calculated_at) <= MAX_ETA_AGE_MS && Date.parse(data.calculated_at) <= clock() + 15000 && !gpsProblem({ ...rowFor(id), captured_at: data.gps_captured_at }, clock())) { selected.data = data; selected.problem = null; }
      else { selected.data = null; selected.problem = 'TRAFFIC_UNAVAILABLE'; }
      renderEta();
    } catch (error) {
      if (epoch === requestEpoch && selected?.id === id && !controller.signal.aborted) { selected.data = null; selected.problem = error.code || 'TRAFFIC_UNAVAILABLE'; renderEta(); }
    } finally { ownRequests.delete(controller); if (epoch === requestEpoch) etaBusy = false; }
  }

  function opened(event) {
    const pair = [...getMarkers()].find(([, marker]) => marker.getPopup() === event.popup);
    if (!pair) return;
    epoch++; abortAll(ownRequests); etaBusy = false; selected = { id: pair[0], data: null, problem: null };
    if (!popupListeners.has(event.popup)) {
      const listener = () => { if (selected?.id === pair[0]) renderEta(); };
      popupListeners.set(event.popup, listener); event.popup.on('contentupdate', listener);
    }
    renderEta(); void refreshEta(true);
  }
  function closed(event) { if (selected && popupFor(selected.id) === event.popup) { epoch++; abortAll(ownRequests); etaBusy = false; selected = null; } }

  async function configure() {
    if (configBusy || disposed || !token()) { syncOverlay(); return; }
    configBusy = true; const initialToken = token(), controller = new AbortController(); ownRequests.add(controller);
    try {
      const response = await request('config', {}, { signal: controller.signal }), data = await response.json();
      if (!disposed && token() === initialToken) { available = data.ok === true && data.environment === 'STAGING' && data.source === 'TOMTOM' && data.enabled === true; syncOverlay(); renderEta(); if (selected) void refreshEta(true); }
    } catch { available = false; syncOverlay(); status.textContent = 'TRAFFIC SERVICE UNAVAILABLE'; }
    finally { configBusy = false; ownRequests.delete(controller); }
  }

  const visibilityChanged = () => { syncOverlay(); if (visible()) { void configure(); void refreshEta(); } else { epoch++; abortAll(ownRequests); etaBusy = false; } };
  toggle.addEventListener('click', () => { enabled = !enabled; toggle.textContent = 'LIVE TRAFFIC ' + (enabled ? 'ON' : 'OFF'); toggle.setAttribute('aria-pressed', String(enabled)); syncOverlay(); });
  map.on('popupopen', opened); map.on('popupclose', closed); document.addEventListener('visibilitychange', visibilityChanged);
  let observer;
  if (window.IntersectionObserver && !isVisible) { observer = new window.IntersectionObserver(entries => { intersects = entries.some(entry => entry.isIntersecting); visibilityChanged(); }); observer.observe(map.getContainer()); }
  const tileTimer = timers.setInterval(() => { if (visible()) { if (available) syncOverlay(true); else void configure(); } }, 60000);
  const etaTimer = timers.setInterval(() => { renderEta(); if (visible()) void refreshEta(); }, 15000);
  const sessionTimer = timers.setInterval(() => {
    const next = token();
    if (next !== lastToken) { lastToken = next; epoch++; abortAll(ownRequests); etaBusy = false; available = false; if (selected) { selected.data = null; selected.problem = null; } renderEta(); syncOverlay(); if (next && visible()) void configure(); }
  }, 1000);
  function destroy() {
    disposed = true; epoch++; abortAll(ownRequests); abortAll(tileRequests); observer?.disconnect();
    timers.clearInterval(tileTimer); timers.clearInterval(etaTimer); timers.clearInterval(sessionTimer);
    map.off('popupopen', opened); map.off('popupclose', closed); map.off('unload', destroy); document.removeEventListener('visibilitychange', visibilityChanged);
    for (const [popup, listener] of popupListeners) popup.off('contentupdate', listener);
    if (map.hasLayer(layer)) map.removeLayer(layer); control.remove(); style.remove();
  }
  map.on('unload', destroy); lastToken = token(); void configure();
  return { destroy, refreshEta, syncOverlay, panel, layer, get enabled() { return enabled; } };
}

// The staging installer adds configuration before this module. Production pages do not load it.
if (typeof window !== 'undefined' && window.NWTB_STAGING_CONFIG && !window.__nwtbOfficeTraffic) {
  const install = () => {
    if (!window.__nwtbTrackerMap || typeof live === 'undefined' || typeof markers === 'undefined' || typeof L === 'undefined') return false;
    window.__nwtbOfficeTraffic = installOfficeTraffic({ map: window.__nwtbTrackerMap, L, config: window.NWTB_STAGING_CONFIG,
      getRows: () => live || [], getMarkers: () => markers, getOfficeToken: () => localStorage.getItem(window.NWTB_STAGING_CONFIG.officeTokenKey) });
    return true;
  };
  let tries = 0; const timer = setInterval(() => { try { if (install() || ++tries > 120) clearInterval(timer); } catch { clearInterval(timer); } }, 100);
}
