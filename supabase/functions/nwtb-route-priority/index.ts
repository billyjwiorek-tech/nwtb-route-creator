import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const allowedOrigins=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000'])
function cors(req:Request){const origin=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://billyjwiorek-tech.github.io','Access-Control-Allow-Headers':'content-type, x-nwtb-session, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'}}
function reply(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors(req)})}

const url=Deno.env.get('SUPABASE_URL')!
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
const secret=secretKeys['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db=createClient(url,secret,{auth:{persistSession:false}})
const now=()=>new Date().toISOString()
const txt=(v:any,n=240)=>String(v??'').trim().slice(0,n)
const HOME={lat:41.682487,lon:-88.072262,name:'Northwest Trucks - Bolingbrook'}

async function sha256(s:string){const b=new TextEncoder().encode(s);const h=await crypto.subtle.digest('SHA-256',b);return Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,'0')).join('')}
async function pinOK(input:any){const pin=txt(input?.pin,20);if(!pin)return false;const {data,error}=await db.from('nwtb_admin_security').select('value_hash').eq('key','management_pin_sha256').maybeSingle();if(error||!data?.value_hash)return false;return await sha256(pin)===data.value_hash}
async function systemKilled(){try{const {data,error}=await db.from('nwtb_system_control').select('state').eq('id',1).maybeSingle();return !error&&data?.state==='KILLED'}catch{return false}}
async function mutationGuard(req:Request){if(await systemKilled())return reply(req,{error:'NWTB Delivery System is currently locked by administrator.',code:'NWTB_SYSTEM_KILLED'},423);return null}
async function getSession(req:Request){
 const token=req.headers.get('x-nwtb-session');if(!token)return null
 const {data}=await db.from('chat_sessions').select('token,employee_number,expires_at,employees(display_name,active)').eq('token',token).gt('expires_at',now()).maybeSingle()
 if(!data||!(data as any).employees?.active)return null
 return {employee_number:data.employee_number,display_name:(data as any).employees.display_name as string}
}
function validCoord(p:any){const lat=Number(p?.lat),lon=Number(p?.lon);return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=20&&lat<=60&&lon>=-135&&lon<=-55}
function hav(a:any,b:any){const R=6371008.8,p=Math.PI/180,dLat=(Number(b.lat)-Number(a.lat))*p,dLon=(Number(b.lon)-Number(a.lon))*p;const x=Math.sin(dLat/2)**2+Math.cos(Number(a.lat)*p)*Math.cos(Number(b.lat)*p)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
function fallbackMatrix(points:any[]){const distances=points.map((a:any,i:number)=>points.map((b:any,j:number)=>i===j?0:hav(a,b)*1.22));const durations=distances.map((r:number[])=>r.map(m=>m/13.41));return {distances,durations,source:'FALLBACK_APPROXIMATE'}}
async function roadMatrix(points:any[]){if(points.length<2||points.length>90)return fallbackMatrix(points);try{const coords=points.map((p:any)=>`${Number(p.lon)},${Number(p.lat)}`).join(';'),ac=new AbortController(),timer=setTimeout(()=>ac.abort(),9000);const r=await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`,{headers:{'User-Agent':'NWTB-Priority-Router/1.0','Accept':'application/json'},signal:ac.signal});clearTimeout(timer);if(r.ok){const j=await r.json();if(j?.code==='Ok'&&Array.isArray(j?.durations)&&Array.isArray(j?.distances))return {durations:j.durations,distances:j.distances,source:'OSRM'}}}catch{}return fallbackMatrix(points)}
function priorityRank(p:any){const v=String(p||'NORMAL').toUpperCase();return v==='HOT_SHOT'?0:v==='PRIORITY'?1:2}
function routeCost(order:number[],m:number[][],endIdx:number|null){const q=[0,...order];if(endIdx!==null)q.push(endIdx);let z=0;for(let i=0;i<q.length-1;i++){const v=Number(m?.[q[i]]?.[q[i+1]]);if(!Number.isFinite(v))return Infinity;z+=v}return z}
function rankOrderOK(order:number[],rankByIdx:Map<number,number>){let last=-1;for(const i of order){const r=rankByIdx.get(i)??2;if(r<last)return false;last=r}return true}
function improve(order:number[],m:number[][],endIdx:number|null,rankByIdx:Map<number,number>,respectPriority:boolean){let best=order.slice(),cost=routeCost(best,m,endIdx),round=0,changed=true;const maxRounds=best.length>35?2:8;while(changed&&round++<maxRounds){changed=false;for(let i=0;i<best.length-1;i++)for(let k=i+1;k<best.length;k++){const n=best.slice();n.splice(i,k-i+1,...n.slice(i,k+1).reverse());if(respectPriority&&!rankOrderOK(n,rankByIdx))continue;const c=routeCost(n,m,endIdx);if(c+1<cost){best=n;cost=c;changed=true}}}return best}
async function optimize(start:any,stops:any[],end:any|null,respectPriority=true){if(stops.length<2)return stops.slice();const pts=[start,...stops.map((s:any)=>({lat:Number(s.lat),lon:Number(s.lon)}))];let endIdx:number|null=null;if(end&&validCoord(end)){endIdx=pts.length;pts.push({lat:Number(end.lat),lon:Number(end.lon)})}const mat=await roadMatrix(pts),left=stops.map((s:any,i:number)=>({...s,__idx:i+1,__rank:respectPriority?priorityRank(s.priority):0})),order:number[]=[],rankByIdx=new Map<number,number>(left.map((x:any)=>[x.__idx,x.__rank]));let current=0;const groups=respectPriority?[0,1,2]:[0];for(const g of groups){let pool=left.filter((x:any)=>x.__rank===g);while(pool.length){let best=pool[0],bestD=Infinity;for(const x of pool){const d=Number(mat.durations?.[current]?.[x.__idx]);const value=Number.isFinite(d)?d:hav(current===0?start:stops[current-1],x);if(value<bestD){bestD=value;best=x}}order.push(best.__idx);current=best.__idx;pool=pool.filter((x:any)=>x.__idx!==best.__idx)}}const better=improve(order,mat.durations,endIdx,rankByIdx,respectPriority),byIdx=new Map(left.map((x:any)=>[x.__idx,x]));return better.map(i=>{const x:any={...(byIdx.get(i) as any)};delete x.__idx;delete x.__rank;return x})}
async function routeDetail(routeId:string){const {data:route}=await db.from('delivery_routes').select('id,status,driver_employee_number,depot,start_lat,start_lon,end_mode,end_lat,end_lon,updated_at').eq('id',routeId).maybeSingle();if(!route)return null;const {data:stops}=await db.from('delivery_route_stops').select('id,order_id,stop_sequence,status,delivery_orders(id,customer_name,address,lat,lon,priority,status)').eq('route_id',routeId).order('stop_sequence');return {route,stops:stops||[]}}
async function latestDriverLocation(driver:string){const {data}=await db.from('delivery_driver_locations').select('lat,lon,captured_at,route_id').eq('driver_employee_number',driver).order('captured_at',{ascending:false}).limit(1).maybeSingle();if(!data||!validCoord(data))return null;const age=Date.now()-new Date(data.captured_at).getTime();return Number.isFinite(age)&&age<=10*60*1000?data:null}
async function chooseStart(route:any,locked:any[]){if(route.status==='ACTIVE'){const loc=await latestDriverLocation(route.driver_employee_number);if(loc)return {lat:Number(loc.lat),lon:Number(loc.lon)}}if(validCoord({lat:route.start_lat,lon:route.start_lon}))return {lat:Number(route.start_lat),lon:Number(route.start_lon)};if(locked.length){const last=locked.slice().sort((a:any,b:any)=>b.stop_sequence-a.stop_sequence)[0]?.delivery_orders;if(validCoord(last))return {lat:Number(last.lat),lon:Number(last.lon)}}return {...HOME}}
function chooseEnd(route:any,start:any){if(route.end_mode==='LAST_STOP')return null;if(route.end_mode==='SAME_AS_START')return start;if(validCoord({lat:route.end_lat,lon:route.end_lon}))return {lat:Number(route.end_lat),lon:Number(route.end_lon)};return {...HOME}}
async function reorder(routeId:string){const d=await routeDetail(routeId);if(!d)return {error:'Route not found.'};if(!['PLANNED','ACTIVE'].includes(d.route.status))return {error:'Only planned or active routes can be re-optimized.'};const locked=(d.stops||[]).filter((x:any)=>x.status!=='PENDING').sort((a:any,b:any)=>a.stop_sequence-b.stop_sequence),pendingRows=(d.stops||[]).filter((x:any)=>x.status==='PENDING').sort((a:any,b:any)=>a.stop_sequence-b.stop_sequence);if(pendingRows.length<2)return {ok:true,route:d.route,ordered:pendingRows.map((x:any)=>x.delivery_orders),changed:false};const pending=pendingRows.map((x:any)=>({...x.delivery_orders,route_stop_id:x.id}));for(const o of pending)if(!validCoord(o))return {error:`${o.customer_name||'A pending stop'} does not have a valid route location.`};const start=await chooseStart(d.route,locked),end=chooseEnd(d.route,start),ordered=await optimize(start,pending,end,true),base=locked.length?Math.max(...locked.map((x:any)=>Number(x.stop_sequence)||0))+1:1,t=now();for(let i=0;i<pendingRows.length;i++)await db.from('delivery_route_stops').update({stop_sequence:10000+i,updated_at:t}).eq('id',pendingRows[i].id);for(let i=0;i<ordered.length;i++)await db.from('delivery_route_stops').update({stop_sequence:base+i,updated_at:t}).eq('id',ordered[i].route_stop_id);await db.from('delivery_routes').update({estimated_miles:null,estimated_minutes:null,updated_at:t}).eq('id',routeId);return {ok:true,route:d.route,ordered,changed:true}}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)})
 if(req.method!=='POST')return reply(req,{error:'POST required'},405)
 let input:any;try{input=await req.json()}catch{return reply(req,{error:'Invalid JSON'},400)}
 const session=await getSession(req);if(!session)return reply(req,{error:'Delivery session expired.'},401)
 const action=txt(input?.action,60),isDesk=session.employee_number==='9998'
 if(action==='set_priority_and_reoptimize'){
  const blocked=await mutationGuard(req);if(blocked)return blocked
  if(!(await pinOK(input)))return reply(req,{error:'Incorrect management PIN.'},403)
  const routeId=txt(input?.route_id,60),stopId=txt(input?.route_stop_id,60),priority=txt(input?.priority,20).toUpperCase();if(!routeId||!stopId||!['NORMAL','PRIORITY','HOT_SHOT'].includes(priority))return reply(req,{error:'Route, stop and valid priority are required.'},400)
  const d=await routeDetail(routeId);if(!d)return reply(req,{error:'Route not found.'},404);if(!['PLANNED','ACTIVE'].includes(d.route.status))return reply(req,{error:'Only planned or active routes can be changed.'},409);const target=(d.stops||[]).find((x:any)=>x.id===stopId);if(!target)return reply(req,{error:'Stop not found on this route.'},404);if(target.status!=='PENDING')return reply(req,{error:'Only a pending stop can have its route priority changed.'},409)
  const t=now(),o:any=target.delivery_orders,{error:pe}=await db.from('delivery_orders').update({priority,updated_at:t}).eq('id',target.order_id);if(pe)return reply(req,{error:'Could not change stop priority.'},500);const result:any=await reorder(routeId);if(result.error)return reply(req,{error:result.error},409);const eventType=d.route.status==='ACTIVE'?'STOP_PRIORITY_CHANGED_ACTIVE':'STOP_PRIORITY_CHANGED';await db.from('delivery_events').insert({route_id:routeId,stop_id:stopId,order_id:target.order_id,employee_number:session.employee_number,event_type:eventType,note:`${o?.customer_name||'Stop'} set to ${priority.replace('_',' ')}; remaining stops re-optimized.`});return reply(req,{ok:true,priority,route_status:d.route.status,driver_employee_number:d.route.driver_employee_number,ordered:(result.ordered||[]).map((x:any)=>({id:x.id,customer_name:x.customer_name,priority:x.priority}))})
 }
 if(action==='reoptimize_remaining'){
  const blocked=await mutationGuard(req);if(blocked)return blocked
  if(!(await pinOK(input)))return reply(req,{error:'Incorrect management PIN.'},403)
  const routeId=txt(input?.route_id,60);if(!routeId)return reply(req,{error:'Route is required.'},400);const d=await routeDetail(routeId);if(!d)return reply(req,{error:'Route not found.'},404);if(!['PLANNED','ACTIVE'].includes(d.route.status))return reply(req,{error:'Only planned or active routes can be re-optimized.'},409);const result:any=await reorder(routeId);if(result.error)return reply(req,{error:result.error},409);const eventType=d.route.status==='ACTIVE'?'ROUTE_REOPTIMIZED_ACTIVE':'ROUTE_REOPTIMIZED';await db.from('delivery_events').insert({route_id:routeId,employee_number:session.employee_number,event_type:eventType,note:'Remaining pending stops re-optimized by Dispatch. Priority stops were honored.'});return reply(req,{ok:true,route_status:d.route.status,driver_employee_number:d.route.driver_employee_number,ordered:(result.ordered||[]).map((x:any)=>({id:x.id,customer_name:x.customer_name,priority:x.priority}))})
 }
 if(action==='route_priority_changes'){
  const routeId=txt(input?.route_id,60),driver=isDesk?txt(input?.driver_employee_number,20):session.employee_number,after=Math.max(0,Number(input?.after_id)||0)
  if(!routeId||!/^[0-9]{4}$/.test(driver)||driver==='9998')return reply(req,{error:'Driver and route are required.'},400)
  const {data:r}=await db.from('delivery_routes').select('id,driver_employee_number,status').eq('id',routeId).maybeSingle()
  if(!r||r.driver_employee_number!==driver)return reply(req,{error:'Route is not assigned to this driver.'},403)
  let q=db.from('delivery_events').select('id,created_at,event_type,note,order_id,stop_id').eq('route_id',routeId).in('event_type',['STOP_PRIORITY_CHANGED_ACTIVE','ROUTE_REOPTIMIZED_ACTIVE']).order('id',{ascending:true}).limit(50)
  if(after>0)q=q.gt('id',after)
  const {data,error}=await q
  if(error)return reply(req,{error:'Could not check priority route changes.'},500)
  return reply(req,{ok:true,events:data||[],route_status:r.status})
 }
 if(!isDesk)return reply(req,{error:'Office route management only.'},403)
 return reply(req,{error:'Unknown priority-route action.'},400)
})