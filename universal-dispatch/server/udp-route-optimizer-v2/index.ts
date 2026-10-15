import {coord,measureRoute,refreshRouteMetrics,visibleRoute} from '../shared/route-metrics.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.95.0'
const URL=Deno.env.get('SUPABASE_URL')!,sk=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}'),SERVICE=sk['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db=createClient(URL,SERVICE,{auth:{persistSession:false}})
const allowed=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000']),enc=new TextEncoder(),now=()=>new Date().toISOString(),clean=(v:any,n=500)=>String(v??'').trim().slice(0,n)
function cors(req:Request){const o=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowed.has(o)?o:'*','Access-Control-Allow-Headers':'content-type,apikey,x-udp-session','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'}}
function out(req:Request,b:any,s=200){return new Response(JSON.stringify(b),{status:s,headers:cors(req)})}
async function pinHash(pin:string,salt:string){const key=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:120000,hash:'SHA-256'},key,256);return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function settings(){const {data}=await db.from('company_settings').select('*').limit(1).maybeSingle();return data}
async function session(req:Request){const t=req.headers.get('x-udp-session');if(!t)return null;const {data}=await db.from('app_sessions').select('token,user_id,role,expires_at,app_users(id,role,driver_number,full_name,email,active,pending_activation)').eq('token',t).gt('expires_at',now()).maybeSingle();const u=(data as any)?.app_users;if(!data||!u?.active||u?.pending_activation)return null;return {token:t,user:u}}
const need=(s:any,roles:string[])=>!!s&&roles.includes(s.user.role)
async function managementOK(pin:any){const st=await settings();if(!st?.management_pin_hash||!st?.management_pin_salt)return false;return (await pinHash(clean(pin,20),st.management_pin_salt))===st.management_pin_hash}
function valid(p:any){return coord(p)}
function hav(a:any,b:any){const R=6371000,p1=Number(a.lat)*Math.PI/180,p2=Number(b.lat)*Math.PI/180,dp=(Number(b.lat)-Number(a.lat))*Math.PI/180,dl=(Number(b.lon)-Number(a.lon))*Math.PI/180,x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function fallbackMatrix(points:any[]){const distances=points.map((a:any,i:number)=>points.map((b:any,j:number)=>i===j?0:hav(a,b)*1.22)),durations=distances.map((r:number[])=>r.map(m=>m/13.41));return {distances,durations,source:'FALLBACK_APPROXIMATE'}}
async function matrix(points:any[]){if(points.length<2||points.length>90)return fallbackMatrix(points);try{const c=points.map((p:any)=>`${Number(p.lon)},${Number(p.lat)}`).join(';'),ac=new AbortController(),tm=setTimeout(()=>ac.abort(),9000),r=await fetch(`https://router.project-osrm.org/table/v1/driving/${c}?annotations=duration,distance`,{headers:{'User-Agent':'UniversalDispatch-Optimizer/2.0','Accept':'application/json'},signal:ac.signal});clearTimeout(tm);if(r.ok){const j=await r.json();if(j?.code==='Ok'&&Array.isArray(j?.durations)&&Array.isArray(j?.distances))return {durations:j.durations,distances:j.distances,source:'OSRM'}}}catch{}return fallbackMatrix(points)}
const rank=(p:any)=>{const v=String(p||'NORMAL').toUpperCase();return v==='MUST_FIRST'?0:v==='HOT_SHOT'?1:v==='PRIORITY'?2:3}
function routeCost(order:number[],m:number[][],endIdx:number|null){const q=[0,...order];if(endIdx!==null)q.push(endIdx);let z=0;for(let i=0;i<q.length-1;i++){const v=Number(m?.[q[i]]?.[q[i+1]]);if(!Number.isFinite(v))return Infinity;z+=v}return z}
function rankOK(order:number[],rm:Map<number,number>){let last=-1;for(const i of order){const r=rm.get(i)??3;if(r<last)return false;last=r}return true}
function improve(order:number[],m:number[][],endIdx:number|null,rm:Map<number,number>,respect:boolean){let best=order.slice(),cost=routeCost(best,m,endIdx),changed=true,round=0,max=best.length>35?2:8;while(changed&&round++<max){changed=false;for(let i=0;i<best.length-1;i++)for(let k=i+1;k<best.length;k++){const n=best.slice();n.splice(i,k-i+1,...n.slice(i,k+1).reverse());if(respect&&!rankOK(n,rm))continue;const c=routeCost(n,m,endIdx);if(c+1<cost){best=n;cost=c;changed=true}}}return best}
async function optimize(start:any,stops:any[],end:any|null,respectPriority:boolean){if(stops.length<2)return stops.slice();const pts=[start,...stops.map((s:any)=>({lat:Number(s.lat),lon:Number(s.lon)}))];let endIdx:number|null=null;if(end&&valid(end)){endIdx=pts.length;pts.push({lat:Number(end.lat),lon:Number(end.lon)})}const mat=await matrix(pts),left=stops.map((s:any,i:number)=>({...s,__idx:i+1,__rank:respectPriority?rank(s.priority):0})),groups=respectPriority?[0,1,2,3]:[0],order:number[]=[],rm=new Map<number,number>(left.map((x:any)=>[x.__idx,x.__rank]));let current=0;for(const g of groups){let pool=left.filter((x:any)=>x.__rank===g);while(pool.length){let best=pool[0],bestD=Infinity;for(const x of pool){const d=Number(mat.durations?.[current]?.[x.__idx]);if(Number.isFinite(d)&&d<bestD){bestD=d;best=x}}order.push(best.__idx);current=best.__idx;pool=pool.filter((x:any)=>x.__idx!==best.__idx)}}const better=improve(order,mat.durations,endIdx,rm,respectPriority),by=new Map(left.map((x:any)=>[x.__idx,x]));return better.map(i=>{const x:any={...(by.get(i) as any)};delete x.__idx;delete x.__rank;return x})}
async function latestLoc(driverId:string){const {data}=await db.from('driver_locations').select('*').eq('driver_user_id',driverId).order('recorded_at',{ascending:false}).limit(1).maybeSingle();return data}
async function routeDetail(id:string){const {data:r}=await db.from('delivery_routes').select('*,app_users!delivery_routes_driver_user_id_fkey(id,driver_number,full_name,phone,email)').eq('id',id).maybeSingle();if(!r)return null;const {data:s}=await db.from('delivery_route_stops').select('*,delivery_orders(*)').eq('route_id',id).order('stop_sequence');return {route:r,stops:s||[]}}
async function metrics(start:any,stops:any[],end:any|null){return measureRoute(start,stops,end)}
async function chooseStart(r:any,locked:any[]){if(['ACTIVE','PAUSED'].includes(r.status)){const l=await latestLoc(r.driver_user_id);if(l&&valid(l)&&Date.now()-new Date(l.recorded_at).getTime()<15*60*1000)return {lat:Number(l.lat),lon:Number(l.lon)}}if(valid({lat:r.start_lat,lon:r.start_lon}))return {lat:Number(r.start_lat),lon:Number(r.start_lon)};if(locked.length){const o=locked.slice().sort((a:any,b:any)=>b.stop_sequence-a.stop_sequence)[0]?.delivery_orders;if(valid(o))return {lat:Number(o.lat),lon:Number(o.lon)}}const st=await settings();return {lat:Number(st?.depot_lat),lon:Number(st?.depot_lon)}}
function chooseEnd(r:any,start:any){if(r.end_mode==='LAST_STOP')return null;if(r.end_mode==='SAME_AS_START')return start;if(valid({lat:r.end_lat,lon:r.end_lon}))return {lat:Number(r.end_lat),lon:Number(r.end_lon)};return null}
async function reorder(id:string,actorId:string){const d=await routeDetail(id);if(!d)return {error:'Route not found.'};if(!['PLANNED','ACTIVE','PAUSED'].includes(d.route.status))return {error:'Only planned, active or paused routes can be re-optimized.'};const locked=d.stops.filter((x:any)=>x.status!=='PENDING').sort((a:any,b:any)=>a.stop_sequence-b.stop_sequence),pendingRows=d.stops.filter((x:any)=>x.status==='PENDING').sort((a:any,b:any)=>a.stop_sequence-b.stop_sequence);if(pendingRows.length<2)return {ok:true,detail:d,ordered:pendingRows.map((x:any)=>x.delivery_orders),changed:false};const pending=pendingRows.map((x:any)=>({...x.delivery_orders,route_stop_id:x.id}));for(const o of pending)if(!valid(o))return {error:`${o.customer_name||'A pending stop'} does not have a valid route location.`};const start=await chooseStart(d.route,locked),end=chooseEnd(d.route,start),ordered=await optimize(start,pending,end,true),t=now();const {error:orderError}=await db.rpc('udp_reorder_pending_stops',{p_route_id:id,p_actor_user_id:actorId,p_expected_updated_at:d.route.updated_at,p_ordered_stop_ids:ordered.map((o:any)=>o.route_stop_id)});if(orderError)return {error:orderError.message};await refreshRouteMetrics(db,id);return {ok:true,detail:d,ordered,changed:true}}

function allowedPositions(seq:number[],idx:number,orders:any[]){
 const rr=rank(orders[idx]?.priority),out:number[]=[]
 for(let p=0;p<=seq.length;p++){
  const before=p===0?-1:rank(orders[seq[p-1]]?.priority),after=p===seq.length?99:rank(orders[seq[p]]?.priority)
  if(before<=rr&&rr<=after)out.push(p)
 }
 return out.length?out:Array.from({length:seq.length+1},(_,i)=>i)
}
function multiMetrics(seq:number[],depotNode:number,orderStart:number,dur:number[][],dist:number[][]){
 let sec=0,meters=0,cur=depotNode
 for(const oi of seq){const n=orderStart+oi;sec+=Number(dur[cur]?.[n]||0);meters+=Number(dist[cur]?.[n]||0);cur=n}
 if(seq.length){sec+=Number(dur[cur]?.[depotNode]||0);meters+=Number(dist[cur]?.[depotNode]||0)}
 return {seconds:sec,meters}
}
function bestMultiInsert(seq:number[],idx:number,depotNode:number,orderStart:number,dur:number[][],dist:number[][],orders:any[]){
 const base=multiMetrics(seq,depotNode,orderStart,dur,dist),pos=allowedPositions(seq,idx,orders);let best:any=null
 for(const p of pos){const test=seq.slice();test.splice(p,0,idx);const m=multiMetrics(test,depotNode,orderStart,dur,dist),delta=m.seconds-base.seconds;if(!best||delta<best.delta-1||(Math.abs(delta-best.delta)<=1&&m.meters<best.metrics.meters))best={seq:test,delta,metrics:m}}
 return best
}
function priorityOrderOK(seq:number[],orders:any[]){let last=-1;for(const i of seq){const r=rank(orders[i]?.priority);if(r<last)return false;last=r}return true}
function improveMulti(seq:number[],depotNode:number,orderStart:number,dur:number[][],dist:number[][],orders:any[]){
 let best=seq.slice(),bm=multiMetrics(best,depotNode,orderStart,dur,dist)
 for(let pass=0;pass<5;pass++){let changed=false
  outer:for(let i=0;i<best.length-1;i++)for(let j=i+1;j<best.length;j++){
   const t=best.slice();t.splice(i,j-i+1,...t.slice(i,j+1).reverse());if(!priorityOrderOK(t,orders))continue
   const m=multiMetrics(t,depotNode,orderStart,dur,dist)
   if(m.seconds<bm.seconds-15||(Math.abs(m.seconds-bm.seconds)<=15&&m.meters<bm.meters-150)){best=t;bm=m;changed=true;break outer}
  }
  if(!changed)break
 }
 return best
}
function multiObjective(routes:number[][],depots:number[],orderStart:number,dur:number[][],dist:number[][],orders:any[]){
 const ms=routes.map((r,i)=>multiMetrics(r,depots[i],orderStart,dur,dist)),total=ms.reduce((a,m)=>a+m.seconds,0),miles=ms.reduce((a,m)=>a+m.meters,0),max=Math.max(0,...ms.map(m=>m.seconds)),min=ms.length?Math.min(...ms.map(m=>m.seconds)):0,avg=ms.length?total/ms.length:0
 const imbalance=ms.reduce((a,m)=>a+Math.abs(m.seconds-avg),0),spread=Math.max(0,(max-min)-90*60),empty=(orders.length>=routes.length?routes.filter(r=>!r.length).length:0)*6*3600
 return {score:total+imbalance*.06+spread*.10+empty,total,max,min,meters:miles,metrics:ms}
}
function buildMultiRoutes(depots:number[],orderStart:number,orders:any[],dur:number[][],dist:number[][]){
 const routes=Array.from({length:depots.length},()=>[] as number[]),remaining=new Set(orders.map((_:any,i:number)=>i))
 if(orders.length<depots.length)throw Error('There are more selected drivers than selected stops.')
 for(let ri=0;ri<routes.length;ri++){
  let pick=-1,best=Infinity
  for(const oi of remaining){const n=orderStart+oi,round=Number(dur[depots[ri]]?.[n]||0)+Number(dur[n]?.[depots[ri]]||0);if(round<best){best=round;pick=oi}}
  if(pick>=0){routes[ri]=[pick];remaining.delete(pick)}
 }
 const sorted=[...remaining].sort((a,b)=>rank(orders[a].priority)-rank(orders[b].priority))
 for(const oi of sorted){
  const ms=routes.map((r,i)=>multiMetrics(r,depots[i],orderStart,dur,dist)),avg=ms.reduce((a,m)=>a+m.seconds,0)/Math.max(1,ms.length);let best:any=null
  for(let ri=0;ri<routes.length;ri++){
   const ins=bestMultiInsert(routes[ri],oi,depots[ri],orderStart,dur,dist,orders),over=Math.max(0,ins.metrics.seconds-(avg+90*60)),score=ins.delta+over*.08
   if(!best||score<best.score)best={ri,seq:ins.seq,score}
  }
  routes[best.ri]=best.seq
 }
 for(let i=0;i<routes.length;i++)routes[i]=improveMulti(routes[i],depots[i],orderStart,dur,dist,orders)
 for(let pass=0;pass<10;pass++){
  const base=multiObjective(routes,depots,orderStart,dur,dist,orders);let move:any=null
  for(let from=0;from<routes.length;from++){if(routes[from].length<=1)continue;for(let p=0;p<routes[from].length;p++){const oi=routes[from][p];for(let to=0;to<routes.length;to++){if(to===from)continue;const test=routes.map(r=>r.slice());test[from].splice(p,1);const ins=bestMultiInsert(test[to],oi,depots[to],orderStart,dur,dist,orders);test[to]=ins.seq;test[from]=improveMulti(test[from],depots[from],orderStart,dur,dist,orders);test[to]=improveMulti(test[to],depots[to],orderStart,dur,dist,orders);const o=multiObjective(test,depots,orderStart,dur,dist,orders);if(o.score<base.score-30&&(!move||o.score<move.obj.score))move={routes:test,obj:o}}}}
  if(!move)break;for(let i=0;i<routes.length;i++)routes[i]=move.routes[i]
 }
 return routes
}

Deno.serve(async(req:Request)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});if(req.method!=='POST')return out(req,{error:'POST required'},405);let p:any={};try{p=await req.json()}catch{return out(req,{error:'Invalid JSON'},400)}const action=clean(p.action,80),s=await session(req);if(!s)return out(req,{error:'Session expired. Sign in again.'},401);try{
 if(action==='multi_route_create'){
  if(!need(s,['ADMIN','DISPATCH']))return out(req,{error:'Office access required.'},403)
  const rawDrivers=Array.isArray(p.drivers)?p.drivers:[],seenDrivers=new Set<string>(),selections:any[]=[]
  for(const x of rawDrivers){
   const driver_id=clean(x?.driver_id,60),location_id=clean(x?.location_id,60)
   if(!driver_id||!location_id||seenDrivers.has(driver_id))continue
   seenDrivers.add(driver_id);selections.push({driver_id,location_id})
  }
  const ids=Array.isArray(p.order_ids)?[...new Set(p.order_ids.map((x:any)=>clean(x,60)).filter(Boolean))].slice(0,85):[]
  if(!selections.length||selections.length>12)return out(req,{error:'Choose between 1 and 12 drivers.'},400)
  if(!ids.length)return out(req,{error:'Choose at least one AVAILABLE stop.'},400)
  if(ids.length<selections.length)return out(req,{error:'There are more selected drivers than selected stops.'},400)

  const driverIds=selections.map(x=>x.driver_id),locationIds=[...new Set(selections.map(x=>x.location_id))]
  const [{data:drivers,error:de},{data:locations,error:le},{data:orders,error:oe}]=await Promise.all([
   db.from('app_users').select('id,full_name,driver_number,active,pending_activation').in('id',driverIds).eq('role','DRIVER'),
   db.from('company_locations').select('*').in('id',locationIds).eq('active',true),
   db.from('delivery_orders').select('*').in('id',ids).eq('status','UNASSIGNED')
  ])
  if(de)throw de;if(le)throw le;if(oe)throw oe
  if((drivers||[]).length!==driverIds.length||drivers?.some((d:any)=>!d.active||d.pending_activation))return out(req,{error:'One or more selected drivers are not active.'},409)
  if((locations||[]).some((l:any)=>!coord(l)))return out(req,{error:'A selected company location needs valid coordinates.'},409)
  if((locations||[]).length!==locationIds.length)return out(req,{error:'One or more selected locations are not available.'},409)
  if((orders||[]).length!==ids.length)return out(req,{error:'One or more selected stops are no longer AVAILABLE.'},409)
  for(const o of orders||[])if(!valid(o))return out(req,{error:`${o.customer_name||'A selected stop'} does not have a valid route location.`},409)

  const orderMap=new Map((orders||[]).map((o:any)=>[String(o.id),o])),orderedInput=ids.map(id=>orderMap.get(id)),locMap=new Map((locations||[]).map((l:any)=>[String(l.id),l])),driverMap=new Map((drivers||[]).map((d:any)=>[String(d.id),d]))
  const uniqueLocs=locationIds.map(id=>locMap.get(id)),orderStart=uniqueLocs.length,points=[...uniqueLocs.map((l:any)=>({lat:Number(l.lat),lon:Number(l.lon)})),...orderedInput.map((o:any)=>({lat:Number(o.lat),lon:Number(o.lon)}))]
  const mat=await matrix(points),locNode=new Map(uniqueLocs.map((l:any,i:number)=>[String(l.id),i])),depotNodes=selections.map(x=>Number(locNode.get(x.location_id)))
  const routes=buildMultiRoutes(depotNodes,orderStart,orderedInput,mat.durations,mat.distances)
  const payload=[];for(let ri=0;ri<routes.length;ri++){const seq=routes[ri],location:any=locMap.get(selections[ri].location_id),routeOrders=seq.map((oi:number)=>orderedInput[oi]),met=await measureRoute(location,routeOrders,location);payload.push({driver_id:selections[ri].driver_id,location_id:selections[ri].location_id,...met,stops:seq.map((oi:number,k:number)=>({order_id:orderedInput[oi].id,stop_sequence:k+1}))})}
  const {data:committed,error:ce}=await db.rpc('udp_commit_multi_routes',{p_created_by:s.user.id,p_route_date:p.route_date||new Date().toISOString().slice(0,10),p_wave:clean(p.wave,80)||'STANDARD',p_routes:payload})
  if(ce)throw ce
  const summary=payload.map((r:any,ri:number)=>({route_id:committed?.routes?.[ri]?.route_id,released_to_driver:false,drive_minutes:r.drive_minutes,service_minutes:r.service_minutes,return_miles:r.return_miles,return_minutes:r.return_minutes,matrix_source:r.matrix_source,traffic_aware:false,driver_id:r.driver_id,driver_name:driverMap.get(r.driver_id)?.full_name||'',driver_number:driverMap.get(r.driver_id)?.driver_number||'',location_id:r.location_id,location_name:locMap.get(r.location_id)?.name||'',estimated_miles:r.estimated_miles,estimated_minutes:r.estimated_minutes,stops:r.stops.map((st:any)=>({...st,customer_name:orderMap.get(String(st.order_id))?.customer_name||'',address:orderMap.get(String(st.order_id))?.address||''}))}))
  return out(req,{ok:true,routes:summary,commit:committed,matrix_source:mat.source,optimized:true,multi_driver:true})
 }
 if(action==='route_create'){
  if(!need(s,['ADMIN','DISPATCH']))return out(req,{error:'Office access required.'},403);const driverId=clean(p.driver_id,60),ids=Array.isArray(p.order_ids)?[...new Set(p.order_ids.map((x:any)=>clean(x,60)).filter(Boolean))].slice(0,85):[];if(!driverId||!ids.length)return out(req,{error:'Choose a driver and at least one stop.'},400);const {data:driver}=await db.from('app_users').select('id,full_name,driver_number,active,pending_activation').eq('id',driverId).eq('role','DRIVER').maybeSingle();if(!driver?.active||driver.pending_activation)return out(req,{error:'Driver is not active.'},400);const {data:orders}=await db.from('delivery_orders').select('*').in('id',ids).eq('status','UNASSIGNED');if((orders||[]).length!==ids.length)return out(req,{error:'One or more stops are no longer AVAILABLE.'},409);for(const o of orders||[])if(!valid(o))return out(req,{error:`${o.customer_name} does not have a valid route location.`},409);const st=await settings();let start={lat:Number(st.depot_lat),lon:Number(st.depot_lon),name:st.depot_name,address:st.depot_address},startMode=clean(p.start_mode,30).toUpperCase()||'DEPOT';if(startMode==='DRIVER_CURRENT'){const l=await latestLoc(driverId);if(!l||Date.now()-new Date(l.recorded_at).getTime()>15*60*1000)return out(req,{error:'A recent driver GPS position is required for Driver Current Location.'},409);start={lat:Number(l.lat),lon:Number(l.lon),name:`${driver.full_name} current location`,address:'Current GPS location'}}else if(startMode==='CUSTOM'&&valid({lat:p.start_lat,lon:p.start_lon}))start={lat:Number(p.start_lat),lon:Number(p.start_lon),name:clean(p.start_name,160)||'Custom Start',address:clean(p.start_address,500)||'Custom start'};let endMode=clean(p.end_mode,30).toUpperCase()||'RETURN_DEPOT',provisionalEnd:any=null,end:any=null;if(endMode==='RETURN_DEPOT'){end={lat:Number(st.depot_lat),lon:Number(st.depot_lon),name:st.depot_name,address:st.depot_address};provisionalEnd=end}else if(endMode==='CUSTOM'&&valid({lat:p.end_lat,lon:p.end_lon})){end={lat:Number(p.end_lat),lon:Number(p.end_lon),name:clean(p.end_name,160)||'Custom End',address:clean(p.end_address,500)||'Custom end'};provisionalEnd=end}else if(endMode!=='LAST_STOP')return out(req,{error:'Invalid route end mode.'},400);const ordered=await optimize(start,orders||[],provisionalEnd,false);if(endMode==='LAST_STOP'){const z=ordered[ordered.length-1];end={lat:Number(z.lat),lon:Number(z.lon),name:z.customer_name,address:z.address}}const met=await metrics(start,ordered,provisionalEnd);const payload={driver_id:driverId,route_mode:'OPTIMIZED',start_mode:startMode,start_name:start.name,start_address:start.address,start_lat:start.lat,start_lon:start.lon,end_mode:endMode,end_name:end?.name||null,end_address:end?.address||null,end_lat:end?.lat??null,end_lon:end?.lon??null,...met,stops:ordered.map((o:any,i:number)=>({order_id:o.id,stop_sequence:i+1}))};const {data:committed,error}=await db.rpc('udp_commit_multi_routes',{p_created_by:s.user.id,p_route_date:p.route_date||new Date().toISOString().slice(0,10),p_wave:clean(p.wave,80)||'STANDARD',p_routes:[payload]});if(error)throw error;const detail=await routeDetail(committed.routes[0].route_id);return out(req,{ok:true,...detail,estimated_miles:met.estimated_miles,estimated_minutes:met.estimated_minutes,optimized:true})
 }
 if(action==='route_get'){const d=await routeDetail(clean(p.route_id,60));if(!d)return out(req,{error:'Route not found.'},404);if(!visibleRoute(s.user,d.route))return out(req,{error:'This route is not assigned to you.'},403);return out(req,{ok:true,...d})}
 if(action==='set_priority_and_reoptimize'){
  if(!need(s,['ADMIN','DISPATCH'])||!(await managementOK(p.pin)))return out(req,{error:'Correct management PIN required.',code:'ADMIN_PIN_REQUIRED'},403);const rid=clean(p.route_id,60),sid=clean(p.route_stop_id,60),priority=clean(p.priority,20).toUpperCase();if(!rid||!sid||!['NORMAL','PRIORITY','HOT_SHOT','MUST_FIRST'].includes(priority))return out(req,{error:'Route, stop and valid priority are required.'},400);const d=await routeDetail(rid);if(!d||!['PLANNED','ACTIVE','PAUSED'].includes(d.route.status))return out(req,{error:'Editable route not found.'},404);const target=d.stops.find((x:any)=>x.id===sid);if(!target)return out(req,{error:'Stop not found.'},404);if(target.status!=='PENDING')return out(req,{error:'Only a pending stop can have its route priority changed.'},409);await db.from('delivery_orders').update({priority,updated_at:now()}).eq('id',target.order_id);const r:any=await reorder(rid,s.user.id);if(r.error)return out(req,{error:r.error},409);const active=['ACTIVE','PAUSED'].includes(d.route.status),eventType=active?'STOP_PRIORITY_CHANGED_ACTIVE':'STOP_PRIORITY_CHANGED';await db.from('delivery_events').insert({route_id:rid,order_id:target.order_id,user_id:s.user.id,event_type:eventType,note:`${target.delivery_orders?.customer_name||'Stop'} set to ${priority.replaceAll('_',' ')}; remaining stops re-optimized.`});return out(req,{ok:true,priority,route_status:d.route.status,ordered:(r.ordered||[]).map((x:any)=>({id:x.id,customer_name:x.customer_name,priority:x.priority}))})
 }
 if(action==='reoptimize_remaining'){
  if(!need(s,['ADMIN','DISPATCH'])||!(await managementOK(p.pin)))return out(req,{error:'Correct management PIN required.',code:'ADMIN_PIN_REQUIRED'},403);const rid=clean(p.route_id,60),d=await routeDetail(rid);if(!d||!['PLANNED','ACTIVE','PAUSED'].includes(d.route.status))return out(req,{error:'Editable route not found.'},404);const r:any=await reorder(rid,s.user.id);if(r.error)return out(req,{error:r.error},409);const active=['ACTIVE','PAUSED'].includes(d.route.status);await db.from('delivery_events').insert({route_id:rid,user_id:s.user.id,event_type:active?'ROUTE_REOPTIMIZED_ACTIVE':'ROUTE_REOPTIMIZED',note:'Remaining pending stops re-optimized by Dispatch. Priority stops were honored.'});return out(req,{ok:true,route_status:d.route.status,ordered:(r.ordered||[]).map((x:any)=>({id:x.id,customer_name:x.customer_name,priority:x.priority}))})
 }
 if(action==='route_priority_changes'){
  const rid=clean(p.route_id,60),after=Math.max(0,Number(p.after_id)||0),d=await routeDetail(rid);if(!d)return out(req,{error:'Route not found.'},404);if(!visibleRoute(s.user,d.route))return out(req,{error:'This route is not assigned to you.'},403);let q=db.from('delivery_events').select('id,created_at,event_type,note,order_id').eq('route_id',rid).in('event_type',['STOP_PRIORITY_CHANGED_ACTIVE','ROUTE_REOPTIMIZED_ACTIVE']).order('id',{ascending:true}).limit(50);if(after>0)q=q.gt('id',after);const {data,error}=await q;if(error)throw error;return out(req,{ok:true,events:data||[],route_status:d.route.status})
 }
 return out(req,{error:'Unknown optimizer action.'},400)
 }catch(e){console.error(e);return out(req,{error:(e as Error)?.message||'Server error'},500)}})
