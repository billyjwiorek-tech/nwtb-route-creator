import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const allowedOrigins=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000'])
function cors(req:Request){const o=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowedOrigins.has(o)?o:'https://billyjwiorek-tech.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-nwtb-session','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Vary':'Origin'}}
function reply(req:Request,b:any,s=200){return new Response(JSON.stringify(b),{status:s,headers:cors(req)})}
const db=createClient(Deno.env.get('SUPABASE_URL')!,JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
const now=()=>new Date().toISOString()
async function validSession(req:Request){const t=req.headers.get('x-nwtb-session');if(!t)return false;const {data}=await db.from('chat_sessions').select('token,expires_at,employees(active)').eq('token',t).gt('expires_at',now()).maybeSingle();return !!(data&&(data as any).employees?.active)}
function valid(lat:any,lon:any){lat=Number(lat);lon=Number(lon);return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=20&&lat<=60&&lon>=-135&&lon<=-55}
async function timed(url:string,ms=6500){const c=new AbortController(),to=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{signal:c.signal,headers:{Accept:'application/json','User-Agent':'NWTB-Delivery-Manager/2.0'}})}finally{clearTimeout(to)}}
function variants(address:string,name:string){const out:string[]=[];const add=(s:string)=>{s=s.replace(/\s+/g,' ').trim();if(s&&!out.includes(s))out.push(s)};add(address);add(address+', USA');add(address.replace(/\bLn\b/gi,'Lane').replace(/\bRd\b/gi,'Road').replace(/\bDr\b/gi,'Drive').replace(/\bAve\b/gi,'Avenue'));if(name){add(`${name}, ${address}`);add(`${name}, ${address}, USA`)}return out}
async function arcgis(q:string){try{const r=await timed('https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&countryCode=USA&maxLocations=3&outFields=Match_addr,Addr_type&SingleLine='+encodeURIComponent(q));if(!r.ok)return null;const j=await r.json();for(const x of j?.candidates||[]){if(Number(x?.score||0)>=60&&valid(x?.location?.y,x?.location?.x))return {lat:Number(x.location.y),lon:Number(x.location.x),matched_address:x.address||q,source:'ARCGIS'}}}catch{}return null}
async function census(q:string){try{const r=await timed('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address='+encodeURIComponent(q));if(!r.ok)return null;const j=await r.json();const m=j?.result?.addressMatches?.[0];if(m&&valid(m?.coordinates?.y,m?.coordinates?.x))return {lat:Number(m.coordinates.y),lon:Number(m.coordinates.x),matched_address:m.matchedAddress||q,source:'US_CENSUS'}}catch{}return null}
async function nominatim(q:string){try{const r=await timed('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&countrycodes=us&q='+encodeURIComponent(q));if(!r.ok)return null;const a=await r.json();for(const h of Array.isArray(a)?a:[]){if(valid(h?.lat,h?.lon))return {lat:Number(h.lat),lon:Number(h.lon),matched_address:h.display_name||q,source:'NOMINATIM'}}}catch{}return null}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)})
 if(req.method!=='POST')return reply(req,{error:'POST required'},405)
 if(!(await validSession(req)))return reply(req,{error:'Delivery session expired.'},401)
 let input:any
 try{input=await req.json()}catch{return reply(req,{error:'Invalid JSON'},400)}
 const address=String(input?.address||'').trim().slice(0,320),name=String(input?.name||'').trim().slice(0,180)
 if(!address)return reply(req,{error:'Address required.'},400)
 const qs=variants(address,name)
 for(const q of qs){const g=await arcgis(q);if(g)return reply(req,{ok:true,address,...g})}
 for(const q of qs){const g=await census(q);if(g)return reply(req,{ok:true,address,...g})}
 for(const q of qs){const g=await nominatim(q);if(g)return reply(req,{ok:true,address,...g})}
 return reply(req,{error:`Address could not be located: ${address}`,status:'NOT_FOUND'},404)
})
