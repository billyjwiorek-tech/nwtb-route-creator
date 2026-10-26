'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module'),{webcrypto}=require('node:crypto'),{parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++},eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
function backend(file,{employee='1234',authenticated=true,status='ACTIVE',assigned='1234',released=true,paused=false,killed=false,rpcFailure=false}={}){
 let handler;const writes=[],calls=[],uploads=[];
 const route={id:'fixture-route',driver_employee_number:assigned,status,released_to_driver:released,depot:'BOLINGBROOK',wave:'MORNING',end_mode:'RETURN_DEPOT',end_name:'Northwest Trucks - Bolingbrook',returning_started_at:new Date().toISOString(),returned_at:null,paused_at:paused?new Date().toISOString():null,resumed_at:null};
 const stop={id:'fixture-stop',route_id:route.id,order_id:'fixture-order',status:'PENDING',delivery_routes:route,delivery_orders:{customer_name:'Fixture business'}};
 const location={driver_employee_number:assigned,route_id:route.id,lat:41.7,lon:-88.1,speed_mps:10,heading_deg:335,accuracy_m:5,captured_at:new Date().toISOString(),received_at:new Date().toISOString(),location_source:'WEB_DRIVER'};
 const db={from(table){let filters=[],mutation=null;function result(single=false){let rows=[];
 if(table==='chat_sessions')rows=authenticated?[{token:'fixture-session',employee_number:employee,expires_at:'2099-01-01',employees:{active:true,display_name:'Fixture driver'}}]:[];
 else if(table==='employees')rows=[{employee_number:employee,display_name:'Fixture driver',active:true},{employee_number:assigned,display_name:'Assigned fixture',active:true}];
 else if(table==='nwtb_delivery_roles')rows=[{employee_number:employee,role:'DRIVER',active:true},{employee_number:assigned,role:'DRIVER',active:true}];
 else if(table==='nwtb_system_control')rows=[{id:1,state:killed?'KILLED':'RUNNING'}];
 else if(table==='delivery_routes')rows=[route];
 else if(table==='delivery_route_stops')rows=[stop];
 else if(table==='delivery_driver_locations')rows=[location];
 if(table!=='chat_sessions')rows=rows.filter(row=>filters.every(([op,k,v])=>op==='in'?v.includes(row[k]):op==='eq'?row[k]===v:op==='gt'?row[k]>v:op==='gte'?row[k]>=v:true));
 return {data:mutation?null:single?rows[0]||null:rows,error:null};
 }const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>Promise.resolve(result()).then(resolve);if(key==='single'||key==='maybeSingle')return ()=>Promise.resolve(result(true));return(...args)=>{if(['eq','gt','gte','in'].includes(key))filters.push([key,...args]);if(['update','insert','delete'].includes(key)){mutation=key;writes.push({table,op:key,value:args[0]})}return q}}});return q},
 async rpc(name,params){calls.push({name,params});if(rpcFailure)return {data:null,error:{code:'XX000',message:'Fixture database outage'}};
 if(params.p_driver_employee_number!==assigned)return {data:null,error:{code:'P0001',message:'Route is assigned to another driver.'}};
 if(name==='nwtb_confirm_route_return'){if(status!=='ACTIVE')return {data:null,error:{code:'P0001',message:'Only a released ACTIVE route can confirm its return.'}};return {data:{route_id:route.id,route_status:'COMPLETED',returned_at:new Date().toISOString()},error:null}}
 if(name==='nwtb_finalize_pod')return {data:{route_id:route.id,pod_number:1,route_completed:false,return_pending:true},error:null};
 return {data:{route_id:route.id,route_status:'ACTIVE',route_completed:false,return_pending:true},error:null}},
 storage:{from(){return {async upload(key){uploads.push(key);return {error:null}},async remove(){return {error:null}}}}}};
 const ctx=vm.createContext({Deno:{env:{get:()=>undefined},serve:f=>handler=f},createClient:()=>db,Request,Response,Date,Map,Set,console,crypto:webcrypto,Uint8Array,atob});
 vm.runInContext(stripTypeScriptTypes(read(file).replace(/^import .*\n/,'')),ctx,{filename:file});
 return {route,writes,calls,uploads,async call(body){const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json','x-nwtb-session':'fixture-session'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()}}};
}
async function endpointTests(){
 const tracking='supabase/functions/nwtb-delivery-tracking/index.ts';
 const finish={action:'route_return_driver',route_id:'fixture-route',returned:true};
 let b=backend(tracking),x=await b.call(finish);eq(x.status,200);eq(x.body.route_status,'COMPLETED');eq(b.calls[0].name,'nwtb_confirm_route_return');eq(b.calls[0].params.p_driver_employee_number,'1234','Return ownership is bound to authenticated employee');
 b=backend(tracking);x=await b.call({...finish,returned:false});eq(x.status,400);eq(b.calls.length,0,'No implicit return confirmation');
 b=backend(tracking,{employee:'9998'});x=await b.call({...finish,driver_employee_number:'1234'});eq(x.status,403,'Office cannot impersonate driver arrival');eq(b.calls.length,0);
 b=backend(tracking,{assigned:'5678'});x=await b.call({...finish,driver_employee_number:'5678'});eq(x.status,403,'Body driver number cannot steal another route');
 b=backend(tracking,{authenticated:false});x=await b.call(finish);eq(x.status,401);eq(b.calls.length,0);
 b=backend(tracking,{status:'PLANNED'});x=await b.call(finish);eq(x.status,409,'Planned route cannot confirm arrival');
 b=backend(tracking,{killed:true});x=await b.call(finish);eq(x.status,423);eq(b.calls.length,0,'System lock blocks completion');
 b=backend(tracking,{rpcFailure:true});x=await b.call(finish);eq(x.status,500);ok(!x.body.ok,'Database failure cannot report a completed return');
 for(const [file,employee,action] of [[tracking,'1234','stop_status_driver'],['supabase/functions/nwtb-delivery/index.ts','1234','stop_status'],['supabase/functions/nwtb-delivery-route-ops/index.ts','9998','stop_status_driver']]){
  b=backend(file,{employee});x=await b.call({action,stop_id:'fixture-stop',driver_employee_number:'1234',status:'DELIVERED'});
  eq(x.status,200,file);eq(b.calls.at(-1).name,'nwtb_finish_route_stops',file+' uses authoritative lifecycle');eq(x.body.return_pending,true);ok(!b.writes.some(w=>w.table==='delivery_routes'),'Edge cannot prematurely close return route');
  b=backend(file,{employee,assigned:'5678'});x=await b.call({action,stop_id:'fixture-stop',driver_employee_number:'1234',status:'DELIVERED'});eq(x.status,403,'Stop ownership preserved');eq(b.calls.length,0);
 }
 const live='supabase/functions/nwtb-live-tracking-v2/index.ts';
 b=backend(live,{employee:'9998'});x=await b.call({action:'locations_latest'});eq(x.status,200);eq(x.body.drivers.length,1,'Returning driver remains in live endpoint');eq(x.body.drivers[0].route.status,'ACTIVE');eq(x.body.drivers[0].route.tracking_status,'RETURNING');
 b=backend(live,{employee:'9998',status:'COMPLETED'});x=await b.call({action:'locations_latest'});eq(x.body.drivers.length,0,'Confirmed completed route leaves active tracking');
 b=backend(live);x=await b.call({action:'locations_latest'});eq(x.status,403,'Driver cannot read Office fleet locations');
 const pod='supabase/functions/nwtb-pod/index.ts',submit={action:'submit',stop_id:'fixture-stop',driver_employee_number:'1234',recipient_name:'Fixture recipient',signature_data:'data:image/png;base64,'+Buffer.alloc(32,1).toString('base64')};
 b=backend(pod);x=await b.call(submit);eq(x.status,200);eq(x.body.pod.route_completed,false);eq(x.body.pod.return_pending,true,'Saved delivery proof does not imply completed return');eq(b.uploads.length,1);
 b=backend(pod,{employee:'5678'});x=await b.call(submit);eq(x.status,403);eq(b.uploads.length,0,'Another employee cannot upload a false POD');
 for(const options of [{status:'PLANNED',released:false},{released:false},{paused:true}]){
  b=backend(pod,options);x=await b.call(submit);eq(x.status,409,'POD requires released, started and unpaused route');eq(b.uploads.length,0);eq(b.calls.length,0);
 }
}
function driver(file,{status='ACTIVE',pending=false,paused=false,returning=true,custom=false}={}){
 const {window:dom}=parseHTML('<html><body><div id="routes"></div></body></html>'),document=dom.document,requests=[],alerts=[];let allow=true,fail=false,loads=0,gpsStops=0,navStops=0,idleContinuations=0;
 const r={id:'fixture-route',status,depot:'BOLINGBROOK',end_mode:custom?'CUSTOM':'RETURN_DEPOT',end_name:custom?'Fixture return location':'Northwest Trucks - Bolingbrook',returning_started_at:returning?'2026-10-20T16:00:00Z':null,returned_at:null,paused};
 const stops=[{id:'fixture-stop',stop_sequence:1,status:pending?'PENDING':'DELIVERED',delivery_orders:{customer_name:'Fixture stop',address:'Fixture address'}}];
 const html=read(file),start=html.indexOf('async function openRoute('),end=html.indexOf('async function startRoute(');
 ok(start>0&&end>start,'Actual Driver route functions found');
 const ctx=vm.createContext({window:{nwtbStopNavigation(){navStops++},nwtbStopBuiltInTracking(){gpsStops++},nwtbContinueIdleTracking(){idleContinuations++}},document,route:'fixture-route',currentRouteState:{status},currentPaused:false,API:'fixture-base',ROUTE_API:'fixture-track',$:id=>document.getElementById(id),esc:s=>String(s??''),routeLinks:()=>[],routeEndpoints:()=>({label:'START / RETURN',depot:'BOLINGBROOK'}),startChangePolling(){},confirm:()=>allow,alert:e=>alerts.push(e),async loadRoutes(){loads++},async post(url,body){requests.push({url,body});if(body.action==='route_get')return {route:r,stops};if(body.action==='driver_route_state')return {route:r};if(fail)throw Error('Fixture connection failure');return {ok:true,route_status:'COMPLETED'}}});
 vm.runInContext(html.slice(start,end),ctx,{filename:file});
 return {ctx,document,requests,alerts,setAllow:v=>allow=v,setFailure:v=>fail=v,counts:()=>({loads,gpsStops,navStops,idleContinuations})};
}
async function driverTests(){
 for(const file of ['driver-live.html','driver-standard.html']){
  let f=driver(file);await f.ctx.openRoute('fixture-route');ok(f.document.getElementById('nwtbFinishReturn'),'Returning driver sees explicit finish-return button');ok(f.document.getElementById('routes').textContent.includes('RETURNING TO NWTB'));eq(f.counts().gpsStops,0,'Displaying a return never changes GPS');ok(!f.requests.some(x=>x.body.action==='route_start_driver'),'Opening return never restarts route');
  f.setAllow(false);await f.ctx.confirmReturn();eq(f.requests.filter(x=>x.body.action==='route_return_driver').length,0,'Cancel arrival leaves route open');eq(f.counts().loads,0);
  f.setAllow(true);f.setFailure(true);await f.ctx.confirmReturn();eq(f.counts().gpsStops,0,'Rejected arrival keeps tracking');eq(f.counts().loads,0);eq(f.alerts.at(-1),'Fixture connection failure');
  f.setFailure(false);await f.ctx.confirmReturn();eq(f.requests.at(-1).body.returned,true);eq(f.counts().loads,1);eq(f.counts().gpsStops,file==='driver-live.html'?0:1,'Successful GPS arrival keeps signed-in presence; Standard completion remains unchanged');if(file==='driver-live.html')eq(f.counts().idleContinuations,1,'Only successful arrival returns GPS to signed-in presence');eq(f.counts().navStops,1);
  for(const options of [{status:'PLANNED'},{pending:true},{paused:true},{returning:false}]){f=driver(file,options);await f.ctx.openRoute('fixture-route');eq(f.document.getElementById('nwtbFinishReturn'),null,'No finish control before return or while paused');}
  f=driver(file,{custom:true});await f.ctx.openRoute('fixture-route');ok(f.document.getElementById('routes').textContent.includes('RETURN LEG IN PROGRESS'),'Custom return preserves its own destination');
 }
}
async function trackerTests(){
 const row={driver_employee_number:'1234',route_id:'fixture-route',display_name:'Fixture driver',lat:41.69,lon:-88.06,captured_at:new Date().toISOString(),route:{id:'fixture-route',status:'ACTIVE',returning_started_at:new Date().toISOString(),returned_at:null,wave:'MORNING',end_name:'Northwest Trucks - Bolingbrook'}};
 const {window:dom}=parseHTML('<html><head></head><body><div id="drivers"><div class="card">Fixture driver (1234)<div class="actions"></div></div></div><div id="updated"></div></body></html>'),document=dom.document,intervals=[];
 let mapRows=[],cardRows=[],popup='';
 const ctx=vm.createContext({window:{addEventListener(){}},document,live:[row],Map,Set,Date,console,API:'fixture-base',post:async()=>({routes:[{id:row.route_id,status:'ACTIVE'}]}),renderMap(){mapRows=ctx.live.slice()},renderDrivers(){cardRows=ctx.live.slice()},refreshAll:async()=>{},markers:new Map([['1234',{getPopup:()=>({setContent:s=>popup=s})}]]),setInterval:f=>{intervals.push(f);return intervals.length},clearInterval(){},setTimeout:f=>{f();return 1}});
 vm.runInContext(read('tracker-route-filter.js'),ctx);intervals[0]();eq(mapRows[0].route_id,'fixture-route','Actual map filter retains returning ACTIVE route');
 const before=intervals.length;vm.runInContext(read('tracker-active-route-guard.js'),ctx);intervals[before]();for(let i=0;i<30;i++)await Promise.resolve();eq(ctx.live.length,1,'Periodic active-route guard also retains return');
 vm.runInContext(read('tracker-driver-status.js'),ctx);const gpsBefore=intervals.length;vm.runInContext(read('tracker-gps-status.js'),ctx);intervals[gpsBefore]();
 eq(document.querySelector('.nwtbReturnPhase').textContent,'RETURNING TO NWTB','Office driver card labels the return');ok(popup.includes('RETURNING TO NWTB'),'Map popup labels return instead of completed route');ok(document.querySelector('.gpsLive'),'Freshness display preserved');
 eq(cardRows[0].route_id,'fixture-route');
 const core=read('tracker-live-core.html');ok(core.includes('tracker-gps-status.js?v=20261021-activepresence1'));ok(read('delivery-live.html').includes('tracker-live.html?v=20261026-etarefresh1'));
 const swContext=vm.createContext({self:{addEventListener(){}},console});vm.runInContext(read('nwtb-driver-sw.js'),swContext);
 eq(swContext.isDriverRead('https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-delivery-tracking',JSON.stringify({action:'route_return_driver'})),false,'Return confirmation cannot be faked from offline read cache');
}
(async()=>{await endpointTests();await driverTests();await trackerTests();console.log('PASS: '+checks+' return-leg endpoint, Driver UI and Office map checks. All requests, GPS and route records are fixtures; no production writes.');})().catch(e=>{console.error(e);process.exitCode=1});
