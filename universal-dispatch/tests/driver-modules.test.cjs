'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');const base=path.resolve(__dirname,'..');
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPZkAAAAASUVORK5CYII=';
let checks=0;function eq(a,b,message){assert.deepEqual(a,b,message);checks++}function ok(a,message){assert.ok(a,message);checks++}
function context(){const {window}=parseHTML('<html><head></head><body><div id="navPanel"></div></body></html>');window.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}});window.HTMLCanvasElement.prototype.toDataURL=()=>PNG;window.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:300,height:100});let clock=Date.now(),watchFn,fixCount=0,clears=0,requests=0;const intervals=[];const navigator={geolocation:{watchPosition(fn){watchFn=fn;return 0},clearWatch(){clears++},getCurrentPosition(fn){fixCount++;fn({timestamp:clock,coords:{latitude:40,longitude:-90,accuracy:3,speed:null,heading:null}})}}};class Clock extends Date{static now(){return clock}}
 const ctx=vm.createContext({window,document:window.document,navigator,Date:Clock,console,URL,AbortController,Promise,setInterval:fn=>{intervals.push(fn);return intervals.length},clearInterval(){},setTimeout,clearTimeout});
 for(const name of ['driver-pod.js','driver-gps.js','driver-navigation.js'])vm.runInContext(fs.readFileSync(path.join(base,name),'utf8'),ctx,{filename:name});
 return {window,doc:window.document,navigator,intervals,advance:ms=>clock+=ms,emit:p=>watchFn(p),fixes:()=>fixCount,clears:()=>clears,now:()=>clock};}
