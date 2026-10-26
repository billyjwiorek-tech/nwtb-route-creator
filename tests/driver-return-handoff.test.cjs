'use strict';
// Real navigation/voice code, synthetic post-delivery return leg and GPS. No production requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {fixture,settle}=require('./driver-map-lifecycle.test.cjs');
const root=path.resolve(__dirname,'..'),original=process.argv.includes('--prove-original');
function speech(f){const utterances=[],spoken=[];f.ctx.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};const api={getVoices:()=>[],addEventListener(){},resume(){},cancel(){},speak(u){utterances.push(u);if(!api.hold){u.onstart?.();spoken.push(u.text);queueMicrotask(()=>u.onend?.());}}};f.window.speechSynthesis=api;f.ctx.speechSynthesis=api;f.load('driver-voice-live.js');f.window.nwtbPrimeVoice(false);return {api,spoken,utterances};}
async function skippedTurn(){
 const source=original?execFileSync('git',['show','cc020f414909008e36ae6fa8d7c8394fcbf6659c:driver-navigation-native.js'],{cwd:root,encoding:'utf8'}):null;
 const f=fixture({android:true,navigationSource:source}),voice=speech(f);await f.open();
 const A={lat:41.69,lon:-88.06},B={lat:41.69,lon:-88.05},C={lat:41.70,lon:-88.05},D={lat:41.70,lon:-88.06};
 await f.private.beginNavigation({...D,name:'Fixture return depot',final:true},f.data.route.id);await settle();
 const geometry=[A,B,C,D].map(p=>[p.lon,p.lat]),steps=[{name:'Return road',maneuver:{type:'depart',location:geometry[0]}},{name:'Second return road',maneuver:{type:'turn',modifier:'left',location:geometry[1]}},{name:'Final return road',maneuver:{type:'turn',modifier:'left',location:geometry[2]}},{maneuver:{type:'arrive',location:geometry[3]}}];
 f.private.applyRoute({geometry,steps,distance_m:2800,duration_s:300},A,true);await settle();
 const move=p=>{f.private.receiveNavFix({timestamp:f.ctx.Date.now(),coords:{latitude:p.lat,longitude:p.lon,accuracy:3,speed:10}});};
 // Both fixes miss the old 28 m turn radius, but the latter is along the next road.
 move({lat:41.69,lon:-88.0506});move({lat:41.6906,lon:-88.05});await settle();
 const instruction=f.document.getElementById('nwtbTurn').textContent;
 if(original)assert.ok(instruction.includes('Second return road'),'Original remains stuck on a turn already passed');else assert.ok(instruction.includes('Final return road'),'Road progress advances past the missed intersection');
 move({lat:41.6988,lon:-88.05});await settle();if(!original)assert.ok(voice.spoken.some(t=>t.includes('Final return road')),'Next legitimate return instruction is spoken');
 assert.equal(f.requests.filter(r=>r.body.action==='route_start_driver').length,0);f.window.nwtbStopNavigation();
}
async function transportFailure(){
 const f=fixture({ios:true}),v=speech(f);await f.open();await f.begin();await settle();v.api.hold=true;
 f.window.nwtbRepeatTurn();const interrupted=v.utterances.at(-1);interrupted.onerror({error:'not-allowed'});await settle();
 assert.equal(f.window.nwtbVoiceScreenState().needs_tap,true);assert.equal(f.document.getElementById('nwtbVoiceHealth').hidden,false,'Phone shows explicit resume control after asynchronous browser speech failure');
 const count=v.utterances.length;for(let i=0;i<8;i++){f.window.nwtbVoiceSay('Fixture retry');await f.tick(500);}assert.equal(v.utterances.length,count,'Blocked speech never retries every GPS tick');
 v.api.hold=false;await f.document.getElementById('nwtbVoiceHealth').querySelector('button').onclick();await settle();assert.equal(f.window.nwtbVoiceScreenState().needs_tap,false);assert.ok(v.spoken.length>0);f.window.nwtbStopNavigation();
}
async function handoff(){
 for(const ios of [true,false]){const f=fixture({ios,android:!ios}),v=speech(f);await f.open();await f.begin();
  f.data.stops.forEach(s=>s.status='DELIVERED');f.data.route.status='ACTIVE';f.data.route.returning_started_at='2026-10-26T14:00:00Z';
  // Complete the current target; all canonical stops are already finalized by the fixture.
  await f.window.nwtbAfterStopSaved('fixture-s1');await f.tick(250);assert.equal(f.private.target.final,true);assert.equal(f.private.target.name,'Northwest Trucks - Bolingbrook');assert.equal(f.data.route.status,'ACTIVE');assert.ok(v.spoken.some(s=>s.includes('Returning to')));assert.equal(f.requests.filter(r=>r.body.action==='route_start_driver').length,0);assert.equal(f.local.get('nwtb_delivery_token'),'fixture-office-token');f.window.nwtbStopNavigation();
 }
}
(async()=>{await skippedTurn();if(original){console.log('CONFIRMED: original return navigation stalls when GPS skips a maneuver radius.');return;}await transportFailure();await handoff();console.log('PASS: missed-turn return guidance, real final-stop-to-return handoff on iPhone/Android, asynchronous speech failure and explicit recovery. Simulated trips only.');})().catch(e=>{console.error(e);process.exitCode=1});
