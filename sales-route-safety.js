/* Last-loaded Sales guard: all route paths resolve stops against current cloud records. */
(() => {
  const policy = window.NwtbSalesPolicy;
  let revision = 0;
  const database = () => typeof accounts !== 'undefined' ? accounts : [];
  function warning(error) {
    currentRoute = []; currentMapLinks = [];
    window.nwtbSalesEndNav?.();
    const out = document.getElementById('output');
    if (out) { out.style.display = 'block'; out.replaceChildren(); const box = document.createElement('div'); box.className = 'notice'; box.setAttribute('role','alert'); box.textContent = error.message || policy.MESSAGE; out.appendChild(box); }
  }
  function checked(stops) {
    const result = policy.validate(stops, database());
    if (!result.ok) throw new Error(policy.MESSAGE + ' ' + result.blocked.map(x => x.name + ': ' + x.reason).join(' • '));
    return result.stops;
  }
  window.nwtbRequireSalesRoute = async function(stops) {
    const local = checked(stops);
    const result = await window.nwtbSalesApi('validate_route', {stops:local.map(a => ({salesAccountId:a.salesAccountId,customerNumber:a.customerNumber,name:a.name,address:a.address}))});
    if (!result.ok) throw new Error(result.error || policy.MESSAGE);
    // Refresh the canonical records, including approval revocations and visit blocks.
    const fresh = result.stops.map(window.nwtbNormalizeSalesAccount);
    for (const a of fresh) { const old = database().find(x => String(x.salesAccountId) === String(a.salesAccountId)); if (old) Object.assign(old,a); }
    return checked(fresh);
  };
  window.nwtbSalesRouteReason = a => policy.reason(policy.resolve(a,database()));
  window.nwtbSalesRouteAllowed = a => !window.nwtbSalesRouteReason(a);
  window.nwtbSalesSafetyWarning = warning;

  const previousRender = window.renderRoute;
  window.renderRoute = async function(order,meta={}) {
    const ownRevision = ++revision;
    currentRoute = []; currentMapLinks = [];
    window.nwtbSalesEndNav?.();
    const out=document.getElementById('output');
    if(out){out.style.display='block';out.textContent='Checking every stop against current Sales route approval…';}
    try { const clean = await window.nwtbRequireSalesRoute(order); if (ownRevision !== revision) return false; previousRender(clean,meta); return true; }
    catch(e) { if(ownRevision === revision) warning(e); return false; }
  };
  const previousOptimize = window.optimize;
  window.optimize = async function(stops) { return previousOptimize(await window.nwtbRequireSalesRoute(stops)); };
  const previousExport = window.openRouteXLAllStops;
  window.openRouteXLAllStops = async function() { try { currentRoute = await window.nwtbRequireSalesRoute(currentRoute); return previousExport(); } catch(e) { warning(e); } };
  const previousPhone = window.nwtbStartPhoneNavigation;
  window.nwtbStartPhoneNavigation = async function() { try { currentRoute = await window.nwtbRequireSalesRoute(currentRoute); return previousPhone(); } catch(e) { warning(e); } };
  // Keep cached Google Maps URLs from bypassing an approval revoked since rendering.
  document.addEventListener('click', async event => {
    const link=event.target.closest?.('a.routebtn');
    if(!link || !document.getElementById('output')?.contains(link)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const popup=link.target==='_blank' ? window.open('about:blank','_blank') : null;
    if(popup)popup.opener=null;
    try { const clean=await window.nwtbRequireSalesRoute(currentRoute); const index=currentMapLinks.findIndex(x=>x.url===link.href); if(index<0)throw Error('Build the Sales route again before navigation.'); const url=window.mapsLinks(clean)[index]?.url; if(!url)throw Error('Build the Sales route again before navigation.'); if(popup)popup.location.href=url; else window.location.href=url; }
    catch(e){popup?.close();warning(e);}
  },true);
  // Synchronous helpers also refuse forged or stale HOLD stops.
  const previousMaps = window.mapsLinks;
  window.mapsLinks = order => previousMaps(checked(order));
  const previousText = window.routeXLRouteText;
  window.routeXLRouteText = order => previousText(checked(order));
})();
