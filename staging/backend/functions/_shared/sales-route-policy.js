/* Sales-only routing policy. No caller-supplied approval, address or coordinates are trusted. */
(function(root) {
  const MESSAGE = 'HOLD — COMMERCIAL LOCATION NOT VERIFIED. THIS ACCOUNT CANNOT BE ADDED TO A SALES ROUTE.';
  const truth = v => v === true || v === 'true';
  const norm = v => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const field = (a, final, old) => a?.[final] ?? a?.[old];
  const number = a => String(field(a, 'finalCustomerNumber', 'customerNumber') ?? '').trim();
  function coordinates(a) {
    if (a?.lat == null || a?.lon == null || String(a.lat).trim() === '' || String(a.lon).trim() === '') return false;
    const lat = Number(a.lat), lon = Number(a.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66;
  }
  function reason(a) {
    if (!a || !truth(a.finalIncluded)) return 'Account is excluded from the final Sales database.';
    if (!truth(a.finalRouteApproved)) return a.finalLocationAuditReason || a.finalRouteSafetyReason || MESSAGE;
    if ((truth(a.finalGoFirstMember) || field(a, 'finalLayer', 'layer') === 'GO FIRST') && !truth(a.finalGoFirstRouteApproved)) return MESSAGE;
    if (!String(a.name || '').trim() || !String(a.address || '').trim() || /\b(?:P\.?\s*O\.?\s*BOX|PMB|PBM)\b/i.test(a.address)) return 'A verified physical business address is required.';
    if (!coordinates(a)) return 'This account needs verified routing coordinates.';
    if (['DO_NOT_ROUTE', 'NOT_A_FIT'].includes(a.visitStatus)) return 'This account is marked DO NOT ROUTE / NOT A FIT.';
    return '';
  }
  function resolve(stop, database) {
    if (!stop || !Array.isArray(database)) return null;
    let matches;
    if (stop.salesAccountId != null) matches = database.filter(a => String(a.salesAccountId) === String(stop.salesAccountId));
    else if (number(stop)) matches = database.filter(a => number(a) === number(stop));
    else matches = database.filter(a => norm(a.name) === norm(stop.name) && norm(a.address) === norm(stop.address));
    return matches.length === 1 ? matches[0] : null;
  }
  function validate(stops, database) {
    if (!Array.isArray(stops) || !stops.length || stops.length > 25) return {ok:false,stops:[],blocked:[{name:'Route',reason:'Choose between 1 and 25 Sales accounts.'}]};
    const result = [], blocked = [], seen = new Set();
    for (const stop of stops) {
      const a = resolve(stop, database), why = a ? reason(a) : 'Account is missing or ambiguous in the current Sales database.';
      const key = a ? String(a.salesAccountId ?? (number(a) || norm(a.name)+'|'+norm(a.address))) : '';
      if (why || seen.has(key)) blocked.push({name:a?.name || stop?.name || 'Unknown account',reason:why || 'Duplicate stop in this route.'});
      else { seen.add(key); result.push({...a}); }
    }
    return {ok:blocked.length === 0,stops:blocked.length ? [] : result,blocked};
  }
  root.NwtbSalesPolicy = {MESSAGE,truth,norm,number,coordinates,reason,resolve,validate};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NwtbSalesPolicy;
})(globalThis);
