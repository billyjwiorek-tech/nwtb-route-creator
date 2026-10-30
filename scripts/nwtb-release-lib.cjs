'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const digest=value=>createHash('sha256').update(value).digest('hex');
const roots=['delivery-live.html','delivery-standard.html','driver-live.html','driver-standard.html'];
const redirects={
 'driver.html':'driver-live.html','driver-v2.html':'driver-live.html',
 'driver-native-gps-next.html':'driver-live.html','driver-native-standard-next.html':'driver-standard.html',
 'delivery.html':'delivery-live.html','delivery-v2.html':'delivery-live.html',
 'delivery-gps-native-next.html':'delivery-live.html','delivery-standard-native-next.html':'delivery-standard.html',
 'dispatch.html':'dispatch-native.html','dispatch-v2.html':'dispatch-native.html','dispatch-native-next.html':'dispatch-native.html',
 'tracker.html':'tracker-live.html','driver-supervisor-live.html':'delivery-live.html'
};
function embedded(text){const result=[text];for(const m of text.matchAll(/['"]([A-Za-z0-9+/=]{500,})['"]/g)){const value=Buffer.from(m[1],'base64').toString('utf8');if(value.includes('<script')&&value.includes('<html'))result.push(value);}return result;}
function inventory(root){
 const pending=[...roots,...Object.keys(redirects),'nwtb-driver-sw.js'],seen=new Set();
 while(pending.length){const file=pending.shift();if(seen.has(file))continue;if(!fs.existsSync(path.join(root,file)))throw Error('Missing client asset: '+file);seen.add(file);
  if(!/\.(?:html|js|mjs|webmanifest)$/.test(file))continue;
  for(const text of embedded(fs.readFileSync(path.join(root,file),'utf8')))for(const m of text.matchAll(/["'](?:\.\/)?((?:vendor\/)?[A-Za-z0-9_.-]+\.(?:js|mjs|html|css|svg|webmanifest))(?:[?#][^"']*)?["']/g)){
   if(!fs.existsSync(path.join(root,m[1])))throw Error('Missing reference from '+file+': '+m[1]);pending.push(m[1]);
  }
 }
 return [...seen].sort();
}
function publicIssues(text){
 const issues=[];
 if(/(?:\b[A-Za-z_]*[Pp][Ii][Nn][A-Za-z_]*\b)\s*(?:=|:)\s*['"]\d{4}['"]/.test(text))issues.push('Public PIN literal');
 if(/(?:\bpin\b|\bPIN\b)[^\n]{0,100}(?:===|!==|==|!=)\s*['"]\d{4}['"]/.test(text)||/\bPIN\s+(?:<[^>]+>\s*)?\d{4}\b/.test(text))issues.push('Public PIN literal');
 if(/sb_secret_[A-Za-z0-9_-]{10,}/.test(text)||/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))issues.push('Private credential in public asset');
 for(const m of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+\b/g))try{if(JSON.parse(Buffer.from(m[1],'base64url')).role==='service_role')issues.push('Service-role key in public asset');}catch{}
 if(/xlsx@0\.(?:1[0-9]|20\.[01])(?:[./@-])/.test(text))issues.push('Affected spreadsheet reader');
 return [...new Set(issues)];
}
function sourceInventory(root,manifest){
 const issues=[];for(const [slug,entry]of Object.entries(manifest.functions))for(const [file,sha]of Object.entries(entry.files)){
  if(!file.startsWith('supabase/functions/')||file.includes('..')){issues.push('Invalid source path: '+slug);continue;}
  if(!fs.existsSync(path.join(root,file))){issues.push('Missing function source: '+file);continue;}
  const source=fs.readFileSync(path.join(root,file));if(digest(source)!==sha)issues.push('Function source changed without inventory update: '+file);
  for(const m of source.toString().matchAll(/npm:@supabase\/supabase-js@([^'"\s]+)/g))if(m[1]!=='2.95.0')issues.push('Unreviewed Supabase dependency: '+file);
 }return issues;
}
module.exports={digest,roots,redirects,embedded,inventory,publicIssues,sourceInventory};
