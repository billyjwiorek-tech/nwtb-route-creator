const D=window.NWTB_DATA; const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const storeKey='nwtbTrainerProgressV2';
const A=window.NWTB_ASSETS||{}; const CLEAN_IMAGES={'cascadia-front':A['cascadia-front']||'assets/cascadia-front.webp','cascadia-side':A['cascadia-side']||'assets/cascadia-side.webp','cascadia-rear':A['cascadia-rear']||'assets/cascadia-rear.webp','dd13-left':A['dd13-left']||'assets/dd13-left.webp','dd13-right':A['dd13-right']||'assets/dd13-right.webp'};
const PART_RENDERS={'dd13-left:10':A['dd13-left-10']||'assets/dd13-left-10.webp','dd13-right:7':A['dd13-right-7']||'assets/dd13-right-7.webp'};
function displayImage(m){return CLEAN_IMAGES[m.id]||('assets/'+m.image)}
function partRender(m,c){return PART_RENDERS[`${m.id}:${c.number}`]||''}
function hasOilPan360(m,c){return !!c&&((m.id==='dd13-left'&&c.number===10)||(m.id==='dd13-right'&&c.number===7));}
function loadProgress(){try{return JSON.parse(localStorage.getItem(storeKey)||'{"answered":0,"correct":0,"missed":{},"module":{}}')}catch{return {answered:0,correct:0,missed:{},module:{}}}}
let progress=loadProgress();
let current=D.modules[0], selected=null, mode='study', quiz=null, exam=[], examQueue=[], examIndex=0;
function save(){try{localStorage.setItem(storeKey,JSON.stringify(progress))}catch{} updateStats();}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function samePartKey(s){return String(s??'').toLowerCase().replace(/&/g,' and ').replace(/\//g,' or ').replace(/\([^)]*\)/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function crossViewRefs(c){if(!c)return[];const k=samePartKey(c.name),out=[];D.modules.forEach(m=>m.components.forEach(x=>{if(samePartKey(x.name)===k)out.push({view:m.title,id:m.id,number:x.number,name:x.name})}));return out;}
function crossViewHTML(c){const refs=crossViewRefs(c);if(refs.length<2)return'';return `<div class="crossViewBox"><b>Same part in other training views</b>${refs.map(r=>`<div><span>${esc(r.view)}</span> <strong>#${r.number}</strong></div>`).join('')}</div>`;}
function updateStats(){const pct=progress.answered?Math.round(progress.correct/progress.answered*100):0; $('#statAnswered').textContent=progress.answered;$('#statAccuracy').textContent=pct+'%';$('#statMissed').textContent=Object.values(progress.missed).reduce((a,b)=>a+b,0);}
function updateTopNav(){['study','find','quiz','exam','explode'].forEach(m=>$('#'+m+'Btn')?.classList.toggle('primary', mode===m && !$('#workspace').classList.contains('hidden')));$('#homeBtn')?.classList.toggle('primary', !$('#home').classList.contains('hidden'));$('#dashboardBtn')?.classList.toggle('primary', !$('#advanced').classList.contains('hidden'));}
function cropHTML(module,c,cls='detailCrop'){if(!c?.hasHotspot||c.x==null||c.y==null)return '<div class="muted">No direct image crop is available for this item.</div>';let zoom=module.id==='cascadia-side'?230:(module.id.includes('dd13')?250:260),src=displayImage(module);return `<div class="cropCard"><div class="${cls}" style="background-image:url('${src}');background-position:${c.x}% ${c.y}%;background-size:${zoom}%"></div><div class="cropCaption">Focused component view from <b>${esc(module.title)}</b></div></div>`;}
let studyRot={x:-6,y:18};
function hideStudyPopout(){const p=$('#studyPartPopout');if(p){p.classList.add('hidden');p.innerHTML='';}}
function clearExamCallout(){const p=$('#examCalloutLayer');if(p)p.remove();}
function closeExamCloseup(){const p=$('#examCloseupPopout');if(p)p.remove();}
