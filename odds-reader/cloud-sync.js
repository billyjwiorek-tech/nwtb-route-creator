/* Odds Reader Lab — private, encrypted sync using 32 random recovery bytes. */
(function(){
'use strict';
var bridge=window.OddsReaderCloudBridge;
if(!bridge||!window.crypto||!crypto.subtle)return;
var $=function(id){return document.getElementById(id)},tabs=document.querySelector('.tabs');
var KEY='oddsreader_cloud_recovery_v1',secret='',account='',aes=null,busy=false,lastSync=0,lastData='',timer=null;
function encode(bytes){var a='';bytes.forEach(function(b){a+=String.fromCharCode(b)});return btoa(a).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function decode(s){if(!/^[A-Za-z0-9_-]+$/.test(s))throw Error('Invalid key format');return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),function(x){return x.charCodeAt(0)})}
function status(s,error){$('clMessage').textContent=s;$('clMessage').style.color=error?'#ffaaaa':'#b8f1d8'}
function showState(){
 $('clBadge').textContent=account?'Connected • encryption enabled':'Not connected';
 $('clFingerprint').textContent=account?'Account ID: '+account.slice(0,9)+'…'+account.slice(-8):'';
 $('clLast').textContent=lastSync?'Last successful sync: '+new Date(lastSync).toLocaleString():'Not synchronized yet';
 $('clCopy').disabled=!account;
 $('clSync').disabled=!account||busy;
 $('clDisconnect').disabled=!account||busy;
 $('clMake').disabled=busy;
 $('clJoin').disabled=busy;
}
async function prepare(text){
 var bytes=decode(text.trim());
 if(bytes.length!==32)throw Error('Recovery key must represent 32 random bytes.');
 var digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 account=Array.from(digest).map(function(v){return v.toString(16).padStart(2,'0')}).join('');
 aes=await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
 secret=text.trim();
 try{localStorage.setItem(KEY,secret)}catch(e){throw Error('Browser storage is unavailable')}
 showState();
}
async function encrypt(data){
 var iv=crypto.getRandomValues(new Uint8Array(12));
 var cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:iv},aes,new TextEncoder().encode(JSON.stringify(data))));
 return {version:1,iv:encode(iv),data:encode(cipher)}
}
async function decrypt(e){
 if(!e||e.version!==1)throw Error('Unrecognized backup');
 var plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(e.iv)},aes,decode(e.data));
 return JSON.parse(new TextDecoder().decode(plain))
}
async function api(op,encrypted){
 var r=await fetch('./api/cloud-sync',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:op,id:account,encrypted:encrypted})});
 var data=await r.json();
 if(!r.ok)throw Error(data.error||'Cloud sync unavailable');
 return data;
}
async function sync(){
 if(!account||busy||document.hidden)return;
 busy=true;showState();status('Syncing encrypted cloud data…');
 try{
  var result=await api('pull'),snapshots=[];
  for(var entry of (result.snapshots||[])){
   try{var doc=await decrypt(entry.encrypted);if(doc&&doc.format===1&&Array.isArray(doc.history))snapshots.push(doc)}catch(e){}
  }
  snapshots.forEach(function(doc){bridge.merge(doc)});
  var local=bridge.read(),signature=JSON.stringify(local);
  if(!snapshots.some(function(doc){return JSON.stringify(doc)===signature})){
   await api('push',await encrypt(local));
   status('Cloud sync complete. '+local.history.length+' saved parlays • encrypted changes uploaded.');
  }else status('Cloud sync complete. '+local.history.length+' saved parlays • already up to date.');
  lastData=signature;lastSync=Date.now();
 }catch(e){status('Sync failed: '+(e.message||e)+'. Your local history remains safe.',true)}
 finally{busy=false;showState()}
}
var tab=document.createElement('button');tab.type='button';tab.id='clTab';tab.textContent='Cloud Sync';tabs.appendChild(tab);
var panel=document.createElement('section');panel.id='clPanel';panel.hidden=true;
panel.innerHTML=
'<h1>Encrypted Cloud Sync</h1><p>Share your Odds Reader history and saved settings across phone and PC with one private recovery key.</p>'+
'<div class="notice"><b>How it works:</b> Your data and Odds API key are encrypted on your device before going to private cloud storage. Your 256-bit recovery key is never uploaded. Anyone with this recovery key can access your account, so keep it private.</div>'+
'<div class="grid"><div class="card"><h2>1. Connect a device</h2>'+
'<button class="btn primary full" id="clMake">Create my sync recovery key</button>'+
'<button class="btn full" id="clCopy">Copy my recovery key</button>'+
'<label>Already created a key on your other device? Paste it here<input id="clInput" type="password" autocomplete="off" placeholder="Paste your 43-character recovery key"></label>'+
'<div class="actions"><button class="btn primary" id="clJoin">Connect this device</button><button class="btn" id="clShow">Show / hide key</button></div>'+
'<p class="hint">Create the recovery key on your first device and copy it somewhere safe. On the second device, use Connect this device with the SAME key. If you lose it on every device, the cloud backup cannot be recovered.</p></div>'+
'<div class="card"><h2>2. Sync status</h2><div class="metric"><small>Device status</small><strong id="clBadge" style="font-size:18px">Not connected</strong></div>'+
'<p class="hint" id="clFingerprint"></p><p class="hint" id="clLast"></p><div class="notice" id="clMessage" role="status">Not connected yet.</div>'+
'<button class="btn primary full" id="clSync">Sync now</button><button class="btn full" id="clDisconnect">Disconnect this device</button>'+
'<p class="hint">The app checks when reopened, after saved changes, and about every 20 minutes while open (and after local changes). It does not update while closed. Browser-local records stay available offline.</p></div></div>'+
'<div class="card" style="margin-top:14px"><h2>Security</h2><p>Private Vercel Blob storage with AES-256-GCM encryption in your browser. Device recovery keys are stored locally so you do not need to re-enter one each session. Do not use cloud sync on shared browsers. Concurrent edits can conflict; export a backup before important changes.</p></div>';
document.querySelector('main footer').before(panel);
function show(){
 ['builder','reader','history','feed','historyLab','p2'].forEach(function(id){var e=$(id);if(e)e.hidden=true});
 panel.hidden=false;tabs.querySelectorAll('button').forEach(function(b){b.classList.toggle('active',b===tab)});
 window.scrollTo({top:0,behavior:'instant'});showState();
 if(account&&Date.now()-lastSync>30000)sync();
}
tab.addEventListener('click',show);
tabs.querySelectorAll('button:not(#clTab)').forEach(function(b){b.addEventListener('click',function(){panel.hidden=true;tab.classList.remove('active')})});
$('clMake').onclick=async function(){
 if(account&&!confirm('Creating a new recovery key starts a DIFFERENT cloud account. Continue?'))return;
 try{
  var bytes=crypto.getRandomValues(new Uint8Array(32)),key=encode(bytes);
  await prepare(key);$('clInput').value=key;$('clInput').type='text';
  status('NEW ACCOUNT: COPY YOUR RECOVERY KEY NOW and store it safely. Creating your first encrypted backup…');
  await sync();
 }catch(e){status(e.message,true)}
};
$('clJoin').onclick=async function(){
 try{await prepare($('clInput').value);$('clInput').value='';status('Connecting to your cloud backup…');await sync()}
 catch(e){status(e.message,true)}
};
$('clShow').onclick=function(){$('clInput').type=$('clInput').type==='text'?'password':'text'};
$('clCopy').onclick=async function(){
 if(!secret)return;
 try{await navigator.clipboard.writeText(secret);status('Recovery key copied. Paste it into the second device or save it securely.')}
 catch(e){$('clInput').value=secret;$('clInput').type='text';status('Clipboard unavailable. Copy the key shown above.',true)}
};
$('clSync').onclick=sync;
$('clDisconnect').onclick=function(){
 if(!confirm('Disconnect this device? Keep a copy of your recovery key. Local records will remain.'))return;
 try{localStorage.removeItem(KEY)}catch(e){}
 account='';aes=null;secret='';lastData='';$('clInput').value='';status('Disconnected. Your local records remain.');showState()
};
window.addEventListener('oddsreader:local-change',function(){
 if(!account||busy)return;
 if(timer)clearTimeout(timer);
 timer=setTimeout(function(){if(account&&!busy&&JSON.stringify(bridge.read())!==lastData)sync()},10000);
});
setInterval(function(){if(account&&!busy&&!document.hidden&&Date.now()-lastSync>=1200000)sync()},1200000);
document.addEventListener('visibilitychange',function(){if(!document.hidden&&account&&Date.now()-lastSync>120000)sync()});
(async function(){try{var old=localStorage.getItem(KEY);if(old){await prepare(old);status('Recovery key restored from this device. Checking cloud…');await sync()}}catch(e){status('Stored recovery key could not be loaded: '+e.message,true)}showState()})();
})();