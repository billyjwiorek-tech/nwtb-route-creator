import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const allowedOrigins=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000'])
const salesPublicKey='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc'
function cors(req:Request){const origin=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://billyjwiorek-tech.github.io','Access-Control-Allow-Headers':'content-type, x-nwtb-session, x-nwtb-sales, apikey','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'}}
function reply(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
const url=Deno.env.get('SUPABASE_URL')!
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
const secret=secretKeys['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db=createClient(url,secret,{auth:{persistSession:false}})

async function validSession(req:Request){
 const origin=req.headers.get('origin')||''
 if(req.headers.get('x-nwtb-sales')==='1' && allowedOrigins.has(origin) && req.headers.get('apikey')===salesPublicKey)return true
 const token=req.headers.get('x-nwtb-session');if(!token)return false
 const {data}=await db.from('chat_sessions').select('token,expires_at,employee_number,employees(active)').eq('token',token).gt('expires_at',new Date().toISOString()).maybeSingle()
 return !!(data && (data as any).employees?.active)
}
function haversineMeters(a:any,b:any){
 const R=6371008.8,p=Math.PI/180,dLat=(b.lat-a.lat)*p,dLon=(b.lon-a.lon)*p
 const x=Math.sin(dLat/2)**2+Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(dLon/2)**2
 return 2*R*Math.asin(Math.sqrt(x))
}
function fallback(points:any[]){
 const distances=points.map((a,i)=>points.map((b,j)=>i===j?0:haversineMeters(a,b)*1.22))
 const metersPerSecond=13.41
 const durations=distances.map(row=>row.map(m=>m/metersPerSecond))
 return {code:'Ok',distances,durations,source:'FALLBACK_APPROXIMATE',warning:'Road service unavailable; route was optimized using approximate distance.'}
}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)})
 if(req.method!=='POST')return reply(req,{error:'POST required'},405)
 if(!(await validSession(req)))return reply(req,{error:'Routing session expired or request not authorized.'},401)
 let body:any;try{body=await req.json()}catch{return reply(req,{error:'Invalid JSON'},400)}
 const raw=Array.isArray(body?.points)?body.points:[]
 if(raw.length<2||raw.length>30)return reply(req,{error:'Route requires 2 to 30 locations.'},400)
 const points=raw.map((p:any)=>({lat:Number(p?.lat),lon:Number(p?.lon)}))
 if(points.some((p:any)=>!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||p.lat<-90||p.lat>90||p.lon<-180||p.lon>180))return reply(req,{error:'One or more route locations are invalid.'},400)
 const coords=points.map((p:any)=>`${p.lon},${p.lat}`).join(';')
 try{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),9000)
  const r=await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`,{headers:{'User-Agent':'NWTB-Route-Matrix/2.0','Accept':'application/json'},signal:controller.signal})
  clearTimeout(timer)
  if(r.ok){const j=await r.json();if(j?.code==='Ok'&&Array.isArray(j?.durations)&&Array.isArray(j?.distances))return reply(req,{code:'Ok',durations:j.durations,distances:j.distances,source:'OSRM'})}
 }catch{}
 return reply(req,fallback(points))
})