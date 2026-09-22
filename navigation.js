(() => {
  const $=id=>document.getElementById(id);
  const isPhone=()=>/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||window.matchMedia('(max-width: 760px)').matches;

  // 2026-09-22 MASTER RECONCILIATION.
  // These corrections are applied at runtime so the source customer/prospect audit history stays preserved.
  // Verified salesperson routing addresses are intentionally retained; billing/master addresses do not overwrite them.
  function masterNorm(s){return String(s||'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
  function appendNote(a,note){
    const old=String(a?.notes||'').trim();
    if(!old.includes(note))a.notes=old?old+' | '+note:note;
  }
  function refreshReconciledStats(){
    try{
      const usable=accounts.filter(a=>a.routeEligible);
      const go=usable.filter(a=>a.layer==='GO FIRST');
      const goExist=go.filter(a=>a.broadType==='EXISTING CUSTOMER').length;
      const goPros=go.filter(a=>a.broadType==='PROSPECT').length;
      if($('statGo'))$('statGo').textContent=go.length;
      if($('statGoSub'))$('statGoSub').textContent=`${goExist} existing • ${goPros} new potential`;
      if($('statPros'))$('statPros').textContent=usable.filter(a=>a.layer==='VERIFIED PROSPECTS').length;
      if($('statWin'))$('statWin').textContent=usable.filter(a=>a.layer==='WIN-BACK CUSTOMERS').length;
      if($('statActive'))$('statActive').textContent=usable.filter(a=>a.layer==='ACTIVE CUSTOMERS').length;
      if($('statTotal'))$('statTotal').textContent=usable.length;
    }catch(e){console.warn('NWTB reconciliation stats:',e)}
  }
  function applyMasterReconciliation(){
    try{
      if(!Array.isArray(accounts)||!accounts.length)return false;

      // BSL Express: confirmed NWTB customer #18812. Current service activity exists,
      // while the 12-month parts analysis found no positive parts sale. Treat as active-service
      // with a parts cross-sell opportunity, not as a brand-new prospect.
      const bsl=accounts.find(a=>a.broadType==='PROSPECT'&&masterNorm(a.name)==='BSL EXPRESS TRUCKING INC');
      if(bsl){
        bsl.originalProspectName=bsl.originalProspectName||bsl.name;
        bsl.customerNumber='18812';
        bsl.billCusId='18812';
        bsl.broadType='EXISTING CUSTOMER';
        bsl.layer='ACTIVE CUSTOMERS';
        bsl.accountType='ACTIVE CUSTOMER — SERVICE ACTIVITY / PARTS OPPORTUNITY';
        bsl.badge='blue';
        bsl.priority='BLUE - ACTIVE SERVICE / PARTS OPPORTUNITY';
        bsl.routeEligible=true;
        bsl.masterReconciled='2026-09-22';
        appendNote(bsl,'MASTER RECONCILED 09-22-2026: Existing customer #18812. Service activity found; no positive parts purchase found in the 12-month parts analysis. Keep verified Romeoville route address; Willowbrook is the updated billing/master address.');
      }

      // USA Logistics: confirmed existing customer #14176. The current prospect phone matches
      // the FMCSA phone tied to that NWTB customer identity. No current parts/service sale match
      // was found in the reviewed reports, so this is a recovery account rather than new business.
      const usa=accounts.find(a=>a.broadType==='PROSPECT'&&masterNorm(a.name)==='USA LOGISTICS INC');
      if(usa){
        usa.customerNumber='14176';
        usa.billCusId='15160';
        usa.broadType='EXISTING CUSTOMER';
        usa.layer='WIN-BACK CUSTOMERS';
        usa.accountType='WIN-BACK CUSTOMER';
        usa.badge='orange';
        usa.priority='ORANGE - WIN-BACK RESEARCH';
        usa.routeEligible=true;
        usa.masterReconciled='2026-09-22';
        appendNote(usa,'MASTER RECONCILED 09-22-2026: Existing NWTB customer #14176; current BillCusId 15160. Current prospect phone matches the carrier identity. Keep verified Woodridge operating address.');
      }

      // Load N Go: confirmed existing customer #15291 by exact legal-name/location evidence.
      // No current positive sales match was found in the reviewed reports, so move to Win-Back.
      const lng=accounts.find(a=>a.broadType==='PROSPECT'&&masterNorm(a.name)==='LNG HOLDING LOAD N GO INC');
      if(lng){
        lng.customerNumber='15291';
        lng.billCusId='15291';
        lng.broadType='EXISTING CUSTOMER';
        lng.layer='WIN-BACK CUSTOMERS';
        lng.accountType='WIN-BACK CUSTOMER';
        lng.badge='orange';
        lng.priority='ORANGE - WIN-BACK RESEARCH';
        lng.routeEligible=true;
        lng.masterReconciled='2026-09-22';
        appendNote(lng,'MASTER RECONCILED 09-22-2026: Existing customer #15291 LOAD N GO. Bolingbrook operating location confirmed; keep 534 Territorial Dr Ste B as route address.');
      }

      // Great Dane Chicago prospect is a duplicate of existing customer #13577 GREAT DANE,
      // which is already correctly represented as a Win-Back customer in the working data.
      const gdPros=accounts.find(a=>a.broadType==='PROSPECT'&&masterNorm(a.name)==='GREAT DANE CHICAGO');
      if(gdPros){
        gdPros.routeEligible=false;
        gdPros.broadType='SUPPRESSED DUPLICATE';
        gdPros.layer='DUPLICATE SUPPRESSED';
        gdPros.accountType='DUPLICATE OF CUSTOMER #13577';
        gdPros.masterReconciled='2026-09-22';
        appendNote(gdPros,'MASTER RECONCILED 09-22-2026: Duplicate of existing GREAT DANE customer #13577. Do not route as a prospect.');
      }
      const gdExisting=accounts.find(a=>String(a.customerNumber||'')==='13577');
      if(gdExisting){
        gdExisting.masterReconciled='2026-09-22';
        appendNote(gdExisting,'MASTER RECONCILED 09-22-2026: Confirmed existing customer. No positive parts purchase found in 12-month analysis and no service-ranking match; keep as Win-Back.');
      }

      refreshReconciledStats();
      return true;
    }catch(e){console.warn('NWTB master reconciliation:',e);return false}
  }
  function waitForReconciliation(tries=0){
    if(applyMasterReconciliation())return;
    if(tries<80)setTimeout(()=>waitForReconciliation(tries+1),100);
  }
  waitForReconciliation();

  const encPlace=x=>{
    const name=String(x?.name||'').trim(),address=String(x?.address||'').trim();
    if(name&&address)return encodeURIComponent(`${name}, ${address}`);
    if(address)return encodeURIComponent(address);
    if(name)return encodeURIComponent(name);
    const lat=Number(x?.lat),lon=Number(x?.lon);
    return Number.isFinite(lat)&&Number.isFinite(lon)?encodeURIComponent(`${lat.toFixed(6)},${lon.toFixed(6)}`):'';
  };

  function firstPhoneUrl(origin){
    if(!currentRoute?.length)return '';
    const originPart=origin?`&origin=${encodeURIComponent(origin)}`:'';
    if(currentRoute.length<=9){
      return `https://www.google.com/maps/dir/?api=1${originPart}&destination=${encPlace(depot)}&travelmode=driving&dir_action=navigate&waypoints=${currentRoute.map(encPlace).join('%7C')}`;
    }
    const chunk=currentRoute.slice(0,9),dest=chunk[chunk.length-1],wps=chunk.slice(0,-1);
    return `https://www.google.com/maps/dir/?api=1${originPart}&destination=${encPlace(dest)}&travelmode=driving&dir_action=navigate${wps.length?'&waypoints='+wps.map(encPlace).join('%7C'):''}`;
  }

  window.nwtbStartPhoneNavigation=function(){
    if(!currentRoute?.length)return alert('Create a route first.');
    const btn=$('nwtbStartNavBtn');
    if(btn){btn.disabled=true;btn.textContent='GETTING YOUR GPS LOCATION...'}
    const launch=origin=>{
      const url=firstPhoneUrl(origin);
      if(btn){btn.disabled=false;btn.textContent='START NAVIGATION — PART 1'}
      if(!url)return alert('Could not create the Google Maps route.');
      window.location.href=url;
    };
    if(!navigator.geolocation){launch('');return}
    navigator.geolocation.getCurrentPosition(
      p=>launch(`${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)}`),
      ()=>launch(''),
      {enableHighAccuracy:true,timeout:8000,maximumAge:30000}
    );
  };

  function addNavigationPanel(){
    try{
      const out=$('output');
      if(!out||out.style.display==='none'||!currentRoute?.length)return;
      out.querySelector('#nwtbNavigationPanel')?.remove();
      const panel=document.createElement('div');
      panel.id='nwtbNavigationPanel';
      panel.style.cssText='margin:0 0 14px;padding:14px;border:2px solid #1a73e8;border-radius:10px;background:#eef5ff;line-height:1.45';
      if(isPhone()){
        const extra=(currentMapLinks||[]).slice(1).map((x,i)=>`<a class="routebtn" style="display:block;text-align:center;margin:8px 0" href="${x.url}">${i===(currentMapLinks.length-2)?'FINAL PART — RETURN TO NWTB':`CONTINUE — PART ${i+2}`}</a>`).join('');
        panel.innerHTML=`<b>PHONE NAVIGATION</b><br>Build the route here on your phone, then use Google Maps for driving. Part 1 uses your phone's current GPS location. The final part returns to Northwest Trucks – Bolingbrook.<br><button id="nwtbStartNavBtn" class="primary" style="width:100%;font-size:18px;margin-top:10px;padding:15px" onclick="nwtbStartPhoneNavigation()">START NAVIGATION — PART 1</button>${extra}<div class="small" style="margin-top:8px">Google Maps app recommended. If location permission is denied, Google Maps will use the device's current location when available.</div>`;
      }else{
        panel.innerHTML=`<b>DESKTOP ROUTING</b><br>After you click CREATE + FREE OPTIMIZE, Google Maps Part 1 opens automatically in a new tab. Desktop Google Maps shows the planned route; live turn-by-turn navigation is a phone feature. The final route part returns to Northwest Trucks – Bolingbrook.`;
      }
      out.insertBefore(panel,out.firstChild);
    }catch(e){console.warn('NWTB navigation panel:',e)}
  }

  const baseRender=window.renderRoute;
  if(typeof baseRender==='function'){
    window.renderRoute=function(order,meta={}){
      const r=baseRender(order,meta);
      addNavigationPanel();
      return r;
    };
  }

  const baseBuild=window.buildRoute;
  if(typeof baseBuild==='function'){
    window.buildRoute=async function(){
      applyMasterReconciliation();
      const desktop=!isPhone();
      let mapTab=null;
      if(desktop){
        try{
          mapTab=window.open('about:blank','nwtb_google_maps_route');
          if(mapTab){
            mapTab.document.title='NWTB Route — Loading';
            mapTab.document.body.innerHTML='<div style="font-family:Arial;padding:30px"><h2>NWTB Route</h2><p>Optimizing route and opening Google Maps...</p></div>';
          }
        }catch{}
      }
      try{
        await baseBuild.apply(this,arguments);
        applyMasterReconciliation();
        addNavigationPanel();
        if(desktop&&mapTab){
          const first=currentMapLinks?.[0]?.url;
          if(first)mapTab.location.href=first;else mapTab.close();
        }
      }catch(e){
        if(mapTab)try{mapTab.close()}catch{}
        throw e;
      }
    };
  }
})();
