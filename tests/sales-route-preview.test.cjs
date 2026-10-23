'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const settle=async()=>{for(let i=0;i<150;i++)await Promise.resolve();};
const record=(id,extra={})=>({salesAccountId:id,name:`Fixture Truck Shop ${id}`,address:`${id} Industrial Dr, Bolingbrook, IL 60440`,lat:41.6825+id*.0005,lon:-88.0723,
  phone:'630-555-0100',customerNumber:String(id),finalCustomerNumber:String(id),layer:'ACTIVE CUSTOMERS',finalLayer:'ACTIVE CUSTOMERS',
  broadType:'EXISTING CUSTOMER',finalBroadType:'EXISTING CUSTOMER',finalIncluded:true,finalRouteApproved:true,planningScore:500-id,visitStatus:'NOT_VISITED',...extra});

function fixture({total=15,type='existing',radius=5,target=10}={}){
  const {document,window:dom}=parseHTML(read('index.html')),events={},timers=[],requests=[],alerts=[];
  let server=Array.from({length:total},(_,i)=>record(i+1)),printCalls=0,gpsCalls=0,failAction='',holdValidation=null;
  const context={document,console,Date,URL,URLSearchParams,Map,Set,Promise,Number,String,Math,CustomEvent:dom.CustomEvent,
    location:{search:'',pathname:'/',href:'https://fixture.test/'},navigator:{userAgent:'Fixture desktop',geolocation:{getCurrentPosition(){gpsCalls++;throw Error('GPS must not start during review');}}},
    localStorage:{getItem:()=>null,setItem(){},removeItem(){}},alert:m=>alerts.push(m),
    matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>{(events[name]??=[]).push(fn);},
    setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},setInterval:()=>1,clearInterval(){},
    print(){(events.beforeprint||[]).forEach(fn=>fn());printCalls++;},
    nwtbNormalizeSalesAccount:a=>({...a,layer:a.finalLayer||a.layer,broadType:a.finalBroadType||a.broadType,customerNumber:a.finalCustomerNumber??a.customerNumber}),
    nwtbLoadSalesAccounts:async()=>server.map(a=>({...a}))};
  context.window=context;
  for(const el of document.querySelectorAll('[id]'))context[el.id]=el;
  const ctx=vm.createContext(context);
  const ids=()=>JSON.parse(vm.runInContext('JSON.stringify(currentRoute.map(a=>a.salesAccountId))',ctx));
  const current=()=>JSON.parse(vm.runInContext('JSON.stringify(currentRoute)',ctx));
  const validate=stops=>context.NwtbSalesPolicy.validate(stops,server);
  context.nwtbSalesApi=async(action,body={})=>{
    requests.push({action,body});if(action===failAction)throw Error('Fixture network failure');
    if(action==='accounts')return {ok:true,accounts:server.map(a=>({...a}))};
    if(action==='validate_route'){
      if(holdValidation)await holdValidation;
      const r=validate(body.stops);if(!r.ok)throw Error('Fixture cloud HOLD: '+r.blocked.map(x=>x.reason).join(', '));return r;
    }
    throw Error('Unexpected Sales action '+action);
  };
  context.fetch=async(url,opts)=>{
    const body=JSON.parse(opts.body);requests.push({url,body});
    if(String(url).includes('nwtb-route-matrix')){
      const points=body.points,m=points.map((a,i)=>points.map((b,j)=>i===j?0:60+Math.hypot(a.lat-b.lat,a.lon-b.lon)*100000));
      return {ok:true,json:async()=>({code:'Ok',durations:m,distances:m.map(row=>row.map(v=>v*12)),source:'TEST_ROAD_MATRIX'})};
    }
    if(String(url).includes('nwtb-chat')){
      if(body.action==='visit_list')return {ok:true,json:async()=>({statuses:server.map(a=>({account_key:'CUST:'+a.customerNumber,status:a.visitStatus}))})};
      if(body.action==='list')return {ok:true,json:async()=>({messages:[]})};
      throw Error('Unexpected Chat action '+body.action);
    }
    throw Error('Unexpected network URL '+url);
  };
  vm.runInContext(read('sales-route-policy.js'),ctx);
  const inline=[...read('index.html').matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('let accounts='))[1];
  vm.runInContext(inline.replace(/init\(\);\s*$/,''),ctx);
  context.__fixture=server.map(a=>({...a}));vm.runInContext('accounts.push(...__fixture)',ctx);
  for(const name of ['chat.js','navigation.js','sales-built-in-navigation.js','sales-route-safety.js','sales-route-preview.js'])vm.runInContext(read(name),ctx,{filename:name});
  const value=(id,value)=>{Object.defineProperty(document.getElementById(id),'value',{configurable:true,writable:true,value:String(value)});};
  value('routeType',type);value('routeSubFilter','all_existing');value('radius',radius);value('stopCount',target);
  return {context,document,requests,alerts,ids,current,value,api:context.nwtbSalesRoutePreview,
    get server(){return server;},set server(rows){server=rows;},get printCalls(){return printCalls;},get gpsCalls(){return gpsCalls;},
    fail(action){failAction=action;},pauseValidation(p){holdValidation=p;},
    async build(){await settle();await context.buildRoute();await settle();},
    remove(id){document.querySelector(`[data-sales-review="remove"][data-key="ID:${id}"]`).click();},
    previewIds(){return [...document.querySelectorAll('[data-sales-review="remove"]')].map(b=>Number(b.dataset.key.slice(3)));},
    runZeroTimers(){for(const t of timers.splice(0))if(t.ms===0)t.fn();}};
}

