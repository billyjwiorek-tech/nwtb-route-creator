import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const allowedOrigins=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000'])
function cors(req:Request){const origin=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://billyjwiorek-tech.github.io','Access-Control-Allow-Headers':'content-type, x-nwtb-session, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'}}
function reply(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
const url=Deno.env.get('SUPABASE_URL')!
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
const secret=secretKeys['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db=createClient(url,secret,{auth:{persistSession:false}})
const now=()=>new Date().toISOString()
async function session(req:Request){const token=req.headers.get('x-nwtb-session');if(!token)return null;const {data}=await db.from('chat_sessions').select('token,employee_number,expires_at,employees(display_name,active)').eq('token',token).gt('expires_at',now()).maybeSingle();if(!data||!(data as any).employees?.active)return null;return {employee_number:data.employee_number,display_name:(data as any).employees.display_name as string}}
function paused(r:any){if(!r?.paused_at)return false;if(!r?.resumed_at)return true;return new Date(r.paused_at).getTime()>new Date(r.resumed_at).getTime()}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)})
 if(req.method!=='POST')return reply(req,{error:'POST required'},405)
 const s=await session(req);if(!s)return reply(req,{error:'Delivery session expired.'},401)
 if(s.employee_number!=='9998')return reply(req,{error:'Office session required.'},403)
 let body:any;try{body=await req.json()}catch{return reply(req,{error:'Invalid JSON'},400)}
 if(body?.action!=='active_drivers')return reply(req,{error:'Unknown supervisor action.'},400)

 const {data:routeRows,error:routeError}=await db.from('delivery_routes')
  .select('id,route_date,depot,wave,status,driver_employee_number,estimated_miles,estimated_minutes,route_note,paused_at,pause_reason,resumed_at,created_at,updated_at')
  .eq('status','ACTIVE').order('created_at',{ascending:false}).limit(100)
 if(routeError)return reply(req,{error:'Could not load active routes.'},500)
 const uniqueRoutes:any[]=[];const seen=new Set<string>()
 for(const r of routeRows||[]){const d=String(r.driver_employee_number||'');if(!d||seen.has(d))continue;seen.add(d);uniqueRoutes.push(r)}
 if(!uniqueRoutes.length)return reply(req,{ok:true,drivers:[],updated_at:now()})

 const routeIds=uniqueRoutes.map(r=>r.id),driverIds=uniqueRoutes.map(r=>r.driver_employee_number)
 const [{data:employees},{data:stops,error:stopError},{data:locRows,error:locError}]=await Promise.all([
  db.from('employees').select('employee_number,display_name').in('employee_number',driverIds),
  db.from('delivery_route_stops').select('id,route_id,order_id,stop_sequence,status,arrived_at,completed_at,driver_note,delivery_orders(id,customer_name,address,lat,lon,phone,notes,stop_type,priority)').in('route_id',routeIds).order('stop_sequence',{ascending:true}),
  db.from('delivery_driver_locations').select('driver_employee_number,route_id,lat,lon,accuracy_m,heading_deg,speed_mps,captured_at,received_at,location_source').in('driver_employee_number',driverIds).order('captured_at',{ascending:false}).limit(2000)
 ])
 if(stopError)return reply(req,{error:'Could not load active route stops.'},500)
 if(locError)return reply(req,{error:'Could not load driver locations.'},500)
 const names=new Map((employees||[]).map((e:any)=>[String(e.employee_number),e.display_name]))
 const byRoute=new Map<string,any[]>()
 for(const st of stops||[]){const id=String(st.route_id);if(!byRoute.has(id))byRoute.set(id,[]);byRoute.get(id)!.push(st)}
 const latest=new Map<string,any>()
 for(const p of locRows||[]){const d=String(p.driver_employee_number||'');if(!latest.has(d))latest.set(d,p)}

 const drivers=uniqueRoutes.map((r:any)=>{
  const rs=(byRoute.get(String(r.id))||[]).sort((a:any,b:any)=>Number(a.stop_sequence)-Number(b.stop_sequence))
  const next=rs.find((x:any)=>String(x.status||'').toUpperCase()==='PENDING')||null
  const completed=rs.filter((x:any)=>['DELIVERED','NOT_DELIVERED','SKIPPED'].includes(String(x.status||'').toUpperCase())).length
  const loc=latest.get(String(r.driver_employee_number))||null
  return {
   driver_employee_number:r.driver_employee_number,
   display_name:names.get(String(r.driver_employee_number))||String(r.driver_employee_number),
   route:{...r,paused:paused(r)},
   total_stops:rs.length,completed_stops:completed,
   next_stop:next,
   location:loc,
   stops:rs
  }
 })
 return reply(req,{ok:true,drivers,updated_at:now(),mode:'READ_ONLY_SUPERVISOR'})
})
