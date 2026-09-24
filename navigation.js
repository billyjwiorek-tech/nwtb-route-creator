(() => {
  const $=id=>document.getElementById(id);
  const isPhone=()=>/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||window.matchMedia('(max-width: 760px)').matches;


  // SALES stays separate, but routing now uses the same NWTB road-matrix engine as Delivery.
  const DELIVERY_MATRIX_URL='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-route-matrix';
  const DELIVERY_MATRIX_KEY='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';

  async function deliveryRoadMatrix(points){
    const clean=points.map(p=>({lat:Number(p?.lat),lon:Number(p?.lon)}));
    if(clean.some(p=>!Number.isFinite(p.lat)||!Number.isFinite(p.lon)))throw new Error('One or more selected sales accounts need valid routing coordinates.');
    const r=await fetch(DELIVERY_MATRIX_URL,{
      method:'POST',
      headers:{'content-type':'application/json','apikey':DELIVERY_MATRIX_KEY,'x-nwtb-sales':'1'},
      body:JSON.stringify({points:clean})
    });
    const j=await r.json().catch(()=>({error:'Invalid routing response'}));
    if(!r.ok)throw new Error(j.error||'NWTB Delivery routing service failed.');
    if(!Array.isArray(j.durations)||!Array.isArray(j.distances))throw new Error('NWTB Delivery road matrix is unavailable.');
    return j;
  }

  function deliveryRouteCost(order,matrix){
    const q=[0,...order,0];let total=0;
    for(let i=0;i<q.length-1;i++){
      const v=Number(matrix?.[q[i]]?.[q[i+1]]);
      if(!Number.isFinite(v))return Infinity;
      total+=v;
    }
    return total;
  }

  function deliveryNearest(matrix,n){
    const remaining=new Set(Array.from({length:n},(_,i)=>i+1)),order=[];let cur=0;
    while(remaining.size){
      let best=null,val=Infinity;
      for(const j of remaining){
        const v=Number(matrix?.[cur]?.[j]);
        if(Number.isFinite(v)&&v<val){val=v;best=j}
      }
      if(best==null)best=[...remaining][0];
      order.push(best);remaining.delete(best);cur=best;
    }
    return order;
  }

  function deliveryTwoOpt(order,matrix){
    let best=order.slice(),cost=deliveryRouteCost(best,matrix),improved=true,round=0;
    while(improved&&round++<8){
      improved=false;
      for(let i=0;i<best.length-1;i++)for(let k=i+1;k<best.length;k++){
        const next=best.slice();
        next.splice(i,k-i+1,...next.slice(i,k+1).reverse());
        const c=deliveryRouteCost(next,matrix);
        if(c+1<cost){best=next;cost=c;improved=true}
      }
    }
    return best;
  }

  async function deliveryOptimizeSales(selected){
    const pts=[depot,...selected];
    const matrix=await deliveryRoadMatrix(pts);
    const order=deliveryTwoOpt(deliveryNearest(matrix.durations,selected.length),matrix.durations);
    const meters=deliveryRouteCost(order,matrix.distances);
    const seconds=deliveryRouteCost(order,matrix.durations);
    if(!Number.isFinite(meters)||!Number.isFinite(seconds))throw new Error('The NWTB Delivery routing engine returned an invalid route.');
    const routeMiles=Math.round((meters/1609.344)*10)/10;
    const routeMinutes=Math.round(seconds/60);
    if(routeMiles>3000||routeMinutes>5000)throw new Error('Route estimate is outside a reasonable range. One or more sales locations need verification.');
    return {order:order.map(i=>i-1),miles:routeMiles,minutes:routeMinutes,source:matrix.source||'NWTB DELIVERY ROAD MATRIX',warning:matrix.warning||''};
  }

  function annotateDeliveryEngine(result){
    try{
      const out=$('output');
      const n=out?.querySelector('.notice');
      if(!n)return;
      const source=result?.source==='FALLBACK_APPROXIMATE'?'APPROXIMATE FALLBACK':'ROAD MATRIX';
      n.insertAdjacentHTML('beforeend',`<br><b>ROUTING ENGINE:</b> NWTB Delivery ${source}${result?.warning?` • ${esc(result.warning)}`:''}`);
    }catch{}
  }

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

  // FINAL 2026-09-22 GO FIRST HOLD AUDIT.
  // The former four HOLD records are now resolved:
  // 11060 commercial/route OK; 10803 + 28280 residential/do-not-route;
  // 24956 stale duplicate of the canonical Highboost #28369 and suppressed.
  function applyHoldAudit(){
    try{
      if(!Array.isArray(accounts)||!accounts.length)return false;

      const iron=accounts.find(a=>String(a.customerNumber||'')==='11060');
      if(iron){
        if(!iron.originalAddress)iron.originalAddress=iron.address;
        iron.address='2605 W 22nd St, Suite 32, Oak Brook, IL 60523';
        // Routing point centered on the 2603/2607 W 22nd St office complex.
        iron.lat=41.845455;
        iron.lon=-87.980871;
        iron.routeEligible=true;
        iron.locationVerification='COMMERCIAL — ROUTE OK';
        iron.auditAddressCorrected=true;
        iron.auditLocationNote='FINAL HOLD AUDIT 09-22-2026: current Oak Brook commercial office; route approved.';
        iron.holdAuditStatus='COMMERCIAL_ROUTE_OK';
        appendNote(iron,'FINAL HOLD AUDIT 09-22-2026: Iron Way Transportation #11060 moved from the old Naperville residential address to the verified commercial office at 2605 W 22nd St Suite 32, Oak Brook.');
      }

      const high=accounts.find(a=>String(a.customerNumber||'')==='24956');
      if(high){
        high.routeEligible=false;
        high.holdAuditStatus='STALE_DUPLICATE_SUPPRESSED';
        high.accountType='STALE RECORD — USE HIGHBOOST #28369';
        high.locationVerification='STALE/DUPLICATE — DO NOT ROUTE';
        appendNote(high,'FINAL HOLD AUDIT 09-22-2026: stale High Boost record. Do not route #24956; canonical current Highboost record is #28369 at 5 Territorial Ct, Bolingbrook.');
      }

      const four=accounts.find(a=>String(a.customerNumber||'')==='10803');
      if(four){
        four.routeEligible=false;
        four.holdAuditStatus='RESIDENTIAL_DO_NOT_ROUTE';
        four.locationVerification='RESIDENTIAL — DO NOT ROUTE';
        appendNote(four,'FINAL HOLD AUDIT 09-22-2026: active carrier but current verified company address is residential. Keep account; do not route until a commercial office/yard is verified.');
      }

      const ssmuz=accounts.find(a=>String(a.customerNumber||'')==='28280');
      if(ssmuz){
        ssmuz.routeEligible=false;
        ssmuz.holdAuditStatus='RESIDENTIAL_DO_NOT_ROUTE';
        ssmuz.locationVerification='RESIDENTIAL — DO NOT ROUTE';
        appendNote(ssmuz,'FINAL HOLD AUDIT 09-22-2026: active carrier but current verified address is an apartment/residential location. Keep account; do not route until a commercial office/yard is verified.');
      }

      refreshReconciledStats();
      setFinalSafetyNotice();
      return true;
    }catch(e){console.warn('NWTB hold audit:',e);return false}
  }

  function setFinalSafetyNotice(){
    try{
      const n=$('safetyNotice');
      if(!n)return;
      const html='<b>LOCATION SAFETY GATE:</b> Prospects: 29 commercial approved • 8 residential blocked • 0 hold. GO FIRST existing audit: 31 commercial approved • 14 residential blocked • 0 hold. 4 stale/duplicate customer records stay suppressed. <b>Only audited commercial records in these groups can route.</b>';
      if(n.innerHTML!==html)n.innerHTML=html;
    }catch{}
  }

  function applyAllReconciliation(){
    const a=applyMasterReconciliation();
    const b=applyHoldAudit();
    refreshReconciledStats();
    setFinalSafetyNotice();
    return a||b;
  }

  function waitForReconciliation(tries=0){
    if(applyAllReconciliation())return;
    if(tries<80)setTimeout(()=>waitForReconciliation(tries+1),100);
  }
  waitForReconciliation();

  // If the older safety gate refreshes itself later (for example after visit-status loading),
  // immediately re-apply the completed 09-22 hold decisions and the final counts.
  setTimeout(()=>{
    const n=$('safetyNotice');
    if(n){
      const obs=new MutationObserver(()=>{
        applyMasterReconciliation();
        applyHoldAudit();
        refreshReconciledStats();
        setFinalSafetyNotice();
      });
      obs.observe(n,{childList:true,subtree:true,characterData:true});
    }
  },800);

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
        panel.innerHTML=`<b>DESKTOP ROUTING</b><br>Click CREATE + DELIVERY OPTIMIZE to build the route here first. Review the customer list below, then click the blue OPEN IN GOOGLE MAPS button only when you are ready. Google Maps will not open automatically. The final route returns to Northwest Trucks – Bolingbrook.`;
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

  function applySubFilterFinal(cand,t){
    const sub=$('routeSubFilter')?.value||'';
    if(t==='new_business'){
      if(sub==='go_first_prospects')return cand.filter(a=>a.broadType==='PROSPECT'&&a.layer==='GO FIRST');
      if(sub==='regular_prospects')return cand.filter(a=>a.broadType==='PROSPECT'&&a.layer==='VERIFIED PROSPECTS');
      return cand.filter(a=>a.broadType==='PROSPECT');
    }
    if(t==='existing'){
      if(sub==='go_first_existing')return cand.filter(a=>a.broadType==='EXISTING CUSTOMER'&&a.layer==='GO FIRST');
      if(sub==='winback_existing')return cand.filter(a=>a.broadType==='EXISTING CUSTOMER'&&a.layer==='WIN-BACK CUSTOMERS');
      if(sub==='active_existing')return cand.filter(a=>a.broadType==='EXISTING CUSTOMER'&&a.layer==='ACTIVE CUSTOMERS');
      return cand.filter(a=>a.broadType==='EXISTING CUSTOMER');
    }
    return cand;
  }

  async function selectEfficientNewBusinessFinal(cand,n){
    if(cand.length<=n)return cand.slice();
    try{
      const pts=[depot,...cand];
      const matrix=await deliveryRoadMatrix(pts);
      if(matrix.code!=='Ok'||!matrix.durations)throw new Error('NWTB Delivery road matrix unavailable');
      const m=matrix.durations,remaining=new Set(Array.from({length:cand.length},(_,i)=>i+1));
      const tour=[0,0];
      while(tour.length-2<n&&remaining.size){
        let bestIdx=null,bestPos=null,bestDelta=Infinity;
        for(const idx of remaining){
          for(let pos=0;pos<tour.length-1;pos++){
            const a=tour[pos],b=tour[pos+1],ab=m[a]?.[b],ai=m[a]?.[idx],ib=m[idx]?.[b];
            if(ab==null||ai==null||ib==null)continue;
            const delta=ai+ib-ab;
            if(delta<bestDelta){bestDelta=delta;bestIdx=idx;bestPos=pos+1}
          }
        }
        if(bestIdx==null)break;
        tour.splice(bestPos,0,bestIdx);
        remaining.delete(bestIdx);
      }
      const chosen=tour.slice(1,-1).map(i=>cand[i-1]);
      if(chosen.length===n)return chosen;
    }catch(e){throw new Error('NWTB Delivery routing engine could not select the New Business group: '+(e.message||e))}
  }

  // Final route builder uses routeEligible as the completed safety decision.
  // This lets Iron Way #11060 route at its corrected Oak Brook commercial office while
  // preserving all residential / duplicate blocks and all master-reconciliation changes.
  async function buildFinalAuditedRoute(){
    applyAllReconciliation();
    const out=$('output'),t=$('routeType').value,r=+$('radius').value,includeFollow=$('includeFollowUps')?.checked;
    let n=Math.max(1,Math.min(25,+$('stopCount').value||10));
    let cand=accounts.filter(a=>a.routeEligible)
      .filter(filterFn(t))
      .filter(a=>r>=999||miles(depot,a)<=r);
    cand=applySubFilterFinal(cand,t);
    cand=cand.filter(a=>{
      if(a.broadType!=='PROSPECT')return true;
      const s=a.visitStatus||'NOT_VISITED';
      if(s==='DO_NOT_ROUTE'||s==='NOT_A_FIT')return false;
      if(t==='new_business'&&s==='FOLLOW_UP'&&!includeFollow)return false;
      return true;
    });
    if(!cand.length){alert('No eligible audited-commercial accounts matched these filters.');return}
    n=Math.min(n,cand.length);
    out.style.display='block';out.innerHTML='<b>Choosing the sales stops and optimizing with the NWTB Delivery routing engine...</b>';
    try{
      let sel;
      if(t==='new_business')sel=await selectEfficientNewBusinessFinal(cand,n);
      else if(t==='mixed')sel=selectMixed(cand,n);
      else sel=selectCluster(cand,n,t);
      const j=await deliveryOptimizeSales(sel);
      renderRoute(j.order.map(i=>sel[i]),{miles:j.miles,minutes:j.minutes,efficiencyFirst:t==='new_business'});
      annotateDeliveryEngine(j);
    }catch(e){out.innerHTML=`<div class="notice"><b>ROUTE NOT CREATED:</b> ${esc(e.message||e)}</div>`}
  }

  window.buildRoute=async function(){
    await buildFinalAuditedRoute();
    applyAllReconciliation();
    addNavigationPanel();
  };

  const baseShow=window.showCard;
  if(typeof baseShow==='function'){
    window.showCard=async function(i){
      const r=await baseShow(i);
      try{
        const a=currentRoute?.[i];
        if(String(a?.customerNumber||'')==='11060'){
          const box=document.querySelector('#modal .locationbox');
          if(box)box.innerHTML='<h3>LOCATION VERIFICATION</h3><span class="locationstatus loc-ok">COMMERCIAL — ROUTE OK</span><div class="visit-note"><b>Address corrected:</b> 1821 S Washington Street, Apt #3, Naperville → 2605 W 22nd St, Suite 32, Oak Brook, IL 60523</div><div class="visit-note">FINAL HOLD AUDIT 09-22-2026: verified current commercial office.</div>';
        }
      }catch{}
      return r;
    };
  }
})();
