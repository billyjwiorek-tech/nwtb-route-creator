(function(){
'use strict';
const $=id=>document.getElementById(id);
let installed=false;
function addStyles(){
 if($('routeToolbarCleanupStyles'))return;
 const s=document.createElement('style');s.id='routeToolbarCleanupStyles';s.textContent=`
.routeCleanBar{display:flex!important;align-items:center!important;gap:12px!important;flex-wrap:wrap!important;margin-top:14px!important}
.routeCleanSelection{display:flex;align-items:center;gap:8px}
.routeCleanPrimary{display:flex;align-items:center;gap:8px}
.routeCleanSecondary{display:flex;align-items:center;gap:8px;margin-left:auto}
.routeToolsWrap{position:relative;display:inline-flex}
.routeToolsBtn{background:#fff!important;color:#344054!important;border:1px solid #d0d5dd!important;min-width:160px!important}
.routeToolsBtn:hover{background:#f8fafc!important}
.routeToolsMenu{position:absolute;right:0;top:calc(100% + 7px);width:255px;background:#fff;border:1px solid #e4e7ec;border-radius:12px;box-shadow:0 18px 45px rgba(15,23,42,.18);padding:8px;z-index:2500;display:none}
.routeToolsMenu.show{display:block}
.routeToolsTitle{font-size:9px;font-weight:900;letter-spacing:.65px;color:#98a2b3;padding:5px 7px 7px;text-transform:uppercase}
.routeToolsMenu button{display:block!important;width:100%!important;margin:0 0 6px!important;text-align:left!important;border-radius:9px!important;padding:10px 11px!important;font-size:11px!important}
.routeToolsMenu button:last-child{margin-bottom:0!important}
.routeCleanSelection #deleteSelectedBtn{margin-left:0!important}
.routeCleanSecondary #manageRoutesBtn{margin-left:0!important}
.routeCleanBar button{white-space:nowrap}
@media(max-width:950px){.routeCleanSecondary{margin-left:0;width:100%}.routeToolsMenu{left:0;right:auto}}
`;
 document.head.appendChild(s);
}
function routeToolbar(){const count=$('selectedCount');return count?count.closest('.toolbar'):null}
function syncDeleteSelected(){const b=$('deleteSelectedBtn');if(!b)return;const n=document.querySelectorAll('.pick:checked').length;b.style.display=n?'inline-flex':'none';}
function closeMenu(){$('routeToolsMenu')?.classList.remove('show')}
window.toggleRouteTools=function(e){if(e)e.stopPropagation();$('routeToolsMenu')?.classList.toggle('show')};
function ready(){return $('selectedCount')&&$('optBtn')&&$('deleteSelectedBtn')&&$('manageRoutesBtn')&&$('clearAllRoutesBtn')&&$('clearAvailableStopsBtn')&&routeToolbar()}
function install(){
 if(installed||!ready())return installed;
 addStyles();
 const toolbar=routeToolbar(),count=$('selectedCount'),del=$('deleteSelectedBtn'),opt=$('optBtn'),manage=$('manageRoutesBtn'),clearRoutes=$('clearAllRoutesBtn'),clearAvail=$('clearAvailableStopsBtn');
 const refresh=Array.from(toolbar.querySelectorAll('button')).find(b=>b.textContent.trim().toUpperCase()==='REFRESH')||Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim().toUpperCase()==='REFRESH');
 if(!refresh)return false;
 toolbar.id='routeCleanBar';toolbar.classList.add('routeCleanBar');
 const selection=document.createElement('div');selection.id='routeCleanSelection';selection.className='routeCleanSelection';selection.append(count,del);
 const primary=document.createElement('div');primary.id='routeCleanPrimary';primary.className='routeCleanPrimary';primary.append(opt);
 const secondary=document.createElement('div');secondary.id='routeCleanSecondary';secondary.className='routeCleanSecondary';
 const tools=document.createElement('div');tools.id='routeToolsWrap';tools.className='routeToolsWrap';
 const toolsBtn=document.createElement('button');toolsBtn.type='button';toolsBtn.id='routeToolsBtn';toolsBtn.className='btn routeToolsBtn';toolsBtn.textContent='MORE ROUTE TOOLS ▾';toolsBtn.onclick=window.toggleRouteTools;
 const menu=document.createElement('div');menu.id='routeToolsMenu';menu.className='routeToolsMenu';
 const title=document.createElement('div');title.id='routeToolsTitle';title.className='routeToolsTitle';title.textContent='Cleanup / Maintenance';
 menu.append(title,clearRoutes,clearAvail);tools.append(toolsBtn,menu);secondary.append(refresh,manage,tools);
 toolbar.replaceChildren(selection,primary,secondary);
 opt.onclick=function(){if(typeof window.optimizeAssign==='function')window.optimizeAssign()};
 syncDeleteSelected();
 installed=true;
 return true;
}
const prevUpdate=window.updateSelected;window.updateSelected=function(){if(typeof prevUpdate==='function')prevUpdate.apply(this,arguments);syncDeleteSelected()};
function boot(){addStyles();let tries=0;const t=setInterval(()=>{tries++;if(install()||tries>120)clearInterval(t)},100);document.addEventListener('click',e=>{if(!$('routeToolsWrap')?.contains(e.target))closeMenu()});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
