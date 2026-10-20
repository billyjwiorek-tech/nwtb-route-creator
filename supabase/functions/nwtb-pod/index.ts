import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const allowedOrigins=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000'])
function cors(req:Request){const origin=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://billyjwiorek-tech.github.io','Access-Control-Allow-Headers':'content-type, x-nwtb-session, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'}}
function reply(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
const url=Deno.env.get('SUPABASE_URL')!
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
const secret=secretKeys['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db=createClient(url,secret,{auth:{persistSession:false}})
const now=()=>new Date().toISOString(),txt=(v:any,n=1000)=>String(v??'').trim().slice(0,n)

async function getSession(req:Request){const token=req.headers.get('x-nwtb-session');if(!token)return null;const {data}=await db.from('chat_sessions').select('employee_number,expires_at,employees(display_name,active)').eq('token',token).gt('expires_at',now()).maybeSingle();if(!data||!(data as any).employees?.active)return null;return {employee_number:data.employee_number,display_name:(data as any).employees.display_name as string}}
async function hasPermission(employee:string,permission:string){const {data,error}=await db.rpc('nwtb_delivery_has_permission',{p_employee_number:employee,p_permission:permission});return !error&&data===true}
async function systemKilled(){try{const {data,error}=await db.from('nwtb_system_control').select('state').eq('id',1).maybeSingle();return !error&&data?.state==='KILLED'}catch{return false}}
async function driverInfo(employee:string){const [{data:emp},{data:role}]=await Promise.all([db.from('employees').select('employee_number,display_name,active').eq('employee_number',employee).maybeSingle(),db.from('nwtb_delivery_roles').select('role,active').eq('employee_number',employee).maybeSingle()]);return emp?.active&&role?.active&&role?.role==='DRIVER'?emp:null}
async function sha256(bytes:Uint8Array){const h=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,'0')).join('')}
function decodeImage(data:any,maxBytes:number){if(!data)return null;const s=String(data);const m=s.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i);if(!m)throw Error('Invalid POD image data.');const raw=atob(m[2].replace(/\s+/g,'')),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(bytes.byteLength<20||bytes.byteLength>maxBytes)throw Error('POD image is too large.');return {mime:m[1].toLowerCase(),bytes}}
function ext(mime:string){return mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg'}
async function signed(path:string|null){if(!path)return null;const {data,error}=await db.storage.from('nwtb-pod').createSignedUrl(path,900);return error?null:data?.signedUrl||null}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)})
 if(req.method!=='POST')return reply(req,{error:'POST required'},405)
 let input:any;try{input=await req.json()}catch{return reply(req,{error:'Invalid JSON'},400)}
 const session=await getSession(req);if(!session)return reply(req,{error:'Delivery session expired.'},401)
 const action=txt(input?.action,40).toLowerCase()

 if(action==='submit'){
  if(await systemKilled())return reply(req,{error:'NWTB Delivery System is currently locked by administrator.',code:'NWTB_SYSTEM_KILLED'},423)
  const driver=txt(input?.driver_employee_number,20),stopId=txt(input?.stop_id,60),recipient=txt(input?.recipient_name,180),notes=txt(input?.notes,1500)||null
  if(!/^\d{4}$/.test(driver)||driver==='9998'||!stopId||recipient.length<2)return reply(req,{error:'Driver, stop and recipient name are required.'},400)
  if(session.employee_number!==driver)return reply(req,{error:'Sign in as the assigned driver to complete this stop.'},403)
  const emp=await driverInfo(driver);if(!emp)return reply(req,{error:'Selected employee is not an active NWTB Delivery driver.'},403)
  const {data:stop,error:se}=await db.from('delivery_route_stops').select('id,route_id,order_id,status,delivery_routes(driver_employee_number,status,released_to_driver,paused_at,resumed_at),delivery_orders(customer_name,address)').eq('id',stopId).maybeSingle();if(se||!stop)return reply(req,{error:'Delivery stop not found.'},404)
  if((stop as any).delivery_routes?.driver_employee_number!==driver)return reply(req,{error:'This stop is assigned to another driver.'},403)
  const route=(stop as any).delivery_routes;if(route?.status!=='ACTIVE'||route?.released_to_driver!==true)return reply(req,{error:'Start a released route before completing a stop.'},409)
  if(route?.paused_at&&(!route?.resumed_at||new Date(route.paused_at)>new Date(route.resumed_at)))return reply(req,{error:'Resume the route before completing a stop.'},409)
  if(stop.status!=='PENDING')return reply(req,{error:'This stop is no longer pending.'},409)
  const {data:existing}=await db.from('delivery_pods').select('id,pod_number').eq('stop_id',stopId).maybeSingle();if(existing)return reply(req,{error:`POD #${existing.pod_number} already exists for this stop.`},409)
  let sig:any=null,photo:any=null;try{sig=decodeImage(input?.signature_data,1500000);photo=decodeImage(input?.photo_data,5800000)}catch(e){return reply(req,{error:e.message||'Invalid POD image.'},400)}
  if(!sig&&!photo)return reply(req,{error:'A signature or delivery photo is required.'},400)
  const podId=crypto.randomUUID(),d=new Date(),prefix=`${d.getUTCFullYear()}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCDate()).padStart(2,'0')}/${podId}`
  let sigPath:string|null=null,photoPath:string|null=null,sigHash:string|null=null,photoHash:string|null=null,uploaded:string[]=[]
  try{
   if(sig){sigPath=`${prefix}/signature.${ext(sig.mime)}`;sigHash=await sha256(sig.bytes);const {error}=await db.storage.from('nwtb-pod').upload(sigPath,sig.bytes,{contentType:sig.mime,upsert:false,cacheControl:'3600'});if(error)throw Error('Could not store signature.');uploaded.push(sigPath)}
   if(photo){photoPath=`${prefix}/photo.${ext(photo.mime)}`;photoHash=await sha256(photo.bytes);const {error}=await db.storage.from('nwtb-pod').upload(photoPath,photo.bytes,{contentType:photo.mime,upsert:false,cacheControl:'3600'});if(error)throw Error('Could not store delivery photo.');uploaded.push(photoPath)}
   const lat=Number(input?.lat),lon=Number(input?.lon),accuracy=Number(input?.accuracy_m),capturedRaw=input?.captured_at?new Date(input.captured_at):new Date(),captured=isNaN(capturedRaw.getTime())?now():capturedRaw.toISOString()
   const {data:result,error}=await db.rpc('nwtb_finalize_pod',{p_pod_id:podId,p_stop_id:stopId,p_driver_employee_number:driver,p_driver_display_name:emp.display_name,p_recipient_name:recipient,p_notes:notes,p_lat:Number.isFinite(lat)?lat:null,p_lon:Number.isFinite(lon)?lon:null,p_accuracy_m:Number.isFinite(accuracy)?Math.max(0,accuracy):null,p_captured_at:captured,p_signature_path:sigPath,p_signature_sha256:sigHash,p_photo_path:photoPath,p_photo_sha256:photoHash})
   if(error)throw Error(error.message?.includes('NWTB_SYSTEM_KILLED')?'NWTB Delivery System is currently locked by administrator.':(error.message||'Could not finalize POD.'))
   return reply(req,{ok:true,pod:result,customer_name:(stop as any).delivery_orders?.customer_name||null,recipient_name:recipient})
  }catch(e){if(uploaded.length)try{await db.storage.from('nwtb-pod').remove(uploaded)}catch{};return reply(req,{error:e.message||'Could not save proof of delivery.'},500)}
 }

 const canView=session.employee_number==='9998'||await hasPermission(session.employee_number,'VIEW_SYSTEM')||await hasPermission(session.employee_number,'VIEW_AUDIT')
 if(!canView)return reply(req,{error:'POD viewing permission required.'},403)

 if(action==='recent'){
  const limit=Math.max(10,Math.min(200,Number(input?.limit)||100)),search=txt(input?.search,120).toLowerCase();const {data,error}=await db.from('delivery_pods').select('id,pod_number,route_id,stop_id,order_id,driver_employee_number,driver_display_name,recipient_name,delivery_result,notes,lat,lon,accuracy_m,captured_at,signature_path,photo_path,created_at').order('created_at',{ascending:false}).limit(limit*2);if(error)return reply(req,{error:'Could not load POD history.'},500)
  const orderIds=[...new Set((data||[]).map((p:any)=>p.order_id).filter(Boolean))],{data:orders}=orderIds.length?await db.from('delivery_orders').select('id,customer_name,address,sales_order_no,reference_no').in('id',orderIds):{data:[] as any[]};const om=new Map((orders||[]).map((o:any)=>[o.id,o]));let rows=(data||[]).map((p:any)=>({...p,order:om.get(p.order_id)||null}));if(search)rows=rows.filter((p:any)=>[p.pod_number,p.driver_display_name,p.driver_employee_number,p.recipient_name,p.notes,p.order?.customer_name,p.order?.address,p.order?.sales_order_no,p.order?.reference_no].join(' ').toLowerCase().includes(search));return reply(req,{ok:true,pods:rows.slice(0,limit)})
 }
 if(action==='get'){
  const id=txt(input?.pod_id,60),num=Number(input?.pod_number);let q=db.from('delivery_pods').select('*');if(id)q=q.eq('id',id);else if(Number.isFinite(num))q=q.eq('pod_number',num);else return reply(req,{error:'POD id or number required.'},400);const {data:p,error}=await q.maybeSingle();if(error||!p)return reply(req,{error:'POD not found.'},404);const {data:o}=p.order_id?await db.from('delivery_orders').select('customer_name,address,sales_order_no,reference_no,customer_number').eq('id',p.order_id).maybeSingle():{data:null};return reply(req,{ok:true,pod:{...p,order:o||null,signature_url:await signed(p.signature_path),photo_url:await signed(p.photo_path)}})
 }
 return reply(req,{error:'Unknown POD action.'},400)
})