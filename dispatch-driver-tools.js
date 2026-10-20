(()=>{
'use strict';
if(window.__nwtbDriverTools)return;window.__nwtbDriverTools=true;
let hostDoc=document,hostWin=window,embedded=false;
try{embedded=window.top!==window.self;if(embedded&&window.frameElement?.id!=='fDispatch')return;if(embedded){hostDoc=window.top.document;hostWin=window.top}}catch{}
const API='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-admin-roles',KEY='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';
let saving=false,pin='';
const el=id=>hostDoc.getElementById(id),officeToken=()=>localStorage.getItem('nwtb_delivery_token')||'';
async function send(payload){
 const response=await fetch(API,{method:'POST',cache:'no-store',headers:{'content-type':'application/json','apikey':KEY,'x-nwtb-session':officeToken()},body:JSON.stringify(payload)}),j=await response.json().catch(()=>({error:'Driver service response error.'}));
 if(!response.ok)throw Object.assign(Error(j.error||'Could not add driver.'),{status:response.status,code:j.code});return j;
}
async function protectedSend(payload){
 if(typeof window.officeProtectedPost==='function')return window.officeProtectedPost(API,payload);
 try{return await send({...payload,...(pin?{pin}:{})})}catch(error){
  if(error.code!=='ADMIN_PIN_REQUIRED')throw error;pin='';
  const answer=hostWin.prompt('ADMIN PIN REQUIRED\n\nEnter the NWTB Admin PIN to add a driver:');if(answer===null||!String(answer).trim())throw Error('Admin PIN required to add a driver.');
  try{const result=await send({...payload,pin:String(answer).trim()});pin=String(answer).trim();return result}catch(e){pin='';throw e}
 }
}
function ensure(){
 if(!el('nwtbDriverToolsStyle')){const style=hostDoc.createElement('style');style.id='nwtbDriverToolsStyle';style.textContent='#nwtbAddDriverOverlay,#nwtbShowDriversOverlay{display:none;position:fixed;inset:0;z-index:2147483400;background:rgba(15,23,42,.65);padding:20px;align-items:center;justify-content:center;font-family:Arial,sans-serif;box-sizing:border-box}#nwtbAddDriverOverlay.show,#nwtbShowDriversOverlay.show{display:flex}.ndtModal{width:min(480px,96vw);background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 20px 80px rgba(0,0,0,.3)}.ndtHead{background:#101828;color:#fff;padding:17px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px}.ndtHead b{font-size:17px}.ndtHead button{border:0;border-radius:8px;padding:8px 10px;background:#fff;color:#101828;font-weight:900;cursor:pointer}.ndtBody{padding:20px}.ndtBody label{display:block;font-size:12px;font-weight:900;margin:0 0 7px}.ndtBody input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #cfd4dc;border-radius:9px;font-size:16px;margin-bottom:16px}.ndtBody .ndtSave{width:100%;background:#175cd3;color:#fff;border:0;padding:13px;border-radius:9px;font-weight:900;cursor:pointer}.ndtBody button:disabled{opacity:.55}.ndtHelp{font-size:12px;color:#667085;line-height:1.5}.ndtStatus{font-size:13px;margin-top:14px;line-height:1.5;white-space:pre-wrap}.ndtMapModal{width:min(1500px,98vw);height:94vh;display:flex;flex-direction:column}.ndtMapModal iframe{width:100%;flex:1;border:0;background:#f4f6f8}';hostDoc.head.appendChild(style)}
 if(!el('nwtbAddDriverOverlay')){
  const overlay=hostDoc.createElement('div');overlay.id='nwtbAddDriverOverlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Add Driver');
  overlay.innerHTML='<div class="ndtModal"><div class="ndtHead"><b>ADD DRIVER</b><button id="ndtCloseAdd" type="button">CLOSE</button></div><form class="ndtBody" id="ndtAddForm"><label for="ndtDriverName">NAME</label><input id="ndtDriverName" name="driver_name" autocomplete="name" maxlength="120" required><label for="ndtEmployeeNumber">4-DIGIT EMPLOYEE #</label><input id="ndtEmployeeNumber" name="employee_number" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="off" required><p class="ndtHelp">The employee number is the driver’s sign-in number. Office reviews and releases routes before the driver can start them.</p><button class="ndtSave" id="ndtSaveDriver" type="submit">ADD DRIVER</button><div class="ndtStatus" id="ndtDriverStatus" role="status"></div></form></div>';
  hostDoc.body.appendChild(overlay);el('ndtCloseAdd').onclick=()=>{if(!saving){overlay.classList.remove('show');pin=''}};el('ndtAddForm').onsubmit=event=>{event.preventDefault();save()};
  el('ndtEmployeeNumber').addEventListener('input',()=>{el('ndtEmployeeNumber').value=el('ndtEmployeeNumber').value.replace(/\D/g,'').slice(0,4)});
 }
 for(const [id,label,handler]of [['nwtbAddDriverBtn','ADD DRIVER',openAdd],['nwtbShowDriversBtn','SHOW DRIVERS',showDrivers]]){
  if(!document.getElementById(id)){const button=document.createElement('button');button.id=id;button.type='button';button.textContent=label;button.style.display='block';button.onclick=handler;document.body.appendChild(button)}
 }
}
function openAdd(){ensure();el('nwtbAddDriverOverlay').classList.add('show');el('ndtDriverName').focus()}
async function refreshRoster(){
 const calls=[];if(typeof window.loadDrivers==='function')calls.push(window.loadDrivers());if(typeof window.loadMultiBuilder==='function')calls.push(window.loadMultiBuilder(false));
 const result=await Promise.allSettled(calls);return result.every(r=>r.status==='fulfilled');
}
async function save(){
 if(saving)return;const name=el('ndtDriverName').value.trim(),number=el('ndtEmployeeNumber').value.trim(),status=el('ndtDriverStatus');
 if(name.length<2||name.length>120||!/^\d{4}$/.test(number)||number==='9998'){status.style.color='#b42318';status.textContent='Enter the driver’s name and exactly 4 digits. The Delivery Desk number is reserved.';return}
 saving=true;el('ndtSaveDriver').disabled=true;el('ndtCloseAdd').disabled=true;status.style.color='#475467';status.textContent='Adding driver…';
 try{
  const j=await protectedSend({action:'create_driver',employee_number:number,display_name:name});if(!j.ok||!j.driver)throw Error('Driver service did not confirm the saved driver.');
  const refreshed=await refreshRoster();status.style.color='#067647';status.textContent=(j.driver.already_exists?'Driver already on roster: ':'Driver added: ')+j.driver.display_name+' ('+j.driver.employee_number+').\n'+(refreshed?'Available in the Driver Queue and route builder.':'Driver was saved. Refresh the Driver Queue to load the updated roster.');
  if(!j.driver.already_exists){el('ndtDriverName').value='';el('ndtEmployeeNumber').value=''}
 }catch(e){status.style.color='#b42318';status.textContent=e.message||'Could not add driver.'}
 finally{saving=false;el('ndtSaveDriver').disabled=false;el('ndtCloseAdd').disabled=false}
}
function showDrivers(){
 ensure();if(typeof hostWin.openView==='function'&&hostDoc.getElementById('drivers')?.classList.contains('view')){hostWin.openView('drivers');return}
 let overlay=el('nwtbShowDriversOverlay');if(!overlay){overlay=hostDoc.createElement('div');overlay.id='nwtbShowDriversOverlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','NWTB logged-in drivers map');overlay.innerHTML='<div class="ndtModal ndtMapModal"><div class="ndtHead"><b>SHOW DRIVERS — NWTB MAP</b><button type="button" id="ndtCloseMap">CLOSE</button></div><iframe id="ndtDriversMap" title="All logged-in NWTB drivers" src="tracker-live.html?v=20261020-presence1"></iframe></div>';hostDoc.body.appendChild(overlay);el('ndtCloseMap').onclick=()=>overlay.classList.remove('show')}
 overlay.classList.add('show');
}
window.nwtbAddDriver=openAdd;window.nwtbShowDrivers=showDrivers;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure,{once:true});else ensure();
})();
