const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const policy=require('../sales-route-policy.js');
const account=(id,more={})=>({salesAccountId:id,name:`Business ${id}`,address:`${id} Industrial Dr, Romeoville, IL`,lat:41.67,lon:-88.07,finalIncluded:true,finalLayer:'ACTIVE CUSTOMERS',finalCustomerNumber:String(id),finalRouteApproved:true,...more});
const good=account(1),hold=account(2,{finalRouteApproved:false}),excluded=account(3,{finalIncluded:false});
const database=[good,hold,excluded];
test('Canonical records replace forged names, addresses, coordinates and approvals',()=>{
 const r=policy.validate([{salesAccountId:1,name:'Fake',address:'Home',lat:0,lon:0}],database);
 assert.equal(r.ok,true);assert.deepEqual(r.stops,[good]);
 assert.equal(policy.validate([{...hold,finalRouteApproved:true}],database).ok,false);
 assert.equal(policy.validate([{...excluded,finalIncluded:true,finalRouteApproved:true}],database).ok,false);
});
test('Unknown/manual, ambiguous, duplicate and mixed unsafe routes fail entirely',()=>{
 for(const stops of [[{name:'Custom',address:'Home'}],[good,good],[good,hold],[],Array(26).fill(good)])assert.equal(policy.validate(stops,database).ok,false);
 assert.equal(policy.validate([{name:good.name,address:good.address}],[good,{...good,salesAccountId:10}]).ok,false);
 assert.equal(policy.validate([{customerNumber:'1',address:'old saved address'}],database).stops[0].address,good.address);
});
test('GO FIRST additional gate, physical address, coordinates and visit restrictions',()=>{
 for(const change of [{finalGoFirstMember:true,finalGoFirstRouteApproved:false},{address:'PO BOX 100'}, {address:''},{name:''},{lat:null},{lat:''},{lat:'NaN'},{lon:200},{lat:0},{visitStatus:'DO_NOT_ROUTE'},{visitStatus:'NOT_A_FIT'}])assert.ok(policy.reason(account(1,change)),JSON.stringify(change));
 assert.equal(policy.reason(account(1,{visitStatus:'FOLLOW_UP'})),'');
});
function server(slug,{records=database,visits=[],failTable=null,employee='1234'}={}){
 const writes=[],tables=[];let handler;
 const db={from(table){tables.push(table);let insert;const q={select(){return q},eq(){return q},gt(){return q},order(){return q},limit(){return q},update(){return q},insert(v){insert=v;return q},delete(){return q},maybeSingle:async()=>({data:table==='chat_sessions'?{token:'synthetic',employee_number:employee,employees:{active:true,display_name:'Test'}}:null}),single:async()=>{if(insert)writes.push({table,row:insert});return {data:insert,error:null}},then(resolve,reject){return Promise.resolve({data:table==='sales_accounts'?records.map((a,i)=>({id:a.salesAccountId,source_index:i,payload:a})):table==='prospect_visit_status'?visits:[],error:table===failTable?{message:'Unavailable'}:null}).then(resolve,reject)}};return q}};
 const context=vm.createContext({console,Map,Set,Request,Response,Date,NwtbSalesPolicy:policy,createClient:()=>db,Deno:{env:{get:()=>''},serve:fn=>handler=fn}});
 const shared=stripTypeScriptTypes(fs.readFileSync('supabase/functions/_shared/sales-route-server.ts','utf8').replace(/^import .*\n/gm,'').replace(/^export /gm,''));vm.runInContext(shared,context);
 const source=stripTypeScriptTypes(fs.readFileSync(`supabase/functions/${slug}/index.ts`,'utf8').replace(/^import .*\n/gm,''));vm.runInContext(source,context);
 return {writes,tables,request:async(action,body={},authenticated=true)=>handler(new Request('https://local.test',{method:'POST',headers:{'content-type':'application/json',...(authenticated?{'x-nwtb-session':'synthetic'}:{})},body:JSON.stringify({action,...body})}))};
}
for(const slug of ['nwtb-sales-app','nwtb-chat']){
 const action=slug==='nwtb-chat'?'send_route':'validate_route';const body=stops=>slug==='nwtb-chat'?{route_payload:{stops}}:{stops};
 test(`${slug}: authenticated server refuses forged HOLD/excluded/custom stops without route writes`,async()=>{
  for(const stop of [{...hold,finalRouteApproved:true},{...excluded,finalIncluded:true},{name:'Custom',address:'Home'}]){const s=server(slug);const r=await s.request(action,body([stop]));assert.equal(r.status,409);assert.equal(s.writes.length,0);}
 });
 test(`${slug}: cloud approval revocation and visit blocks fail closed`,async()=>{
  for(const opts of [{records:[account(1,{finalRouteApproved:false})]},{visits:[{account_key:'CUST:1',status:'DO_NOT_ROUTE'}]},{visits:[{account_key:'CUST:1',status:'NOT_A_FIT'}]}]){const s=server(slug,opts);assert.equal((await s.request(action,body([good]))).status,409);assert.equal(s.writes.length,0);}
  for(const failTable of ['sales_accounts','prospect_visit_status'])assert.equal((await server(slug,{failTable}).request(action,body([good]))).status,503);
 });
 test(`${slug}: canonical stop succeeds; only employee chat requires sign-in`,async()=>{
  const s=server(slug);const r=await s.request(action,body([{...good,address:'Forged home',lat:0}]));assert.equal(r.status,200);
  const data=await r.json();const stop=slug==='nwtb-chat'?data.message.route_payload.stops[0]:data.stops[0];assert.equal(stop.address,good.address);assert.equal(stop.lat,good.lat);
  assert.equal((await s.request(action,body([good]),false)).status,slug==='nwtb-chat'?401:200);
 });
}
test('Direct Sales access reads approved accounts and validates routes without employee/session lookups',async()=>{
 const s=server('nwtb-sales-app');const response=await s.request('accounts',{},false);assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.accounts.length,1);assert.equal(data.accounts[0].salesAccountId,good.salesAccountId);assert.equal(data.source,'SUPABASE_SALES_DIRECT_ACCESS_ROUTE_APPROVED');
 assert.equal((await s.request('validate_route',{stops:[good]},false)).status,200);
 assert.ok(!s.tables.includes('chat_sessions'));assert.ok(!s.tables.includes('employees'));assert.equal(s.writes.length,0);
 for(const action of ['whoami','logout'])assert.equal((await s.request(action,{},false)).status,401);
});
test('Direct Sales access still rejects forged HOLD, visit-blocked, missing and duplicate stops',async()=>{
 for(const stops of [[{...hold,finalRouteApproved:true}],[excluded],[{name:'Custom',address:'Home'}],[good,good]]){
  const s=server('nwtb-sales-app');assert.equal((await s.request('validate_route',{stops},false)).status,409);assert.equal(s.writes.length,0);
 }
 const blocked=server('nwtb-sales-app',{visits:[{account_key:'CUST:1',status:'DO_NOT_ROUTE'}]});assert.equal((await blocked.request('validate_route',{stops:[good]},false)).status,409);
 for(const failTable of ['sales_accounts','prospect_visit_status'])assert.equal((await server('nwtb-sales-app',{failTable}).request('accounts',{},false)).status,503);
});
test('Delivery sharing behavior is preserved and does not query sales tables',async()=>{
 const s=server('nwtb-chat',{employee:'9998'});assert.equal((await s.request('send_route',{route_payload:{stops:[good]}})).status,403);assert.ok(!s.tables.includes('sales_accounts'));
});
function client(remote=async()=>({ok:true,stops:[good]})){
 const out={style:{},replaceChildren(){this.children=[]},appendChild(x){this.children.push(x)},children:[],contains:()=>true};let rendered=0;
 const c={NwtbSalesPolicy:policy,accounts:database.map(x=>({...x})),currentRoute:[good],currentMapLinks:[],document:{getElementById:()=>out,createElement:()=>({setAttribute(){}}),addEventListener(){}},nwtbSalesApi:remote,nwtbNormalizeSalesAccount:x=>x,nwtbSalesEndNav(){},renderRoute(order){c.currentRoute=order;rendered++},mapsLinks:order=>order.map(a=>({url:a.address})),routeXLRouteText:order=>order.map(a=>a.address).join('\n'),optimize:async()=>({ok:true}),openRouteXLAllStops(){},nwtbStartPhoneNavigation(){}};c.window=c;
 vm.runInContext(fs.readFileSync('sales-route-safety.js','utf8'),vm.createContext(c));return {c,out,rendered:()=>rendered};
}
test('Saved/shared/manual HOLD routes never render or export',async()=>{
 const {c,rendered}=client();assert.equal(await c.renderRoute([hold]),false);assert.equal(rendered(),0);assert.equal(c.currentRoute.length,0);assert.throws(()=>c.mapsLinks([hold]));assert.throws(()=>c.routeXLRouteText([hold]));
});
test('Server revocation and network outage clear existing route links',async()=>{
 for(const remote of [async()=>{throw Error('Network unavailable')},async()=>({ok:false,error:policy.MESSAGE})]){const {c,rendered}=client(remote);assert.equal(await c.renderRoute([good]),false);assert.equal(rendered(),0);assert.equal(c.currentMapLinks.length,0);}
});
test('Successful client route uses canonical cloud stops',async()=>{const {c,rendered}=client();assert.equal(await c.renderRoute([{...good,address:'Forged'}]),true);assert.equal(rendered(),1);assert.equal(c.currentRoute[0].address,good.address)});
test('Browser and edge functions use identical policy bytes',()=>{assert.equal(fs.readFileSync('sales-route-policy.js','utf8'),fs.readFileSync('supabase/functions/_shared/sales-route-policy.js','utf8'))});

