(()=>{
'use strict';
if(window.__nwtbVoiceLiveV2)return;window.__nwtbVoiceLiveV2=true;
let unlocked=false,announced=false,preferredVoice=null,current=null,serial=0,startTimer=null,state='READY',lastError='',needsTap=false;
const supported='speechSynthesis' in window;
function pickVoice(){try{const v=speechSynthesis.getVoices()||[];preferredVoice=v.find(x=>/^en-US$/i.test(x.lang)&&/Samantha|Ava|Siri|Google|Microsoft|Alex/i.test(x.name))||v.find(x=>/^en-US$/i.test(x.lang))||v.find(x=>/^en/i.test(x.lang))||null}catch{}}
function status(next,error=''){state=next;lastError=error;try{document.dispatchEvent(new CustomEvent('nwtb-voice-status',{detail:{state,error,needs_tap:needsTap}}))}catch{}}
function cancel(){serial++;if(startTimer!==null)clearTimeout(startTimer);startTimer=null;const previous=current;current=null;if(previous&&!previous.started)previous.callbacks?.onError?.('superseded');try{speechSynthesis.cancel()}catch{}}
function say(text,callbacks={}){
 if(!text||!supported||!unlocked||needsTap)return false;
 try{
  cancel();pickVoice();speechSynthesis.resume?.();const id=serial,u=new SpeechSynthesisUtterance(String(text));
  if(preferredVoice)u.voice=preferredVoice;u.lang='en-US';u.rate=.94;u.pitch=1;u.volume=1;
  current={utterance:u,callbacks,started:false};status('QUEUED');
  const fail=error=>{if(id!==serial||!current)return;if(startTimer!==null)clearTimeout(startTimer);startTimer=null;current=null;needsTap=true;callbacks.onError?.(error);status(error==='not-allowed'?'BLOCKED':'ERROR',error);};
  u.onstart=()=>{if(id!==serial||!current)return;current.started=true;if(startTimer!==null)clearTimeout(startTimer);startTimer=null;callbacks.onStart?.();status('SPEAKING');};
  u.onend=()=>{if(id!==serial||!current)return;if(startTimer!==null)clearTimeout(startTimer);startTimer=null;current=null;callbacks.onEnd?.();status('READY');};
  u.onerror=e=>fail(String(e?.error||'speech-error'));
  startTimer=setTimeout(()=>{if(id===serial&&current&&!current.started){fail('speech-start-timeout');try{speechSynthesis.cancel()}catch{}}},8000);
  speechSynthesis.speak(u);return true;
 }catch{if(startTimer!==null)clearTimeout(startTimer);startTimer=null;current=null;callbacks.onError?.('speech-error');status('ERROR','speech-error');return false;}
}
function unlock(announce=false){
 if(!supported){status('UNAVAILABLE');return;}
 try{speechSynthesis.resume?.()}catch{}
 unlocked=true;needsTap=false;document.documentElement.dataset.nwtbVoice='on';if(!current)status('READY');
 if(announce&&!announced){announced=true;say('N W T B voice navigation on.');}
}
// The navigation engine alone schedules instructions. Text/ETA refresh never repeats speech.
function handleGesture(e){const label=(e.target?.closest?.('button,a,.btn')?.textContent||'').toUpperCase();unlock(label.includes('ROUTE FULL ROUTE IN NWTB')||label.includes('START ROUTE')||label.includes('CONTINUE NWTB NAVIGATION'));}
if(supported){pickVoice();speechSynthesis.addEventListener?.('voiceschanged',pickVoice)}else state='UNAVAILABLE';
document.addEventListener('pointerup',handleGesture,true);document.addEventListener('touchend',handleGesture,{capture:true,passive:true});document.addEventListener('click',handleGesture,true);
function resume(){if(unlocked){try{speechSynthesis.resume()}catch{}}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resume()});window.addEventListener('pageshow',resume);
window.nwtbPrimeVoice=(announce=true)=>unlock(announce);
window.nwtbVoiceSay=(text,callbacks)=>say(text,callbacks);
window.nwtbCancelVoice=()=>{cancel();status(needsTap?'ERROR':supported?'READY':'UNAVAILABLE',needsTap?lastError:'');};
window.nwtbVoiceScreenState=()=>({state,error:lastError,needs_tap:needsTap});
})();
