'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const assert=require('node:assert/strict'),{fixture,settle}=require('./driver-map-lifecycle.test.cjs');
async function setup(fail=false){const f=fixture();f.private.initMap(41.7,-88);f.load('office-route-map.js');f.load('office-driver-map.js');const messages=[];
 if(fail){const native=f.window.fetch;f.window.fetch=async(url,init)=>String(url).endsWith('/nwtb-driver-navigation')?f.response({error:'Fixture outage'},503):native(url,init);}
 const overlay=f.window.NWTBOfficeDriverMap.create({map:f.private.map,L:f.window.L,onStatus:(text,warn)=>messages.push({text,warn})});return {f,overlay,messages,lines:()=>Object.values(f.private.map._layers).filter(l=>l instanceof f.window.L.Polyline)};
}
(async()=>{
 const selection={window:{},document:{addEventListener(){}},setInterval(){},Map,Set,Date,console};vm.createContext(selection);vm.runInContext(fs.readFileSync(path.join(__dirname,'../tracker-route-pins-live.js'),'utf8'),selection);
 const choose=selection.window.NWTBOfficeDriverRoutes.select;
 const planned={id:'p1',driver_employee_number:'1234',status:'PLANNED',released_to_driver:true,route_date:'2026-10-27'},active={...planned,id:'a1',status:'ACTIVE',route_date:'2026-10-26'};
 const selected=choose([planned,{...planned,id:'p2'},active,{...planned,id:'p3',driver_employee_number:'5678'},{...planned,id:'hidden',released_to_driver:false,driver_employee_number:'9012'}],[{driver_employee_number:'1234',route_id:'p2',online:true},{driver_employee_number:'5678',route_id:'p3',online:false},{driver_employee_number:'9012',online:true}],r=>r.online);
 assert.equal(selected.map(r=>r.id).join(','),'a1','Only the current ACTIVE route is drawn; future pre-routes and offline unstarted routes are excluded');
 assert.equal(choose([planned,{...planned,id:'p2'}],[{driver_employee_number:'1234',route_id:'p2',online:true}],r=>r.online).map(r=>r.id).join(','),'p2','Online released driver gets one assigned planned route');
 const {f,overlay,messages,lines}=await setup(),detail={route:{...f.data.route,updated_at:'fixture-1'},stops:f.data.stops,driver:{display_name:'Fixture Driver',employee_number:'1234'},location:{lat:41.7,lon:-88,captured_at:new Date().toISOString()},phone:{live:false}};
 const before=JSON.stringify(detail);await overlay.update(detail);assert.equal(JSON.stringify(detail),before,'Office map never modifies route or stop objects');assert.equal(lines().length,3,'Saved outbound legs and return leg drawn');assert.equal(lines().filter(l=>l.options.color==='#f58220').length,1);assert.equal(f.fixes(),0,'Office map never requests Driver GPS');assert.ok(messages.at(-1).text.includes('Orange: return leg'));
 const count=f.requests.length;await overlay.update(detail);assert.equal(f.requests.length,count,'Polling does not recalculate unchanged saved route legs');
 detail.phone={live:true,snapshot:{navigation_active:true,geometry_key:'phone-route1'},geometry:[[-88,41.7],[-88.01,41.71]]};await overlay.update(detail);assert.equal(lines().filter(l=>l.options.color==='#7c3aed').length,1,'Actual reported phone path drawn separately');
 detail.phone.live=false;await overlay.update(detail);assert.equal(lines().filter(l=>l.options.color==='#7c3aed').length,0,'Stale phone path is removed');assert.ok(overlay.getBoundsPoints().length>=4);overlay.destroy();assert.equal(lines().length,0,'Closing/replacing a view removes its overlay');
 const failed=await setup(true);await failed.overlay.update({...detail,phone:{live:false}});assert.equal(failed.lines().length,0,'Routing outage never draws fabricated straight road lines');assert.ok(failed.messages.at(-1).warn);failed.overlay.destroy();
 console.log('PASS: real Leaflet Office road route and return path, current phone geometry, stale clearing, input immutability and no GPS/session/route mutations.');
})().catch(e=>{console.error(e);process.exitCode=1});
