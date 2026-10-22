import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { installRoutePreviewTraffic } from '../office-route-traffic.mjs';
const require=createRequire(new URL('./package.json',import.meta.url)),{parseHTML}=require('linkedom');
const start=Date.parse('2026-10-22T14:00:00Z'),routeId='11111111-1111-4111-8111-111111111111';
const config={environment:'PRODUCTION',projectRef:'ufnjyidhxuytrmbjzgtu',backendUrl:'https://ufnjyidhxuytrmbjzgtu.supabase.co',siteOrigin:'https://billyjwiorek-tech.github.io',publishableKey:'fixture-publishable',officeTokenKey:'nwtb_delivery_token'};
const flush=async()=>{for(let i=0;i<150;i++)await Promise.resolve()};
class Emitter{constructor(){this.events=new Map()}on(name,fn){if(!this.events.has(name))this.events.set(name,new Set());this.events.get(name).add(fn);return this}off(name,fn){this.events.get(name)?.delete(fn);return this}fire(name,value){for(const fn of [...this.events.get(name)||[]])fn(value);return this}}
function fixture(options={}){
 const {document,window:dom}=parseHTML('<html><head></head><body><section class="officeRouteMapShell"><div id="officeRouteMap"></div><section id="officeRouteEta"></section></section></body></html>');
 let now=start,visible=true,nextId=0;const intervals=new Map(),timeouts=new Map(),calls=[],pending=[],focused=[],storage=new Map([['nwtb_delivery_token','fixture-office'],['nwtb_driver_token','fixture-driver']]);
 Object.defineProperty(document,'visibilityState',{get:()=>visible?'visible':'hidden'});
 const timers={setInterval(fn,ms){const id=++nextId;intervals.set(id,{fn,ms});return id},clearInterval(id){intervals.delete(id)},setTimeout(fn,ms){const id=++nextId;timeouts.set(id,{fn,ms});return id},clearTimeout(id){timeouts.delete(id)}};
 const map=new Emitter();map.layers=new Set();map.panes=new Map();map.getPane=n=>map.panes.get(n);map.createPane=n=>{const p=document.createElement('div');map.panes.set(n,p);return p};map.hasLayer=l=>map.layers.has(l);map.removeLayer=l=>map.layers.delete(l);map.getContainer=()=>document.getElementById('officeRouteMap');
 const L={control(){return {addTo(){document.body.appendChild(this.onAdd());return this},remove(){document.querySelector('.nwtbTrafficControl')?.remove()}}},DomEvent:{disableClickPropagation(){},disableScrollPropagation(){}},GridLayer:{extend(def){return class extends Emitter{constructor(opts){super();this.options=opts;Object.assign(this,def)}addTo(map){map.layers.add(this);return this}redraw(){return this}}}}};
 const model={routeId,routeStatus:options.active?'ACTIVE':'PLANNED',updatedAt:new Date(start).toISOString(),stops:[{stopId:'s1',label:'1',status:'PENDING'},{stopId:'s2',label:'2',status:'PENDING'}],end:{kind:'RETURN'}};
 const payload=()=>({ok:true,available:true,traffic_aware:true,source:'TOMTOM',route_id:routeId,route_status:model.routeStatus,route_updated_at:model.updatedAt,basis:options.active?'CURRENT_GPS':'PLANNED_DEPART_NOW',origin_name:'NWTB Bolingbrook',gps_captured_at:options.active?new Date(start).toISOString():null,view_stops:model.stops.map(s=>({id:s.stopId,sequence:Number(s.label),status:s.status})),calculated_at:new Date(now).toISOString(),arrivals:[{id:'s1',kind:'STOP',sequence:1,name:'Fixture Pickup',arrival_at:new Date(now+600000).toISOString(),minutes:10,leg_drive_seconds:600,service_seconds:900,traffic_delay_seconds:60},{id:'s2',kind:'STOP',sequence:2,name:'Fixture Delivery',arrival_at:new Date(now+2700000).toISOString(),minutes:45,leg_drive_seconds:1200,service_seconds:600,traffic_delay_seconds:120},{id:'return',kind:'RETURN',sequence:null,name:'NWTB Bolingbrook',arrival_at:new Date(now+4200000).toISOString(),minutes:70,leg_drive_seconds:900,service_seconds:0,traffic_delay_seconds:0}]});
 const fetcher=async(url,init)=>{
  assert.ok(String(url).startsWith(config.backendUrl));assert.ok(!String(url).includes('fixture-office'));assert.equal(init.headers['x-nwtb-session'],'fixture-office');const body=init.method==='GET'?Object.fromEntries(new URL(url).searchParams):JSON.parse(init.body);calls.push({url,init,body});
  if(body.action==='config')return Response.json({ok:true,environment:'PRODUCTION',source:'TOMTOM',enabled:true});
  assert.equal(body.action,'route_preview_eta','Preview must only request read-only traffic configuration and route estimates');
  if(options.defer)return new Promise((resolve,reject)=>{pending.push({resolve,reject,signal:init.signal});if(!options.ignoreAbort)init.signal.addEventListener('abort',()=>reject(Error('Request aborted')),{once:true})});
  if(options.outage)throw Error('Provider unavailable');
  return Response.json(options.unavailable?{ok:true,available:false,code:options.unavailable}:options.transform?options.transform(payload()):payload());
 };
 const window={location:{origin:config.siteOrigin},URL:{createObjectURL(){return 'blob:fixture'},revokeObjectURL(){}}};
 const ui=installRoutePreviewTraffic({map,L,config,model,getOfficeToken:()=>storage.get('nwtb_delivery_token')||'',onFocus:id=>focused.push(id),fetcher,document,window,timers,clock:()=>now});
 return {ui,document,dom,map,model,calls,pending,focused,storage,intervals,timeouts,payload,
  text:()=>document.getElementById('officeRouteEta').textContent,
  async tick(ms,{poll=true}={}){now+=ms;for(const v of [...intervals.values()])if(v.ms<=ms&&(poll||v.ms===5000))v.fn();await flush()},
  async hide(){visible=false;document.dispatchEvent(new dom.Event('visibilitychange'));await flush()},
  async show(){visible=true;document.dispatchEvent(new dom.Event('visibilitychange'));await flush()},
  finish(i=0,value=payload()){pending[i].resolve(Response.json(value));},
  async timeout(){for(const t of [...timeouts.values()])t.fn();await flush()}
 };
}
test('Office preview composes the existing traffic overlay with planned per-stop and return ETAs',async()=>{
 const f=fixture();await flush();assert.equal(f.map.hasLayer(f.ui.overlay.layer),true);assert.equal(f.map.getPane('nwtbTraffic').style.zIndex,'450');assert.match(f.ui.overlay.panel.textContent,/LIVE TRAFFIC ON/);assert.match(f.text(),/PLANNED ROUTE • IF DEPARTING NOW FROM NWTB BOLINGBROOK/);assert.match(f.text(),/Thu 9:10 AM/);assert.match(f.text(),/Thu 9:45 AM/);assert.match(f.text(),/Thu 10:10 AM/);assert.match(f.text(),/ALL TIMES CENTRAL/);assert.match(f.text(),/estimated stop service/);
 const request=f.calls.find(c=>c.body.action==='route_preview_eta');assert.equal(request.body.route_id,routeId);assert.equal(request.body.expected_updated_at,f.model.updatedAt);assert.equal(request.init.headers['x-nwtb-session'],'fixture-office');assert.ok(!('origin' in request.body));
 const buttons=f.document.querySelectorAll('.officeEtaFocus');buttons[1].click();buttons[2].click();assert.deepEqual(f.focused,['s2','return']);f.ui.destroy();assert.equal(f.intervals.size,0);assert.equal(f.timeouts.size,0);
});
test('health checks preserve existing arrival buttons and keyboard focus until estimates change',async()=>{
 const f=fixture();await flush();const button=f.document.querySelector('.officeEtaFocus');await f.tick(5000);assert.equal(f.document.querySelector('.officeEtaFocus'),button);f.ui.destroy();
});
test('active route labels GPS origin and removes arrivals as soon as its last fix becomes stale',async()=>{
 const f=fixture({active:true});await flush();assert.match(f.text(),/ACTIVE ROUTE • FROM DRIVER GPS/);assert.match(f.text(),/ARRIVAL/);await f.tick(121000,{poll:false});assert.match(f.text(),/GPS IS OUT OF DATE|TRAFFIC SERVICE/);assert.equal(f.document.querySelectorAll('.officeEtaFocus').length,0);f.ui.destroy();
});
test('traffic failure, GPS loss and changed saved stops show clear unavailable states while preserving the overlay',async()=>{
 for(const options of [{unavailable:'GPS_STALE'},{unavailable:'ROUTE_PAUSED'},{unavailable:'ROUTE_CHANGED'},{outage:true},{transform:p=>({...p,view_stops:p.view_stops.toReversed()})}]){
  const f=fixture(options);await flush();assert.equal(f.document.querySelectorAll('.officeEtaFocus').length,0);assert.match(f.text(),/ETA UNAVAILABLE/);assert.equal(f.map.hasLayer(f.ui.overlay.layer),true);if(options.unavailable==='ROUTE_CHANGED'||options.transform)assert.match(f.text(),/REFRESH SAVED ROUTE/);f.ui.destroy();
 }
});
test('a missing or invalid provider timestamp cannot be presented as a current estimate',async()=>{
 for(const change of [p=>({...p,calculated_at:'bad'}),p=>({...p,calculated_at:new Date(start-61000).toISOString()}),p=>({...p,arrivals:p.arrivals.map((r,i)=>i===1?{...r,arrival_at:new Date(start).toISOString()}:r)}),p=>({...p,route_id:'another-route'}),p=>({...p,route_status:'ACTIVE'})]){
  const f=fixture({transform:change});await flush();assert.match(f.text(),/ETA UNAVAILABLE/);assert.equal(f.document.querySelectorAll('.officeEtaFocus').length,0);f.ui.destroy();
 }
});
test('preview polling refreshes while visible and the traffic toggle preserves arrival estimates',async()=>{
 const f=fixture();await flush();let count=f.calls.filter(c=>c.body.action==='route_preview_eta').length;
 f.ui.overlay.panel.querySelector('button').click();assert.equal(f.map.hasLayer(f.ui.overlay.layer),false);assert.equal(f.document.querySelectorAll('.officeEtaFocus').length,3);
 await f.tick(30000);assert.equal(f.calls.filter(c=>c.body.action==='route_preview_eta').length,count+1);await f.hide();count=f.calls.length;await f.tick(30000);assert.equal(f.calls.length,count);await f.show();assert.ok(f.calls.filter(c=>c.body.action==='route_preview_eta').length>=3);f.ui.destroy();
});
test('Office logout clears arrivals and rejects an in-flight result without using or changing the Driver session',async()=>{
 const f=fixture({defer:true,ignoreAbort:true});await flush();const driver=f.storage.get('nwtb_driver_token');f.storage.set('nwtb_delivery_token','');await f.tick(5000);f.finish();await flush();assert.match(f.text(),/OFFICE SIGN-IN REQUIRED/);assert.equal(f.document.querySelectorAll('.officeEtaFocus').length,0);assert.equal(f.pending[0].signal.aborted,true);assert.equal(f.storage.get('nwtb_driver_token'),driver);f.ui.destroy();
 const g=fixture();await flush();g.storage.set('nwtb_driver_token','another-driver');await g.tick(5000);assert.equal(g.storage.get('nwtb_delivery_token'),'fixture-office');assert.equal(g.document.querySelectorAll('.officeEtaFocus').length,3);g.ui.destroy();
});
test('closing or replacing the preview aborts requests and late results cannot redraw the new screen',async()=>{
 const f=fixture({defer:true,ignoreAbort:true});await flush();f.ui.destroy();f.document.getElementById('officeRouteEta').textContent='NEW SCREEN';f.finish();await flush();assert.equal(f.text(),'NEW SCREEN');assert.equal(f.pending[0].signal.aborted,true);assert.equal(f.intervals.size,0);assert.equal(f.timeouts.size,0);
});
test('request timeout clears busy state and a later refresh can recover',async()=>{
 const f=fixture({defer:true});await flush();await f.timeout();assert.match(f.text(),/ETA UNAVAILABLE/);const again=f.ui.refreshEta();await flush();assert.equal(f.pending.length,2);f.finish(1);await again;assert.equal(f.document.querySelectorAll('.officeEtaFocus').length,3);f.ui.destroy();
});
test('stale cached traffic estimates clear rather than counting down forever',async()=>{
 const f=fixture();await flush();await f.tick(61000,{poll:false});assert.equal(f.document.querySelectorAll('.officeEtaFocus').length,0);assert.match(f.text(),/ETA UNAVAILABLE/);f.ui.destroy();
});
