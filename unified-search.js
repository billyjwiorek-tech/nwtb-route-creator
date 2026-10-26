(function(){
'use strict';
const $=id=>document.getElementById(id);
const h=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const MAP_API='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-office-map';
const businessSearch=window.NWTBBusinessSearch;
let searchGeneration=0,loadedBusiness=null;

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
 businessSearch.mount(q.parentElement.parentElement,'nwtbBusiness',()=>{
  searchGeneration++;
  if($('searchResults'))$('searchResults').textContent='Search area changed. Click SEARCH ALL to refresh the results.';
 });
 return true;
}

window.loadBusinessLocation=function(i){
 const r=window['_search_'+i];if(!r?._business)return;
 for(const [id,value]of Object.entries({stopName:r.name,address:r.address,phone:r.phone||'',sourceRef:r.source_ref||'',sourceType:'OTHER',savedLocationId:'',lat:r.lat,lon:r.lon}))if($(id))$(id).value=value;
 loadedBusiness={...r};
 if(typeof showBanner==='function')showBanner('addMsg',r.address_complete?'Business loaded for review. Confirm the branch and address, then choose ADD STOP or SAVE AS FREQUENT LOCATION.':'Street number is missing from this directory listing. Enter the complete physical address before adding or saving this location.','info');
 $('stopName')?.scrollIntoView?.({behavior:'smooth',block:'center'});
 (r.address_complete?$('stopName'):$('address'))?.focus();
};
window.nwtbValidateBusinessLocation=function(){
 if(!loadedBusiness)return;
 if($('sourceRef')?.value!==loadedBusiness.source_ref||$('sourceType')?.value!=='OTHER'){loadedBusiness=null;return;}
 const address=$('address')?.value.trim()||'';
 if(!loadedBusiness.address_complete&&(address===loadedBusiness.address||!/^\s*\d/.test(address)))throw Error('Enter the complete street number and physical address for this business first.');
 if(address!==loadedBusiness.address){$('lat').value='';$('lon').value='';$('savedLocationId').value='';}
};

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
function renderResults(rows,raw,errors,businessStatus='',scope=businessSearch.scope('nwtbBusiness')){
 const box=$('searchResults');if(!box)return;
 if(!rows.length){
  box.innerHTML='<div class="result"><b>No matching location found.</b><div class="small" style="margin-top:4px">Try the business name with its city, account number, or full street address.</div></div><div class="small" role="status" style="margin-top:8px">'+h(businessStatus)+'</div>';
  return;
 }
 const unique=dedupe(rows);
 rows=unique.sort((a,b)=>(/^\d+$/.test(raw)?0:businessSearch.compare(a,b,raw,scope))||exactScore(a,raw)-exactScore(b,raw)||String(a.name||'').localeCompare(String(b.name||'')));
 box.innerHTML=rows.map((r,i)=>{
  window['_search_'+i]=r;
  const ref=r.source_ref||r.customer_number||r.vendor_id||r.location_code||'';
  const addr=r.address||[r.addr1,r.addr2,r.city,r.state].filter(Boolean).join(', ');
  const phone=r.phone||r.phone_work||r.phone_home||'';
  const group=r._search_group||r.source_type||'LOCATION';
  const badge=group==='CUSTOMER'?'delivery':group==='VENDOR'?'pickup':'statusAvailable';
  const action=r._business?'loadBusinessLocation('+i+')':'useResult('+i+','+(r._saved?'true':'false')+')';
  return '<div class="result"><button class="btn ghost right" onclick="'+action+'">'+(r._business?'LOAD / REVIEW':'USE LOCATION')+'</button><span class="pill '+badge+'">'+h(group)+'</span><div style="margin-top:6px"><b>'+h(r.name||'Unnamed Location')+'</b>'+(ref&&!r._business?' <span class="small">#'+h(ref)+'</span>':'')+'</div><div class="small" style="margin-top:4px">'+h(addr||'No physical address on file')+(phone?' • '+h(phone):'')+'</div><div class="small" style="margin-top:5px">'+h(businessSearch.distanceText(r,scope))+(r._business?' • '+(r.address_complete?'Confirm the correct branch.':'Street number missing — address review required.'):'')+'</div></div>';
 }).join('')+(errors?'<div class="small" style="margin-top:8px;color:#b54708">Some NWTB directories could not be searched. Other results are shown.</div>':'')+'<div class="small" role="status" style="margin-top:8px">'+h(businessStatus)+'</div>';
}

window.searchDirectory=async function(){
 const raw=$('dirQ')?.value.trim()||'';
 const generation=++searchGeneration;
 const scope=businessSearch.scope('nwtbBusiness');
 const current=()=>generation===searchGeneration&&$('dirQ')?.value.trim()===raw&&JSON.stringify(businessSearch.scope('nwtbBusiness'))===JSON.stringify(scope);
 const box=$('searchResults');
 if(raw.length<2){if(box)box.innerHTML='<div class="small" style="margin-top:8px">Enter at least 2 characters.</div>';return;}
 if(box)box.innerHTML='<div class="result"><b>Searching NWTB locations and businesses…</b></div>';
 try{
  const external=raw.length>=3&&!/^\d+$/.test(raw)?post(MAP_API,{action:'business_search',q:raw,...scope}).then(data=>({data}),error=>({error})):Promise.resolve(null);
  const calls=[
   post(API,{action:'directory_search',kind:'CUSTOMER',q:raw}),
   post(API,{action:'directory_search',kind:'VENDOR',q:raw}),
   post(API,{action:'saved_locations_search',q:raw})
  ];
  const [c,v,s]=await Promise.allSettled(calls);
  if(!current())return;
  const rows=[];let errors=0;
  if(c.status==='fulfilled')rows.push(...(c.value.results||[]).map(r=>normalizeMaster(r,'CUSTOMER')));else errors++;
  if(v.status==='fulfilled')rows.push(...(v.value.results||[]).map(r=>normalizeMaster(r,'VENDOR')));else errors++;
  if(s.status==='fulfilled')rows.push(...(s.value.locations||[]).map(normalizeSaved));else errors++;
  renderResults(rows,raw,errors,'Checking the public business directory…');
  const business=await external;
  if(!current())return;
  const known=new Set(rows.map(r=>[r.name,r.address||[r.addr1,r.addr2,r.city,r.state].filter(Boolean).join(', ')].join('|').toLowerCase()));
  if(business?.data)rows.push(...(business.data.results||[]).filter(r=>!known.has([r.name,r.address].join('|').toLowerCase())).map(r=>({...r,_business:true,_saved:false,_search_group:'BUSINESS DIRECTORY'})));
  renderResults(rows,raw,errors,business?.error?'Public business directory unavailable. Existing NWTB locations are shown; you can still enter a full address manually.':business?businessSearch.summary(scope,business.data.results?.length||0,business.data):'Enter at least 3 letters to include the public business directory.',scope);
 }catch(e){if(current()&&box)box.innerHTML='<div class="banner show err">'+h(e.message||'Search failed.')+'</div>';}
};

function boot(){if(installUnifiedSearchUI())return;let n=0;const t=setInterval(()=>{n++;if(installUnifiedSearchUI()||n>30)clearInterval(t)},200)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
