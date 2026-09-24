from pathlib import Path

nav_path = Path('navigation.js')
nav = nav_path.read_text(encoding='utf-8')

if 'DELIVERY_MATRIX_URL' not in nav:
    needle = "  const isPhone=()=>/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||window.matchMedia('(max-width: 760px)').matches;\n"
    if needle not in nav:
        raise SystemExit('Could not find navigation insertion point')
    block = r'''

  // SALES stays separate, but routing now uses the same NWTB road-matrix engine as Delivery.
  const DELIVERY_MATRIX_URL='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-route-matrix';
  const DELIVERY_MATRIX_KEY='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';

  async function deliveryRoadMatrix(points){
    const clean=points.map(p=>({lat:Number(p?.lat),lon:Number(p?.lon)}));
    if(clean.some(p=>!Number.isFinite(p.lat)||!Number.isFinite(p.lon)))throw new Error('One or more selected sales accounts need valid routing coordinates.');
    const r=await fetch(DELIVERY_MATRIX_URL,{
      method:'POST',
      headers:{'content-type':'application/json','apikey':DELIVERY_MATRIX_KEY,'x-nwtb-sales':'1'},
      body:JSON.stringify({points:clean})
    });
    const j=await r.json().catch(()=>({error:'Invalid routing response'}));
    if(!r.ok)throw new Error(j.error||'NWTB Delivery routing service failed.');
    if(!Array.isArray(j.durations)||!Array.isArray(j.distances))throw new Error('NWTB Delivery road matrix is unavailable.');
    return j;
  }

  function deliveryRouteCost(order,matrix){
    const q=[0,...order,0];let total=0;
    for(let i=0;i<q.length-1;i++){
      const v=Number(matrix?.[q[i]]?.[q[i+1]]);
      if(!Number.isFinite(v))return Infinity;
      total+=v;
    }
    return total;
  }

  function deliveryNearest(matrix,n){
    const remaining=new Set(Array.from({length:n},(_,i)=>i+1)),order=[];let cur=0;
    while(remaining.size){
      let best=null,val=Infinity;
      for(const j of remaining){
        const v=Number(matrix?.[cur]?.[j]);
        if(Number.isFinite(v)&&v<val){val=v;best=j}
      }
      if(best==null)best=[...remaining][0];
      order.push(best);remaining.delete(best);cur=best;
    }
    return order;
  }

  function deliveryTwoOpt(order,matrix){
    let best=order.slice(),cost=deliveryRouteCost(best,matrix),improved=true,round=0;
    while(improved&&round++<8){
      improved=false;
      for(let i=0;i<best.length-1;i++)for(let k=i+1;k<best.length;k++){
        const next=best.slice();
        next.splice(i,k-i+1,...next.slice(i,k+1).reverse());
        const c=deliveryRouteCost(next,matrix);
        if(c+1<cost){best=next;cost=c;improved=true}
      }
    }
    return best;
  }

  async function deliveryOptimizeSales(selected){
    const pts=[depot,...selected];
    const matrix=await deliveryRoadMatrix(pts);
    const order=deliveryTwoOpt(deliveryNearest(matrix.durations,selected.length),matrix.durations);
    const meters=deliveryRouteCost(order,matrix.distances);
    const seconds=deliveryRouteCost(order,matrix.durations);
    if(!Number.isFinite(meters)||!Number.isFinite(seconds))throw new Error('The NWTB Delivery routing engine returned an invalid route.');
    const routeMiles=Math.round((meters/1609.344)*10)/10;
    const routeMinutes=Math.round(seconds/60);
    if(routeMiles>3000||routeMinutes>5000)throw new Error('Route estimate is outside a reasonable range. One or more sales locations need verification.');
    return {order:order.map(i=>i-1),miles:routeMiles,minutes:routeMinutes,source:matrix.source||'NWTB DELIVERY ROAD MATRIX',warning:matrix.warning||''};
  }

  function annotateDeliveryEngine(result){
    try{
      const out=$('output');
      const n=out?.querySelector('.notice');
      if(!n)return;
      const source=result?.source==='FALLBACK_APPROXIMATE'?'APPROXIMATE FALLBACK':'ROAD MATRIX';
      n.insertAdjacentHTML('beforeend',`<br><b>ROUTING ENGINE:</b> NWTB Delivery ${source}${result?.warning?` • ${esc(result.warning)}`:''}`);
    }catch{}
  }
'''
    nav = nav.replace(needle, needle + block, 1)

