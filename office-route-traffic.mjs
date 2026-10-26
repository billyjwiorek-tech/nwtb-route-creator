import { installOfficeTraffic } from './office-map-live.mjs?v=20261026-etarefresh1';
import { MAX_GPS_AGE_MS, MAX_ETA_AGE_MS, unavailableMessage, officeConfigProblem } from './supabase/functions/nwtb-office-map/policy.mjs?v=20261022-trafficeta1';

export function installRoutePreviewTraffic({ map, L, config, model, getOfficeToken, onFocus, fetcher = fetch, document = globalThis.document, window = globalThis.window, timers = globalThis, clock = Date.now, installOverlay = installOfficeTraffic }) {
  if (officeConfigProblem(config) || window.location.origin !== config.siteOrigin) throw Error('NWTB Office configuration required.');
  const host = document.getElementById('officeRouteEta');
  if (!host) throw Error('Office ETA panel unavailable.');
  let disposed = false, intersects = true, data = null, problem = null, sequence = 0, controller = null, busy = false, manualResult = false, lastToken = String(getOfficeToken() || ''), displayKey = '';
  const countdowns = new Map();
  const visible = () => !disposed && intersects && document.visibilityState !== 'hidden';
  const token = () => String(getOfficeToken() || '');
  const time = iso => new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',hour:'numeric',minute:'2-digit'}).format(new Date(iso));
  const updatedTime = iso => new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date(iso));
  const node = (tag,text,cls) => { const el = document.createElement(tag); if(text!==undefined)el.textContent=text; if(cls)el.className=cls; return el; };
  const header = node('div',undefined,'officeEtaHead'), heading = node('b','LIVE TRAFFIC ARRIVAL ESTIMATES'), refresh = node('button','REFRESH ETA');
  refresh.type='button';header.append(heading,refresh);
  const status = node('div','CONNECTING TO TRAFFIC ESTIMATES…','officeEtaStatus');status.setAttribute('role','status');
  const body = node('div',undefined,'officeEtaBody');
  host.replaceChildren(header,status,body);
  const overlay = installOverlay({map,L,config,getRows:()=>[],getMarkers:()=>new Map(),getOfficeToken,fetcher,document,window,timers,clock,isVisible:visible});
  // On this read-only preview, keep traffic colors above the saved route stroke
  // and below stop pins. The separate Live Drivers map keeps its existing pane.
  const trafficPane=map.getPane('nwtbTraffic');if(trafficPane)trafficPane.style.zIndex='450';

  function responseProblem(value) {
    if (value?.available === false) return value.code || 'TRAFFIC_UNAVAILABLE';
    if (!value || value.ok!==true || value.available!==true || value.source!=='TOMTOM' || value.traffic_aware!==true || value.route_id!==model.routeId || value.route_status!==model.routeStatus) return 'ROUTE_CHANGED';
    if (model.updatedAt && Date.parse(value.route_updated_at)!==Date.parse(model.updatedAt)) return 'ROUTE_CHANGED';
    const expected=model.stops.map(s=>({id:String(s.stopId),sequence:Number(s.label),status:s.status}));
    if (JSON.stringify(value.view_stops)!==JSON.stringify(expected)) return 'ROUTE_CHANGED';
    if (!Number.isFinite(Date.parse(value.calculated_at)) || clock()-Date.parse(value.calculated_at)>MAX_ETA_AGE_MS || Date.parse(value.calculated_at)>clock()+15000) return 'TRAFFIC_UNAVAILABLE';
    if (model.routeStatus==='ACTIVE') {
      const age=clock()-Date.parse(value.gps_captured_at);
      if (value.basis!=='CURRENT_GPS' || !Number.isFinite(age) || age>MAX_GPS_AGE_MS || age < -15000) return 'GPS_STALE';
    } else if(value.basis!=='PLANNED_DEPART_NOW') return 'ROUTE_CHANGED';
    const targets=[...model.stops.filter(s=>s.status==='PENDING').map(s=>String(s.stopId)),...(model.end?['return']:[])];
    if (!Array.isArray(value.arrivals) || value.arrivals.length!==targets.length) return 'ROUTE_CHANGED';
    let previous=Date.parse(value.calculated_at);
    for(let i=0;i<targets.length;i++){
      const row=value.arrivals[i],arrival=Date.parse(row?.arrival_at);
      if(!row || row.id!==targets[i] || row.kind!==(row.id==='return'?'RETURN':'STOP') || !Number.isFinite(arrival) || arrival<previous || !Number.isFinite(row.minutes) || row.minutes<0 || !Number.isFinite(row.leg_drive_seconds) || row.leg_drive_seconds<0 || !Number.isFinite(row.service_seconds) || row.service_seconds<0) return 'TRAFFIC_UNAVAILABLE';
      previous=arrival;
    }
    return null;
  }
  function render() {
    refresh.disabled=busy||!token();
    refresh.textContent=busy?'REFRESHING ETA…':'REFRESH ETA';
    host.setAttribute('aria-busy',String(busy));
    const error=!token()?'SESSION_EXPIRED':problem||(data?responseProblem(data):null);
    if(error){status.textContent=error==='ROUTE_CHANGED'?'ETA UNAVAILABLE — SAVED ROUTE CHANGED. Click REFRESH SAVED ROUTE to reload its stops.':unavailableMessage(error);status.className='officeEtaStatus warn';}
    else if(!data){status.textContent='CALCULATING ARRIVALS WITH TRAFFIC…';status.className='officeEtaStatus';}
    else {
      status.className='officeEtaStatus';
      status.textContent=(busy?'REFRESHING ARRIVALS WITH TRAFFIC… • ':'')+(data.basis==='CURRENT_GPS'?'ACTIVE ROUTE • FROM DRIVER GPS • FIX '+updatedTime(data.gps_captured_at):'PLANNED ROUTE • IF DEPARTING NOW FROM '+String(data.origin_name||'ROUTE START').toUpperCase())+' • '+(manualResult?'REFRESHED ':'UPDATED ')+updatedTime(data.calculated_at)+' • ALL TIMES CENTRAL';
    }
    const nextKey=JSON.stringify(error?['error',error]:data?['data',data]:['loading']);
    if(nextKey!==displayKey){
      displayKey=nextKey;body.replaceChildren();countdowns.clear();
      if(!error&&data){
        const table=node('table'),thead=node('thead'),headRow=node('tr');
        for(const label of ['STOP / RETURN','ARRIVAL','FROM NOW','TRAFFIC DELAY'])headRow.appendChild(node('th',label));
        thead.appendChild(headRow);table.appendChild(thead);const tbody=node('tbody');
        for(const row of data.arrivals){
          const tr=node('tr'),target=node('td'),button=node('button',(row.kind==='RETURN'?'RETURN':'STOP '+row.sequence)+' — '+row.name),remaining=node('td');
          button.type='button';button.className='officeEtaFocus';button.addEventListener('click',()=>onFocus?.(row.id));target.appendChild(button);
          countdowns.set(remaining,Date.parse(row.arrival_at));
          tr.append(target,node('td',time(row.arrival_at)),remaining,node('td',row.traffic_delay_seconds==null?'Unavailable':Math.ceil(row.traffic_delay_seconds/60)+' min'));tbody.appendChild(tr);
        }
        table.appendChild(tbody);body.appendChild(table);
        body.appendChild(node('p','Includes estimated stop service, using the saved service total where available. TomTom estimates follow the saved stop order; road choices can differ from driver navigation. Estimates refresh every 30 seconds while this preview is visible. REFRESH ETA requests a fresh traffic calculation; travel times may stay the same when conditions have not changed.','officeEtaNote'));
      }
    }
    // Keep focus on the existing stop buttons while the From now column advances.
    for(const [cell,arrival] of countdowns)cell.textContent=Math.max(0,Math.ceil((arrival-clock())/60000))+' min';
  }
  async function refreshEta(force = false) {
    if(!visible()||busy)return;
    if(!token()){data=null;problem='SESSION_EXPIRED';render();return;}
    const current=++sequence,session=token();controller?.abort();controller=new AbortController();const requestController=controller;
    const timeout=timers.setTimeout(()=>requestController.abort(),18000);busy=true;problem=null;render();
    try{
      const response=await fetcher(config.backendUrl+'/functions/v1/nwtb-office-map',{method:'POST',headers:{'content-type':'application/json',apikey:config.publishableKey,'x-nwtb-session':session},body:JSON.stringify({action:'route_preview_eta',route_id:model.routeId,expected_updated_at:model.updatedAt||null,refresh:force===true}),signal:requestController.signal,cache:'no-store'});
      const value=await response.json();
      if(disposed||requestController.signal.aborted||sequence!==current||session!==token()||!visible())return;
      if(!response.ok)throw Object.assign(Error('Traffic estimate unavailable.'),{code:value.code||(response.status===401?'SESSION_EXPIRED':'TRAFFIC_UNAVAILABLE')});
      problem=responseProblem(value);data=problem?null:value;manualResult=force===true&&!problem;
    }catch(error){if(!disposed&&sequence===current){data=null;problem=error.code||'TRAFFIC_UNAVAILABLE';}}
    finally{timers.clearTimeout(timeout);if(sequence===current){busy=false;render();}}
  }
  const pause=()=>{sequence++;controller?.abort();controller=null;busy=false;};
  const visibilityChanged=()=>{overlay.syncOverlay();if(visible())void refreshEta();else pause();};
  refresh.addEventListener('click',()=>void refreshEta(true));document.addEventListener('visibilitychange',visibilityChanged);
  let observer;
  if(window.IntersectionObserver){observer=new window.IntersectionObserver(entries=>{intersects=entries.some(e=>e.isIntersecting);visibilityChanged();});observer.observe(host.closest('.officeRouteMapShell')||host);}
  const poll=timers.setInterval(()=>void refreshEta(),30000);
  const health=timers.setInterval(()=>{const next=token();if(next!==lastToken){lastToken=next;pause();data=null;problem=next?null:'SESSION_EXPIRED';if(next&&visible())void refreshEta();}render();},5000);
  function destroy(){if(disposed)return;disposed=true;pause();overlay.destroy();observer?.disconnect();timers.clearInterval(poll);timers.clearInterval(health);document.removeEventListener('visibilitychange',visibilityChanged);map.off('unload',destroy);}
  map.on('unload',destroy);void refreshEta();
  return {destroy,refreshEta,render,overlay};
}
