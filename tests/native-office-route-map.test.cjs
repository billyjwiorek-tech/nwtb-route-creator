const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../office-route-map.js'),'utf8');
const context={};vm.createContext(context);vm.runInContext(source,context);const {model,valid}=context.NWTBOfficeRouteMap;
const route={id:'fixture-route',depot:'PALATINE',route_mode:'MULTI_DRIVER_OPTIMIZED',end_mode:'RETURN_DEPOT'};
const rows=[{id:'s2',order_id:'o2',stop_sequence:2,status:'PENDING',delivery_orders:{customer_name:'Second',lat:42.1,lon:-88.1}},{id:'s1',order_id:'o1',stop_sequence:1,status:'DELIVERED',delivery_orders:{customer_name:'First',lat:42.2,lon:-88.2}}];
const before=JSON.stringify({route,rows}),m=model(route,rows);
assert.equal(JSON.stringify({route,rows}),before,'Preview must not mutate saved route data');
assert.equal(m.points.map(p=>p.label).join(','),'START,1,2,RETURN');
assert.equal(m.stops.map(p=>p.orderId).join(','),'o1,o2');
assert.equal(m.start.lat,42.148326);assert.equal(m.end.lon,-88.033080);
const custom={...route,route_mode:'CUSTOM',start_name:'Custom start',start_lat:41.9,start_lon:-87.9,end_name:'Custom end',end_address:'End address',end_lat:42.3,end_lon:-87.8,end_mode:'CUSTOM'};
const cm=model(custom,rows);assert.equal(cm.start.lat,41.9);assert.equal(cm.end.lat,42.3);
assert.equal(model({...custom,end_mode:'LAST_STOP'},rows).points.length,3);
assert.equal(model({...custom,end_mode:'SAME_AS_START'},rows).end.lat,41.9);
assert.equal(model({...custom,start_lat:null},rows).missing.length,1);
assert.equal(model(route,[{...rows[0],delivery_orders:{...rows[0].delivery_orders,lat:null}}]).missing.length,1);
assert.equal(valid({lat:null,lon:-88}),false);assert.equal(valid({lat:Infinity,lon:-88}),false);assert.equal(valid({lat:0,lon:0}),false);
const admin=fs.readFileSync(path.join(__dirname,'../dispatch-route-admin-native.js'),'utf8');
assert.ok(!/google\.com\/maps/.test(admin),'Office preview stays inside NWTB');
assert.ok(!/route_start|driver_token|geolocation|driver-bootstrap/.test(source+admin),'Office preview cannot start routes, create driver sessions or GPS');
for(const f of ['dispatch-native.html','dispatch-live.html']){const html=fs.readFileSync(path.join(__dirname,'..',f),'utf8');assert.ok(html.indexOf('office-route-map.js?v=20261015-officemap1')<html.indexOf('dispatch-route-admin-native.js?v=20261020-returnleg1'));assert.ok(html.includes('viewOfficeRoute'));}
console.log('PASS: saved route order and identity, depots, custom endpoints, last-stop ending, missing coordinates, no route mutations, no driver/GPS actions, native Office wiring');
async function rendererTest(){
 const els=new Map(),lines=[],pins=[],maps=[],calls=[];let started=0;
 function el(id){if(!els.has(id))els.set(id,{id,textContent:'',innerHTML:'',className:'',scrollIntoView(){}});return els.get(id)}
 const mapStub=()=>{const x={removed:false,remove(){this.removed=true},setView(){return this},fitBounds(){return this},invalidateSize(){}};maps.push(x);return x};
 const L={map:mapStub,tileLayer:()=>({addTo(){}}),latLngBounds:x=>x,divIcon:x=>x,marker:(ll,opts)=>{const x={ll,opts,addTo(){pins.push(x);return this},bindPopup(p){this.popup=p;return this},getLatLng(){return ll},openPopup(){this.opened=true}};return x},polyline:(ll,opts)=>{const x={ll,opts,addTo(){lines.push(x);return this},bindTooltip(){return this}};return x}};
 const ctx={L,AbortController,requestAnimationFrame:fn=>fn(),document:{getElementById:el,createElement:()=>({}),head:{appendChild(){}}}};vm.createContext(ctx);vm.runInContext(source,ctx);const api=ctx.NWTBOfficeRouteMap;
 const synthetic=api.model({...route,depot:'BOLINGBROOK'},rows);
 await api.render(synthetic,async(a,b,signal)=>{calls.push({a,b,signal});return {geometry:[[a.lon,a.lat],[b.lon,b.lat]]}});
 assert.equal(calls.length,3);assert.equal(lines.length,3);assert.equal(lines[2].opts.color,'#f58220');assert.equal(pins.length,3);assert.ok(el('officeMapStatus').textContent.startsWith('Full saved route'));
 assert.equal(calls[0].b.orderId,'o1');assert.equal(calls[1].b.orderId,'o2');assert.equal(calls[2].b.kind,'RETURN');
 api.focus(1);assert.ok(pins[1].opened);
 await api.render(synthetic,async()=>{throw Error('offline')});assert.ok(el('officeMapStatus').textContent.startsWith('Road path incomplete'));assert.equal(lines.length,3,'No fake straight lines after routing failure');
 const missing=api.model({...route,route_mode:'CUSTOM',start_lat:null},rows);await api.render(missing,async()=>{started++;});assert.equal(started,0);assert.ok(el('officeMapStatus').textContent.includes('need saved coordinates'));
 let settle;const pending=api.render(synthetic,(a,b,signal)=>new Promise((resolve,reject)=>{settle=resolve;signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true})}));await new Promise(r=>setImmediate(r));api.destroy();const staleStatus=el('officeMapStatus').textContent;settle({geometry:[[1,1],[2,2]]});await pending;
 // Both workers are aborted; the old view must not redraw or overwrite the next screen.
 assert.ok(maps[maps.length-1].removed);assert.equal(el('officeMapStatus').textContent,staleStatus);
 console.log('PASS: road leg order, return leg, numbered pins, focus, error/missing-coordinate states, stale-view cancellation');
}
rendererTest().catch(e=>{console.error(e);process.exitCode=1});
async function previewTest(){
 for(const [status,released,label] of [['PLANNED',false,'OFFICE ONLY — NOT RELEASED'],['PLANNED',true,'RELEASED TO DRIVER'],['ACTIVE',true,'ACTIVE ROUTE']]){
  const elements=new Map(),requests=[];const get=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',dataset:{},classList:{add(){},remove(){}}});return elements.get(id)};
  const ctx={console,AbortController,setTimeout(){},document:{getElementById:get},showBanner(){},clearBanner(){},formatMinutes:n=>n+' min',typeLabel:x=>x,esc:x=>String(x??''),officeProtectedPost:async(url,request)=>{requests.push(request);return {route:{...route,status,released_to_driver:released,estimated_miles:50,estimated_minutes:120,drive_minutes:90,service_minutes:30,return_miles:10,return_minutes:20,driver_name:'Test'},stops:rows}}};ctx.window=ctx;
  vm.createContext(ctx);vm.runInContext(source,ctx);let rendered;ctx.NWTBOfficeRouteMap.html=()=>'<div id="officeRouteMap"></div>';ctx.NWTBOfficeRouteMap.render=m=>{rendered=m};
  vm.runInContext(admin,ctx);const previewHandler=ctx.viewRouteForStop;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dispatch-priority-live.js'),'utf8'),ctx);
  assert.equal(ctx.viewRouteForStop,previewHandler,'Priority editing must not wrap the read-only preview');
  await ctx.viewOfficeRoute('fixture-route');const html=get('routeModalBody').innerHTML;
  assert.equal(get('routeModalBody').dataset.officeRouteMode,'preview');
  assert.equal(typeof ctx.editRoutePriorityForStop,'function','Priority editing remains available as an explicit action');
  assert.ok(html.includes(label));assert.ok(html.includes('120 min'));assert.ok(html.includes('90 min'));assert.ok(html.includes('30 min'));assert.ok(html.includes('officeRouteMap'));assert.ok(!html.includes('google.com'));assert.equal(JSON.stringify(requests),JSON.stringify([{action:'route_details',route_id:'fixture-route'}]));assert.equal(rendered.stops.map(p=>p.orderId).join(','),'o1,o2');
  if(status==='ACTIVE')assert.ok(!html.includes('onclick="releaseOfficeRoute')&&!html.includes('onclick="holdOfficeRoute'));
 }
 console.log('PASS: Office preview uses saved route ID, all three release states, stored metrics, same ordered driver stops, read-only loading');
}
previewTest().catch(e=>{console.error(e);process.exitCode=1});
