import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const allowedOrigins=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000'])
function cors(req:Request){const o=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowedOrigins.has(o)?o:'https://billyjwiorek-tech.github.io','Access-Control-Allow-Headers':'content-type, x-nwtb-session, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'}}
function reply(req:Request,b:any,s=200){return new Response(JSON.stringify(b),{status:s,headers:cors(req)})}
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}'),secret=secretKeys['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db=createClient(Deno.env.get('SUPABASE_URL')!,secret,{auth:{persistSession:false}})
const now=()=>new Date().toISOString(),txt=(v:any,n=1000)=>String(v??'').trim().slice(0,n),clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v))
const DEPOTS:any={
 BOLINGBROOK:{name:'Northwest Trucks - Bolingbrook',address:'201 S W Frontage Rd, Bolingbrook, IL 60440',lat:41.682487,lon:-88.072262},
 PALATINE:{name:'Northwest Trucks - Palatine',address:'2120 N Rand Rd, Palatine, IL 60074',lat:42.148326,lon:-88.033080}
}

async function getSession(req:Request){const token=req.headers.get('x-nwtb-session');if(!token)return null;const {data}=await db.from('chat_sessions').select('employee_number,expires_at,employees(display_name,active)').eq('token',token).gt('expires_at',now()).maybeSingle();if(!data||!(data as any).employees?.active)return null;return {employee_number:data.employee_number,display_name:(data as any).employees.display_name as string}}
async function permission(emp:string,p:string){if(emp==='9998')return true;const {data,error}=await db.rpc('nwtb_delivery_has_permission',{p_employee_number:emp,p_permission:p});return !error&&data===true}
async function sha256(s:string){const b=new TextEncoder().encode(s);const h=await crypto.subtle.digest('SHA-256',b);return Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,'0')).join('')}
async function pinOK(input:any){const pin=txt(input?.pin,20);if(!pin)return false;const {data,error}=await db.from('nwtb_admin_security').select('value_hash').eq('key','management_pin_sha256').maybeSingle();if(error||!data?.value_hash)return false;return await sha256(pin)===data.value_hash}

