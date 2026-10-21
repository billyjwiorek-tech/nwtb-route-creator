'use strict';
const fs = require('node:fs');
const {setTimeout: delay} = require('node:timers/promises');
const files = [
 'delivery-live.html','delivery-standard.html','office-driver-preview.html','office-driver-qr.js','driver-gps-qr.svg','driver-live.html','driver-standard.html',
 'dispatch-native.html','dispatch-live.html','dispatch.html','dispatch-route-admin-native.js',
 'tracker-live.html','tracker-live-core.html','tracker-gps-status.js','tracker-driver-status.js','office-map-live.mjs','supabase/functions/nwtb-office-map/policy.mjs','unified-search.js','custom-master-search.js','custom-stop.js',
 'office-pause-alerts.js','nwtb-driver-sw.js','driver-chat-live.js','dispatch-chat-live.js','tracker-driver-presence.js','tracker-live-van.js','tracker-route-filter.js','tracker-active-route-guard.js','driver-tracking-engine-native.js','driver-navigation-native.js','driver-voice-live.js','driver-phone-push.js','dispatch-driver-tools.js','dispatch-tools-hub-live.js','driver-gps.webmanifest','driver-standard.webmanifest'
];
async function main(){
 const expected = new Map(files.map(path => [path, fs.readFileSync(path,'utf8')]));
 let pending = [...files];
 for(let attempt=1; attempt<=24 && pending.length; attempt++){
  const results = await Promise.all(pending.map(async path => {
   try{
    const url = new URL(path,'https://billyjwiorek-tech.github.io/nwtb-route-creator/');
    url.searchParams.set('verify',process.env.GITHUB_SHA || 'returnleg1');
    url.searchParams.set('attempt',String(attempt));
    const response = await fetch(url,{cache:'no-store',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(15000)});
    return {path,match:response.ok && (await response.text())===expected.get(path)};
   }catch{return {path,match:false}}
  }));
  pending = results.filter(x=>!x.match).map(x=>x.path);
  console.log('Production bytes attempt '+attempt+': '+(files.length-pending.length)+'/'+files.length+' match checked-out commit.');
  if(pending.length && attempt<24) await delay(15000);
 }
 if(pending.length) throw Error('Production assets did not match: '+pending.join(', '));
 console.log('Verified all public Office, Dispatch, tracker and Driver assets for '+process.env.GITHUB_SHA);
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
