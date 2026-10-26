'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8'),settle=async()=>{for(let i=0;i<100;i++)await Promise.resolve()};
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++},eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
const {fixture}=require('./office-driver-view-ui.test.cjs');
async function officeBoot(employee){
 const {document}=parseHTML('<html><body><div id="loginPanel"></div><div id="app" class="hidden"></div><input id="routeDate"><div id="loginMsg"></div></body></html>'),stored=new Map([['nwtb_delivery_token','old-shared-fixture-driver'],['nwtb_driver_token','fixture-driver-token']]),calls=[];
 const window={},context=vm.createContext({window,document,me:null,location:{hash:'#dispatch'},Date,Promise,$:id=>document.getElementById(id),localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},post:async(url,body,need)=>{calls.push({url,body,need});return body.action==='delivery_guest_start'?{token:'fixture-office-token'}:{employee_number:employee}},API:'fixture-delivery',CHAT:'fixture-chat',loadDrivers:async()=>{},refreshAll:async()=>{},loadFrequent:async()=>{},loadMasterCounts:async()=>{},loadMultiBuilder:async()=>{},showTab(){}});
 const html=read('dispatch-native.html');for(const name of ['startGuest','boot'])vm.runInContext(html.split('\n').find(line=>line.startsWith('async function '+name+'(')),context);
 await vm.runInContext('startGuest()',context);return {window,stored,calls};
}
(async()=>{
 for(const file of ['delivery-live.html','delivery-standard.html']){const html=read(file);ok(html.includes('office-driver-preview.html?v=20261026-driverdesk1'),'Both Office editions use Office-only preview');ok(!/src="driver-(?:live|standard)\.html/.test(html),'No hidden authenticated Driver app in Office');}
 let f=fixture();await f.boot();ok(f.requests.every(x=>['roster','view','dispatch_threads'].includes(x.body.action)),'Office observer reads only Office data');ok(f.document.getElementById('stops').textContent.includes('Fixture business'));await f.click('savedRoute');eq(f.views,['dispatch']);ok(f.storageReads.every(k=>k==='nwtb_delivery_token'),'Office never reads Driver credentials');
 f=fixture({ready:false});await f.boot();eq(f.requests.length,0,'No request before Office authentication');ok(f.document.getElementById('viewStatus').textContent.includes('Office'));
 let b=await officeBoot('9998');eq(b.calls[0].body.action,'delivery_guest_start');eq(b.calls[0].need,false,'Office starts a fresh Delivery Desk session');eq(b.window.__nwtbOfficeSignedIn,true);eq(b.stored.get('nwtb_driver_token'),'fixture-driver-token','Driver credentials are preserved');eq(b.stored.get('nwtb_delivery_token'),'fixture-office-token');
 b=await officeBoot('0123');eq(b.window.__nwtbOfficeSignedIn,false,'Driver identity is rejected in the Office workspace');eq(b.stored.get('nwtb_driver_token'),'fixture-driver-token');ok(b.calls.every(c=>['delivery_guest_start','whoami'].includes(c.body.action)));
 console.log(checks+' Office-only route preview, return/release visibility and Driver session isolation checks passed; fixtures only.');
})().catch(e=>{console.error(e);process.exitCode=1});
