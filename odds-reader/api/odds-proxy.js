/* Server-side odds gateway for Odds Reader Lab.
 * Forwards caller's API key only to The Odds API. No stored keys.
 * Restricts requests to NFL/FanDuel market-read endpoints.
 */
const API='https://api.the-odds-api.com/v4/sports/americanfootball_nfl';
function send(res,status,data) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(status).json(data);
}
module.exports=async function(req,res){
  if(req.method!=='POST')return send(res,405,{error:'Use POST to request odds.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!body||typeof body!=='object'||JSON.stringify(body).length>4096)return send(res,400,{error:'Invalid request.'});
    const apiKey=body.apiKey,route=body.path,params=body.params||{};
    if(typeof apiKey!=='string'||!/^[a-zA-Z0-9_-]{16,128}$/.test(apiKey))return send(res,400,{error:'Enter a valid data-provider API key.'});
    if(typeof route!=='string')return send(res,400,{error:'Invalid NFL odds request.'});
    const odds=route==='/odds';
    const marketMatch=/^\/events\/([a-zA-Z0-9_-]{5,100})\/markets$/.exec(route);
    const eventMatch=/^\/events\/([a-zA-Z0-9_-]{5,100})\/odds$/.exec(route);
    if(!odds&&!marketMatch&&!eventMatch)return send(res,400,{error:'Unsupported NFL odds request.'});
    const rawMarkets=typeof params.markets==='string'?params.markets:'';
    if(!marketMatch){
      if(!rawMarkets||rawMarkets.length>1600||rawMarkets.split(',').length>48||!rawMarkets.split(',').every(m=>/^(?:h2h|spreads|totals|player_[a-z0-9_]{1,55})$/.test(m))){
        return send(res,400,{error:'Choose supported NFL markets.'});
      }
    }
    const qs=new URLSearchParams({apiKey,bookmakers:'fanduel',oddsFormat:'american'});
    if(rawMarkets&&!marketMatch)qs.set('markets',rawMarkets);
    const target=API+route+'?'+qs;
    const reply=await fetch(target,{method:'GET',headers:{Accept:'application/json'},signal:AbortSignal.timeout(18000),redirect:'error'});
    for(const h of ['x-requests-remaining','x-requests-last','x-requests-used']){
      const v=reply.headers.get(h);
      if(v!==null&&/^\d+$/.test(v))res.setHeader(h,v);
    }
    let data;
    try{data=await reply.json()}catch(e){return send(res,502,{error:'Odds provider returned invalid data.'})}
    if(!reply.ok){
      let msg=String(data&&((data.message||data.error)||'Provider request failed.'));
      msg=msg.replaceAll(apiKey,'[redacted]').slice(0,240);
      return send(res,reply.status>=400&&reply.status<500?reply.status:502,{error:'Odds provider: '+msg});
    }
    if(!data||typeof data!=='object')return send(res,502,{error:'Unexpected odds provider response.'});
    return send(res,200,data);
  }catch(e){
    const timeout=e&&e.name==='TimeoutError';
    // Never include the user's key, request URL or raw fetch exception in a response.
    return send(res,timeout?504:502,{error:timeout?'Provider request timed out. Try again.':'Cloud odds connection failed. Try again or check the data-provider status.'});
  }
};