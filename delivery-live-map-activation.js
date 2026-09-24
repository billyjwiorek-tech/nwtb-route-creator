(()=>{
'use strict';
if(window.__nwtbLiveMapActivation)return;window.__nwtbLiveMapActivation=true;
const defs={tracker:{id:'fTracker',src:'tracker-live.html?v=20260924-1155'},driver:{id:'fDriver',src:'driver-live.html?v=20260924-1200'}};
function wake(name){
 const d=defs[name];if(!d)return;const f=document.getElementById(d.id);if(!f)return;
 if(!f.dataset.nwtbLoaded){f.dataset.nwtbLoaded='1';f.src=f.dataset.liveSrc||d.src;return}
 const poke=()=>{try{const w=f.contentWindow;w.dispatchEvent(new Event('resize'));if(typeof w.nwtbRepairDriverMap==='function')w.nwtbRepairDriverMap();else{const m=w.__nwtbNavMapInstance;if(m&&typeof m.invalidateSize==='function')m.invalidateSize({pan:false,animate:false})}}catch{}};
 requestAnimationFrame(poke);setTimeout(poke,120);setTimeout(poke,420);
}
const original=window.openView;
if(typeof original==='function')window.openView=function(name){const r=original.apply(this,arguments);if(name==='tracker'||name==='driver')setTimeout(()=>wake(name),0);return r};
function boot(){
 const tf=document.getElementById('fTracker'),df=document.getElementById('fDriver');
 if(tf){tf.dataset.liveSrc=tf.dataset.liveSrc||defs.tracker.src;if(tf.getAttribute('src')!=='about:blank'&&!tf.dataset.nwtbLoaded)tf.setAttribute('src','about:blank')}
 if(df){df.dataset.liveSrc=df.dataset.liveSrc||defs.driver.src;if(df.getAttribute('src')!=='about:blank'&&!df.dataset.nwtbLoaded)df.setAttribute('src','about:blank')}
 if(document.getElementById('tracker')?.classList.contains('active')||location.hash==='#tracker')wake('tracker');
 if(document.getElementById('driver')?.classList.contains('active')||location.hash==='#driver')wake('driver');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();
