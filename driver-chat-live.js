(()=>{
'use strict';
if(window.__nwtbDriverChatLive)return;window.__nwtbDriverChatLive=true;
const CHAT='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-delivery-chat';
const PUB='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
let open=false,poll=null,lastNotified=0,scopeKey='',generation=0,pending=[],ackBusy=false,pollBusy=false,loadSequence=0,receiptVersion=0,noticeError='',pendingTone=0,arming=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const driverNo=()=>document.getElementById('driver')?.value||localStorage.getItem('nwtb_delivery_driver')||'';
const tok=()=>localStorage.getItem('nwtb_driver_token')||'';
function identity(){return {token:tok(),no:driverNo(),generation}}
function same(s){return s.generation===generation&&s.token===tok()&&s.no===driverNo()}
function valid(s){return !!s.token&&/^\d{4}$/.test(s.no)&&s.no!=='9998'}
function syncIdentity(){
 const key=tok()+'|'+driverNo();
 if(key!==scopeKey){scopeKey=key;generation++;open=false;pending=[];ackBusy=false;pollBusy=false;lastNotified=0;pendingTone=0;noticeError='';loadSequence++;receiptVersion++;
  document.getElementById('nwtbDriverChatDrawer')?.classList.remove('show');document.getElementById('nwtbDriverChatToast')?.classList.remove('show');badge(0);
  const box=document.getElementById('nwtbDriverChatMsgs');if(box)box.textContent='';
 }
 return identity();
}
function visible(){
 if(document.hidden||document.visibilityState==='hidden')return false;
 try{let frame=window.frameElement;for(let depth=0;frame&&depth<5;depth++){
  const view=frame.closest('.view');if(view&&!view.classList.contains('active'))return false;
  frame=frame.ownerDocument.defaultView?.frameElement;
 }}catch{return false}
 return true;
}
async function post(body,s=identity()){
 if(!valid(s))throw Error('Sign in with your employee number to use Dispatch chat.');
 const r=await fetch(CHAT,{method:'POST',headers:{'content-type':'application/json','apikey':PUB,'x-nwtb-session':s.token},body:JSON.stringify(body)}),j=await r.json().catch(()=>({error:'Chat response error'}));
 if(!r.ok||j.ok===false||j.error)throw Error(j.error||'Chat failed');return j;
}
function tone(){try{return window.nwtbDriverMessageSound?.()===true}catch{return false}}
function armAudio(){
 if(arming)return;arming=true;
 try{Promise.resolve(window.enableAlerts?.(false)).then(()=>{
  if(pendingTone&&pending.some(m=>Number(m.id)===pendingTone)&&tone())pendingTone=0;
 }).catch(()=>{}).finally(()=>{arming=false})}catch{arming=false}
}
function notify(m){
 if(!tone())pendingTone=Number(m.id);else pendingTone=0;
 try{navigator.vibrate?.([180,90,260])}catch{}
 if(!('Notification'in window)||Notification.permission!=='granted')return;
 const options={body:String(m.body||'New Dispatch message'),tag:'nwtb-driver-chat',renotify:true,data:{url:location.pathname}};
 const fallback=()=>{try{const n=new Notification('NWTB — DISPATCH MESSAGE',options);n.onclick=()=>{window.focus();show()}}catch{}};
 try{const registration=navigator.serviceWorker?.getRegistration?.();
  if(registration)Promise.resolve(registration).then(r=>r?.showNotification?r.showNotification('NWTB — DISPATCH MESSAGE',options):fallback()).catch(fallback);
  else fallback();
 }catch{fallback()}
}
function renderPending(){
 const el=document.getElementById('nwtbDriverChatToast');if(!el)return;
 const message=pending[0];el.classList.toggle('show',!!message&&!open);
 if(!message)return;
 document.getElementById('nwtbDriverChatNoticeTitle').textContent='DISPATCH MESSAGE'+(pending.length>1?' • '+pending.length+' UNREAD':'');
 document.getElementById('nwtbDriverChatNoticeBody').textContent=String(message.body||'');
 document.getElementById('nwtbDriverChatNoticeMeta').textContent=new Date(message.created_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+' • Please respond when safely parked.';
 document.getElementById('nwtbDriverChatNoticeStatus').textContent=ackBusy?'SENDING SEEN RECEIPT…':noticeError;
 document.getElementById('nwtbDriverChatSeen').disabled=ackBusy;document.getElementById('nwtbDriverChatReply').disabled=ackBusy;
}
function inject(){
 if(document.getElementById('nwtbDriverChatBtn'))return;
 const style=document.createElement('style');style.textContent="\n#nwtbDriverChatBtn{position:fixed;right:16px;bottom:16px;z-index:90000;border:0;border-radius:999px;background:#0f172a;color:#fff;padding:13px 17px;font-weight:900;box-shadow:0 10px 28px rgba(15,23,42,.28);cursor:pointer}#nwtbDriverChatBtn .badge{display:none;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#dc2626;color:#fff;align-items:center;justify-content:center;font-size:11px;margin-left:6px}#nwtbDriverChatBtn .badge.show{display:inline-flex}\n#nwtbDriverChatDrawer{position:fixed;right:14px;bottom:72px;width:min(410px,calc(100vw - 28px));height:min(620px,72vh);z-index:90001;background:#fff;border:1px solid #d0d5dd;border-radius:18px;box-shadow:0 24px 70px rgba(15,23,42,.35);display:none;overflow:hidden}#nwtbDriverChatDrawer.show{display:flex;flex-direction:column}.dcHead{padding:14px 15px;background:#0f172a;color:#fff;display:flex;justify-content:space-between;align-items:center}.dcHead b{font-size:15px}.dcHead small{display:block;color:#cbd5e1;margin-top:2px}.dcClose{border:0;background:#fff;color:#0f172a;border-radius:8px;padding:7px 9px;font-weight:900}.dcMsgs{flex:1;overflow:auto;padding:12px;background:#f8fafc}.dcMsg{max-width:86%;margin:7px 0;padding:9px 11px;border-radius:12px;background:#fff;border:1px solid #e4e7ec;font-size:13px;line-height:1.35}.dcMsg.me{margin-left:auto;background:#dbeafe;border-color:#bfdbfe}.dcMeta{font-size:9px;color:#667085;margin-bottom:3px;font-weight:800}.dcSend{display:flex;gap:7px;padding:10px;background:#fff;border-top:1px solid #e4e7ec}.dcSend textarea{flex:1;min-height:42px;max-height:90px;resize:none;border:1px solid #d0d5dd;border-radius:10px;padding:10px;font:inherit}.dcSend button{border:0;border-radius:10px;background:#2563eb;color:#fff;font-weight:900;padding:0 16px}.dcStatus{font-size:10px;color:#667085;padding:0 11px 9px;background:#fff}\n#nwtbDriverChatToast{position:fixed;left:50%;bottom:82px;transform:translateX(-50%);display:none;z-index:100005;width:min(520px,94vw);max-height:48vh;overflow:auto;border:2px solid #f59e0b;border-radius:16px;background:#0f172a;color:#fff;padding:16px;box-shadow:0 12px 34px rgba(15,23,42,.35)}#nwtbDriverChatToast.show{display:block}.dcNoticeTitle{font-size:14px;font-weight:950;color:#fbbf24}.dcNoticeBody{white-space:pre-wrap;overflow-wrap:anywhere;font-size:16px;line-height:1.4;margin:10px 0}.dcNoticeMeta{font-size:11px;color:#cbd5e1}.dcNoticeActions{display:flex;gap:10px;margin-top:14px}.dcNoticeActions button{flex:1;border:0;border-radius:10px;min-height:48px;padding:12px 8px;font-size:13px;font-weight:950;cursor:pointer}.dcNoticeSeen{background:#22c55e;color:#052e16}.dcNoticeReply{background:#fff;color:#0f172a}.dcNoticeActions button:disabled{opacity:.6}.dcNoticeStatus{font-size:12px;color:#fde68a;margin-top:8px}\n@media(max-width:720px){#nwtbDriverChatBtn{right:10px;bottom:10px;padding:12px 14px}#nwtbDriverChatDrawer{right:0;bottom:0;width:100vw;height:72vh;border-radius:18px 18px 0 0}.dcSend button{padding:0 13px}}\n";document.head.appendChild(style);
 const button=document.createElement('button');button.id='nwtbDriverChatBtn';button.innerHTML='💬 DISPATCH CHAT <span class="badge" id="nwtbDriverChatBadge">0</span>';button.onclick=()=>show();document.body.appendChild(button);
 const drawer=document.createElement('div');drawer.id='nwtbDriverChatDrawer';drawer.innerHTML='<div class="dcHead"><div><b>Dispatch Chat</b><small id="nwtbDriverChatWho">Driver conversation</small></div><button class="dcClose" id="nwtbDriverChatClose">CLOSE</button></div><div class="dcMsgs" id="nwtbDriverChatMsgs"></div><div class="dcSend"><textarea id="nwtbDriverChatInput" maxlength="1000" placeholder="Message Dispatch..."></textarea><button id="nwtbDriverChatSend">SEND</button></div><div class="dcStatus" id="nwtbDriverChatStatus"></div>';document.body.appendChild(drawer);
 document.getElementById('nwtbDriverChatClose').onclick=close;document.getElementById('nwtbDriverChatSend').onclick=send;
 document.getElementById('nwtbDriverChatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
 const notice=document.createElement('div');notice.id='nwtbDriverChatToast';notice.setAttribute('role','alertdialog');notice.setAttribute('aria-label','Dispatch message');notice.setAttribute('aria-modal','false');
 notice.innerHTML='<div class="dcNoticeTitle" id="nwtbDriverChatNoticeTitle">DISPATCH MESSAGE</div><div class="dcNoticeBody" id="nwtbDriverChatNoticeBody"></div><div class="dcNoticeMeta" id="nwtbDriverChatNoticeMeta"></div><div class="dcNoticeActions"><button class="dcNoticeSeen" id="nwtbDriverChatSeen">MESSAGE SEEN</button><button class="dcNoticeReply" id="nwtbDriverChatReply">REPLY</button></div><div class="dcNoticeStatus" id="nwtbDriverChatNoticeStatus" role="status"></div>';document.body.appendChild(notice);
 document.getElementById('nwtbDriverChatSeen').onclick=()=>acknowledge(false);document.getElementById('nwtbDriverChatReply').onclick=()=>acknowledge(true);
}
function badge(n){const b=document.getElementById('nwtbDriverChatBadge');if(!b)return;b.textContent=String(n);b.classList.toggle('show',n>0)}
async function acknowledgeIds(ids,s){
 if(!ids.length)return;
 const j=await post({action:'driver_acknowledge',message_ids:ids},s);
 if(!same(s))return;
 const receipts=j.receipts||[];
 if(!ids.every(id=>receipts.some(r=>Number(r.id)===id&&r.read_by_driver_at)))throw Error('Seen receipt was not confirmed. Please try again.');
 receiptVersion++;pending=pending.filter(m=>!ids.includes(Number(m.id)));badge(pending.length);
 if(!pending.some(m=>Number(m.id)===pendingTone))pendingTone=0;
 renderPending();
}
async function acknowledge(reply){
 const s=syncIdentity();if(ackBusy||!pending.length||!valid(s))return;
 const id=Number(pending[0].id);ackBusy=true;noticeError='';renderPending();armAudio();
 try{await acknowledgeIds([id],s);if(!same(s))return;if(reply)await show()}
 catch(e){if(same(s))noticeError=e.message}
 finally{if(same(s)){ackBusy=false;renderPending()}}
}
async function load(){
 const s=syncIdentity(),sequence=++loadSequence;if(!valid(s))return;
 try{
  const j=await post({action:'driver_list',driver_employee_number:s.no},s);if(!same(s)||sequence!==loadSequence||!open)return;
  const messages=j.messages||[],box=document.getElementById('nwtbDriverChatMsgs');document.getElementById('nwtbDriverChatWho').textContent=j.driver?.display_name||'Driver conversation';
  box.innerHTML=messages.map(m=>'<div class="dcMsg '+(m.sender_role==='DRIVER'?'me':'')+'"><div class="dcMeta">'+esc(m.sender_role==='DRIVER'?'YOU':'DISPATCH')+' • '+esc(new Date(m.created_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}))+'</div>'+esc(m.body)+'</div>').join('')||'<div class="dcMsg">No messages yet. Send Dispatch a message here.</div>';box.scrollTop=box.scrollHeight;
  document.getElementById('nwtbDriverChatStatus').textContent='';
  if(visible()&&open)await acknowledgeIds(messages.filter(m=>m.sender_role==='DISPATCH'&&!m.read_by_driver_at).map(m=>Number(m.id)),s);
 }catch(e){if(same(s))document.getElementById('nwtbDriverChatStatus').textContent=e.message}
}
async function show(){
 inject();const s=syncIdentity();armAudio();open=true;document.getElementById('nwtbDriverChatDrawer').classList.add('show');renderPending();
 if(!valid(s)){document.getElementById('nwtbDriverChatStatus').textContent='Sign in with your employee number to use Dispatch chat.';return}
 await load();if(same(s)&&open)setTimeout(()=>{if(same(s)&&open)document.getElementById('nwtbDriverChatInput')?.focus()},80);
}
function close(){open=false;loadSequence++;document.getElementById('nwtbDriverChatDrawer')?.classList.remove('show');renderPending()}
async function send(){
 const s=syncIdentity(),input=document.getElementById('nwtbDriverChatInput'),body=input?.value.trim();if(!body)return;
 try{document.getElementById('nwtbDriverChatStatus').textContent='Sending…';await post({action:'driver_send',driver_employee_number:s.no,body},s);if(!same(s))return;input.value='';document.getElementById('nwtbDriverChatStatus').textContent='';await load()}
 catch(e){if(same(s))document.getElementById('nwtbDriverChatStatus').textContent=e.message}
}
async function check(){
 const s=syncIdentity();if(!valid(s)||pollBusy||ackBusy)return;pollBusy=true;const version=receiptVersion;
 try{
  const j=await post({action:'driver_unread',driver_employee_number:s.no},s);if(!same(s)||version!==receiptVersion||ackBusy)return;
  pending=(j.messages||[]).filter(m=>m.sender_role==='DISPATCH'&&!m.read_by_driver_at).sort((a,b)=>Number(a.id)-Number(b.id));badge(Number(j.unread_count||pending.length));renderPending();
  const newest=pending[pending.length-1];
  if(newest&&Number(newest.id)>lastNotified){lastNotified=Number(newest.id);if(!open||!visible())notify(newest)}
  if(open&&visible()&&pending.length)await load();
 }catch(e){if(same(s)&&open)document.getElementById('nwtbDriverChatStatus').textContent=e.message}
 finally{if(same(s))pollBusy=false}
}
window.nwtbDriverChatClose=close;window.nwtbDriverChatSend=send;window.nwtbDriverChatOpen=show;
function boot(){
 inject();syncIdentity();check();if(!poll)poll=setInterval(check,4000);
 document.addEventListener('pointerup',armAudio,true);document.addEventListener('touchend',armAudio,{capture:true,passive:true});document.addEventListener('keydown',armAudio,true);
 document.addEventListener('visibilitychange',()=>{if(visible()){if(open)load();check()}});
 window.addEventListener('focus',()=>{if(visible()){if(open)load();check()}});
 window.addEventListener('pageshow',()=>check());window.addEventListener('storage',()=>check());
 navigator.serviceWorker?.addEventListener?.('message',e=>{if(e.data?.type==='NWTB_OPEN_DRIVER_CHAT')show()});
 if(location.hash==='#chat')show();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();