const fs=require('fs'),vm=require('vm'),{stripTypeScriptTypes}=require('node:module'),assert=require('node:assert/strict');
async function run(slug,action,{employee='1234',routeStatus='PLANNED',released=false,owner='1234',manage=false,otherActive=false,pin='',goodPin=false}={}){
 const route={id:'r1',status:routeStatus,released_to_driver:released,driver_employee_number:owner}; const writes=[];
 const db={rpc:async()=>({data:manage,error:null}),from(table){let filters=[],op='read',payload;const q=new Proxy({}, {get(_,key){if(key==='then')return (resolve,reject)=>Promise.resolve(result()).then(resolve,reject);return (...args)=>{if(key==='update'||key==='insert'){op=key;payload=args[0]}if(['eq','neq','in','gt'].includes(key))filters.push([key,...args]);if(['single','maybeSingle'].includes(key))return Promise.resolve(result());return q}}});function result(){
  if(op!=='read'){writes.push({table,op,payload});return {data:table==='delivery_routes'?{...route,...payload}:[],error:null}}
  if(table==='chat_sessions')return {data:{token:'fake',employee_number:employee,expires_at:'2099-01-01',employees:{active:true,display_name:'Test'}},error:null};
  if(table==='employees')return {data:{employee_number:owner,display_name:'Test',active:true},error:null};
  if(table==='nwtb_system_control')return {data:{state:'RUNNING'},error:null};
  if(table==='nwtb_admin_security')return {data:{value_hash:goodPin?require('crypto').createHash('sha256').update(pin).digest('hex'):'invalid'},error:null};
  if(table==='delivery_routes'){if(filters.some(f=>f[0]==='neq'))return {data:otherActive?[{id:'other'}]:[],error:null};if(filters.some(f=>f[1]==='id'))return {data:{...route},error:null};return {data:[{...route}],error:null}}
  if(table==='delivery_route_stops'){if(filters.some(f=>f[1]==='id'))return {data:{id:'s1',route_id:'r1',order_id:'o1',delivery_routes:{...route}},error:null};return {data:[],error:null}}
  return {data:[],error:null};}return q;}};
 let handler;const src=fs.readFileSync(__dirname+'/../supabase/functions/'+slug+'/index.ts','utf8').replace(/^import .*\n/,'');const sandbox={createClient:()=>db,Deno:{env:{get:()=>undefined},serve:f=>handler=f},Request,Response,crypto:globalThis.crypto,TextEncoder,Date,Set,Map,console};vm.runInNewContext(stripTypeScriptTypes(src),sandbox);
 const resp=await handler(new Request('https://test.invalid',{method:'POST',headers:{'content-type':'application/json','x-nwtb-session':'fake'},body:JSON.stringify({action,route_id:'r1',stop_id:'s1',status:'SKIPPED',driver_employee_number:'1234',pin})}));return {status:resp.status,body:await resp.json(),writes:writes.filter(w=>w.table!=='chat_sessions')};
}
(async()=>{let count=0;const check=async(slug,action,opts,status,noWrite=true)=>{const r=await run(slug,action,opts);assert.equal(r.status,status,slug+' '+action+' '+JSON.stringify(r.body));if(noWrite)assert.equal(r.writes.length,0);count++;return r};
 for(const slug of ['nwtb-delivery-tracking','nwtb-delivery-route-ops']){
 const employee=slug.endsWith('route-ops')?'9998':'1234';
 let r=await check(slug,'driver_routes',{employee},200);assert.equal(r.body.routes.length,0);
 r=await check(slug,'driver_routes',{employee,released:true},200);assert.equal(r.body.routes.length,1);
 for(const action of ['driver_route_state','route_changes'])await check(slug,action,{employee},403);
 await check(slug,'route_start_driver',{employee},409);
 await check(slug,'route_start_driver',{employee,released:true,otherActive:true},409);
 await check(slug,'route_start_driver',{employee,released:true},200,false);
 await check(slug,'stop_status_driver',{employee},409);
 }
 await check('nwtb-delivery','route_get',{},403);await check('nwtb-delivery','route_start',{},409);await check('nwtb-delivery','route_start',{released:true,otherActive:true},409);await check('nwtb-delivery','stop_status',{},409);
 for(const action of ['release_to_driver','hold_from_driver']){
 await check('nwtb-delivery-route-admin',action,{},403);
 await check('nwtb-delivery-route-admin',action,{manage:true,routeStatus:'ACTIVE'},409);
 await check('nwtb-delivery-route-admin',action,{manage:true,released:action==='hold_from_driver'},200,false);
 await check('nwtb-delivery-route-admin',action,{pin:'test-only',goodPin:true,released:action==='hold_from_driver'},200,false);
 }
 console.log(count+' release/hold/start/visibility/authorization cases passed against deployed-source handlers with an isolated fake database.');
})().catch(e=>{console.error(e);process.exit(1)});
