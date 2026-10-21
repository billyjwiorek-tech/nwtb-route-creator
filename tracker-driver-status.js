(()=>{
 'use strict';
 const now=()=>Date.now(),time=value=>Date.parse(value||'');
 const recent=(value,limit=120000)=>{const t=time(value);return Number.isFinite(t)&&t<=now()+15000&&now()-t<=limit};
 const online=r=>r?.logged_in===true&&recent(r.session_last_seen_at);
 const gpsFresh=r=>r?.has_location!==false&&r?.lat!=null&&r?.lon!=null&&String(r.lat).trim()!==''&&String(r.lon).trim()!==''&&Number.isFinite(Number(r.lat))&&Number.isFinite(Number(r.lon))&&Math.abs(Number(r.lat))<=90&&Math.abs(Number(r.lon))<=180&&recent(r.captured_at)&&!(r.accuracy_m!=null&&(!Number.isFinite(Number(r.accuracy_m))||Number(r.accuracy_m)<0||Number(r.accuracy_m)>500));
 const assigned=r=>!!(r?.route&&r.route_id&&(r.route.status==='ACTIVE'||r.route.status==='PLANNED'&&r.route.released_to_driver===true));
 const returnLabel=r=>r.route?.end_mode==='RETURN_DEPOT'||!r.route?.end_mode||/NWTB|NORTHWEST TRUCKS/i.test(r.route?.end_name||'')?'RETURNING TO NWTB':'RETURN LEG IN PROGRESS';
 const phase=r=>{
  const presence=online(r)?'ONLINE':'OFFLINE';
  if(!assigned(r))return presence+' • NO ACTIVE ROUTE';
  const route=r.route;
  return presence+' • '+(route.returning_started_at&&!route.returned_at?returnLabel(r):route.paused?'ROUTE PAUSED':route.status==='PLANNED'?'ROUTE RELEASED — NOT STARTED':'ACTIVE ROUTE');
 };
 const speed=r=>gpsFresh(r)&&r.speed_mps!=null&&Number.isFinite(Number(r.speed_mps))&&Number(r.speed_mps)>=0?Math.round(Number(r.speed_mps)*2.23694)+' mph':null;
 const stamp=value=>Number.isFinite(time(value))?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value)):'not reported';
 window.NWTBDriverStatus=Object.freeze({online,gpsFresh,assigned,returnLabel,phase,speed,stamp,recent});
})();
