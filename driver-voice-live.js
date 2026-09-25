(()=>{
'use strict';
let primed=false;
let preferredVoice=null;
function pickVoice(){
  try{
    const voices=speechSynthesis.getVoices()||[];
    preferredVoice=voices.find(v=>/^en-US$/i.test(v.lang)&&/Samantha|Ava|Siri|Google US English|Microsoft/i.test(v.name))||voices.find(v=>/^en-US$/i.test(v.lang))||voices.find(v=>/^en/i.test(v.lang))||null;
  }catch{}
}
function utter(text){
  if(!text||!('speechSynthesis' in window))return false;
  try{
    pickVoice();
    speechSynthesis.cancel();
    speechSynthesis.resume?.();
    const u=new SpeechSynthesisUtterance(text);
    if(preferredVoice)u.voice=preferredVoice;
    u.lang='en-US';u.rate=.95;u.pitch=1;u.volume=1;
    speechSynthesis.speak(u);
    return true;
  }catch{return false}
}
function prime(){
  if(primed)return;
  primed=true;
  utter('N W T B voice navigation on.');
  document.documentElement.dataset.nwtbVoice='on';
}
if('speechSynthesis' in window){
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged',pickVoice);
}
document.addEventListener('pointerdown',e=>{
  const t=e.target?.closest?.('.nwtbFullRouteBtn,.navVoice');
  if(!t)return;
  if(t.classList.contains('nwtbFullRouteBtn'))prime();
  else{
    prime();
    const turn=(document.getElementById('nwtbTurn')?.textContent||'').trim();
    const dist=(document.getElementById('nwtbTurnDist')?.textContent||'').trim();
    if(turn&&turn!=='Ready')setTimeout(()=>utter(`${turn}${dist?' in '+dist:''}`),40);
  }
},true);
document.addEventListener('touchstart',e=>{
  const t=e.target?.closest?.('.nwtbFullRouteBtn,.navVoice');
  if(t)prime();
},{capture:true,passive:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&primed){try{speechSynthesis.resume()}catch{}}});
window.addEventListener('pageshow',()=>{if(primed){try{speechSynthesis.resume()}catch{}}});
window.nwtbPrimeVoice=prime;
window.nwtbVoiceSay=utter;
})();