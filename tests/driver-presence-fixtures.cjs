'use strict';
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{stripTypeScriptTypes}=require('node:module'),{webcrypto,createHash,randomBytes,createECDH}=require('node:crypto'),webpush=require('web-push');
const now=Date.now(),iso=ms=>new Date(ms).toISOString(),clone=v=>JSON.parse(JSON.stringify(v));
function point(driver='1234',extra={}){return {driver_employee_number:driver,route_id:'fixture-route',lat:41.69,lon:-88.06,accuracy_m:5,heading_deg:45,speed_mps:10,captured_at:iso(now),received_at:iso(now),location_source:'WEB_DRIVER',...extra}}
function route(extra={}){return {id:'fixture-route',driver_employee_number:'1234',status:'ACTIVE',released_to_driver:true,route_date:'2026-10-20',depot:'BOLINGBROOK',wave:'MORNING',paused_at:null,resumed_at:null,returning_started_at:null,returned_at:null,...extra}}
function subscription(extra={}){const ecdh=createECDH('prime256v1'),key=ecdh.generateKeys();return {id:'fixture-sub',driver_employee_number:'1234',session_token:'fixture-driver',endpoint:'https://fcm.googleapis.com/fcm/send/fixture',p256dh:key.toString('base64url'),auth:randomBytes(16).toString('base64url'),page_path:'/nwtb-route-creator/driver-live.html',...extra}}
function endpoint(file,options={}){
 const employee=options.employee||'9998',writes=[],rpcCalls=[],packets=[],scheduled=[],jobs=[];let handler;
 const employees=[{employee_number:'9998',display_name:'Fixture Desk',active:true},{employee_number:'1234',display_name:'Fixture Driver',active:options.employeeActive!==false},{employee_number:'5678',display_name:'Second Driver',active:true},{employee_number:'8888',display_name:'Fixture Office',active:true}];
 const tables={employees,nwtb_delivery_roles:[{employee_number:'9998',role:'ADMIN',active:true},{employee_number:'1234',role:'DRIVER',active:options.roleActive!==false},{employee_number:'5678',role:'DRIVER',active:true},{employee_number:'8888',role:'VIEW_ONLY',active:true}],
 chat_sessions:[{token:'fixture-office',employee_number:'9998',last_seen_at:iso(now),expires_at:iso(now+86400000)},{token:'fixture-driver',employee_number:'1234',last_seen_at:iso(now),expires_at:iso(now+86400000)},...(options.sessions||[])],
 nwtb_system_control:[{id:1,state:options.killed?'KILLED':'RUNNING'}],delivery_routes:options.routes||[route()],delivery_driver_locations:options.locations||[point()],delivery_chat_messages:[],nwtb_driver_push_subscriptions:options.subscriptions||[],nwtb_driver_push_keys:[],
 nwtb_admin_security:[{key:'management_pin_sha256',value_hash:createHash('sha256').update('fixture-pin').digest('hex')}]};
 if(options.noDriverSession)tables.chat_sessions=tables.chat_sessions.filter(s=>s.employee_number!=='1234');
 const callerToken=employee==='9998'?'fixture-office':employee==='1234'?'fixture-driver':'fixture-caller';
 if(!tables.chat_sessions.some(s=>s.token===callerToken))tables.chat_sessions.push({token:callerToken,employee_number:employee,last_seen_at:iso(now),expires_at:iso(now+86400000)});
 const get=(r,k)=>k.split('.').reduce((v,p)=>v?.[p],r);
 function hydrate(table,row){if(table==='chat_sessions')return {...row,employees:employees.find(e=>e.employee_number===row.employee_number)};if(table==='nwtb_driver_push_subscriptions')return {...row,chat_sessions:tables.chat_sessions.find(s=>s.token===row.session_token)};return row}
 const db={from(table){let filters=[],operation='',values,ordering=[],limit=Infinity,conflict='';
 function result(single=false){
  if(options.failTable===table)return {data:null,error:{code:'XX000',message:'Fixture outage'}};
  let rows=(tables[table]||[]).filter(row=>filters.every(([op,k,v])=>{const value=get(hydrate(table,row),k);return op==='eq'?value===v:op==='neq'?value!==v:op==='is'?v===null?value==null:value===v:op==='in'?v.includes(value):op==='gt'?value>v:op==='gte'?value>=v:true}));
  if(operation){
   writes.push({table,operation,value:values,ids:rows.map(r=>r.id)});
   if(operation==='insert'||operation==='upsert'){
    const input=Array.isArray(values)?values:[values],affected=[];tables[table]||=[];
    for(const value of input){const found=operation==='upsert'&&conflict?tables[table].find(r=>r[conflict]===value[conflict]):null;
     const created=found||{id:table==='delivery_chat_messages'?tables[table].length+1:'fixture-'+table+'-'+tables[table].length,created_at:iso(now)};Object.assign(created,value);if(!found)tables[table].push(created);affected.push(created);
    }rows=affected;
   }else if(operation==='update')rows.forEach(r=>Object.assign(r,values));
   else if(operation==='delete')tables[table]=(tables[table]||[]).filter(r=>!rows.includes(r));
  }
  rows=rows.map(row=>hydrate(table,row));
  for(const [column,opts]of ordering.slice().reverse())rows.sort((a,b)=>{const x=get(a,column),y=get(b,column),c=x===y?0:x>y?1:-1;return opts?.ascending===false?-c:c});
  rows=rows.slice(0,limit);return {data:single?rows[0]?clone(rows[0]):null:clone(rows),count:rows.length,error:null};
 }
 const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>Promise.resolve(result()).then(resolve);if(key==='single'||key==='maybeSingle')return ()=>Promise.resolve(result(true));return(...args)=>{if(['eq','neq','is','in','gt','gte'].includes(key))filters.push([key,...args]);if(key==='order')ordering.push(args);if(key==='limit')limit=args[0];if(['insert','upsert','update','delete'].includes(key)){operation=key;values=args[0];if(key==='upsert')conflict=args[1]?.onConflict||''}return q}}});return q},
 async rpc(name,params){rpcCalls.push({name,params});if(name==='nwtb_delivery_has_permission')return {data:options.manageUsers??employee==='9998',error:null};if(options.rpcError)return {data:null,error:options.rpcError};return {data:{employee_number:params.p_employee_number,display_name:params.p_display_name,active:true,role:'DRIVER',already_exists:false},error:null}}};
 const context=vm.createContext({Deno:{env:{get:()=>undefined},serve:fn=>handler=fn},createClient:()=>db,webpush,Request,Response,URL,Date,Set,Map,Promise,TextEncoder,Uint8Array,atob,AbortSignal,crypto:webcrypto,console,fetch:async(url,init)=>{packets.push({url,init});return {ok:(options.pushStatus||201)<400,status:options.pushStatus||201}},setTimeout:fn=>{scheduled.push(fn);return scheduled.length},EdgeRuntime:{waitUntil:p=>jobs.push(p)}});
 const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/^import .*\n/gm,'');vm.runInContext(stripTypeScriptTypes(source),context,{filename:file});
 return {tables,writes,rpcCalls,packets,scheduled,jobs,async call(body,auth=options.authenticated!==false){const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json',...(auth?{'x-nwtb-session':callerToken}:{})},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()}},async runJobs(){for(const fn of scheduled.splice(0))fn();await Promise.all(jobs)}};
}
module.exports={endpoint,point,route,subscription,now,iso,clone};
