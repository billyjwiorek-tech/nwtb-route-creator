import { createClient } from 'npm:@supabase/supabase-js@2.95.0'
const allowedOrigins=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000'])
function cors(req:Request){const o=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowedOrigins.has(o)?o:'https://billyjwiorek-tech.github.io','Access-Control-Allow-Headers':'content-type, x-nwtb-session, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'}}
function reply(req:Request,b:any,s=200){return new Response(JSON.stringify(b),{status:s,headers:cors(req)})}
const db=createClient(Deno.env.get('SUPABASE_URL')!,JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
const now=()=>new Date().toISOString(),txt=(v:any,n=800)=>String(v??'').trim().slice(0,n)
const REASONS:any={CUSTOMER_CLOSED:'Customer closed',NO_ONE_AVAILABLE:'No one available to receive',WRONG_ADDRESS:'Wrong / bad address',CUSTOMER_REFUSED:'Customer refused delivery',DAMAGED_PARTS:'Parts damaged',MISSING_PARTS:'Parts missing / order incomplete',ACCESS_BLOCKED:'Access blocked / cannot reach delivery point',CUSTOMER_REQUESTED_RESCHEDULE:'Customer requested reschedule',VEHICLE_ISSUE:'Driver / vehicle issue',OTHER:'Other'}
async function getSession(req:Request){const token=req.headers.get('x-nwtb-session');if(!token)return null;const {data}=await db.from('chat_sessions').select('employee_number,expires_at,employees(display_name,active)').eq('token',token).gt('expires_at',now()).maybeSingle();if(!data||!(data as any).employees?.active)return null;return {employee_number:data.employee_number,display_name:(data as any).employees.display_name as string}}
async function killed(){const {data}=await db.from('nwtb_system_control').select('state').eq('id',1).maybeSingle();return data?.state==='KILLED'}
async function roleFor(employee:string){const {data}=await db.from('nwtb_delivery_roles').select('role,active').eq('employee_number',employee).maybeSingle();return data?.active?data.role:null}
async function hasPermission(employee:string,permission:string){const role=await roleFor(employee);if(!role)return false;const {data}=await db.from('nwtb_delivery_role_permissions').select('permission').eq('role',role).eq('permission',permission).maybeSingle();return !!data}
async function sha256(s:string){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,'0')).join('')}
async function pinOK(v:any){const {data}=await db.from('nwtb_admin_security').select('value_hash').eq('key','management_pin_sha256').maybeSingle();if(!data?.value_hash)return false;return (await sha256(txt(v,40)))===data.value_hash}
function coord(v:any,min:number,max:number){const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});if(req.method!=='POST')return reply(req,{error:'POST required'},405)
 let input:any;try{input=await req.json()}catch{return reply(req,{error:'Invalid JSON'},400)}
 const session=await getSession(req);if(!session)return reply(req,{error:'Delivery session expired. Refresh the NWTB Delivery system.'},401)
 const action=txt(input?.action,60).toLowerCase()
 if(action==='reasons')return reply(req,{ok:true,reasons:Object.entries(REASONS).map(([code,label])=>({code,label}))})
 if(action==='submit'){
  if(await killed())return reply(req,{error:'NWTB_SYSTEM_KILLED'},423)
  const driver=txt(input?.driver_employee_number,20),stopId=txt(input?.stop_id,80),reasonCode=txt(input?.reason_code,60).toUpperCase(),notes=txt(input?.notes,1500)
  if(!/^\d{4}$/.test(driver)||driver==='9998')return reply(req,{error:'Select a valid driver.'},400)
  if(!stopId||!REASONS[reasonCode])return reply(req,{error:'Choose a valid delivery exception reason.'},400)
  if(reasonCode==='OTHER'&&notes.length<3)return reply(req,{error:'Add a note explaining the Other exception.'},400)
  const role=await roleFor(driver);if(role!=='DRIVER')return reply(req,{error:'Selected employee is not an active Driver.'},403)
  const lat=coord(input?.lat,-90,90),lon=coord(input?.lon,-180,180),accuracy=Number(input?.accuracy_m)
  const {data,error}=await db.rpc('nwtb_submit_delivery_exception',{p_stop_id:stopId,p_driver_employee_number:driver,p_reason_code:reasonCode,p_reason_label:REASONS[reasonCode],p_notes:notes||null,p_lat:lat,p_lon:lon,p_accuracy_m:Number.isFinite(accuracy)?Math.max(0,accuracy):null,p_occurred_at:input?.occurred_at||now()})
  if(error)return reply(req,{error:error.message||'Could not save delivery exception.'},409)
  return reply(req,{ok:true,exception:data})
 }
 if(action==='list'){
  if(!(await hasPermission(session.employee_number,'VIEW_SYSTEM')))return reply(req,{error:'Exception view is not available for this user.'},403)
  const status=txt(input?.status||'OPEN',20).toUpperCase(),days=Math.max(1,Math.min(90,Number(input?.days)||30)),limit=Math.max(1,Math.min(300,Number(input?.limit)||150)),search=txt(input?.search,100).toLowerCase()
  let q=db.from('delivery_exceptions').select('id,exception_number,route_id,stop_id,order_id,driver_employee_number,driver_display_name,customer_name,address,sales_order_no,customer_number,reason_code,reason_label,notes,lat,lon,accuracy_m,occurred_at,status,resolution_action,resolution_note,resolved_by_employee_number,resolved_by_display_name,resolved_at,created_at').gte('created_at',new Date(Date.now()-days*86400000).toISOString()).order('created_at',{ascending:false}).limit(limit)
  if(status==='OPEN'||status==='RESOLVED')q=q.eq('status',status)
  const {data,error}=await q;if(error)return reply(req,{error:'Could not load delivery exceptions.'},500)
  let rows=data||[];if(search)rows=rows.filter((x:any)=>[x.exception_number,x.customer_name,x.address,x.sales_order_no,x.customer_number,x.driver_display_name,x.driver_employee_number,x.reason_label,x.notes,x.resolution_note].some(v=>String(v??'').toLowerCase().includes(search)))
  const canManage=await hasPermission(session.employee_number,'MANAGE_STOPS')
  return reply(req,{ok:true,exceptions:rows,open_count:rows.filter((x:any)=>x.status==='OPEN').length,can_manage:canManage})
 }
 if(action==='resolve'){
  if(await killed())return reply(req,{error:'NWTB_SYSTEM_KILLED'},423)
  if(!(await hasPermission(session.employee_number,'MANAGE_STOPS')))return reply(req,{error:'Dispatch stop-management permission is required.'},403)
  if(!(await pinOK(input?.pin)))return reply(req,{error:'Incorrect management PIN.'},403)
  const id=txt(input?.exception_id,80),resolution=txt(input?.resolution_action,40).toUpperCase(),note=txt(input?.resolution_note,1000)
  if(!id||!['RETRY_AVAILABLE','CLOSE_NO_RETRY'].includes(resolution))return reply(req,{error:'Choose a valid exception resolution.'},400)
  const {data,error}=await db.rpc('nwtb_resolve_delivery_exception',{p_exception_id:id,p_action:resolution,p_employee_number:session.employee_number,p_resolution_note:note||null})
  if(error)return reply(req,{error:error.message||'Could not resolve delivery exception.'},409)
  return reply(req,{ok:true,exception:data})
 }
 return reply(req,{error:'Unknown delivery-exception action.'},400)
})
