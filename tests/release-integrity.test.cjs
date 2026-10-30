'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{webcrypto,createHash}=require('node:crypto');
const {parseHTML}=require('linkedom'),{endpoint,route,point}=require('./driver-presence-fixtures.cjs'),{fixture}=require('./driver-map-lifecycle.test.cjs');
const {redirects,publicIssues,digest,sourceInventory}=require('../scripts/nwtb-release-lib.cjs'),root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('every prior entry URL forwards without starting a session, emitting GPS or changing Office identity',()=>{
 for(const [file,target]of Object.entries(redirects)){
  const html=read(file),stored=new Map([['nwtb_delivery_token','fixture-office']]),destinations=[];
  const {document}=parseHTML(html),location={href:'https://fixture.invalid/nwtb-route-creator/'+file+'?fixture=1#dispatch',search:'?fixture=1',hash:'#dispatch',replace:url=>destinations.push(url)};
  const context=vm.createContext({document,location,URL,setTimeout:fn=>fn(),localStorage:{setItem(){throw Error('Redirect changed a session')},getItem:k=>stored.get(k)},fetch(){throw Error('Redirect called backend')},navigator:{geolocation:{getCurrentPosition(){throw Error('Redirect requested GPS')}}}});
  for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())vm.runInContext(m[1],context);
  assert.equal(destinations.length,1,file);assert.equal(new URL(destinations[0],location.href).pathname,'/nwtb-route-creator/'+target);assert.equal(stored.get('nwtb_delivery_token'),'fixture-office');
 }
});
test('repository login source handles real Driver login and rejects inactive or forbidden identities',async()=>{
 const file='supabase/functions/nwtb-chat/index.ts';let api=endpoint(file),r=await api.call({action:'delivery_driver_login',employee_number:'1234'},false);
 assert.equal(r.status,200);assert.ok(r.body.token);assert.equal(r.body.employee_number,'1234');assert.equal(api.writes.filter(w=>w.table==='chat_sessions'&&w.operation==='insert').length,1);
 for(const options of [{employeeActive:false},{roleActive:false}]){api=endpoint(file,options);r=await api.call({action:'delivery_driver_login',employee_number:'1234'},false);assert.equal(r.status,401);assert.equal(api.writes.length,0);}
 api=endpoint(file);r=await api.call({action:'delivery_driver_login',employee_number:'9998'},false);assert.equal(r.status,403);assert.equal(api.writes.length,0);
});
test('legacy supervisor rejects Driver sessions before reading another Driver location',async()=>{
 const file='supabase/functions/nwtb-driver-supervisor/index.ts',options={routes:[route({driver_employee_number:'5678'})],locations:[point('5678')]};
 let api=endpoint(file,{...options,employee:'1234'}),r=await api.call({action:'active_drivers'});assert.equal(r.status,403);assert.equal(r.body.drivers,undefined);assert.equal(api.writes.length,0);
 api=endpoint(file,options);r=await api.call({action:'active_drivers'});assert.equal(r.status,200);assert.equal(r.body.drivers[0].driver_employee_number,'5678');assert.equal(api.writes.length,0);
});
test('all three older completion actions require POD without changing delivery or return state',async()=>{
 for(const [slug,employee,action]of [['nwtb-delivery','1234','stop_status'],['nwtb-delivery-tracking','1234','stop_status_driver'],['nwtb-delivery-route-ops','9998','stop_status_driver']]){
  const api=endpoint('supabase/functions/'+slug+'/index.ts',{employee});api.tables.delivery_route_stops=[{id:'fixture-stop',route_id:'fixture-route',order_id:'fixture-order',status:'PENDING',delivery_routes:route()}];api.tables.delivery_orders=[{id:'fixture-order',status:'OUT_FOR_DELIVERY'}];
  const r=await api.call({action,stop_id:'fixture-stop',status:'DELIVERED',driver_employee_number:'1234'});assert.equal(r.status,409,slug);assert.equal(r.body.code,'POD_REQUIRED');assert.equal(api.tables.delivery_route_stops[0].status,'PENDING');assert.equal(api.writes.filter(w=>w.table!=='chat_sessions').length,0);assert.equal(api.rpcCalls.length,0);
 }
});
function offlineDb(){const rows=new Map(),plain=v=>JSON.parse(JSON.stringify(v));const db={objectStoreNames:{contains:()=>true},close(){},transaction(){const tx={objectStore(){return {getAll(){const req={result:[...rows.values()].map(plain)};Promise.resolve().then(()=>req.onsuccess?.());return req},put(v){rows.set(v.id,plain(v));Promise.resolve().then(()=>tx.oncomplete?.())},delete(id){rows.delete(id);Promise.resolve().then(()=>tx.oncomplete?.())}}}};return tx}};return {rows,open(){const req={result:db};Promise.resolve().then(()=>req.onsuccess?.());return req}};}
const settle=async()=>{for(let i=0;i<50;i++)await Promise.resolve()};
test('offline proof survives rejected, expired and malformed responses, remains private, and can retry',async()=>{
 for(const status of [400,403,409,401,423,500,200]){
  const f=fixture({android:true}),db=offlineDb();f.ctx.indexedDB=db;f.ctx.crypto={randomUUID:()=>String(db.rows.size+1)};let mode='reject',submissions=0;
  f.window.navigator.serviceWorker={register:async()=>({}),ready:Promise.resolve({})};const native=f.window.fetch;
  f.window.fetch=async(url,init)=>{if(String(url).endsWith('/nwtb-pod')){submissions++;return mode==='accept'?f.response({ok:true,pod:{pod_number:1}}):f.response({error:'Fixture route conflict'},status);}return native(url,init);};
  f.load('driver-offline-live.js');await settle();f.window.navigator.onLine=false;await f.window.NWTBOffline.enqueue('POD','https://fixture.invalid/nwtb-pod',{action:'submit',stop_id:'fixture-stop',driver_employee_number:'1234',recipient_name:'Fixture receiver',signature_data:'data:image/png;base64,ZmFrZQ=='});
  f.window.navigator.onLine=true;await f.window.NWTBOffline.sync();assert.equal(db.rows.size,1,'Evidence retained on '+status);assert.match(f.document.getElementById('routes').textContent,/Fixture pickup/,'Reconnect keeps the selected route open');assert.equal([...db.rows.values()][0].payload.signature_data,'data:image/png;base64,ZmFrZQ==');
  if([400,403,409].includes(status)){assert.equal([...db.rows.values()][0].review_required,true);assert.match(f.document.getElementById('nwtbOfflineBanner').textContent,/REVIEW/);await f.window.NWTBOffline.review();assert.match(f.document.getElementById('nwtbSavedUpdateReview').textContent,/Fixture receiver/);}
  f.local.set('nwtb_delivery_driver','5678');await f.window.NWTBOffline.review();assert.doesNotMatch(f.document.getElementById('nwtbSavedUpdateReview').textContent,/Fixture receiver/);const before=submissions;await f.window.NWTBOffline.retry('1');assert.equal(submissions,before);assert.equal(db.rows.size,1);
  f.local.set('nwtb_delivery_driver','1234');mode='accept';await f.window.NWTBOffline.retry('1');assert.equal(db.rows.size,0,'Only acknowledged upload removes local evidence');assert.equal(f.local.get('nwtb_delivery_token'),'fixture-office-token');
 }
});
test('critical cache download failures or wrong bytes never activate the new worker',async()=>{
 const source=read('nwtb-driver-sw.js');
 for(const mode of ['missing','wrong','valid']){
  const events={},saved=new Map();let skipped=0;
  const self={registration:{scope:'https://fixture.invalid/nwtb-route-creator/'},location:{origin:'https://fixture.invalid'},addEventListener:(n,f)=>events[n]=f,skipWaiting:async()=>skipped++,clients:{claim:async()=>{}}};
  const context=vm.createContext({self,Request,Response,URL,crypto:webcrypto,Uint8Array,console,caches:{open:async()=>({put:async(req,r)=>saved.set(req.url,r),match:async url=>saved.get(url)})},fetch:async req=>{
   const u=new URL(req.url);let file;if(u.origin==='https://cdn.jsdelivr.net')file=path.join(root,'tests/node_modules/leaflet/dist',u.pathname.split('/dist/')[1]);else file=path.join(root,u.pathname.replace('/nwtb-route-creator/',''));
   if(u.pathname.endsWith('/driver-navigation-native.js')){if(mode==='missing')throw Error('Fixture network interruption');if(mode==='wrong')return new Response('old fixture code');}
   return new Response(fs.readFileSync(file));
  }});vm.runInContext(source,context);let promise;events.install({waitUntil:p=>promise=p});
  if(mode==='valid'){await promise;assert.equal(skipped,1);}else{await assert.rejects(promise);assert.equal(skipped,0);}
 }
});
test('Office default route date matches Chicago across UTC midnight and daylight saving',async()=>{
 for(const at of ['2026-10-30T00:30:00Z','2026-07-01T00:30:00Z','2026-11-01T07:30:00Z']){
  class Clock extends Date{constructor(...a){super(...(a.length?a:[at]))}static now(){return Date.parse(at)}}
  const {document}=parseHTML('<html><body><input id="routeDate"><div id="loginPanel"></div><div id="app"></div><div id="loginMsg"></div></body></html>');
  const ctx=vm.createContext({Date:Clock,Intl,window:{},me:null,$:id=>document.getElementById(id),post:async()=>({employee_number:'9998'}),API:'fixture',location:{hash:'#dispatch'},loadDrivers:async()=>{},refreshAll:async()=>{},loadFrequent:async()=>{},loadMasterCounts:async()=>{},loadMultiBuilder:async()=>{},showTab(){},localStorage:{removeItem(){}}});
  vm.runInContext(read('dispatch-native.html').split('\n').find(l=>l.startsWith('async function boot()')),ctx);await vm.runInContext('boot()',ctx);
  const parts={};for(const p of new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at)))parts[p.type]=p.value;
  assert.equal(document.getElementById('routeDate').value,parts.year+'-'+parts.month+'-'+parts.day);
 }
});
test('vendored spreadsheet reader imports and exports synthetic directory rows with leading zero IDs',()=>{
 const context=vm.createContext({});vm.runInContext(read('vendor/xlsx-0.20.3.full.min.js'),context);const x=context.XLSX;assert.equal(x.version,'0.20.3');
 const workbook=x.utils.book_new();x.utils.book_append_sheet(workbook,x.utils.aoa_to_sheet([['ID','Name','Address'],['0012','Fixture company','Fixture address']]),'Directory');
 const bytes=x.write(workbook,{type:'array',bookType:'xlsx'}),result=x.read(bytes,{type:'array'}),rows=x.utils.sheet_to_json(result.Sheets.Directory);assert.equal(rows[0].ID,'0012');assert.equal(rows[0].Name,'Fixture company');
});
test('release scans fail on public PINs and inventory tampering without printing credentials',()=>{
 assert.ok(publicIssues("const ADMIN_PIN = '0000';").includes('Public PIN literal'));assert.ok(publicIssues("if(pin!== '0000'){}").includes('Public PIN literal'));assert.ok(publicIssues('Enter PIN <b>0000</b>').includes('Public PIN literal'));
 const manifest=JSON.parse(read('release/nwtb-functions.json'));assert.deepEqual(sourceInventory(root,manifest),[]);const first=Object.values(manifest.functions)[0],file=Object.keys(first.files)[0];first.files[file]='0'.repeat(64);assert.ok(sourceInventory(root,manifest).some(x=>x.includes('source changed')));
});
test('deployment verifier rejects stale evidence, ACTIVE work and a different Pages commit',()=>{
 const os=require('node:os'),{spawnSync}=require('node:child_process'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'nwtb-release-fixture-')),file=path.join(temp,'evidence.json');
 try{
  const manifest=JSON.parse(read('release/nwtb-functions.json')),sha='a'.repeat(40),evidence={project_ref:manifest.project_ref,captured_at:new Date().toISOString(),active_routes:0,main_sha:sha,production_bytes_sha:sha,functions:Object.entries(manifest.functions).map(([slug,v])=>({slug,version:v.version,status:'ACTIVE',verify_jwt:v.verify_jwt,files:Object.keys(v.files).map(p=>({name:p.slice('supabase/functions/'.length),content:read(p)}))})),pages:{head_sha:sha,status:'completed',conclusion:'success'},ci:{head_sha:sha,status:'completed',conclusion:'success'}};
  const run=value=>{fs.writeFileSync(file,JSON.stringify(value));return spawnSync(process.execPath,['scripts/nwtb-verify-deployed.cjs',file],{cwd:root,encoding:'utf8'});};
  assert.equal(run(evidence).status,0);assert.match(run({...evidence,active_routes:1}).stderr,/ACTIVE production route/);
  assert.match(run({...evidence,captured_at:'2000-01-01T00:00:00Z'}).stderr,/must be fresh/);
  assert.match(run({...evidence,pages:{...evidence.pages,head_sha:'b'.repeat(40)}}).stderr,/Exact successful pages/);
 }finally{fs.unlinkSync(file);fs.rmdirSync(temp);}
});
