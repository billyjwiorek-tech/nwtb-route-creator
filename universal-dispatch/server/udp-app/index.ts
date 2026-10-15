// Older Universal function links stay forward-compatible with the native app.
Deno.serve((req:Request)=>{
 const url=new URL('https://billyjwiorek-tech.github.io/nwtb-route-creator/universal-dispatch/');
 const incoming=new URL(req.url);if(incoming.searchParams.get('view')==='driver')url.searchParams.set('view','driver');
 if(incoming.searchParams.get('edition')==='standard')url.searchParams.set('edition','standard');
 return new Response(null,{status:302,headers:{Location:url.toString(),'Cache-Control':'no-store'}});
});
