/* NWTB Office: one public GPS Driver QR code for all drivers. */
(function(){
 'use strict';
 const DRIVER_URL='https://billyjwiorek-tech.github.io/nwtb-route-creator/driver-live.html?v=20261020-presence1';
 const trigger=document.getElementById('nwtbDisplayDriverQR');
 if(!trigger||trigger.dataset.qrReady==='1')return;
 trigger.dataset.qrReady='1';
 let dialog;
 function createDialog(){
  const style=document.createElement('style');
  style.textContent='#nwtbDriverQRDialog{box-sizing:border-box;width:min(520px,calc(100% - 24px));max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);overflow:auto;padding:24px;border:0;border-radius:18px;color:#182230;background:#fff;box-shadow:0 24px 90px #0005;font:14px Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}#nwtbDriverQRDialog::backdrop{background:#0f172ab3}#nwtbDriverQRDialog .nwtb-qrHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}#nwtbDriverQRDialog h2{margin:0;font-size:20px;line-height:1.3}#nwtbDriverQRDialog .nwtb-qrAll{margin:7px 0 12px;font-size:12px;color:#667085;font-weight:800}#nwtbDriverQRDialog .nwtb-qrClose{padding:8px 12px;border:1px solid #d0d5dd;border-radius:9px;background:#fff;color:#344054;font:inherit;font-weight:800;cursor:pointer}#nwtbDriverQRDialog .nwtb-qrImage{display:block;width:min(100%,392px);height:auto;margin:0 auto;aspect-ratio:1;image-rendering:pixelated}#nwtbDriverQRDialog .nwtb-qrSteps{line-height:1.6;margin:12px 0}#nwtbDriverQRDialog .nwtb-qrOpen{display:block;padding:12px 14px;border-radius:10px;background:#2563eb;color:white;text-decoration:none;text-align:center;font-weight:850}#nwtbDriverQRDialog .nwtb-qrPhone{margin:14px 0 0;padding:12px;border-radius:10px;background:#f1f5f9;color:#344054;font-size:12px;line-height:1.6}#nwtbDriverQRDialog :focus-visible{outline:3px solid #f97316;outline-offset:3px}';
  document.head.appendChild(style);
  dialog=document.createElement('dialog');
  dialog.id='nwtbDriverQRDialog';
  dialog.setAttribute('aria-labelledby','nwtbDriverQRTitle');
  dialog.setAttribute('aria-describedby','nwtbDriverQRInstructions');
  dialog.innerHTML='<div class="nwtb-qrHead"><h2 id="nwtbDriverQRTitle">GPS DRIVER QR CODE</h2><button type="button" class="nwtb-qrClose" autofocus>CLOSE</button></div><p class="nwtb-qrAll">ONE CODE FOR ALL NWTB DRIVERS</p><img class="nwtb-qrImage" src="driver-gps-qr.svg?v=20261021-driverqr1" width="392" height="392" alt="Scan to open the NWTB GPS Driver App"><p class="nwtb-qrSteps" id="nwtbDriverQRInstructions">Scan with your phone camera, then sign in with your own <strong>4-digit employee number</strong>.</p><a class="nwtb-qrOpen" target="_blank" rel="noopener noreferrer">OPEN GPS DRIVER APP</a><p class="nwtb-qrPhone"><strong>iPhone notifications:</strong> Open in Safari, tap <strong>Share → Add to Home Screen</strong>, then open the NWTB Driver icon. Sign in and tap <strong>ENABLE PHONE NOTIFICATIONS</strong>.</p>';
  dialog.querySelector('.nwtb-qrOpen').href=DRIVER_URL;
  dialog.querySelector('.nwtb-qrClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>trigger.focus());
  dialog.addEventListener('click',event=>{
   if(event.target!==dialog)return;
   const r=dialog.getBoundingClientRect();
   if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
  });
  document.body.appendChild(dialog);
 }
 trigger.addEventListener('click',()=>{
  if(!dialog)createDialog();
  if(!dialog.open)dialog.showModal();
 });
})();
