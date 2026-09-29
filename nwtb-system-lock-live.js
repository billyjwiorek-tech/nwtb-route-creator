(()=>{
'use strict';
if(window.__nwtbSystemLockLive)return;window.__nwtbSystemLockLive=true;
const CTRL='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-system-control';
const KEY='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
const EXACT_MESSAGE='NWTB DELIVERY SYSTEM KILLED!!! FUCK YOU PAY ME🖕🖕🖕🖕🖕';
const script=document.currentScript;
const allowControl=script?.dataset?.control==='1';
let killed=false,lastStatus=null,timer=null;

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const token=()=>localStorage.getItem('nwtb_delivery_token')||'';
async function call(action,payload={}){
 const headers={'content-type':'application/json','apikey':KEY};
 const t=token();if(t)headers['x-nwtb-session']=t;
 const r=await fetch(CTRL,{method:'POST',cache:'no-store',headers,body:JSON.stringify({action,...payload})});
 const j=await r.json().catch(()=>({error:'Invalid system-control response.'}));
 if(!r.ok)throw Error(j.error||'System-control request failed.');
 return j;
}
function styleOnce(){
 if(document.getElementById('nwtbSystemLockStyle'))return;
 const s=document.createElement('style');s.id='nwtbSystemLockStyle';s.textContent=`
 #nwtbSystemLockOverlay{position:fixed;inset:0;z-index:2147483647;background:#070707;color:#fff;display:none;align-items:center;justify-content:center;padding:28px;text-align:center;font-family:Arial,sans-serif}
 #nwtbSystemLockOverlay.show{display:flex}
 #nwtbSystemLockCard{width:min(1050px,96vw);border:4px solid #ef4444;border-radius:22px;background:#111;padding:46px 30px;box-shadow:0 30px 90px rgba(0,0,0,.75)}
 #nwtbSystemLockMessage{font-size:clamp(30px,6vw,74px);line-height:1.05;font-weight:1000;letter-spacing:.4px;color:#fff;text-transform:uppercase;word-break:break-word}
 #nwtbSystemLockSub{margin-top:24px;font-size:13px;font-weight:850;color:#fca5a5;letter-spacing:.7px}
 .nwtbSystemControlBtn{position:fixed;right:14px;bottom:14px;z-index:2147483000;border:0;border-radius:11px;background:#991b1b;color:white;padding:11px 14px;font:900 11px/1 Arial,sans-serif;letter-spacing:.5px;box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer}
 .nwtbRecoveryBtn{margin-top:28px;border:2px solid #fff;border-radius:11px;background:#fff;color:#111;padding:13px 18px;font:950 12px/1 Arial,sans-serif;letter-spacing:.5px;cursor:pointer}
 @media(max-width:600px){#nwtbSystemLockCard{padding:34px 18px}#nwtbSystemLockMessage{font-size:clamp(28px,10vw,48px)}.nwtbSystemControlBtn{right:10px;bottom:10px}}
 `;document.head.appendChild(s);
}
function ensureOverlay(){
 styleOnce();let o=document.getElementById('nwtbSystemLockOverlay');if(o)return o;
 o=document.createElement('div');o.id='nwtbSystemLockOverlay';o.innerHTML=`<div id="nwtbSystemLockCard"><div id="nwtbSystemLockMessage">${esc(EXACT_MESSAGE)}</div><div id="nwtbSystemLockSub">NWTB DELIVERY SYSTEM IS LOCKED</div>${allowControl?'<button class="nwtbRecoveryBtn" id="nwtbRecoveryBtn">ADMIN RECOVERY</button>':''}</div>`;
 document.body.appendChild(o);
 if(allowControl){const b=document.getElementById('nwtbRecoveryBtn');if(b)b.onclick=reactivate;}
 return o;
}
function render(state){
 const o=ensureOverlay();killed=!!state?.killed;lastStatus=state;
 if(killed){document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';o.classList.add('show');}
 else{o.classList.remove('show');document.documentElement.style.overflow='';document.body.style.overflow='';}
}
async function check(){
 try{const j=await call('status');render(j)}catch(e){console.warn('NWTB system status check failed:',e?.message||e)}
}
async function killSystem(){
 if(killed){alert('The NWTB Delivery System is already killed.');return;}
 const pin=prompt('NWTB SYSTEM CONTROL\n\nEnter management PIN:');if(pin===null)return;
 const phrase=prompt('TYPE THE KILL PHRASE TO KILL THE NWTB DELIVERY SYSTEM:');if(phrase===null)return;
 if(!confirm('FINAL CONFIRMATION\n\nKill the NWTB Delivery System now?'))return;
 try{const j=await call('kill',{pin:String(pin).trim(),phrase});render(j)}catch(e){alert(e.message||'Could not kill the NWTB Delivery System.')}
}
async function reactivate(){
 const pin=prompt('NWTB ADMIN RECOVERY\n\nEnter management PIN:');if(pin===null)return;
 const phrase=prompt('TYPE THE REACTIVATION PHRASE:');if(phrase===null)return;
 if(!confirm('Reactivate the NWTB Delivery System now?'))return;
 try{const j=await call('reactivate',{pin:String(pin).trim(),phrase});render(j);if(!j.killed)alert('NWTB DELIVERY SYSTEM REACTIVATED.');}
 catch(e){alert(e.message||'Could not reactivate the NWTB Delivery System.')}
}
function installControl(){
 if(!allowControl||document.getElementById('nwtbSystemControlBtn'))return;
 styleOnce();const b=document.createElement('button');b.id='nwtbSystemControlBtn';b.className='nwtbSystemControlBtn';b.textContent='SYSTEM CONTROL';b.onclick=killSystem;document.body.appendChild(b);
}
window.nwtbKillSystem=killSystem;
window.nwtbReactivateSystem=reactivate;
window.nwtbCheckSystemState=check;
installControl();ensureOverlay();check();timer=setInterval(check,2500);
window.addEventListener('focus',check);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
})();
