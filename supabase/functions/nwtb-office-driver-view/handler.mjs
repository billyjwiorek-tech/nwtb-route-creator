const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORIGIN='https://billyjwiorek-tech.github.io';
const ROUTE_FIELDS='id,route_date,depot,driver_employee_number,wave,status,released_to_driver,released_at,released_by_employee_number,estimated_miles,estimated_minutes,drive_minutes,service_minutes,return_miles,return_minutes,traffic_aware,matrix_source,route_mode,start_name,start_address,start_lat,start_lon,end_mode,end_name,end_address,end_lat,end_lon,returning_started_at,returned_at,paused_at,resumed_at,pause_reason,created_at,updated_at';
const text=(s,n=240)=>String(s??'').trim().slice(0,n);
const point=p=>p&&p.lat!=null&&p.lon!=null&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180&&!(p.lat===0&&p.lon===0);
export function cleanSnapshot(input,clock=Date.now){
 const s=input?.snapshot;
 if(!s||s.version!==1||!UUID.test(input.page_id)||!Number.isSafeInteger(input.sequence)||input.sequence<1)throw Error('Invalid screen report.');
 const captured=Date.parse(input.captured_at);
 if(!Number.isFinite(captured)||Math.abs(clock()-captured)>120000)throw Error('Screen report is too old or the phone clock is incorrect.');
 const route=s.route_id||null;if(route&&!UUID.test(route))throw Error('Invalid route.');
 const id=value=>value&&UUID.test(value)?value:null;
 let geometry=null;const key=text(s.geometry_key,100)||null;
 if(input.geometry!=null){
  if(!key||!Array.isArray(input.geometry)||input.geometry.length<2||input.geometry.length>20000||input.geometry.some(c=>!Array.isArray(c)||c.length!==2||!point({lat:c[1],lon:c[0]})))throw Error('Invalid navigation path.');
  geometry=input.geometry.map(c=>[c[0],c[1]]);
 }
 const target=s.target?{stop_id:id(s.target.stop_id),name:text(s.target.name),address:text(s.target.address,500),final:s.target.final===true,...(point(s.target)?{lat:s.target.lat,lon:s.target.lon}:{})}:null;
 const snapshot={version:1,route_id:route,edition:s.edition==='STANDARD'?'STANDARD':'GPS',view:text(s.view,40),visible:s.visible===true,
  route_updated_at:Number.isFinite(Date.parse(s.route_updated_at))?s.route_updated_at:null,
  displayed_stops:(Array.isArray(s.displayed_stops)?s.displayed_stops:[]).slice(0,150).filter(x=>id(x.id)&&['PENDING','DELIVERED','NOT_DELIVERED','SKIPPED'].includes(x.status)).map(x=>({id:x.id,status:x.status})),
  voice:s.voice?{state:text(s.voice.state,30),error:text(s.voice.error,80),needs_tap:s.voice.needs_tap===true}:null,handoff_pending:s.handoff_pending===true,
  navigation_active:s.navigation_active===true,target,arrived_stop_id:id(s.arrived_stop_id),arrival_visible:s.arrival_visible===true,
  pod_stop_id:id(s.pod_stop_id),pod_phase:['OPEN','SAVING','OFFLINE_QUEUED','CLOSED'].includes(s.pod_phase)?s.pod_phase:'CLOSED',
  eta:text(s.eta,60),distance:text(s.distance,60),turn:text(s.turn,500),turn_distance:text(s.turn_distance,60),banner:text(s.banner,500),mode:text(s.mode,100),
  traffic_aware:s.traffic_aware===true,source:text(s.source,80),fix_at:Number.isFinite(Date.parse(s.fix_at))?s.fix_at:null,
  position:point(s.position)?{lat:s.position.lat,lon:s.position.lon}:null,geometry_key:key};
 return {snapshot,route_id:route,geometry,geometry_key:key,captured_at:new Date(captured).toISOString()};
}
export function screenFreshness(screen,route,stops,clock=Date.now){
 if(route?.status==='CANCELED')return {live:false,reason:'ROUTE_ENDED'};
 if(!screen)return {live:false,reason:'AWAITING_DRIVER_SYNC'};
 if(!screen.chat_sessions||Date.parse(screen.chat_sessions.expires_at)<=clock())return {live:false,reason:'DRIVER_SIGNED_OUT'};
 if(screen.route_id!==(route?.id||null))return {live:false,reason:'DRIVER_VIEWING_ANOTHER_SCREEN'};
 if(clock()-Date.parse(screen.received_at)>25000||Math.abs(clock()-Date.parse(screen.captured_at))>25000)return {live:false,reason:'SCREEN_UPDATE_STALE'};
 const s=screen.snapshot;
 if(!s.visible)return {live:false,reason:'PHONE_APP_IN_BACKGROUND'};
 if(s.target?.stop_id&&!stops.some(x=>x.id===s.target.stop_id&&x.status==='PENDING'))return {live:false,reason:'ROUTE_CHANGED'};
 if(s.navigation_active&&Date.parse(route?.updated_at)>Date.parse(screen.captured_at))return {live:false,reason:'ROUTE_CHANGED'};
 return {live:true,reason:'LIVE_DRIVER_SCREEN'};
}
export function createDriverViewHandler({db,clock=Date.now}){
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'content-type, apikey, x-nwtb-session','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'}});
 async function checked(query){const {data,error}=await query;if(error)throw Error('DATABASE_UNAVAILABLE');return data;}
 return async function handle(req){
  if(req.headers.get('origin')&&req.headers.get('origin')!==ORIGIN)return json({error:'NWTB origin required.'},403);
  if(req.method==='OPTIONS')return json({ok:true});
  if(req.method!=='POST')return json({error:'POST required.'},405);
  try{
   const token=req.headers.get('x-nwtb-session');if(!token||!UUID.test(token))return json({error:'Sign in required.'},401);
   const session=await checked(db.from('chat_sessions').select('token,employee_number,created_at,expires_at,employees(active,display_name)').eq('token',token).gt('expires_at',new Date(clock()).toISOString()).maybeSingle());
   if(!session?.employees?.active)return json({error:'Session expired.'},401);
   const raw=await req.text();if(raw.length>1400000)return json({error:'Request too large.'},413);
   let input;try{input=JSON.parse(raw)}catch{return json({error:'Invalid JSON.'},400)}
   if(!input||typeof input!=='object'||Array.isArray(input))return json({error:'Invalid request.'},400);
   const action=input.action,isDesk=session.employee_number==='9998';
   if(action==='driver_snapshot'){
    if(isDesk)return json({error:'Driver session required.'},403);
    const role=await checked(db.from('nwtb_delivery_roles').select('role,active').eq('employee_number',session.employee_number).maybeSingle());
    if(role?.role!=='DRIVER'||!role.active)return json({error:'Active Driver session required.'},403);
    let clean;try{clean=cleanSnapshot(input,clock)}catch(e){return json({error:e.message},400)}
    if(clean.route_id){
     const route=await checked(db.from('delivery_routes').select('id,driver_employee_number,status,released_to_driver').eq('id',clean.route_id).maybeSingle());
     if(!route||route.driver_employee_number!==session.employee_number||route.status==='PLANNED'&&!route.released_to_driver)return json({error:'This route is not visible to this driver.'},403);
     const ids=[clean.snapshot.target?.stop_id,clean.snapshot.arrived_stop_id,clean.snapshot.pod_stop_id].filter(Boolean);
     if(ids.length){const stops=await checked(db.from('delivery_route_stops').select('id').eq('route_id',clean.route_id).in('id',[...new Set(ids)])),known=new Set(stops.map(x=>x.id));if(ids.some(id=>!known.has(id)))return json({error:'Screen stop does not belong to the route.'},409);}
    }else if(clean.snapshot.navigation_active||clean.snapshot.target||clean.snapshot.pod_stop_id)return json({error:'A screen route is required.'},400);
    const {data,error}=await db.rpc('nwtb_store_driver_screen',{p_driver:session.employee_number,p_session:session.token,p_session_created_at:session.created_at,
     p_page:input.page_id,p_sequence:input.sequence,p_captured_at:clean.captured_at,p_route:clean.route_id,p_snapshot:clean.snapshot,p_geometry_key:clean.geometry_key,p_geometry:clean.geometry});
    return error?json({error:'Screen sync unavailable.'},503):json({ok:true,stored:data===true});
   }
   if(!isDesk)return json({error:'Office session required.'},403);
   if(action==='roster'){
    const roles=await checked(db.from('nwtb_delivery_roles').select('employee_number').eq('role','DRIVER').eq('active',true));
    const ids=roles.map(x=>x.employee_number);
    const drivers=ids.length?await checked(db.from('employees').select('employee_number,display_name').eq('active',true).in('employee_number',ids).order('display_name')):[];
    const [routes,recent]=await Promise.all([checked(db.from('delivery_routes').select(ROUTE_FIELDS).in('status',['ACTIVE','PLANNED']).order('route_date')),checked(db.from('delivery_routes').select(ROUTE_FIELDS).in('status',['COMPLETED','CANCELED']).order('updated_at',{ascending:false}).limit(100))]);
    return json({ok:true,drivers,routes:[...routes,...recent]});
   }
   if(action==='view'){
    let route=null;const routeId=input.route_id,driverNo=text(input.driver_employee_number,4);
    if(routeId){if(!UUID.test(routeId))return json({error:'Invalid route.'},400);route=await checked(db.from('delivery_routes').select(ROUTE_FIELDS).eq('id',routeId).maybeSingle());if(!route)return json({error:'Route not found.'},404);}
    const driver=route?.driver_employee_number||driverNo;
    if(!/^\d{4}$/.test(driver)||driver==='9998')return json({error:'Choose a driver.'},400);
    const employee=await checked(db.from('employees').select('employee_number,display_name,active').eq('employee_number',driver).maybeSingle());
    if(!employee)return json({error:'Driver not found.'},404);
    const [stops,pods,screen,locations,audit]=await Promise.all([
     route?checked(db.from('delivery_route_stops').select('id,route_id,order_id,stop_sequence,status,arrived_at,completed_at,driver_note,updated_at,delivery_orders(id,customer_name,address,stop_type,priority,status,pieces,notes,lat,lon,sales_order_no,reference_no)').eq('route_id',route.id).order('stop_sequence')):[],
     route?checked(db.from('delivery_pods').select('id,pod_number,stop_id,recipient_name,captured_at,delivery_result,notes,signature_path,photo_path').eq('route_id',route.id)):[],
     checked(db.from('nwtb_driver_screen_state').select('route_id,snapshot,geometry,received_at,captured_at,chat_sessions(expires_at)').eq('driver_employee_number',driver).maybeSingle()),
     checked(db.from('delivery_driver_locations').select('lat,lon,accuracy_m,speed_mps,captured_at').eq('driver_employee_number',driver).order('captured_at',{ascending:false}).limit(1)),
     route?checked(db.from('nwtb_office_override_audit').select('id,stop_id,order_id,employee_number,operation,reason,created_at').eq('route_id',route.id).order('created_at',{ascending:false}).limit(30)):[]
    ]);
    const freshness=screenFreshness(screen,route,stops,clock);
    // Tokens, file paths and hashes never leave the service. POD images use the existing authorized signed-URL API.
    const phone=screen?{snapshot:screen.snapshot,geometry:screen.geometry,captured_at:screen.captured_at,received_at:screen.received_at,...freshness}:freshness;
    return json({ok:true,driver:employee,route,stops,pods:pods.map(({signature_path,photo_path,...pod})=>({...pod,has_signature:!!signature_path,has_photo:!!photo_path})),phone,location:locations[0]||null,audit,server_at:new Date(clock()).toISOString()});
   }
   if(action==='available_stops'){
    let q=db.from('delivery_orders').select('id,customer_name,address,stop_type,priority,lat,lon,updated_at').eq('status','UNASSIGNED').order('customer_name').limit(100);
    const search=text(input.search,100).replace(/[%_]/g,'');if(search)q=q.ilike('customer_name','%'+search+'%');
    return json({ok:true,orders:await checked(q)});
   }
   if(action==='verify_override_pin'||action==='override'){
    const operation=input.override;
    if(action==='override'&&(!operation||!UUID.test(operation.route_id)||!UUID.test(operation.request_id)||!['complete_stop','priority','add_stop','remove_stop','end_route'].includes(operation.operation)||text(operation.reason,501).length<3))return json({error:'Choose an override action and enter a reason.'},400);
    if(action==='override'&&operation.operation==='end_route'&&(!Array.isArray(operation.expected_stops)||operation.expected_stops.length>500||operation.expected_stops.some(s=>!s||!UUID.test(s.id)||!['PENDING','DELIVERED','NOT_DELIVERED','SKIPPED'].includes(s.status)||s.updated_at!=null&&!Number.isFinite(Date.parse(s.updated_at)))))return json({error:'Refresh and review the route stops before ending this route.'},400);
    const name=action==='override'?'nwtb_office_override':'nwtb_check_office_override_pin';
    const args={p_employee_number:session.employee_number,p_pin:text(input.pin,21),...(action==='override'?{p_input:operation}:{})};
    const {data,error}=await db.rpc(name,args);
    if(error)return json({error:'The override could not be applied. Refresh the route and try again.'},409);
    return json(data,data?.ok?200:Number(data?.status)||403);
   }
   return json({error:'Unknown action.'},400);
  }catch{return json({error:'Driver View is temporarily unavailable. Please refresh.'},503);}
 };
}
