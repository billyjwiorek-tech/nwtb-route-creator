'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module'),{parseHTML}=require('linkedom');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++},eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
const settle=async()=>{for(let n=0;n<80;n++)await Promise.resolve()};
const message=(id,driver='1234',body='Please call Dispatch')=>({id,body,created_at:'2026-10-20T17:00:00Z',sender_role:'DISPATCH',conversation_driver_employee_number:driver,read_by_driver_at:null,read_by_dispatch_at:'2026-10-20T17:00:00Z',display_name:'Dispatch'});
function backend({employee='1234',authenticated=true,killed=false,updateFailure=false}={}){
 let handler;const messages=[message(1),message(2),message(3,'5678'),{...message(4),sender_role:'DRIVER'}],writes=[];
 const db={from(table){let filters=[],values=null;
 function result(single=false){
  let rows=table==='chat_sessions'?(authenticated?[{token:'fixture',employee_number:employee,employees:{active:true,display_name:'Fixture driver'}}]:[]):table==='employees'?[{employee_number:employee,display_name:'Fixture driver',active:true}]:table==='nwtb_delivery_roles'?[{employee_number:employee,active:true,role:employee==='9998'?'OFFICE':'DRIVER'}]:table==='nwtb_system_control'?[{id:1,state:killed?'KILLED':'RUNNING'}]:table==='delivery_chat_messages'?messages:[];
  if(table!=='chat_sessions')rows=rows.filter(row=>filters.every(([op,k,v])=>op==='eq'?row[k]===v:op==='is'?v===null?row[k]==null:row[k]===v:op==='in'?v.includes(row[k]):true));
  if(values&&table==='delivery_chat_messages'){if(updateFailure)return {data:null,error:{message:'Fixture write outage'}};writes.push({ids:rows.map(m=>m.id),values});rows.forEach(m=>Object.assign(m,values))}
  return {data:single?rows[0]||null:rows.map(m=>({...m})),error:null};
 }
 const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>Promise.resolve(result()).then(resolve);if(key==='maybeSingle'||key==='single')return ()=>Promise.resolve(result(true));return(...args)=>{if(['eq','is','in'].includes(key))filters.push([key,...args]);if(key==='update')values=args[0];return q}}});return q}};
 const ctx=vm.createContext({Deno:{env:{get:()=>undefined},serve:f=>handler=f},createClient:()=>db,Request,Response,Date,Set,Map,console});
 vm.runInContext(stripTypeScriptTypes(read('supabase/functions/nwtb-delivery-chat/index.ts').replace(/^import .*\n/gm,'')),ctx);
 return {messages,writes,async request(body){const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json','x-nwtb-session':'fixture'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()}}};
}
function surface({office=false,messages=[message(1)],hidden=false,audioReady=true,native=false}={}){
 const {document,window:dom}=parseHTML(office?'<html><head></head><body><section id="chatTab"></section></body></html>':'<html><head></head><body><input id="driver" value="1234"><button id="alertsBtn">ALERTS</button><div id="mapHost">Map stays mounted</div></body></html>');
 Object.defineProperties(document,{readyState:{value:'complete'},hidden:{value:hidden,writable:true},visibilityState:{value:hidden?'hidden':'visible',writable:true}});
 dom.HTMLElement.prototype.focus=function(){document._focused=this.id};
 const local=new Map([['nwtb_driver_token','driver-1234'],['nwtb_delivery_driver','1234'],['nwtb_delivery_token','office-fixture']]);
 const requests=[],notifications=[],timers=new Map(),swEvents=new Map(),gates=[];let time=0,tid=0,sounds=0,arms=0,ackFailure=false;
 const setTimer=(fn,ms,interval)=>{const id=++tid;timers.set(id,{fn,ms,at:time+ms,interval});return id};
 async function tick(ms){const target=time+ms;await settle();for(let i=0;i<300;i++){let next;for(const pair of timers)if(pair[1].at<=target&&(!next||pair[1].at<next[1].at))next=pair;if(!next)break;const [id,t]=next;time=t.at;if(t.interval)t.at+=t.ms;else timers.delete(id);await t.fn();await settle()}time=target;await settle()}
 const localStorage={getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)};
 const window={document,frameElement:null,addEventListener:document.addEventListener.bind(document),removeEventListener:document.removeEventListener.bind(document),focus(){},enableAlerts:async()=>{arms++;audioReady=true},nwtbDriverMessageSound:()=>{if(!audioReady)return false;sounds++;return true}};
 const navigator={vibrate(){},serviceWorker:{addEventListener:(name,fn)=>swEvents.set(name,fn),getRegistration:async()=>native?{showNotification:async(title,options)=>notifications.push({title,options})}:null}};
 class Notice{static permission='granted';constructor(title,options){notifications.push({title,options})}}
 window.Notification=Notice;
 const fetch=async(url,options)=>{
  const body=JSON.parse(options.body),token=options.headers['x-nwtb-session'];requests.push({body,token,url});
  const driver=token==='driver-5678'?'5678':'1234';
  let status=200,data={ok:true};
  if(body.action==='driver_unread'){const rows=messages.filter(m=>m.conversation_driver_employee_number===driver&&m.sender_role==='DISPATCH'&&!m.read_by_driver_at);data={ok:true,messages:rows.map(m=>({...m})),unread_count:rows.length}}
  if(body.action==='driver_list')data={ok:true,messages:messages.filter(m=>m.conversation_driver_employee_number===driver).map(m=>({...m})),driver:{display_name:'Fixture driver'}};
  if(body.action==='driver_acknowledge'){
   if(ackFailure){status=500;data={error:'Could not send seen receipt. Please try again.'}}
   else{const rows=messages.filter(m=>body.message_ids.includes(m.id)&&m.conversation_driver_employee_number===driver&&m.sender_role==='DISPATCH');rows.forEach(m=>m.read_by_driver_at||='2026-10-20T17:01:00Z');data={ok:true,receipts:rows.map(m=>({id:m.id,read_by_driver_at:m.read_by_driver_at}))}}
  }
  if(body.action==='driver_send')messages.push({...message(messages.length+10,driver,body.body),sender_role:'DRIVER'});
  if(body.action==='dispatch_threads')data={ok:true,threads:[{driver_employee_number:'1234',driver_name:'Fixture driver',latest:messages[messages.length-1],unread:0}]};
  if(body.action==='dispatch_list')data={ok:true,messages:messages.filter(m=>m.conversation_driver_employee_number===body.driver_employee_number).map(m=>({...m})),driver:{display_name:'Fixture driver'}};
  if(body.action==='mark_dispatch_read')messages.filter(m=>m.sender_role==='DRIVER'&&m.conversation_driver_employee_number===body.driver_employee_number).forEach(m=>m.read_by_dispatch_at='2026-10-20T17:01:00Z');
  const gate=gates.find(g=>g.action===body.action&&!g.used);if(gate){gate.used=true;await new Promise(resolve=>gate.resolve=resolve)}
  return {ok:status<400,status,json:async()=>data};
 };
 const context=vm.createContext({window,document,navigator,localStorage,fetch,Notification:Notice,location:{pathname:office?'/nwtb-route-creator/dispatch-native.html':'/nwtb-route-creator/driver-live.html',hash:''},Date,Set,Map,Promise,console,setInterval:(fn,ms)=>setTimer(fn,ms,true),setTimeout:(fn,ms)=>setTimer(fn,ms,false),clearInterval:id=>timers.delete(id),clearTimeout:id=>timers.delete(id)});
 vm.runInContext(read(office?'dispatch-chat-live.js':'driver-chat-live.js'),context);
 return {document,window,local,messages,requests,notifications,swEvents,tick,get sounds(){return sounds},get arms(){return arms},failAck(v){ackFailure=v},get(id){return document.getElementById(id)},async click(id){await document.getElementById(id).onclick();await settle()},async show(){await window.nwtbDriverChatOpen();await settle()},async refresh(){await window.nwtbDispatchChatRefresh();await settle()},hide(v){document.hidden=v;document.visibilityState=v?'hidden':'visible';document.dispatchEvent(new dom.Event('visibilitychange'))},tap(){document.dispatchEvent(new dom.Event('pointerup'))},defer(action){const gate={action,used:false};gates.push(gate);return {release:()=>gate.resolve?.()}}};
}
(async()=>{
 {
  const b=backend();let r=await b.request({action:'driver_acknowledge',message_ids:[1],driver_employee_number:'5678'});
  eq(r.status,200,'Assigned driver can acknowledge own displayed message');ok(b.messages[0].read_by_driver_at,'Server saves seen timestamp');eq(b.messages[1].read_by_driver_at,null,'Newer unseen message remains unread');eq(b.messages[2].read_by_driver_at,null,'Other driver conversation remains unread');
  const first=b.messages[0].read_by_driver_at;r=await b.request({action:'driver_acknowledge',message_ids:[1,1]});eq(r.status,200,'Receipt retry is idempotent');eq(b.messages[0].read_by_driver_at,first,'Retry preserves original seen timestamp');eq(r.body.receipts.length,1,'Duplicate IDs produce one receipt');
 }
 for(const input of [[],[0],[-1],['1'],[1.5],Array(101).fill(1),null]){
  const b=backend(),r=await b.request({action:'driver_acknowledge',message_ids:input});eq(r.status,400,'Invalid acknowledgment IDs rejected');eq(b.writes.length,0,'Invalid acknowledgment changes no message');
 }
 for(const ids of [[3],[1,3],[4],[999]]){
  const b=backend(),r=await b.request({action:'driver_acknowledge',message_ids:ids});eq(r.status,404,'Foreign, missing or driver-sent message cannot be acknowledged');eq(b.writes.length,0,'Invalid batch leaves own messages unread too');
 }
 for(const action of ['driver_acknowledge','mark_driver_read']){
  const b=backend({employee:'9998'}),r=await b.request({action,message_ids:[1],driver_employee_number:'1234'});eq(r.status,403,'Office cannot impersonate a Driver seen receipt');eq(b.writes.length,0,'Office attempt leaves messages unchanged');
 }
 for(const [options,status]of [[{authenticated:false},401],[{killed:true},423],[{updateFailure:true},500]]){
  const b=backend(options),r=await b.request({action:'driver_acknowledge',message_ids:[1]});eq(r.status,status,'Auth, system lock and write errors fail closed');eq(b.messages[0].read_by_driver_at,null,'Failed acknowledgment remains unread');
 }
 {
  const f=surface({audioReady:false,native:true});await settle();
  ok(f.get('nwtbDriverChatToast').classList.contains('show'),'Incoming Dispatch message opens persistent popup');eq(f.get('nwtbDriverChatSeen').textContent,'MESSAGE SEEN','Driver has explicit MESSAGE SEEN button');eq(f.get('nwtbDriverChatReply').textContent,'REPLY','Driver has explicit REPLY button');
  eq(f.requests.filter(r=>r.body.action==='driver_acknowledge').length,0,'Polling and displaying popup do not mark message seen');
  await f.tick(12000);ok(f.get('nwtbDriverChatToast').classList.contains('show'),'Popup remains beyond old seven-second timeout');eq(f.sounds,0,'Suspended audio is not falsely reported as playing');
  f.tap();await settle();eq(f.sounds,1,'First user tap unlocks shared Driver audio and plays pending alert');ok(f.arms>0,'Chat arms existing Driver audio instead of a separate AudioContext');
  eq(f.notifications.length,1,'Native notification sent only once for new message');eq(f.notifications[0].title,'NWTB — DISPATCH MESSAGE','Native notification identifies Dispatch');
  const map=f.get('mapHost');await f.click('nwtbDriverChatSeen');eq(f.get('mapHost'),map,'Acknowledgment preserves mounted navigation map');ok(f.requests.every(r=>r.url.endsWith('/nwtb-delivery-chat')),'Message buttons do not call route or GPS endpoints');ok(f.messages[0].read_by_driver_at,'MESSAGE SEEN records server receipt');ok(!f.get('nwtbDriverChatToast').classList.contains('show'),'Acknowledged popup closes');ok(!f.get('nwtbDriverChatDrawer').classList.contains('show'),'MESSAGE SEEN keeps chat closed');
  eq(f.requests.find(r=>r.body.action==='driver_acknowledge').body.message_ids,[1],'Popup acknowledges only displayed message');eq(f.local.get('nwtb_delivery_token'),'office-fixture','Driver acknowledgment preserves Office session');
 }
 {
  const f=surface();await settle();await f.click('nwtbDriverChatReply');ok(f.messages[0].read_by_driver_at,'REPLY sends seen receipt');ok(f.get('nwtbDriverChatDrawer').classList.contains('show'),'REPLY opens chat');await f.tick(100);eq(f.document._focused,'nwtbDriverChatInput','Reply input receives focus');
  f.get('nwtbDriverChatInput').value='On my way';await f.click('nwtbDriverChatSend');ok(f.requests.some(r=>r.body.action==='driver_send'&&r.body.body==='On my way'),'Reply still sends through private Driver chat');
 }
 {
  const f=surface({messages:[message(1),message(2)]});await settle();await f.click('nwtbDriverChatSeen');ok(f.messages[0].read_by_driver_at,'First visible queued message is acknowledged');eq(f.messages[1].read_by_driver_at,null,'Second queued message remains unread');ok(f.get('nwtbDriverChatToast').classList.contains('show'),'Second unread message keeps popup visible');await f.click('nwtbDriverChatSeen');ok(!f.get('nwtbDriverChatToast').classList.contains('show'),'Queue closes only after all displayed messages acknowledged');
 }
 {
  const f=surface();await settle();f.failAck(true);await f.click('nwtbDriverChatSeen');eq(f.messages[0].read_by_driver_at,null,'Network failure does not fake a receipt');ok(f.get('nwtbDriverChatToast').classList.contains('show'),'Failed acknowledgment keeps popup visible');ok(f.get('nwtbDriverChatNoticeStatus').textContent.includes('try again'),'Driver sees acknowledgment failure');ok(!f.get('nwtbDriverChatSeen').disabled,'Driver can retry');f.failAck(false);await f.click('nwtbDriverChatSeen');ok(f.messages[0].read_by_driver_at,'Retry succeeds');
 }
 {
  const f=surface({hidden:true});await settle();await f.show();eq(f.messages[0].read_by_driver_at,null,'Background chat does not claim driver saw message');f.hide(false);await settle();ok(f.messages[0].read_by_driver_at,'Visible opened chat acknowledges rendered messages');
 }
 {
  const f=surface();await settle();f.messages.push(message(2));await f.click('nwtbDriverChatSeen');eq(f.messages[1].read_by_driver_at,null,'Message arriving between poll and click stays unread');await f.tick(4000);eq(f.get('nwtbDriverChatNoticeBody').textContent,f.messages[1].body,'New unread message is then displayed');
 }
 {
  const f=surface({messages:[message(1),message(2,'5678','Other Driver message')]});await settle();const gate=f.defer('driver_unread');const ticking=f.tick(4000);await settle();f.local.set('nwtb_driver_token','driver-5678');f.local.set('nwtb_delivery_driver','5678');f.get('driver').value='5678';gate.release();await ticking;await f.tick(4000);
  eq(f.get('nwtbDriverChatNoticeBody').textContent,'Other Driver message','Late old-account response cannot replace new driver popup');await f.click('nwtbDriverChatSeen');eq(f.messages[0].read_by_driver_at,null,'Account switch does not acknowledge previous driver message');ok(f.messages[1].read_by_driver_at,'New driver acknowledgment uses new Driver token');eq(f.local.get('nwtb_delivery_token'),'office-fixture','Account switch leaves Office token unchanged');
 }
 {
  const dangerous='<img src=x onerror=alert(1)>';const f=surface({messages:[message(1,'1234',dangerous)]});await settle();eq(f.get('nwtbDriverChatNoticeBody').textContent,dangerous,'Popup treats message body as text');eq(f.get('nwtbDriverChatNoticeBody').querySelector('img'),null,'Message markup cannot execute');await f.show();eq(f.get('nwtbDriverChatMsgs').querySelector('img'),null,'Drawer escapes message markup too');
 }
 {
  const shared=[message(1)],office=surface({office:true,messages:shared});await office.tick(1);await office.refresh();ok(office.get('dclMsgs').textContent.includes('SENT — AWAITING DRIVER'),'Dispatch initially shows awaiting receipt');
  const driver=surface({messages:shared});await settle();await driver.click('nwtbDriverChatSeen');await office.tick(4000);ok(office.get('dclMsgs').textContent.includes('SEEN BY DRIVER'),'Dispatch poll refreshes receipt after Driver acknowledgment');ok(office.get('dclMsgs').querySelector('.dclReceipt.seen'),'Seen receipt has distinct visual state');ok(office.requests.every(r=>r.token==='office-fixture'),'Dispatch chat continues using only Office token');
 }
 {
  const handlers=new Map(),opened=[],focused=[],posted=[];const self={location:{origin:'https://billyjwiorek-tech.github.io'},registration:{scope:'https://billyjwiorek-tech.github.io/nwtb-route-creator/'},addEventListener:(name,fn)=>handlers.set(name,fn),clients:{matchAll:async()=>[{url:'https://billyjwiorek-tech.github.io/nwtb-route-creator/delivery-live.html',focus:async()=>focused.push('office'),postMessage:m=>posted.push(m)},{url:'https://billyjwiorek-tech.github.io/nwtb-route-creator/driver-live.html',focus:async()=>focused.push('driver'),postMessage:m=>posted.push(m)}],openWindow:async url=>opened.push(url)}};
  vm.runInNewContext(read('nwtb-driver-sw.js'),{self,URL,console});let work;handlers.get('notificationclick')({notification:{tag:'nwtb-driver-chat',data:{url:'/nwtb-route-creator/driver-live.html'},close(){}},waitUntil:p=>work=p});await work;eq(focused,['driver'],'Native notification focuses Driver app rather than Office');eq(posted[0]?.type,'NWTB_OPEN_DRIVER_CHAT','Native click opens Driver chat');eq(opened.length,0,'Existing Driver window reused');
  handlers.get('notificationclick')({notification:{tag:'nwtb-driver-chat',data:{url:'https://other.invalid/driver-live.html'},close(){}},waitUntil:p=>work=p});await work;eq(opened.length,0,'Native click cannot open another origin');
 }
 for(const file of ['delivery-live.html','delivery-standard.html']){
  const {document}=parseHTML(read(file));ok(document.getElementById('fChat').getAttribute('src').startsWith('dispatch-native.html?'),'Office Chat opens current native Dispatch');ok(document.getElementById('fChat').getAttribute('src').endsWith('#chat'),'Office Chat opens private Driver conversations');
 }
 for(const file of ['driver-live.html','driver-standard.html']){
  const html=read(file);ok(html.includes('driver-chat-live.js?v=20261020-presence1'),'Both Driver editions load final message controls');ok(html.includes('window.nwtbDriverMessageSound=function()'),'Both editions share their unlocked route-alert audio');for(const script of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
 }
 for(const file of ['driver-chat-live.js','dispatch-chat-live.js','nwtb-driver-sw.js'])new vm.Script(read(file));
 console.log(checks+' Driver chat acknowledgment and notification checks passed; synthetic data only.');
})().catch(error=>{console.error(error);process.exitCode=1});
