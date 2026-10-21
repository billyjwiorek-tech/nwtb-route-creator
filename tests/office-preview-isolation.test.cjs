'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8'),settle=async()=>{for(let i=0;i<100;i++)await Promise.resolve()};
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++},eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
function fixture(ready=true){
 const html=read('office-driver-preview.html'),{document,window:dom}=parseHTML(html),requests=[],views=[],previews=[],timers=[];let storageReads=0;
 const desk={__nwtbOfficeSignedIn:ready,post:async(url,body)=>{requests.push({url,body});if(body.action==='drivers')return {drivers:[{employee_number:'0123',display_name:'Fixture Driver'}]};if(body.action==='routes_list')return {routes:[{id:'fixture-hidden-route',driver_employee_number:'0123',status:'PLANNED',released_to_driver:false,route_date:'2026-10-22',depot:'PALATINE'},{id:'fixture-return-route',driver_employee_number:'0123',status:'ACTIVE',released_to_driver:true,returning_started_at:'2026-10-21T14:00:00Z',route_date:'2026-10-21',depot:'BOLINGBROOK'}]};throw Error('Unexpected Office action')},viewOfficeRoute:async id=>previews.push(id)};
 const window={parent:{document:{getElementById:id=>id==='fDispatch'?{contentWindow:desk}:null},openView:name=>views.push(name)}};
 const context=vm.createContext({window,document,console,Promise,Map,Set,setInterval:fn=>{timers.push(fn);return timers.length},clearInterval(){},localStorage:{getItem(){storageReads++;throw Error('Office preview must not read Driver credentials')}},navigator:{geolocation:{watchPosition(){throw Error('Office preview must not start GPS')}}},fetch(){throw Error('Office preview must use the existing Office desk')}});
 for(const script of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g))vm.runInContext(script[1],context);
 return {document,context,requests,views,previews,desk,timers,get storageReads(){return storageReads},async boot(){timers[0]();await settle()}};
}
async function officeBoot(employee){
 const {document}=parseHTML('<html><body><div id="loginPanel"></div><div id="app" class="hidden"></div><input id="routeDate"><div id="loginMsg"></div></body></html>'),stored=new Map([['nwtb_delivery_token','old-shared-fixture-driver'],['nwtb_driver_token','fixture-driver-token']]),calls=[];
 const window={},context=vm.createContext({window,document,me:null,location:{hash:'#dispatch'},Date,Promise,$:id=>document.getElementById(id),localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},post:async(url,body,need)=>{calls.push({url,body,need});return body.action==='delivery_guest_start'?{token:'fixture-office-token'}:{employee_number:employee}},API:'fixture-delivery',CHAT:'fixture-chat',loadDrivers:async()=>{},refreshAll:async()=>{},loadFrequent:async()=>{},loadMasterCounts:async()=>{},loadMultiBuilder:async()=>{},showTab(){}});
 const html=read('dispatch-native.html');for(const name of ['startGuest','boot'])vm.runInContext(html.split('\n').find(line=>line.startsWith('async function '+name+'(')),context);
 await vm.runInContext('startGuest()',context);return {window,stored,calls};
}
(async()=>{
 for(const file of ['delivery-live.html','delivery-standard.html']){const html=read(file);ok(html.includes('office-driver-preview.html?v=20261021-mapsearch1'),'Both Office editions use Office-only preview');ok(!/src="driver-(?:live|standard)\.html/.test(html),'No hidden authenticated Driver app in Office');}
 let f=fixture();await f.boot();eq(f.requests.map(x=>x.body.action),['routes_list','drivers'],'Preview reads only Office routes and driver names');ok(f.document.getElementById('routes').textContent.includes('OFFICE ONLY — NOT RELEASED'),'Office may review unreleased routes');ok(f.document.getElementById('routes').textContent.includes('RETURN LEG IN PROGRESS'),'Return remains visible');ok(f.document.getElementById('routes').textContent.includes('Fixture Driver'));
 await vm.runInContext("previewRoute('fixture-hidden-route')",f.context);eq(f.views,['dispatch']);eq(f.previews,['fixture-hidden-route'],'Selected saved route opens the existing shared Office Route Screen');eq(f.storageReads,0,'No Driver credential access');eq(f.requests.length,2,'Preview never calls Driver login, route start or GPS');
 f=fixture(false);for(let i=0;i<151;i++)f.timers[0]();await settle();eq(f.requests.length,0,'No request before Office authentication');ok(f.document.getElementById('status').textContent.includes('Open this view from NWTB Office'));
 let b=await officeBoot('9998');eq(b.calls[0].body.action,'delivery_guest_start');eq(b.calls[0].need,false,'Office starts a fresh Delivery Desk session');eq(b.window.__nwtbOfficeSignedIn,true);eq(b.stored.get('nwtb_driver_token'),'fixture-driver-token','Driver credentials are preserved');eq(b.stored.get('nwtb_delivery_token'),'fixture-office-token');
 b=await officeBoot('0123');eq(b.window.__nwtbOfficeSignedIn,false,'Driver identity is rejected in the Office workspace');eq(b.stored.get('nwtb_driver_token'),'fixture-driver-token');ok(b.calls.every(c=>['delivery_guest_start','whoami'].includes(c.body.action)));
 console.log(checks+' Office-only route preview, return/release visibility and Driver session isolation checks passed; fixtures only.');
})().catch(e=>{console.error(e);process.exitCode=1});
