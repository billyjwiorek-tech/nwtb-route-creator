'use strict';
// Actual navigation + voice modules, simulated GPS and silent speech output. No production calls.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const original=process.argv.includes('--prove-original');
const source=name=>original?require('node:child_process').execFileSync('git',['show','43dc5492174ae7aa042c94fb0369287e17268d2f:'+name],{cwd:root,encoding:'utf8'}):read(name);
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve()};
let checks=0;const eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++},ok=(value,message)=>{assert.ok(value,message);checks++};
const turn={lat:41.70,lon:-88.04},destination={lat:41.72,lon:-88.04,name:'Fixture depot',final:true};
const before=(meters,p=turn)=>({lat:p.lat-meters/111195,lon:p.lon});
const step=(p=turn,text='Turn right onto Fixture Road')=>({instruction_text:text,maneuver:{type:'turn',modifier:'right',location:[p.lon,p.lat]}});
const itinerary=(steps=[step()])=>({steps,geometry:[[turn.lon,turn.lat],[destination.lon,destination.lat]],duration_s:600,distance_m:2000,traffic_aware:true,source:'fixture'});
function fixture({helper=true,supported=true}={}){
 const {window:dom}=parseHTML('<html><head></head><body><button id="start">START ROUTE</button><div id="routes"></div></body></html>'),document=dom.document;
 const spoken=[],requests=[],timers=new Map();let now=1800000000000,id=0,visibility='visible',failOnce=false;
 Object.defineProperty(document,'visibilityState',{get:()=>visibility});
 const schedule=(fn,ms,interval=false)=>{const n=++id;timers.set(n,{fn,ms:Math.max(1,ms||1),at:now+Math.max(1,ms||1),interval});return n};
 async function tick(ms){const end=now+ms;await settle();for(let count=0;count<5000;count++){let next;for(const item of timers)if(item[1].at<=end&&(!next||item[1].at<next[1].at))next=item;if(!next)break;const [n,t]=next;now=t.at;if(t.interval)t.at+=t.ms;else timers.delete(n);await t.fn();await settle()}now=end;await settle()}
 class Clock extends Date{static now(){return now}}
 class Utterance{constructor(text){this.text=text}}
 const speech={speaking:false,pending:false,getVoices:()=>[{name:'Fixture English',lang:'en-US'}],addEventListener(){},cancel(){},resume(){},speak(utterance){if(failOnce){failOnce=false;throw Error('Fixture speech temporarily unavailable')}spoken.push(utterance.text)}};
 const navigator={geolocation:{getCurrentPosition(){},watchPosition(){return 0},clearWatch(){}}};
 const window={document,navigator,openRoute:async()=>{},addEventListener:document.addEventListener.bind(document)};
 if(supported)window.speechSynthesis=speech;
 const context=vm.createContext({window,document,navigator,console,Date:Clock,Map,Set,CustomEvent:dom.CustomEvent,MutationObserver:dom.MutationObserver,SpeechSynthesisUtterance:Utterance,speechSynthesis:speech,setTimeout:(f,m)=>schedule(f,m),setInterval:(f,m)=>schedule(f,m,true),clearTimeout:n=>timers.delete(n),clearInterval:n=>timers.delete(n),KEY:'fixture-publishable',token:'fixture-driver',route:'fixture-route',fetch:async(...args)=>{requests.push(args);throw Error('Unexpected fixture request')},post:async()=>{throw Error('Unexpected fixture route action')},alert:message=>{throw Error(message)}});
 let nav=source('driver-navigation-native.js'),last=nav.lastIndexOf('})();');
 nav=nav.slice(0,last)+'window.__voiceTest={beginNavigation,applyRoute,updateDisplay};'+nav.slice(last);
 vm.runInContext(nav,context,{filename:'driver-navigation-native.js'});
 if(helper)vm.runInContext(source('driver-voice-live.js'),context,{filename:'driver-voice-live.js'});
 return {window,document,spoken,requests,tick,async start(target=destination){if(helper){const keep=spoken.length;document.getElementById('start').dispatchEvent(new dom.Event('pointerup',{bubbles:true}));spoken.splice(keep)}await window.__voiceTest.beginNavigation(target,'fixture-route');await tick(150)},async route(data=itinerary(),pos=before(150),announce=true){window.__voiceTest.applyRoute(data,pos,announce);await settle()},async move(pos){window.__voiceTest.updateDisplay(pos,false,{accuracy:3,speed:4});await settle()},async repeat(){const button=document.querySelector('.navVoice');if(!button.dataset.fixtureClick){button.dataset.fixtureClick='1';button.addEventListener('click',()=>window.nwtbRepeatTurn())}for(const type of ['pointerup','touchend','click'])button.dispatchEvent(new dom.Event(type,{bubbles:true,cancelable:true}));await tick(1000)},async resume(){visibility='hidden';document.dispatchEvent(new dom.Event('visibilitychange'));visibility='visible';document.dispatchEvent(new dom.Event('visibilitychange'));document.dispatchEvent(new dom.Event('pageshow'));await tick(1000)},failSpeechOnce(){failOnce=true}};
}
async function proveOriginal(){const f=fixture();await f.start();await f.route();await f.tick(1000);for(let i=0;i<3;i++){await f.move(before(150));await f.tick(13000)}ok(f.spoken.filter(t=>t.includes('Turn right onto Fixture Road')).length>2,'Original repeats one stationary maneuver automatically');const arrival=fixture();await arrival.start();await arrival.route(itinerary([{maneuver:{type:'arrive',location:[destination.lon,destination.lat]}}]),destination);for(let i=0;i<3;i++)await arrival.move(destination);ok(arrival.spoken.filter(t=>/arrived/i.test(t)).length>1,'Original return arrival loops between turn and arrival speech');console.log('CONFIRMED original voice defects: repeated stationary turn announcements and repeated depot-arrival announcements.');}
async function guidance(){
 const f=fixture();await f.start();await f.route();await f.tick(1000);eq(f.spoken,['Turn right onto Fixture Road'],'One automatic advance cue from the actual navigation module');
 for(let i=0;i<25;i++){await f.move(before(150-i));await f.tick(1000)}eq(f.spoken.length,1,'GPS and distance text updates never repeat the current advance cue');
 await f.tick(90000);await f.route(itinerary(),before(100),false);eq(f.spoken.length,1,'Traffic refresh retains spoken maneuver progress');
 const shifted={lat:turn.lat+0.00002,lon:turn.lon};await f.route(itinerary([step(shifted)]),before(100),true);eq(f.spoken.length,1,'Minor reroute coordinate changes do not reannounce the same junction');
 await f.move(before(38));eq(f.spoken.at(-1),'Now, Turn right onto Fixture Road','One final cue close to the turn');eq(f.spoken.length,2);
 for(const meters of [48,40,55,39,46,37])await f.move(before(meters));eq(f.spoken.length,2,'GPS jitter cannot alternate advance and NOW speech');
 await f.resume();eq(f.spoken.length,2,'Returning to the app resumes speech support without repeating the current instruction');
 await f.repeat();eq(f.spoken.length,3,'One physical Repeat tap, including pointer/touch/click, produces one announcement');await f.repeat();eq(f.spoken.length,4,'Driver can deliberately repeat the same turn again');
 await f.move(before(38));eq(f.spoken.length,4,'Manual repeats do not reset automatic turn progress');
 f.window.nwtbStopNavigation();await f.resume();await f.tick(20000);eq(f.spoken.length,4,'Ended navigation cannot trigger a delayed fallback announcement');eq(f.requests.length,0,'Voice checks never contact production');
 const fresh=fixture();await fresh.start();await fresh.route(itinerary(),before(38));eq(fresh.spoken,['Now, Turn right onto Fixture Road'],'Starting close to a turn speaks only the current cue');await fresh.move(before(70));eq(fresh.spoken.length,1,'Moving back out of NOW range does not replay an earlier phase');
 const two=fixture(),next={lat:41.71,lon:-88.04};await two.start();await two.route(itinerary([step(),step(next)]));await two.move(before(20));await two.move(before(150,next));eq(two.spoken,['Turn right onto Fixture Road','Turn right onto Fixture Road'],'Identical words at a different junction remain separate legitimate turns');
 await two.start({...destination,name:'Next assigned stop',stop_id:'fixture-next'});two.window.nwtbRepeatTurn();eq(two.spoken.length,2,'Waiting for the next destination cannot repeat the previous turn');await two.route();eq(two.spoken.filter(t=>t==='Turn right onto Fixture Road').length,3,'A new destination receives its own guidance');
 const retry=fixture();await retry.start();retry.failSpeechOnce();await retry.route();eq(retry.spoken.length,0);await retry.move(before(150));await retry.move(before(149));eq(retry.spoken,['Turn right onto Fixture Road'],'Failed speech can recover once without becoming a repeating loop');
 const fallback=fixture({helper:false});await fallback.start();await fallback.route();await fallback.move(before(150));eq(fallback.spoken,['Turn right onto Fixture Road'],'Navigation still speaks once if the optional voice transport does not load');
 const unavailable=fixture({supported:false});await unavailable.start();await unavailable.route();await unavailable.move(before(150));eq(unavailable.spoken.length,0);eq(unavailable.document.getElementById('nwtbTurn').textContent,'Turn right onto Fixture Road','Visual directions still work without speech support');
}
async function arrival(){
 const final=fixture();await final.start();await final.route(itinerary([{maneuver:{type:'arrive',location:[destination.lon,destination.lat]}}]),destination);for(let i=0;i<20;i++){await final.move(destination);await final.tick(1000)}await final.move(before(40,destination));await final.move(destination);eq(final.spoken,['You have arrived at Fixture depot'],'Depot arrival is spoken once and never alternates with turn prompts');
 const stop=fixture(),target={...destination,name:'Fixture delivery',stop_id:'fixture-stop'};await stop.start(target);await stop.route(itinerary([{maneuver:{type:'arrive',location:[destination.lon,destination.lat]}}]),target);for(let i=0;i<20;i++){await stop.move(target);await stop.tick(1000)}eq(stop.spoken,['You have arrived at Fixture delivery. Complete the stop to start directions to the next stop.'],'Delivery arrival is announced once while awaiting completion');ok(stop.document.getElementById('nwtbArrival').classList.contains('show'),'Existing arrival and POD handoff remains available');eq(stop.requests.length,0,'Arrival speech never completes or starts a real stop or route');
}
function wiring(){const html=read('driver-live.html'),sw=read('nwtb-driver-sw.js');for(const file of ['driver-navigation-native.js','driver-voice-live.js']){ok(html.includes(file+'?v='+(file==='driver-navigation-native.js'?'20261021-progress1':'20261021-voice1')),'GPS Driver loads current '+file);ok(sw.includes('./'+file+'?v='+(file==='driver-navigation-native.js'?'20261021-progress1':'20261021-voice1')),'Offline Driver shell caches current '+file);new vm.Script(read(file),{filename:file})}ok(!read('driver-standard.html').includes('driver-navigation-native.js'),'Standard Driver keeps its existing edition');}
(async()=>{if(original){await proveOriginal();return}wiring();await guidance();await arrival();console.log('PASS: '+checks+' Driver voice checks; turn phases, GPS jitter, traffic/reroute refresh, manual repeats, arrival, cancellation and speech recovery. Fixtures only.');})().catch(error=>{console.error(error);process.exitCode=1});
