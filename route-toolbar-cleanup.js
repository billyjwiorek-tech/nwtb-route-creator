(function(){
'use strict';
const $=id=>document.getElementById(id);
function addStyles(){
 if($('routeToolbarCleanupStyles'))return;
 const s=document.createElement('style');
 s.id='routeToolbarCleanupStyles';
 s.textContent=`
.routeCleanBar{display:flex!important;align-items:center!important;gap:10px!important;flex-wrap:wrap!important;margin-top:14px!important}
.routeCleanSelection{display:flex;align-items:center;gap:8px;padding-right:8px;border-right:1px solid #e4e7ec}
.routeCleanPrimary{display:flex;align-items:center;gap:8px}
.routeCleanSecondary{display:flex;align-items:center;gap:8px;margin-left:auto}
.routeToolsWrap{position:relative;display:inline-flex}
.routeToolsBtn{background:#fff!important;color:#344054!important;border:1px solid #d0d5dd!important;min-width:150px}
.routeToolsBtn:hover{background:#f8fafc!important}
.routeToolsMenu{position:absolute;right:0;top:calc(100% + 7px);width:245px;background:#fff;border:1px solid #e4e7ec;border-radius:12px;box-shadow:0 18px 45px rgba(15,23,42,.18);padding:8px;z-index:2500;display:none}
.routeToolsMenu.show{display:block}
.routeToolsTitle{font-size:9px;font-weight:900;letter-spacing:.65px;color:#98a2b3;padding:5px 7px 7px;text-transform:uppercase}
.routeToolsMenu button{display:block!important;width:100%!important;margin:0 0 6px!important;text-align:left!important;border-radius:9px!important;padding:10px 11px!important;font-size:11px!important}
.routeToolsMenu button:last-child{margin-bottom:0!important}
.routeCleanSelection #deleteSelectedBtn{margin-left:0!important}
.routeCleanSecondary #manageRoutesBtn{margin-left:0!important}
.routeCleanSecondary button,.routeCleanPrimary button{white-space:nowrap}
@media(max-width:900px){.routeCleanSecondary{margin-left:0;width:100%}.routeCleanSelection{border-right:0}.routeToolsMenu{left:0;right:auto}}
`;
 document.head.appendChild(s);
}
function buttonByText(text){return Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim().toUpperCase()===text)}
function syncDeleteSelected(){
 const b=$('deleteSelectedBtn');
 if(!b)return;
 const n=document.querySelectorAll('.pick:checked').length;
 b.style.display=n?'inline-flex':'none';
}
function closeMenu(){ $('routeToolsMenu')?.classList.remove('show') }
window.toggleRouteTools=function(e){if(e)e.stopPropagation();$('routeToolsMenu')?.classList.toggle('show')};
function install(){
 addStyles();
 const count=$('selectedCount'),opt=$('optBtn'),del=$('deleteSelectedBtn'),manage=$('manageRoutesBtn'),clearRoutes=$('clearAllRoutesBtn'),clearAvail=$('clearAvailableStopsBtn');
 const refresh=buttonByText('REFRESH');
 if(!count||!opt||!refresh||!manage||!clearRoutes||!clearAvail||!del)return false;
 if($('routeCleanBar')){syncDeleteSelected();return true}
 const oldParent=count.parentElement;
 if(!oldParent)return false;
 const bar=document.createElement('div');bar.id='routeCleanBar';bar.className='routeCleanBar';
 const selection=document.createElement('div');selection.className='routeCleanSelection';selection.append(count,del);
 const primary=document.createElement('div');primary.className='routeCleanPrimary';primary.append(opt);
 const secondary=document.createElement('div');secondary.className='routeCleanSecondary';secondary.append(refresh,manage);
 const tools=document.createElement('div');tools.className='routeToolsWrap';
 const toolsBtn=document.createElement('button');toolsBtn.type='button';toolsBtn.id='routeToolsBtn';toolsBtn.className='btn routeToolsBtn';toolsBtn.textContent='MORE ROUTE TOOLS ▾';toolsBtn.onclick=window.toggleRouteTools;
 const menu=document.createElement('div');menu.id='routeToolsMenu';menu.className='routeToolsMenu';
 const title=document.createElement('div');title.className='routeToolsTitle';title.textContent='Cleanup / Maintenance';
 menu.append(title,clearRoutes,clearAvail);tools.append(toolsBtn,menu);secondary.append(tools);
 oldParent.insertBefore(bar,oldParent.firstChild);bar.append(selection,primary,secondary);
 syncDeleteSelected();
 document.addEventListener('click',e=>{if(!$('routeToolsWrap')?.contains(e.target))closeMenu()});
 return true;
}
const prevUpdate=window.updateSelected;
window.updateSelected=function(){if(typeof prevUpdate==='function')prevUpdate.apply(this,arguments);syncDeleteSelected()};
function boot(){if(install())return;let n=0;const t=setInterval(()=>{n++;if(install()||n>70)clearInterval(t)},200)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
