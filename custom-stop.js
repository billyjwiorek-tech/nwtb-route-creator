(function(){
'use strict';
const RESOLVER='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-location-resolver';
let customCoords=null;
let lastLocatedAddress='';
const byId=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

function ensureStyles(){
 if(byId('customRouteStyles'))return;
 const s=document.createElement('style');
 s.id='customRouteStyles';
 s.textContent=`
 .customRouteLaunch{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:12px 0 4px;padding:12px 14px;border:1px solid #c7d7fe;background:#f7f9ff;border-radius:12px}
 .customRouteLaunch b{display:block;font-size:12px;color:#182230}.customRouteLaunch span{display:block;font-size:10px;color:#667085;margin-top:3px}
 .customRouteBtn{border:0;border-radius:9px;padding:10px 14px;background:#1d4ed8;color:white;font-weight:900;font-size:11px;cursor:pointer;white-space:nowrap}
 .customRouteBtn:hover{background:#1e40af}.customModalBack{position:fixed;inset:0;background:rgba(15,23,42,.58);display:none;align-items:center;justify-content:center;z-index:2200;padding:18px}.customModalBack.show{display:flex}
 .customModal{width:min(820px,97vw);max-height:90vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 30px 90px rgba(15,23,42,.3);border:1px solid #e4e7ec;padding:20px}.customModalHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.customModalHead h2{margin:0;font-size:19px}.customModalHead p{margin:5px 0 0;color:#667085;font-size:11px}
 .customGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.customWide{grid-column:1/-1}.customField label{display:block;font-size:10px;font-weight:850;margin:0 0 6px;color:#344054}.customField input,.customField select,.customField textarea{width:100%;box-sizing:border-box;border:1px solid #d0d5dd;border-radius:9px;padding:10px 11px;font:inherit;background:#fff}.customField textarea{min-height:80px;resize:vertical}.customField input:focus,.customField select:focus,.customField textarea:focus{outline:2px solid #dbeafe;border-color:#84adff}
 .customActions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}.customAction{border:0;border-radius:9px;padding:10px 14px;font-weight:900;cursor:pointer}.customLocate{background:#eef4ff;color:#1d4ed8;border:1px solid #c7d7fe}.customAdd{background:#087a43;color:white}.customClose{background:#f2f4f7;color:#344054}.customMsg{display:none;margin-top:12px;border-radius:10px;padding:10px 12px;font-size:11px;font-weight:700}.customMsg.show{display:block}.customMsg.info{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}.customMsg.ok{background:#ecfdf3;color:#067647;border:1px solid #abefc6}.customMsg.err{background:#fff1f0;color:#b42318;border:1px solid #fecdca}.customFound{margin-top:8px;font-size:10px;color:#475467}.customCheck{display:flex;align-items:center;gap:8px;font-size:11px;color:#475467;margin-top:8px}.customCheck input{width:auto}
 @media(max-width:680px){.customGrid{grid-template-columns:1fr}.customWide{grid-column:auto}.customRouteLaunch{align-items:flex-start;flex-direction:column}.customRouteBtn{width:100%}}
 `;
 document.head.appendChild(s);
}

function findCreateHeading(){
 return Array.from(document.querySelectorAll('h1,h2,h3,h4')).find(x=>x.textContent.trim().toLowerCase()==='create new stop');
}

function injectLauncher(){
 if(byId('customRouteLauncher'))return true;
 const heading=findCreateHeading();
 if(!heading)return false;
 const box=document.createElement('div');
 box.id='customRouteLauncher';
 box.className='customRouteLaunch';
 box.innerHTML='<div><b>Need a stop that is not in Customer or Vendor Master?</b><span>Paste a street address from Google Maps and add it directly to the dispatch queue.</span></div><button type="button" class="customRouteBtn" onclick="openCustomRoute()">CUSTOM ROUTE / ADDRESS</button>';
 const subtitle=heading.nextElementSibling;
 if(subtitle) subtitle.insertAdjacentElement('afterend',box); else heading.insertAdjacentElement('afterend',box);
 return true;
}

function injectModal(){
 if(byId('customRouteModal'))return;
 const m=document.createElement('div');
 m.id='customRouteModal';
 m.className='customModalBack';
 m.innerHTML=`<div class="customModal" role="dialog" aria-modal="true" aria-labelledby="customRouteTitle">
  <div class="customModalHead"><div><h2 id="customRouteTitle">Custom Route / Manual Address</h2><p>Use this for deliveries, pickups, or one-time locations that are not in the NWTB master lists.</p></div><button type="button" class="customAction customClose" onclick="closeCustomRoute()">CLOSE</button></div>
  <div class="customGrid">
   <div class="customField"><label>STOP NAME</label><input id="customName" placeholder="Example: FleetPride Joliet"></div>
   <div class="customField"><label>STOP TYPE</label><select id="customType"><option value="OTHER">Other / One-Time Stop</option><option value="CUSTOMER_DELIVERY">Customer Delivery</option><option value="CUSTOMER_PICKUP">Customer Pickup</option><option value="VENDOR_PICKUP">Vendor Pickup</option><option value="CORE_RETURN_PICKUP">Core Return Pickup</option></select></div>
   <div class="customField customWide"><label>GOOGLE / PHYSICAL STREET ADDRESS</label><input id="customAddress" placeholder="Paste the full street address shown in Google Maps"><div class="customFound" id="customFound">Paste the address itself, not a shortened Google share link.</div></div>
   <div class="customField"><label>PHONE (OPTIONAL)</label><input id="customPhone" placeholder="Phone number"></div>
   <div class="customField"><label>PIECES</label><input id="customPieces" type="number" min="0" max="9999" value="1"></div>
   <div class="customField"><label>SALES ORDER # (OPTIONAL)</label><input id="customSalesOrder"></div>
   <div class="customField"><label>PO / REFERENCE # (OPTIONAL)</label><input id="customReference"></div>
   <div class="customField"><label>PRIORITY</label><select id="customPriority"><option value="NORMAL">NORMAL</option><option value="PRIORITY">PRIORITY</option><option value="HOT_SHOT">HOT SHOT</option></select></div>
   <div class="customField"><label>PROMISED BY (OPTIONAL)</label><input id="customPromised" type="datetime-local"></div>
   <div class="customField customWide"><label>DRIVER / PICKUP NOTES</label><textarea id="customNotes" placeholder="Dock instructions, contact name, what to pick up, etc."></textarea></div>
  </div>
  <label class="customCheck"><input id="customSaveFrequent" type="checkbox"> Save this as a Frequent Location for future use</label>
  <div class="customActions"><button type="button" class="customAction customLocate" onclick="locateCustomAddress()">LOCATE ADDRESS</button><button type="button" class="customAction customAdd" onclick="addCustomStop()">ADD TO DISPATCH QUEUE</button></div>
  <div id="customRouteMsg" class="customMsg"></div>
 </div>`;
 m.addEventListener('click',e=>{if(e.target===m)closeCustomRoute()});
 document.body.appendChild(m);
 byId('customAddress').addEventListener('input',()=>{customCoords=null;lastLocatedAddress='';setCustomMsg('', '');byId('customFound').textContent='Address changed — click LOCATE ADDRESS or ADD TO DISPATCH QUEUE to geocode it.'});
}

function setCustomMsg(text,type){const el=byId('customRouteMsg');if(!el)return;el.textContent=text||'';el.className='customMsg'+(text?' show '+(type||'info'):'');}
function validCoord(lat,lon){lat=Number(lat);lon=Number(lon);return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=20&&lat<=60&&lon>=-135&&lon<=-55;}

window.openCustomRoute=function(){ensureStyles();injectModal();setCustomMsg('','');byId('customRouteModal').classList.add('show');setTimeout(()=>byId('customName')?.focus(),50)};
window.closeCustomRoute=function(){byId('customRouteModal')?.classList.remove('show')};

window.locateCustomAddress=async function(){
 const name=byId('customName').value.trim()||'Custom Stop';
 const address=byId('customAddress').value.trim();
 if(!address){setCustomMsg('Paste the full physical street address first.','err');return null}
 setCustomMsg('Live geocoding address…','info');
 try{
  const j=await post(RESOLVER,{source_type:'OTHER',source_ref:'',name,address});
  if(!validCoord(j.lat,j.lon))throw Error('The address was returned without usable coordinates.');
  customCoords={lat:Number(j.lat),lon:Number(j.lon)};
  lastLocatedAddress=address;
  if(j.address)byId('customAddress').value=j.address;
  if(j.matched_address)byId('customFound').textContent='Located: '+j.matched_address;
  else byId('customFound').textContent='Address located successfully.';
  setCustomMsg('Address located and ready to add.','ok');
  return customCoords;
 }catch(e){customCoords=null;lastLocatedAddress='';setCustomMsg(e.message||'Address could not be located.','err');return null}
};

window.addCustomStop=async function(){
 const name=byId('customName').value.trim();
 let address=byId('customAddress').value.trim();
 if(!name){setCustomMsg('Enter a stop name so the driver knows where they are going.','err');return}
 if(!address){setCustomMsg('Paste the full physical street address first.','err');return}
 try{
  if(!customCoords||lastLocatedAddress!==address){const c=await locateCustomAddress();if(!c)return;address=byId('customAddress').value.trim()}
  setCustomMsg('Adding custom stop to the AVAILABLE queue…','info');
  const payload={action:'order_create',customer_name:name,address,lat:customCoords.lat,lon:customCoords.lon,phone:byId('customPhone').value.trim(),pieces:Number(byId('customPieces').value||1),priority:byId('customPriority').value,promised_by:byId('customPromised').value||null,notes:byId('customNotes').value.trim(),sales_order_no:byId('customSalesOrder').value.trim(),reference_no:byId('customReference').value.trim(),stop_type:byId('customType').value,source_type:'OTHER',source_ref:null};
  await post(API,payload);
  if(byId('customSaveFrequent').checked){
   await post(API,{action:'saved_location_create',source_type:'OTHER',name,address,phone:byId('customPhone').value.trim(),lat:customCoords.lat,lon:customCoords.lon,instructions:byId('customNotes').value.trim(),frequent:true,verified:true});
  }
  setCustomMsg('Custom stop added successfully.','ok');
  if(typeof refreshAll==='function')await refreshAll();
  if(typeof setQueue==='function'){const b=document.querySelector('.filter[data-q="AVAILABLE"]');setQueue('AVAILABLE',b)}
  if(typeof showBanner==='function'&&byId('addMsg'))showBanner('addMsg','Custom address added to the AVAILABLE dispatch queue.','ok');
  setTimeout(()=>{closeCustomRoute();resetCustomForm()},850);
 }catch(e){setCustomMsg(e.message||'Could not add custom stop.','err')}
};

function resetCustomForm(){['customName','customAddress','customPhone','customSalesOrder','customReference','customPromised','customNotes'].forEach(id=>{if(byId(id))byId(id).value=''});if(byId('customPieces'))byId('customPieces').value='1';if(byId('customPriority'))byId('customPriority').value='NORMAL';if(byId('customType'))byId('customType').value='OTHER';if(byId('customSaveFrequent'))byId('customSaveFrequent').checked=false;if(byId('customFound'))byId('customFound').textContent='Paste the address itself, not a shortened Google share link.';customCoords=null;lastLocatedAddress='';setCustomMsg('','')}

function bootCustom(){ensureStyles();injectModal();if(injectLauncher())return;let tries=0;const t=setInterval(()=>{tries++;if(injectLauncher()||tries>30)clearInterval(t)},250)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootCustom);else bootCustom();
})();
