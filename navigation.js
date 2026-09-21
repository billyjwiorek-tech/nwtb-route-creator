(() => {
  const $=id=>document.getElementById(id);
  const isPhone=()=>/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||window.matchMedia('(max-width: 760px)').matches;
  const encPlace=x=>{
    const name=String(x?.name||'').trim(),address=String(x?.address||'').trim();
    if(name&&address)return encodeURIComponent(`${name}, ${address}`);
    if(address)return encodeURIComponent(address);
    if(name)return encodeURIComponent(name);
    const lat=Number(x?.lat),lon=Number(x?.lon);
    return Number.isFinite(lat)&&Number.isFinite(lon)?encodeURIComponent(`${lat.toFixed(6)},${lon.toFixed(6)}`):'';
  };

  function firstPhoneUrl(origin){
    if(!currentRoute?.length)return '';
    const originPart=origin?`&origin=${encodeURIComponent(origin)}`:'';
    if(currentRoute.length<=9){
      return `https://www.google.com/maps/dir/?api=1${originPart}&destination=${encPlace(depot)}&travelmode=driving&dir_action=navigate&waypoints=${currentRoute.map(encPlace).join('%7C')}`;
    }
    const chunk=currentRoute.slice(0,9),dest=chunk[chunk.length-1],wps=chunk.slice(0,-1);
    return `https://www.google.com/maps/dir/?api=1${originPart}&destination=${encPlace(dest)}&travelmode=driving&dir_action=navigate${wps.length?'&waypoints='+wps.map(encPlace).join('%7C'):''}`;
  }

  window.nwtbStartPhoneNavigation=function(){
    if(!currentRoute?.length)return alert('Create a route first.');
    const btn=$('nwtbStartNavBtn');
    if(btn){btn.disabled=true;btn.textContent='GETTING YOUR GPS LOCATION...'}
    const launch=origin=>{
      const url=firstPhoneUrl(origin);
      if(btn){btn.disabled=false;btn.textContent='START NAVIGATION — PART 1'}
      if(!url)return alert('Could not create the Google Maps route.');
      window.location.href=url;
    };
    if(!navigator.geolocation){launch('');return}
    navigator.geolocation.getCurrentPosition(
      p=>launch(`${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)}`),
      ()=>launch(''),
      {enableHighAccuracy:true,timeout:8000,maximumAge:30000}
    );
  };

  function addNavigationPanel(){
    try{
      const out=$('output');
      if(!out||out.style.display==='none'||!currentRoute?.length)return;
      out.querySelector('#nwtbNavigationPanel')?.remove();
      const panel=document.createElement('div');
      panel.id='nwtbNavigationPanel';
      panel.style.cssText='margin:0 0 14px;padding:14px;border:2px solid #1a73e8;border-radius:10px;background:#eef5ff;line-height:1.45';
      if(isPhone()){
        const extra=(currentMapLinks||[]).slice(1).map((x,i)=>`<a class="routebtn" style="display:block;text-align:center;margin:8px 0" href="${x.url}">${i===(currentMapLinks.length-2)?'FINAL PART — RETURN TO NWTB':`CONTINUE — PART ${i+2}`}</a>`).join('');
        panel.innerHTML=`<b>PHONE NAVIGATION</b><br>Build the route here on your phone, then use Google Maps for driving. Part 1 uses your phone's current GPS location. The final part returns to Northwest Trucks – Bolingbrook.<br><button id="nwtbStartNavBtn" class="primary" style="width:100%;font-size:18px;margin-top:10px;padding:15px" onclick="nwtbStartPhoneNavigation()">START NAVIGATION — PART 1</button>${extra}<div class="small" style="margin-top:8px">Google Maps app recommended. If location permission is denied, Google Maps will use the device's current location when available.</div>`;
      }else{
        panel.innerHTML=`<b>DESKTOP ROUTING</b><br>After you click CREATE + FREE OPTIMIZE, Google Maps Part 1 opens automatically in a new tab. Desktop Google Maps shows the planned route; live turn-by-turn navigation is a phone feature. The final route part returns to Northwest Trucks – Bolingbrook.`;
      }
      out.insertBefore(panel,out.firstChild);
    }catch(e){console.warn('NWTB navigation panel:',e)}
  }

  const baseRender=window.renderRoute;
  if(typeof baseRender==='function'){
    window.renderRoute=function(order,meta={}){
      const r=baseRender(order,meta);
      addNavigationPanel();
      return r;
    };
  }

  const baseBuild=window.buildRoute;
  if(typeof baseBuild==='function'){
    window.buildRoute=async function(){
      const desktop=!isPhone();
      let mapTab=null;
      if(desktop){
        try{
          mapTab=window.open('about:blank','nwtb_google_maps_route');
          if(mapTab){
            mapTab.document.title='NWTB Route — Loading';
            mapTab.document.body.innerHTML='<div style="font-family:Arial;padding:30px"><h2>NWTB Route</h2><p>Optimizing route and opening Google Maps...</p></div>';
          }
        }catch{}
      }
      try{
        await baseBuild.apply(this,arguments);
        addNavigationPanel();
        if(desktop&&mapTab){
          const first=currentMapLinks?.[0]?.url;
          if(first)mapTab.location.href=first;else mapTab.close();
        }
      }catch(e){
        if(mapTab)try{mapTab.close()}catch{}
        throw e;
      }
    };
  }
})();