async function killed(){const {data}=await db.from('nwtb_system_control').select('state').eq('id',1).maybeSingle();return data?.state==='KILLED'}
function valid(p:any){const lat=Number(p?.lat),lon=Number(p?.lon);return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=20&&lat<=60&&lon>=-135&&lon<=-55}
function hav(a:any,b:any){const R=6371008.8,p=Math.PI/180,dLat=(Number(b.lat)-Number(a.lat))*p,dLon=(Number(b.lon)-Number(a.lon))*p,x=Math.sin(dLat/2)**2+Math.cos(Number(a.lat)*p)*Math.cos(Number(b.lat)*p)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
function median(a:number[]){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2}
function fallback(points:any[]){const distances=points.map((a:any,i:number)=>points.map((b:any,j:number)=>i===j?0:hav(a,b)*1.22)),durations=distances.map((r:number[])=>r.map(m=>m/13.41));return {distances,durations,source:'FALLBACK_APPROXIMATE'}}
async function roadMatrix(points:any[]){if(points.length<2||points.length>90)return fallback(points);try{const coords=points.map(p=>`${Number(p.lon)},${Number(p.lat)}`).join(';'),ac=new AbortController(),tm=setTimeout(()=>ac.abort(),12000),r=await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`,{headers:{'User-Agent':'NWTB-V2-Multi-Route/1.0','Accept':'application/json'},signal:ac.signal});clearTimeout(tm);if(r.ok){const j=await r.json();if(j?.code==='Ok'&&Array.isArray(j.durations)&&Array.isArray(j.distances))return {durations:j.durations,distances:j.distances,source:'OSRM'}}}catch{}return fallback(points)}
async function fleetPoints(){const since=new Date(Date.now()-20*60*1000).toISOString(),{data}=await db.from('delivery_driver_locations').select('driver_employee_number,lat,lon,accuracy_m,speed_mps,captured_at').gte('captured_at',since).not('speed_mps','is',null).order('captured_at',{ascending:false}).limit(3000);return (data||[]).filter((p:any)=>Number.isFinite(Number(p.speed_mps))&&Number(p.speed_mps)>=2.2&&Number(p.speed_mps)<=45&&(!Number.isFinite(Number(p.accuracy_m))||Number(p.accuracy_m)<=75))}
function pointSegMeters(p:any,a:any,b:any){const lat0=(Number(a.lat)+Number(b.lat))/2*Math.PI/180,x1=Number(a.lon)*Math.cos(lat0),y1=Number(a.lat),x2=Number(b.lon)*Math.cos(lat0),y2=Number(b.lat),xp=Number(p.lon)*Math.cos(lat0),yp=Number(p.lat),dx=x2-x1,dy=y2-y1,t=dx||dy?clamp(((xp-x1)*dx+(yp-y1)*dy)/(dx*dx+dy*dy),0,1):0,q={lat:y1+t*dy,lon:(x1+t*dx)/Math.cos(lat0)};return hav(p,q)}
function trafficFactor(a:any,b:any,dist:number,dur:number,pts:any[]){if(dist<500||dur<30||!pts.length)return {factor:1,samples:0};const expected=dist/Math.max(1,dur);if(expected<4)return {factor:1,samples:0};const minLat=Math.min(Number(a.lat),Number(b.lat))-.025,maxLat=Math.max(Number(a.lat),Number(b.lat))+.025,minLon=Math.min(Number(a.lon),Number(b.lon))-.035,maxLon=Math.max(Number(a.lon),Number(b.lon))+.035,speeds:number[]=[];for(const p of pts){if(Number(p.lat)<minLat||Number(p.lat)>maxLat||Number(p.lon)<minLon||Number(p.lon)>maxLon)continue;if(pointSegMeters(p,a,b)<=1200)speeds.push(Number(p.speed_mps))}if(speeds.length<3)return {factor:1,samples:speeds.length};const obs=median(speeds),factor=obs<expected*.82?clamp(expected/Math.max(2.2,obs),1,2.5):1;return {factor,samples:speeds.length}}
function prio(v:any){v=String(v||'NORMAL').toUpperCase();return v==='HOT_SHOT'?0:v==='PRIORITY'?1:2}
function addressKey(s:any){return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function chicagoClock(){const parts:any={};for(const p of new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()))parts[p.type]=p.value;return {day:String(parts.weekday||'').slice(0,3).toLowerCase(),minute:Number(parts.hour)*60+Number(parts.minute)}}
function closeDeadlineSec(profile:any){const h=profile?.receiving_hours;if(!h||typeof h!=='object')return null;const c=chicagoClock(),row=h[c.day],close=String(row?.close||'');if(!/^\d{2}:\d{2}$/.test(close))return null;const [hh,mm]=close.split(':').map(Number);return (hh*60+mm-c.minute)*60}
function profileMaps(rows:any[]){const saved=new Map(),ref=new Map(),addr=new Map();for(const p of rows||[]){if(p.saved_location_id)saved.set(String(p.saved_location_id),p);if(p.source_type&&p.source_ref)ref.set(`${p.source_type}|${p.source_ref}`,p);if(p.address_key)addr.set(String(p.address_key),p)}return {saved,ref,addr}}
function profileFor(o:any,m:any){return m.saved.get(String(o.saved_location_id||''))||m.ref.get(`${o.source_type||''}|${o.source_ref||''}`)||m.addr.get(addressKey(o.address))||null}
function serviceMin(o:any,profile:any){const n=Number(profile?.service_minutes);if(Number.isFinite(n)&&n>=0&&n<=180)return n;const t=String(o.stop_type||'');return t.includes('PICKUP')?15:t==='CORE_RETURN_PICKUP'?12:10}
function deadlineSec(o:any,profile:any){const vals:number[]=[];if(o.promised_by){const v=(new Date(o.promised_by).getTime()-Date.now())/1000;if(Number.isFinite(v))vals.push(v)}const c=closeDeadlineSec(profile);if(Number.isFinite(Number(c)))vals.push(Number(c));return vals.length?Math.min(...vals):Number.POSITIVE_INFINITY}

async function getProfiles(){const {data}=await db.from('delivery_location_profiles').select('saved_location_id,source_type,source_ref,address_key,service_minutes,receiving_hours,active').eq('active',true).limit(10000);return data||[]}
async function driversList(){const {data:roles}=await db.from('nwtb_delivery_roles').select('employee_number').eq('role','DRIVER').eq('active',true);const ids=(roles||[]).map((r:any)=>r.employee_number).filter((x:string)=>x!=='9998');if(!ids.length)return [];const {data}=await db.from('employees').select('employee_number,display_name').in('employee_number',ids).eq('active',true).order('display_name');return data||[]}
async function productionOrders(){
 const {data,error}=await db.from('delivery_orders')
  .select('id,customer_name,address,lat,lon,priority,promised_by,stop_type,source_type,source_ref,saved_location_id,sales_order_no,customer_number,reference_no,pieces,status')
  .eq('status','UNASSIGNED')
  .order('priority',{ascending:false})
  .order('promised_by',{ascending:true,nullsFirst:false})
  .order('created_at',{ascending:true})
  .limit(500)
 if(error)throw Error('Could not load the production dispatch queue.')
 return data||[]
}
async function loadOrders(ids:string[]){const {data,error}=await db.from('delivery_orders').select('id,customer_name,address,lat,lon,priority,promised_by,stop_type,source_type,source_ref,saved_location_id,sales_order_no,customer_number,reference_no,pieces,status').in('id',ids);if(error||!data||data.length!==ids.length)return null;const map=new Map(data.map((o:any)=>[o.id,o]));return ids.map(id=>map.get(id)).filter(Boolean)}
async function validateDrivers(ids:string[]){const all=await driversList(),m=new Map(all.map((x:any)=>[x.employee_number,x]));return ids.map(id=>m.get(id)).filter(Boolean)}
function parseDriverSelections(raw:any,fallbackDepot:any){
 const arr=Array.isArray(raw)?raw:[],out:any[]=[],seen=new Set<string>()
 for(const item of arr){
  const employee_number=txt(typeof item==='object'?(item?.employee_number||item?.id):item,20)
  if(!employee_number||seen.has(employee_number))continue
  const depot=txt(typeof item==='object'?item?.depot:fallbackDepot,30).toUpperCase()
  out.push({employee_number,depot});seen.add(employee_number)
 }
 return out
}
function depotNodeFor(depot:string){return depot==='PALATINE'?1:0}


function allowedPosition(seq:number[],idx:number,orders:any[]){const rank=prio(orders[idx].priority),positions:number[]=[];for(let p=0;p<=seq.length;p++){const before=p===0?-1:prio(orders[seq[p-1]].priority),after=p===seq.length?9:prio(orders[seq[p]].priority);if(before<=rank&&rank<=after)positions.push(p)}return positions.length?positions:Array.from({length:seq.length+1},(_,i)=>i)}
function orderNode(i:number,orderNodeStart:number){return orderNodeStart+i}
function metrics(seq:number[],depotNode:number,orderNodeStart:number,dur:number[][],dist:number[][],orders:any[],pm:any){
 let driveSeconds=0,serviceSeconds=0,meters=0,cur=depotNode;const legs:any[]=[]
 for(const oi of seq){
  const ni=orderNode(oi,orderNodeStart),travel=Number(dur[cur]?.[ni]||0),d=Number(dist[cur]?.[ni]||0),svc=serviceMin(orders[oi],profileFor(orders[oi],pm))
  driveSeconds+=travel;serviceSeconds+=svc*60;meters+=d
  legs.push({order_index:oi,travel_seconds:travel,distance_meters:d,service_minutes:svc});cur=ni
 }
 const returnSeconds=seq.length?Number(dur[cur]?.[depotNode]||0):0,returnMeters=seq.length?Number(dist[cur]?.[depotNode]||0):0
 driveSeconds+=returnSeconds;meters+=returnMeters
 return {seconds:driveSeconds+serviceSeconds,driveSeconds,serviceSeconds,meters,returnSeconds,returnMeters,outboundDriveSeconds:Math.max(0,driveSeconds-returnSeconds),outboundMeters:Math.max(0,meters-returnMeters),legs}
}
function routePriorityValid(seq:number[],orders:any[]){for(let i=1;i<seq.length;i++)if(prio(orders[seq[i-1]].priority)>prio(orders[seq[i]].priority))return false;return true}
function bestInsert(seq:number[],idx:number,depotNode:number,orderNodeStart:number,dur:number[][],dist:number[][],orders:any[],pm:any){
 const base=metrics(seq,depotNode,orderNodeStart,dur,dist,orders,pm);let best:any=null
 for(const p of allowedPosition(seq,idx,orders)){
  const test=seq.slice();test.splice(p,0,idx)
  const m=metrics(test,depotNode,orderNodeStart,dur,dist,orders,pm),deltaDrive=m.driveSeconds-base.driveSeconds,deltaMeters=m.meters-base.meters
  if(!best||deltaDrive<best.deltaDrive-1||(Math.abs(deltaDrive-best.deltaDrive)<=1&&deltaMeters<best.deltaMeters))best={seq:test,pos:p,metrics:m,deltaDrive,deltaMeters}
 }
 return best
}
function optimizeRouteSequence(seq:number[],depotNode:number,orderNodeStart:number,dur:number[][],dist:number[][],orders:any[],pm:any){
 let best=seq.slice(),bestM=metrics(best,depotNode,orderNodeStart,dur,dist,orders,pm)
 for(let pass=0;pass<5;pass++){
  let improved=false
  outer:for(let i=0;i<best.length-1;i++)for(let j=i+1;j<best.length;j++){
   const test=best.slice();const rev=test.slice(i,j+1).reverse();test.splice(i,j-i+1,...rev)
   if(!routePriorityValid(test,orders))continue
   const m=metrics(test,depotNode,orderNodeStart,dur,dist,orders,pm)
   if(m.driveSeconds<bestM.driveSeconds-15||(Math.abs(m.driveSeconds-bestM.driveSeconds)<=15&&m.meters<bestM.meters-150)){best=test;bestM=m;improved=true;break outer}
  }
  if(!improved)break
 }
 return best
}
function objective(routes:number[][],depotNodes:number[],orderNodeStart:number,dur:number[][],dist:number[][],orders:any[],pm:any){
 const ms=routes.map((r,i)=>metrics(r,depotNodes[i],orderNodeStart,dur,dist,orders,pm))
 const totalDrive=ms.reduce((a,m)=>a+m.driveSeconds,0),total=ms.reduce((a,m)=>a+m.seconds,0),totalMeters=ms.reduce((a,m)=>a+m.meters,0)
 const max=Math.max(0,...ms.map(m=>m.seconds)),min=ms.length?Math.min(...ms.map(m=>m.seconds)):0,avg=ms.length?total/ms.length:0
 const imbalance=ms.reduce((a,m)=>a+Math.abs(m.seconds-avg),0),excessiveSpread=Math.max(0,(max-min)-90*60)
 const emptyPenalty=(orders.length>=routes.length?routes.filter(r=>r.length===0).length:0)*6*3600
 return {score:totalDrive+imbalance*.06+excessiveSpread*.10+emptyPenalty,max,min,total,totalDrive,totalMeters,imbalance,metrics:ms}
}
function seedRoutes(depotNodes:number[],orderNodeStart:number,orders:any[],dur:number[][]){
 const routes=Array.from({length:depotNodes.length},()=>[] as number[]),remaining=new Set(orders.map((_:any,i:number)=>i)),seeds=Math.min(depotNodes.length,orders.length)
 for(let ri=0;ri<seeds;ri++){
  let pick=-1,best=Number.POSITIVE_INFINITY;const sameDepotSeeds:number[]=[]
  for(let k=0;k<ri;k++)if(depotNodes[k]===depotNodes[ri]&&routes[k][0]!==undefined)sameDepotSeeds.push(routes[k][0])
  for(const oi of remaining){
   const node=orderNode(oi,orderNodeStart),round=Number(dur[depotNodes[ri]]?.[node]||0)+Number(dur[node]?.[depotNodes[ri]]||0)
   let score=round
   if(sameDepotSeeds.length){const sep=Math.min(...sameDepotSeeds.map(si=>Number(dur[orderNode(si,orderNodeStart)]?.[node]||0)+Number(dur[node]?.[orderNode(si,orderNodeStart)]||0)));score=round-sep*.70}
   if(score<best){best=score;pick=oi}
  }
  if(pick>=0){routes[ri]=[pick];remaining.delete(pick)}
 }
 return {routes,remaining}
}
function buildRoutes(depotNodes:number[],orderNodeStart:number,orders:any[],dur:number[][],dist:number[][],pm:any){
 const seeded=seedRoutes(depotNodes,orderNodeStart,orders,dur),routes=seeded.routes,remaining=[...seeded.remaining]
 const sorted=remaining.map(i=>{const node=orderNode(i,orderNodeStart),nearest=Math.min(...depotNodes.map(d=>Number(dur[d]?.[node]||0)));return {i,rank:prio(orders[i].priority),deadline:deadlineSec(orders[i],profileFor(orders[i],pm)),far:nearest}}).sort((a,b)=>a.rank-b.rank||a.deadline-b.deadline||b.far-a.far)
 for(const x of sorted){
  const current=routes.map((r,i)=>metrics(r,depotNodes[i],orderNodeStart,dur,dist,orders,pm)),loads=current.map(m=>m.seconds),avgLoad=loads.reduce((a,b)=>a+b,0)/Math.max(1,loads.length);let best:any=null
  for(let ri=0;ri<routes.length;ri++){const ins=bestInsert(routes[ri],x.i,depotNodes[ri],orderNodeStart,dur,dist,orders,pm),predicted=ins.metrics.seconds,softOver=Math.max(0,predicted-(avgLoad+90*60)),score=ins.deltaDrive+softOver*.08;if(!best||score<best.score-1||(Math.abs(score-best.score)<=1&&ins.deltaMeters<best.deltaMeters))best={ri,seq:ins.seq,score,deltaMeters:ins.deltaMeters}}
  if(best)routes[best.ri]=best.seq
 }
 for(let i=0;i<routes.length;i++)routes[i]=optimizeRouteSequence(routes[i],depotNodes[i],orderNodeStart,dur,dist,orders,pm)
 for(let pass=0;pass<12;pass++){
  const base=objective(routes,depotNodes,orderNodeStart,dur,dist,orders,pm);let move:any=null
  for(let from=0;from<routes.length;from++){if(orders.length>=routes.length&&routes[from].length<=1)continue;for(let pos=0;pos<routes[from].length;pos++){const idx=routes[from][pos];for(let to=0;to<routes.length;to++){if(to===from)continue;const a=routes.map(r=>r.slice());a[from].splice(pos,1);const ins=bestInsert(a[to],idx,depotNodes[to],orderNodeStart,dur,dist,orders,pm);a[to]=ins.seq;a[from]=optimizeRouteSequence(a[from],depotNodes[from],orderNodeStart,dur,dist,orders,pm);a[to]=optimizeRouteSequence(a[to],depotNodes[to],orderNodeStart,dur,dist,orders,pm);const o=objective(a,depotNodes,orderNodeStart,dur,dist,orders,pm);if(o.score<base.score-30&&(!move||o.score<move.obj.score))move={routes:a,obj:o}}}}
  if(!move)break;for(let i=0;i<routes.length;i++)routes[i]=move.routes[i]
 }
 return routes
}


Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)})
 if(req.method!=='POST')return reply(req,{error:'POST required'},405)
 let input:any;try{input=await req.json()}catch{return reply(req,{error:'Invalid JSON'},400)}
 const session=await getSession(req);if(!session)return reply(req,{error:'Delivery session expired. Sign in again.'},401)
 const action=txt(input?.action,60)
 const hasManage=await permission(session.employee_number,'MANAGE_ROUTES')
 if(!hasManage&&!(await pinOK(input)))return reply(req,{error:'Admin PIN required for route-management tools.',code:'ADMIN_PIN_REQUIRED'},403)

 if(action==='bootstrap'){
  try{
   const [drivers,orders]=await Promise.all([driversList(),productionOrders()])
   return reply(req,{ok:true,session,drivers,orders,depots:DEPOTS})
  }catch(e){return reply(req,{error:e?.message||'Could not load route builder.'},500)}
 }

 if(action==='optimize_and_commit'){
  if(await killed())return reply(req,{error:'NWTB Delivery System is currently locked by administrator.',code:'NWTB_SYSTEM_KILLED'},423)

  const selections=parseDriverSelections(input?.drivers,input?.depot)
  if(selections.length<1||selections.length>12)return reply(req,{error:'Choose between 1 and 12 drivers.'},400)
  const badDepot=selections.find((x:any)=>!['BOLINGBROOK','PALATINE'].includes(x.depot))
  if(badDepot)return reply(req,{error:'Choose BOLINGBROOK or PALATINE for every selected driver.'},400)

  const driverIds=selections.map((x:any)=>x.employee_number)
  const orderIds=[...new Set((Array.isArray(input?.order_ids)?input.order_ids:[]).map((x:any)=>txt(x,80)).filter(Boolean))]
  if(orderIds.length<1||orderIds.length>85)return reply(req,{error:'Choose between 1 and 85 AVAILABLE stops.'},400)
  if(orderIds.length<driverIds.length)return reply(req,{error:'There are more selected drivers than selected stops.'},400)

  const [baseDrivers,orders]=await Promise.all([validateDrivers(driverIds),loadOrders(orderIds)])
  if(baseDrivers.length!==driverIds.length)return reply(req,{error:'One or more selected drivers are no longer available.'},409)
  if(!orders||orders.length!==orderIds.length)return reply(req,{error:'One or more selected stops could not be loaded.'},409)
  const unavailable=orders.filter((o:any)=>o.status!=='UNASSIGNED')
  if(unavailable.length)return reply(req,{error:'One or more selected stops are no longer AVAILABLE. Refresh the queue.',unavailable:unavailable.map((o:any)=>({id:o.id,name:o.customer_name,status:o.status}))},409)
  const invalid=orders.filter((o:any)=>!valid(o))
  if(invalid.length)return reply(req,{error:'One or more stops need valid coordinates before optimization.',invalid_orders:invalid.map((o:any)=>({id:o.id,name:o.customer_name,address:o.address}))},409)

  const drivers=baseDrivers.map((d:any,i:number)=>({...d,depot:selections[i].depot}))
  const pRows=await getProfiles(),pm=profileMaps(pRows),orderNodeStart=2
  const points=[DEPOTS.BOLINGBROOK,DEPOTS.PALATINE,...orders.map((o:any)=>({lat:Number(o.lat),lon:Number(o.lon)}))]
  const depotNodes=drivers.map((d:any)=>depotNodeFor(d.depot))
  const mat=await roadMatrix(points),fleet=await fleetPoints()
  const dur=mat.durations.map((r:number[])=>r.slice()),dist=mat.distances.map((r:number[])=>r.slice())
  let samples=0

  for(let i=0;i<points.length;i++)for(let j=0;j<points.length;j++){
   if(i===j)continue
   const d=Number(dist[i]?.[j]),t=Number(dur[i]?.[j])
   if(!Number.isFinite(d)||!Number.isFinite(t))continue
   const z=trafficFactor(points[i],points[j],d,t,fleet)
   dur[i][j]=t*z.factor;samples+=z.samples
  }

  const routes=buildRoutes(depotNodes,orderNodeStart,orders,dur,dist,pm)
  const obj=objective(routes,depotNodes,orderNodeStart,dur,dist,orders,pm)

  const payload=routes.map((seq:number[],ri:number)=>{
   const m=obj.metrics[ri],driver=drivers[ri]
   return {
    driver_employee_number:driver.employee_number,
    depot:driver.depot,
    estimated_miles:m.meters/1609.344,
    estimated_minutes:Math.round(m.seconds/60),
    drive_minutes:Math.round(m.driveSeconds/60),
    service_minutes:Math.round(m.serviceSeconds/60),
    return_miles:m.returnMeters/1609.344,
    return_minutes:Math.round(m.returnSeconds/60),
    traffic_aware:samples>=3,
    matrix_source:mat.source,
    stops:seq.map((oi:number,k:number)=>({order_id:orders[oi].id,stop_sequence:k+1}))
   }
  })

  const routeDate=txt(input?.route_date,20)||new Date().toISOString().slice(0,10)
  const {data:committed,error:ce}=await db.rpc('nwtb_commit_multi_routes',{
   p_created_by:session.employee_number,
   p_route_date:routeDate,
   p_routes:payload
  })
  if(ce)return reply(req,{error:ce.message||'Could not create production routes.'},409)

  const driverMap=new Map(drivers.map((d:any)=>[d.employee_number,d]))
  const orderMap=new Map(orders.map((o:any)=>[String(o.id),o]))
  const summary=payload.map((r:any,ri:number)=>({
   ...r,
   route_id:committed?.routes?.[ri]?.route_id||null,
   driver_display_name:driverMap.get(r.driver_employee_number)?.display_name||r.driver_employee_number,
   stops:r.stops.map((s:any)=>({
    ...s,
    customer_name:orderMap.get(String(s.order_id))?.customer_name||'',
    address:orderMap.get(String(s.order_id))?.address||''
   }))
  }))

  return reply(req,{
   ok:true,
   routes:summary,
   total_miles:obj.totalMeters/1609.344,
   total_route_minutes:Math.round(obj.total/60),
   total_drive_minutes:Math.round(obj.totalDrive/60),
   max_route_minutes:Math.round(obj.max/60),
   balance_spread_minutes:Math.round((obj.max-obj.min)/60),
   matrix_source:mat.source,
   traffic_aware:samples>=3,
   traffic_samples:samples
  })
 }

 return reply(req,{error:'Unknown action.'},400)
})
