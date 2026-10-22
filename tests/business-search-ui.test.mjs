import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),{parseHTML}=require('linkedom');
const root=new URL('../',import.meta.url),read=file=>fs.readFileSync(new URL(file,root),'utf8');
const business={name:'Fixture Business',address:'123 Fixture Street, Bolingbrook, Illinois 60440',lat:41.7,lon:-88.05,source_type:'OTHER',source_ref:'OSM:N:42',address_complete:true,distance_miles:2};
const settle=async()=>{for(let i=0;i<120;i++)await Promise.resolve()};
function fixture(options={}){
 const {document,window}=parseHTML('<html><head></head><body><div><label>Directory</label><select id="dirKind"><option value="CUSTOMER" selected>CUSTOMER</option></select></div><div><label>Search</label><div><input id="dirQ"><button>SEARCH</button></div></div><div id="searchResults"></div><input id="stopName"><input id="sourceRef"><input id="phone"><input id="address"><input id="sourceType"><input id="savedLocationId"><input id="lat"><input id="lon"><select id="stopType"><option value="VENDOR_PICKUP" selected>Pickup</option><option value="CUSTOMER_DELIVERY">Delivery</option></select><input id="pieces" value="1"><input id="priority" value="NORMAL"><input id="promised"><input id="notes"><input id="orderNo"><input id="referenceNo"><div id="addMsg"></div></body></html>');
 Object.defineProperty(document,'readyState',{value:'complete'});window.HTMLElement.prototype.scrollIntoView=function(){};window.HTMLElement.prototype.focus=function(){};
 const calls=[],pending=[],banners=[];
 const post=async(url,body)=>{
  calls.push({url,body});
  if(body.action==='business_search'){
   if(options.defer)return new Promise(resolve=>pending.push({q:body.q,resolve}));
   if(options.outage)throw Error('Fixture directory unavailable');
   return {ok:true,results:options.results||[business]};
  }
  if(body.action==='directory_search')return {results:body.kind==='CUSTOMER'&&options.internal?[{name:'Existing Customer',address:'456 Internal Street',source_type:'CUSTOMER',customer_number:'C1'}]:[]};
  if(body.action==='saved_locations_search')return {locations:[]};
  if(body.action==='geocode')return {lat:42.1,lon:-88.2};
  if(body.action==='saved_location_create')return {location:{id:'fixture-saved-location'}};
  return {ok:true};
 };
 const context=vm.createContext({window,document,post,API:'https://fixture.invalid/nwtb-delivery',setInterval:()=>0,clearInterval(){},console,Promise,showBanner:(...args)=>banners.push(args),clearBanner(){},loadFrequent:async()=>{},refreshAll:async()=>{},clearStop(){},validCoord:(lat,lon)=>lat!==''&&lon!==''&&lat!=null&&lon!=null&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lon)),$:id=>document.getElementById(id)});
 const html=read('dispatch-native.html');
 for(const name of ['resolveFormCoords','createStop','saveCurrentLocation']){
  const line=html.split('\n').find(line=>line.startsWith('async function '+name+'('));assert.ok(line);vm.runInContext(line,context);
 }
 vm.runInContext(read('office-business-search.js'),context);
 vm.runInContext(read('unified-search.js'),context);
 const findBusiness=()=>{for(let i=0;i<100;i++)if(window['_search_'+i]?._business)return i;return -1};
 return {document,window,context,calls,pending,banners,findBusiness,async search(q='Fixture Business') {document.getElementById('dirQ').value=q;await window.searchDirectory();},load(){window.loadBusinessLocation(findBusiness());}};
}

test('public business is loaded for review without creating a stop, route, saved location or Driver session',async()=>{
 const f=fixture({internal:true});await f.search();assert.match(f.document.getElementById('searchResults').textContent,/Existing Customer/);assert.match(f.document.getElementById('searchResults').textContent,/BUSINESS DIRECTORY/);assert.match(f.document.getElementById('searchResults').textContent,/OpenStreetMap/);
 assert.match(f.document.getElementById('searchResults').innerHTML,/LOAD \/ REVIEW/);f.load();assert.equal(f.document.getElementById('stopName').value,business.name);assert.equal(f.document.getElementById('lat').value,String(business.lat));assert.equal(f.document.getElementById('sourceType').value,'OTHER');assert.equal(f.document.getElementById('stopType').value,'VENDOR_PICKUP');
 assert.ok(f.calls.every(c=>['directory_search','saved_locations_search','business_search'].includes(c.body.action)));
});

