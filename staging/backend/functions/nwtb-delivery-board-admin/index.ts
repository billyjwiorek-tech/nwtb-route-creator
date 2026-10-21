import { createClient } from 'npm:@supabase/supabase-js@2.95.0'
const allowedOrigins=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000'])
function cors(req:Request){const origin=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://billyjwiorek-tech.github.io','Access-Control-Allow-Headers':'content-type, x-nwtb-session, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'}}
function reply(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
const url=Deno.env.get('SUPABASE_URL')!,secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}'),secret=secretKeys['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db=createClient(url,secret,{auth:{persistSession:false}}),now=()=>new Date().toISOString(),txt=(v:any,n=240)=>String(v??'').trim().slice(0,n)
const DELETE_PIN='4201'
async function systemKilled(){try{const {data,error}=await db.from('nwtb_system_control').select('state').eq('id',1).maybeSingle();return !error&&data?.state==='KILLED'}catch{return false}}
async function mutationGuard(req:Request){if(await systemKilled())return reply(req,{error:'NWTB Delivery System is currently locked by administrator.',code:'NWTB_SYSTEM_KILLED'},423);return null}
async function getSession(req:Request){const token=req.headers.get('x-nwtb-session');if(!token)return null;const {data}=await db.from('chat_sessions').select('token,employee_number,expires_at,employees(display_name,active)').eq('token',token).gt('expires_at',now()).maybeSingle();if(!data||!(data as any).employees?.active)return null;return {employee_number:data.employee_number,display_name:(data as any).employees.display_name as string}}
function pinOK(input:any){return txt(input?.pin,20)===DELETE_PIN}
Deno.serve(async(req:Request)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});if(req.method!=='POST')return reply(req,{error:'POST required'},405);let input:any;try{input=await req.json()}catch{return reply(req,{error:'Invalid JSON'},400)};const session=await getSession(req);if(!session)return reply(req,{error:'Delivery session expired.'},401);if(session.employee_number!=='9998')return reply(req,{error:'Office board management only.'},403);const action=txt(input?.action,60)
 if(action==='available_count'){const {count,error}=await db.from('delivery_orders').select('*',{count:'exact',head:true}).eq('status','UNASSIGNED');if(error)return reply(req,{error:'Could not count AVAILABLE stops.'},500);return reply(req,{ok:true,available_count:count||0})}
 if(action==='delete_selected_available'){
  const blocked=await mutationGuard(req);if(blocked)return blocked
  if(!pinOK(input))return reply(req,{error:'Incorrect deletion PIN.'},403)
  const raw=Array.isArray(input?.order_ids)?input.order_ids:[];const ids=[...new Set(raw.map((x:any)=>txt(x,80)).filter(Boolean))].slice(0,500)
  if(!ids.length)return reply(req,{error:'Select at least one AVAILABLE stop.'},400)
  const {data:rows,error:re}=await db.from('delivery_orders').select('id,customer_name,status').in('id',ids).eq('status','UNASSIGNED');if(re)return reply(req,{error:'Could not load selected stops.'},500)
  const actual=(rows||[]).map((r:any)=>r.id);if(!actual.length)return reply(req,{error:'The selected stops are no longer AVAILABLE.'},409)
  const t=now();const {error:ue}=await db.from('delivery_orders').update({status:'CANCELED',last_status_at:t,updated_at:t}).in('id',actual).eq('status','UNASSIGNED');if(ue)return reply(req,{error:'Could not delete selected stops.'},500)
  await db.from('delivery_events').insert({employee_number:session.employee_number,event_type:'SELECTED_AVAILABLE_STOPS_CLEARED',note:`${session.display_name} removed ${actual.length} selected AVAILABLE stop(s) from the dispatch board.`})
  return reply(req,{ok:true,deleted_count:actual.length,skipped_count:ids.length-actual.length,deleted_ids:actual})
 }
 if(action==='clear_available'){
  const blocked=await mutationGuard(req);if(blocked)return blocked
  if(txt(input?.confirmation,60)!=='CLEAR AVAILABLE STOPS'&&!pinOK(input))return reply(req,{error:'Enter the deletion PIN.'},403)
  const {data:rows,error:re}=await db.from('delivery_orders').select('id').eq('status','UNASSIGNED');if(re)return reply(req,{error:'Could not load AVAILABLE stops.'},500)
  const ids=(rows||[]).map((r:any)=>r.id);if(!ids.length)return reply(req,{ok:true,available_cleared:0})
  const t=now();const {error:ue}=await db.from('delivery_orders').update({status:'CANCELED',last_status_at:t,updated_at:t}).in('id',ids);if(ue)return reply(req,{error:'Could not clear AVAILABLE stops.'},500)
  await db.from('delivery_events').insert({employee_number:session.employee_number,event_type:'AVAILABLE_STOPS_CLEARED',note:`${session.display_name} cleared ${ids.length} AVAILABLE stops from the dispatch board.`})
  return reply(req,{ok:true,available_cleared:ids.length})
 }
 return reply(req,{error:'Unknown board-management action.'},400)
})
