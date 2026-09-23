(()=>{
'use strict';
let installed=false;

function syncChoice(fromUser=false){
  const cb=document.getElementById('ceReturnToStart');
  const sel=document.getElementById('ceEndMode');
  const wrap=document.getElementById('ceAlternateEndWrap');
  if(!cb||!sel)return;

  if(cb.checked){
    if(sel.value!=='SAME_AS_START')sel.dataset.prevEndMode=sel.value||'LAST_STOP';
    sel.value='SAME_AS_START';
    sel.disabled=true;
    if(wrap)wrap.style.display='none';
    if(typeof window.renderEndpointSide==='function')window.renderEndpointSide('End');
  }else{
    sel.disabled=false;
    if(sel.value==='SAME_AS_START')sel.value=sel.dataset.prevEndMode||'LAST_STOP';
    if(wrap)wrap.style.display='block';
    if(typeof window.renderEndpointSide==='function')window.renderEndpointSide('End');
  }
}

function install(){
  if(installed)return true;
  const box=document.getElementById('customEndpointBox');
  const sel=document.getElementById('ceEndMode');
  if(!box||!sel)return false;

  installed=true;

  const grid=box.querySelector('.ceGrid');
  if(!grid)return false;
  const endCol=sel.closest('div');
  if(!endCol)return false;

  const style=document.createElement('style');
  style.id='ceReturnChoiceStyle';
  style.textContent=`
    .ceReturnChoice{border:1px solid #abefc6;background:#ecfdf3;border-radius:10px;padding:11px 12px;margin-bottom:10px}
    .ceReturnChoice label{display:flex!important;align-items:center;gap:9px;font-size:12px!important;font-weight:900!important;color:#05603a!important;margin:0!important;cursor:pointer}
    .ceReturnChoice input{width:18px!important;height:18px!important;min-height:0!important;padding:0!important;accent-color:#15803d}
    .ceReturnChoice .hint{font-size:10px;color:#067647;margin-top:5px;line-height:1.35}
    #ceAlternateEndWrap{margin-top:8px}
  `;
  document.head.appendChild(style);

  const choice=document.createElement('div');
  choice.className='ceReturnChoice';
  choice.innerHTML=`<label><input id="ceReturnToStart" type="checkbox">RETURN TO START WHEN FINISHED</label><div class="hint">If checked, the driver automatically returns to the custom route starting location after the last stop.</div>`;

  const alternate=document.createElement('div');
  alternate.id='ceAlternateEndWrap';

  const label=[...endCol.children].find(x=>x.tagName==='LABEL');
  if(label)label.textContent='AFTER LAST STOP';

  const existing=[...endCol.children].filter(x=>x!==label);
  existing.forEach(x=>alternate.appendChild(x));
  endCol.appendChild(choice);
  endCol.appendChild(alternate);

  const same=[...sel.options].find(o=>o.value==='SAME_AS_START');
  if(same)same.hidden=true;
  const last=[...sel.options].find(o=>o.value==='LAST_STOP');
  if(last)last.textContent='End at Last Stop';
  const fixed=[...sel.options].find(o=>o.value==='FIXED');
  if(fixed)fixed.textContent='Go to Another Location';
  const depot=[...sel.options].find(o=>o.value==='RETURN_DEPOT');
  if(depot)depot.textContent='Return to Northwest Trucks - Bolingbrook';

  const cb=document.getElementById('ceReturnToStart');
  cb.addEventListener('change',()=>syncChoice(true));
  syncChoice(false);
  return true;
}

let tries=0;
const timer=setInterval(()=>{if(install()||++tries>100)clearInterval(timer)},120);
if(document.readyState!=='loading')install();
else document.addEventListener('DOMContentLoaded',install,{once:true});
})();
