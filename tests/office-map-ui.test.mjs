import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { installOfficeTraffic } from '../office-map-live.mjs';
const require = createRequire(new URL('./package.json', import.meta.url));
const { parseHTML } = require('linkedom');
const start = Date.parse('2026-10-21T14:30:00Z');
const config = { environment: 'PRODUCTION', projectRef: 'ufnjyidhxuytrmbjzgtu', backendUrl: 'https://ufnjyidhxuytrmbjzgtu.supabase.co', siteOrigin: 'https://billyjwiorek-tech.github.io', publishableKey: 'fixture-publishable', officeTokenKey: 'nwtb_delivery_token' };
const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
class Emitter { constructor() { this.events = new Map(); } on(name, fn) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(fn); return this; } off(name, fn) { this.events.get(name)?.delete(fn); return this; } fire(name, event) { for (const fn of this.events.get(name) || []) fn(event); return this; } }

function fixture(options = {}) {
  const { document, window: dom } = parseHTML('<html><head></head><body><div id="map"></div><div id="popupA"><div class="leaflet-popup-content">EXISTING GPS DETAILS</div></div><div id="popupB"><div class="leaflet-popup-content">SECOND DRIVER</div></div></body></html>');
  let now = start, id = 0, officeToken = 'fixture-office', visible = true;
  Object.defineProperty(document, 'visibilityState', { get: () => visible ? 'visible' : 'hidden' });
  const intervals = new Map(), calls = [], blobUrls = [], pending = [];
  const timers = { setInterval(fn, ms) { const key = ++id; intervals.set(key, { fn, ms }); return key; }, clearInterval(key) { intervals.delete(key); } };
  const map = new Emitter(); map.layers = new Set(); map.panes = new Map();
  map.getPane = name => map.panes.get(name); map.createPane = name => { const pane = document.createElement('div'); map.panes.set(name, pane); return pane; };
  map.hasLayer = layer => map.layers.has(layer); map.removeLayer = layer => { map.layers.delete(layer); return map; }; map.getContainer = () => document.getElementById('map');
  const L = { control() { return { onAdd: null, addTo() { document.body.appendChild(this.onAdd()); return this; }, remove() { document.querySelector('.nwtbTrafficControl')?.remove(); } }; }, DomEvent: { disableClickPropagation() {}, disableScrollPropagation() {} }, GridLayer: { extend(definition) { return class extends Emitter { constructor(options) { super(); this.options = options; Object.assign(this, definition); this.redraws = 0; } addTo(map) { map.layers.add(this); return this; } redraw() { this.redraws++; return this; } }; } } };
  const row = id => ({ driver_employee_number: id, route_id: 'route-' + id, route: { id: 'route-' + id, status: 'ACTIVE' }, lat: 41.7, lon: -88.05, captured_at: new Date(start).toISOString(), accuracy_m: 8 });
  const rows = [row('9001'), row('9002')];
  const popups = ['A','B'].map(letter => { const popup = new Emitter(); popup.open = false; popup.getElement = () => document.getElementById('popup' + letter); popup.isOpen = () => popup.open; popup.update = () => { throw Error('Do not recursively overwrite Leaflet popup content'); }; return popup; });
  const markers = new Map([['9001', { getPopup: () => popups[0] }], ['9002', { getPopup: () => popups[1] }]]);
  const eta = driver => ({ ok: true, available: true, traffic_aware: true, source: 'TOMTOM', route_id: 'route-' + driver, destination: { kind: options.returning ? 'RETURN_TO_NWTB' : 'NEXT_STOP', name: options.returning ? 'NWTB Bolingbrook' : 'Fixture Pickup' }, minutes: 15, traffic_delay_seconds: 120, calculated_at: new Date(now).toISOString(), arrival_at: new Date(now + 900000).toISOString(), gps_captured_at: rows.find(r => r.driver_employee_number === driver).captured_at });
  const fetcher = async (url, init) => {
    assert.ok(String(url).startsWith(config.backendUrl)); assert.ok(!String(url).includes('fixture-office')); assert.ok(!String(url).includes('fixture-provider'));
    const body = init.method === 'GET' ? Object.fromEntries(new URL(url).searchParams) : JSON.parse(init.body); calls.push({ url, init, body });
    if (body.action === 'config') return new Response(JSON.stringify({ ok: true, environment: 'PRODUCTION', source: 'TOMTOM', enabled: !options.unconfigured }));
    if (body.action === 'flow_tile') return new Response(new Uint8Array([137,80,78,71,13,10,26,10]), { headers: { 'content-type': 'image/png', 'x-nwtb-traffic-fetched-at': new Date(now).toISOString() } });
    if (options.defer) return new Promise(resolve => pending.push({ driver: body.driver_employee_number, resolve, signal: init.signal }));
    return new Response(JSON.stringify(options.unavailable ? { ok: true, available: false, code: 'TRAFFIC_UNAVAILABLE' } : eta(body.driver_employee_number)));
  };
  const window = { location: { origin: config.siteOrigin }, URL: { createObjectURL() { const value = 'blob:fixture-' + blobUrls.length; blobUrls.push(value); return value; }, revokeObjectURL() {} } };
  const ui = installOfficeTraffic({ map, L, config, getRows: () => rows, getMarkers: () => markers, getOfficeToken: () => officeToken, fetcher, document, window, clock: () => now, timers, isVisible: () => visible });
  return { document, dom, ui, map, rows, calls, pending, eta, intervals,
    get popupText() { return document.getElementById('popupA').textContent; },
    async open(index = 0) { for (const popup of popups) if (popup.open) { popup.open = false; map.fire('popupclose', { popup }); } popups[index].open = true; map.fire('popupopen', { popup: popups[index] }); await flush(); },
    async close(index = 0) { popups[index].open = false; map.fire('popupclose', { popup: popups[index] }); await flush(); },
    async tick(ms) { now += ms; for (const value of [...intervals.values()]) if (value.ms <= ms) value.fn(); await flush(); },
    async hide() { visible = false; document.dispatchEvent(new dom.Event('visibilitychange')); await flush(); },
    logout() { officeToken = ''; },
    rewritePopup() { popups[0].getElement().querySelector('.leaflet-popup-content').innerHTML = 'REFRESHED GPS DETAILS'; popups[0].fire('contentupdate'); },
    finishPending(index = 0) { const request = pending[index]; request.resolve(new Response(JSON.stringify(eta(request.driver)))); }
  };
}

