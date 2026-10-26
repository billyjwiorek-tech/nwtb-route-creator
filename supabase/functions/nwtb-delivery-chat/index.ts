import { createClient } from 'npm:@supabase/supabase-js@2.95.0'
import webpush from 'npm:web-push@3.6.7'

const allowedOrigins=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000'])
function cors(req:Request){const origin=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://billyjwiorek-tech.github.io','Access-Control-Allow-Headers':'content-type, x-nwtb-session, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Vary':'Origin'}}
function reply(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
const db=createClient(Deno.env.get('SUPABASE_URL')!,JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
const now=()=>new Date().toISOString()
const fields='id,employee_number,display_name,body,created_at,sender_role,conversation_driver_employee_number,conversation_driver_name,route_id,read_by_dispatch_at,read_by_driver_at'
async function systemKilled(){try{const {data,error}=await db.from('nwtb_system_control').select('state').eq('id',1).maybeSingle();return !error&&data?.state==='KILLED'}catch{return false}}
const mutatingActions=new Set(['driver_send','dispatch_send','mark_dispatch_read','mark_driver_read','driver_acknowledge','send_text','phone_push_subscribe','phone_push_unsubscribe','phone_push_test'])

async function getSession(req:Request){
 const token=req.headers.get('x-nwtb-session');if(!token)return null
 const {data}=await db.from('chat_sessions').select('token,employee_number,expires_at,employees(display_name,active)').eq('token',token).gt('expires_at',now()).maybeSingle()
 if(!data||!(data as any).employees?.active)return null
 await db.from('chat_sessions').update({last_seen_at:now()}).eq('token',token)
 return {token:data.token,employee_number:data.employee_number,display_name:(data as any).employees.display_name as string}
}
async function driverIdentity(no:string){
 if(!/^\d{4}$/.test(no)||no==='9998')return null
 const [{data:emp},{data:role}]=await Promise.all([
  db.from('employees').select('employee_number,display_name,active').eq('employee_number',no).maybeSingle(),
  db.from('nwtb_delivery_roles').select('role,active').eq('employee_number',no).maybeSingle()
 ])
 return emp?.active&&role?.active&&role.role==='DRIVER'?emp:null
}
function cleanBody(v:any){return String(v??'').trim().slice(0,1000)}


let vapidPromise:Promise<any>|null=null
async function vapidKeys(){
 if(!vapidPromise)vapidPromise=(async()=>{
  let {data,error}=await db.from('nwtb_driver_push_keys').select('public_key,private_key').eq('id',1).maybeSingle()
  if(error)throw Error('Phone notification configuration unavailable.')
  if(!data){
   const generated=webpush.generateVAPIDKeys()
   const inserted=await db.from('nwtb_driver_push_keys').insert({id:1,public_key:generated.publicKey,private_key:generated.privateKey})
   if(inserted.error&&inserted.error.code!=='23505')throw Error('Could not initialize phone notifications.')
   const saved=await db.from('nwtb_driver_push_keys').select('public_key,private_key').eq('id',1).single()
   if(saved.error||!saved.data)throw Error('Phone notification configuration unavailable.')
   data=saved.data
  }
  return data
 })().catch(error=>{vapidPromise=null;throw error})
 return vapidPromise
}
function trustedPushEndpoint(value:any){
 try{const u=new URL(String(value||''));const h=u.hostname.toLowerCase();return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&(!u.port||u.port==='443')&&u.href.length<=2048&&(h==='fcm.googleapis.com'||h==='web.push.apple.com'||h==='webpush.push.apple.com'||h==='updates.push.services.mozilla.com'||h.endsWith('.push.services.mozilla.com')||h.endsWith('.notify.windows.com'))?u.href:null}catch{return null}
}
function pushKey(value:any,bytes:number){
 const s=String(value||'').replace(/=+$/,'')
 if(!/^[A-Za-z0-9_-]+$/.test(s))return null
 try{const decoded=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));return decoded.length===bytes&&(bytes!==65||decoded.charCodeAt(0)===4)?s:null}catch{return null}
}
async function phonePush(message:any){
 const {data:subscriptions,error}=await db.from('nwtb_driver_push_subscriptions').select('id,endpoint,p256dh,auth,page_path,chat_sessions!inner(employee_number,expires_at)').eq('driver_employee_number',message.conversation_driver_employee_number).gt('chat_sessions.expires_at',now()).limit(20)
 if(error)return {enabled:false,sent:0,failed:0,needs_setup:false,error:'Phone notification service unavailable.'}
 const rows=(subscriptions||[]).filter((r:any)=>r.chat_sessions?.employee_number===message.conversation_driver_employee_number&&new Date(r.chat_sessions.expires_at).getTime()>Date.now())
 if(!rows.length)return {enabled:false,sent:0,failed:0,needs_setup:true}
 let keys:any;try{keys=await vapidKeys()}catch{return {enabled:true,sent:0,failed:rows.length,needs_setup:false,error:'Phone notification service unavailable.'}}
 let sent=0,failed=0
 await Promise.all(rows.map(async(r:any)=>{
  try{
   if(!trustedPushEndpoint(r.endpoint))throw Error('Invalid saved push endpoint.')
   const payload=JSON.stringify({type:message.push_test?'NWTB_DRIVER_PUSH_TEST':'NWTB_DRIVER_CHAT',message_id:message.id,driver_employee_number:message.conversation_driver_employee_number,title:'NWTB — DISPATCH MESSAGE',body:String(message.body||'').slice(0,300),url:r.page_path,created_at:message.created_at})
   const packet=webpush.generateRequestDetails({endpoint:r.endpoint,keys:{p256dh:r.p256dh,auth:r.auth}},payload,{TTL:86400,urgency:'high',contentEncoding:'aes128gcm',vapidDetails:{subject:'https://billyjwiorek-tech.github.io/nwtb-route-creator/',publicKey:keys.public_key,privateKey:keys.private_key}})
   const response=await fetch(packet.endpoint,{method:packet.method,headers:packet.headers,body:new Uint8Array(packet.body),signal:AbortSignal.timeout(8000)})
   if(response.status===404||response.status===410){await db.from('nwtb_driver_push_subscriptions').delete().eq('id',r.id);failed++;return}
   if(!response.ok)throw Error('Push service rejected notification.')
   sent++;await db.from('nwtb_driver_push_subscriptions').update({last_success_at:now(),last_error:null}).eq('id',r.id)
  }catch{failed++;await db.from('nwtb_driver_push_subscriptions').update({last_error:'DELIVERY_FAILED'}).eq('id',r.id)}
 }))
 return {enabled:true,sent,failed,needs_setup:sent===0&&failed===rows.length}
}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)})
 if(req.method!=='POST')return reply(req,{error:'POST required'},405)
 let input:any;try{input=await req.json()}catch{return reply(req,{error:'Invalid JSON'},400)}
 const session=await getSession(req)
 if(!session)return reply(req,{error:'Delivery chat session expired. Refresh the Delivery system.'},401)
 const action=String(input?.action||''),isDesk=session.employee_number==='9998'
 if(mutatingActions.has(action)&&await systemKilled())return reply(req,{error:'NWTB Delivery System is currently locked by administrator.',code:'NWTB_SYSTEM_KILLED'},423)

 if(action==='phone_push_config'){
  try{const keys=await vapidKeys();return reply(req,{ok:true,public_key:keys.public_key})}catch{return reply(req,{error:'Phone notifications are not available yet.'},503)}
 }
 if(action==='phone_push_subscribe'||action==='phone_push_unsubscribe'){
  if(isDesk||!(await driverIdentity(session.employee_number)))return reply(req,{error:'An active Driver session is required.'},403)
  const subscription=input?.subscription||{},endpoint=trustedPushEndpoint(subscription.endpoint||input?.endpoint)
  if(!endpoint)return reply(req,{error:'A supported browser push subscription is required.'},400)
  if(action==='phone_push_unsubscribe'){
   const {error}=await db.from('nwtb_driver_push_subscriptions').delete().eq('endpoint',endpoint).eq('driver_employee_number',session.employee_number).eq('session_token',session.token)
   return error?reply(req,{error:'Could not remove phone subscription.'},500):reply(req,{ok:true})
  }
  const p256dh=pushKey(subscription.keys?.p256dh,65),auth=pushKey(subscription.keys?.auth,16),path=String(input?.page_path||'')
  if(!p256dh||!auth||!['/nwtb-route-creator/driver-live.html','/nwtb-route-creator/driver-standard.html'].includes(path))return reply(req,{error:'Invalid phone subscription.'},400)
  const {error}=await db.from('nwtb_driver_push_subscriptions').upsert({driver_employee_number:session.employee_number,session_token:session.token,endpoint,p256dh,auth,page_path:path,updated_at:now(),last_error:null},{onConflict:'endpoint'})
  if(error)return reply(req,{error:'Could not enable phone notifications.'},500)
  return reply(req,{ok:true,enabled:true})
 }

 if(action==='phone_push_test'){
  if(isDesk||!(await driverIdentity(session.employee_number)))return reply(req,{error:'Driver phone test only.'},403)
  const job=(async()=>{await new Promise(resolve=>setTimeout(resolve,5000));return phonePush({id:0,push_test:true,conversation_driver_employee_number:session.employee_number,body:'NWTB PHONE ALERT TEST — If your phone is locked, check that this alert appears and your phone allows notification sound.',created_at:now()})})()
  const runtime=(globalThis as any).EdgeRuntime
  if(runtime?.waitUntil)runtime.waitUntil(job);else await job
  return reply(req,{ok:true,queued:true})
 }

 if(action==='driver_send'){
  const driverNo=isDesk?String(input?.driver_employee_number||'').trim():session.employee_number,driver=await driverIdentity(driverNo),body=cleanBody(input?.body)
  if(!driver)return reply(req,{error:'Select a valid driver first.'},400)
  if(!body)return reply(req,{error:'Message is empty.'},400)
  const routeId=String(input?.route_id||'').trim()||null
  const row={employee_number:driver.employee_number,display_name:driver.display_name,body,sender_role:'DRIVER',conversation_driver_employee_number:driver.employee_number,conversation_driver_name:driver.display_name,route_id:routeId,read_by_driver_at:now()}
  const {data,error}=await db.from('delivery_chat_messages').insert(row).select(fields).single()
  if(error)return reply(req,{error:'Could not send driver message.'},500)
  return reply(req,{ok:true,message:data})
 }
 if(action==='dispatch_send'){if(!isDesk)return reply(req,{error:'Dispatch chat access only.'},403);
  const driverNo=String(input?.driver_employee_number||'').trim(),driver=await driverIdentity(driverNo),body=cleanBody(input?.body)
  if(!driver)return reply(req,{error:'Choose a driver conversation first.'},400)
  if(!body)return reply(req,{error:'Message is empty.'},400)
  const routeId=String(input?.route_id||'').trim()||null
  const row={employee_number:session.employee_number,display_name:session.display_name,body,sender_role:'DISPATCH',conversation_driver_employee_number:driver.employee_number,conversation_driver_name:driver.display_name,route_id:routeId,read_by_dispatch_at:now()}
  const {data,error}=await db.from('delivery_chat_messages').insert(row).select(fields).single()
  if(error)return reply(req,{error:'Could not send Dispatch message.'},500)
  let push:any;try{push=await phonePush(data)}catch{push={enabled:false,sent:0,failed:0,needs_setup:false,error:'Phone notification service unavailable.'}}
  return reply(req,{ok:true,message:data,push})
 }
 if(action==='driver_list'){
  const driverNo=isDesk?String(input?.driver_employee_number||'').trim():session.employee_number,driver=await driverIdentity(driverNo)
  if(!driver)return reply(req,{error:'Select a valid driver first.'},400)
  const {data,error}=await db.from('delivery_chat_messages').select(fields).eq('conversation_driver_employee_number',driverNo).order('created_at',{ascending:false}).limit(100)
  if(error)return reply(req,{error:'Could not load Dispatch chat.'},500)
  return reply(req,{ok:true,messages:(data||[]).reverse(),driver})
 }
 if(action==='dispatch_list'){if(!isDesk)return reply(req,{error:'Dispatch chat access only.'},403);
  const driverNo=String(input?.driver_employee_number||'').trim(),driver=await driverIdentity(driverNo)
  if(!driver)return reply(req,{error:'Choose a valid driver conversation.'},400)
  const {data,error}=await db.from('delivery_chat_messages').select(fields).eq('conversation_driver_employee_number',driverNo).order('created_at',{ascending:false}).limit(100)
  if(error)return reply(req,{error:'Could not load driver conversation.'},500)
  return reply(req,{ok:true,messages:(data||[]).reverse(),driver})
 }
 if(action==='dispatch_threads'){if(!isDesk)return reply(req,{error:'Dispatch chat access only.'},403);
  const {data:drivers,error:de}=await db.from('employees').select('employee_number,display_name').eq('active',true).neq('employee_number','9998').order('display_name')
  if(de)return reply(req,{error:'Could not load drivers.'},500)
  const {data:msgs,error:me}=await db.from('delivery_chat_messages').select(fields).not('conversation_driver_employee_number','is',null).order('created_at',{ascending:false}).limit(500)
  if(me)return reply(req,{error:'Could not load chat threads.'},500)
  const {data:roles,error:re}=await db.from('nwtb_delivery_roles').select('employee_number').eq('role','DRIVER').eq('active',true);if(re)return reply(req,{error:'Could not verify Driver roster.'},500);const driverIds=new Set((roles||[]).map((r:any)=>r.employee_number));
  const by:any={};for(const m of msgs||[]){const k=m.conversation_driver_employee_number;if(!by[k])by[k]={latest:m,unread:0};if(m.sender_role==='DRIVER'&&!m.read_by_dispatch_at)by[k].unread++}
  return reply(req,{ok:true,threads:(drivers||[]).map((d:any)=>({driver_employee_number:d.employee_number,driver_name:d.display_name,latest:by[d.employee_number]?.latest||null,unread:by[d.employee_number]?.unread||0})).filter((x:any)=>driverIds.has(x.driver_employee_number)||x.latest||x.unread)})
 }
 if(action==='dispatch_unread'){if(!isDesk)return reply(req,{error:'Dispatch chat access only.'},403);
  const {data,error}=await db.from('delivery_chat_messages').select(fields).eq('sender_role','DRIVER').is('read_by_dispatch_at',null).order('created_at',{ascending:false}).limit(50)
  if(error)return reply(req,{error:'Could not check driver messages.'},500)
  return reply(req,{ok:true,unread_count:(data||[]).length,messages:(data||[]).reverse()})
 }
 if(action==='driver_unread'){
  const driverNo=isDesk?String(input?.driver_employee_number||'').trim():session.employee_number,driver=await driverIdentity(driverNo)
  if(!driver)return reply(req,{error:'Select a valid driver first.'},400)
  const {data,error}=await db.from('delivery_chat_messages').select(fields).eq('conversation_driver_employee_number',driverNo).eq('sender_role','DISPATCH').is('read_by_driver_at',null).order('created_at',{ascending:false}).limit(50)
  if(error)return reply(req,{error:'Could not check Dispatch messages.'},500)
  return reply(req,{ok:true,unread_count:(data||[]).length,messages:(data||[]).reverse()})
 }
 if(action==='mark_dispatch_read'){if(!isDesk)return reply(req,{error:'Dispatch chat access only.'},403);
  const driverNo=String(input?.driver_employee_number||'').trim();if(!driverNo)return reply(req,{error:'Driver required.'},400)
  const {error}=await db.from('delivery_chat_messages').update({read_by_dispatch_at:now()}).eq('conversation_driver_employee_number',driverNo).eq('sender_role','DRIVER').is('read_by_dispatch_at',null)
  if(error)return reply(req,{error:'Could not mark messages read.'},500);return reply(req,{ok:true})
 }
 if(action==='driver_acknowledge'){
  if(isDesk)return reply(req,{error:'Only the assigned driver can acknowledge Dispatch messages.'},403)
  const driver=await driverIdentity(session.employee_number)
  if(!driver)return reply(req,{error:'An active driver session is required.'},403)
  const raw=input?.message_ids
  if(!Array.isArray(raw)||raw.length<1||raw.length>100||raw.some((id:any)=>!Number.isSafeInteger(id)||id<1))return reply(req,{error:'Provide between 1 and 100 valid message IDs.'},400)
  const ids=[...new Set(raw)] as number[]
  const owned=()=>db.from('delivery_chat_messages').select('id,read_by_driver_at').eq('conversation_driver_employee_number',session.employee_number).eq('sender_role','DISPATCH').in('id',ids)
  const {data:messages,error:lookupError}=await owned()
  if(lookupError)return reply(req,{error:'Could not check message acknowledgments.'},500)
  if(!messages||messages.length!==ids.length)return reply(req,{error:'Message not available for this driver.'},404)
  const unread=messages.filter((m:any)=>!m.read_by_driver_at).map((m:any)=>m.id)
  if(unread.length){
   const {error}=await db.from('delivery_chat_messages').update({read_by_driver_at:now()}).eq('conversation_driver_employee_number',session.employee_number).eq('sender_role','DISPATCH').in('id',unread).is('read_by_driver_at',null)
   if(error)return reply(req,{error:'Could not send seen receipt. Please try again.'},500)
  }
  const {data:receipts,error:receiptError}=await owned()
  if(receiptError||!receipts||receipts.length!==ids.length||receipts.some((m:any)=>!m.read_by_driver_at))return reply(req,{error:'Could not confirm seen receipt. Please try again.'},500)
  return reply(req,{ok:true,receipts})
 }
 if(action==='mark_driver_read'){
  if(isDesk)return reply(req,{error:'Only the driver can mark Dispatch messages seen.'},403)
  const driverNo=isDesk?String(input?.driver_employee_number||'').trim():session.employee_number,driver=await driverIdentity(driverNo);if(!driver)return reply(req,{error:'Driver required.'},400)
  const {error}=await db.from('delivery_chat_messages').update({read_by_driver_at:now()}).eq('conversation_driver_employee_number',driverNo).eq('sender_role','DISPATCH').is('read_by_driver_at',null)
  if(error)return reply(req,{error:'Could not mark messages read.'},500);return reply(req,{ok:true})
 }
 if(action==='list'){if(!isDesk)return reply(req,{error:'Dispatch chat access only.'},403);
  const {data,error}=await db.from('delivery_chat_messages').select(fields).order('created_at',{ascending:false}).limit(100)
  if(error)return reply(req,{error:'Could not load Delivery / Pickup chat.'},500)
  return reply(req,{ok:true,messages:(data||[]).reverse()})
 }
 if(action==='send_text'){if(!isDesk)return reply(req,{error:'Dispatch chat access only.'},403);
  const body=cleanBody(input?.body);if(!body)return reply(req,{error:'Message is empty.'},400)
  const {data,error}=await db.from('delivery_chat_messages').insert({employee_number:session.employee_number,display_name:session.display_name,body,sender_role:'DISPATCH',read_by_dispatch_at:now()}).select(fields).single()
  if(error)return reply(req,{error:'Could not send Delivery / Pickup message.'},500)
  return reply(req,{ok:true,message:data})
 }
 return reply(req,{error:'Unknown action.'},400)
})