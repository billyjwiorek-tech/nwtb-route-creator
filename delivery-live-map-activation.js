(()=>{
'use strict';
if(window.__nwtbLiveMapActivation)return;window.__nwtbLiveMapActivation=true;
const defs={tracker:{id:'fTracker',src:'tracker-live.html?v=20260925-0830'},driver:{id:'fDriver',src:'driver-live.html?v=20260925-0815'}};
function withBust(src){return src+(src.includes('?')?'&':'?')+'cb='+Date.now()}
function wake(name){
 const d=defs[name];if(!d)return;const f=document.getElementById(d.id);if(!f)return;
 const src=f.dataset.liveSrc||d.src;
 if(name==='tracker'){
  f.dataset.nwtbLoaded='1';
  f.src=withBust(src);
  return;
 }
 if(!f.dataset.nwtbLoaded){f.dataset.nwtbLoaded='1';f.src=withBust(src);return}
 const poke=()=>{try{const w=f.contentWindow;w.dispatchEvent(new Event('resize'));if(typeof w.nwtbRepairDriverMap==='function')w.nwtbRepairDriverMap();else{const m=w.__nwtbNavMapInstance;if(m&&typeof m.invalidateSize==='function')m.invalidateSize({pan:false,animate:false})}}catch{}};
 requestAnimationFrame(poke);setTimeout(poke,120);setTimeout(poke,420);
}
const original=window.openView;
if(typeof original==='function')window.openView=function(name){const r=original.apply(this,arguments);if(name==='tracker'||name==='driver')setTimeout(()=>wake(name),0);return r};
function boot(){
 const tf=document.getElementById('fTracker'),df=document.getElementById('fDriver');
 if(tf){tf.dataset.liveSrc=defs.tracker.src;tf.setAttribute('src','about:blank');delete tf.dataset.nwtbLoaded}
 if(df){df.dataset.liveSrc=defs.driver.src;if(df.getAttribute('src')!=='about:blank'&&!df.dataset.nwtbLoaded)df.setAttribute('src','about:blank')}
 if(document.getElementById('tracker')?.classList.contains('active')||location.hash==='#tracker')wake('tracker');
 if(document.getElementById('driver')?.classList.contains('active')||location.hash==='#driver')wake('driver');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();