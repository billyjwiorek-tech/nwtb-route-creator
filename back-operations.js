(function(){
'use strict';
try{
  if(window.self!==window.top)return;
  if(document.getElementById('nwtbBackOperations'))return;
  const s=document.createElement('style');
  s.textContent=`
    #nwtbBackOperations{position:fixed;left:16px;top:14px;z-index:5000;display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;background:#0f172a;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:11px;font-weight:900;letter-spacing:.15px;border:1px solid rgba(255,255,255,.15);box-shadow:0 8px 24px rgba(15,23,42,.28)}
    #nwtbBackOperations:hover{background:#1d2939}
    @media(max-width:650px){#nwtbBackOperations{left:8px;top:8px;padding:9px 11px;font-size:10px}}
  `;
  document.head.appendChild(s);
  const a=document.createElement('a');
  a.id='nwtbBackOperations';
  a.href='delivery.html#dashboard';
  a.textContent='← MAIN DELIVERY OPERATIONS';
  a.title='Return to NWTB Delivery Operations dashboard';
  document.body.appendChild(a);
}catch(e){console.warn('NWTB back-navigation unavailable',e)}
})();
