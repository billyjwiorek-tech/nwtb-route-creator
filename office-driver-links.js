/* Office navigation only: reuse the existing Office workspace and private Driver chat. */
(()=>{
'use strict';
async function open(no,routeId,chat=false,end=false){
 if(!/^\d{4}$/.test(String(no))||no==='9998')return;
 window.openView('driver');
 for(let n=0;n<100;n++){
  const frame=document.getElementById('fDriver'),view=frame?.contentWindow;
  if(typeof view?.nwtbSelectOfficeDriver==='function'){
   await view.nwtbSelectOfficeDriver(String(no),routeId);
   if(chat)view.nwtbOpenSelectedDriverChat?.(String(no));
   if(end)view.nwtbBeginOfficeEndRoute?.(routeId,String(no));
   view.dispatchEvent(new Event('nwtb-office-view-visible'));return;
  }
  await new Promise(resolve=>setTimeout(resolve,150));
 }
}
window.nwtbOpenOfficeDriverView=(no,routeId)=>open(no,routeId);
window.nwtbChatWithDriver=no=>open(no,undefined,true);
window.nwtbEndOfficeRoute=(no,routeId)=>open(no,routeId,false,true);
})();
