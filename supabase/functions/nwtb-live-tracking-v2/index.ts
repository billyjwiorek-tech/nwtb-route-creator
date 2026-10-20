import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const allowedOrigins=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000'])
function cors(req:Request){const origin=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://billyjwiorek-tech.github.io','Access-Control-Allow-Headers':'content-type, x-nwtb-session, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'}}
function reply(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors(req)})}

const url=Deno.env.get('SUPABASE_URL')!
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
const secret=secretKeys['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db=createClient(url,secret,{auth:{persistSession:false}})
const now=()=>new Date().toISOString()
const text=(v:any,n=240)=>String(v??'').trim().slice(0,n)

async function systemKilled(){try{const {data,error}=await db.from('nwtb_system_control').select('state').eq('id',1).maybeSingle();return !error&&data?.state==='KILLED'}catch{return false}}
async function mutationGuard(req:Request){if(await systemKilled())return reply(req,{error:'NWTB Delivery System is currently locked by administrator.',code:'NWTB_SYSTEM_KILLED'},423);return null}

async function getSession(req:Request){
 const token=req.headers.get('x-nwtb-session');if(!token)return null
 const {data}=await db.from('chat_sessions').select('token,employee_number,expires_at,employees(display_name,active)').eq('token',token).gt('expires_at',now()).maybeSingle()
 if(!data||!(data as any).employees?.active)return null
 await db.from('chat_sessions').update({last_seen_at:now()}).eq('token',token)
 return {token:data.token,employee_number:data.employee_number,display_name:(data as any).employees.display_name as string}
}
async function validDriver(employeeNumber:string){const [{data:emp},{data:role}]=await Promise.all([db.from('employees').select('employee_number,display_name,active').eq('employee_number',employeeNumber).maybeSingle(),db.from('nwtb_delivery_roles').select('role,active').eq('employee_number',employeeNumber).maybeSingle()]);return emp?.active&&role?.active&&role.role==='DRIVER'?emp:null}
function paused(r:any){if(!r?.paused_at)return false;if(!r?.resumed_at)return true;return new Date(r.paused_at).getTime()>new Date(r.resumed_at).getTime()}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)})
 if(req.method!=='POST')return reply(req,{error:'POST required'},405)
 let input:any;try{input=await req.json()}catch{return reply(req,{error:'Invalid JSON'},400)}
 const session=await getSession(req);if(!session)return reply(req,{error:'Delivery session expired.'},401)
 const action=text(input?.action,60),isDesk=session.employee_number==='9998'

 if(action==='location_update'){
  const blocked=await mutationGuard(req);if(blocked)return blocked
  const driver=isDesk?text(input?.driver_employee_number,20):session.employee_number
  if(!/^\d{4}$/.test(driver)||driver==='9998')return reply(req,{error:'Select a valid driver.'},400)
  const employee=await validDriver(driver);if(!employee)return reply(req,{error:'Driver not found.'},404)
  const lat=Number(input?.lat),lon=Number(input?.lon),accuracy=Number(input?.accuracy_m),heading=Number(input?.heading_deg),speed=Number(input?.speed_mps)
  if(!Number.isFinite(lat)||lat<-90||lat>90||!Number.isFinite(lon)||lon<-180||lon>180)return reply(req,{error:'Invalid location.'},400)
  const routeId=text(input?.route_id,60)||null
  if(routeId){const {data:r}=await db.from('delivery_routes').select('id,driver_employee_number').eq('id',routeId).maybeSingle();if(!r||r.driver_employee_number!==driver)return reply(req,{error:'Route is not assigned to this driver.'},403)}
  const capturedRaw=input?.captured_at?new Date(input.captured_at):new Date(),captured=isNaN(capturedRaw.getTime())?now():capturedRaw.toISOString()
  const row={driver_employee_number:driver,route_id:routeId,lat,lon,accuracy_m:Number.isFinite(accuracy)?Math.max(0,accuracy):null,heading_deg:Number.isFinite(heading)?heading:null,speed_mps:Number.isFinite(speed)?Math.max(0,speed):null,captured_at:captured,location_source:'WEB_DRIVER'}
  const {error}=await db.from('delivery_driver_locations').insert(row);if(error)return reply(req,{error:'Could not save driver location.'},500)
  return reply(req,{ok:true,engine:'NWTB_BUILTIN',source:'WEB_DRIVER',captured_at:captured})
 }

 if(action==='locations_latest'){
  if(!isDesk)return reply(req,{error:'Office view only.'},403)
  const cutoff=new Date(Date.now()-24*60*60*1000).toISOString(),builtinFreshCutoff=Date.now()-2*60*1000
  const {data,error}=await db.from('delivery_driver_locations').select('driver_employee_number,route_id,lat,lon,accuracy_m,heading_deg,speed_mps,captured_at,received_at,location_source').gte('captured_at',cutoff).order('captured_at',{ascending:false}).limit(4000)
  if(error)return reply(req,{error:'Could not load driver locations.'},500)
  const buckets=new Map<string,{latest:any|null,lastBuiltin:any|null,lastRouting:any|null}>()
  for(const r of data||[]){let b=buckets.get(r.driver_employee_number);if(!b){b={latest:null,lastBuiltin:null,lastRouting:null};buckets.set(r.driver_employee_number,b)}if(!b.latest)b.latest=r;if(!b.lastBuiltin&&r.location_source==='WEB_DRIVER')b.lastBuiltin=r;if(!b.lastRouting&&r.location_source==='GPS_ROUTING_APP')b.lastRouting=r}
  const chosen=new Map<string,any>()
  for(const [driver,b] of buckets){const builtinFresh=b.lastBuiltin&&new Date(b.lastBuiltin.captured_at).getTime()>=builtinFreshCutoff;const r=builtinFresh?b.lastBuiltin:b.latest;if(r)chosen.set(driver,{...r,builtin_last_captured_at:b.lastBuiltin?.captured_at||null,builtin_last_received_at:b.lastBuiltin?.received_at||null,gps_last_captured_at:b.lastRouting?.captured_at||null,gps_last_received_at:b.lastRouting?.received_at||null,tracking_engine:builtinFresh?'NWTB_BUILTIN':(r.location_source==='GPS_ROUTING_APP'?'GPS_ROUTING_APP':'WEB_DRIVER')})}
  const ids=[...chosen.keys()]
  const {data:employees}=ids.length?await db.from('employees').select('employee_number,display_name').in('employee_number',ids):{data:[] as any[]}
  const names=new Map((employees||[]).map((e:any)=>[e.employee_number,e.display_name]))
  const routeIds=[...new Set([...chosen.values()].map((r:any)=>r.route_id).filter(Boolean))]
  const {data:routes}=routeIds.length?await db.from('delivery_routes').select('id,route_date,depot,wave,status,driver_employee_number,paused_at,pause_reason,resumed_at,returning_started_at,returned_at,end_mode,end_name').in('id',routeIds).in('status',['PLANNED','ACTIVE']):{data:[] as any[]}
  const routeMap=new Map((routes||[]).map((r:any)=>[r.id,{...r,paused:paused(r),tracking_status:r.status==='ACTIVE'&&r.returning_started_at&&!r.returned_at?'RETURNING':r.status}]))
  const drivers=[...chosen.values()].filter((r:any)=>routeMap.has(r.route_id)).map((r:any)=>({...r,display_name:names.get(r.driver_employee_number)||r.driver_employee_number,route:routeMap.get(r.route_id),route_id:r.route_id}))
  return reply(req,{ok:true,engine:'NWTB_LIVE_TRACKING_V2',drivers})
 }

 return reply(req,{error:'Unknown live tracking action.'},400)
})