test('adding a reviewed business remains an explicit ADD STOP action',async()=>{
 const f=fixture();await f.search();f.load();await vm.runInContext('createStop()',f.context);
 const writes=f.calls.filter(c=>c.body.action==='order_create');assert.equal(writes.length,1);assert.equal(writes[0].body.lat,business.lat);assert.equal(writes[0].body.customer_number,null);assert.equal(writes[0].body.stop_type,'VENDOR_PICKUP');assert.ok(!f.calls.some(c=>/route_|session|login/.test(c.body.action)));
});

test('SAVE AS FREQUENT LOCATION saves a location without creating a delivery or route',async()=>{
 const f=fixture();await f.search();f.load();await vm.runInContext('saveCurrentLocation()',f.context);
 assert.equal(f.calls.filter(c=>c.body.action==='saved_location_create').length,1);assert.ok(!f.calls.some(c=>c.body.action==='order_create'||c.body.action.startsWith('route_')));assert.equal(f.document.getElementById('savedLocationId').value,'fixture-saved-location');
});

test('incomplete business address cannot be added or saved until Office enters the full address',async()=>{
 const incomplete={...business,address:'Fixture Street, Bolingbrook, Illinois',address_complete:false};const f=fixture({results:[incomplete]});await f.search();f.load();await vm.runInContext('createStop()',f.context);await vm.runInContext('saveCurrentLocation()',f.context);
 assert.ok(!f.calls.some(c=>['order_create','saved_location_create'].includes(c.body.action)));assert.ok(f.banners.some(b=>String(b[1]).includes('complete street number')));
 f.document.getElementById('address').value='789 Corrected Street, Bolingbrook, Illinois';await vm.runInContext('createStop()',f.context);assert.equal(f.calls.filter(c=>c.body.action==='geocode').length,1);assert.equal(f.calls.find(c=>c.body.action==='order_create').body.lat,42.1,'Changed address gets new coordinates');
});

test('external directory outage retains customer results and numeric account search stays internal',async()=>{
 const f=fixture({outage:true,internal:true});await f.search();assert.match(f.document.getElementById('searchResults').textContent,/Existing Customer/);assert.match(f.document.getElementById('searchResults').textContent,/directory unavailable/);
 const g=fixture({internal:true});await g.search('1234');assert.ok(!g.calls.some(c=>c.body.action==='business_search'));
});

test('old business responses cannot replace a newer search',async()=>{
 const f=fixture({defer:true});f.document.getElementById('dirQ').value='First';const first=f.window.searchDirectory();await settle();f.document.getElementById('dirQ').value='Second';const second=f.window.searchDirectory();await settle();
 f.pending[1].resolve({results:[{...business,name:'Second Match'}]});await second;f.pending[0].resolve({results:[{...business,name:'First Match'}]});await first;
 assert.match(f.document.getElementById('searchResults').textContent,/Second Match/);assert.doesNotMatch(f.document.getElementById('searchResults').textContent,/First Match/);
});

