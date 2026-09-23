(()=>{
  let installed=false;

  function driverSelect(){return document.getElementById('driver')}
  function selectedStops(){return document.querySelectorAll('.pick:checked').length}

  function ensurePlaceholder(reset=false){
    const s=driverSelect();
    if(!s)return false;
    let p=[...s.options].find(o=>o.value==='');
    if(!p){
      p=document.createElement('option');
      p.value='';
      p.textContent='— SELECT DRIVER —';
      p.disabled=true;
      s.insertBefore(p,s.firstChild);
      reset=true;
    }
    if(reset||!s.dataset.nwtbDriverSafetyReady){
      s.value='';
      p.selected=true;
      s.dataset.nwtbDriverSafetyReady='1';
    }
    syncButton();
    return true;
  }

  function syncButton(){
    const s=driverSelect(),b=document.getElementById('optBtn');
    if(!s||!b)return;
    b.disabled=selectedStops()===0||!s.value;
  }

  function install(){
    if(installed)return;
    const s=driverSelect();
    if(!s)return;
    installed=true;
    ensurePlaceholder(true);
    s.addEventListener('change',syncButton);

    const originalUpdate=window.updateSelected;
    if(typeof originalUpdate==='function'){
      window.updateSelected=function(...args){
        const r=originalUpdate.apply(this,args);
        syncButton();
        return r;
      };
    }

    const originalOptimize=window.optimizeAssign;
    if(typeof originalOptimize==='function'){
      window.optimizeAssign=async function(...args){
        const d=driverSelect();
        if(!d||!d.value){
          try{clearBanner('routeMsg')}catch{}
          try{showBanner('routeMsg','Select a driver before optimizing and assigning the route.','warn')}catch{}
          d?.focus();
          syncButton();
          return;
        }
        return originalOptimize.apply(this,args);
      };
    }

    const observer=new MutationObserver(mutations=>{
      if(mutations.some(m=>m.type==='childList')){
        ensurePlaceholder(true);
      }
    });
    observer.observe(s,{childList:true});

    setTimeout(()=>ensurePlaceholder(true),250);
    setTimeout(()=>ensurePlaceholder(true),900);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
  const retry=setInterval(()=>{if(driverSelect()){clearInterval(retry);install()}},100);
  setTimeout(()=>clearInterval(retry),10000);
})();
