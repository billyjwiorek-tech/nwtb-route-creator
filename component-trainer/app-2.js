function showExamCloseup(c){
 if(mode!=='exam'||!c||!quiz?.answer||c.number!==quiz.answer.number)return;
 closeExamCloseup();
 const wrap=$('#viewerWrap');if(!wrap)return;
 const pop=document.createElement('div');pop.id='examCloseupPopout';pop.className='examCloseupPopout';
 const src=displayImage(current);
 const zoom=current.id.includes('dd13')?130:(current.id==='cascadia-side'?118:124);
 pop.innerHTML=`<button class="examCloseClose" aria-label="Close">×</button><div class="examCloseTitle">Exam inspection view</div><div class="examCloseSubtitle">Clean, unobstructed image with more surrounding context. No number or answer is shown.</div><div class="examCloseStage"><div class="examContextImage" style="background-image:url('${src}');background-position:${c.x}% ${c.y}%;background-size:${zoom}%"></div></div><div class="examCloseHint">Tap the image to switch between focused context and the full assembly.</div>`;
 wrap.appendChild(pop);
 const stage=pop.querySelector('.examCloseStage');
 stage.onclick=()=>pop.classList.toggle('fullContext');
 pop.querySelector('.examCloseClose').onclick=closeExamCloseup;
}
function renderExamCallout(){
 clearExamCallout();
 if(mode!=='exam'||!quiz?.answer||quiz.answer.x==null||quiz.answer.y==null)return;
 const wrap=$('#viewerWrap'),box=imageBox(),c=quiz.answer;if(!wrap||!box.w||!box.h)return;
 const tx=box.x+box.w*c.x/100, ty=box.y+box.h*c.y/100;
 const off=Math.min(190,Math.max(92,box.w*.18));
 const lx=Math.max(box.x+34,Math.min(box.x+box.w-34,tx+(c.x<52?off:-off)));
 const ly=Math.max(box.y+34,Math.min(box.y+box.h-34,ty-(c.y>18?Math.min(82,box.h*.10):-Math.min(60,box.h*.07))));
 const layer=document.createElement('div');layer.id='examCalloutLayer';layer.className='examCalloutLayer';
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('examArrowSvg');svg.setAttribute('viewBox',`0 0 ${wrap.clientWidth} ${wrap.clientHeight}`);
 svg.innerHTML=`<line x1="${lx}" y1="${ly}" x2="${tx}" y2="${ty}" class="examArrowLine"/>`;
 const btn=document.createElement('button');btn.className='examNumberCallout';btn.textContent=c.number;btn.style.left=lx+'px';btn.style.top=ly+'px';btn.title='Tap for a clean, unnumbered inspection view';btn.onclick=e=>{e.stopPropagation();showExamCloseup(c)};
 const dot=document.createElement('div');dot.className='examTargetDot';dot.style.left=tx+'px';dot.style.top=ty+'px';
 layer.appendChild(svg);layer.appendChild(btn);layer.appendChild(dot);wrap.appendChild(layer);
}
