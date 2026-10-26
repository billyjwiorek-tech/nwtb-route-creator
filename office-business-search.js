(function(){
'use strict';
const $=id=>document.getElementById(id);
const depots={BOLINGBROOK:'NWTB Bolingbrook',PALATINE:'NWTB Palatine'};
const centers={BOLINGBROOK:{lat:41.682487,lon:-88.072262},PALATINE:{lat:42.148326,lon:-88.033080}};
const radii=[5,10,25,50,100];

function scope(prefix){
 const depot=$(prefix+'Depot')?.value||'BOLINGBROOK',value=$(prefix+'Radius')?.value||'';
 return {depot,radius_miles:value===''?null:Number(value)};
}
function mount(parent,prefix,onChange){
 if($(prefix+'Radius'))return;
 const controls=document.createElement('div');
 controls.className='small';controls.style.cssText='margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
 controls.innerHTML='<label for="'+prefix+'Radius" style="margin:0">Business radius</label><select id="'+prefix+'Radius" style="width:auto;padding:6px"><option value="" selected>No radius — closest first</option>'+radii.map(n=>'<option value="'+n+'">Within '+n+' miles</option>').join('')+'</select><label for="'+prefix+'Depot" style="margin:0">Distance from / radius center</label><select id="'+prefix+'Depot" style="width:auto;padding:6px"><option value="BOLINGBROOK" selected>NWTB Bolingbrook</option><option value="PALATINE">NWTB Palatine</option></select><span id="'+prefix+'Scope" role="status" style="flex-basis:100%"></span>';
 parent.appendChild(controls);
 const describe=()=>{const s=scope(prefix);$(prefix+'Scope').textContent=(s.radius_miles===null?'Search the U.S. by business name, closest to '+depots[s.depot]+' first. Include a city to narrow the search.':'Public businesses within '+s.radius_miles+' miles of '+depots[s.depot]+', nearest first.')+' NWTB locations without verified coordinates appear after located matches.';};
 for(const suffix of ['Radius','Depot'])$(prefix+suffix).addEventListener('change',()=>{describe();onChange();});
 describe();
}
function nameScore(name,raw){
 const clean=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f'’`]/g,'').trim().toUpperCase();
 const n=clean(name),q=clean(raw);return n===q?0:n.startsWith(q)?1:2;
}
function distanceMiles(row,s){
 const value=row.distance_miles;
 if(row._business&&value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0)return Number(value);
 if([row.lat,row.lon].some(v=>v===null||v===undefined||v===''))return Infinity;
 const lat=Number(row.lat),lon=Number(row.lon),depot=centers[s.depot];
 if(!depot||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<20||lat>60||lon< -135||lon> -55)return Infinity;
 const rad=n=>n*Math.PI/180,a=Math.sin(rad(lat-depot.lat)/2)**2+Math.cos(rad(depot.lat))*Math.cos(rad(lat))*Math.sin(rad(lon-depot.lon)/2)**2;
 return 3958.7613*2*Math.atan2(Math.sqrt(Math.min(1,a)),Math.sqrt(Math.max(0,1-a)));
}
function compare(a,b,raw,s){
 const da=distanceMiles(a,s),db=distanceMiles(b,s);
 if(da!==db)return da<db?-1:1;
 return nameScore(a.name,raw)-nameScore(b.name,raw);
}
function distanceText(row,s){
 const distance=distanceMiles(row,s);
 return Number.isFinite(distance)?distance.toFixed(1)+' mi straight-line from '+depots[s.depot]:'Distance unavailable — no verified coordinates';
}
function summary(s,count,data={}){
 const area=s.radius_miles===null?'U.S. business-name search, no radius; closest to '+depots[s.depot]+' first.':('Within '+s.radius_miles+' miles of '+depots[s.depot]+', nearest first.');
 const none=count?'':s.radius_miles===null?'No public business matches returned for this name. ':'No public business matches inside this radius. Choose a larger radius or No radius to expand. ';
 const source=data.source==='TOMTOM'?'Business directory: © TomTom.':'Backup business directory: © OpenStreetMap contributors.';
 return none+area+' '+source+' Confirm the branch and full address. NWTB directories are not radius-filtered; matches without verified coordinates appear last.';
}
window.NWTBBusinessSearch=Object.freeze({scope,mount,compare,distanceMiles,distanceText,summary});
})();
