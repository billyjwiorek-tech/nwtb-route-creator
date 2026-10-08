(()=>{
  'use strict';
  let busy=false;
  function ready(){
    if(typeof window.createStop!=='function'||typeof window.$!=='function'){
      setTimeout(ready,150); return;
    }
    window.useResult=async function(i,saved){
      if(busy)return;
      const r=window['_search_'+i]; if(!r)return;
      busy=true;
      try{
        const address=r.address||[r.addr1,r.addr2,r.city,r.state].filter(Boolean).join(', ');
        $('stopName').value=r.name||'';
        $('sourceRef').value=r.source_ref||r.customer_number||r.vendor_id||'';
        $('address').value=address;
        $('phone').value=r.phone||r.phone_work||r.phone_home||'';
        $('sourceType').value=r.source_type||($('dirKind').value==='VENDOR'?'VENDOR':'CUSTOMER');
        $('savedLocationId').value=saved?r.id||'':'';
        $('lat').value=validCoord(r.lat,r.lon)?r.lat:'';
        $('lon').value=validCoord(r.lat,r.lon)?r.lon:'';
        if(r.source_type==='VENDOR' && $('stopType').value==='CUSTOMER_DELIVERY') $('stopType').value='VENDOR_PICKUP';
        if(typeof showBanner==='function')showBanner('addMsg','Adding '+(r.name||'location')+' directly to the Available queue…','info');
        await createStop();
      }finally{
        busy=false;
      }
    };
    const style=document.createElement('style');
    style.textContent='.nwtb-v2-direct-note{font-size:10px;color:#067647;font-weight:800;margin-top:5px}';
    document.head.appendChild(style);
    const observer=new MutationObserver(()=>{
      document.querySelectorAll('#searchResults .result').forEach(row=>{
        if(row.querySelector('.nwtb-v2-direct-note'))return;
        const n=document.createElement('div');
        n.className='nwtb-v2-direct-note';
        n.textContent='V2: USE LOCATION adds this stop directly to the Available queue.';
        row.appendChild(n);
      });
    });
    const target=document.getElementById('searchResults');
    if(target)observer.observe(target,{childList:true,subtree:true});
  }
  ready();
})();