(()=>{
'use strict';
const REFRESH_MS=2500;
let installed=false,busy=false,lastRun=0;
async function install(){
  if(installed)return true;
  if(typeof window.refreshAll!=='function')return false;
  installed=true;
  const original=window.refreshAll;
  window.refreshAll=async function(){
    if(busy)return;
    busy=true;lastRun=Date.now();
    try{return await original.apply(this,arguments)}finally{busy=false}
  };
  async function tick(){
    if(document.visibilityState!=='visible'||busy)return;
    if(Date.now()-lastRun<REFRESH_MS-250)return;
    try{await window.refreshAll()}catch{}
  }
  setInterval(tick,REFRESH_MS);
  window.addEventListener('focus',tick);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')tick()});
  setTimeout(tick,250);
  return true;
}
let tries=0;const timer=setInterval(()=>{if(install()||++tries>120)clearInterval(timer)},100);
})();