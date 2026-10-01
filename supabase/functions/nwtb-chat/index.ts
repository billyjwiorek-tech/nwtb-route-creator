import { validateSalesRoute, salesHoldMessage } from '../_shared/sales-route-server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const allowedOrigins=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000'])
function cors(req:Request){const origin=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://billyjwiorek-tech.github.io','Access-Control-Allow-Headers':'content-type, x-nwtb-session, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'}}
function reply(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
const url=Deno.env.get('SUPABASE_URL')!
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
const secret=secretKeys['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db=createClient(url,secret,{auth:{persistSession:false}})
async function systemKilled(){try{const {data,error}=await db.from('nwtb_system_control').select('state').eq('id',1).maybeSingle();return !error&&data?.state==='KILLED'}catch{return false}}

async function getSession(req:Request){
 const token=req.headers.get('x-nwtb-session');if(!token)return null
 const {data}=await db.from('chat_sessions').select('token,employee_number,expires_at,employees(display_name,active)').eq('token',token).gt('expires_at',new Date().toISOString()).maybeSingle()
 if(!data||!(data as any).employees?.active)return null
 await db.from('chat_sessions').update({last_seen_at:new Date().toISOString()}).eq('token',token)
 return {token:data.token,employee_number:data.employee_number,display_name:(data as any).employees.display_name as string}
}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)})
 if(req.method!=='POST')return reply(req,{error:'POST required'},405)
 let input:any;try{input=await req.json()}catch{return reply(req,{error:'Invalid JSON'},400)}
 const action=String(input?.action||'')

 if(action==='delivery_guest_start'){
  const origin=req.headers.get('origin')||''
  if(origin && !allowedOrigins.has(origin))return reply(req,{error:'Pickup Manager access is not allowed from this site.'},403)
  const employeeNumber='9998'
  const {data:employee}=await db.from('employees').select('employee_number,display_name,active').eq('employee_number',employeeNumber).maybeSingle()
  if(!employee||!employee.active)return reply(req,{error:'Delivery Desk account is unavailable.'},503)
  const {data:session,error}=await db.from('chat_sessions').insert({employee_number:employeeNumber}).select('token').single()
  if(error)return reply(req,{error:'Could not start Delivery Desk session.'},500)
  return reply(req,{ok:true,token:session.token,employee_number:employee.employee_number,display_name:employee.display_name})
 }

 if(action==='login'){
  const employeeNumber=String(input?.employee_number||'').trim()
  if(!/^\d{4}$/.test(employeeNumber))return reply(req,{error:'Enter a 4-digit employee number.'},400)
  if(employeeNumber==='9998')return reply(req,{error:'Use the Delivery / Pickup Manager for this account.'},403)
  const {data:employee}=await db.from('employees').select('employee_number,display_name,active').eq('employee_number',employeeNumber).maybeSingle()
  if(!employee||!employee.active)return reply(req,{error:'Employee number not found.'},401)
  const {data:session,error}=await db.from('chat_sessions').insert({employee_number:employeeNumber}).select('token').single()
  if(error)return reply(req,{error:'Could not start chat session.'},500)
  return reply(req,{ok:true,token:session.token,employee_number:employee.employee_number,display_name:employee.display_name})
 }

 if(action==='visit_list'){
  const {data,error}=await db.from('prospect_visit_status').select('account_key,status')
  if(error)return reply(req,{error:'Could not load visit statuses.'},500)
  return reply(req,{ok:true,statuses:data||[]})
 }
 if(action==='visit_get'){
  const key=String(input?.account_key||'').slice(0,300)
  const {data,error}=await db.from('prospect_visit_status').select('account_key,name,address,status,note,updated_by_name,updated_at').eq('account_key',key).maybeSingle()
  if(error)return reply(req,{error:'Could not load visit status.'},500)
  return reply(req,{ok:true,visit:data||null})
 }
 if(action==='visit_set'){
  const key=String(input?.account_key||'').trim().slice(0,300),name=String(input?.name||'').trim().slice(0,150),address=String(input?.address||'').trim().slice(0,220),status=String(input?.status||''),note=String(input?.note||'').trim().slice(0,1000)
  const allowed=new Set(['NOT_VISITED','FOLLOW_UP','DO_NOT_ROUTE','NOT_A_FIT'])
  if(!key||!name||!allowed.has(status))return reply(req,{error:'Invalid visit status update.'},400)
  let employeeNumber:string|null=null,displayName:string|null=null
  const session=await getSession(req)
  if(session){employeeNumber=session.employee_number;displayName=session.display_name}else{
   const optionalNo=String(input?.employee_number||'').trim()
   if(optionalNo){if(!/^\d{4}$/.test(optionalNo))return reply(req,{error:'Optional employee number must be 4 digits.'},400);const {data:employee}=await db.from('employees').select('employee_number,display_name,active').eq('employee_number',optionalNo).maybeSingle();if(!employee||!employee.active)return reply(req,{error:'Employee number not found.'},400);employeeNumber=employee.employee_number;displayName=employee.display_name}
  }
  const row={account_key:key,name,address,status,note:note||null,updated_by:employeeNumber,updated_by_name:displayName||'Unassigned',updated_at:new Date().toISOString()}
  const {data,error}=await db.from('prospect_visit_status').upsert(row,{onConflict:'account_key'}).select('account_key,name,address,status,note,updated_by_name,updated_at').single()
  if(error)return reply(req,{error:'Could not save visit status.'},500)
  return reply(req,{ok:true,visit:data})
 }

 const session=await getSession(req)
 if(!session)return reply(req,{error:'Chat session expired. Sign in again.'},401)
 const isDelivery=session.employee_number==='9998'
 if(action==='whoami')return reply(req,{ok:true,employee_number:session.employee_number,display_name:session.display_name})

 if(action==='list'){
  if(isDelivery){
   const {data,error}=await db.from('delivery_chat_messages').select('id,display_name,body,created_at').order('created_at',{ascending:false}).limit(100)
   if(error)return reply(req,{error:'Could not load Delivery / Pickup chat.'},500)
   return reply(req,{ok:true,messages:(data||[]).reverse().map((m:any)=>({...m,message_type:'text',route_payload:null}))})
  }
  const {data,error}=await db.from('chat_messages').select('id,display_name,message_type,body,route_payload,created_at').eq('channel','SALES').order('created_at',{ascending:false}).limit(100)
  if(error)return reply(req,{error:'Could not load Sales chat.'},500)
  return reply(req,{ok:true,messages:(data||[]).reverse()})
 }

 if(action==='send_text'){
  if(isDelivery&&await systemKilled())return reply(req,{error:'NWTB Delivery System is currently locked by administrator.',code:'NWTB_SYSTEM_KILLED'},423)
  const body=String(input?.body||'').trim();if(!body)return reply(req,{error:'Message is empty.'},400);if(body.length>1000)return reply(req,{error:'Message is too long.'},400)
  if(isDelivery){
   const {data,error}=await db.from('delivery_chat_messages').insert({employee_number:session.employee_number,display_name:session.display_name,body}).select('id,display_name,body,created_at').single()
   if(error)return reply(req,{error:'Could not send Delivery / Pickup message.'},500)
   return reply(req,{ok:true,message:{...data,message_type:'text',route_payload:null}})
  }
  const {data,error}=await db.from('chat_messages').insert({employee_number:session.employee_number,display_name:session.display_name,message_type:'text',body,channel:'SALES'}).select('id,display_name,message_type,body,route_payload,created_at').single()
  if(error)return reply(req,{error:'Could not send Sales message.'},500)
  return reply(req,{ok:true,message:data})
 }

 if(action==='send_route'){
  if(isDelivery)return reply(req,{error:'Route sharing is not part of Delivery / Pickup chat.'},403)
  const p=input?.route_payload
  if(!p||!Array.isArray(p.stops)||p.stops.length<1||p.stops.length>25)return reply(req,{error:'Create a route before sending it.'},400)
  let validation:any; try{validation=await validateSalesRoute(db,p.stops)}catch(e){return reply(req,{error:(e as Error).message},503)}
  if(!validation.ok)return reply(req,{error:salesHoldMessage,blocked:validation.blocked},409)
  p.stops=validation.stops.map((a:any)=>({...a,customerNumber:a.finalCustomerNumber??a.customerNumber,layer:a.finalLayer??a.layer,broadType:a.finalBroadType??a.broadType}))
  const payload={title:String(p.title||'NWTB Sales Route').slice(0,120),sent_note:String(p.sent_note||'').slice(0,500),miles:p.miles??null,minutes:p.minutes??null,route_type:p.route_type??null,radius:p.radius??null,stops:p.stops.slice(0,25).map((s:any)=>({salesAccountId:s.salesAccountId,name:String(s.name||'').slice(0,150),address:String(s.address||'').slice(0,220),customerNumber:String(s.customerNumber||'').slice(0,40),layer:String(s.layer||'').slice(0,80),broadType:String(s.broadType||'').slice(0,80),lat:Number(s.lat),lon:Number(s.lon),planningScore:Number(s.planningScore||0),salesFit:String(s.salesFit||'').slice(0,50),priority:String(s.priority||'').slice(0,80),phone:String(s.phone||'').slice(0,50),powerUnits:s.powerUnits??null,lastPositiveSale:String(s.lastPositiveSale||'').slice(0,80)}))}
  const {data,error}=await db.from('chat_messages').insert({employee_number:session.employee_number,display_name:session.display_name,message_type:'route',body:payload.sent_note||null,route_payload:payload,channel:'SALES'}).select('id,display_name,message_type,body,route_payload,created_at').single()
  if(error)return reply(req,{error:'Could not send route.'},500)
  return reply(req,{ok:true,message:data})
 }
 if(action==='logout'){await db.from('chat_sessions').delete().eq('token',session.token);return reply(req,{ok:true})}
 return reply(req,{error:'Unknown action.'},400)
})
