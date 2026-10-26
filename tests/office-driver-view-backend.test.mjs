import test from 'node:test';
import assert from 'node:assert/strict';
import {createDriverViewHandler,cleanSnapshot,screenFreshness} from '../supabase/functions/nwtb-office-driver-view/handler.mjs';
const driver='1234',rid='10000000-0000-4000-8000-000000000001',sid='20000000-0000-4000-8000-000000000001',page='30000000-0000-4000-8000-000000000001',session='40000000-0000-4000-8000-000000000001',now=Date.parse('2026-10-26T14:00:00Z');
const route={id:rid,driver_employee_number:driver,status:'ACTIVE',released_to_driver:true,updated_at:'2026-10-26T13:00:00Z'},stops=[{id:sid,route_id:rid,status:'PENDING'}];
const packet=()=>({action:'driver_snapshot',page_id:page,sequence:1,captured_at:new Date(now).toISOString(),snapshot:{version:1,route_id:rid,visible:true,navigation_active:true,target:{stop_id:sid,name:'Fixture business',lat:41.7,lon:-88},eta:'6 min',distance:'2.8 mi',geometry_key:'fixture',displayed_stops:[{id:sid,status:'PENDING'}]},geometry:[[-88,41.7],[-88,41.8]]});
function fixture({office=true,hidden=false,foreign=false,expired=false,role='DRIVER',screen=null,rpcResult={ok:true}}={}){
 const reads=[],calls=[],db={from(table){const filters=[];reads.push({table,filters});const q={select(){return q},eq(k,v){filters.push([k,v]);return q},gt(){return q},in(){return q},order(){return q},limit(){return q},ilike(){return q},async maybeSingle(){const rows=await result();return Array.isArray(rows)?rows[0]||null:rows},then(resolve,reject){return result().then(resolve,reject)}};
 async function result(){let data=[];
  if(table==='chat_sessions')data=expired?null:{token:session,employee_number:office?'9998':driver,created_at:'2026-10-25T14:00:00Z',expires_at:'2026-10-27T14:00:00Z',employees:{active:true,display_name:'Fixture employee'}};
  if(table==='nwtb_delivery_roles')data=filters.some(([k])=>k==='employee_number')?{role,active:true}:[{employee_number:driver}];
  if(table==='delivery_routes')data=filters.some(([k])=>k==='id')?{...route,driver_employee_number:foreign?'5678':driver,status:hidden?'PLANNED':route.status,released_to_driver:!hidden}:[];
  if(table==='delivery_route_stops')data=stops;
  if(table==='employees')data=filters.some(([k])=>k==='employee_number')?{employee_number:driver,display_name:'Fixture Driver',active:true}:[{employee_number:driver,display_name:'Fixture Driver'}];
  if(table==='delivery_pods')data=[{id:'pod-fixture',stop_id:sid,signature_path:'private/fixture/signature',photo_path:'private/fixture/photo',recipient_name:'Fixture receiver'}];
  if(table==='nwtb_driver_screen_state')data=screen;
  return {data,error:null};
 }
 // Supabase maybeSingle resolves the same { data, error } envelope as awaited builders.
 q.maybeSingle=()=>result();return q;},async rpc(name,args){calls.push({name,args});return {data:rpcResult,error:null};}};
 const handler=createDriverViewHandler({db,clock:()=>now});
 async function request(body,token=session,origin='https://billyjwiorek-tech.github.io'){const r=await handler(new Request('https://fixture/functions/v1/nwtb-office-driver-view',{method:'POST',headers:{'content-type':'application/json','x-nwtb-session':token,origin},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}
 return {request,reads,calls};
}
test('screen reports preserve exact displayed values and exclude drafts or arbitrary fields',()=>{
 const p=packet();p.snapshot.pin='fixture-secret';p.snapshot.recipient_draft='unsaved';p.snapshot.eta='6 min';const s=cleanSnapshot(p,()=>now);
 assert.equal(s.snapshot.eta,'6 min');assert.equal(s.snapshot.distance,'2.8 mi');assert.equal(s.snapshot.target.stop_id,sid);assert.equal(s.snapshot.pin,undefined);assert.equal(s.snapshot.recipient_draft,undefined);assert.equal(s.geometry.length,2);
 for(const change of [p=>p.sequence=0,p=>p.captured_at='2020-01-01',p=>p.geometry=[[0,0],[0,0]],p=>p.geometry=Array(20001).fill([-88,41.7]),p=>p.snapshot.route_id='invalid']){const p=packet();change(p);assert.throws(()=>cleanSnapshot(p,()=>now));}
});
test('live screen requires a fresh, foreground matching route and valid Driver session',()=>{
 const screen={route_id:rid,captured_at:new Date(now).toISOString(),received_at:new Date(now).toISOString(),snapshot:cleanSnapshot(packet(),()=>now).snapshot,chat_sessions:{expires_at:new Date(now+60000).toISOString()}};
 assert.equal(screenFreshness(screen,route,stops,()=>now).live,true);
 for(const [patch,reason]of [[{captured_at:new Date(now-30000).toISOString()},'SCREEN_UPDATE_STALE'],[{route_id:null},'DRIVER_VIEWING_ANOTHER_SCREEN'],[{snapshot:{...screen.snapshot,visible:false}},'PHONE_APP_IN_BACKGROUND'],[{chat_sessions:null},'DRIVER_SIGNED_OUT']])assert.equal(screenFreshness({...screen,...patch},route,stops,()=>now).reason,reason);
 assert.equal(screenFreshness(screen,route,[{id:sid,status:'DELIVERED'}],()=>now).reason,'ROUTE_CHANGED');
});
test('Driver can report only their own visible route and their own stop IDs',async()=>{
 let f=fixture({office:false}),r=await f.request(packet());assert.equal(r.status,200);assert.equal(f.calls[0].name,'nwtb_store_driver_screen');assert.equal(f.calls[0].args.p_driver,driver);
 for(const config of [{hidden:true},{foreign:true},{office:true},{role:'ADMIN'}]){f=fixture({office:false,...config});r=await f.request(packet());assert.equal(r.status,403);assert.equal(f.calls.length,0);}
 f=fixture({office:false});const p=packet();p.snapshot.target.stop_id=page;r=await f.request(p);assert.equal(r.status,409);assert.equal(f.calls.length,0);
});
test('Office view reads saved POD metadata without exposing paths, tokens or modifying route data',async()=>{
 const f=fixture(),r=await f.request({action:'view',route_id:rid});assert.equal(r.status,200);assert.equal(r.body.pods[0].has_signature,true);assert.equal(r.body.pods[0].signature_path,undefined);assert.equal(r.body.pods[0].photo_path,undefined);assert.equal(f.calls.length,0);assert.equal(r.body.phone.reason,'AWAITING_DRIVER_SYNC');
 assert.ok(f.reads.every(x=>!['nwtb_admin_security','delivery_chat_messages'].includes(x.table)));
});
test('all Office controls reject Driver sessions and invalid or expired auth',async()=>{
 for(const action of ['view','roster','available_stops','verify_override_pin','override']){const f=fixture({office:false});assert.equal((await f.request({action,route_id:rid})).status,403);assert.equal(f.calls.length,0);}
 assert.equal((await fixture({expired:true}).request({action:'roster'})).status,401);assert.equal((await fixture().request({action:'roster'},'')).status,401);assert.equal((await fixture().request({action:'roster'},session,'https://untrusted.example')).status,403);
});
test('override endpoint forwards PIN validation to the atomic RPC for every mutation',async()=>{
 const input={action:'override',pin:'fixture-pin',override:{operation:'complete_stop',route_id:rid,request_id:page,reason:'Fixture correction'}};
 const f=fixture({rpcResult:{ok:false,status:403,code:'ADMIN_PIN_REQUIRED',error:'Incorrect management PIN.'}});const r=await f.request(input);assert.equal(r.status,403);assert.equal(f.calls[0].name,'nwtb_office_override');assert.equal(f.calls[0].args.p_pin,'fixture-pin');assert.equal(f.calls[0].args.p_employee_number,'9998');
 const invalid=fixture();assert.equal((await invalid.request({...input,override:{...input.override,operation:'delete_driver'}})).status,400);assert.equal(invalid.calls.length,0);
});
