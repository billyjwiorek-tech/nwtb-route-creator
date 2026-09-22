(function(){
'use strict';
const $=id=>document.getElementById(id);
const h=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

function installUnifiedSearchUI(){
 const dir=$('dirKind');
 if(dir&&dir.parentElement){
  dir.parentElement.style.display='none';
  dir.setAttribute('aria-hidden','true');
 }
 const q=$('dirQ');
 if(!q)return false;
 const field=q.parentElement?.parentElement;
 if(field){
  field.style.gridColumn='span 2';
  const label=field.querySelector('label');
  if(label)label.textContent='Search All Locations';
 }
 q.placeholder='Customer, vendor, account #, business name or address';
 const btn=q.parentElement?.querySelector('button');
 if(btn)btn.textContent='SEARCH ALL';
 return true;
}

function normalizeSaved(r){
 return {
  ...r,
  source_type:r.source_type||'OTHER',
  source_ref:r.source_ref||r.location_code||'',
  address:r.address||'',
  phone:r.phone||'',
  _search_group:'SAVED LOCATION',
  _saved:true
 };
}
function normalizeMaster(r,group){return {...r,_search_group:group,_saved:false};}
function exactScore(r,raw){
 const q=raw.trim().toUpperCase();
 const ref=String(r.source_ref||r.customer_number||r.vendor_id||r.location_code||'').trim().toUpperCase();
 const name=String(r.name||'').trim().toUpperCase();
 if(ref===q)return 0;
 if(name===q)return 1;
 if(name.startsWith(q))return 2;
 if(ref.startsWith(q))return 3;
 return 4;
}
function dedupe(rows){
 const seen=new Set();
 return rows.filter(r=>{
  const key=[r._search_group,r.source_type||'',r.source_ref||'',r.name||'',r.address||''].join('|').toUpperCase();
  if(seen.has(key))return false;
  seen.add(key);return true;
 });
}
function renderResults(rows,raw,errors){
 const box=$('searchResults');if(!box)return;
 if(!rows.length){
  box.innerHTML='<div class="result"><b>No matching customer, vendor, or saved location found.</b><div class="small" style="margin-top:4px">Try a business name, account number, city, or part of the address.</div></div>';
  return;
 }
 rows=dedupe(rows).sort((a,b)=>exactScore(a,raw)-exactScore(b,raw)||String(a.name||'').localeCompare(String(b.name||''))).slice(0,75);
 box.innerHTML=rows.map((r,i)=>{
  window['_search_'+i]=r;
  const ref=r.source_ref||r.customer_number||r.vendor_id||r.location_code||'';
  const addr=r.address||[r.addr1,r.addr2,r.city,r.state].filter(Boolean).join(', ');
  const phone=r.phone||r.phone_work||r.phone_home||'';
  const group=r._search_group||r.source_type||'LOCATION';
  const badge=group==='CUSTOMER'?'delivery':group==='VENDOR'?'pickup':'statusAvailable';
  return '<div class="result"><button class="btn ghost right" onclick="useResult('+i+','+(r._saved?'true':'false')+')">USE LOCATION</button><span class="pill '+badge+'">'+h(group)+'</span><div style="margin-top:6px"><b>'+h(r.name||'Unnamed Location')+'</b>'+(ref?' <span class="small">#'+h(ref)+'</span>':'')+'</div><div class="small" style="margin-top:4px">'+h(addr||'No physical address on file')+(phone?' • '+h(phone):'')+'</div></div>';
 }).join('')+(errors?'<div class="small" style="margin-top:8px;color:#b54708">Some directories could not be searched. The results shown above are from the directories that responded.</div>':'');
}

window.searchDirectory=async function(){
 const raw=$('dirQ')?.value.trim()||'';
 const box=$('searchResults');
 if(raw.length<2){if(box)box.innerHTML='<div class="small" style="margin-top:8px">Enter at least 2 characters.</div>';return;}
 if(box)box.innerHTML='<div class="result"><b>Searching customers, vendors and saved locations…</b></div>';
 try{
  const calls=[
   post(API,{action:'directory_search',kind:'CUSTOMER',q:raw}),
   post(API,{action:'directory_search',kind:'VENDOR',q:raw}),
   post(API,{action:'saved_locations_search',q:raw})
  ];
  const [c,v,s]=await Promise.allSettled(calls);
  const rows=[];let errors=0;
  if(c.status==='fulfilled')rows.push(...(c.value.results||[]).map(r=>normalizeMaster(r,'CUSTOMER')));else errors++;
  if(v.status==='fulfilled')rows.push(...(v.value.results||[]).map(r=>normalizeMaster(r,'VENDOR')));else errors++;
  if(s.status==='fulfilled')rows.push(...(s.value.locations||[]).map(normalizeSaved));else errors++;
  renderResults(rows,raw,errors);
 }catch(e){if(box)box.innerHTML='<div class="banner show err">'+h(e.message||'Search failed.')+'</div>';}
};

function boot(){if(installUnifiedSearchUI())return;let n=0;const t=setInterval(()=>{n++;if(installUnifiedSearchUI()||n>30)clearInterval(t)},200)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
