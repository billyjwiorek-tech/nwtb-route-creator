(()=>{
'use strict';
if(window.__nwtbVoiceLiveV2)return;window.__nwtbVoiceLiveV2=true;
let unlocked=false,preferredVoice=null,lastFallback='',lastFallbackAt=0,observer=null;
function pickVoice(){try{const v=speechSynthesis.getVoices()||[];preferredVoice=v.find(x=>/^en-US$/i.test(x.lang)&&/Samantha|Ava|Siri|Google|Microsoft|Alex/i.test(x.name))||v.find(x=>/^en-US$/i.test(x.lang))||v.find(x=>/^en/i.test(x.lang))||null}catch{}}
function say(text,force=false){
 if(!text||!('speechSynthesis' in window)||(!unlocked&&!force))return false;
 try{pickVoice();speechSynthesis.cancel();speechSynthesis.resume?.();const u=new SpeechSynthesisUtterance(String(text));if(preferredVoice)u.voice=preferredVoice;u.lang='en-US';u.rate=.94;u.pitch=1;u.volume=1;speechSynthesis.speak(u);return true}catch{return false}
}
function unlock(announce=false){
 if(!('speechSynthesis' in window))return;
 try{speechSynthesis.cancel();speechSynthesis.resume?.()}catch{}
 if(!unlocked){unlocked=true;document.documentElement.dataset.nwtbVoice='on';if(announce)say('N W T B voice navigation on.',true)}else if(announce&&!speechSynthesis.speaking)say('N W T B voice navigation on.',true);
}
function turnText(){const t=(document.getElementById('nwtbTurn')?.textContent||'').trim(),d=(document.getElementById('nwtbTurnDist')?.textContent||'').trim();if(!t||t==='Ready')return'';return d&&d!=='—'?`${t}. ${d} to turn.`:t}
function navVisible(){return document.getElementById('nwtbNavPanel')?.classList.contains('show')}
function fallbackSpeak(){
 if(!unlocked||!navVisible())return;const text=turnText();if(!text)return;const key=(document.getElementById('nwtbTurn')?.textContent||'').trim();if(!key)return;
 setTimeout(()=>{try{if(speechSynthesis.speaking||speechSynthesis.pending)return}catch{};const now=Date.now();if(key===lastFallback&&now-lastFallbackAt<12000)return;lastFallback=key;lastFallbackAt=now;say(text,true)},650);
}
function watchTurn(){const el=document.getElementById('nwtbTurn');if(!el||observer)return false;observer=new MutationObserver(fallbackSpeak);observer.observe(el,{childList:true,subtree:true,characterData:true});return true}
function handleGesture(e){
 const btn=e.target?.closest?.('button,a,.btn');const label=(btn?.textContent||'').toUpperCase();const navStart=label.includes('ROUTE FULL ROUTE IN NWTB')||label.includes('START ROUTE');const repeat=label.includes('REPEAT TURN');unlock(navStart);
 if(repeat){e.preventDefault?.();setTimeout(()=>say(turnText()||'Voice navigation is on.',true),20)}
 setTimeout(watchTurn,50);
}
if('speechSynthesis' in window){pickVoice();speechSynthesis.addEventListener?.('voiceschanged',pickVoice)}
document.addEventListener('pointerup',handleGesture,true);document.addEventListener('touchend',handleGesture,{capture:true,passive:true});document.addEventListener('click',e=>{const label=(e.target?.closest?.('button,a,.btn')?.textContent||'').toUpperCase();if(label.includes('ROUTE FULL ROUTE IN NWTB')||label.includes('START ROUTE')){unlock(true);setTimeout(fallbackSpeak,500)}},true);
let tries=0;const timer=setInterval(()=>{watchTurn();if(observer||++tries>200)clearInterval(timer)},100);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&unlocked){try{speechSynthesis.resume()}catch{};setTimeout(fallbackSpeak,500)}});window.addEventListener('pageshow',()=>{if(unlocked){try{speechSynthesis.resume()}catch{};setTimeout(fallbackSpeak,500)}});
window.nwtbPrimeVoice=()=>unlock(true);window.nwtbVoiceSay=t=>{unlock(false);return say(t,true)};
})();