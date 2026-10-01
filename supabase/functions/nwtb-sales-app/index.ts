import { loadSalesDatabase, validateSalesRoute, salesHoldMessage } from '../_shared/sales-route-server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const allowedOrigins=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000'])
function cors(req:Request){const origin=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://billyjwiorek-tech.github.io','Access-Control-Allow-Headers':'content-type, x-nwtb-session, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'}}
function reply(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
const url=Deno.env.get('SUPABASE_URL')!
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
const secret=secretKeys['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db=createClient(url,secret,{auth:{persistSession:false}})

async function getSession(req:Request){
 const token=req.headers.get('x-nwtb-session');if(!token)return null
 const {data}=await db.from('chat_sessions').select('token,employee_number,expires_at,employees(display_name,active)').eq('token',token).gt('expires_at',new Date().toISOString()).maybeSingle()
 if(!data||!(data as any).employees?.active||data.employee_number==='9998')return null
 await db.from('chat_sessions').update({last_seen_at:new Date().toISOString()}).eq('token',token)
 return {token:data.token,employee_number:data.employee_number,display_name:(data as any).employees.display_name as string}
}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)})
 if(req.method!=='POST')return reply(req,{error:'POST required'},405)
 const origin=req.headers.get('origin')||''
 if(origin && !allowedOrigins.has(origin))return reply(req,{error:'Sales access is not allowed from this site.'},403)
 let input:any;try{input=await req.json()}catch{return reply(req,{error:'Invalid JSON'},400)}
 const action=String(input?.action||'')

 if(action==='login'){
  const employeeNumber=String(input?.employee_number||'').trim()
  if(!/^\d{4}$/.test(employeeNumber))return reply(req,{error:'Enter a 4-digit employee number.'},400)
  if(employeeNumber==='9998')return reply(req,{error:'This account is for Delivery / Pickup only.'},403)
  const {data:employee}=await db.from('employees').select('employee_number,display_name,active').eq('employee_number',employeeNumber).maybeSingle()
  if(!employee||!employee.active)return reply(req,{error:'Employee number not found or inactive.'},401)
  const {data:session,error}=await db.from('chat_sessions').insert({employee_number:employeeNumber}).select('token').single()
  if(error)return reply(req,{error:'Could not start Sales session.'},500)
  return reply(req,{ok:true,token:session.token,employee_number:employee.employee_number,display_name:employee.display_name})
 }

 const session=await getSession(req)
 if(!session)return reply(req,{error:'Sales session expired. Sign in again.'},401)
 if(action==='whoami')return reply(req,{ok:true,employee_number:session.employee_number,display_name:session.display_name})
 if(action==='accounts'){
  try { const accounts=await loadSalesDatabase(db); return reply(req,{ok:true,count:accounts.length,accounts,source:'SUPABASE_PRIVATE'}) }
  catch(e){return reply(req,{error:(e as Error).message},503)}
 }
 if(action==='validate_route'){
  try { const result=await validateSalesRoute(db,input.stops); return reply(req,result.ok?result:{...result,error:salesHoldMessage},result.ok?200:409) }
  catch(e){return reply(req,{error:(e as Error).message},503)}
 }
 if(action==='logout'){
  await db.from('chat_sessions').delete().eq('token',session.token)
  return reply(req,{ok:true})
 }
 return reply(req,{error:'Unknown action.'},400)
})