test('Live Drivers opens with traffic on, attribution, lower map pane and Office-only request', async () => {
  const f = fixture(); await flush(); assert.equal(f.ui.enabled, true); assert.equal(f.map.hasLayer(f.ui.layer), true); assert.equal(f.map.getPane('nwtbTraffic').style.zIndex, '250');
  assert.match(f.ui.layer.options.attribution, /TomTom/); assert.match(f.ui.panel.textContent, /LIVE TRAFFIC ON/); assert.equal(f.calls[0].init.headers['x-nwtb-session'], 'fixture-office');
  f.ui.destroy(); assert.equal(f.intervals.size, 0);
});

test('clicking a driver adds arrival time and preserves existing GPS popup content', async () => {
  const f = fixture(); await flush(); await f.open(); assert.match(f.popupText, /EXISTING GPS DETAILS/); assert.match(f.popupText, /TO FIXTURE PICKUP/); assert.match(f.popupText, /9:45 AM CENTRAL • 15 MIN/); assert.match(f.popupText, /Traffic delay: 2 min/);
  f.rewritePopup(); assert.match(f.popupText, /REFRESHED GPS DETAILS/); assert.match(f.popupText, /9:45 AM/); assert.equal(f.document.querySelectorAll('.nwtbEtaBlock').length, 1); f.ui.destroy();
});

