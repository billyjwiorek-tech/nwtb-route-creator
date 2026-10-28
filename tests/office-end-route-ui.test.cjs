'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm');
const {fixture:office,settle}=require('./office-driver-view-ui.test.cjs');
const {fixture:driver}=require('./driver-map-lifecycle.test.cjs');
async function unlock(f){f.document.getElementById('overridePin').value='fixture-pin';await f.document.getElementById('pinForm').onsubmit({preventDefault(){}});await settle();}
async function submit(f){await f.document.getElementById('overrideForm').onsubmit({preventDefault(){}});await settle();}
async function officeTests(){
 for(const phase of ['ACTIVE','PLANNED','RETURN']){
  const f=office({phase});f.data.stops=[];await f.boot();assert.equal(f.document.getElementById('endRoute').disabled,false);
  await f.click('endRoute');assert.equal(f.document.getElementById('overrideOperation').value,'end_route');assert.equal(f.document.getElementById('targetLabel').hidden,true);
  assert.ok(!f.requests.some(x=>x.body.action==='override'),'Opening END ROUTE must not mutate a route');
  assert.ok(f.document.getElementById('overrideNotice').textContent.includes('0 unfinished stop(s)'));
  await unlock(f);assert.ok(!f.requests.some(x=>x.body.action==='override'),'PIN verification alone cannot end a route');
  await submit(f);assert.ok(!f.requests.some(x=>x.body.action==='override'),'A reason is required');
  f.document.getElementById('overrideReason').value='Fixture route no longer needed';f.ctx.confirm=()=>false;await submit(f);assert.ok(!f.requests.some(x=>x.body.action==='override'),'Canceled confirmation cannot end the route');
  f.ctx.confirm=()=>true;await submit(f);const write=f.requests.find(x=>x.body.action==='override');
  assert.equal(write.body.override.operation,'end_route');assert.deepEqual(write.body.override.expected_stops,[]);assert.equal(write.body.override.route_id,f.data.route.id);assert.equal(write.body.pin,'fixture-pin');
  assert.equal(f.document.getElementById('endRoute').disabled,true);assert.equal(f.document.getElementById('officeOverride').disabled,true);assert.match(f.document.getElementById('viewStatus').textContent,/ROUTE ENDED BY OFFICE/);
  assert.ok(f.storageReads.every(k=>k==='nwtb_delivery_token'));
 }
 const f=office();await f.boot();await f.click('endRoute');await unlock(f);f.document.getElementById('overrideReason').value='Fixture unfinished work';await submit(f);
 const op=f.requests.find(x=>x.body.action==='override').body.override;assert.equal(op.expected_stops.length,1);assert.equal(op.expected_stops[0].status,'PENDING');assert.equal(op.expected_stops[0].updated_at,'2026-10-26T13:00:00Z');
 const closed=office({phase:'COMPLETED'});await closed.boot();assert.equal(closed.document.getElementById('endRoute').disabled,true);await closed.click('endRoute');assert.equal(closed.document.getElementById('overrideDialog').hidden,true);
 const moved=office();await moved.boot();moved.window.nwtbBeginOfficeEndRoute('another-route','1234');assert.equal(moved.document.getElementById('overrideDialog').hidden,true);moved.window.nwtbBeginOfficeEndRoute(moved.data.route.id,'5678');assert.equal(moved.document.getElementById('overrideDialog').hidden,true);assert.ok(!moved.requests.some(x=>x.body.action==='override'));
}
async function driverTests(){
 for(const options of [{ios:true},{android:true},{standard:true}]){
  const f=driver(options);let ended=false,idle=0;const original=f.window.fetch;
  f.window.nwtbContinueIdleTracking=()=>idle++;
  f.window.fetch=async(url,init)=>{const body=JSON.parse(init?.body||'{}');if(body.action==='route_changes'&&ended)return f.response({route_status:'CANCELED',events:[{id:88,event_type:'OFFICE_ROUTE_ENDED',note:'Fixture: Dispatch ended route'}]});if(body.action==='driver_routes'&&ended)return f.response({routes:[]});return original(url,init);};
  await f.open();if(!options.standard)await f.begin();
  const officeToken=f.local.get('nwtb_delivery_token'),driverToken=f.local.get('nwtb_driver_token');
  ended=true;f.data.route.status='CANCELED';await f.ctx.checkRouteChanges(f.data.route.id);await settle();
  assert.equal(vm.runInContext('route',f.ctx),'');assert.equal(vm.runInContext('driver',f.ctx),'1234');assert.equal(f.local.get('nwtb_driver_token'),driverToken);assert.equal(f.local.get('nwtb_delivery_token'),officeToken);
  assert.equal(f.window.__nwtbDriverTrackingRoute,null);assert.match(f.document.getElementById('routeAlert').textContent,/ROUTE ENDED BY DISPATCH/);assert.ok(!f.document.getElementById('routes').textContent.includes('COMPLETE'));
  if(!options.standard){assert.equal(f.private.target,null);assert.equal(f.watches.size,0);assert.equal(idle,1);assert.equal(f.document.getElementById('nwtbNavPanel').classList.contains('show'),false);}
  else assert.equal(f.fixes(),0,'Standard route ending must not request GPS');
  assert.ok(!f.requests.some(x=>['route_start_driver','route_return_driver','stop_status_driver'].includes(x.body.action)),'The phone handles an ended route without starting, returning or completing it');
 }
 // A route read that began before cancellation must not redraw the old controls.
 const f=driver({ios:true});await f.open();await f.begin();let release,hold=true,ended=false;const original=f.window.fetch;
 f.window.fetch=async(url,init)=>{const body=JSON.parse(init?.body||'{}');if(body.action==='route_get'&&hold){hold=false;const value=await original(url,init);return new Promise(resolve=>release=()=>resolve(value));}if(body.action==='driver_routes'&&ended)return f.response({routes:[]});return original(url,init);};
 const pending=f.window.openRoute(f.data.route.id);await settle();assert.equal(typeof release,'function');ended=true;f.data.route.status='CANCELED';await f.ctx.handleOfficeEndedRoute(f.data.route.id);release();await pending;assert.equal(f.private.target,null);assert.ok(!f.document.getElementById('routes').textContent.includes('PAUSE ROUTE'));
}
(async()=>{await officeTests();await driverTests();console.log('PASS: PIN-confirmed empty/planned/returning route ending, unchanged Office/Driver sessions, canceled confirmation, exact stop review and iPhone/Android/Standard navigation cleanup. Fixtures only.');})().catch(e=>{console.error(e);process.exitCode=1;});
