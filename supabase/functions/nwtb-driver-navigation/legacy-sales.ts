import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const allowedOrigins=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000'])
const salesPublicKey='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc'
function cors(req:Request){
  const origin=req.headers.get('origin')||''
  return {
    'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://billyjwiorek-tech.github.io',
    'Access-Control-Allow-Headers':'content-type, x-nwtb-session, x-nwtb-sales, apikey',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Content-Type':'application/json'
  }
}
function reply(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors(req)})}

const url=Deno.env.get('SUPABASE_URL')!
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
const secret=secretKeys['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db=createClient(url,secret,{auth:{persistSession:false}})

async function validSession(req:Request){
  const origin=req.headers.get('origin')||''
  if(req.headers.get('x-nwtb-sales')==='1' && allowedOrigins.has(origin) && req.headers.get('apikey')===salesPublicKey)return true
  const token=req.headers.get('x-nwtb-session')
  if(!token)return false
  const {data}=await db.from('chat_sessions')
    .select('token,expires_at,employee_number,employees(active)')
    .eq('token',token)
    .gt('expires_at',new Date().toISOString())
    .maybeSingle()
  return !!(data && (data as any).employees?.active)
}

function n(v:any){return Number(v)}
function goodCoord(p:any){
  const lat=n(p?.lat),lon=n(p?.lon)
  return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=20&&lat<=60&&lon>=-135&&lon<=-55
}
const toRad=(x:number)=>x*Math.PI/180
function hav(a:any,b:any){
  const R=6371008.8,p=Math.PI/180,dLat=(n(b.lat)-n(a.lat))*p,dLon=(n(b.lon)-n(a.lon))*p
  const x=Math.sin(dLat/2)**2+Math.cos(n(a.lat)*p)*Math.cos(n(b.lat)*p)*Math.sin(dLon/2)**2
  return 2*R*Math.asin(Math.sqrt(x))
}
function median(a:number[]){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2}
function cleanOsrmStep(s:any){
  return {
    distance_m:n(s?.distance)||0,
    duration_s:n(s?.duration)||0,
    name:String(s?.name||''),
    ref:String(s?.ref||''),
    destinations:String(s?.destinations||''),
    exits:String(s?.exits||''),
    driving_side:String(s?.driving_side||''),
    maneuver:{
      type:String(s?.maneuver?.type||''),
      modifier:String(s?.maneuver?.modifier||''),
      exit:n(s?.maneuver?.exit)||null,
      bearing_before:n(s?.maneuver?.bearing_before)||0,
      bearing_after:n(s?.maneuver?.bearing_after)||0,
      location:Array.isArray(s?.maneuver?.location)?s.maneuver.location.slice(0,2):[]
    },
    geometry:Array.isArray(s?.geometry?.coordinates)?s.geometry.coordinates:[]
  }
}

async function recentFleetPoints(origin:any,destination:any){
  const minLat=Math.min(n(origin.lat),n(destination.lat))-.20,maxLat=Math.max(n(origin.lat),n(destination.lat))+.20
  const minLon=Math.min(n(origin.lon),n(destination.lon))-.25,maxLon=Math.max(n(origin.lon),n(destination.lon))+.25
  const since=new Date(Date.now()-20*60*1000).toISOString()
  const {data,error}=await db.from('delivery_driver_locations')
    .select('driver_employee_number,lat,lon,accuracy_m,heading_deg,speed_mps,captured_at')
    .gte('captured_at',since)
    .gte('lat',minLat).lte('lat',maxLat)
    .gte('lon',minLon).lte('lon',maxLon)
    .not('speed_mps','is',null)
    .order('captured_at',{ascending:false})
    .limit(3000)
  if(error||!data)return []
  return data.filter((p:any)=>Number.isFinite(n(p.speed_mps))&&n(p.speed_mps)>=2.2&&n(p.speed_mps)<=45&&(!Number.isFinite(n(p.accuracy_m))||n(p.accuracy_m)<=75))
}

function stepSamples(step:any){
  const g=Array.isArray(step?.geometry?.coordinates)?step.geometry.coordinates:[]
  if(!g.length)return []
  const stride=Math.max(1,Math.floor(g.length/10)),out:any[]=[]
  for(let i=0;i<g.length;i+=stride){const c=g[i];if(Array.isArray(c)&&c.length>=2)out.push({lat:n(c[1]),lon:n(c[0])})}
  const c=g[g.length-1];if(Array.isArray(c)&&c.length>=2)out.push({lat:n(c[1]),lon:n(c[0])})
  return out
}
function nearestSampleDistance(point:any,samples:any[]){
  let best=Infinity
  for(const s of samples){const d=hav(point,s);if(d<best)best=d}
  return best
}
function estimateTraffic(route:any,points:any[]){
  const steps=(route.legs||[]).flatMap((l:any)=>l.steps||[])
  const staticS=Math.max(1,n(route.duration)||0),routeDist=Math.max(1,n(route.distance)||0)
  let estimatedS=0,coveredM=0,matchedPoints=0,slowSteps=0
  for(const step of steps){
    const dist=Math.max(0,n(step.distance)||0),dur=Math.max(0,n(step.duration)||0)
    if(dist<120||dur<10){estimatedS+=dur;continue}
    const expected=dist/Math.max(1,dur)
    if(expected<4){estimatedS+=dur;continue}
    const samples=stepSamples(step)
    if(!samples.length){estimatedS+=dur;continue}
    const speeds:number[]=[]
    const seenDrivers=new Set<string>()
    for(const p of points){
      if(nearestSampleDistance({lat:n(p.lat),lon:n(p.lon)},samples)<=110){
        speeds.push(n(p.speed_mps));seenDrivers.add(String(p.driver_employee_number||''))
      }
    }
    if(speeds.length>=3){
      const obs=median(speeds),ratio=obs/expected
      matchedPoints+=speeds.length;coveredM+=dist
      if(ratio<.72){
        slowSteps++
        const adjusted=Math.min(dur*3,dist/Math.max(2.2,obs))
        estimatedS+=Math.max(dur,adjusted)
      }else estimatedS+=dur
    }else estimatedS+=dur
  }
  const coverage=coveredM/routeDist
  const trafficAware=matchedPoints>=6&&coverage>=.10
  return {static_s:staticS,estimated_s:trafficAware?Math.max(staticS,estimatedS):staticS,coverage,matched_points:matchedPoints,slow_steps:slowSteps,traffic_aware:trafficAware}
}

async function osrmRoutes(origin:any,destination:any){
  const coords=`${n(origin.lon)},${n(origin.lat)};${n(destination.lon)},${n(destination.lat)}`
  const endpoint=`https://router.project-osrm.org/route/v1/driving/${coords}?alternatives=3&steps=true&geometries=geojson&overview=full&annotations=false&continue_straight=default`
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000)
  try{
    const r=await fetch(endpoint,{headers:{'User-Agent':'NWTB-Driver-Navigation/4.0','Accept':'application/json'},signal:controller.signal})
    if(!r.ok)return null
    const j=await r.json()
    if(j?.code!=='Ok'||!Array.isArray(j?.routes)||!j.routes.length)return null
    return j.routes
  }catch{return null}finally{clearTimeout(timer)}
}

