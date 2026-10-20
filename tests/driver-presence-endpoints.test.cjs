'use strict';
const assert=require('node:assert/strict'),{endpoint,point,route,iso,now}=require('./driver-presence-fixtures.cjs');
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++},eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
const live='supabase/functions/nwtb-live-tracking-v2/index.ts',roles='supabase/functions/nwtb-admin-roles/index.ts';
async function fleet(options={}){const api=endpoint(live,options),response=await api.call({action:'locations_latest'});return {api,response,driver:response.body.drivers?.find(d=>d.driver_employee_number==='1234')}}
(async()=>{
 let f=await fleet({routes:[],locations:[point('1234',{route_id:'completed-old-route'})]});eq(f.response.status,200);eq(f.driver.marker_type,'PERSON','Logged-in route-free driver is a person');eq(f.driver.route_id,null,'Historic GPS route ID cannot pretend to be assigned');eq(f.driver.route,null);eq(f.driver.logged_in,true);eq(f.driver.has_location,true);eq(f.api.writes.filter(w=>w.table==='delivery_routes').length,0,'Viewing fleet never changes routes');
 f=await fleet({routes:[route({status:'PLANNED',released_to_driver:false})]});eq(f.driver.marker_type,'PERSON','Office-only planned route cannot change driver marker');eq(f.driver.route,null,'Office-only route is not linked to driver presence');
 f=await fleet({routes:[route({status:'PLANNED',released_to_driver:true})]});eq(f.driver.marker_type,'VAN','Explicit release changes marker to van');eq(f.driver.route.status,'PLANNED','Marker switch does not start route');
 f=await fleet({routes:[route({id:'future',status:'PLANNED',route_date:'2026-10-21'}),route()]});eq(f.driver.route.id,'fixture-route','Active route takes precedence over released future route');
 f=await fleet({routes:[route({returning_started_at:iso(now),end_mode:'RETURN_DEPOT'})]});eq(f.driver.marker_type,'VAN','Return leg keeps van');eq(f.driver.route.tracking_status,'RETURNING');
 f=await fleet({routes:[route({status:'COMPLETED',returned_at:iso(now)})]});eq(f.driver.marker_type,'PERSON','Confirmed completion returns logged-in driver to person');
 f=await fleet({routes:[],locations:[]});eq(f.driver.has_location,false,'Logged-in driver without GPS remains listed');eq(f.driver.lat,null,'No invented depot or zero coordinate');eq(f.driver.lon,null);
 f=await fleet({routes:[],noDriverSession:true});eq(f.driver,undefined,'Logged-out route-free driver is not labeled logged in');
 f=await fleet({noDriverSession:true});eq(f.driver.marker_type,'VAN','Existing external GPS fallback for active routes remains available');eq(f.driver.logged_in,false,'External tracking does not fake Driver login');
 for(const options of [{roleActive:false},{employeeActive:false}]){f=await fleet(options);eq(f.driver,undefined,'Inactive employee or Driver role excluded')}
 f=await fleet({locations:[point('1234',{location_source:'WEB_DRIVER',captured_at:iso(now-60000)}),point('1234',{location_source:'GPS_ROUTING_APP',captured_at:iso(now)})]});eq(f.driver.location_source,'WEB_DRIVER','Fresh built-in GPS preferred');
 f=await fleet({locations:[point('1234',{location_source:'WEB_DRIVER',captured_at:iso(now-600000)}),point('1234',{location_source:'GPS_ROUTING_APP',captured_at:iso(now)})]});eq(f.driver.location_source,'GPS_ROUTING_APP','External fallback retained when built-in GPS is stale');
 for(const table of ['chat_sessions','delivery_routes','employees','nwtb_delivery_roles']){f=await fleet({failTable:table});ok(f.response.status>=400,'Roster and session lookup failures do not fabricate login')}
 let api=endpoint(live,{employee:'1234'}),r=await api.call({action:'locations_latest'});eq(r.status,403,'Drivers cannot read fleet positions');
 api=endpoint(live,{authenticated:false});r=await api.call({action:'locations_latest'});eq(r.status,401,'Fleet requires Office authentication');
 const location={action:'location_update',driver_employee_number:'5678',route_id:null,lat:41.7,lon:-88.1,heading_deg:null,speed_mps:null,accuracy_m:5};
 api=endpoint(live,{employee:'1234',routes:[]});r=await api.call(location);eq(r.status,200,'Signed-in driver can report GPS without starting a route');const saved=api.tables.delivery_driver_locations.at(-1);eq(saved.driver_employee_number,'1234','Body employee cannot impersonate another driver');eq(saved.route_id,null);eq(saved.speed_mps,null,'Unknown speed remains unknown');eq(saved.heading_deg,null,'Unknown heading remains unknown');eq(api.writes.filter(w=>w.table==='delivery_routes').length,0,'Idle GPS creates no route mutation');
 api=endpoint(live);r=await api.call(location);eq(r.status,403,'Office session cannot report Driver GPS');eq(api.writes.filter(w=>w.table==='delivery_driver_locations').length,0);
 api=endpoint(live,{employee:'1234',routes:[route({status:'PLANNED',released_to_driver:false})]});r=await api.call({...location,route_id:'fixture-route'});eq(r.status,403,'Unreleased route cannot be used as a GPS route');
 api=endpoint(live,{employee:'1234',routes:[route({status:'COMPLETED'})]});r=await api.call({...location,route_id:'fixture-route'});eq(r.status,200,'Older Driver app can finish sending its own completed route GPS');eq(api.tables.delivery_driver_locations.at(-1).route_id,null,'Completed-route GPS becomes route-free presence');
 api=endpoint(live,{employee:'1234'});r=await api.call({...location,lat:null});eq(r.status,400,'Missing coordinate cannot become a false 0,0 fix');
 api=endpoint(live,{employee:'1234',killed:true});r=await api.call(location);eq(r.status,423,'System lock still blocks GPS uploads');
 const add={action:'create_driver',employee_number:'0123',display_name:'Fixture New Driver'};
 api=endpoint(roles);r=await api.call(add);eq(r.status,200,'Authorized Office can add Driver');eq(api.rpcCalls.at(-1).params.p_employee_number,'0123','Leading zero preserved');eq(api.rpcCalls.at(-1).params.p_created_by,'9998','Creator bound to Office session');eq(r.body.driver.role,'DRIVER');
 api=endpoint(roles,{employee:'8888',manageUsers:false});r=await api.call(add);eq(r.status,403);eq(r.body.code,'ADMIN_PIN_REQUIRED','Office permission fallback requests Admin PIN');eq(api.rpcCalls.filter(x=>x.name==='nwtb_add_delivery_driver').length,0);
 r=await api.call({...add,pin:'fixture-pin'});eq(r.status,200,'Verified temporary Admin PIN authorizes Office registration');
 api=endpoint(roles,{employee:'1234',manageUsers:false});r=await api.call({...add,pin:'fixture-pin'});eq(r.status,403,'Driver cannot use Office registration even with a PIN');eq(api.rpcCalls.length,0);
 for(const bad of [{employee_number:'9998'},{employee_number:'123'},{employee_number:'12x4'},{display_name:'A'}]){api=endpoint(roles);r=await api.call({...add,...bad});eq(r.status,400,'Invalid registration rejected before writes');eq(api.rpcCalls.filter(x=>x.name==='nwtb_add_delivery_driver').length,0)}
 api=endpoint(roles,{rpcError:{code:'23505',message:'Fixture duplicate'}});r=await api.call(add);eq(r.status,409,'Duplicate employee number is not overwritten');
 api=endpoint(roles,{killed:true});r=await api.call(add);eq(r.status,423,'System lock protects registration');
 console.log(checks+' Driver presence, release-to-van and Add Driver endpoint checks passed; fixtures only.');
})().catch(e=>{console.error(e);process.exitCode=1});
