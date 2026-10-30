import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const allowedOrigins=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000'])
function cors(req:Request){const origin=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://billyjwiorek-tech.github.io','Access-Control-Allow-Headers':'content-type, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'}}
function reply(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
const url=Deno.env.get('SUPABASE_URL')!
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
const secret=secretKeys['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db=createClient(url,secret,{auth:{persistSession:false}})

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)})
 if(req.method!=='POST')return reply(req,{error:'POST required'},405)
 const origin=req.headers.get('origin')||''
 if(origin && !allowedOrigins.has(origin))return reply(req,{error:'Driver access is not allowed from this site.'},403)
 let input:any={};try{input=await req.json()}catch{}
 if(String(input?.action||'')!=='bootstrap')return reply(req,{error:'Unknown action.'},400)
 const employeeNumber='9998'
 const [{data:desk},{data:roleRows,error:re}]=await Promise.all([
  db.from('employees').select('employee_number,display_name,active').eq('employee_number',employeeNumber).maybeSingle(),
  db.from('nwtb_delivery_roles').select('employee_number').eq('role','DRIVER').eq('active',true)
 ])
 if(!desk||!desk.active)return reply(req,{error:'Delivery Desk account is unavailable.'},503)
 if(re)return reply(req,{error:'Could not load driver permissions.'},500)
 const ids=(roleRows||[]).map((r:any)=>r.employee_number).filter((x:string)=>x!=='9998')
 const {data:drivers,error:de}=ids.length?await db.from('employees').select('employee_number,display_name').in('employee_number',ids).eq('active',true).order('display_name'):{data:[] as any[],error:null}
 if(de)return reply(req,{error:'Could not load drivers.'},500)
 const {data:session,error}=await db.from('chat_sessions').insert({employee_number:employeeNumber}).select('token').single()
 if(error||!session?.token)return reply(req,{error:'Could not start Driver session.'},500)
 return reply(req,{ok:true,token:session.token,drivers:drivers||[]})
})