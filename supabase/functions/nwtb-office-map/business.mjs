import { validPoint } from './policy.mjs';

const BUSINESS_RADII = new Set([5, 10, 25, 50, 100]);
export function businessRadius(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!['number', 'string'].includes(typeof value) || !BUSINESS_RADII.has(Number(value))) return undefined;
  return Number(value);
}

function distanceMiles(point, depot) {
  const rad = n => Number(n) * Math.PI / 180;
  const a = Math.sin(rad(point.lat - depot.lat) / 2) ** 2 + Math.cos(rad(depot.lat)) * Math.cos(rad(point.lat)) * Math.sin(rad(point.lon - depot.lon) / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
}
function businessBounds(depot, miles) {
  const radians = Math.PI / 180, angle = miles / 3958.7613;
  const latSpan = angle / radians, lonSpan = Math.asin(Math.sin(angle) / Math.cos(depot.lat * radians)) / radians;
  return [depot.lon - lonSpan, depot.lat - latSpan, depot.lon + lonSpan, depot.lat + latSpan].join(',');
}

// These are candidates for Office review; searching never saves a location or creates a stop.
export function normalizeBusiness(feature, depot) {
  const p = feature?.properties || {}, coordinates = feature?.geometry?.coordinates;
  const point = { lat: coordinates?.[1], lon: coordinates?.[0] };
  if (!validPoint(point) || !p.name || ['highway', 'boundary', 'place', 'natural', 'waterway', 'railway', 'landuse'].includes(p.osm_key)) return null;
  if (p.countrycode && String(p.countrycode).toUpperCase() !== 'US') return null;
  const street = [p.housenumber, p.street].filter(Boolean).join(' '), city = p.city || p.town || p.village || p.district || '';
  if (!street || !city) return null;
  const address = [street, city, [p.state, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const lat = Number(point.lat), lon = Number(point.lon);
  return { name: String(p.name).slice(0, 240), address: address.slice(0, 500), lat, lon, phone: '', source_type: 'OTHER',
    source_ref: 'OSM:' + String(p.osm_type || '').slice(0, 1) + ':' + String(p.osm_id || '').slice(0, 30),
    source: 'OPENSTREETMAP', address_complete: !!(p.housenumber && p.street && city), distance_miles: distanceMiles({ lat, lon }, depot) };
}

export function normalizeTomTomBusiness(result, depot) {
  const p = result?.poi, address = result?.address || {}, point = result?.position;
  if (result?.type !== 'POI' || !p?.name || !result.id || !validPoint(point) || String(address.countryCode || '').toUpperCase() !== 'US') return null;
  const city = address.municipality || address.countrySecondarySubdivision || '';
  const street = [address.streetNumber, address.streetName].filter(Boolean).join(' ');
  if (!street || !city) return null;
  const label = address.freeformAddress || [street, city, [address.countrySubdivision, address.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const lat = Number(point.lat), lon = Number(point.lon);
  return { name: String(p.name).slice(0, 240), address: String(label).slice(0, 500), lat, lon, phone: String(p.phone || '').slice(0, 80),
    source_type: 'OTHER', source_ref: 'TOMTOM:' + String(result.id).slice(0, 100), source: 'TOMTOM',
    address_complete: !!(address.streetNumber && address.streetName && city), distance_miles: distanceMiles({ lat, lon }, depot) };
}

function reviewedCandidates(rows, radius) {
  const seen = new Set();
  return rows.filter(row => {
    if (!row || (radius !== null && row.distance_miles > radius)) return false;
    const identity = [row.name, row.address].join('|').toLowerCase();
    if (seen.has(identity)) return false;
    seen.add(identity); return true;
  }).sort((a, b) => a.distance_miles - b.distance_miles).slice(0, 50);
}

// Both providers prefer the selected depot even without a hard radius. Only the server sees the key.
export async function searchBusinesses({ q, depot, radius, providerKey, fetcher }) {
  let fallbackReason = 'SEARCH_NOT_CONFIGURED';
  if (providerKey) {
    try {
      const url = new URL('https://api.tomtom.com/search/2/poiSearch/' + encodeURIComponent(q) + '.json');
      for (const [key, value] of Object.entries({ key: providerKey, countrySet: 'US', limit: 100, language: 'en-US', typeahead: false, lat: depot.lat, lon: depot.lon })) url.searchParams.set(key, String(value));
      if (radius !== null) url.searchParams.set('radius', String(Math.ceil(radius * 1609.344)));
      const response = await fetcher(url, { signal: AbortSignal.timeout(7000), headers: { Accept: 'application/json' } });
      if (!response.ok) throw Error('SEARCH_UNAVAILABLE');
      const data = await response.json();
      if (!Array.isArray(data.results)) throw Error('SEARCH_UNAVAILABLE');
      const results = reviewedCandidates(data.results.map(row => normalizeTomTomBusiness(row, depot)), radius);
      if (results.length) return { results, source: 'TOMTOM', attribution: '© TomTom', fallback: false };
      fallbackReason = 'NO_PRIMARY_MATCHES';
    } catch { fallbackReason = 'PRIMARY_UNAVAILABLE'; }
  }
  const url = new URL('https://photon.komoot.io/api/');
  for (const [key, value] of Object.entries({ q, countrycode: 'US', limit: 50, lang: 'en', lat: depot.lat, lon: depot.lon, location_bias_scale: 0 })) url.searchParams.set(key, String(value));
  if (radius !== null) url.searchParams.set('bbox', businessBounds(depot, radius));
  const response = await fetcher(url, { signal: AbortSignal.timeout(7000), headers: { Accept: 'application/json', 'User-Agent': 'NWTB-Delivery/1.0 (Office business lookup)' } });
  if (!response.ok) throw Error('DIRECTORY_UNAVAILABLE');
  const data = await response.json();
  if (!Array.isArray(data.features)) throw Error('DIRECTORY_UNAVAILABLE');
  return { results: reviewedCandidates(data.features.map(row => normalizeBusiness(row, depot)), radius), source: 'OPENSTREETMAP', attribution: '© OpenStreetMap contributors', fallback: true, fallback_reason: fallbackReason };
}