function customFixture(incomplete=false,options={}){
 const {document,window}=parseHTML('<html><head></head><body><div id="customRouteModal"><div class="customBuilder"><div class="customCard"><p class="customCardSub">Locations</p></div></div></div><input id="customName"><input id="customAddress"><input id="customPhone"><input id="customType"><div id="customFound"></div><input id="customSaveFrequent" type="checkbox"></body></html>');
 Object.defineProperty(document,'readyState',{value:'complete'});window.HTMLElement.prototype.scrollIntoView=function(){};
 const calls=[],pending=[],candidate=incomplete?{...business,address:'Fixture Street, Bolingbrook',address_complete:false}:business;
 const post=async(url,body)=>{calls.push({url,body});if(body.action==='business_search'){if(options.defer)return new Promise(resolve=>pending.push({q:body.q,resolve}));return {results:options.results||[candidate]};}return {results:[],locations:[]}};
 const context=vm.createContext({window,document,post,setInterval:()=>0,clearInterval(){},console,Promise,currentForm:()=>({address:document.getElementById('customAddress').value}),msg(){},validCoord:()=>true,RESOLVER:'https://fixture.invalid/resolver',located:null,locatedAddress:''});
 const locate=read('custom-stop.js').split('\n').find(line=>line.startsWith('window.locateCustomAddress='));assert.ok(locate);vm.runInContext(locate,context);
 vm.runInContext(read('office-business-search.js'),context);
 vm.runInContext(read('custom-master-search.js'),context);return {window,document,calls,context,pending};
}
test('custom route builder also searches businesses and loads them without adding or saving',async()=>{
 const f=customFixture();f.document.getElementById('customMasterQ').value='Fixture Business';await f.window.searchCustomMasters();assert.match(f.document.getElementById('customMasterResults').textContent,/BUSINESS DIRECTORY/);assert.doesNotMatch(f.document.getElementById('customMasterResults').textContent,/QUICK ADD/);
 await f.window.loadCustomMaster(0,true);assert.equal(f.document.getElementById('customName').value,business.name);assert.ok(f.calls.every(c=>['business_search','directory_search','saved_locations_search'].includes(c.body.action)));assert.match(f.document.getElementById('customMasterStatus').textContent,/Confirm the address/);
});
test('custom route builder prevents geocoding or staging an incomplete business address',async()=>{
 const f=customFixture(true);f.document.getElementById('customMasterQ').value='Fixture Business';await f.window.searchCustomMasters();await f.window.loadCustomMaster(0,false);assert.throws(()=>f.window.nwtbValidateCustomBusinessLocation(),/complete street number/);
 const before=f.calls.length;assert.equal(await f.window.locateCustomAddress(),null);assert.equal(f.calls.length,before,'Address review happens before any resolver request');
});

