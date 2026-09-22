(function(){
const ROUTE_ADMIN='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-delivery-route-admin';
const LOCATION_RESOLVER='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-location-resolver';
function addRouteAdminUI(){
 const d=document;
 if(!d.getElementById('nwtbRouteAdminStyle')){const s=d.createElement('style');s.id='nwtbRouteAdminStyle';s.textContent='.rowActions{display:flex;gap:6px;flex-wrap:wrap}.mini{padding:6px 9px!important;font-size:10px!important}.modalBack{position:fixed;inset:0;background:rgba(15,23,42,.52);display:none;align-items:center;justify-content:center;z-index:1000;padding:20px}.modalBack.show{display:flex}.modal{width:min(780px,96vw);max-height:86vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(15,23,42,.28);border:1px solid #e4e7ec;padding:20px}.modalHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.routeStopList{margin-top:14px;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden}.routeStopItem{padding:11px 12px;border-bottom:1px solid #eef1f4}.routeStopItem:last-child{border-bottom:0}.routeStopItem b{font-size:12px}.routeStopItem span{display:block;font-size:11px;color:#667085;margin-top:3px}';d.head.appendChild(s)}
 const tr=d.querySelector('#ordersBody')?.closest('table')?.querySelector('thead tr');if(tr&&!tr.querySelector('[data-actions]')){const th=d.createElement('th');th.dataset.actions='1';th.textContent='Actions';tr.appendChild(th)}
 if(!d.getElementById('routeModal')){const x=d.createElement('div');x.id='routeModal';x.className='modalBack';x.innerHTML='<div class="modal"><div class="modalHead"><div><h2 id="routeModalTitle">Route Details</h2><div id="routeModalSub" class="sub"></div></div><button class="btn ghost" onclick="closeRouteModal()">CLOSE</button></div><div id="routeModalBody"></div></div>';x.onclick=e=>{if(e.target===x)closeRouteModal()};d.body.appendChild(x)}
}

window.useResult=async function(i,saved){
 const r=window['_search_'+i];if(!r)return;
 const sourceType=r.source_type||((document.getElementById('dirKind')?.value)==='VENDOR'?'VENDOR':'CUSTOMER');
 const sourceRef=r.source_ref||r.customer_number||r.vendor_id||'';
 const rawAddress=r.address||[r.addr1,r.addr2,r.city,r.state].filter(Boolean).join(', ');
 const savedId=saved?(r.id||''):'';
 document.getElementById('stopName').value=r.name||'';
 document.getElementById('sourceRef').value=sourceRef;
 document.getElementById('address').value=rawAddress;
 document.getElementById('phone').value=r.phone||r.phone_work||r.phone_home||'';
 document.getElementById('sourceType').value=sourceType;
 document.getElementById('savedLocationId').value=savedId;
 document.getElementById('lat').value='';document.getElementById('lon').value='';
 try{
  showBanner('addMsg','Loading verified physical location…','info');
  const j=await post(LOCATION_RESOLVER,{source_type:sourceType,source_ref:sourceRef,saved_location_id:savedId,name:r.name||'',address:rawAddress});
  document.getElementById('address').value=j.address||rawAddress;
  document.getElementById('lat').value=j.lat??'';document.getElementById('lon').value=j.lon??'';
  if(j.saved_location_id)document.getElementById('savedLocationId').value=j.saved_location_id;
  showBanner('addMsg',j.verified?'Verified physical route location loaded.':'Physical route location located.','ok');
 }catch(e){showBanner('addMsg',e.message,'err')}
};
window.resolveFormCoords=async function(){
 const address=document.getElementById('address').value.trim(),lat=document.getElementById('lat').value,lon=document.getElementById('lon').value;
 if(validCoord(lat,lon))return {lat:Number(lat),lon:Number(lon)};
 if(!address)throw Error('Enter a physical route address first.');
 const j=await post(LOCATION_RESOLVER,{source_type:document.getElementById('sourceType').value||'OTHER',source_ref:document.getElementById('sourceRef').value||'',saved_location_id:document.getElementById('savedLocationId').value||'',name:document.getElementById('stopName').value||'',address});
 document.getElementById('address').value=j.address||address;document.getElementById('lat').value=j.lat;document.getElementById('lon').value=j.lon;if(j.saved_location_id)document.getElementById('savedLocationId').value=j.saved_location_id;
 if(!validCoord(j.lat,j.lon))throw Error('The physical address could not be located. Verify the address before adding the stop.');
 return {lat:Number(j.lat),lon:Number(j.lon)};
};

window.closeRouteModal=function(){document.getElementById('routeModal')?.classList.remove('show')};
window.viewRouteForStop=async function(orderId){try{showBanner('routeMsg','Loading route details…','info');const j=await post(ROUTE_ADMIN,{action:'route_for_order',order_id:orderId});clearBanner('routeMsg');const r=j.route,stops=j.stops||[];const opts=drivers.map(d=>'<option value="'+esc(d.employee_number)+'" '+(d.employee_number===r.driver_employee_number?'selected':'')+'>'+esc(d.display_name)+' ('+esc(d.employee_number)+')</option>').join('');document.getElementById('routeModalTitle').textContent='Route • '+r.route_date;document.getElementById('routeModalSub').textContent=r.status+' • '+r.wave+' • Northwest Trucks Bolingbrook start + return';document.getElementById('routeModalBody').innerHTML='<div class="routeSummary"><div class="routeMetric"><span>Driver</span><b>'+esc(r.driver_name)+'</b></div><div class="routeMetric"><span>Stops</span><b>'+stops.length+'</b></div><div class="routeMetric"><span>Miles</span><b>'+(r.estimated_miles?Number(r.estimated_miles).toFixed(1)+' mi':'Recalculate needed')+'</b></div><div class="routeMetric"><span>Drive Time</span><b>'+(r.estimated_minutes?formatMinutes(r.estimated_minutes):'Recalculate needed')+'</b></div><div class="routeMetric"><span>Status</span><b>'+esc(r.status)+'</b></div></div>'+(r.status==='PLANNED'?'<div class="panel" style="box-shadow:none;margin-top:14px"><h3>Reassign Planned Route</h3><div class="sub">Move this whole planned route to another driver before it starts.</div><div style="display:flex;gap:8px;margin-top:10px"><select id="modalDriver">'+opts+'</select><button class="btn blue" onclick="reassignRoute(\''+r.id+'\')">REASSIGN ROUTE</button></div><div id="modalMsg" class="banner"></div></div>':'')+'<div class="routeStopList">'+stops.map(s=>{const o=s.delivery_orders||{};return '<div class="routeStopItem"><b>STOP '+s.stop_sequence+': '+esc(o.customer_name||'')+'</b><span>'+esc(o.address||'')+' • '+esc(typeLabel(o.stop_type||''))+' • '+esc(o.status||s.status||'')+'</span></div>'}).join('')+'</div>';document.getElementById('routeModal').classList.add('show')}catch(e){clearBanner('routeMsg');showBanner('routeMsg',e.message,'err')}};
window.reassignRoute=async function(routeId){const driver=document.getElementById('modalDriver').value,box=document.getElementById('modalMsg');box.className='banner show info';box.textContent='Reassigning route…';try{const j=await post(ROUTE_ADMIN,{action:'reassign_route',route_id:routeId,driver_employee_number:driver});box.className='banner show ok';box.textContent='Route reassigned to '+j.driver_name+'.';await refreshAll();setTimeout(closeRouteModal,900)}catch(e){box.className='banner show err';box.textContent=e.message}};
window.unassignStop=async function(orderId){if(!confirm('Return this stop to the AVAILABLE dispatch queue? The planned route will be updated.'))return;try{showBanner('routeMsg','Returning stop to the dispatch queue…','info');const j=await post(ROUTE_ADMIN,{action:'unassign_order',order_id:orderId});showBanner('routeMsg',j.route_canceled?'Stop returned to queue. The empty route was canceled.':'Stop returned to queue. The remaining planned route must be re-optimized before use.','ok');await refreshAll();setQueue('AVAILABLE',document.querySelector('.filter[data-q="AVAILABLE"]'))}catch(e){showBanner('routeMsg',e.message,'err')}};
window.renderOrders=function(){addRouteAdminUI();let active=orders.filter(o=>!['DELIVERED','CANCELED'].includes(o.status));if(queueMode==='AVAILABLE')active=active.filter(o=>o.status==='UNASSIGNED');if(queueMode==='ROUTED')active=active.filter(o=>o.status==='ROUTED');if(queueMode==='OUT')active=active.filter(o=>o.status==='OUT_FOR_DELIVERY');document.getElementById('ordersBody').innerHTML=active.map(o=>{const selectable=o.status==='UNASSIGNED',located=validCoord(o.lat,o.lon),pc=o.priority==='HOT_SHOT'?'pill hot':o.priority==='PRIORITY'?'pill priority':'pill',row=selectable?'':'class="mutedrow"';let a='—';if(o.status==='ROUTED')a='<div class="rowActions"><button class="btn ghost mini" onclick="viewRouteForStop(\''+o.id+'\')">VIEW ROUTE</button><button class="btn ghost mini" onclick="unassignStop(\''+o.id+'\')">RETURN TO QUEUE</button></div>';else if(o.status==='OUT_FOR_DELIVERY')a='<button class="btn ghost mini" onclick="viewRouteForStop(\''+o.id+'\')">VIEW ROUTE</button>';return '<tr '+row+'><td>'+(selectable?'<input class="pick" type="checkbox" value="'+o.id+'" onchange="updateSelected()">':'—')+'</td><td><span class="'+typeClass(o.stop_type)+'">'+esc(typeLabel(o.stop_type))+'</span></td><td><span class="'+pc+'">'+esc(o.priority)+'</span></td><td>'+esc(o.sales_order_no||o.reference_no||'—')+'</td><td><b>'+esc(o.customer_name)+'</b><br><span class="small">'+esc(o.source_ref||o.customer_number||'')+'</span></td><td>'+esc(o.address)+'</td><td>'+esc(o.pieces)+'</td><td>'+statusPill(o.status)+'</td><td><span class="coord '+(located?'good':'bad')+'">'+(located?'READY':'NEEDS LOCATION')+'</span></td><td>'+a+'</td></tr>'}).join('')||'<tr><td colspan="10"><div class="empty">'+(queueMode==='AVAILABLE'?'No unassigned stops are waiting for dispatch.':'No stops in this view.')+'</div></td></tr>'};
setTimeout(()=>{addRouteAdminUI();renderOrders()},250);
})();
