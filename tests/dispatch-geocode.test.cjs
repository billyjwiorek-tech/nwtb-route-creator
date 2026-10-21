'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {webcrypto}=require('node:crypto');
const file='supabase/functions/nwtb-delivery/index.ts';
const source=fs.readFileSync(file,'utf8').replace(/^import .*\n/gm,'');
const address='2120 RAND ROAD. PALATINE, 60074';
const matched='2120 N Rand Rd, Palatine, Illinois, 60074';
const point={ok:true,lat:42.148326482693,lon:-88.033092333019,matched_address:matched,source:'ARCGIS'};
let checks=0;
function check(value,message){assert.ok(value,message);checks++;}
function fixture(options={}){
 const writes=[],requests=[];let handler;
 const tables={chat_sessions:[{token:'fixture-office',employee_number:'9998',expires_at:'2099-01-01T00:00:00Z',employees:{display_name:'Fixture Desk',active:true}}],nwtb_system_control:[{id:1,state:'RUNNING'}],delivery_orders:[],delivery_saved_locations:[],delivery_events:[]};
 const db={from(table){
  assert.ok(Object.hasOwn(tables,table),'Unexpected table '+table);
  let filters=[],op='',value;
  function execute(single=false){
   let rows=tables[table].filter(row=>filters.every(([key,v])=>row[key]===v));
   if(op==='insert'){const row={id:'fixture-'+table,...value};tables[table].push(row);rows=[row];writes.push({table,op,value});}
   if(op==='update'){rows.forEach(row=>Object.assign(row,value));writes.push({table,op,value});}
   return {data:single?rows[0]||null:rows,error:null};
  }
  const q={select(){return q},eq(key,v){filters.push([key,v]);return q},gt(){return q},update(v){op='update';value=v;return q},insert(v){op='insert';value=v;return q},maybeSingle(){return Promise.resolve(execute(true))},single(){return Promise.resolve(execute(true))},then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject)}};
  return q;
 }};
 const context=vm.createContext({Deno:{env:{get:key=>key==='SUPABASE_URL'?'https://fixture-project.supabase.co':key==='SUPABASE_SERVICE_ROLE_KEY'?'fixture-private-service-key':undefined},serve:fn=>handler=fn},createClient:()=>db,Request,Response,Headers,URL,Date,Set,Map,Promise,AbortSignal,TextEncoder,Uint8Array,crypto:webcrypto,console,
  fetch:async(url,init={})=>{
   requests.push({url:String(url),init});
   if(options.fetch)return options.fetch(String(url),init);
   return String(url).endsWith('/nwtb-custom-geocoder-v2')?Response.json(point):Response.json([]);
  }});
 vm.runInContext(stripTypeScriptTypes(source),context,{filename:file});
 return {writes,requests,tables,async call(body,authenticated=true){const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json',...(authenticated?{'x-nwtb-session':'fixture-office'}:{})},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()}}};
}
function noBusinessWrites(f){check(f.writes.every(x=>x.table==='chat_sessions'),'Lookup must not create or change deliveries, routes or driver sessions');}
async function main(){
 let f=fixture(),r=await f.call({action:'geocode',address});
 check(r.status===200,'The exact Palatine address from Dispatch must resolve');
 check(r.body.lat===point.lat&&r.body.lon===point.lon,'Return the resolver coordinates without substituting a depot or city center');
 check(r.body.display_name===matched&&r.body.source==='ARCGIS','Preserve the matched address and routing source');
 check(f.requests.length===1&&f.requests[0].url==='https://fixture-project.supabase.co/functions/v1/nwtb-custom-geocoder-v2','Use the existing project resolver first');
 check(JSON.parse(f.requests[0].init.body).address===address,'Pass the entered physical address to the resolver');
 let headers=new Headers(f.requests[0].init.headers);
 check(headers.get('x-nwtb-session')==='fixture-office','Forward only the authenticated caller session');
 check(!headers.has('authorization')&&!headers.has('apikey')&&!JSON.stringify(f.requests).includes('fixture-private-service-key'),'Do not send a service key to the resolver or public geocoder');
 check(f.requests[0].init.signal instanceof AbortSignal,'Bound resolver requests with an abort signal');noBusinessWrites(f);
 for(const body of [{action:'geocode',address},{action:'geocode',address:''}]){
  f=fixture();r=await f.call(body,false);check(r.status===401&&f.requests.length===0,'No lookup without an authenticated Office/Driver session');noBusinessWrites(f);
 }
 f=fixture();r=await f.call({action:'geocode',address:''});check(r.status===400&&f.requests.length===0,'Missing addresses must be rejected before geocoding');noBusinessWrites(f);
 f=fixture({fetch:()=>Response.json({error:'No address match'},{status:404})});r=await f.call({action:'geocode',address:'fixture nonexistent address'});
 check(r.status===404&&f.requests.length===1,'A resolver no-match must fail closed without repeating the same lookup');noBusinessWrites(f);
 for(const unavailable of ['http','network']){
  f=fixture({fetch:(url,init)=>{if(url.endsWith('/nwtb-custom-geocoder-v2')){if(unavailable==='network')throw new Error('fixture outage');return Response.json({error:'fixture outage'},{status:503});}check(!new Headers(init.headers).has('x-nwtb-session'),'Never forward the session to a public geocoder');check(!!init.signal,'Bound the legacy fallback request');return Response.json([{lat:'42.1483',lon:'-88.0331',display_name:matched}]);}});
  r=await f.call({action:'geocode',address});check(r.status===200&&r.body.source==='NOMINATIM','Preserve the fallback when the multi-source service is unavailable');check(f.requests.length===2,'Do not loop fallback requests');noBusinessWrites(f);
 }
 for(const bad of [{lat:null,lon:null},{lat:'',lon:''},{lat:0,lon:0},{lat:999,lon:-88},{lat:42,lon:'not a number'}]){
  f=fixture({fetch:url=>url.endsWith('/nwtb-custom-geocoder-v2')?Response.json({ok:true,...bad}):Response.json([bad])});r=await f.call({action:'geocode',address});
  check(r.status===404,'Missing, zero and invalid coordinates must not become a routing location');noBusinessWrites(f);
 }
 for(const action of ['order_create','saved_location_create']){
  f=fixture();r=await f.call({action,address,customer_name:'Fixture location',name:'Fixture location',source_type:'OTHER',stop_type:'OTHER'});
  check(r.status===200&&f.requests.length===1,'All existing creation paths must use the shared resolver');
  const row=action==='order_create'?r.body.order:r.body.location;
  check(row.lat===point.lat&&row.lon===point.lon,'New fixture records inherit verified coordinates');
  check(f.tables.chat_sessions.length===1&&!f.writes.some(x=>/route|driver/.test(x.table)),'Resolving a location must never create a route or driver session');
 }
 console.log('PASS: '+checks+' Dispatch geocode checks; exact Palatine input, authenticated resolver, bounded fallback, invalid coordinates and creation-path coverage. Fixtures only; no production deliveries created.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
