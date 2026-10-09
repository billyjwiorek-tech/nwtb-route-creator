/* Odds Reader Lab NFL historical data adapter.
   NFLverse public CC BY 4.0 player-week release + ESPN scoreboard.
   Not affiliated with ESPN, NFL or FanDuel. */
const BASE='https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const cache=new Map();
const fields=['player_id','player_name','player_display_name','position','position_group','team','recent_team','opponent_team','season','week','season_type','game_id','passing_yards','passing_tds','passing_interceptions','completions','attempts','rushing_yards','rushing_tds','carries','receiving_yards','receptions','receiving_tds','targets'];
function parseCsv(txt){
  const out=[],headers=[];
  let cell='',row=[],quoted=false;
  const emit=()=>{row.push(cell);cell='';if(!headers.length){headers.push(...row.map(x=>x.replace(/^\uFEFF/,'')));}else{out.push(row);}row=[]};
  for(let i=0;i<txt.length;i++){
    const ch=txt[i];
    if(ch==='"'){
      if(quoted&&txt[i+1]==='"'){cell+='"';i++}else quoted=!quoted;
    }else if(!quoted&&ch===','){row.push(cell);cell='';}
    else if(!quoted&&(ch==='\n'||ch==='\r')){if(ch==='\r'&&txt[i+1]==='\n')i++;emit();}
    else cell+=ch;
  }
  if(cell||row.length)emit();
  return {headers,rows:out};
}
const num=x=>{const n=Number(x);return Number.isFinite(n)?n:0};
async function fetchJson(url){
  const ctl=AbortSignal.timeout(17000);
  const r=await fetch(url,{headers:{'Accept':'application/json'},signal:ctl});
  if(!r.ok)throw Error('Data source HTTP '+r.status);
  return r.json();
}
async function players(year){
  const key='player:'+year,old=cache.get(key);
  if(old&&Date.now()-old.time<9*60*1000)return old.data;
  const url='https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_'+year+'.csv';
  const r=await fetch(url,{headers:{Accept:'text/csv'},signal:AbortSignal.timeout(23000)});
  if(!r.ok)throw Error('Historical player dataset unavailable ('+r.status+'). Check that '+year+' data has been released.');
  const text=await r.text();
  if(!text.startsWith('player_')&&!text.includes('player_display_name'))throw Error('Historical data response was not CSV');
  const parsed=parseCsv(text),idx=Object.fromEntries(fields.map(f=>[f,parsed.headers.indexOf(f)]));
  if(idx.week<0||idx.opponent_team<0||idx.receiving_yards<0)throw Error('Historical dataset schema changed');
  const rows=[];
  for(const row of parsed.rows){
    if(row[idx.season_type]&&row[idx.season_type]!=='REG')continue;
    const item={};
    for(const f of fields)if(idx[f]>=0)item[f]=row[idx[f]];
    item.team=item.team||item.recent_team||'';
    if(!item.team||!item.opponent_team||!item.player_id||!item.week)continue;
    for(const f of fields.filter(f=>/yards|_tds|interceptions|completions|attempts|receptions|targets|carries|^week$/.test(f)))item[f]=num(item[f]);
    rows.push(item);
  }
  const data={season:year,updated_at:new Date().toISOString(),source:'nflverse stats_player_week '+year,records:rows.length,rows};
  cache.set(key,{time:Date.now(),data});
  return data;
}
async function schedule(year,week){
  const key='sched:'+year+':'+week,old=cache.get(key);
  if(old&&Date.now()-old.time<3*60*1000)return old.data;
  const data=await fetchJson(BASE+'/scoreboard?season='+year+'&week='+week+'&seasontype=2&limit=50');
  const events=(data.events||[]).map(e=>{
    const c=e.competitions?.[0]?.competitors||[];
    const home=c.find(x=>x.homeAway==='home'),away=c.find(x=>x.homeAway==='away');
    if(!home||!away)return null;
    return {id:String(e.id),date:e.date,week,season:year,home:home.team?.abbreviation||'',away:away.team?.abbreviation||'',home_name:home.team?.displayName||'',away_name:away.team?.displayName||'',completed:!!(e.status?.type?.completed||e.competitions?.[0]?.status?.type?.completed)};
  }).filter(Boolean);
  const result={season:year,week,events,source:'ESPN scoreboard',updated_at:new Date().toISOString()};
  cache.set(key,{time:Date.now(),data:result});return result;
}
module.exports=async function(req,res){
 try{
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  const year=Number(req.query.season),week=Number(req.query.week),type=String(req.query.type||'players');
  if(!Number.isInteger(year)||year<2020||year>new Date().getFullYear()+1)return res.status(400).json({error:'Invalid season'});
  let result;
  if(type==='players'){result=await players(year);res.setHeader('Cache-Control','public, s-maxage=900, stale-while-revalidate=300');}
  else if(type==='schedule'){if(!Number.isInteger(week)||week<1||week>18)return res.status(400).json({error:'Week must be 1 through 18'});result=await schedule(year,week);res.setHeader('Cache-Control','public, s-maxage=120, stale-while-revalidate=120');}
  else return res.status(400).json({error:'Unsupported data type'});
  return res.status(200).json(result);
 }catch(e){return res.status(502).json({error:String(e.message||e)})}
};