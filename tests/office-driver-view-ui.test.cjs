'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8'),settle=async()=>{for(let i=0;i<150;i++)await Promise.resolve();};
const rid='10000000-0000-4000-8000-000000000001',sid='20000000-0000-4000-8000-000000000001';
function fixture({ready=true,phase='ACTIVE',live=true}={}){
 const {window:dom,document}=parseHTML(read('office-driver-preview.html')),requests=[],storageReads=[],timers=new Map(),views=[],previews=[];let timer=0;
 Object.defineProperty(dom.HTMLSelectElement.prototype,'value',{configurable:true,get(){return (this.querySelector('option[selected]')||this.querySelector('option'))?.getAttribute('value')||''},set(v){for(const opt of this.querySelectorAll('option')){if(opt.value===v)opt.setAttribute('selected','');else opt.removeAttribute('selected');}}});
 Object.defineProperty(dom.HTMLSelectElement.prototype,'selectedOptions',{configurable:true,get(){return [this.querySelector('option[selected]')||this.querySelector('option')].filter(Boolean);}});
 Object.defineProperty(document,'visibilityState',{value:'visible',writable:true});
 dom.HTMLElement.prototype.focus=function(){};dom.HTMLElement.prototype.scrollIntoView=function(){};
 const data={driver:{employee_number:'1234',display_name:'Fixture Driver'},route:{id:rid,status:phase,released_to_driver:phase!=='PLANNED',route_date:'2026-10-26',depot:'PALATINE',driver_employee_number:'1234',updated_at:'2026-10-26T13:00:00Z',returning_started_at:phase==='RETURN'?'2026-10-26T14:00:00Z':null},stops:[{id:sid,order_id:'order-fixture',stop_sequence:1,status:'PENDING',updated_at:'2026-10-26T13:00:00Z',delivery_orders:{customer_name:'Fixture business',address:'Fixture street',priority:'NORMAL'}}],pods:[],audit:[],phone:{live,reason:live?'LIVE_DRIVER_SCREEN':'AWAITING_DRIVER_SYNC',captured_at:live?'2026-10-26T14:00:00Z':null,snapshot:{view:'ROUTE',navigation_active:true,eta:'6 min',distance:'2.8 mi',turn:'Turn left onto Fixture Street',turn_distance:'120 ft',banner:'Navigating to Fixture business',mode:'NWTB TURN-BY-TURN',target:{stop_id:sid}}},server_at:'2026-10-26T14:00:00Z'};
 if(phase==='RETURN')data.route.status='ACTIVE';
 const fetch=async(url,init)=>{const body=JSON.parse(init.body);requests.push({url,body,headers:init.headers});let result={ok:true};
  if(body.action==='roster')result={drivers:[data.driver],routes:[data.route]};
  if(body.action==='view')result=JSON.parse(JSON.stringify(data));
  if(body.action==='verify_override_pin')result={ok:body.pin==='fixture-pin'};
  if(body.action==='override'){
   result={ok:true};
   if(body.override?.operation==='end_route'){const pending=data.stops.filter(s=>s.status==='PENDING');data.route.status='CANCELED';for(const s of pending)s.status='SKIPPED';data.phone={live:false,reason:'ROUTE_ENDED'};result.returned_to_queue=pending.length;}
  }
  if(body.action==='dispatch_threads')result={threads:[{driver_employee_number:'1234',driver_name:'Fixture Driver',unread:0,latest:null}]};
  if(body.action==='dispatch_list')result={messages:[],driver:{display_name:'Fixture Driver'}};
  if(body.action==='available_stops')result={orders:[]};
  if(!['roster','view','verify_override_pin','override','dispatch_threads','dispatch_list','available_stops'].includes(body.action))throw Error('Unexpected fixture action '+body.action);
  return {ok:result.ok!==false,status:result.ok===false?403:200,json:async()=>result};
 };
 const window={parent:{openView:name=>views.push(name),document:{getElementById:()=>({contentWindow:{viewOfficeRoute:id=>previews.push(id)}})}},addEventListener:document.addEventListener.bind(document),dispatchEvent:document.dispatchEvent.bind(document)};
 const localStorage={getItem:key=>{storageReads.push(key);if(key!=='nwtb_delivery_token')throw Error('Office read Driver storage');return ready?'fixture-office-token':'';}};
 const schedule=(fn,ms)=>{const id=++timer;timers.set(id,{fn,ms});return id;};
 const ctx=vm.createContext({window,document,console,crypto,localStorage,fetch,AbortController,Promise,Map,Set,Date,URLSearchParams,location:{origin:'https://billyjwiorek-tech.github.io',hash:''},setTimeout:schedule,setInterval:schedule,clearTimeout:id=>timers.delete(id),navigator:{geolocation:{getCurrentPosition(){throw Error('Office requested GPS');},watchPosition(){throw Error('Office started GPS');}}},confirm:()=>true});
 window.NWTBOfficeRouteMap={valid:()=>true};vm.runInContext(read('dispatch-chat-live.js'),ctx);vm.runInContext(read('office-driver-view.js'),ctx);
 return {window,document,data,requests,storageReads,views,previews,timers,ctx,async boot(){for(const [id,t]of [...timers])if(t.ms===0){timers.delete(id);t.fn();}await settle();},async click(id){await document.getElementById(id).onclick();await settle();}};
}
async function main(){
 let f=fixture();await f.boot();assert.equal(f.document.getElementById('driverEta').textContent,'6 min');assert.equal(f.document.getElementById('driverDistance').textContent,'2.8 mi');assert.ok(f.document.getElementById('stops').textContent.includes('Fixture business'));assert.ok(f.requests.every(x=>['roster','view','dispatch_threads'].includes(x.body.action)),'Opening Office view performs no delivery mutation or chat acknowledgment');assert.ok(f.storageReads.every(x=>x==='nwtb_delivery_token'));
 await f.click('savedRoute');assert.deepEqual(f.views,['dispatch']);assert.deepEqual(f.previews,[rid]);
 await f.click('chatDriver');assert.equal(f.document.getElementById('driverChatDialog').hidden,false);assert.equal(f.document.getElementById('chatInput').disabled,false);assert.ok(f.requests.some(x=>x.body.action==='dispatch_list'));assert.ok(!f.requests.some(x=>x.body.action.includes('send')),'Opening an empty Driver conversation never sends a test message');await f.click('closeDriverChat');
 await f.click('officeOverride');assert.equal(f.document.getElementById('overrideControls').hidden,true);assert.ok(!f.requests.some(x=>x.body.action==='verify_override_pin'),'Opening override requires PIN entry');f.document.getElementById('overridePin').value='fixture-pin';await f.document.getElementById('pinForm').onsubmit({preventDefault(){}});await settle();assert.equal(f.document.getElementById('overridePin').value,'');assert.equal(f.document.getElementById('overrideControls').hidden,false);assert.ok(!f.requests.some(x=>x.body.action==='override'),'Unlock does not mutate a stop');
 f.document.getElementById('overrideReason').value='Fixture Office correction';await f.document.getElementById('overrideForm').onsubmit({preventDefault(){}});await settle();const change=f.requests.find(x=>x.body.action==='override');assert.equal(change.body.override.route_id,rid);assert.equal(change.body.override.stop_id,sid);assert.equal(change.body.pin,'fixture-pin');assert.equal(change.body.override.expected_updated_at,f.data.route.updated_at);assert.equal(f.document.getElementById('overrideDialog').hidden,true);
 f=fixture({live:false});await f.boot();assert.equal(f.document.getElementById('driverEta').textContent,'—');assert.ok(f.document.getElementById('syncDetail').textContent.includes('while parked'));
 f=fixture({ready:false});await f.boot();assert.equal(f.requests.length,0,'No backend calls without Office token');assert.ok(f.document.getElementById('viewStatus').textContent.includes('Office'));
 f=fixture({phase:'PLANNED'});await f.boot();assert.ok(f.document.getElementById('routeState').textContent.includes('OFFICE ONLY — NOT RELEASED'));
 f=fixture({phase:'RETURN'});await f.boot();assert.ok(f.document.getElementById('routeState').textContent.includes('RETURNING TO'));
 console.log('PASS: exact reported ETA/distance, route/return/release visibility, Office session isolation, empty Driver chat, secure explicit override and stale-screen states. Fixtures only.');
}
module.exports={fixture,settle};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