function choose(f,id,value){
 const select=f.document.getElementById(id);assert.ok(select,id);
 for(const option of select.querySelectorAll('option'))option.selected=false;
 const chosen=[...select.querySelectorAll('option')].find(option=>option.value===String(value));assert.ok(chosen);chosen.selected=true;
 select.dispatchEvent(new f.window.Event('change'));
}
const businessRows=(f,custom=false)=>[...f.document.querySelectorAll(custom?'#customMasterResults .customMasterResult b':'#searchResults .result b')].map(el=>el.textContent);
test('Office search defaults to no radius, then sends the explicitly selected radius and depot',async()=>{
 const f=fixture({internal:true});await f.search();
 assert.equal(f.calls.find(c=>c.body.action==='business_search').body.radius_miles,null);
 assert.match(f.document.getElementById('nwtbBusinessScope').textContent,/Search the U.S. by business name/);
 choose(f,'nwtbBusinessRadius',10);choose(f,'nwtbBusinessDepot','PALATINE');await f.search();
 const request=f.calls.filter(c=>c.body.action==='business_search').at(-1).body;
 assert.equal(request.radius_miles,10);assert.equal(request.depot,'PALATINE');
 assert.match(f.document.getElementById('searchResults').textContent,/Existing Customer/,'Internal directories remain searchable');
 assert.match(f.document.getElementById('searchResults').textContent,/Within 10 miles of NWTB Palatine, nearest first/);
 assert.match(f.document.getElementById('searchResults').textContent,/mi straight-line from NWTB Palatine/);
 choose(f,'nwtbBusinessRadius','');await f.search();assert.equal(f.calls.filter(c=>c.body.action==='business_search').at(-1).body.radius_miles,null);
});
test('no radius ranks matching business names while a selected radius ranks distance first',async()=>{
 const results=[{...business,name:"McDonald's",address:'Far branch',distance_miles:4},{...business,name:"McDonald's",address:'Near branch',distance_miles:2},{...business,name:"McDonald's Park",address:'Nearby partial name',distance_miles:1}];
 const f=fixture({results});await f.search('mcdonalds');assert.deepEqual(businessRows(f),["McDonald's","McDonald's","McDonald's Park"]);
 assert.ok(f.document.getElementById('searchResults').textContent.indexOf('Far branch')<f.document.getElementById('searchResults').textContent.indexOf('Near branch'),'Name-only relevance order is not replaced by depot distance');
 choose(f,'nwtbBusinessRadius',5);await f.search('mcdonalds');assert.deepEqual(businessRows(f),["McDonald's Park","McDonald's","McDonald's"]);
 assert.ok(f.document.getElementById('searchResults').textContent.indexOf('Near branch')<f.document.getElementById('searchResults').textContent.indexOf('Far branch'));
});
test('changing area invalidates pending Office results even when the business name is unchanged',async()=>{
 const f=fixture({defer:true});f.document.getElementById('dirQ').value='Fixture Business';const old=f.window.searchDirectory();await settle();
 choose(f,'nwtbBusinessRadius',5);f.pending[0].resolve({results:[{...business,name:'Old nationwide result'}]});await old;
 assert.match(f.document.getElementById('searchResults').textContent,/Search area changed/);assert.doesNotMatch(f.document.getElementById('searchResults').textContent,/Old nationwide/);
 const first=f.window.searchDirectory();await settle();choose(f,'nwtbBusinessDepot','PALATINE');const second=f.window.searchDirectory();await settle();
 f.pending[2].resolve({results:[{...business,name:'New Palatine result'}]});await second;f.pending[1].resolve({results:[{...business,name:'Old Bolingbrook result'}]});await first;
 assert.match(f.document.getElementById('searchResults').textContent,/New Palatine result/);assert.doesNotMatch(f.document.getElementById('searchResults').textContent,/Old Bolingbrook result/);
});
test('empty local search offers expansion without automatically widening its radius',async()=>{
 const f=fixture({results:[]});choose(f,'nwtbBusinessRadius',5);await f.search();
 assert.match(f.document.getElementById('searchResults').textContent,/No public business matches inside this radius/);assert.match(f.document.getElementById('searchResults').textContent,/larger radius or No radius/);
 assert.equal(f.calls.filter(c=>c.body.action==='business_search').length,1);
});
test('custom builder has visible independent radius controls, name-only default and nearest-first local results',async()=>{
 const f=customFixture(false,{results:[{...business,name:'Fixture Business',distance_miles:4},{...business,name:'Fixture Business Nearby',distance_miles:1}]});
 f.document.getElementById('customMasterQ').value='Fixture Business';await f.window.searchCustomMasters();assert.equal(f.calls.find(c=>c.body.action==='business_search').body.radius_miles,null);
 assert.deepEqual(businessRows(f,true),['Fixture Business','Fixture Business Nearby']);
 choose(f,'nwtbCustomBusinessRadius',25);choose(f,'nwtbCustomBusinessDepot','PALATINE');await f.window.searchCustomMasters();
 const request=f.calls.filter(c=>c.body.action==='business_search').at(-1).body;assert.equal(request.radius_miles,25);assert.equal(request.depot,'PALATINE');
 assert.deepEqual(businessRows(f,true),['Fixture Business Nearby','Fixture Business']);assert.match(f.document.getElementById('customMasterStatus').textContent,/Within 25 miles of NWTB Palatine/);
 assert.ok(f.calls.every(c=>['directory_search','saved_locations_search','business_search'].includes(c.body.action)));
});
test('custom builder discards old responses after its radius changes',async()=>{
 const f=customFixture(false,{defer:true});f.document.getElementById('customMasterQ').value='Fixture Business';const old=f.window.searchCustomMasters();await settle();
 choose(f,'nwtbCustomBusinessRadius',5);const latest=f.window.searchCustomMasters();await settle();
 f.pending[1].resolve({results:[{...business,name:'New local branch'}]});await latest;f.pending[0].resolve({results:[{...business,name:'Old nationwide branch'}]});await old;
 assert.match(f.document.getElementById('customMasterResults').textContent,/New local branch/);assert.doesNotMatch(f.document.getElementById('customMasterResults').textContent,/Old nationwide branch/);
});
