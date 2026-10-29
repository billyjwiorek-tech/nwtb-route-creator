'use strict';
// Real Driver page and navigation + real provider adapter; every provider response is synthetic.
const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {fixture,settle}=require('./driver-map-lifecycle.test.cjs');
const root=require('node:path').resolve(__dirname,'..');
let checks=0;const eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++};
async function scenario({original=false,ios=false,android=false}={}){
 let source=original?execFileSync('git',['show','13f4982c1b88ed50d1fa97914fe60ef885d2788b:driver-navigation-native.js'],{cwd:root,encoding:'utf8'}):fs.readFileSync(root+'/driver-navigation-native.js','utf8');
 const end=source.lastIndexOf('})();');
 source=source.slice(0,end)+"window.__trafficAudit=()=>{navLastTrafficCheck=Date.now()-TRAFFIC_REFRESH_MS;if(typeof navLastRouteChange!=='undefined')navLastRouteChange=Date.now()-600000;return trafficRefresh(navLastFix.pos)};"+source.slice(end);
 const f=fixture({ios,android,navigationSource:source});Object.defineProperty(f.document,'visibilityState',{value:'visible',writable:true,configurable:true});
 f.data.stops.forEach(s=>s.status='DELIVERED');Object.assign(f.data.route,{status:'ACTIVE',returning_started_at:'2026-10-29T12:00:00Z',end_name:'Synthetic return depot',end_lat:41.70,end_lon:-88.04});
 const {calculateRoute,reviewedReference}=await import('../supabase/functions/nwtb-driver-navigation/routing.mjs');
 const {providerRoute}=await import('./driver-traffic-fixtures.mjs');
 const base=f.window.fetch,requests=[];let fail=false,hold=null;
 f.window.fetch=async(url,init)=>{if(!String(url).endsWith('/nwtb-driver-navigation'))return base(url,init);
  const input=JSON.parse(init.body);requests.push(input);if(fail)return f.response({error:'Synthetic traffic unavailable'},503);
  const data=await calculateRoute({origin:input.origin,destination:input.destination,heading:input.heading,reference:reviewedReference(input.reference,input.origin,input.destination),providerKey:'fixture-only-key',clock:()=>f.ctx.Date.now(),fetcher:async()=>f.response({routes:input.reference?[providerRoute(),providerRoute({west:true,seconds:599})]:[providerRoute({west:requests.length%2===0,seconds:requests.length%2===0?599:600})]})});
  if(hold){const pending=hold;hold=null;await pending();}return f.response(data);
 };
 await f.open();await f.begin();return {f,requests,fail:v=>fail=v,hold:fn=>hold=fn,refresh:()=>f.window.__trafficAudit(),turn:()=>f.document.getElementById('nwtbTurn').textContent};
}
async function proveOriginal(){const s=await scenario({original:true,ios:true}),turns=[s.turn()];await s.refresh();turns.push(s.turn());await s.refresh();turns.push(s.turn());assert.ok(turns[0].includes('east')&&turns[1].includes('west')&&turns[2].includes('east'));s.f.window.nwtbStopNavigation();console.log('REPRODUCED original return-route oscillation with one-second ETA changes: '+turns.join(' -> ')+'. Synthetic directions only; not a replay of Roy’s trip.');}
async function stableReturn(){for(const device of [{ios:true},{android:true}]){
 const s=await scenario(device),start=s.turn();await s.refresh();eq(s.turn(),start,'One-second improvement keeps the current road direction');await s.refresh();eq(s.turn(),start,'Repeated estimates do not reverse return directions');eq(s.requests[0].heading,90,'Fresh moving GPS heading reaches the request');eq(s.requests[0].purpose,'initial');eq(s.requests[1].purpose,'traffic');assert.ok(s.requests[1].reference.geometry.length>=2);checks++;
 const screen=s.f.window.nwtbNavigationScreenState();eq(screen.routing.source,'TOMTOM');eq(screen.routing.decision,'ROUTE_RETAINED');eq(screen.target.final,true,'The assigned return depot remains the target');eq(s.f.data.route.status,'ACTIVE','Navigation does not finish the return');
 const count=s.requests.length;s.f.document.visibilityState='hidden';await s.refresh();eq(s.requests.length,count,'Background page does not reassess traffic');s.f.document.visibilityState='visible';
 s.f.window.nwtbPodScreenState=()=>({pod_phase:'OPEN'});await s.refresh();eq(s.requests.length,count,'POD entry does not keep recalculating directions');delete s.f.window.nwtbPodScreenState;
 s.fail(true);await s.refresh();eq(s.turn(),start,'A failed traffic check preserves the road path');assert.ok(s.f.document.getElementById('nwtbNavMode').textContent.includes('NO LIVE TRAFFIC'));checks++;eq(s.f.window.nwtbNavigationScreenState().routing.source,'TOMTOM','Old calculation remains explicitly timestamped');
 s.fail(false);let release;s.hold(()=>new Promise(r=>release=r));const pending=s.refresh();await settle();s.f.window.nwtbStopNavigation();release?.();await pending;eq(s.f.private.target,null,'Late traffic reply cannot restart stopped navigation');
 eq(s.f.local.get('nwtb_delivery_token'),'fixture-office-token');eq(s.f.local.get('nwtb_driver_token'),'fixture-driver-token');eq(s.f.requests.filter(r=>['route_start_driver','route_return_driver','stop_status_driver'].includes(r.body.action)).length,0,'Stability checks make no route or delivery mutations');
}}
async function referenceGpsJitter(){
 const s=await scenario({android:true}),{f}=s;
 f.private.receiveNavFix({timestamp:f.ctx.Date.now(),coords:{latitude:41.6902,longitude:-88.058,accuracy:25,speed:4,heading:90}});
 await s.refresh();const first=s.requests.at(-1).reference.geometry[0];assert.ok(Math.abs(first[1]-41.69)<1e-7,'Remaining reference stays on the chosen road when GPS drifts toward a parallel road');checks++;f.window.nwtbStopNavigation();
}
async function betweenPolylinePoints(){
 const s=await scenario({android:true}),{f}=s;
 f.private.applyRoute({source:'TOMTOM',traffic_aware:true,distance_m:3000,duration_s:600,geometry:[[-88.06,41.69],[-88.04,41.69],[-88.04,41.70]],steps:[
  {point_index:0,maneuver:{type:'depart',location:[-88.06,41.69]},distance_m:1000,duration_s:200},
  {point_index:0,instruction_text:'Turn at the synthetic mid-segment junction',maneuver:{type:'turn',location:[-88.05,41.69]},distance_m:2000,duration_s:400},
  {point_index:2,maneuver:{type:'arrive',location:[-88.04,41.70]},distance_m:0,duration_s:0}
 ]},{lat:41.69,lon:-88.06});
 eq(s.turn(),'Turn at the synthetic mid-segment junction','A TomTom maneuver between polyline points is not skipped at the preceding point');f.window.nwtbStopNavigation();
}
async function offRoute(){const s=await scenario({android:true}),{f}=s,start=s.requests.length;
 const emit=async()=>{for(const cb of [...f.watches.values()])cb({timestamp:f.ctx.Date.now(),coords:{latitude:41.685,longitude:-88.09,accuracy:3,speed:8,heading:270}});await settle();};
 await f.tick(15000);await f.tick(15000);await emit();eq(s.requests.length,start,'One good off-route fix does not reverse guidance');await f.tick(4000);await emit();eq(s.requests.length,start,'Two good fixes still wait for confirmation');await f.tick(4000);await emit();eq(s.requests.length,start+1,'Three consistent fixes over eight seconds permit a new route');eq(s.requests.at(-1).purpose,'off_route');eq(s.requests.at(-1).heading,270);f.window.nwtbStopNavigation();}
(async()=>{if(process.argv.includes('--prove-original'))return proveOriginal();await stableReturn();await referenceGpsJitter();await betweenPolylinePoints();await offRoute();console.log('PASS: '+checks+' iPhone/Android return-route stability, reference-route timing, heading, POD/background pause, off-route confirmation, late-response and session-isolation checks. Offline fixtures only.');})().catch(e=>{console.error(e);process.exitCode=1});