function directClient({storedToken='',status=200,data={ok:true,accounts:[good],source:'SUPABASE_SALES_DIRECT_ACCESS_ROUTE_APPROVED'}}={}){
 const {window:dom}=require('linkedom').parseHTML('<html><body></body></html>'),requests=[],local=new Map([['nwtb_delivery_token','delivery-session-unchanged']]);if(storedToken)local.set('nwtb_chat_token',storedToken);
 const localStorage={getItem:key=>local.get(key)||null,setItem:(key,value)=>local.set(key,String(value)),removeItem:key=>local.delete(key)};
 const window={NwtbSalesPolicy:policy},context={window,document:dom.document,localStorage,console,location:{reload(){}},fetch:async(url,init)=>{requests.push({url,init,body:JSON.parse(init.body)});return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}})}};
 vm.runInContext(fs.readFileSync('sales-cloud-auth.js','utf8'),vm.createContext(context));return {window,document:dom.document,requests,local};
}
test('A fresh browser loads Sales directly, creates no employee identity and normalizes route approval',async()=>{
 const client=directClient({data:{ok:true,accounts:[good,hold]}});const accounts=await client.window.nwtbLoadSalesAccounts();assert.equal(accounts.length,2);assert.equal(accounts[0].routeEligible,true);assert.equal(accounts[1].routeEligible,false);
 assert.deepEqual(client.requests.map(x=>x.body.action),['accounts']);assert.equal(client.requests[0].init.headers['x-nwtb-session'],undefined);assert.equal(client.local.get('nwtb_chat_token'),undefined);assert.equal(client.local.get('nwtb_delivery_token'),'delivery-session-unchanged');assert.equal(client.document.querySelectorAll('input').length,0);assert.equal(client.document.getElementById('nwtbSalesGate'),null);
});
test('An old optional chat token cannot force Sales into a sign-in loop or create another session',async()=>{
 const client=directClient({storedToken:'old-optional-chat-token'});await client.window.nwtbLoadSalesAccounts();assert.deepEqual(client.requests.map(x=>x.body.action),['accounts']);assert.equal(client.local.get('nwtb_chat_token'),'old-optional-chat-token');assert.equal(client.document.querySelectorAll('input').length,0);
});
test('A Sales outage shows a retry message without prompting for an employee PIN',async()=>{
 const client=directClient({status:503,data:{error:'Current Sales approvals unavailable.'}});await assert.rejects(()=>client.window.nwtbLoadSalesAccounts(),/approvals unavailable/);assert.match(client.document.getElementById('nwtbSalesConnectionStatus').textContent,/RETRY/);assert.equal(client.document.querySelectorAll('input').length,0);assert.equal(client.requests.length,1);
});
