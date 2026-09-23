(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
function installStyles(){
 if($('queueNavStyles'))return;
 const s=document.createElement('style');s.id='queueNavStyles';s.textContent=`
.stat.nwtbNavStat{cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}.stat.nwtbNavStat:hover{transform:translateY(-1px);box-shadow:0 8px 22px rgba(15,23,42,.10);border-color:#9db8ff}.stat.nwtbNavStat:focus{outline:3px solid rgba(37,99,235,.18);outline-offset:2px}.filter[data-q="COMPLETED"]{white-space:nowrap}
`;
 document.head.appendChild(s);
}
function completedRows(){
 const active=orders.filter(o=>o.status==='DELIVERED');
 $('ordersBody').innerHTML=active.map(o=>{
  const pc=o.priority==='HOT_SHOT'?'pill hot':o.priority==='PRIORITY'?'pill priority':'pill';
  return '<tr class="mutedrow"><td>—</td><td><span class="'+typeClass(o.stop_type)+'">'+esc(typeLabel(o.stop_type))+'</span></td><td><span class="'+pc+'">'+esc(o.priority)+'</span></td><td>'+esc(o.sales_order_no||o.reference_no||'—')+'</td><td><b>'+esc(o.customer_name)+'</b><br><span class="small">'+esc(o.source_ref||o.customer_number||'')+'</span></td><td>'+esc(o.address)+'</td><td>'+esc(o.pieces)+'</td><td>'+statusPill(o.status)+'</td><td><span class="coord good">DONE</span></td><td>—</td></tr>';
 }).join('')||'<tr><td colspan="10"><div class="empty">No completed stops are in history yet.</div></td></tr>';
}
const originalRender=window.renderOrders;
window.renderOrders=function(){if(typeof queueMode!=='undefined'&&queueMode==='COMPLETED')return completedRows();return originalRender.apply(this,arguments)};
function ensureCompletedFilter(){
 const filters=document.querySelector('.filters');if(!filters)return false;
 if(!filters.querySelector('[data-q="COMPLETED"]')){
  const all=filters.querySelector('[data-q="ALL"]');const b=document.createElement('button');b.className='filter';b.dataset.q='COMPLETED';b.textContent='COMPLETED';b.onclick=function(){setQueue('COMPLETED',this)};filters.insertBefore(b,all||null);
 }
 return true;
}
function scrollQueue(){document.querySelector('#ordersBody')?.closest('.panel')?.scrollIntoView({behavior:'smooth',block:'start'})}
function scrollSaved(){
 const h=Array.from(document.querySelectorAll('h2,h3')).find(x=>x.textContent.trim().toUpperCase()==='FREQUENT STOPS');
 (h?.closest('.panel')||h)?.scrollIntoView({behavior:'smooth',block:'start'});
}
window.nwtbQueueView=function(mode){
 if(mode==='SAVED'){scrollSaved();return}
 ensureCompletedFilter();
 const btn=document.querySelector('.filter[data-q="'+mode+'"]');
 if(typeof setQueue==='function')setQueue(mode,btn||null);
 setTimeout(scrollQueue,60);
};
function wireStat(id,mode){
 const strong=$(id),card=strong?.closest('.stat');if(!card||card.dataset.nwtbNav)return;
 card.dataset.nwtbNav='1';card.classList.add('nwtbNavStat');card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label','Open '+mode.toLowerCase()+' view');
 card.onclick=()=>window.nwtbQueueView(mode);card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();window.nwtbQueueView(mode)}};
}
function install(){installStyles();if(!ensureCompletedFilter())return false;wireStat('stUn','AVAILABLE');wireStat('stRt','ROUTED');wireStat('stOut','OUT');wireStat('stDone','COMPLETED');wireStat('stFav','SAVED');return true}
let n=0;const t=setInterval(()=>{n++;if(install()||n>100)clearInterval(t)},100);if(document.readyState!=='loading')install();
})();
