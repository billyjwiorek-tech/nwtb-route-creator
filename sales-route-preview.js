/* Sales route review: keep chosen stops, skip removals, refill and recheck before use. */
(() => {
  const policy=window.NwtbSalesPolicy,planner=window.NwtbSalesRoutePlanner;
  const output=()=>document.getElementById('output');
  const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const key=a=>a.salesAccountId!=null?'ID:'+a.salesAccountId:policy.number(a)?'CUSTOMER:'+policy.number(a):'LOCATION:'+policy.norm(a.name)+'|'+policy.norm(a.address);
  const count=n=>Math.max(1,Math.min(25,Number(n)||10));
  const copies=list=>list.map(a=>({...a}));
  const guardedRender=window.renderRoute;
  let draft=null,finalized=null,revision=0;

  const style=document.createElement('style');style.id='nwtbSalesPreviewStyle';
  style.textContent=`
    .salesPreviewHeader{display:flex;justify-content:space-between;align-items:start;gap:16px;flex-wrap:wrap}
    .salesPreviewHeader h2{margin:0 0 8px}.salesPreviewPill{background:#e4effc;color:#174e83;border-radius:999px;padding:8px 13px;font-weight:800}
    .salesPreviewTable{overflow-x:auto}.salesPreviewTable table{min-width:640px}.salesPreviewTable td{vertical-align:top}
    .salesPreviewRemove{background:#fff1ef;border:1px solid #c55b50;color:#972a20;min-height:42px}
    .salesPreviewRemoved{margin:14px 0;padding:12px;background:#f4f6f8;border:1px solid #d9dee4;border-radius:8px}
    .salesPreviewRemoved ul{margin:8px 0;padding-left:20px}.salesPreviewRemoved li{margin:7px 0}
    .salesPreviewUndo{padding:6px 10px;margin-left:10px;border:1px solid #b6c1cc;background:white}
    .salesPreviewActions{position:sticky;bottom:0;background:#fff;padding:14px 0 4px;display:flex;gap:10px;flex-wrap:wrap;border-top:1px solid #d9dee4}
    .salesPreviewDone{background:#18864b;color:white;min-height:48px}.salesPreviewCancel{background:#eef1f4;border:1px solid #bbc4cc}
    .salesPreviewError{background:#fff1ef;border-left:4px solid #b52a20;padding:12px;margin:12px 0;color:#84251e}
    #nwtbSalesFinalTools{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 14px}#nwtbSalesFinalTools button{min-height:44px}
    .salesReplacement{display:block;font-size:11px;color:#17613b;font-weight:800;margin-top:5px}
    #nwtbSalesPrintSheet{display:none}
    @media(max-width:600px){
      .salesPreviewActions{padding-bottom:66px}.salesPreviewActions button{width:100%}
      .salesPreviewPill{font-size:13px}.salesPreviewHeader h2{font-size:21px}
      .salesPreviewTable{overflow:visible}.salesPreviewTable table{min-width:0}.salesPreviewTable thead{display:none}
      .salesPreviewTable tbody{display:grid;gap:10px}.salesPreviewTable tr{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:3px;padding:10px 6px;border:1px solid #d9dee4;border-radius:8px}
      .salesPreviewTable td{border:0;padding:4px 2px;min-width:0}.salesPreviewTable td:nth-child(1){grid-column:1;grid-row:1;font-weight:800}
      .salesPreviewTable td:nth-child(2){grid-column:2;grid-row:1;overflow-wrap:anywhere}.salesPreviewTable td:nth-child(5){grid-column:3;grid-row:1}
      .salesPreviewTable td:nth-child(3){grid-column:2;grid-row:2;font-size:12px}.salesPreviewTable td:nth-child(3)::before{content:'Customer # '}
      .salesPreviewTable td:nth-child(4){grid-column:2 / 4;grid-row:3;font-size:11px;color:#5f6b76}
      .salesPreviewRemove{padding:10px 8px;font-size:12px}.salesPreviewTable td[colspan]{grid-column:1 / 4}
    }
    @media print{
      @page{margin:12mm}body{background:white!important}body>*:not(#nwtbSalesPrintSheet){display:none!important}
      #nwtbSalesPrintSheet{display:block!important;color:#111;font:10pt/1.35 Arial,sans-serif}
      #nwtbSalesPrintSheet h1{font-size:17pt;margin:0 0 6pt}#nwtbSalesPrintSheet p{margin:5pt 0 9pt}
      #nwtbSalesPrintSheet table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:10pt}
      #nwtbSalesPrintSheet th,#nwtbSalesPrintSheet td{border:1px solid #999;padding:6pt;vertical-align:top;overflow-wrap:anywhere;text-align:left;font-size:9pt}
      #nwtbSalesPrintSheet th{background:#eee!important}#nwtbSalesPrintSheet thead{display:table-header-group}
      #nwtbSalesPrintSheet tr{break-inside:avoid}#nwtbSalesPrintSheet small{display:block;font-size:8.5pt;margin-top:3pt;color:#333}
    }`;
  document.head.appendChild(style);

  function clearRoute(){
    if(window.nwtbCancelSalesRouteRender)window.nwtbCancelSalesRouteRender();
    else{currentRoute=[];currentMapLinks=[];window.nwtbSalesEndNav?.();}
    document.getElementById('nwtbSalesPrintSheet')?.remove();
  }
  function reset(){++revision;draft=null;finalized=null;clearRoute();}
  function retained(d){return d.order.filter(a=>!d.excluded.has(key(a)));}
  function renderPreview(){
    const d=draft,out=output();if(!d||!out)return;
    const kept=retained(d),needed=Math.max(0,d.settings.targetCount-kept.length),disabled=d.busy?' disabled':'';
    const rows=kept.map((a,i)=>`<tr><td>${i+1}</td><td><b>${html(a.name)}</b><div class="small">${html(a.address)}</div></td><td>${html(a.customerNumber||policy.number(a)||'—')}</td><td>${html(a.layer||a.finalLayer)}</td><td><button type="button" class="salesPreviewRemove" data-sales-review="remove" data-key="${html(key(a))}" aria-label="Remove ${html(a.name)} from this route"${disabled}>REMOVE</button></td></tr>`).join('');
    const removed=d.order.filter(a=>d.excluded.has(key(a)));
    out.style.display='block';out.innerHTML=`
      <div class="salesPreviewHeader"><div><h2>PREVIEW YOUR SALES ROUTE</h2><p>Remove any stops you do not want, then click <b>DONE</b>.</p></div><span class="salesPreviewPill">Target: ${d.settings.targetCount} customer stops</span></div>
      <div class="notice" id="nwtbSalesPreviewSummary" aria-live="polite"><b>${kept.length} stops kept • ${removed.length} removed.</b> ${needed?`DONE will find ${needed} eligible replacement${needed===1?'':'s'} and re-optimize the route.`:'DONE will finalize your route.'}<br>Same sales type, area, and customer filters. Removals apply to this route only.</div>
      <p class="small">${html(d.settings.label||'Sales route')} • ${d.settings.radius>=999?'Full sales territory':html(d.settings.radius)+'-mile area'} • Start and return: Northwest Trucks – Bolingbrook</p>
      ${d.error?`<div class="salesPreviewError" role="alert">${html(d.error)}</div>`:''}
      <div class="salesPreviewTable"><table><thead><tr><th>Stop</th><th>Business / address</th><th>Customer #</th><th>Category</th><th>Remove</th></tr></thead><tbody>${rows||'<tr><td colspan="5">All preview stops removed. DONE will look for another eligible group.</td></tr>'}</tbody></table></div>
      ${removed.length?`<div class="salesPreviewRemoved"><b>Removed from this preview</b><ul>${removed.map(a=>`<li>${html(a.name)}<button type="button" class="salesPreviewUndo" data-sales-review="undo" data-key="${html(key(a))}"${disabled}>UNDO</button></li>`).join('')}</ul></div>`:''}
      <div class="salesPreviewActions"><button type="button" class="salesPreviewDone" id="nwtbSalesPreviewDone" data-sales-review="done"${disabled}>${d.busy?'FINDING STOPS + RE-OPTIMIZING…':needed?`DONE — FILL TO ${d.settings.targetCount} STOPS`:'DONE — FINALIZE ROUTE'}</button><button type="button" class="salesPreviewCancel" data-sales-review="cancel">CANCEL</button></div>`;
  }

  async function start(order,meta={},settings=planner.settings(),previous=null){
    const own=++revision;draft=null;clearRoute();
    try{
      const clean=await window.nwtbRequireSalesRoute(order);
      if(own!==revision)return false;
      draft={order:copies(clean),settings:{...settings,targetCount:count(settings.targetCount)},meta:{...meta},
        excluded:new Set(previous?.excluded||[]),previous,busy:false,error:''};
      renderPreview();return true;
    }catch(e){if(own===revision)window.nwtbSalesSafetyWarning(e);return false;}
  }
  function remove(stopKey){
    if(!draft||draft.busy||!draft.order.some(a=>key(a)===stopKey))return;
    draft.excluded.add(stopKey);draft.error='';renderPreview();
  }
  function undo(stopKey){if(!draft||draft.busy)return;draft.excluded.delete(stopKey);draft.error='';renderPreview();}
  async function refreshAccounts(){
    const data=await window.nwtbSalesApi('accounts');
    if(!data.ok||!Array.isArray(data.accounts))throw Error('Could not refresh current Sales accounts. Try DONE again.');
    const fresh=data.accounts.map(window.nwtbNormalizeSalesAccount);
    accounts.splice(0,accounts.length,...fresh);
  }
  function finalTools(){
    const out=output();if(!out||!currentRoute.length||!finalized)return;
    out.querySelector('#nwtbSalesFinalTools')?.remove();
    const tools=document.createElement('div');tools.id='nwtbSalesFinalTools';
    tools.innerHTML='<button type="button" class="primary" data-sales-review="edit">EDIT STOPS</button><button type="button" class="primary" data-sales-review="print">PRINT ROUTE LIST</button>';
    out.prepend(tools);
    if(finalized.message){const notice=document.createElement('div');notice.className='notice';notice.id='nwtbSalesReplacementSummary';notice.setAttribute('role','status');notice.textContent=finalized.message;tools.after(notice);}
    const rows=out.querySelector('table')?.querySelectorAll('tr');
    currentRoute.forEach((a,i)=>{
      if(!finalized.added.has(key(a)))return;
      const cell=rows?.[i+1]?.children?.[1];if(!cell)return;
      const label=document.createElement('span');label.className='salesReplacement';label.textContent='REPLACEMENT STOP';cell.appendChild(label);
    });
  }
  async function done(){
    const d=draft;if(!d||d.busy)return false;
    const own=++revision;d.busy=true;d.error='';renderPreview();
    try{
      await refreshAccounts();if(own!==revision||draft!==d)return false;
      const eligible=planner.candidates(d.settings),available=new Map(eligible.map(a=>[key(a),a]));
      const selected=retained(d),kept=selected.map(a=>available.get(key(a))).filter(Boolean),keptKeys=new Set(kept.map(key));
      const pool=eligible.filter(a=>!d.excluded.has(key(a))&&!keptKeys.has(key(a)));
      const needed=d.settings.targetCount-kept.length;
      const additions=await planner.select(pool,needed,d.settings,kept);
      if(own!==revision||draft!==d)return false;
      const poolByKey=new Map(pool.map(a=>[key(a),a])),addedKeys=new Set();
      const added=[];
      for(const candidate of additions){const k=key(candidate),a=poolByKey.get(k);if(a&&!addedKeys.has(k)&&added.length<needed){addedKeys.add(k);added.push(a);}}
      if(added.length<Math.min(needed,pool.length))throw Error('Could not select the replacement stops. Your preview is saved; try DONE again.');
      const stops=kept.concat(added);
      if(!stops.length)throw Error('No eligible replacement stops remain with these filters. Undo a removal or create a route with a different area or sales type.');
      const result=await planner.optimize(stops);if(own!==revision||draft!==d)return false;
      const ordered=result.order.map(i=>stops[i]);
      const meta={...result,efficiencyFirst:d.settings.type==='new_business'};
      const rendered=await guardedRender(ordered,meta);if(own!==revision||draft!==d)return false;
      if(rendered===false)throw Error(output()?.textContent||'The cloud safety check blocked this route.');
      const shortage=d.settings.targetCount-currentRoute.length,changed=selected.length-kept.length;
      const message=[added.length?`${added.length} replacement stop${added.length===1?'':'s'} added.`:'Route finalized.',
        changed?`${changed} earlier stop${changed===1?' is':'s are'} no longer eligible and ${changed===1?'was':'were'} replaced where possible.`:'',
        shortage?`Requested ${d.settings.targetCount}; only ${currentRoute.length} eligible stops remain after your removals and filters. ${shortage} more ${shortage===1?'stop is':'stops are'} unavailable.`:`${currentRoute.length} customer stops • return to Northwest Trucks – Bolingbrook.`].filter(Boolean).join(' ');
      finalized={settings:{...d.settings},excluded:new Set(d.excluded),order:copies(currentRoute),meta,added:addedKeys,message};
      draft=null;planner.annotate(result);finalTools();return true;
    }catch(e){if(own===revision&&draft===d){clearRoute();d.busy=false;d.error=e.message||String(e);renderPreview();}return false;}
  }
  async function edit(){if(finalized&&currentRoute.length)return start(currentRoute,finalized.meta,finalized.settings,finalized);return false;}
  async function cancel(){
    const previous=draft?.previous;++revision;draft=null;clearRoute();
    if(previous){const own=revision;const ok=await guardedRender(previous.order,previous.meta);if(own!==revision)return;if(ok!==false){finalized=previous;finalTools();}}
    else{finalized=null;const out=output();if(out)out.innerHTML='<div class="notice">Route preview canceled. Choose your filters and click CREATE to start again.</div>';}
  }

  function printSheet(stops,message=''){
    document.getElementById('nwtbSalesPrintSheet')?.remove();
    const sheet=document.createElement('section');sheet.id='nwtbSalesPrintSheet';
    if(!stops.length)sheet.innerHTML='<h1>NWTB Sales Route</h1><p>Finish the route preview with DONE before printing a route list.</p>';
    else{
      const date=new Date().toLocaleDateString('en-US',{timeZone:'America/Chicago'}),meta=finalized?.meta||{};
      const estimate=[Number.isFinite(meta.miles)?`${meta.miles} estimated road miles`:'',Number.isFinite(meta.minutes)?`${meta.minutes} estimated minutes`:''].filter(Boolean).join(' • ');
      const rows=stops.map((a,i)=>`<tr><td>${i+1}</td><td><b>${html(a.name)}</b><small>${html(a.address)}</small></td><td>${html(a.phone||'—')}</td><td>${html(policy.number(a)||'—')}</td><td>${html(typeof displayType==='function'?displayType(a):a.layer||a.finalLayer)}</td><td>☐ Visited<br><br>____________</td></tr>`).join('');
      sheet.innerHTML=`<h1>NWTB BOLINGBROOK — SALES ROUTE LIST</h1><p><b>${html(date)}</b> • ${stops.length} customer stops + return to NWTB<br>${html(finalized?.settings.label||'Sales route')}${estimate?'<br>'+html(estimate):''}</p><p><b>START:</b> ${html(depot.name)} — ${html(depot.address)}</p>${message?'<p>'+html(message)+'</p>':''}<table><colgroup><col style="width:6%"><col style="width:35%"><col style="width:14%"><col style="width:11%"><col style="width:18%"><col style="width:16%"></colgroup><thead><tr><th>Stop</th><th>Business / address</th><th>Phone</th><th>Customer #</th><th>Category</th><th>Visit notes</th></tr></thead><tbody>${rows}<tr><td>${stops.length+1}</td><td colspan="5"><b>RETURN TO ${html(depot.name)}</b><small>${html(depot.address)}</small></td></tr></tbody></table>`;
    }
    document.body.appendChild(sheet);return sheet;
  }
  async function print(){
    if(draft||!currentRoute.length)return false;
    const own=revision;
    try{
      const clean=await window.nwtbRequireSalesRoute(currentRoute);
      if(own!==revision||draft)return false;
      currentRoute=clean;printSheet(clean,finalized?.message||'');window.print();return true;
    }catch(e){window.nwtbSalesSafetyWarning(e);return false;}
  }

  // Shared/saved routes also gain Edit and Print controls after their safety check.
  window.renderRoute=async function(order,meta={}){
    const own=++revision;draft=null;finalized=null;
    const ok=await guardedRender(order,meta);if(own!==revision)return false;
    if(ok!==false&&currentRoute.length){const settings={...planner.settings(),...(meta.shared?{type:'mixed',subType:'',radius:999,label:'Shared Sales Route'}:{}),targetCount:currentRoute.length};finalized={settings,excluded:new Set(),order:copies(currentRoute),meta,added:new Set(),message:''};finalTools();}
    return ok;
  };
  output()?.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-sales-review]');if(!button)return;
    const action=button.dataset.salesReview;
    if(action==='remove')remove(button.dataset.key);
    else if(action==='undo')undo(button.dataset.key);
    else if(action==='done')void done();
    else if(action==='cancel')void cancel();
    else if(action==='edit')void edit();
    else if(action==='print')void print();
  });
  window.addEventListener('beforeprint',()=>{
    const checked=draft?{ok:false}:policy.validate(currentRoute,accounts);
    printSheet(checked.ok?checked.stops:[],finalized?.message||'');
  });
  window.nwtbSalesRoutePreview={start,reset,remove,undo,done,edit,cancel,print};
})();
