(()=>{
'use strict';
if(window.__nwtbVoiceLiveV2)return;window.__nwtbVoiceLiveV2=true;
let unlocked=false,announced=false,preferredVoice=null;
function pickVoice(){try{const v=speechSynthesis.getVoices()||[];preferredVoice=v.find(x=>/^en-US$/i.test(x.lang)&&/Samantha|Ava|Siri|Google|Microsoft|Alex/i.test(x.name))||v.find(x=>/^en-US$/i.test(x.lang))||v.find(x=>/^en/i.test(x.lang))||null}catch{}}
function say(text,force=false){
 if(!text||!('speechSynthesis' in window)||(!unlocked&&!force))return false;
 try{pickVoice();speechSynthesis.cancel();speechSynthesis.resume?.();const u=new SpeechSynthesisUtterance(String(text));if(preferredVoice)u.voice=preferredVoice;u.lang='en-US';u.rate=.94;u.pitch=1;u.volume=1;speechSynthesis.speak(u);return true}catch{return false}
}
function unlock(announce=false){
 if(!('speechSynthesis' in window))return;
 try{speechSynthesis.resume?.()}catch{}
 unlocked=true;document.documentElement.dataset.nwtbVoice='on';
 if(announce&&!announced){announced=true;say('N W T B voice navigation on.',true)}
}
// The navigation engine owns turn/arrival timing and the REPEAT TURN button.
// Re-rendering distance/ETA text must never trigger a second automatic speaker.
function handleGesture(e){
 const label=(e.target?.closest?.('button,a,.btn')?.textContent||'').toUpperCase();
 unlock(label.includes('ROUTE FULL ROUTE IN NWTB')||label.includes('START ROUTE')||label.includes('CONTINUE NWTB NAVIGATION'));
}
if('speechSynthesis' in window){pickVoice();speechSynthesis.addEventListener?.('voiceschanged',pickVoice)}
document.addEventListener('pointerup',handleGesture,true);document.addEventListener('touchend',handleGesture,{capture:true,passive:true});document.addEventListener('click',handleGesture,true);
function resume(){if(unlocked){try{speechSynthesis.resume()}catch{}}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resume()});window.addEventListener('pageshow',resume);
window.nwtbPrimeVoice=()=>unlock(true);window.nwtbVoiceSay=t=>{unlock(false);return say(t,true)};
})();
