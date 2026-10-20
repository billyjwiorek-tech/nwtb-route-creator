(function(){
'use strict';
// One Office alert host across all views; embedded Dispatch must not sound a second alarm.
try{if(window.parent!==window&&window.parent.NWTBOfficeAlertsHost)return}catch{}
if(window.NWTBOfficeRouteAlerts)return;
const TRACK='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-delivery-tracking';
const KEY='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
const CURSOR='nwtb_office_route_alert_cursor_v2',PENDING='nwtb_office_route_alert_pending_v2',MUTED='nwtb_office_route_alert_muted_v2';
const TYPES=new Set(['ROUTE_PAUSED','ROUTE_RESUMED','ROUTE_COMPLETED']);
const token=()=>localStorage.getItem('nwtb_delivery_token')||'';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
function readPending(){try{const a=JSON.parse(localStorage.getItem(PENDING)||'[]');return Array.isArray(a)?a.filter(e=>Number(e?.id)>0&&TYPES.has(e.event_type)).slice(-100):[]}catch{return []}}
let pending=readPending(),last=Math.max(0,Number(localStorage.getItem(CURSOR))||0),primed=false,busy=false,audio=null,playing=null,waitingForSound=false,muted=localStorage.getItem(MUTED)==='1';
function connection(text){const el=document.getElementById('officeRouteAlertConnection');if(el){el.textContent=text;el.className=text==='ALERTS LIVE'?'ready':'needs';el.title='Last checked '+new Date().toLocaleTimeString('en-US',{timeZone:'America/Chicago'})+' CT'}}
function persist(){try{localStorage.setItem(PENDING,JSON.stringify(pending));localStorage.setItem(CURSOR,String(last))}catch{}}
function soundState(){const el=document.getElementById('officeRouteSoundStatus'),button=document.getElementById('officeRouteSoundEnable');if(!el||!button)return;const ready=audio?.state==='running'&&!muted;button.textContent=ready?'TEST 7-SECOND SOUND':'ENABLE 7-SECOND SOUND';el.textContent=muted?'SOUND MUTED':playing?'7-SECOND ALERT PLAYING':ready?'SOUND READY':'CLICK ENABLE SOUND';el.className=ready?'ready':'needs';const mute=document.getElementById('officeRouteSoundMute');if(mute)mute.textContent=muted?'UNMUTE':'MUTE'}
function stopSound(){const old=playing;playing=null;if(old){try{old.gain.gain.cancelScheduledValues(audio.currentTime);old.gain.gain.setValueAtTime(0,audio.currentTime);old.osc.stop()}catch{}}soundState()}
function playSound(){
 if(muted)return false;
 if(!audio||audio.state!=='running'){waitingForSound=true;soundState();return false}
 if(playing)return true;
 const start=audio.currentTime,end=start+7,osc=audio.createOscillator(),gain=audio.createGain();
 osc.type='triangle';gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(.22,start+.02);gain.gain.setValueAtTime(.22,end-.03);gain.gain.linearRampToValueAtTime(.0001,end);
 for(let t=0,i=0;t<7;t+=.45,i++)osc.frequency.setValueAtTime(i%2?1040:780,start+t);
 osc.connect(gain);gain.connect(audio.destination);const entry={osc,gain};playing=entry;waitingForSound=false;
 osc.onended=()=>{try{osc.disconnect();gain.disconnect()}catch{}if(playing===entry)playing=null;soundState()};
 // Schedule on the audio clock, so a throttled background-tab timer cannot prolong the alarm.
 osc.start(start);osc.stop(end);soundState();return true
}
async function enableSound(){try{muted=false;localStorage.setItem(MUTED,'0');const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('Sound is not supported by this browser.');if(!audio||audio.state==='closed'){audio=new AC();audio.onstatechange=soundState}if(audio.state!=='running')await audio.resume();stopSound();playSound();soundState()}catch(e){const el=document.getElementById('officeRouteSoundStatus');if(el)el.textContent=e.message||'Click ENABLE SOUND again.'}}
function title(e){if(e.event_type==='ROUTE_COMPLETED')return 'RETURN TO NWTB';return e.event_type==='ROUTE_PAUSED'?'ROUTE PAUSED':'ROUTE RESUMED'}
function description(e){if(e.event_type==='ROUTE_COMPLETED')return 'Final stop marked complete. Assigned return leg: '+(e.return_depot_name||'NWTB')+'.';return e.event_type==='ROUTE_PAUSED'?e.note||'Driver paused the route.':'Driver resumed the route.'}
function time(value){try{return new Date(value).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' CT'}catch{return String(value||'')}}
function render(){const panel=document.getElementById('officeRouteAlertPanel'),rows=document.getElementById('officeRouteAlertRows'),badge=document.getElementById('officeRouteAlertBadge');if(!panel||!rows)return;rows.innerHTML=pending.slice().reverse().map(e=>'<article class="officeRouteAlert '+(e.event_type==='ROUTE_COMPLETED'?'returning':'')+'"><strong>'+esc(title(e))+' — '+esc(e.driver_name||e.employee_number||'Driver')+'</strong><p>'+esc(description(e))+'</p><small>'+esc(time(e.created_at))+'</small></article>').join('');badge.textContent='ROUTE ALERTS'+(pending.length?' ('+pending.length+')':'');badge.classList.toggle('unread',pending.length>0);panel.hidden=pending.length===0;soundState()}
function acknowledge(){pending=[];waitingForSound=false;persist();stopSound();render()}
function ensure(){if(document.getElementById('officeRouteAlertToolbar'))return;
 const s=document.createElement('style');s.id='officeRouteAlertStyle';s.textContent=`
 #officeRouteAlertToolbar{display:flex;flex-wrap:wrap;gap:5px;align-items:center;position:fixed;right:12px;top:8px;z-index:11000;font-family:Arial,sans-serif}#officeRouteAlertToolbar.inHeader{position:static;max-width:460px}#officeRouteAlertToolbar button{border:1px solid #d0d5dd;border-radius:8px;background:#fff;color:#182230;padding:7px 9px;font-size:10px;font-weight:900;cursor:pointer}#officeRouteAlertToolbar #officeRouteSoundEnable{background:#175cd3;color:#fff;border-color:#175cd3}#officeRouteAlertBadge.unread{background:#fff4e5!important;color:#93370d!important;border-color:#f79009!important}#officeRouteAlertConnection{font-size:9px;font-weight:850}#officeRouteAlertConnection.ready{color:#067647}#officeRouteAlertConnection.needs{color:#b54708}#officeRouteSoundStatus{font-size:9px;font-weight:850;width:100%;text-align:right}#officeRouteSoundStatus.ready{color:#067647}#officeRouteSoundStatus.needs{color:#b54708}
 #officeRouteAlertPanel{position:fixed;right:16px;top:88px;z-index:21000;width:min(470px,calc(100vw - 32px));max-height:75vh;overflow:auto;background:#fff;border:2px solid #15803d;border-radius:14px;box-shadow:0 18px 50px #10182855;padding:15px;color:#182230;font-family:Arial,sans-serif}#officeRouteAlertPanel[hidden]{display:none}#officeRouteAlertPanel h2{font-size:17px;margin:0 0 5px}#officeRouteAlertPanel .hint{font-size:11px;line-height:1.4;color:#475467;margin:0 0 10px}.officeRouteAlert{padding:12px;border:1px solid #f79009;border-left:5px solid #f79009;border-radius:9px;background:#fffaeb;margin:10px 0}.officeRouteAlert.returning{border-color:#12b76a;background:#ecfdf3}.officeRouteAlert strong{font-size:14px;display:block}.officeRouteAlert p{font-size:12px;line-height:1.5;margin:6px 0}.officeRouteAlert small{font-size:10px;color:#667085}#officeRouteAlertAck{width:100%;padding:12px;border:0;border-radius:9px;background:#15803d;color:#fff;font-weight:900;cursor:pointer}
 @media(max-width:720px){#officeRouteAlertToolbar.inHeader{max-width:250px;gap:3px}#officeRouteAlertToolbar button{padding:6px;font-size:8px}#officeRouteAlertConnection{font-size:9px;font-weight:850}#officeRouteAlertConnection.ready{color:#067647}#officeRouteAlertConnection.needs{color:#b54708}#officeRouteSoundStatus{font-size:8px}#officeRouteAlertPanel{top:78px;right:8px;width:calc(100vw - 16px)}}
 `;document.head.appendChild(s);
 const toolbar=document.createElement('div');toolbar.id='officeRouteAlertToolbar';toolbar.innerHTML='<button id="officeRouteSoundEnable" type="button">ENABLE 7-SECOND SOUND</button><button id="officeRouteSoundMute" type="button">MUTE</button><button id="officeRouteAlertBadge" type="button">ROUTE ALERTS</button><span id="officeRouteSoundStatus" role="status"></span><span id="officeRouteAlertConnection" role="status">WAITING FOR OFFICE</span>';const header=document.querySelector('.topright');if(header){toolbar.className='inHeader';header.prepend(toolbar)}else document.body.appendChild(toolbar);
 const panel=document.createElement('section');panel.id='officeRouteAlertPanel';panel.hidden=true;panel.setAttribute('aria-label','Office route alerts');panel.setAttribute('aria-live','assertive');panel.innerHTML='<h2>NWTB DRIVER ROUTE ALERT</h2><p class="hint">Return notices sound for 7 seconds when sound is enabled. Alerts stay here until acknowledged.</p><div id="officeRouteAlertRows"></div><button id="officeRouteAlertAck" type="button">ACKNOWLEDGE ALERTS</button>';document.body.appendChild(panel);
 document.getElementById('officeRouteSoundEnable').onclick=enableSound;document.getElementById('officeRouteAlertAck').onclick=acknowledge;document.getElementById('officeRouteAlertBadge').onclick=()=>{if(pending.length){panel.hidden=false;panel.scrollIntoView?.({block:'nearest'})}};
 document.getElementById('officeRouteSoundMute').onclick=()=>{muted=!muted;try{localStorage.setItem(MUTED,muted?'1':'0')}catch{}if(muted)stopSound();else if(waitingForSound)enableSound();soundState()};render()
}
async function poll(){
 if(busy)return;if(!token()){connection('WAITING FOR OFFICE');return}busy=true;
 try{for(let batch=0;batch<4;batch++){
  const session=token(),bootstrap=!primed&&last===0;
  const r=await fetch(TRACK,{method:'POST',cache:'no-store',headers:{'content-type':'application/json','apikey':KEY,'x-nwtb-session':session},body:JSON.stringify({action:'office_route_alerts',after_id:last,include_returns:true,bootstrap})});
  const j=await r.json().catch(()=>({error:'Invalid alert response.'}));if(!r.ok)throw Error(j.error||'Could not check route alerts.');if(session!==token())return;
  const events=Array.isArray(j.events)?j.events:[];let sound=false;
  for(const ev of events){const id=Number(ev?.id);if(!Number.isFinite(id)||id<=last||!TYPES.has(ev.event_type)||pending.some(x=>Number(x.id)===id))continue;if(ev.event_type==='ROUTE_COMPLETED'&&!ev.return_depot)continue;pending.push(ev);if(ev.event_type==='ROUTE_COMPLETED')sound=true}
  pending=pending.slice(-100);last=Math.max(last,Number(j.last_id)||0,...events.map(e=>Number(e.id)||0));primed=true;persist();render();connection('ALERTS LIVE');if(sound)playSound();if(!j.has_more)break
 }}catch(e){connection('ALERT CHECK DELAYED');console.warn('Office route alert poll failed',e)}finally{busy=false}
}
window.NWTBOfficeRouteAlerts={poll,enableSound,acknowledge,stopSound};
function boot(){ensure();poll();setInterval(poll,5000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){soundState();poll()}})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
