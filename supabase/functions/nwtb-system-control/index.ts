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
const KILL_HASH='75fa641868ab523926d27c69a4968b017f702d762f4a1497e24546689d217e15'
const REACTIVATE_HASH='5410d50c0f3a84b556a3c42e56ba027640e11017e5b8339f4a276af84b1af312'
const KILLED_MESSAGE='NWTB DELIVERY SYSTEM KILLED!!! FUCK YOU PAY ME🖕🖕🖕🖕🖕'
function normalizePhrase(v:any){return String(v??'').trim().replace(/\s+/g,' ').toUpperCase()}
async function sha256(s:string){const b=new TextEncoder().encode(s);const h=await crypto.subtle.digest('SHA-256',b);return Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,'0')).join('')}
async function phraseOK(v:any,want:string){return await sha256(normalizePhrase(v))===want}
async function pinOK(v:any){const pin=txt(v,20);if(!pin)return false;const {data,error}=await db.from('nwtb_admin_security').select('value_hash').eq('key','management_pin_sha256').maybeSingle();if(error||!data?.value_hash)return false;return await sha256(pin)===data.value_hash}
async function hasPermission(employee:string,permission:string){const {data,error}=await db.rpc('nwtb_delivery_has_permission',{p_employee_number:employee,p_permission:permission});return !error&&data===true}
async function getSession(req:Request){const token=req.headers.get('x-nwtb-session');if(!token)return null;const {data}=await db.from('chat_sessions').select('token,employee_number,expires_at,employees(display_name,active)').eq('token',token).gt('expires_at',now()).maybeSingle();if(!data||!(data as any).employees?.active)return null;return {employee_number:data.employee_number,display_name:(data as any).employees.display_name as string}}
async function getState(){const {data,error}=await db.from('nwtb_system_control').select('id,state,message,changed_at,changed_by_employee_number,changed_by_display_name').eq('id',1).maybeSingle();if(error||!data)return {state:'ACTIVE',message:KILLED_MESSAGE,changed_at:null,changed_by_employee_number:null,changed_by_display_name:null};return data}
async function changeState(state:'ACTIVE'|'KILLED',session:any,action:'KILL'|'REACTIVATE'){const current:any=await getState(),t=now();const {error}=await db.from('nwtb_system_control').update({state,message:KILLED_MESSAGE,changed_at:t,changed_by_employee_number:session.employee_number,changed_by_display_name:session.display_name}).eq('id',1);if(error)throw Error('Could not change NWTB system state.');await db.from('nwtb_system_control_audit').insert({action,previous_state:current.state||'ACTIVE',new_state:state,actor_employee_number:session.employee_number,actor_display_name:session.display_name,created_at:t});return await getState()}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)})
 if(req.method!=='POST')return reply(req,{error:'POST required'},405)
 let input:any;try{input=await req.json()}catch{return reply(req,{error:'Invalid JSON'},400)}
 const action=txt(input?.action,40).toLowerCase()
 if(action==='status'){const s:any=await getState();return reply(req,{ok:true,state:s.state,killed:s.state==='KILLED',message:s.state==='KILLED'?s.message:null,changed_at:s.changed_at})}
 const session=await getSession(req);if(!session)return reply(req,{error:'Office delivery session expired. Refresh Dispatch and try again.'},401)
 const permitted=session.employee_number==='9998'||await hasPermission(session.employee_number,'SYSTEM_CONTROL');if(!permitted)return reply(req,{error:'System Control permission required.'},403)
 if(action==='audit'){const {data,error}=await db.from('nwtb_system_control_audit').select('id,action,previous_state,new_state,actor_employee_number,actor_display_name,created_at').order('id',{ascending:false}).limit(25);if(error)return reply(req,{error:'Could not load system-control audit.'},500);return reply(req,{ok:true,events:data||[]})}
 if(!(await pinOK(input?.pin)))return reply(req,{error:'Incorrect management PIN.'},403)
 if(action==='kill'){if(!(await phraseOK(input?.phrase,KILL_HASH)))return reply(req,{error:'Kill phrase not recognized.'},403);const s:any=await getState();if(s.state==='KILLED')return reply(req,{ok:true,state:'KILLED',killed:true,message:s.message,changed_at:s.changed_at,already:true});const next:any=await changeState('KILLED',session,'KILL');return reply(req,{ok:true,state:'KILLED',killed:true,message:next.message,changed_at:next.changed_at})}
 if(action==='reactivate'){if(!(await phraseOK(input?.phrase,REACTIVATE_HASH)))return reply(req,{error:'Reactivation phrase not recognized.'},403);const s:any=await getState();if(s.state==='ACTIVE')return reply(req,{ok:true,state:'ACTIVE',killed:false,changed_at:s.changed_at,already:true});const next:any=await changeState('ACTIVE',session,'REACTIVATE');return reply(req,{ok:true,state:'ACTIVE',killed:false,changed_at:next.changed_at})}
 return reply(req,{error:'Unknown system-control action.'},400)
})