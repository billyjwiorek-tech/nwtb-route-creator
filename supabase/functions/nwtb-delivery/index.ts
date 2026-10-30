import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const allowedOrigins=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000'])
function cors(req:Request){const origin=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://billyjwiorek-tech.github.io','Access-Control-Allow-Headers':'content-type, x-nwtb-session, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'}}
function reply(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
const url=Deno.env.get('SUPABASE_URL')!
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
const secret=secretKeys['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db=createClient(url,secret,{auth:{persistSession:false}})
const now=()=>new Date().toISOString()
const txt=(v:any,n=240)=>String(v??'').trim().slice(0,n)
async function systemKilled(){try{const {data,error}=await db.from('nwtb_system_control').select('state').eq('id',1).maybeSingle();return !error&&data?.state==='KILLED'}catch{return false}}
const mutatingActions=new Set(['master_import_batch','master_import_finish','saved_location_create','order_create','order_update_location','route_create','route_start','stop_status'])

async function getSession(req:Request){
 const token=req.headers.get('x-nwtb-session');if(!token)return null
 const {data}=await db.from('chat_sessions').select('token,employee_number,expires_at,employees(display_name,active)').eq('token',token).gt('expires_at',now()).maybeSingle()
 if(!data||!(data as any).employees?.active)return null
 await db.from('chat_sessions').update({last_seen_at:now()}).eq('token',token)
 return {token:data.token,employee_number:data.employee_number,display_name:(data as any).employees.display_name as string}
}
async function canManageRoutes(emp:string,input:any){
 if(emp==='9998')return true;
 const {data,error}=await db.rpc('nwtb_delivery_has_permission',{p_employee_number:emp,p_permission:'MANAGE_ROUTES'});
 if(!error&&data===true)return true;
 const pin=txt(input?.pin,20);if(!pin)return false;
 const {data:setting,error:se}=await db.from('nwtb_admin_security').select('value_hash').eq('key','management_pin_sha256').maybeSingle();
 if(se||!setting?.value_hash)return false;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pin));
 const hash=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
 return hash===setting.value_hash;
}
async function currentBatch(kind:'CUSTOMER'|'VENDOR'){
 const {data}=await db.from('delivery_master_versions').select('current_batch').eq('kind',kind).maybeSingle()
 return data?.current_batch||null
}
function resolvedGeocode(hit:any,address:string,source:string){
 if(hit?.lat===null||hit?.lat===undefined||hit?.lat===''||hit?.lon===null||hit?.lon===undefined||hit?.lon==='')return null
 const lat=Number(hit.lat),lon=Number(hit.lon)
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<20||lat>60||lon<-135||lon>-55)return null
 return {lat,lon,display_name:txt(hit.matched_address||hit.display_name||address,320),source:txt(hit.source,80)||source}
}
async function geocode(address:string,sessionToken:string){
 const q=address.trim();if(!q||!sessionToken)return null
 // Share the authenticated multi-source resolver with the Custom Route Builder.
 // ADD STOP, frequent locations and legacy creation paths all enter here.
 try{
  const r=await fetch(url+'/functions/v1/nwtb-custom-geocoder-v2',{method:'POST',headers:{'content-type':'application/json','x-nwtb-session':sessionToken},body:JSON.stringify({address:q}),signal:AbortSignal.timeout(12000)})
  if(r.ok){const hit=await r.json();const match=hit?.ok===true?resolvedGeocode(hit,q,'NWTB_CUSTOM_GEOCODER_V2'):null;if(match)return match}
  else if(r.status===404)return null
 }catch{}
 // Retain the old provider as a bounded fallback for resolver outages.
 // Public geocoders receive only the address, never the employee session.
 try{
  const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q='+encodeURIComponent(q),{headers:{'User-Agent':'NWTB-Delivery-Manager/1.0','Accept':'application/json'},signal:AbortSignal.timeout(5000)})
  if(!r.ok)return null;const a=await r.json();return resolvedGeocode(Array.isArray(a)?a[0]:null,q,'NOMINATIM')
 }catch{return null}
}
function searchTokens(raw:string){return [...new Set(raw.toUpperCase().match(/[A-Z0-9]+/g)||[])].filter(x=>x.length>=2).slice(0,6)}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)})
 if(req.method!=='POST')return reply(req,{error:'POST required'},405)
 let input:any;try{input=await req.json()}catch{return reply(req,{error:'Invalid JSON'},400)}
 const session=await getSession(req);if(!session)return reply(req,{error:'Employee session expired. Sign in again.'},401)
 const action=txt(input?.action,60)
 if(mutatingActions.has(action)&&await systemKilled())return reply(req,{error:'NWTB Delivery System is currently locked by administrator.',code:'NWTB_SYSTEM_KILLED'},423)

 if(action==='whoami')return reply(req,{ok:true,employee_number:session.employee_number,display_name:session.display_name})
 if(action==='drivers'){
  const {data,error}=await db.from('employees').select('employee_number,display_name').eq('active',true).order('display_name')
  if(error)return reply(req,{error:'Could not load drivers.'},500);return reply(req,{ok:true,drivers:data||[]})
 }
 if(action==='master_counts'){
  const {data,error}=await db.from('delivery_master_versions').select('kind,row_count,source_file,imported_at').order('kind')
  if(error)return reply(req,{error:'Could not load master counts.'},500);return reply(req,{ok:true,masters:data||[]})
 }
 if(action==='master_import_start'){
  const kind=txt(input?.kind,20) as 'CUSTOMER'|'VENDOR';if(!['CUSTOMER','VENDOR'].includes(kind))return reply(req,{error:'Invalid master type.'},400)
  return reply(req,{ok:true,kind,batch_id:crypto.randomUUID()})
 }
 if(action==='master_import_batch'){
  const kind=txt(input?.kind,20) as 'CUSTOMER'|'VENDOR',batch=txt(input?.batch_id,50),rows=Array.isArray(input?.rows)?input.rows:[]
  if(!['CUSTOMER','VENDOR'].includes(kind)||!batch||rows.length<1||rows.length>500)return reply(req,{error:'Invalid import batch.'},400)
  if(kind==='CUSTOMER'){
   const clean=rows.map((r:any)=>({import_batch:batch,customer_number:txt(r.customer_number,60),name:txt(r.name,180),addr1:txt(r.addr1,200)||null,addr2:txt(r.addr2,200)||null,city:txt(r.city,100)||null,state:txt(r.state,30)||null,phone_home:txt(r.phone_home,60)||null,phone_work:txt(r.phone_work,60)||null,terms:txt(r.terms,40)||null,source_file:txt(input?.source_file,200)||'Customer Master'})).filter((r:any)=>r.customer_number&&r.name)
   const {error}=await db.from('delivery_customer_master').insert(clean);if(error)return reply(req,{error:'Customer master batch failed.'},500);return reply(req,{ok:true,inserted:clean.length})
  }
  const clean=rows.map((r:any)=>({import_batch:batch,vendor_id:txt(r.vendor_id,60),name:txt(r.name,180),addr1:txt(r.addr1,200)||null,addr2:txt(r.addr2,200)||null,city:txt(r.city,100)||null,state:txt(r.state,30)||null,phone:txt(r.phone,60)||null,contact:txt(r.contact,120)||null,email:txt(r.email,180)||null,terms:txt(r.terms,40)||null,inactive:!!r.inactive,source_file:txt(input?.source_file,200)||'Vendor Master'})).filter((r:any)=>r.vendor_id&&r.name)
  const {error}=await db.from('delivery_vendor_master').insert(clean);if(error)return reply(req,{error:'Vendor master batch failed.'},500);return reply(req,{ok:true,inserted:clean.length})
 }
 if(action==='master_import_finish'){
  const kind=txt(input?.kind,20) as 'CUSTOMER'|'VENDOR',batch=txt(input?.batch_id,50),source_file=txt(input?.source_file,200)
  if(!['CUSTOMER','VENDOR'].includes(kind)||!batch)return reply(req,{error:'Invalid import finish request.'},400)
  const table=kind==='CUSTOMER'?'delivery_customer_master':'delivery_vendor_master';const {count,error}=await db.from(table).select('*',{count:'exact',head:true}).eq('import_batch',batch)
  if(error||!count)return reply(req,{error:'No imported rows found for this batch.'},400)
  const {error:ue}=await db.from('delivery_master_versions').upsert({kind,current_batch:batch,source_file:source_file||null,row_count:count,imported_at:now(),imported_by:session.employee_number},{onConflict:'kind'})
  if(ue)return reply(req,{error:'Could not activate imported master.'},500);return reply(req,{ok:true,row_count:count})
 }
 if(action==='directory_search'){
  const kind=txt(input?.kind,20) as 'CUSTOMER'|'VENDOR',raw=txt(input?.q,100)
  if(!['CUSTOMER','VENDOR'].includes(kind)||raw.length<2)return reply(req,{ok:true,results:[]})
  const batch=await currentBatch(kind);if(!batch)return reply(req,{ok:true,results:[],master_missing:true})
  const tokens=searchTokens(raw),compact=raw.replace(/\s+/g,''),numeric=/^\d+$/.test(compact)
  if(kind==='CUSTOMER'){
   let q=db.from('delivery_customer_master').select('customer_number,name,addr1,addr2,city,state,phone_home,phone_work,terms').eq('import_batch',batch)
   if(numeric)q=q.eq('customer_number',compact);else for(const t of tokens)q=q.or(`name.ilike.%${t}%,addr1.ilike.%${t}%,addr2.ilike.%${t}%,city.ilike.%${t}%,state.ilike.%${t}%,customer_number.eq.${/^\d+$/.test(t)?t:'-1'}`)
   const {data,error}=await q.order('name').limit(50);if(error)return reply(req,{error:'Customer search failed.'},500)
   return reply(req,{ok:true,results:(data||[]).map((r:any)=>({...r,source_type:'CUSTOMER',source_ref:r.customer_number,address:[r.addr1,r.addr2,r.city,r.state].filter(Boolean).join(', '),phone:r.phone_work||r.phone_home||''}))})
  }
  let q=db.from('delivery_vendor_master').select('vendor_id,name,addr1,addr2,city,state,phone,contact,email,terms,inactive').eq('import_batch',batch)
  if(numeric)q=q.eq('vendor_id',compact);else for(const t of tokens)q=q.or(`name.ilike.%${t}%,addr1.ilike.%${t}%,addr2.ilike.%${t}%,city.ilike.%${t}%,state.ilike.%${t}%,vendor_id.eq.${/^\d+$/.test(t)?t:'__NO_MATCH__'}`)
  const {data,error}=await q.order('name').limit(50);if(error)return reply(req,{error:'Vendor search failed.'},500)
  return reply(req,{ok:true,results:(data||[]).map((r:any)=>({...r,source_type:'VENDOR',source_ref:r.vendor_id,address:[r.addr1,r.addr2,r.city,r.state].filter(Boolean).join(', ')}))})
 }
 if(action==='frequent_locations'){
  const {data,error}=await db.from('delivery_saved_locations').select('*').eq('active',true).eq('frequent',true).order('name');if(error)return reply(req,{error:'Could not load frequent locations.'},500);return reply(req,{ok:true,locations:data||[]})
 }
 if(action==='saved_locations_search'){
  const raw=txt(input?.q,100),tokens=searchTokens(raw);let q=db.from('delivery_saved_locations').select('*').eq('active',true)
  for(const t of tokens)q=q.or(`name.ilike.%${t}%,address.ilike.%${t}%,source_ref.ilike.%${t}%,location_code.ilike.%${t}%`)
  const {data,error}=await q.order('frequent',{ascending:false}).order('name').limit(50);if(error)return reply(req,{error:'Saved location search failed.'},500);return reply(req,{ok:true,locations:data||[]})
 }
 if(action==='saved_location_create'){
  const source_type=txt(input?.source_type,20),name=txt(input?.name,180),address=txt(input?.address,240)
  if(!['CUSTOMER','VENDOR','OTHER'].includes(source_type)||!name||!address)return reply(req,{error:'Name, address and source type are required.'},400)
  let lat=Number(input?.lat),lon=Number(input?.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon)){const g=await geocode(address,session.token);lat=g?.lat??NaN;lon=g?.lon??NaN}
  const row={source_type,source_ref:txt(input?.source_ref,60)||null,location_code:txt(input?.location_code,80)||null,name,address,phone:txt(input?.phone,60)||null,lat:Number.isFinite(lat)?lat:null,lon:Number.isFinite(lon)?lon:null,instructions:txt(input?.instructions,1000)||null,hours:txt(input?.hours,200)||null,frequent:input?.frequent!==false,verified:!!input?.verified,created_by:session.employee_number,updated_at:now()}
  const {data,error}=await db.from('delivery_saved_locations').insert(row).select('*').single();if(error)return reply(req,{error:'Could not save location.'},500);return reply(req,{ok:true,location:data})
 }
 if(action==='geocode'){
  const address=txt(input?.address,240);if(!address)return reply(req,{error:'Address required.'},400);const g=await geocode(address,session.token);if(!g)return reply(req,{error:'Address could not be geocoded.'},404);return reply(req,{ok:true,...g})
 }
 if(action==='orders_list'){
  const statuses=Array.isArray(input?.statuses)?input.statuses.map((x:any)=>String(x)).slice(0,10):[];let q=db.from('delivery_orders').select('*').order('priority',{ascending:false}).order('promised_by',{ascending:true,nullsFirst:false}).order('created_at',{ascending:true}).limit(500);if(statuses.length)q=q.in('status',statuses)
  const {data,error}=await q;if(error)return reply(req,{error:'Could not load delivery stops.'},500);return reply(req,{ok:true,orders:data||[]})
 }
 if(action==='order_create'){
  const customer_name=txt(input?.customer_name,180),address=txt(input?.address,240),stop_type=txt(input?.stop_type||'CUSTOMER_DELIVERY',40),source_type=txt(input?.source_type||'CUSTOMER',20)
  if(!customer_name||!address)return reply(req,{error:'Stop name and address are required.'},400);if(!['CUSTOMER_DELIVERY','CUSTOMER_PICKUP','VENDOR_PICKUP','CORE_RETURN_PICKUP','OTHER'].includes(stop_type))return reply(req,{error:'Invalid stop type.'},400);if(!['CUSTOMER','VENDOR','OTHER'].includes(source_type))return reply(req,{error:'Invalid source type.'},400)
  const priority=txt(input?.priority||'NORMAL',20);if(!['NORMAL','PRIORITY','HOT_SHOT'].includes(priority))return reply(req,{error:'Invalid priority.'},400)
  let lat=Number(input?.lat),lon=Number(input?.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon)){const g=await geocode(address,session.token);lat=g?.lat??NaN;lon=g?.lon??NaN}
  const pieces=Math.max(0,Math.min(9999,Number(input?.pieces)||0)),row={sales_order_no:txt(input?.sales_order_no,60)||null,reference_no:txt(input?.reference_no,80)||null,customer_number:txt(input?.customer_number,60)||null,customer_name,address,lat:Number.isFinite(lat)?lat:null,lon:Number.isFinite(lon)?lon:null,phone:txt(input?.phone,60)||null,pieces,priority,promised_by:input?.promised_by||null,notes:txt(input?.notes,1500)||null,created_by:session.employee_number,stop_type,source_type,source_ref:txt(input?.source_ref,60)||null,saved_location_id:txt(input?.saved_location_id,60)||null}
  const {data,error}=await db.from('delivery_orders').insert(row).select('*').single();if(error)return reply(req,{error:'Could not create stop.'},500);await db.from('delivery_events').insert({order_id:data.id,employee_number:session.employee_number,event_type:'STOP_CREATED',note:stop_type});return reply(req,{ok:true,order:data})
 }
 if(action==='order_update_location'){
  const id=txt(input?.id,60),lat=Number(input?.lat),lon=Number(input?.lon);if(!id||!Number.isFinite(lat)||!Number.isFinite(lon))return reply(req,{error:'Valid stop and coordinates are required.'},400);const {data,error}=await db.from('delivery_orders').update({lat,lon,updated_at:now()}).eq('id',id).select('*').single();if(error)return reply(req,{error:'Could not save coordinates.'},500);return reply(req,{ok:true,order:data})
 }
 if(action==='route_create'){
  if(!(await canManageRoutes(session.employee_number,input)))return reply(req,{error:'Admin PIN required for route-management tools.',code:'ADMIN_PIN_REQUIRED'},403)
  const driver=txt(input?.driver_employee_number,20),depot=txt(input?.depot||'BOLINGBROOK',30),wave=txt(input?.wave||'MORNING',30),orders=Array.isArray(input?.orders)?input.orders:[]
  if(!/^\d{4}$/.test(driver)||!['BOLINGBROOK','PALATINE'].includes(depot)||!['MORNING','AFTERNOON','HOT_SHOT','CUSTOM'].includes(wave)||orders.length<1||orders.length>100)return reply(req,{error:'Invalid route request.'},400)
  const {data:emp}=await db.from('employees').select('employee_number,active').eq('employee_number',driver).maybeSingle();if(!emp||!emp.active)return reply(req,{error:'Driver not found.'},400)
  const ids=orders.map((o:any)=>txt(o.id,60)).filter(Boolean),{data:rows,error:oe}=await db.from('delivery_orders').select('id,status').in('id',ids);if(oe||!rows||rows.length!==ids.length)return reply(req,{error:'One or more stops could not be loaded.'},400);if(rows.some((o:any)=>!['UNASSIGNED','ROUTED'].includes(o.status)))return reply(req,{error:'One or more stops are no longer available.'},409)
  const {data:route,error}=await db.from('delivery_routes').insert({route_date:input?.route_date||now().slice(0,10),depot,driver_employee_number:driver,wave,status:'PLANNED',estimated_miles:Number.isFinite(Number(input?.estimated_miles))?Number(input.estimated_miles):null,estimated_minutes:Number.isFinite(Number(input?.estimated_minutes))?Math.round(Number(input.estimated_minutes)):null,created_by:session.employee_number,route_note:txt(input?.route_note,1000)||null}).select('*').single();if(error)return reply(req,{error:'Could not create route.'},500)
  const stops=orders.map((o:any,i:number)=>({route_id:route.id,order_id:txt(o.id,60),stop_sequence:i+1})),{error:se}=await db.from('delivery_route_stops').insert(stops);if(se){await db.from('delivery_routes').delete().eq('id',route.id);return reply(req,{error:'Could not create route stops.'},500)}
  await db.from('delivery_orders').update({status:'ROUTED',last_status_at:now(),updated_at:now()}).in('id',ids);await db.from('delivery_events').insert({route_id:route.id,employee_number:session.employee_number,event_type:'ROUTE_CREATED',note:`${orders.length} stops`});return reply(req,{ok:true,route})
 }
 if(action==='routes_list'){
  const officeAccess=await canManageRoutes(session.employee_number,input);
  let q=db.from('delivery_routes').select('*').order('route_date',{ascending:false}).order('created_at',{ascending:false}).limit(100);if(!officeAccess)q=q.eq('driver_employee_number',session.employee_number).or('status.eq.ACTIVE,and(status.eq.PLANNED,released_to_driver.eq.true)');else if(input?.mine_only===true)q=q.eq('driver_employee_number',session.employee_number);if(input?.route_date)q=q.eq('route_date',txt(input.route_date,30));const {data,error}=await q;if(error)return reply(req,{error:'Could not load routes.'},500);return reply(req,{ok:true,routes:data||[]})
 }
 if(action==='route_get'){
  const id=txt(input?.route_id,60),{data:route,error}=await db.from('delivery_routes').select('*').eq('id',id).maybeSingle();if(error||!route)return reply(req,{error:'Route not found.'},404);if(session.employee_number!=='9998'){if(route.driver_employee_number!==session.employee_number)return reply(req,{error:'This route is assigned to another driver.'},403);if(route.status==='PLANNED'&&!route.released_to_driver)return reply(req,{error:'This route has not been released by Dispatch yet.'},403)}const {data:stops,error:se}=await db.from('delivery_route_stops').select('id,route_id,order_id,stop_sequence,status,arrived_at,completed_at,driver_note,delivery_orders(*)').eq('route_id',id).order('stop_sequence');if(se)return reply(req,{error:'Could not load route stops.'},500);return reply(req,{ok:true,route,stops:stops||[]})
 }
 if(action==='route_start'){
  const id=txt(input?.route_id,60),{data:route}=await db.from('delivery_routes').select('id,driver_employee_number,status,released_to_driver').eq('id',id).maybeSingle();if(!route)return reply(req,{error:'Route not found.'},404);if(route.driver_employee_number!==session.employee_number)return reply(req,{error:'This route is assigned to another driver.'},403);if(route.status!=='PLANNED')return reply(req,{error:'Only a planned route can be started.'},409);if(!route.released_to_driver)return reply(req,{error:'Dispatch has not released this route yet.'},409);const {data:otherActive}=await db.from('delivery_routes').select('id').eq('driver_employee_number',session.employee_number).eq('status','ACTIVE').neq('id',id).limit(1);if((otherActive||[]).length)return reply(req,{error:'Complete the current ACTIVE route before starting another route.'},409);const t=now();const {data:started,error:startError}=await db.from('delivery_routes').update({status:'ACTIVE',updated_at:t}).eq('id',id).eq('status','PLANNED').eq('released_to_driver',true).select('id').maybeSingle();if(startError||!started)return reply(req,{error:'Route could not be started. Confirm it is released and no other route is ACTIVE.'},409);const {data:stops}=await db.from('delivery_route_stops').select('order_id').eq('route_id',id);const ids=(stops||[]).map((s:any)=>s.order_id);if(ids.length)await db.from('delivery_orders').update({status:'OUT_FOR_DELIVERY',last_status_at:t,updated_at:t}).in('id',ids);await db.from('delivery_events').insert({route_id:id,employee_number:session.employee_number,event_type:'ROUTE_STARTED'});return reply(req,{ok:true})
 }
 if(action==='stop_status'){
  const stopId=txt(input?.stop_id,60),status=txt(input?.status,30);if(!['DELIVERED','NOT_DELIVERED','SKIPPED'].includes(status))return reply(req,{error:'Invalid stop status.'},400);const {data:stop}=await db.from('delivery_route_stops').select('id,route_id,order_id,delivery_routes(driver_employee_number,status,paused_at,resumed_at)').eq('id',stopId).maybeSingle();if(!stop)return reply(req,{error:'Stop not found.'},404);if((stop as any).delivery_routes?.driver_employee_number!==session.employee_number)return reply(req,{error:'This stop is assigned to another driver.'},403)
  if((stop as any).delivery_routes?.status!=='ACTIVE')return reply(req,{error:'Start the route before completing a stop.'},409);if((stop as any).delivery_routes?.paused_at&&(!(stop as any).delivery_routes?.resumed_at||new Date((stop as any).delivery_routes.paused_at)>new Date((stop as any).delivery_routes.resumed_at)))return reply(req,{error:'Resume the route before completing a stop.'},409);if(status==='DELIVERED')return reply(req,{error:'Save proof of delivery using SAVE POD + COMPLETE DELIVERY.',code:'POD_REQUIRED'},409);const t=now(),note=txt(input?.note,1000)||null,{error}=await db.from('delivery_route_stops').update({status,completed_at:t,driver_note:note,updated_at:t}).eq('id',stopId);if(error)return reply(req,{error:'Could not update stop.'},500);const orderStatus=status==='DELIVERED'?'DELIVERED':status==='NOT_DELIVERED'?'NOT_DELIVERED':'OUT_FOR_DELIVERY';await db.from('delivery_orders').update({status:orderStatus,last_status_at:t,updated_at:t}).eq('id',stop.order_id);await db.from('delivery_events').insert({route_id:stop.route_id,stop_id:stop.id,order_id:stop.order_id,employee_number:session.employee_number,event_type:`STOP_${status}`,note});const {data:finished,error:finishError}=await db.rpc('nwtb_finish_route_stops',{p_route_id:stop.route_id,p_driver_employee_number:session.employee_number});if(finishError)return reply(req,{error:'Stop saved, but route state could not be updated. Refresh the route before continuing.'},500);return reply(req,{ok:true,...finished})
 }
 return reply(req,{error:'Unknown action.'},400)
})
