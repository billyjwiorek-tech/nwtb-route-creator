(function(root){
'use strict';
const driverView=()=>new URLSearchParams(location.search).get('view')==='driver';
const key=()=>driverView()?'udp_driver_session':'udp_office_session';
async function digest(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('')}
async function cacheKey(token,url,payload){return 'udp_read_v3:'+await digest(token+'|'+url+'|'+JSON.stringify(payload))}
async function readThrough(token,url,payload,load,enabled){
 const k=enabled&&token?await cacheKey(token,url,payload):null;
 try{const j=await load();if(k){try{localStorage.setItem(k,JSON.stringify({at:Date.now(),data:j}))}catch{}}return j}
 catch(e){if(!k||e.status||!(e instanceof TypeError)&&navigator.onLine!==false)throw e;
  let saved;try{saved=JSON.parse(localStorage.getItem(k)||'null')}catch{}
  if(!saved||Date.now()-saved.at>6*60*60*1000)throw e;
  const j=JSON.parse(JSON.stringify(saved.data));
  if(Array.isArray(j.routes))j.routes=j.routes.filter(r=>['ACTIVE','PAUSED'].includes(r.status));
  if(j.route&&!['ACTIVE','PAUSED'].includes(j.route.status))throw Error('Reconnect to verify that Dispatch has released this planned route.');
  return {...j,offline:true};
 }
}
root.UDPSessions={isDriverView:driverView,key,get:()=>localStorage.getItem(key())||'',set:t=>localStorage.setItem(key(),t),clear:()=>localStorage.removeItem(key()),readThrough};
})(window);
