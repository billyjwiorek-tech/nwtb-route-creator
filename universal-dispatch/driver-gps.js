(function(root){
'use strict';
const finite=(v,min=-Infinity,max=Infinity)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):null;
function normalize(p){const c=p?.coords||{},lat=finite(c.latitude,-90,90),lon=finite(c.longitude,-180,180);if(lat===null||lon===null)return null;const time=finite(p.timestamp,1)||Date.now();return {lat,lon,accuracy_m:finite(c.accuracy,0,100000),speed_mps:finite(c.speed,0,100),heading:finite(c.heading,0,360),recorded_at:new Date(time).toISOString()}}
function quality(location,now=Date.now(),paused=false){const time=location?.recorded_at?new Date(location.recorded_at).getTime():NaN,age=Number.isFinite(time)?Math.max(0,Math.floor((now-time)/1000)):null;const label=paused?'PAUSED':age===null?'NO GPS':age<=20?'LIVE':age<=90?'DELAYED':'NO RECENT FIX',speed=finite(location?.speed_mps,0,100),accuracy=finite(location?.accuracy_m,0,100000),usable=!paused&&age!==null&&age<=20&&accuracy!==null&&accuracy<=75;return {label,age,speed_mph:usable&&speed!==null?Math.round(speed*2.2369362921):null,speed_label:usable&&speed!==null?'GPS speed ≈ '+Math.round(speed*2.2369362921)+' mph':'GPS speed unavailable',accuracy_m:accuracy}}
function create(config){
 let watch=null,health=null,active=null,epoch=0,lastFix=0,lastSend=0,busy=false,wake=null,recovering=false;
 const status=t=>config.onStatus?.(t);
 function allowed(){return active&&config.canTrack(active)}
 async function wakeScreen(){try{if(allowed()&&document.visibilityState==='visible'&&navigator.wakeLock&&(!wake||wake.released)){const version=epoch,lock=await navigator.wakeLock.request('screen');if(version!==epoch||!allowed())await lock.release();else wake=lock}}catch{}}
 function stop(){epoch++;if(watch!==null)navigator.geolocation?.clearWatch(watch);if(health!==null)clearInterval(health);watch=null;health=null;active=null;lastFix=0;lastSend=0;busy=false;recovering=false;try{wake?.release()}catch{}wake=null;config.onStop?.();}
 async function fix(position){if(!allowed())return;const data=normalize(position);if(!data)return;lastFix=Date.now();config.onFix?.(data);if(busy||Date.now()-lastSend<3000)return;const version=epoch,routeId=active.id;lastSend=Date.now();busy=true;try{await config.send({...data,route_id:routeId,source:'WEB_DRIVER'});if(version===epoch&&allowed())status('LIVE GPS • last fix '+new Date(data.recorded_at).toLocaleTimeString())}catch(e){if(version!==epoch)return;if(e.status===401||e.status===409){stop();status('GPS stopped. Sign in or refresh your route.')}else status('GPS upload delayed. Check your connection.')}finally{if(version===epoch)busy=false}}
 function error(e){if(!allowed())return;status(e?.code===1?'Location permission is blocked.':'GPS delayed — waiting for a new location.')}
 function recover(){if(!allowed()||recovering)return;recovering=true;navigator.geolocation?.getCurrentPosition(p=>{recovering=false;fix(p)},e=>{recovering=false;error(e)},{enableHighAccuracy:true,maximumAge:0,timeout:12000})}
 function start(route){if(!config.canTrack(route))return null;if(active?.id===route.id&&watch!==null)return watch;stop();active=route;epoch++;if(!navigator.geolocation){status('GPS is unavailable on this device.');return null}watch=navigator.geolocation.watchPosition(fix,error,{enableHighAccuracy:true,maximumAge:2000,timeout:15000});health=setInterval(()=>{if(!allowed()){stop();return}if(!lastFix||Date.now()-lastFix>45000){status('GPS delayed — requesting a fresh location.');recover()}},15000);wakeScreen();return watch}
 document.addEventListener('visibilitychange',()=>{if(!allowed())return;if(document.visibilityState==='visible'){wakeScreen();recover()}else{try{wake?.release()}catch{}wake=null}});
 root.addEventListener('online',()=>{if(allowed())recover()});
 return {start,stop,recover};
}
root.UDPDriverGPS={normalize,quality,create};
})(window);
