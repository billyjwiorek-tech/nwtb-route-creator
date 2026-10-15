import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL=Deno.env.get('SUPABASE_URL')!;
const secrets=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
const SERVICE=secrets['default']||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(URL,SERVICE,{auth:{persistSession:false}});
const allowed=new Set(['https://billyjwiorek-tech.github.io','http://localhost:8000','http://127.0.0.1:8000']);
const enc=new TextEncoder();
const now=()=>new Date().toISOString();
const clean=(v:any,n=500)=>String(v??'').trim().slice(0,n);
const norm=(v:any)=>clean(v,300).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
const b64=(u:Uint8Array)=>btoa(String.fromCharCode(...u));
function cors(req:Request){const o=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':allowed.has(o)?o:'*','Access-Control-Allow-Headers':'content-type,apikey,x-udp-session','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'}}
function out(req:Request,body:any,status=200){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
async function sha(s:string){const b=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)));return [...b].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function pinHash(pin:string,salt:string){const key=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:120000,hash:'SHA-256'},key,256);return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function salt(){return b64(crypto.getRandomValues(new Uint8Array(18)))}
function token(){return b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g,'')}
async function settings(){const {data}=await db.from('company_settings').select('*').limit(1).maybeSingle();return data}
async function session(req:Request){const t=req.headers.get('x-udp-session');if(!t)return null;const {data}=await db.from('app_sessions').select('token,user_id,role,expires_at,app_users(id,role,driver_number,full_name,email,phone,active,pending_activation,messaging_enabled,e2ee_public_key,e2ee_key_version)').eq('token',t).gt('expires_at',now()).maybeSingle();const u=(data as any)?.app_users;if(!data||!u?.active||u?.pending_activation)return null;return {token:t,user:u}}
const need=(s:any,roles:string[])=>!!s&&roles.includes(s.user.role);
async function managementOK(pin:any){const st=await settings();if(!st?.management_pin_hash||!st?.management_pin_salt)return false;return (await pinHash(clean(pin,20),st.management_pin_salt))===st.management_pin_hash}
async function fetchJson(url:string,headers:Record<string,string>={}){const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),6500);try{const r=await fetch(url,{headers,signal:ac.signal});if(!r.ok)throw Error(`HTTP ${r.status}`);return await r.json()}finally{clearTimeout(timer)}}
function photonAddress(p:any,original:string){const street=[p.housenumber,p.street].filter(Boolean).join(' ');const city=p.city||p.locality||p.district;const state=p.state;const zip=p.postcode;const country=p.country;const line2=[city,state,zip].filter(Boolean).join(', ').replace(/, ([0-9]{5}(?:-[0-9]{4})?)$/, ' $1');return [street||p.name,line2,country].filter(Boolean).join(', ')||original}
async function geocode(address:string){
 const a=clean(address,500),n=norm(a);if(!a)return null;
 const {data:c}=await db.from('geocode_cache').select('*').eq('normalized_address',n).maybeSingle();
 if(c?.lat!=null&&c?.lon!=null)return {address:c.display_address||a,lat:Number(c.lat),lon:Number(c.lon),provider:c.provider||'CACHE',cached:true};
 // 1) US Census geocoder: stable, no key, excellent for U.S. street addresses.
 try{
  const j=await fetchJson(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(a)}&benchmark=Public_AR_Current&format=json`,{'User-Agent':'UniversalDispatchPlatform/1.0'});
  const m=j?.result?.addressMatches?.[0],lat=Number(m?.coordinates?.y),lon=Number(m?.coordinates?.x);
  if(m&&Number.isFinite(lat)&&Number.isFinite(lon)){
   const display=clean(m.matchedAddress||a,500);await db.from('geocode_cache').upsert({normalized_address:n,display_address:display,lat,lon,provider:'US_CENSUS',confidence:'MATCH',updated_at:now()});return {address:display,lat,lon,provider:'US_CENSUS',cached:false};
  }
 }catch(e){console.log('Census geocoder unavailable',String(e))}
 // 2) Photon/OSM fallback for U.S. and international addresses.
 try{
  const j=await fetchJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(a)}&limit=3&lang=en`,{'User-Agent':'UniversalDispatchPlatform/1.0'});
  const f=j?.features?.[0],coords=f?.geometry?.coordinates,lon=Number(coords?.[0]),lat=Number(coords?.[1]);
  if(f&&Number.isFinite(lat)&&Number.isFinite(lon)){
   const display=photonAddress(f.properties||{},a);await db.from('geocode_cache').upsert({normalized_address:n,display_address:display,lat,lon,provider:'PHOTON',confidence:f.properties?.osm_value||null,updated_at:now()});return {address:display,lat,lon,provider:'PHOTON',cached:false};
  }
 }catch(e){console.log('Photon geocoder unavailable',String(e))}
 // 3) Nominatim final fallback. Failure here no longer aborts the entire setup.
 try{
  const rows=await fetchJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&addressdetails=1&q=${encodeURIComponent(a)}`,{'User-Agent':'UniversalDispatchPlatform/1.0 (white-label dispatch platform)','Accept-Language':'en-US'});
  const x=Array.isArray(rows)?rows[0]:null,lat=Number(x?.lat),lon=Number(x?.lon);
  if(x&&Number.isFinite(lat)&&Number.isFinite(lon)){
   const display=clean(x.display_name||a,500);await db.from('geocode_cache').upsert({normalized_address:n,display_address:display,lat,lon,provider:'NOMINATIM',confidence:x.importance!=null?String(x.importance):null,updated_at:now()});return {address:display,lat,lon,provider:'NOMINATIM',cached:false};
  }
 }catch(e){console.log('Nominatim geocoder unavailable',String(e))}
 return null;
}
async function createLoginSession(u:any){const t=token(),exp=new Date(Date.now()+1000*60*60*24*14).toISOString();await db.from('app_sessions').insert({token:t,user_id:u.id,role:u.role,expires_at:exp});return {token:t,expires_at:exp,user:{id:u.id,role:u.role,driver_number:u.driver_number,full_name:u.full_name,email:u.email}}}
async function nextDriverNumber(){const st=await settings();let n=Number(st?.driver_number_next||st?.driver_number_start||1001);for(let i=0;i<10000;i++,n++){const num=String(n);const {data}=await db.from('app_users').select('id').eq('driver_number',num).maybeSingle();if(!data){await db.from('company_settings').update({driver_number_next:n+1,updated_at:now()}).eq('id',st.id);return num}}throw Error('Could not allocate driver number.')}
function probableDuplicateScore(a:any,b:any){let score=0;if(norm(a.company_name)&&norm(a.company_name)===norm(b.company_name))score+=60;if(clean(a.email).toLowerCase()&&clean(a.email).toLowerCase()===clean(b.email).toLowerCase())score+=25;if(clean(a.phone).replace(/\D/g,'')&&clean(a.phone).replace(/\D/g,'')===clean(b.phone).replace(/\D/g,''))score+=20;if(norm(a.address)&&norm(a.address)===norm(b.address))score+=35;return Math.min(100,score)}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});
 if(req.method!=='POST')return out(req,{error:'POST required'},405);
 let p:any={};try{p=await req.json()}catch{return out(req,{error:'Invalid JSON'},400)}
 const action=clean(p.action,80);
 try{
  if(action==='public_status'){const st=await settings();return out(req,{ok:true,setup_completed:!!st?.setup_completed,company_name:st?.company_name||'Universal Dispatch Company',driver_chat_enabled:!!st?.driver_chat_enabled,driver_group_chat_enabled:!!st?.driver_group_chat_enabled})}
  if(action==='setup'){
   const st=await settings();if(!st)return out(req,{error:'Platform settings are missing.'},500);if(st.setup_completed)return out(req,{error:'Initial setup is already complete.'},409);
   if((await sha(clean(p.setup_code,40)))!==st.setup_code_hash)return out(req,{error:'Incorrect setup code.'},403);
   const company=clean(p.company_name,160),depotName=clean(p.depot_name,160),depotAddress=clean(p.depot_address,500),adminName=clean(p.admin_name,160),adminEmail=clean(p.admin_email,200).toLowerCase(),loginPin=clean(p.admin_login_pin,20),mgmt=clean(p.management_pin,20);
   if(!company||!depotAddress||!adminName||!adminEmail||loginPin.length<4||mgmt.length<4)return out(req,{error:'Company, depot, administrator, email, login PIN and management PIN are required.'},400);
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail))return out(req,{error:'Enter a valid administrator email address. This email is used to sign in.'},400);
   const g=await geocode(depotAddress);if(!g)return out(req,{error:'The depot address could not be automatically located. Add the street, city, state/province and ZIP/postal code, then try again.'},400);
   const ls=salt(),ms=salt(),lh=await pinHash(loginPin,ls),mh=await pinHash(mgmt,ms);
   const {data:u,error:ue}=await db.from('app_users').insert({role:'ADMIN',full_name:adminName,email:adminEmail,active:true,pending_activation:false,login_pin_hash:lh,login_pin_salt:ls,source:'INITIAL_SETUP'}).select('*').single();if(ue)throw ue;
   const primaryName=depotName||company+' Depot';
   const {error:se}=await db.from('company_settings').update({company_name:company,depot_name:primaryName,depot_address:g.address,depot_lat:g.lat,depot_lon:g.lon,management_pin_hash:mh,management_pin_salt:ms,setup_completed:true,setup_code_hash:null,updated_at:now()}).eq('id',st.id);if(se)throw se;
   await db.from('company_locations').update({is_primary:false,updated_at:now()}).eq('is_primary',true);
   const {error:le}=await db.from('company_locations').insert({name:primaryName,address:g.address,lat:g.lat,lon:g.lon,active:true,is_primary:true});if(le)throw le;
   return out(req,{ok:true,...await createLoginSession(u),company_name:company,depot:{name:primaryName,address:g.address,lat:g.lat,lon:g.lon,provider:g.provider}})
  }
  if(action==='login'){
   const kind=clean(p.kind,20).toUpperCase(),pin=clean(p.pin,20);let q:any=db.from('app_users').select('*').eq('active',true).eq('pending_activation',false);
   if(kind==='DRIVER')q=q.eq('role','DRIVER').eq('driver_number',clean(p.identifier,40));else q=q.in('role',['ADMIN','DISPATCH']).ilike('email',clean(p.identifier,200));
   const {data:u}=await q.maybeSingle();if(!u||!u.login_pin_hash||!u.login_pin_salt||(await pinHash(pin,u.login_pin_salt))!==u.login_pin_hash)return out(req,{error:'Incorrect login.'},401);
   return out(req,{ok:true,...await createLoginSession(u)})
  }
  const s=await session(req);if(!s)return out(req,{error:'Session expired. Sign in again.'},401);
  if(action==='logout'){await db.from('app_sessions').delete().eq('token',s.token);return out(req,{ok:true})}
  if(action==='me'){const st=await settings();return out(req,{ok:true,user:s.user,company:{name:st.company_name,depot_name:st.depot_name,depot_address:st.depot_address,depot_lat:st.depot_lat,depot_lon:st.depot_lon,primary_color:st.primary_color,logo_url:st.logo_url,driver_chat_enabled:st.driver_chat_enabled,driver_group_chat_enabled:st.driver_group_chat_enabled,driver_chat_retention_days:st.driver_chat_retention_days,auto_return_to_depot:st.auto_return_to_depot,default_service_minutes:st.default_service_minutes}})}
  if(action==='geocode'){if(!need(s,['ADMIN','DISPATCH']))return out(req,{error:'Office access required.'},403);const g=await geocode(clean(p.address,500));return g?out(req,{ok:true,...g}):out(req,{error:'Address could not be located.'},404)}
  if(action==='settings_update'){
   if(!need(s,['ADMIN']))return out(req,{error:'Administrator access required.'},403);const st=await settings(),patch:any={updated_at:now()};
   for(const k of ['company_name','depot_name','primary_color','logo_url'])if(p[k]!==undefined)patch[k]=clean(p[k],500);
   for(const k of ['driver_chat_enabled','driver_group_chat_enabled','auto_return_to_depot'])if(p[k]!==undefined)patch[k]=!!p[k];
   if(p.default_service_minutes!==undefined)patch.default_service_minutes=Math.max(0,Math.min(180,Math.round(Number(p.default_service_minutes)||0)));
   if(p.driver_chat_retention_days!==undefined)patch.driver_chat_retention_days=Math.max(1,Math.min(3650,Number(p.driver_chat_retention_days)||90));
   if(p.depot_address!==undefined){const g=await geocode(clean(p.depot_address,500));if(!g)return out(req,{error:'New depot address could not be located.'},400);patch.depot_address=g.address;patch.depot_lat=g.lat;patch.depot_lon=g.lon}
   if(p.management_pin){const ms=salt();patch.management_pin_salt=ms;patch.management_pin_hash=await pinHash(clean(p.management_pin,20),ms)}
   const {data,error}=await db.from('company_settings').update(patch).eq('id',st.id).select('company_name,depot_name,depot_address,depot_lat,depot_lon,primary_color,logo_url,driver_chat_enabled,driver_group_chat_enabled,driver_chat_retention_days,auto_return_to_depot,default_service_minutes').single();if(error)throw error;
   if(p.depot_address!==undefined||p.depot_name!==undefined){
    const {data:primary}=await db.from('company_locations').select('id').eq('is_primary',true).maybeSingle();
    const row={name:data.depot_name||data.company_name||'Primary Depot',address:data.depot_address,lat:data.depot_lat,lon:data.depot_lon,active:true,is_primary:true,updated_at:now()};
    if(primary?.id){const {error:pe}=await db.from('company_locations').update(row).eq('id',primary.id);if(pe)throw pe}
    else {const {error:pe}=await db.from('company_locations').insert(row);if(pe)throw pe}
   }
   return out(req,{ok:true,settings:data})
  }
  if(action==='locations_list'){
   if(!need(s,['ADMIN','DISPATCH']))return out(req,{error:'Office access required.'},403);
   const {data,error}=await db.from('company_locations').select('*').eq('active',true).order('is_primary',{ascending:false}).order('name');
   if(error)throw error;return out(req,{ok:true,locations:data||[]})
  }
  if(action==='location_save'){
   if(!need(s,['ADMIN']))return out(req,{error:'Administrator access required.'},403);
   const id=clean(p.id,60),name=clean(p.name,160),address=clean(p.address,500);
   if(!name||!address)return out(req,{error:'Location name and physical address are required.'},400);
   const g=await geocode(address);if(!g)return out(req,{error:'Location address could not be located.'},400);
   const primary=!!p.is_primary,row:any={name,address:g.address,lat:g.lat,lon:g.lon,active:true,is_primary:primary,updated_at:now()};
   if(primary){
    let q=db.from('company_locations').update({is_primary:false,updated_at:now()}).eq('is_primary',true);
    if(id)q=q.neq('id',id);
    await q;
   }
   let data,error;
   if(id)({data,error}=await db.from('company_locations').update(row).eq('id',id).select('*').single());
   else ({data,error}=await db.from('company_locations').insert(row).select('*').single());
   if(error)throw error;
   if(primary){
    const st=await settings();
    await db.from('company_settings').update({depot_name:data.name,depot_address:data.address,depot_lat:data.lat,depot_lon:data.lon,updated_at:now()}).eq('id',st.id)
   }
   return out(req,{ok:true,location:data})
  }
  if(action==='location_delete'){
   if(!need(s,['ADMIN']))return out(req,{error:'Administrator access required.'},403);
   const id=clean(p.id,60);if(!id)return out(req,{error:'Location required.'},400);
   const {data:loc}=await db.from('company_locations').select('id,is_primary').eq('id',id).maybeSingle();
   if(!loc)return out(req,{error:'Location not found.'},404);
   if(loc.is_primary)return out(req,{error:'The primary location cannot be removed. Make another location primary first.'},409);
   const {count}=await db.from('delivery_routes').select('id',{count:'exact',head:true}).eq('depot_location_id',id).in('status',['PLANNED','ACTIVE','PAUSED']);
   if((count||0)>0)return out(req,{error:'This location is used by an active or planned route and cannot be removed yet.'},409);
   const {error}=await db.from('company_locations').update({active:false,updated_at:now()}).eq('id',id);if(error)throw error;
   return out(req,{ok:true})
  }
  if(action==='drivers_list'){
   if(!need(s,['ADMIN','DISPATCH','DRIVER']))return out(req,{error:'Access denied.'},403);let q=db.from('app_users').select('id,driver_number,full_name,email,phone,active,pending_activation,messaging_enabled,vehicle_label,e2ee_public_key,e2ee_key_version,source,created_at').eq('role','DRIVER').order('driver_number');if(s.user.role==='DRIVER')q=q.eq('active',true).eq('pending_activation',false);const {data,error}=await q;if(error)throw error;return out(req,{ok:true,drivers:data||[]})
  }
  if(action==='driver_create'){
   if(!need(s,['ADMIN']))return out(req,{error:'Administrator access required.'},403);const name=clean(p.full_name,160);if(!name)return out(req,{error:'Driver name is required.'},400);const num=clean(p.driver_number,30)||await nextDriverNumber();const pin=clean(p.login_pin,20)||String(crypto.getRandomValues(new Uint32Array(1))[0]%9000+1000);const ps=salt(),ph=await pinHash(pin,ps);
   const {data,error}=await db.from('app_users').insert({role:'DRIVER',driver_number:num,full_name:name,email:clean(p.email,200)||null,phone:clean(p.phone,60)||null,active:!p.pending_activation,pending_activation:!!p.pending_activation,login_pin_hash:ph,login_pin_salt:ps,vehicle_label:clean(p.vehicle_label,100)||null,source:clean(p.source,100)||'MANUAL'}).select('id,driver_number,full_name,email,phone,active,pending_activation').single();if(error)throw error;return out(req,{ok:true,driver:data,temporary_pin:pin})
  }
  if(action==='drivers_import_commit'){
   if(!need(s,['ADMIN']))return out(req,{error:'Administrator access required.'},403);const rows=Array.isArray(p.rows)?p.rows.slice(0,1000):[];if(!rows.length)return out(req,{error:'No drivers supplied.'},400);const created:any[]=[],review:any[]=[];
   const {data:existing}=await db.from('app_users').select('id,driver_number,full_name,email,phone').eq('role','DRIVER');const ex:any[]=[...(existing||[])];
   for(const r of rows){const name=clean(r.full_name||r.name,160),email=clean(r.email,200).toLowerCase(),phone=clean(r.phone,60);if(!name){review.push({...r,reason:'Missing name'});continue}const dup=ex.find((x:any)=>(email&&clean(x.email).toLowerCase()===email)||(norm(x.full_name)===norm(name)&&phone&&clean(x.phone).replace(/\D/g,'')===phone.replace(/\D/g,'')));if(dup){review.push({...r,reason:'Possible existing driver',matched_driver_id:dup.id});continue}const num=clean(r.driver_number||r.employee_number,30)||await nextDriverNumber();const pin=String(crypto.getRandomValues(new Uint32Array(1))[0]%9000+1000),ps=salt(),ph=await pinHash(pin,ps);const {data:u,error}=await db.from('app_users').insert({role:'DRIVER',driver_number:num,full_name:name,email:email||null,phone:phone||null,active:false,pending_activation:true,login_pin_hash:ph,login_pin_salt:ps,source:'BULK_IMPORT'}).select('id,driver_number,full_name,email,phone,active,pending_activation').single();if(error){review.push({...r,reason:error.message});continue}created.push({...u,temporary_pin:pin});ex.push(u)}return out(req,{ok:true,created,review,created_count:created.length,review_count:review.length})
  }
  if(action==='driver_set_active'){if(!need(s,['ADMIN']))return out(req,{error:'Administrator access required.'},403);const id=clean(p.driver_id,60),active=!!p.active;const {error}=await db.from('app_users').update({active,pending_activation:!active,updated_at:now()}).eq('id',id).eq('role','DRIVER');if(error)throw error;return out(req,{ok:true})}
  if(action==='driver_reset_pin'){if(!need(s,['ADMIN']))return out(req,{error:'Administrator access required.'},403);const id=clean(p.driver_id,60),pin=clean(p.pin,20)||String(crypto.getRandomValues(new Uint32Array(1))[0]%9000+1000),ps=salt(),ph=await pinHash(pin,ps);const {error}=await db.from('app_users').update({login_pin_hash:ph,login_pin_salt:ps,updated_at:now()}).eq('id',id).eq('role','DRIVER');if(error)throw error;return out(req,{ok:true,temporary_pin:pin})}
  if(action==='e2ee_public_key_set'){if(s.user.role!=='DRIVER')return out(req,{error:'Driver access required.'},403);if(!p.public_key||typeof p.public_key!=='object')return out(req,{error:'Public key required.'},400);const v=Number(s.user.e2ee_key_version||0)+1;const {error}=await db.from('app_users').update({e2ee_public_key:p.public_key,e2ee_key_version:v,updated_at:now()}).eq('id',s.user.id);if(error)throw error;return out(req,{ok:true,key_version:v})}
  if(action==='entities_list'){
   if(!need(s,['ADMIN','DISPATCH']))return out(req,{error:'Office access required.'},403);const qv=clean(p.q,100),type=clean(p.entity_type,20);let query=db.from('business_entities').select('*').eq('active',true).order('company_name').limit(Math.min(500,Number(p.limit)||250));if(type)query=query.eq('entity_type',type);if(qv){const sq=qv.replace(/[,()%]/g,'');query=query.or(`company_name.ilike.%${sq}%,contact_name.ilike.%${sq}%,address.ilike.%${sq}%`)}const {data,error}=await query;if(error)throw error;return out(req,{ok:true,entities:data||[]})
  }
  if(action==='entity_save'){
   if(!need(s,['ADMIN','DISPATCH']))return out(req,{error:'Office access required.'},403);const company=clean(p.company_name,200),type=['CUSTOMER','VENDOR','BOTH','PROSPECT'].includes(clean(p.entity_type,20).toUpperCase())?clean(p.entity_type,20).toUpperCase():'CUSTOMER';if(!company)return out(req,{error:'Company name is required.'},400);let address=clean(p.address,500),lat=p.lat!=null?Number(p.lat):null,lon=p.lon!=null?Number(p.lon):null,status='REVIEW';if(address&&(!Number.isFinite(lat)||!Number.isFinite(lon))){const g=await geocode(address);if(g){address=g.address;lat=g.lat;lon=g.lon;status='VERIFIED'}else status='UNROUTABLE'}else if(Number.isFinite(lat)&&Number.isFinite(lon))status='VERIFIED';const row:any={entity_type:type,company_name:company,normalized_name:norm(company),contact_name:clean(p.contact_name,180)||null,customer_vendor_number:clean(p.customer_vendor_number,100)||null,email:clean(p.email,200)||null,phone:clean(p.phone,80)||null,address:address||null,lat:Number.isFinite(lat)?lat:null,lon:Number.isFinite(lon)?lon:null,location_status:status,source:clean(p.source,100)||'MANUAL',notes:clean(p.notes,2000)||null,updated_at:now()};let data,error;if(p.id){({data,error}=await db.from('business_entities').update(row).eq('id',clean(p.id,60)).select('*').single())}else{({data,error}=await db.from('business_entities').insert(row).select('*').single())}if(error)throw error;return out(req,{ok:true,entity:data})
  }
  if(action==='entities_import_preview'){
   if(!need(s,['ADMIN','DISPATCH']))return out(req,{error:'Office access required.'},403);const rows=Array.isArray(p.rows)?p.rows.slice(0,5000):[];const {data:existing}=await db.from('business_entities').select('id,company_name,email,phone,address,entity_type').eq('active',true).limit(10000);const preview=rows.map((r:any)=>{const a={company_name:clean(r.company_name||r.company||r.business,200),contact_name:clean(r.contact_name||r.contact||r.name,180),email:clean(r.email,200),phone:clean(r.phone,80),address:clean(r.address||r.street_address,500),entity_type:clean(r.entity_type||r.type,20).toUpperCase()||'CUSTOMER'};let best:any=null,bestScore=0;for(const e of existing||[]){const sc=probableDuplicateScore(a,e);if(sc>bestScore){bestScore=sc;best=e}}return {...a,match_score:bestScore,matched_entity:bestScore>=60?best:null,status:!a.company_name?'REVIEW':bestScore>=60?'MATCH':'NEW'}});return out(req,{ok:true,preview})
  }
  if(action==='entities_import_commit'){
   if(!need(s,['ADMIN','DISPATCH']))return out(req,{error:'Office access required.'},403);const rows=Array.isArray(p.rows)?p.rows.slice(0,500):[];let created=0,updated=0,review=0;const results:any[]=[];
   for(const r of rows){const company=clean(r.company_name||r.company,200);if(!company){review++;continue}const type=['CUSTOMER','VENDOR','BOTH','PROSPECT'].includes(clean(r.entity_type,20).toUpperCase())?clean(r.entity_type,20).toUpperCase():'CUSTOMER';const nr=norm(company);const {data:matches}=await db.from('business_entities').select('*').eq('normalized_name',nr).limit(5);const match=(matches||[])[0];let address=clean(r.address,500),lat:any=null,lon:any=null,loc='REVIEW';if(address&&p.auto_geocode!==false){const g=await geocode(address);if(g){address=g.address;lat=g.lat;lon=g.lon;loc='VERIFIED'}else loc='UNROUTABLE'}const patch:any={entity_type:type,company_name:company,normalized_name:nr,contact_name:clean(r.contact_name,180)||null,email:clean(r.email,200)||null,phone:clean(r.phone,80)||null,address:address||null,source:'DOCUMENT_IMPORT',updated_at:now()};if(lat!=null){patch.lat=lat;patch.lon=lon;patch.location_status=loc}if(match){await db.from('business_entities').update(Object.fromEntries(Object.entries(patch).filter(([_,v])=>v!==null&&v!==''))).eq('id',match.id);updated++;results.push({company_name:company,result:'UPDATED',id:match.id})}else{patch.location_status=loc;const {data:e,error}=await db.from('business_entities').insert(patch).select('id').single();if(error){review++;results.push({company_name:company,result:'REVIEW',reason:error.message})}else{created++;results.push({company_name:company,result:'CREATED',id:e.id})}}}
   return out(req,{ok:true,created,updated,review,results})
  }
  if(action==='verify_management_pin'){if(!need(s,['ADMIN','DISPATCH']))return out(req,{error:'Office access required.'},403);return (await managementOK(p.pin))?out(req,{ok:true}):out(req,{error:'Incorrect management PIN.'},403)}
  if(action==='chat_threads'){
   const st=await settings();const {data,error}=await db.from('chat_participants').select('thread_id,chat_threads(id,thread_type,name,route_id,active,created_at,updated_at)').eq('user_id',s.user.id);if(error)throw error;let threads=(data||[]).map((x:any)=>x.chat_threads).filter(Boolean);if(s.user.role!=='DRIVER')threads=threads.filter((x:any)=>x.thread_type!=='DRIVER_DIRECT'&&x.thread_type!=='DRIVER_GROUP');if(s.user.role==='DRIVER'&&!st.driver_chat_enabled)threads=threads.filter((x:any)=>x.thread_type==='DISPATCH_DRIVER');return out(req,{ok:true,threads})
  }
  if(action==='chat_dispatch_thread'){
   const driverId=s.user.role==='DRIVER'?s.user.id:clean(p.driver_id,60);if(!driverId)return out(req,{error:'Driver required.'},400);if(s.user.role!=='DRIVER'&&!need(s,['ADMIN','DISPATCH']))return out(req,{error:'Access denied.'},403);const {data:part}=await db.from('chat_participants').select('thread_id,chat_threads!inner(id,thread_type)').eq('user_id',driverId).eq('chat_threads.thread_type','DISPATCH_DRIVER');let tid=(part||[])[0]?.thread_id;if(!tid){const {data:t,error}=await db.from('chat_threads').insert({thread_type:'DISPATCH_DRIVER',name:'Dispatch',created_by:s.user.id}).select('id').single();if(error)throw error;tid=t.id;await db.from('chat_participants').insert({thread_id:tid,user_id:driverId});const {data:office}=await db.from('app_users').select('id').in('role',['ADMIN','DISPATCH']).eq('active',true);for(const u of office||[])await db.from('chat_participants').upsert({thread_id:tid,user_id:u.id})}return out(req,{ok:true,thread_id:tid})
  }
  if(action==='chat_driver_direct_open'){
   const st=await settings();if(s.user.role!=='DRIVER')return out(req,{error:'Driver access required.'},403);if(!st.driver_chat_enabled||!s.user.messaging_enabled)return out(req,{error:'Private driver messaging is disabled.'},403);const other=clean(p.driver_id,60);if(!other||other===s.user.id)return out(req,{error:'Choose another driver.'},400);const {data:o}=await db.from('app_users').select('id,full_name,driver_number,active,pending_activation,messaging_enabled,e2ee_public_key,e2ee_key_version').eq('id',other).eq('role','DRIVER').maybeSingle();if(!o?.active||o.pending_activation||!o.messaging_enabled)return out(req,{error:'That driver is not available for messaging.'},404);const {data:a}=await db.from('chat_participants').select('thread_id,chat_threads!inner(id,thread_type)').eq('user_id',s.user.id).eq('chat_threads.thread_type','DRIVER_DIRECT');let tid:any=null;for(const x of a||[]){const {data:cp}=await db.from('chat_participants').select('user_id').eq('thread_id',x.thread_id);const ids=(cp||[]).map((z:any)=>z.user_id);if(ids.length===2&&ids.includes(other)){tid=x.thread_id;break}}if(!tid){const {data:t,error}=await db.from('chat_threads').insert({thread_type:'DRIVER_DIRECT',name:null,created_by:s.user.id}).select('id').single();if(error)throw error;tid=t.id;await db.from('chat_participants').insert([{thread_id:tid,user_id:s.user.id},{thread_id:tid,user_id:other}])}return out(req,{ok:true,thread_id:tid,other_driver:o})
  }
  if(action==='chat_messages'){
   const tid=clean(p.thread_id,60);const {data:t}=await db.from('chat_threads').select('id,thread_type').eq('id',tid).maybeSingle();if(!t)return out(req,{error:'Chat not found.'},404);const {data:cp}=await db.from('chat_participants').select('user_id').eq('thread_id',tid).eq('user_id',s.user.id).maybeSingle();if(!cp)return out(req,{error:'You are not a participant in this chat.'},403);if(s.user.role!=='DRIVER'&&t.thread_type!=='DISPATCH_DRIVER')return out(req,{error:'Private driver chats are not visible to Dispatch.'},403);const {data,error}=await db.from('chat_messages').select('id,thread_id,sender_id,body_plaintext,cipher_text,cipher_iv,crypto_meta,created_at,delivered_at,read_at').eq('thread_id',tid).order('id',{ascending:false}).limit(Math.min(200,Number(p.limit)||100));if(error)throw error;return out(req,{ok:true,messages:(data||[]).reverse()})
  }
  if(action==='chat_send'){
   const tid=clean(p.thread_id,60);const {data:t}=await db.from('chat_threads').select('id,thread_type').eq('id',tid).maybeSingle();if(!t)return out(req,{error:'Chat not found.'},404);const {data:cp}=await db.from('chat_participants').select('user_id').eq('thread_id',tid).eq('user_id',s.user.id).maybeSingle();if(!cp)return out(req,{error:'You are not a participant in this chat.'},403);if(t.thread_type==='DRIVER_DIRECT'||t.thread_type==='DRIVER_GROUP'){const st=await settings();if(s.user.role!=='DRIVER'||!st.driver_chat_enabled||!s.user.messaging_enabled)return out(req,{error:'Private driver messaging is disabled.'},403);if(!p.cipher_text||!p.cipher_iv||!p.crypto_meta)return out(req,{error:'Private driver messages must be end-to-end encrypted.'},400);const {data,error}=await db.from('chat_messages').insert({thread_id:tid,sender_id:s.user.id,cipher_text:clean(p.cipher_text,20000),cipher_iv:clean(p.cipher_iv,500),crypto_meta:p.crypto_meta}).select('id,created_at').single();if(error)throw error;return out(req,{ok:true,message:data})}const body=clean(p.body,4000);if(!body)return out(req,{error:'Message is empty.'},400);const {data,error}=await db.from('chat_messages').insert({thread_id:tid,sender_id:s.user.id,body_plaintext:body}).select('id,created_at').single();if(error)throw error;return out(req,{ok:true,message:data})
  }
  if(action==='chat_report_private'){if(s.user.role!=='DRIVER')return out(req,{error:'Driver access required.'},403);const ids=Array.isArray(p.message_ids)?p.message_ids.map((x:any)=>Number(x)).filter(Number.isFinite).slice(0,50):[];if(!ids.length)return out(req,{error:'Choose at least one message to report.'},400);await db.from('delivery_events').insert({user_id:s.user.id,event_type:'PRIVATE_CHAT_REPORTED',note:`Driver reported private chat message IDs: ${ids.join(', ')}`});return out(req,{ok:true,reported_ids:ids})}
  return out(req,{error:'Unknown action.'},400)
 }catch(e){console.error(e);return out(req,{error:(e as Error)?.message||'Server error'},500)}
});
