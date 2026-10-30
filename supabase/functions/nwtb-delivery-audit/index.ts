import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const allowedOrigins=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000'])
function cors(req:Request){const origin=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://billyjwiorek-tech.github.io','Access-Control-Allow-Headers':'content-type, x-nwtb-session, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'}}
function reply(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
const url=Deno.env.get('SUPABASE_URL')!
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
const secret=secretKeys['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db=createClient(url,secret,{auth:{persistSession:false}})
const now=()=>new Date().toISOString()
const txt=(v:any,n=300)=>String(v??'').trim().slice(0,n)
async function getSession(req:Request){const token=req.headers.get('x-nwtb-session');if(!token)return null;const {data}=await db.from('chat_sessions').select('employee_number,expires_at,employees(display_name,active)').eq('token',token).gt('expires_at',now()).maybeSingle();if(!data||!(data as any).employees?.active)return null;return {employee_number:data.employee_number,display_name:(data as any).employees.display_name as string}}
async function hasPermission(employee:string,permission:string){const {data,error}=await db.rpc('nwtb_delivery_has_permission',{p_employee_number:employee,p_permission:permission});return !error&&data===true}
function categoryFor(type:string){const t=String(type||'').toUpperCase();if(t.includes('ROLE'))return 'USER';if(t.includes('ROUTE'))return 'ROUTE';if(t.includes('STOP')||t.includes('DELIVER'))return 'STOP';return 'OPERATIONS'}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)})
 if(req.method!=='POST')return reply(req,{error:'POST required'},405)
 let input:any;try{input=await req.json()}catch{return reply(req,{error:'Invalid JSON'},400)}
 const session=await getSession(req);if(!session)return reply(req,{error:'Delivery session expired.'},401)
 if(!(await hasPermission(session.employee_number,'VIEW_AUDIT')))return reply(req,{error:'Audit permission required.'},403)
 const action=txt(input?.action,40).toLowerCase();if(action!=='recent')return reply(req,{error:'Unknown audit action.'},400)
 const days=Math.max(1,Math.min(90,Number(input?.days)||14)),limit=Math.max(25,Math.min(500,Number(input?.limit)||250)),since=new Date(Date.now()-days*86400000).toISOString(),search=txt(input?.search,120).toLowerCase(),want=txt(input?.category,30).toUpperCase()
 const [evRes,sysRes,bakRes,chatRes]=await Promise.all([
   db.from('delivery_events').select('id,created_at,route_id,stop_id,order_id,employee_number,event_type,note').gte('created_at',since).order('created_at',{ascending:false}).limit(700),
   db.from('nwtb_system_control_audit').select('id,action,previous_state,new_state,actor_employee_number,actor_display_name,created_at').gte('created_at',since).order('created_at',{ascending:false}).limit(200),
   db.from('nwtb_restore_points').select('id,label,reason,kind,status,created_at,created_by,completed_at,row_counts').gte('created_at',since).order('created_at',{ascending:false}).limit(200),
   db.from('delivery_chat_messages').select('id,employee_number,display_name,body,created_at,sender_role,conversation_driver_employee_number,conversation_driver_name,route_id').gte('created_at',since).order('created_at',{ascending:false}).limit(400)
 ])
 if(evRes.error||sysRes.error||bakRes.error||chatRes.error)return reply(req,{error:'Could not load complete audit history.'},500)
 const evs=evRes.data||[],employeeIds=[...new Set(evs.map((e:any)=>e.employee_number).filter(Boolean))],orderIds=[...new Set(evs.map((e:any)=>e.order_id).filter(Boolean))],routeIds=[...new Set([...evs.map((e:any)=>e.route_id),...(chatRes.data||[]).map((m:any)=>m.route_id)].filter(Boolean))]
 const [empRes,ordRes,routeRes]=await Promise.all([
   employeeIds.length?db.from('employees').select('employee_number,display_name').in('employee_number',employeeIds):Promise.resolve({data:[] as any[],error:null}),
   orderIds.length?db.from('delivery_orders').select('id,customer_name,address,status').in('id',orderIds):Promise.resolve({data:[] as any[],error:null}),
   routeIds.length?db.from('delivery_routes').select('id,route_date,wave,status,driver_employee_number').in('id',routeIds):Promise.resolve({data:[] as any[],error:null})
 ])
 const emp=new Map((empRes.data||[]).map((x:any)=>[x.employee_number,x.display_name])),orders=new Map((ordRes.data||[]).map((x:any)=>[x.id,x])),routes=new Map((routeRes.data||[]).map((x:any)=>[x.id,x]))
 const items:any[]=[]
 for(const e of evs){const o=orders.get(e.order_id),r=routes.get(e.route_id),cat=categoryFor(e.event_type);items.push({source:'DELIVERY_EVENT',source_id:String(e.id),created_at:e.created_at,category:cat,event_type:e.event_type,actor_employee_number:e.employee_number||null,actor_display_name:e.employee_number?(emp.get(e.employee_number)||e.employee_number):null,route_id:e.route_id||null,stop_id:e.stop_id||null,order_id:e.order_id||null,subject:o?.customer_name||r?.wave||null,note:e.note||null,metadata:{order:o||null,route:r||null}})}
 for(const s of sysRes.data||[]){items.push({source:'SYSTEM_CONTROL',source_id:String(s.id),created_at:s.created_at,category:'SYSTEM',event_type:`SYSTEM_${s.action}`,actor_employee_number:s.actor_employee_number||null,actor_display_name:s.actor_display_name||null,route_id:null,stop_id:null,order_id:null,subject:'NWTB Delivery System',note:`${s.previous_state} → ${s.new_state}`,metadata:{previous_state:s.previous_state,new_state:s.new_state}})}
 for(const b of bakRes.data||[]){items.push({source:'RESTORE_POINT',source_id:String(b.id),created_at:b.created_at,category:'BACKUP',event_type:`RESTORE_POINT_${b.kind}`,actor_employee_number:null,actor_display_name:b.created_by||'SYSTEM',route_id:null,stop_id:null,order_id:null,subject:b.label,note:b.reason||null,metadata:{status:b.status,completed_at:b.completed_at,row_counts:b.row_counts}})}
 for(const m of chatRes.data||[]){items.push({source:'DELIVERY_CHAT',source_id:String(m.id),created_at:m.created_at,category:'CHAT',event_type:'DELIVERY_CHAT_MESSAGE',actor_employee_number:m.employee_number||null,actor_display_name:m.display_name||m.sender_role||null,route_id:m.route_id||null,stop_id:null,order_id:null,subject:m.conversation_driver_name||'Delivery / Pickup Chat',note:m.body||null,metadata:{sender_role:m.sender_role,conversation_driver_employee_number:m.conversation_driver_employee_number,route:routes.get(m.route_id)||null}})}
 items.sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())
 const filtered=items.filter(x=>{if(want&&want!=='ALL'&&x.category!==want)return false;if(!search)return true;const hay=[x.category,x.event_type,x.actor_employee_number,x.actor_display_name,x.subject,x.note,x.route_id,x.order_id].join(' ').toLowerCase();return hay.includes(search)}).slice(0,limit)
 const counts:any={};for(const x of items)counts[x.category]=(counts[x.category]||0)+1
 return reply(req,{ok:true,days,total_loaded:items.length,returned:filtered.length,counts,events:filtered})
})