(async()=>{
 const c=context(),gps=c.window.UDPDriverGPS;
 let p=gps.normalize({timestamp:c.now(),coords:{latitude:0,longitude:20,speed:null,heading:null,accuracy:4}});eq(p.speed_mps,null,'Unknown speed stays unknown');eq(p.heading,null);eq(p.lat,0,'Equator is valid');eq(gps.normalize({coords:{latitude:null,longitude:20}}),null);
 let q=gps.quality({recorded_at:new Date(c.now()).toISOString(),speed_mps:10,accuracy_m:3},c.now());eq(q.label,'LIVE');eq(q.speed_mph,22,'Meters/sec converted once');
 q=gps.quality({recorded_at:new Date(c.now()-40000).toISOString(),speed_mps:10,accuracy_m:3},c.now());eq(q.label,'DELAYED');eq(q.speed_mph,null,'Stale speed hidden');
 eq(gps.quality({recorded_at:new Date(c.now()).toISOString(),speed_mps:10,accuracy_m:150},c.now()).speed_mph,null,'Low quality speed hidden');eq(gps.quality(null).label,'NO GPS');
 const sent=[],status=[];let allowed=true;const t=gps.create({canTrack:r=>allowed&&r.status==='ACTIVE',send:async p=>sent.push(p),onStatus:s=>status.push(s)});
 eq(c.fixes(),0,'Creating tracker does not request GPS');eq(t.start({id:'r',status:'PLANNED'}),null,'Planned routes never start GPS');
 eq(t.start({id:'r',status:'ACTIVE'}),0);await c.emit({timestamp:c.now(),coords:{latitude:40,longitude:-90,speed:null,accuracy:3}});eq(sent.length,1);eq(sent[0].speed_mps,null);eq(sent[0].route_id,'r');eq(sent[0].recorded_at,new Date(c.now()).toISOString());
 c.advance(50000);c.intervals[0]();await Promise.resolve();eq(c.fixes(),1,'Active stale GPS reacquires');t.stop();eq(c.clears(),1,'Watch id zero is cleared');c.intervals[0]();eq(c.fixes(),1,'Stopped tracker never reacquires');
 const pod=c.window.UDPDriverPOD,el=x=>c.doc.getElementById('udpPod'+x),saves=[];let fail=true,finished=0;
 function open(){pod.open({stopName:'Fixture stop',save:async data=>{saves.push(data);if(fail)throw Error('Fixture network failure');return {ok:true,pod_number:1}},onSaved:async()=>finished++})}
 open();await el('Submit').onclick();eq(el('Message').textContent,'Enter who received the delivery.');eq(saves.length,0);
 el('Receiver').value='Fixture recipient';await el('Submit').onclick();eq(el('Message').textContent,'A signature or delivery photo is required.');
 const canvas=el('Signature');canvas.onpointerdown({preventDefault(){},clientX:1,clientY:1});canvas.onpointermove({preventDefault(){},clientX:10,clientY:8});canvas.onpointerup();
 await el('Submit').onclick();eq(saves.length,1);eq(el('Submit').disabled,false,'Failed save can retry');ok(el('Message').textContent.includes('network failure'));eq(saves[0].signature_data,PNG);
 fail=false;await el('Submit').onclick();eq(finished,1);eq(el('Receiver').value,'','Recipient cleared after save');
 open();eq(el('Submit').disabled,false,'New stop resets submit button');el('Receiver').value='Next recipient';await el('Submit').onclick();eq(saves.length,2,'Previous signature is not reused');
 pod.close(true);pod.view({receiver_name:'<script>bad</script>',signature_data:'data:image/svg+xml,<svg/>',photo_data:PNG,note:'Fixture note',pod_number:1});eq(el('Submit').hidden,true,'Office receipt is read only');eq(el('Receipt').querySelectorAll('script').length,0);eq(el('Receipt').querySelectorAll('img').length,1,'Unsafe image URL rejected');pod.close(true);
 const nav=c.window.UDPDriverNavigation;ok(nav.instruction({name:'Main Street',maneuver:{type:'turn',modifier:'right'}}).includes('Turn right onto Main Street'));eq(Math.round(nav.segmentDistance({lat:40,lon:-89.95},{lat:40,lon:-90},{lat:40,lon:-89.9})),0);ok(nav.distance({lat:40,lon:-90},{lat:40.001,lon:-90})>100);
 let directionReads=0,markerMoves=0;const map={setView(){return this},fitBounds(){},remove(){}};c.window.L={map:()=>map,tileLayer:()=>({addTo(){}}),polyline:()=>({addTo(){return this}}),marker:()=>({addTo(){return this},setLatLng(){markerMoves++}})};
 const directions={distance_m:250,duration_s:40,geometry:{coordinates:[[-90,40],[-89.999,40],[-89.999,40.001]]},steps:[{name:'First road',maneuver:{type:'depart'},geometry:{coordinates:[[-90,40],[-89.999,40]]}},{name:'Second road',maneuver:{type:'turn',modifier:'left'},geometry:{coordinates:[[-89.999,40],[-89.999,40.001]]}}]};
 await nav.start({name:'Fixture destination',fix:{lat:40,lon:-90},destination:{lat:40.001,lon:-89.999},request:async()=>{directionReads++;return directions}});eq(directionReads,1);
 nav.update({lat:40,lon:-89.9998,accuracy_m:3,recorded_at:new Date(c.now()).toISOString()});ok(c.doc.getElementById('udpNavInstruction').textContent.includes('Turn left'),'Moving fix advances guidance');eq(markerMoves,1);
 c.advance(25000);nav.update({lat:40.01,lon:-90.01,accuracy_m:3,recorded_at:new Date(c.now()).toISOString()});await Promise.resolve();await Promise.resolve();eq(directionReads,2,'Off-route fix recalculates directions to same stop');nav.stop();nav.update({lat:40,lon:-90});eq(directionReads,2,'Closed navigation makes no requests');
 console.log('PASS: '+checks+' driver module checks; POD validation/retry/reset, receipt safety, GPS freshness/unknown speed/recovery, navigation geometry. Fixtures only.');
})().catch(e=>{console.error(e);process.exitCode=1});
