/* Odds Reader Cloud: end-to-end encrypted, passwordless recovery-key sync.
 * Private Vercel Blob store. Server receives ONLY random opaque account id and AES-GCM ciphertext.
 * Recovery keys and provider API keys are never sent to this endpoint.
 */
const {list,get,put}=require('@vercel/blob');
const {randomBytes}=require('node:crypto');
const PREFIX='odds-reader-cloud/v1/';
function reply(res,code,obj){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');return res.status(code).json(obj)}
function validId(s){return typeof s==='string'&&/^[a-f0-9]{64}$/.test(s)}
function validEncrypted(b){
 return b&&b.version===1&&typeof b.iv==='string'&&/^[A-Za-z0-9_-]{16,32}$/.test(b.iv)&&
 typeof b.data==='string'&&b.data.length>=20&&b.data.length<=450000&&/^[A-Za-z0-9_-]+$/.test(b.data);
}
module.exports=async function(req,res){
 if(req.method!=='POST')return reply(res,405,{error:'POST required'});
 if(!process.env.BLOB_READ_WRITE_TOKEN&&!process.env.VERCEL_OIDC_TOKEN)return reply(res,503,{error:'Cloud storage not configured yet'});
 const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{};
 if(!validId(body.id))return reply(res,400,{error:'Invalid sync account identifier'});
 if(!['pull','push'].includes(body.op))return reply(res,400,{error:'Invalid sync operation'});
 const prefix=PREFIX+body.id+'/';
 try{
  if(body.op==='pull'){
   const found=await list({prefix,limit:1000});
   const items=(found.blobs||[]).slice().sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt)).slice(0,5);
   const snapshots=[];
   for(const item of items){
    const result=await get(item.pathname,{access:'private'});
    if(!result||result.statusCode!==200||!result.stream)continue;
    const raw=await new Response(result.stream).text();
    if(raw.length>500000)continue;
    let encrypted;
    try{encrypted=JSON.parse(raw)}catch(e){continue}
    if(validEncrypted(encrypted))snapshots.push({encrypted,createdAt:item.uploadedAt,ref:item.pathname.split('/').pop()});
   }
   return reply(res,200,{snapshots,stored:found.blobs?.length||0,syncedAt:new Date().toISOString()});
  }
  if(!validEncrypted(body.encrypted))return reply(res,400,{error:'Invalid or oversized encrypted backup'});
  const path=prefix+new Date().toISOString().replace(/\D/g,'')+'-'+randomBytes(9).toString('hex')+'.json';
  await put(path,JSON.stringify(body.encrypted),{access:'private',addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60});
  return reply(res,200,{saved:true,syncedAt:new Date().toISOString()});
 }catch(e){
  return reply(res,502,{error:'Private cloud sync temporarily unavailable. Please retry; local data is unchanged.'});
 }
};