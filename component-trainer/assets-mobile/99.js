window.NWTB_ASSETS=window.NWTB_ASSETS||{};
window.NWTB_ASSET_BLOBS=window.NWTB_ASSET_BLOBS||{};
for(const [k,v] of Object.entries(window.NWTB_MOBILE_CHUNKS||{})){
  try{
    const b64=v.join('');
    const raw=atob(b64);
    const bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    if(window.NWTB_ASSET_BLOBS[k]){try{URL.revokeObjectURL(window.NWTB_ASSET_BLOBS[k]);}catch{}}
    const blobUrl=URL.createObjectURL(new Blob([bytes],{type:'image/webp'}));
    window.NWTB_ASSET_BLOBS[k]=blobUrl;
    window.NWTB_ASSETS[k]=blobUrl;
  }catch(err){
    console.error('NWTB asset decode failed',k,err);
  }
}
window.NWTB_ASSET_VERSION='2026-10-01-fix2';