(function(){
const ROUTE_ADMIN='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-delivery-route-admin';
const LOCATION_RESOLVER='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-location-resolver';
function addRouteAdminUI(){
 const d=document;
 if(!d.getElementById('nwtbRouteAdminStyle')){const s=d.createElement('style');s.id='nwtbRouteAdminStyle';s.textContent='.rowActions{display:flex;gap:6px;flex-wrap:wrap}.mini{padding:6px 9px!important;font-size:10px!important}.modalBack{position:fixed;inset:0;background:rgba(15,23,42,.52);display:none;align-items:center;justify-content:center;z-index:1000;padding:20px}.modalBack.show{display:flex}.modal{width:min(820px,96vw);max-height:86vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(15,23,42,.28);border:1px solid #e4e7ec;padding:20px}.modalHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.routeStopList{margin-top:14px;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden}.routeStopItem{padding:11px 12px;border-bottom:1px solid #eef1f4}.routeStopItem:last-child{border-bottom:0}.routeStopItem b{font-size:12px}.routeStopItem span{display:block;font-size:11px;color:#667085;margin-top:3px}.routeChoice{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid #e4e7ec;border-radius:12px;padding:13px;margin-top:10px}.routeChoice b{font-size:12px}.routeChoice span{display:block;font-size:10px;color:#667085;margin-top:4px}.dangerMini{background:#fff1f0!important;color:#b42318!important;border:1px solid #fecdca!important}';d.head.appendChild(s)}
 const tr=d.querySelector('#ordersBody')?.closest('table')?.querySelector('thead tr');if(tr&&!tr.querySelector('[data-actions]')){const th=d.createElement('th');th.dataset.actions='1';th.textContent='Actions';tr.appendChild(th)}
 if(!d.getElementById('routeModal')){const x=d.createElement('div');x.id='routeModal';x.className='modalBack';x.innerHTML='<div class="modal"><div class="modalHead"><div><h2 id="routeModalTitle">Route Details</h2><div id="routeModalSub" class="sub"></div></div><button class="btn ghost" onclick="closeRouteModal()">CLOSE</button></div><div id="routeModalBody"></div></div>';x.onclick=e=>{if(e.target===x)closeRouteModal()};d.body.appendChild(x)}
}
window.closeRouteModal=function(){document.getElementById('routeModal')?.classList.remove('show')};
function officeRouteLinks(r,stops){
 const depot=String(r?.depot||'BOLINGBROOK').toUpperCase();
 const depots={BOLINGBROOK:{name:'Northwest Trucks - Bolingbrook',address:'201 S W Frontage Rd, Bolingbrook, IL 60440'},PALATINE:{name:'Northwest Trucks - Palatine',address:'2120 N Rand Rd, Palatine, IL 60074'}};
 const d=depots[depot]||depots.BOLINGBROOK;
 const start={name:r?.start_name||d.name,address:r?.start_address||d.address};
 const stopPts=(stops||[]).map(s=>{const o=s.delivery_orders||{};return{name:o.customer_name||'Stop',address:o.address||''}});
 let final={name:r?.end_name||d.name,address:r?.end_address||d.address},way=stopPts.slice();
 if(r?.end_mode==='SAME_AS_START')final={...start};
 if(r?.end_mode==='LAST_STOP'&&stopPts.length){final=stopPts[stopPts.length-1];way=stopPts.slice(0,-1)}
 const encLoc=x=>encodeURIComponent((x.name||'Location')+', '+(x.address||''));
 const links=[];if(!stopPts.length)return links;
 if(way.length<=9){links.push({label:'OPEN FULL ROUTE IN GOOGLE MAPS',url:'https://www.google.com/maps/dir/?api=1&origin='+encLoc(start)+'&destination='+encLoc(final)+'&travelmode=driving&waypoints='+way.map(encLoc).join('%7C')});return links}
 let current=start,i=0,part=1;
 while(i<way.length){const remaining=way.slice(i),last=remaining.length<=9,chunk=remaining.slice(0,last?9:10),dest=last?final:chunk[chunk.length-1],wps=last?chunk:chunk.slice(0,-1);links.push({label:'OPEN ROUTE PART '+part+(last?' — FINAL':''),url:'https://www.google.com/maps/dir/?api=1&origin='+encLoc(current)+'&destination='+encLoc(dest)+'&travelmode=driving&waypoints='+wps.map(encLoc).join('%7C')});current=dest;i+=chunk.length;part++}
 return links
}
window.viewRouteForStop=async function(orderId){
 try{
  showBanner('routeMsg','Loading read-only office route preview…','info');
  const j=await post(ROUTE_ADMIN,{action:'route_for_order',order_id:orderId});
  clearBanner('routeMsg');
  const r=j.route,stops=j.stops||[],links=officeRouteLinks(r,stops);
  const drive=r.drive_minutes!=null?Number(r.drive_minutes):null,svc=r.service_minutes!=null?Number(r.service_minutes):null,total=r.estimated_minutes!=null?Number(r.estimated_minutes):null,retMi=r.return_miles!=null?Number(r.return_miles):null,retMin=r.return_minutes!=null?Number(r.return_minutes):null;
  document.getElementById('routeModalTitle').textContent='OFFICE ROUTE PREVIEW • '+r.route_date;
  document.getElementById('routeModalSub').textContent='READ ONLY • '+r.status+' • '+r.wave+' • '+r.driver_name+' • '+(r.depot||'BOLINGBROOK')+' start + return';
  document.getElementById('routeModalBody').innerHTML=
   '<div class="banner show ok" style="margin-top:12px"><b>READ-ONLY OFFICE PREVIEW</b> — opening this screen does not start the route, create a driver session, change route status, or affect the driver’s 4-digit login.</div>'+
   '<div class="routeSummary">'+
    '<div class="routeMetric"><span>Driver</span><b>'+esc(r.driver_name)+'</b></div>'+
    '<div class="routeMetric"><span>Stops</span><b>'+stops.length+'</b></div>'+
    '<div class="routeMetric"><span>Total Miles</span><b>'+(r.estimated_miles!=null?Number(r.estimated_miles).toFixed(1)+' mi':'Recalculate needed')+'</b></div>'+
    '<div class="routeMetric"><span>Drive Time</span><b>'+(drive!=null?formatMinutes(drive):(total!=null?formatMinutes(total):'Recalculate needed'))+'</b></div>'+
    '<div class="routeMetric"><span>Service Time</span><b>'+(svc!=null?formatMinutes(svc):'—')+'</b></div>'+
    '<div class="routeMetric"><span>Total Route Time</span><b>'+(total!=null?formatMinutes(total):'Recalculate needed')+'</b></div>'+
    '<div class="routeMetric"><span>Return Depot</span><b>'+esc(String(r.depot||'BOLINGBROOK'))+'</b></div>'+
    '<div class="routeMetric"><span>Return Leg</span><b>'+(retMi!=null?retMi.toFixed(1)+' mi':'—')+(retMin!=null?' • '+formatMinutes(retMin):'')+'</b></div>'+
   '</div>'+
   '<div class="toolbar" style="margin-top:12px">'+links.map(x=>'<a class="btn blue" target="_blank" rel="noopener" href="'+x.url+'" style="text-decoration:none">'+esc(x.label)+'</a>').join('')+'</div>'+
   '<div class="routeStopList">'+stops.map(s=>{const o=s.delivery_orders||{};return '<div class="routeStopItem"><b>STOP '+s.stop_sequence+': '+esc(o.customer_name||'')+'</b><span>'+esc(o.address||'')+' • '+esc(typeLabel(o.stop_type||''))+' • '+esc(s.status||o.status||'')+'</span></div>'}).join('')+'</div>';
  document.getElementById('routeModal').classList.add('show')
 }catch(e){clearBanner('routeMsg');showBanner('routeMsg',e.message,'err')}
};
window.reassignRoute=async function(routeId){const driver=document.getElementById('modalDriver').value,box=document.getElementById('modalMsg');box.className='banner show info';box.textContent='Reassigning route…';try{const j=await post(ROUTE_ADMIN,{action:'reassign_route',route_id:routeId,driver_employee_number:driver});box.className='banner show ok';box.textContent='Route reassigned to '+j.driver_name+'.';await refreshAll();setTimeout(closeRouteModal,900)}catch(e){box.className='banner show err';box.textContent=e.message}};
window.removeStopFromRoute=async function(orderId){if(!confirm('Remove this stop from its route and return it to AVAILABLE? If the route is active, the driver will receive an alert and sound.'))return;try{showBanner('routeMsg','Removing stop from route…','info');const j=await post(ROUTE_ADMIN,{action:'remove_stop',order_id:orderId});closeRouteModal();showBanner('routeMsg',j.route_status==='ACTIVE'?'Stop removed. '+j.driver_name+' will be notified on the Driver Route page.':'Stop returned to the AVAILABLE queue.','ok');await refreshAll()}catch(e){showBanner('routeMsg',e.message,'err')}};
window.unassignStop=window.removeStopFromRoute;
window.chooseRouteForStop=async function(orderId){try{const j=await post(API,{action:'routes_list'}),routes=(j.routes||[]).filter(r=>['PLANNED','ACTIVE'].includes(r.status));document.getElementById('routeModalTitle').textContent='Add Stop to Route';document.getElementById('routeModalSub').textContent='Choose the driver route. Active drivers will be notified immediately.';document.getElementById('routeModalBody').innerHTML=routes.map(r=>{const d=(drivers||[]).find(x=>x.employee_number===r.driver_employee_number),nm=d?d.display_name:r.driver_employee_number;return '<div class="routeChoice"><div><b>'+esc(nm)+' • '+esc(r.status)+'</b><span>'+esc(r.route_date)+' • '+esc(r.wave)+' • BOLINGBROOK START/RETURN</span></div><button class="btn blue" onclick="addStopToRoute(\''+orderId+'\',\''+r.id+'\')">ADD TO ROUTE</button></div>'}).join('')||'<div class="empty">No planned or active routes are available.</div>';document.getElementById('routeModal').classList.add('show')}catch(e){showBanner('routeMsg',e.message,'err')}};
window.addStopToRoute=async function(orderId,routeId){try{const j=await post(ROUTE_ADMIN,{action:'add_stop',order_id:orderId,route_id:routeId});closeRouteModal();showBanner('routeMsg',j.route_status==='ACTIVE'?'Stop added to '+j.driver_name+' at stop '+j.stop_sequence+'. Driver alert sent.':'Stop added to '+j.driver_name+' at stop '+j.stop_sequence+'.','ok');await refreshAll()}catch(e){showBanner('routeMsg',e.message,'err')}};
window.renderOrders=function(){addRouteAdminUI();let active=orders.filter(o=>!['DELIVERED','CANCELED'].includes(o.status));if(queueMode==='AVAILABLE')active=active.filter(o=>o.status==='UNASSIGNED');if(queueMode==='ROUTED')active=active.filter(o=>o.status==='ROUTED');if(queueMode==='OUT')active=active.filter(o=>o.status==='OUT_FOR_DELIVERY');document.getElementById('ordersBody').innerHTML=active.map(o=>{const selectable=o.status==='UNASSIGNED',located=validCoord(o.lat,o.lon),pc=o.priority==='HOT_SHOT'?'pill hot':o.priority==='PRIORITY'?'pill priority':'pill',row=selectable?'':'class="mutedrow"';let a='—';if(o.status==='UNASSIGNED'&&located)a='<button class="btn blue mini" onclick="chooseRouteForStop(\''+o.id+'\')">ADD TO ROUTE</button>';else if(o.status==='ROUTED')a='<div class="rowActions"><button class="btn ghost mini" onclick="viewRouteForStop(\''+o.id+'\')">OFFICE PREVIEW</button><button class="btn ghost mini dangerMini" onclick="removeStopFromRoute(\''+o.id+'\')">RETURN TO QUEUE</button></div>';else if(o.status==='OUT_FOR_DELIVERY')a='<div class="rowActions"><button class="btn ghost mini" onclick="viewRouteForStop(\''+o.id+'\')">OFFICE PREVIEW</button><button class="btn ghost mini dangerMini" onclick="removeStopFromRoute(\''+o.id+'\')">REMOVE + NOTIFY</button></div>';return '<tr '+row+'><td>'+(selectable?'<input class="pick" type="checkbox" value="'+o.id+'" onchange="updateSelected()">':'—')+'</td><td><span class="'+typeClass(o.stop_type)+'">'+esc(typeLabel(o.stop_type))+'</span></td><td><span class="'+pc+'">'+esc(o.priority)+'</span></td><td>'+esc(o.sales_order_no||o.reference_no||'—')+'</td><td><b>'+esc(o.customer_name)+'</b><br><span class="small">'+esc(o.source_ref||o.customer_number||'')+'</span></td><td>'+esc(o.address)+'</td><td>'+esc(o.pieces)+'</td><td>'+statusPill(o.status)+'</td><td><span class="coord '+(located?'good':'bad')+'">'+(located?'READY':'NEEDS LOCATION')+'</span></td><td>'+a+'</td></tr>'}).join('')||'<tr><td colspan="10"><div class="empty">'+(queueMode==='AVAILABLE'?'No unassigned stops are waiting for dispatch.':'No stops in this view.')+'</div></td></tr>'};
setTimeout(()=>{addRouteAdminUI();renderOrders()},250);
})();
