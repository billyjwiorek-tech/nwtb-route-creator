import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const allowedOrigins=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000'])
function cors(req:Request){const origin=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://billyjwiorek-tech.github.io','Access-Control-Allow-Headers':'content-type, x-nwtb-session, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'}}
function reply(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
const url=Deno.env.get('SUPABASE_URL')!
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
const secret=secretKeys['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db=createClient(url,secret,{auth:{persistSession:false}})
const now=()=>new Date().toISOString()
const txt=(v:any,n=240)=>String(v??'').trim().slice(0,n)
const roles=new Set(['ADMIN','DISPATCH','SUPERVISOR','DRIVER','VIEW_ONLY'])

async function sha256(s:string){const b=new TextEncoder().encode(s);const h=await crypto.subtle.digest('SHA-256',b);return Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,'0')).join('')}
async function pinOK(input:any){const pin=txt(input?.pin,20);if(!pin)return false;const {data,error}=await db.from('nwtb_admin_security').select('value_hash').eq('key','management_pin_sha256').maybeSingle();if(error||!data?.value_hash)return false;return await sha256(pin)===data.value_hash}
async function getSession(req:Request){const token=req.headers.get('x-nwtb-session');if(!token)return null;const {data}=await db.from('chat_sessions').select('employee_number,expires_at,employees(display_name,active)').eq('token',token).gt('expires_at',now()).maybeSingle();if(!data||!(data as any).employees?.active)return null;const {data:roleRow}=await db.from('nwtb_delivery_roles').select('role,active').eq('employee_number',data.employee_number).maybeSingle();return {employee_number:data.employee_number,display_name:(data as any).employees.display_name as string,role:roleRow?.active?roleRow.role:null}}
async function hasPermission(employee:string,permission:string){const {data,error}=await db.rpc('nwtb_delivery_has_permission',{p_employee_number:employee,p_permission:permission});return !error&&data===true}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)})
 if(req.method!=='POST')return reply(req,{error:'POST required'},405)
 let input:any;try{input=await req.json()}catch{return reply(req,{error:'Invalid JSON'},400)}
 const session=await getSession(req);if(!session)return reply(req,{error:'Delivery session expired.'},401)
 const action=txt(input?.action,60).toLowerCase()
 if(action==='my_role')return reply(req,{ok:true,employee_number:session.employee_number,display_name:session.display_name,role:session.role})
 if(action==='create_driver'){
  if(session.role==='DRIVER'||!session.role)return reply(req,{error:'Office access is required to add a driver.'},403)
  const permission=await hasPermission(session.employee_number,'MANAGE_USERS')
  if(!permission&&!(await pinOK(input)))return reply(req,{error:'Admin PIN required to add a driver.',code:'ADMIN_PIN_REQUIRED'},403)
  const {data:control,error:controlError}=await db.from('nwtb_system_control').select('state').eq('id',1).maybeSingle()
  if(controlError||!control||control.state==='KILLED')return reply(req,{error:'NWTB Delivery System is locked.',code:'NWTB_SYSTEM_KILLED'},423)
  const employee=txt(input?.employee_number,20),name=txt(input?.display_name,121)
  if(!/^\d{4}$/.test(employee)||employee==='9998'||name.length<2||name.length>120)return reply(req,{error:'Enter a name and exactly 4 employee-number digits. Delivery Desk number is reserved.'},400)
  const {data,error}=await db.rpc('nwtb_add_delivery_driver',{p_employee_number:employee,p_display_name:name,p_created_by:session.employee_number})
  if(error){const status=error.code==='23505'?409:error.code==='22023'?400:error.code==='42501'?403:error.code==='P0001'?423:500;return reply(req,{error:status===409?'Employee number already exists. Use USER ROLES to manage that employee.':status===500?'Could not add driver. Please refresh the roster before retrying.':error.message},status)}
  return reply(req,{ok:true,driver:data})
 }
 if(!(await hasPermission(session.employee_number,'MANAGE_USERS')))return reply(req,{error:'Administrator role required.'},403)

 if(action==='list'){
  const {data,error}=await db.from('employees').select('employee_number,display_name,active').order('display_name')
  if(error)return reply(req,{error:'Could not load employees.'},500)
  const {data:rr,error:re}=await db.from('nwtb_delivery_roles').select('employee_number,role,active,updated_at,updated_by')
  if(re)return reply(req,{error:'Could not load delivery roles.'},500)
  const {data:routes}=await db.from('delivery_routes').select('driver_employee_number,id,status,route_date,wave').in('status',['PLANNED','ACTIVE'])
  const by=new Map((rr||[]).map((r:any)=>[r.employee_number,r])),activeRoutes=new Map<string,any[]>()
  for(const r of routes||[]){const a=activeRoutes.get(r.driver_employee_number)||[];a.push(r);activeRoutes.set(r.driver_employee_number,a)}
  return reply(req,{ok:true,employees:(data||[]).map((e:any)=>({...e,delivery_role:by.get(e.employee_number)?.role||null,role_active:by.get(e.employee_number)?.active??false,role_updated_at:by.get(e.employee_number)?.updated_at||null,role_updated_by:by.get(e.employee_number)?.updated_by||null,active_routes:activeRoutes.get(e.employee_number)||[]}))})
 }

 if(action==='permissions'){
  const {data,error}=await db.from('nwtb_delivery_role_permissions').select('role,permission').order('role').order('permission')
  if(error)return reply(req,{error:'Could not load permissions.'},500)
  return reply(req,{ok:true,permissions:data||[]})
 }

 if(action==='set_role'){
  if(!(await pinOK(input)))return reply(req,{error:'Incorrect management PIN.'},403)
  const employee=txt(input?.employee_number,20),role=txt(input?.role,30).toUpperCase(),active=input?.active!==false
  if(!/^\d{4}$/.test(employee)||!roles.has(role))return reply(req,{error:'Valid employee and role are required.'},400)
  if(employee==='9998'&&(role!=='ADMIN'||!active))return reply(req,{error:'The Delivery Desk recovery administrator cannot be downgraded or disabled.'},409)
  const {data:emp}=await db.from('employees').select('employee_number,display_name,active').eq('employee_number',employee).maybeSingle();if(!emp)return reply(req,{error:'Employee not found.'},404)
  if(role!=='DRIVER'||!active){const {count}=await db.from('delivery_routes').select('*',{count:'exact',head:true}).eq('driver_employee_number',employee).in('status',['PLANNED','ACTIVE']);if((count||0)>0)return reply(req,{error:'This employee still has a planned or active route. Reassign/finish the route before removing the DRIVER role.'},409)}
  const {data:old}=await db.from('nwtb_delivery_roles').select('role,active').eq('employee_number',employee).maybeSingle()
  const t=now();const {error}=await db.from('nwtb_delivery_roles').upsert({employee_number:employee,role,active,updated_at:t,updated_by:session.employee_number},{onConflict:'employee_number'});if(error)return reply(req,{error:'Could not update delivery role.'},500)
  await db.from('delivery_events').insert({employee_number:session.employee_number,event_type:'DELIVERY_ROLE_CHANGED',note:`${emp.display_name} (${employee}) ${old?.role||'UNASSIGNED'} -> ${role}; active=${active}`})
  return reply(req,{ok:true,employee_number:employee,display_name:emp.display_name,role,active,updated_at:t})
 }
 return reply(req,{error:'Unknown role-management action.'},400)
})