export async function legacyHandler(req:Request){
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)})
  if(req.method!=='POST')return reply(req,{error:'POST required'},405)
  if(!(await validSession(req)))return reply(req,{error:'Navigation request is not authorized.'},401)
  let body:any;try{body=await req.json()}catch{return reply(req,{error:'Invalid JSON'},400)}
  if(body?.action!=='route')return reply(req,{error:'Unknown action'},400)
  const origin=body?.origin,destination=body?.destination
  if(!goodCoord(origin)||!goodCoord(destination))return reply(req,{error:'Origin or destination is invalid.'},400)

  const routes=await osrmRoutes(origin,destination)
  if(!routes)return reply(req,{error:'Navigation routing service is temporarily unavailable.'},503)
  const fleet=await recentFleetPoints(origin,destination)
  const scored=routes.map((route:any)=>({route,traffic:estimateTraffic(route,fleet)}))
  scored.sort((a:any,b:any)=>a.traffic.estimated_s-b.traffic.estimated_s)
  const chosen=scored[0]
  const route=chosen.route,t=chosen.traffic
  const steps=(route.legs||[]).flatMap((leg:any)=>(leg.steps||[]).map(cleanOsrmStep))
  const geometry=Array.isArray(route?.geometry?.coordinates)?route.geometry.coordinates:[]
  return reply(req,{
    code:'Ok',
    source:t.traffic_aware?'NWTB_FLEET_TRAFFIC':'OSRM',
    traffic_aware:t.traffic_aware,
    routing_preference:t.traffic_aware?'NWTB_FLEET_TRAFFIC':'OSRM_FASTEST',
    distance_m:n(route.distance)||0,
    duration_s:Math.round(t.estimated_s),
    static_duration_s:Math.round(t.static_s),
    traffic_delay_s:Math.max(0,Math.round(t.estimated_s-t.static_s)),
    traffic_observations:t.matched_points,
    traffic_coverage_pct:Math.round(t.coverage*100),
    slow_segments:t.slow_steps,
    geometry,steps
  })
}