test('Create 10 → preview → remove 2 → DONE keeps 8, adds the next 2 and re-optimizes',async()=>{
  const f=fixture();await f.build();const original=f.previewIds();assert.equal(original.length,10);assert.deepEqual(f.ids(),[]);
  assert.equal(f.document.getElementById('output').querySelector('a.routebtn'),null);
  assert.equal(f.document.getElementById('output').querySelector('[onclick*="nwtbSalesStartNav"]'),null);
  assert.equal(f.document.getElementById('nwtbSalesPreviewDone').textContent,'DONE — FINALIZE ROUTE');
  f.remove(original[1]);f.remove(original[5]);const kept=f.previewIds();assert.equal(kept.length,8);
  assert.match(f.document.getElementById('nwtbSalesPreviewSummary').textContent,/2 eligible replacements/);
  assert.equal(await f.api.done(),true);assert.equal(f.ids().length,10);
  for(const id of kept)assert.ok(f.ids().includes(id));
  assert.ok(!f.ids().includes(original[1]));assert.ok(!f.ids().includes(original[5]));
  assert.ok(f.ids().includes(11));assert.ok(f.ids().includes(12));
  assert.equal(f.document.querySelectorAll('.salesReplacement').length,2);
  assert.ok(f.document.querySelector('[data-sales-review="print"]'));
  assert.equal(f.gpsCalls,0);assert.ok(!f.requests.some(r=>r.body?.action==='send_route'));
});
test('Preview blocks navigation/sharing; undo and remove-all work through real controls',async()=>{
  const f=fixture();await f.build();const first=f.previewIds()[0];f.remove(first);
  f.document.querySelector('[data-sales-review="undo"]').click();assert.ok(f.previewIds().includes(first));
  await f.context.nwtbSalesStartNav();assert.equal(f.gpsCalls,0);assert.deepEqual(f.ids(),[]);
  for(const id of f.previewIds())f.remove(id);
  assert.equal(await f.api.done(),true);assert.equal(f.ids().length,5);assert.match(f.document.getElementById('nwtbSalesReplacementSummary').textContent,/Requested 10; only 5/);
});
test('Replacements retain the captured filters and exclude HOLD, visit blocks and outside-area accounts',async()=>{
  const f=fixture({total:12});await f.build();const original=f.previewIds();f.remove(original[0]);f.remove(original[1]);
  f.server=f.server.concat([record(70,{planningScore:9999,lat:43}),record(71,{planningScore:9999,finalRouteApproved:false}),record(72,{planningScore:9999,visitStatus:'DO_NOT_ROUTE'}),record(73,{planningScore:9999,broadType:'PROSPECT',finalBroadType:'PROSPECT'})]);
  f.value('routeType','new_business');f.value('radius',999);f.value('stopCount',25);
  assert.equal(await f.api.done(),true);assert.equal(f.ids().length,10);assert.ok(f.ids().every(id=>id<=12));
});
test('New Business replacements use road insertion around the kept stops and preserve prospect subtype',async()=>{
  const f=fixture({type:'new_business'});f.server=f.server.map(a=>({...a,broadType:'PROSPECT',finalBroadType:'PROSPECT',layer:'VERIFIED PROSPECTS',finalLayer:'VERIFIED PROSPECTS'}));
  await f.context.nwtbSalesApi('accounts').then(j=>{f.context.__new=j.accounts;vm.runInContext('accounts.splice(0,accounts.length,...__new)',vm.createContext(f.context));});
  f.value('routeSubFilter','regular_prospects');await f.build();const original=f.previewIds();f.remove(original[0]);f.remove(original[1]);
  f.server.push(record(16,{broadType:'PROSPECT',finalBroadType:'PROSPECT',finalLayer:'GO FIRST',layer:'GO FIRST',finalGoFirstMember:true,finalGoFirstRouteApproved:true}));
  assert.equal(await f.api.done(),true);assert.equal(f.ids().length,10);assert.ok(!f.ids().includes(16));
  const matrices=f.requests.filter(r=>r.url?.includes('nwtb-route-matrix'));assert.ok(matrices.some(r=>r.body.points.length===14),'Replacement selection uses depot + 8 kept + 5 alternatives');
});
test('Exhausted candidate pool produces fewer stops with an explicit shortage instead of repeating removals',async()=>{
  const f=fixture({total:10});await f.build();const ids=f.previewIds();f.remove(ids[0]);f.remove(ids[1]);
  assert.equal(await f.api.done(),true);assert.equal(f.ids().length,8);assert.match(f.document.getElementById('nwtbSalesReplacementSummary').textContent,/2 more stops are unavailable/);
});
test('Cloud approval revoked during review is removed and refilled; a failed refresh preserves the draft',async()=>{
  const f=fixture();await f.build();const removed=f.previewIds()[0];f.server=f.server.map(a=>a.salesAccountId===removed?{...a,finalRouteApproved:false}:a);
  assert.equal(await f.api.done(),true);assert.equal(f.ids().length,10);assert.ok(!f.ids().includes(removed));
  await f.api.edit();const retryRemoved=f.previewIds()[0];f.remove(retryRemoved);f.fail('accounts');
  assert.equal(await f.api.done(),false);assert.deepEqual(f.ids(),[]);assert.match(f.document.querySelector('.salesPreviewError').textContent,/network failure/);assert.ok(!f.previewIds().includes(retryRemoved));
  f.fail('');assert.equal(await f.api.done(),true);assert.ok(!f.ids().includes(retryRemoved));
});
test('Repeated edits keep earlier exclusions; a new CREATE starts a new removal session',async()=>{
  const f=fixture();await f.build();const a=f.previewIds()[0];f.remove(a);await f.api.done();await f.api.edit();
  const b=f.previewIds()[0];f.remove(b);await f.api.done();assert.equal(f.ids().length,10);assert.ok(!f.ids().includes(a));assert.ok(!f.ids().includes(b));
  await f.build();assert.ok(f.previewIds().includes(a));assert.ok(f.previewIds().includes(b));
});
test('Cancel an edit restores the final route and cancels an in-flight Done request',async()=>{
  const f=fixture();await f.build();await f.api.done();const original=f.ids();await f.api.edit();f.remove(f.previewIds()[0]);
  await f.api.cancel();assert.deepEqual(f.ids(),original);
  await f.api.edit();let release;const barrier=new Promise(resolve=>release=resolve);f.pauseValidation(barrier);
  const pending=f.api.done();await settle();f.api.reset();release();assert.equal(await pending,false);assert.deepEqual(f.ids(),[]);
});
test('Print uses the finalized replacements, customer details, notes column and return depot',async()=>{
  const f=fixture();await f.build();const removed=f.previewIds()[0];f.remove(removed);assert.equal(await f.api.print(),false);assert.equal(f.printCalls,0);
  await f.api.done();assert.equal(await f.api.print(),true);assert.equal(f.printCalls,1);
  const sheet=f.document.getElementById('nwtbSalesPrintSheet');assert.ok(![...sheet.querySelectorAll('tbody tr td:nth-child(2) b')].some(b=>b.textContent===`Fixture Truck Shop ${removed}`));
  assert.equal(sheet.querySelectorAll('tbody tr').length,11);assert.match(sheet.textContent,/Fixture Truck Shop 11/);assert.match(sheet.textContent,/630-555-0100/);assert.match(sheet.textContent,/Visit notes/);assert.match(sheet.textContent,/RETURN TO Northwest Trucks/);
  assert.ok(!sheet.querySelector('button'));assert.match(f.document.getElementById('nwtbSalesPreviewStyle').textContent,/@media print/);
});
test('Printing refuses a revoked approval and cannot print an old list while editing',async()=>{
  const f=fixture();await f.build();await f.api.done();await f.api.print();await f.api.edit();
  assert.equal(f.document.getElementById('nwtbSalesPrintSheet'),null);assert.equal(await f.api.print(),false);
  f.context.print();assert.match(f.document.getElementById('nwtbSalesPrintSheet').textContent,/Finish the route preview/);
  await f.api.done();const id=f.ids()[0];f.server=f.server.map(a=>a.salesAccountId===id?{...a,finalRouteApproved:false}:a);
  const before=f.printCalls;assert.equal(await f.api.print(),false);assert.equal(f.printCalls,before);assert.deepEqual(f.ids(),[]);
});
test('HTML entry points load review after safety and use the Sales-only build version',()=>{
  for(const name of ['index.html','app.html']){const s=read(name);assert.ok(s.lastIndexOf('sales-route-preview.js')>s.lastIndexOf('sales-route-safety.js'));assert.match(s,/sales-build-version.json/);}
  assert.equal(JSON.parse(read('build-version.json')).version,'20261008LOGIN1','Shared Delivery build version is untouched');
});