old_matrix = """      const pts=[depot,...cand];
      const coords=pts.map(p=>`${p.lon},${p.lat}`).join(';');
      const matrix=await osrm(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration`);
      if(matrix.code!=='Ok'||!matrix.durations)throw new Error('Road matrix unavailable');"""
new_matrix = """      const pts=[depot,...cand];
      const matrix=await deliveryRoadMatrix(pts);
      if(matrix.code!=='Ok'||!matrix.durations)throw new Error('NWTB Delivery road matrix unavailable');"""
if old_matrix in nav:
    nav = nav.replace(old_matrix, new_matrix, 1)

old_fallback = """    }catch(e){console.warn('Efficiency-first selection fallback:',e)}
    return cand.slice().sort((a,b)=>miles(depot,a)-miles(depot,b)).slice(0,n);"""
new_fallback = """    }catch(e){throw new Error('NWTB Delivery routing engine could not select the New Business group: '+(e.message||e))}"""
if old_fallback in nav:
    nav = nav.replace(old_fallback, new_fallback, 1)

nav = nav.replace(
    "out.style.display='block';out.innerHTML='<b>Choosing the most efficient customer group and optimizing the road route...</b>';",
    "out.style.display='block';out.innerHTML='<b>Choosing the sales stops and optimizing with the NWTB Delivery routing engine...</b>';",
    1,
)
nav = nav.replace('      const j=await optimize(sel);', '      const j=await deliveryOptimizeSales(sel);', 1)
old_render = "      renderRoute(j.order.map(i=>sel[i]),{miles:j.miles,minutes:j.minutes,efficiencyFirst:t==='new_business'});"
if old_render in nav and 'annotateDeliveryEngine(j);' not in nav:
    nav = nav.replace(old_render, old_render + "\n      annotateDeliveryEngine(j);", 1)

nav = nav.replace('CREATE + FREE OPTIMIZE', 'CREATE + DELIVERY OPTIMIZE')
nav_path.write_text(nav, encoding='utf-8')

for name in ('index.html', 'app.html'):
    p = Path(name)
    if not p.exists():
        continue
    s = p.read_text(encoding='utf-8')
    replacements = {
        'VERSION 2026-09-23 READY': 'VERSION 2026-09-24 • DELIVERY ROUTING ENGINE',
        'Sales Intelligence Map • FREE road optimization': 'Sales Intelligence Map • NWTB Delivery road routing engine',
        'CREATE + FREE OPTIMIZE': 'CREATE + DELIVERY OPTIMIZE',
        "Today's Free Road-Optimized Route": "Today's Delivery-Engine Optimized Route",
        'FREE ROAD OPTIMIZED': 'DELIVERY ROAD ENGINE',
        'Only route-eligible route-database accounts can be selected.': 'Uses the same NWTB road-matrix routing engine as Delivery. Only route-eligible sales accounts can be selected.',
        'navigation.js?v=20260923READY': 'navigation.js?v=20260924DELIVERY',
    }
    for old, new in replacements.items():
        s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')

nav_check = nav_path.read_text(encoding='utf-8')
idx_check = Path('index.html').read_text(encoding='utf-8')
assert 'DELIVERY_MATRIX_URL' in nav_check
assert 'deliveryOptimizeSales(sel)' in nav_check
assert "'x-nwtb-sales':'1'" in nav_check
assert 'router.project-osrm.org/table/v1/driving/${coords}?annotations=duration`);' not in nav_check
assert 'VERSION 2026-09-24 • DELIVERY ROUTING ENGINE' in idx_check
assert 'navigation.js?v=20260924DELIVERY' in idx_check
print('Sales now uses the Delivery road-matrix routing engine.')
