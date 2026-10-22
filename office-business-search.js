(function(){
'use strict';
const $=id=>document.getElementById(id);
const depots={BOLINGBROOK:'NWTB Bolingbrook',PALATINE:'NWTB Palatine'};
const radii=[5,10,25,50,100];

function scope(prefix){
 const depot=$(prefix+'Depot')?.value||'BOLINGBROOK',value=$(prefix+'Radius')?.value||'';
 return {depot,radius_miles:value===''?null:Number(value)};
}
function mount(parent,prefix,onChange){
 if($(prefix+'Radius'))return;
 const controls=document.createElement('div');
 controls.className='small';controls.style.cssText='margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
 controls.innerHTML='<label for="'+prefix+'Radius" style="margin:0">Business radius</label><select id="'+prefix+'Radius" style="width:auto;padding:6px"><option value="" selected>No radius — search U.S. by name</option>'+radii.map(n=>'<option value="'+n+'">Within '+n+' miles</option>').join('')+'</select><label for="'+prefix+'Depot" style="margin:0">Distance from / radius center</label><select id="'+prefix+'Depot" style="width:auto;padding:6px"><option value="BOLINGBROOK" selected>NWTB Bolingbrook</option><option value="PALATINE">NWTB Palatine</option></select><span id="'+prefix+'Scope" role="status" style="flex-basis:100%"></span>';
 parent.appendChild(controls);
 const describe=()=>{const s=scope(prefix);$(prefix+'Scope').textContent=s.radius_miles===null?'Search the U.S. by business name. Include a city to narrow the search.':'Public businesses within '+s.radius_miles+' miles of '+depots[s.depot]+', nearest first. NWTB customer, vendor and saved-location searches stay available.';};
 for(const suffix of ['Radius','Depot'])$(prefix+suffix).addEventListener('change',()=>{describe();onChange();});
 describe();
}
function nameScore(name,raw){
 const clean=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f'’`]/g,'').trim().toUpperCase();
 const n=clean(name),q=clean(raw);return n===q?0:n.startsWith(q)?1:2;
}
function compare(a,b,raw,s){
 if(s.radius_miles!==null){const distance=Number(a.distance_miles)-Number(b.distance_miles);if(Number.isFinite(distance)&&distance)return distance;}
 // Retain the directory's relevance order for equally close name matches.
 return nameScore(a.name,raw)-nameScore(b.name,raw);
}
function distanceText(row,s){
 return Number(row.distance_miles).toFixed(1)+' mi straight-line from '+depots[s.depot];
}
function summary(s,count){
 const area=s.radius_miles===null?'U.S. business-name search, no radius.':('Within '+s.radius_miles+' miles of '+depots[s.depot]+', nearest first.');
 const none=count?'':s.radius_miles===null?'No public business matches returned for this name. ':'No public business matches inside this radius. Choose a larger radius or No radius to expand. ';
 return none+area+' Business directory: © OpenStreetMap contributors. Coverage varies; confirm the branch and full address.';
}
window.NWTBBusinessSearch=Object.freeze({scope,mount,compare,distanceText,summary});
})();