test('returning driver popup explicitly shows arrival back at NWTB', async () => {
  const f = fixture({ returning: true }); await flush(); await f.open(); assert.match(f.popupText, /RETURN TO NWTB BOLINGBROOK/); f.ui.destroy();
});

test('stale GPS, no active route and paused route do not ask for ETA', async () => {
  for (const state of ['stale','no-route','paused']) {
    const f = fixture(); await flush();
    if (state === 'stale') f.rows[0].captured_at = new Date(start - 17 * 3600000).toISOString();
    if (state === 'no-route') { f.rows[0].route = null; f.rows[0].route_id = null; }
    if (state === 'paused') f.rows[0].route.paused = true;
    await f.open(); assert.ok(!f.calls.some(r => r.body.action === 'driver_eta')); assert.ok(!f.popupText.includes('ARRIVAL:')); assert.match(f.popupText, /ETA|NO ACTIVE ROUTE/); f.ui.destroy();
  }
});

test('an ETA disappears when its GPS becomes stale while popup is open', async () => {
  const f = fixture(); await flush(); await f.open(); assert.match(f.popupText, /ARRIVAL:/); f.rows[0].captured_at = new Date(start - 900000).toISOString(); await f.tick(15000); assert.match(f.popupText, /GPS IS OUT OF DATE/); assert.ok(!f.popupText.includes('ARRIVAL:')); f.ui.destroy();
});

test('late ETA from another driver is discarded and popup close aborts request', async () => {
  const f = fixture({ defer: true }); await flush(); await f.open(); const old = f.pending[0]; await f.open(1); assert.equal(old.signal.aborted, true);
  f.finishPending(0); await flush(); assert.ok(!f.document.getElementById('popupB').textContent.includes('ARRIVAL:'));
  f.finishPending(1); await flush(); assert.match(f.document.getElementById('popupB').textContent, /ARRIVAL:/);
  await f.close(1); f.ui.destroy();
});

test('logout rejects in-flight results and clears visible estimate and overlay', async () => {
  const f = fixture({ defer: true }); await flush(); await f.open(); f.logout(); await f.tick(1000); assert.equal(f.pending[0].signal.aborted, true); f.finishPending(); await flush();
  assert.ok(!f.popupText.includes('ARRIVAL:')); assert.match(f.popupText, /SIGN-IN REQUIRED/); assert.equal(f.map.hasLayer(f.ui.layer), false); f.ui.destroy();
});

test('traffic toggle hides layer without disabling driver ETA; hidden tab suspends work', async () => {
  const f = fixture(); await flush(); f.ui.panel.querySelector('button').click(); assert.equal(f.map.hasLayer(f.ui.layer), false); await f.open(); assert.match(f.popupText, /ARRIVAL:/);
  await f.hide(); const before = f.calls.length, redraws = f.ui.layer.redraws; await f.tick(60000); assert.equal(f.calls.length, before); assert.equal(f.ui.layer.redraws, redraws); f.ui.destroy();
});

test('missing provider key and provider errors display unavailable without fabricated ETA', async () => {
  for (const options of [{ unconfigured: true }, { unavailable: true }]) {
    const f = fixture(options); await flush(); await f.open(); assert.match(f.popupText, /ETA UNAVAILABLE/); assert.ok(!f.popupText.includes('ARRIVAL:')); if (options.unconfigured) assert.equal(f.map.hasLayer(f.ui.layer), false); f.ui.destroy();
  }
});

test('tile requests authenticate in headers, not URLs, and retain provider timestamp', async () => {
  const f = fixture(); await flush(); let done;
  const image = f.ui.layer.createTile({ z: 2, x: 1, y: 1 }, (error, tile) => { done = { error, tile }; }); await flush(); assert.match(image.src, /^blob:fixture/); image.onload(); assert.equal(done.error, null); assert.equal(done.tile, image);
  const call = f.calls.find(r => r.body.action === 'flow_tile'); assert.equal(call.init.headers['x-nwtb-session'], 'fixture-office'); assert.ok(!call.url.includes('fixture-office')); f.ui.destroy();
});
