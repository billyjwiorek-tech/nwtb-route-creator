/* Odds Reader Lab — historical NFL trends and opponent matchup research.
   Source: NFLverse player-week records and ESPN schedule via /api/nfl-history.
   Betting lines and prices: real provider-reported FanDuel quotes only when loaded.
*/
(function(){
'use strict';
var s={rows:[],games:[],loaded:false,season:2026,week:5,checkedAt:null,source:'',results:[],lookback:5};
var get=id=>document.getElementById(id);
var clean=x=>String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});
var n=x=>Number(x)||0;
var moneyOdds=a=>{var z=Number(a);return !Number.isFinite(z)||Math.abs(z)<100?'—':(z>0?'+':'')+Math.round(z)};
var normalized=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');
var mappings={
 receiving_yards:{name:'Receiving yards',keys:['player_reception_yds','player_receiving_yards','player_reception_yds_alternate','player_reception_yds_alt']},
 rushing_yards:{name:'Rushing yards',keys:['player_rush_yds','player_rushing_yards','player_rush_yds_alternate']},
 passing_yards:{name:'Passing yards',keys:['player_pass_yds','player_passing_yards','player_pass_yds_alternate']},
 receptions:{name:'Receptions',keys:['player_receptions','player_receptions_alternate']},
 passing_tds:{name:'Passing touchdowns',keys:['player_pass_tds','player_pass_tds_alternate']},
 total_touchdowns:{name:'Anytime TDs (rushing + receiving)',keys:['player_anytime_td','player_1_plus_touchdowns']},
 rush_rec_yards:{name:'Rush + receiving yards',keys:['player_rush_rec_yds','player_rush_reception_yds']}
};
function stat(r,k){return k==='total_touchdowns'?n(r.rushing_tds)+n(r.receiving_tds):k==='rush_rec_yards'?n(r.rushing_yards)+n(r.receiving_yards):n(r[k])}
function pct(x){return Number.isFinite(x)?(100*x).toFixed(1)+'%':'—'}
var css=document.createElement('style');
css.textContent='#historyLab[hidden]{display:none!important}.histgrid{display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.4fr);gap:16px;align-items:start}.histline{border:1px solid #3b5673;background:#0b2133;padding:13px;border-radius:12px;margin:10px 0}.histpill{border:1px solid #65819b;border-radius:99px;font-size:11px;padding:3px 9px;display:inline-block;margin:3px 3px 3px 0}.histgood{color:#44e0ab;font-weight:800}.histwarn{color:#ffd08d}.histrow{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}.histfilters{display:grid;grid-template-columns:1fr 1fr;gap:8px}.histfilters .wide{grid-column:1 / -1}.histdesc{font-size:12px;color:#b6cbdb;line-height:1.5}.histnotice{background:#29291e;border:1px solid #716547;color:#ffe5af;padding:11px 13px;border-radius:11px;line-height:1.5;font-size:13px}.histtable{border-collapse:collapse;width:100%;font-size:12px}.histtable td,.histtable th{padding:5px 7px;text-align:left;border-bottom:1px solid #2f4b60}.histtable th{color:#a8c4d9}.histtopbtn{background:#193952;color:#eff;border:1px solid #55768f;border-radius:8px;padding:6px 10px;cursor:pointer}@media(max-width:820px){.histgrid{grid-template-columns:1fr}.histfilters{grid-template-columns:1fr 1fr}}';
document.head.appendChild(css);
var tab=document.createElement('button');tab.id='histTab';tab.type='button';tab.textContent='Player Trends & Matchups';
document.querySelector('.tabs').appendChild(tab);
var pane=document.createElement('section');pane.id='historyLab';pane.hidden=true;
pane.innerHTML=[
'<h1>NFL Player Trends & Matchups <span class="histpill">Historical research</span></h1>',
'<div class="histnotice"><b>100% historical ≠ 100% future chance.</b> A player going 5-for-5 against an earlier schedule can miss against a stronger defense. This research uses completed NFL player stats and actual opponent matchups. FanDuel prices are only shown where the connected feed supplied them. No combined SGP payout can be inferred from individual prices.</div>',
'<div class="histgrid"><div class="stack">',
'<div class="card"><h2>1. Historical data</h2><div class="histfilters">',
'<label>Season<select id="histSeason"><option>2026</option><option>2025</option><option>2024</option></select></label>',
'<label>Target NFL week<select id="histWeek"></select></label>',
'</div><button id="histLoad" class="btn primary full">Load / refresh completed player games</button><p class="histdesc" id="histStatus">Choose a season and week. Results only include games completed BEFORE that week.</p>',
'<div class="metrics"><div class="metric"><small>Historical player games</small><strong id="histRows">—</strong></div><div class="metric"><small>Upcoming games</small><strong id="histGames">—</strong></div></div>',
'<p class="histdesc" id="histSource">Sources: NFLverse weekly player statistics and ESPN NFL schedule. Data freshness depends on source publication.</p></div>',
'<div class="card"><h2>2. Find winning historical trends</h2><div class="histfilters">',
'<label>Lookback<select id="histLookback"><option value="3">Last 3</option><option value="5" selected>Last 5</option><option value="8">Last 8</option><option value="18">Season to date</option></select></label>',
'<label>Window<select id="histWindow"><option value="games">Player appearances</option><option value="weeks">Calendar NFL weeks</option></select></label>',
'<label>Stat / market<select id="histStat"></select></label>',
'<label>Minimum games played<select id="histMin"><option value="2">2+</option><option value="3" selected>3+</option><option value="4">4+</option><option value="5">5+</option><option value="8">8+</option></select></label>',
'<label>Direction<select id="histSide"><option value="Over">Over</option><option value="Under">Under</option></select></label>',
'<label>Stat threshold (research only)<input id="histLine" type="number" min="0" step=".5" value="49.5"></label>',
'<label class="wide">Odds selection source<select id="histSourceMode"><option value="fanduel">Use real FanDuel lines (when feed connected)</option><option value="research">Research with threshold entered above — NOT FanDuel odds</option></select></label>',
'</div>',
'<label class="check" style="margin-top:12px"><input id="hist100" type="checkbox" checked><span><b>100% HISTORICAL HIT RATE ONLY</b> — include only players who hit in every eligible observed game</span></label>',
'<label class="check" style="margin-top:9px"><input id="histMatchup" type="checkbox" checked><span>Consider upcoming opponent defensive strength and player-team offense</span></label>',
'<label>Filter player (optional)<input id="histSearch" placeholder="Search player or team"></label>',
'<button id="histScan" class="btn primary full">Scan historical player props</button>',
'<p class="histdesc">For example: Last 5 appearances, minimum 5 games, 100% historical, receiving yards over the FanDuel line. A bye or missed game changes the sample count; you see exactly how many games qualified.</p>',
'</div></div>',
'<div class="stack"><div class="card"><div class="histrow"><h2>3. Prop candidates</h2><span class="histpill" id="histCount">0 found</span></div>',
'<p class="histdesc" id="histExplain">Load historical data, then scan. Defensive strength measures average yards or touchdowns allowed to the entire opponent offense, not a guaranteed individual player matchup.</p>',
'<div class="histrow"><button class="btn small" id="histLoad5">Load top 5 into Parlay Builder</button><button class="btn small" id="histSort">Sort: Historical → matchup</button></div>',
'<div id="histResults"><p class="histdesc">No scan completed yet.</p></div></div>',
'<div class="card"><h2>Method and safeguards</h2>',
'<p class="histdesc">We count actual player appearances shown in the historical feed and only weeks before the selected target. 100% historical means hits / recorded player games within the lookback; missing games are not silently wins. The estimate labeled <b>experimental rating</b> is a simple shrinkage/matchup heuristic, <b>not a calibrated true win probability</b>. Opponent defense is compared to league game averages for the same statistic. We do not price same-game correlated parlays by multiplying independent legs. Loading a candidate copies selections into the Builder; the combined FanDuel quote remains blank until verified.</p>',
'</div></div></div>'
].join('');
document.querySelector('main footer').before(pane);
for(var wi=1;wi<=18;wi++)get('histWeek').add(new Option('Week '+wi,wi));
Object.keys(mappings).forEach(function(k){get('histStat').add(new Option(mappings[k].name,k))});
function calcWeek(){var now=new Date(),sep=new Date(now.getFullYear(),8,10);return Math.max(1,Math.min(18,Math.floor((now-sep)/(7*86400000))+1))}
s.week=calcWeek();get('histWeek').value=s.week;get('histStat').value='receiving_yards';
function setMsg(x,error){var m=get('histStatus');m.textContent=x;m.style.color=error?'#ffaaaa':'#bbf2dc'}
function showTab(){
 ['builder','reader','history','feed','p2'].forEach(function(id){var e=get(id);if(e)e.hidden=true});
 pane.hidden=false;
 document.querySelectorAll('.tabs button').forEach(function(b){b.classList.toggle('active',b===tab)});
 window.scrollTo({top:0,behavior:'instant'});
 if(!s.loaded||!s.checkedAt||Date.now()-new Date(s.checkedAt).getTime()>6*60*60*1000)refresh();
}
tab.addEventListener('click',showTab);
document.querySelectorAll('.tabs button:not(#histTab)').forEach(function(b){b.addEventListener('click',function(){pane.hidden=true;tab.classList.remove('active')})});
async function loadURL(url){
 var resp=await fetch(url,{cache:'no-store'});
 if(!resp.ok){var j={};try{j=await resp.json()}catch(e){}throw Error(j.error||'Historical data request HTTP '+resp.status)}
 return resp.json();
}
async function refresh(){
 var yr=Number(get('histSeason').value),wk=Number(get('histWeek').value);
 var btn=get('histLoad');btn.disabled=true;setMsg('Loading completed NFL player games and the upcoming opponent schedule…');
 try{
 var vals=await Promise.all([loadURL('./api/nfl-history?type=players&season='+yr),loadURL('./api/nfl-history?type=schedule&season='+yr+'&week='+wk)]);
 if(!Array.isArray(vals[0].rows)||!Array.isArray(vals[1].events))throw Error('Historical response format not supported');
 s.rows=vals[0].rows.filter(function(r){return r.week<wk&&r.week>=1&&r.season_type==='REG'});
 s.games=vals[1].events.filter(function(g){return !g.completed});
 s.loaded=true;s.season=yr;s.week=wk;s.checkedAt=new Date().toISOString();s.source=vals[0].source;
 get('histRows').textContent=s.rows.length.toLocaleString();
 get('histGames').textContent=s.games.length;
 get('histSource').textContent='Player stats: '+vals[0].source+' • NFL schedule: '+vals[1].source+' • requested '+new Date(s.checkedAt).toLocaleString()+' • data feed may update after corrections.';
 setMsg('Loaded '+s.rows.length.toLocaleString()+' completed player-game records before Week '+wk+'. '+s.games.length+' upcoming games.');
 get('histResults').innerHTML='<p class="histdesc">Data loaded. Select the market, lookback, and historical filters, then click Scan.</p>';
 }catch(e){s.loaded=false;setMsg('Could not load NFL history: '+e.message+'. Try the standalone Vercel website or another season.',true);}
 finally{btn.disabled=false}
}
get('histLoad').onclick=refresh;
get('histSeason').onchange=function(){s.loaded=false;get('histRows').textContent='—'};
get('histWeek').onchange=function(){s.loaded=false;get('histRows').textContent='—'};
function gameForTeam(team){
 return s.games.find(function(g){return g.home===team||g.away===team});
}
function opponent(team,g){return g.home===team?g.away:g.home}
function marketStat(r,key){return stat(r,key)}
function opponentMeasure(key){
 if(key==='receptions')return 'receptions';
 if(key==='total_touchdowns')return 'total_touchdowns';
 if(key==='rush_rec_yards')return 'rush_rec_yards';
 return key;
}
function averageTeamAllowed(defense,key,lastWeeks){
 var groups={};
 s.rows.filter(function(r){return r.opponent_team===defense && r.week>=Math.max(1,s.week-lastWeeks)}).forEach(function(r){
  var k=String(r.week),p=groups[k]||(groups[k]=0);groups[k]=p+marketStat(r,key)
 });
 var values=Object.values(groups);if(!values.length)return null;
 return {avg:values.reduce(function(a,b){return a+b},0)/values.length,games:values.length};
}
function leagueAllowed(key,lastWeeks){
 var groups={};
 s.rows.filter(function(r){return r.week>=Math.max(1,s.week-lastWeeks)}).forEach(function(r){
  var k=r.week+':'+r.opponent_team;groups[k]=(groups[k]||0)+marketStat(r,key);
 });
 var values=Object.values(groups);return values.length?values.reduce(function(a,b){return a+b},0)/values.length:0;
}
function offenseMeasure(team,lastWeeks){
 var totals={},league={};
 s.rows.filter(function(r){return r.week>=Math.max(1,s.week-lastWeeks)}).forEach(function(r){
  var k=r.week+':'+r.team,v=n(r.passing_yards)+n(r.rushing_yards);
  totals[k]=(totals[k]||0)+v;league[k]=(league[k]||0)+v;
 });
 var chosen=Object.entries(totals).filter(function(v){return v[0].split(':')[1]===team}).map(function(v){return v[1]});
 var all=Object.values(league);
 if(!chosen.length||!all.length)return null;
 return {avg:chosen.reduce(function(a,b){return a+b},0)/chosen.length,league:all.reduce(function(a,b){return a+b},0)/all.length,samples:chosen.length};
}
function playerWeekRows(r){
 var win=Number(get('histLookback').value),t=get('histWindow').value;
 var candidates=r.slice().sort(function(a,b){return b.week-a.week});
 if(t==='weeks')candidates=candidates.filter(function(x){return x.week>=s.week-win});
 else if(win!==18)candidates=candidates.slice(0,win);
 return candidates;
}
function fromFeed(){
 var feed=window.OddsReaderFanDuel,loaded=feed&&typeof feed.getSelections==='function'?feed.getSelections():[];
 return loaded.filter(function(l){return Number.isFinite(Number(l.odds))});
}
function matchMarket(list,key){
 var keys=mappings[key].keys;
 return list.filter(function(l){return keys.includes(String(l.market||'').toLowerCase())})
}
function parseOffer(offer,key){
 var name=String(offer.name||'').toLowerCase();
 var val=Number(offer.point),side=(name.includes('under')?'Under':name.includes('over')?'Over':null);
 if(key==='total_touchdowns'){side='Over';val=0.5;}
 if(!side||!Number.isFinite(val))return null;
 var player=String(offer.description||'').trim();
 if(!player)return null;
 return {player:player,side:side,line:val,odds:Number(offer.odds),original:offer};
}
function evalHit(value,side,line){return side==='Over'?value>line:value<line}
function scan(){
 if(!s.loaded){setMsg('Load player stats and scheduled matchups first.',true);return}
 var key=get('histStat').value,src=get('histSourceMode').value,filter100=get('hist100').checked;
 var search=normalized(get('histSearch').value),line=Number(get('histLine').value),side=get('histSide').value;
 var minGames=Number(get('histMin').value),lookback=Number(get('histLookback').value);
 var quotes=fromFeed(),offered=matchMarket(quotes,key),group={};
 s.rows.forEach(function(r){
  var match=gameForTeam(r.team);if(!match)return;
  var id=String(r.player_id)+'|'+r.team;
  (group[id]||(group[id]=[])).push(r);
 });
 var offers=[];
 if(src==='fanduel'){
  offered.forEach(function(o){var parsed=parseOffer(o,key);if(parsed)offers.push(parsed)});
  if(!offers.length){
    get('histExplain').textContent='No real FanDuel prices for '+mappings[key].name+' have been loaded. First open FanDuel Odds Feed, connect a supported data API, choose a game and load this player market. Or switch to research threshold mode (which is NOT a sportsbook price).';
    get('histResults').innerHTML='<div class="histnotice">No actual FanDuel player market lines loaded. No lines have been invented.</div>';
    get('histCount').textContent='0 found';s.results=[];return;
  }
 }else if(!Number.isFinite(line)||line<0){
  get('histResults').textContent='Enter a valid research threshold.';return;
 }
 var seen=new Set(),out=[],defKey=opponentMeasure(key),league=leagueAllowed(defKey,lookback===18?18:Math.max(lookback,5));
 Object.entries(group).forEach(function(entry){
  var rows=playerWeekRows(entry[1]);if(rows.length<minGames)return;
  var latest=rows[0],player=String(latest.player_display_name||latest.player_name||'');
  if(!player)return;
  if(search&&!normalized(player+' '+latest.team).includes(search))return;
  var g=gameForTeam(latest.team),opp=opponent(latest.team,g);
  var matches=src==='fanduel'?offers.filter(function(o){
   return normalized(o.player)===normalized(player)&&!!o.original&&!!o.original.eventId
  }):[{player,side,line,odds:null,original:null}];
  if(src==='fanduel'){
    matches=matches.filter(function(o){
      var api=o.original;
      var relevant=api && (api.game===api.away+' @ '+api.home);
      if(!relevant)return false;
      var combinedNames=(String(g.home_name)+' '+String(g.away_name)).toLowerCase();
      return combinedNames.includes(String(api.home||'').toLowerCase())&&combinedNames.includes(String(api.away||'').toLowerCase());
    });
  }
  matches.forEach(function(m){
   var uniq=[player,latest.team,key,m.side,m.line].join('|');if(seen.has(uniq))return;seen.add(uniq);
   var results=rows.map(function(r){return {week:r.week,opponent:r.opponent_team,value:marketStat(r,key),hit:evalHit(marketStat(r,key),m.side,m.line)}});
   var hits=results.filter(function(r){return r.hit}).length,ratio=hits/results.length;
   if(filter100&&hits!==results.length)return;
   var def=averageTeamAllowed(opp,defKey,Math.max(5,Math.min(18,lookback)));
   var off=offenseMeasure(latest.team,Math.max(5,Math.min(18,lookback)));
   var defRatio=def&&league>0?def.avg/league:1,offRatio=off&&off.league>0?off.avg/off.league:1;
   var estimated=(hits+1)/(results.length+2);
   var factor=get('histMatchup').checked?1+0.12*Math.max(-0.45,Math.min(.45,defRatio-1))+0.06*Math.max(-.35,Math.min(.35,offRatio-1)):1;
   var rating=Math.max(.05,Math.min(.95,estimated*factor));
   out.push({id:uniq,player,team:latest.team,opponent:opp,game:g,key,market:mappings[key].name,side:m.side,line:m.line,odds:m.odds,hits,played:results.length,ratio,details:results,def,league,defRatio,off,offRatio,rating,source:src});
  });
 });
 out.sort(function(a,b){return b.ratio-a.ratio||b.rating-a.rating||b.played-a.played});
 s.results=out.slice(0,180);
 get('histCount').textContent=out.length+' matches';
 get('histExplain').textContent=out.length+' matching props based on actual completed games. '+(src==='fanduel'?'FanDuel individual market quotes sourced via your connected feed.':'Research-only thresholds; no FanDuel price has been verified.')+' A 100% historical record is not a forecast. Defensive/opponent numbers are entire-team game averages.';
 draw();
}
function draw(){
 var box=get('histResults');
 if(!s.results.length){box.innerHTML='<p class="histdesc">No qualifying candidates. Try a different line, market, minimum games, or turn off the 100% filter.</p>';return}
 box.innerHTML=s.results.slice(0,60).map(function(x,i){
  var d=x.def?x.def.avg.toFixed(1)+' allowed / game vs league '+x.league.toFixed(1):'not available';
  var recent=x.details.slice().reverse().map(function(z){return 'W'+z.week+': '+z.value+(z.hit?' ✔':' ✖')}).join(' • ');
  return '<article class="histline"><div class="histrow"><b>'+clean(x.player)+'</b><b class="'+(x.ratio===1?'histgood':'')+'">'+x.hits+'/'+x.played+' ('+(100*x.ratio).toFixed(0)+'%)</b></div>'+
  '<div class="histdesc">'+clean(x.team)+' vs '+clean(x.opponent)+' • '+clean(x.market)+' '+clean(x.side)+' '+x.line+' • '+(x.odds!=null?'FanDuel '+moneyOdds(x.odds):'NO FANDUEL ODDS VERIFIED')+'</div>'+
  '<div><span class="histpill">'+(x.ratio===1?'100% HISTORICAL':'Historical hit rate')+'</span><span class="histpill">Experimental rating '+pct(x.rating)+'</span></div>'+
  '<p class="histdesc">Opposing defense: '+clean(d)+' • '+(x.defRatio>1.07?'Allows more than league avg':x.defRatio<.93?'Allows less than league avg':'Near league avg')+'<br>Team offense: '+(x.off?x.off.avg.toFixed(0)+' yards/game vs league '+x.off.league.toFixed(0):'not available')+'<br>Games: '+clean(recent)+'</p>'+
  '<button class="btn small" data-hist-use="'+i+'">Load prop into Builder</button></article>';
 }).join('')+(s.results.length>60?'<p class="histdesc">Showing first 60 results, sorted highest historical hit rate and rating.</p>':'');
}
get('histScan').onclick=scan;
get('histSourceMode').onchange=function(){get('histLine').disabled=this.value==='fanduel';get('histSide').disabled=this.value==='fanduel'};
get('histSourceMode').dispatchEvent(new Event('change'));
var sortReverse=false;
get('histSort').onclick=function(){sortReverse=!sortReverse;s.results.sort(function(a,b){return sortReverse?b.rating-a.rating||b.ratio-a.ratio:b.ratio-a.ratio||b.rating-a.rating});get('histSort').textContent=sortReverse?'Sort: Experimental rating':'Sort: Historical → matchup';draw()};
function install(selected){
 if(!selected.length)return;
 if(!confirm('Replace your current unsaved parlay draft with '+selected.length+' selected historical candidates? Saved History remains unchanged.'))return;
 var current=document.querySelectorAll('#legs .leg').length;
 while(current>selected.length){var b=document.querySelector('#legs .leg:last-child [data-del]');if(!b)break;b.click();current=document.querySelectorAll('#legs .leg').length}
 while(current<selected.length){get('addLeg').click();current=document.querySelectorAll('#legs .leg').length}
 var set=function(el,value){if(!el)return;el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))};
 set(get('name'),'Historical trend research • '+s.season+' W'+s.week+' • '+selected.length+' legs');
 selected.forEach(function(x,i){
  var values={game:x.game.away+' @ '+x.game.home,market:x.market,pick:x.player+' — '+x.side+' '+x.line,prob:'',price:x.odds!=null?moneyOdds(x.odds):''};
  Object.keys(values).forEach(function(field){set(document.querySelector('#legs [data-i="'+i+'"][data-field="'+field+'"]'),values[field])});
 });
 selected.forEach(function(x,i){
  if(window.OddsReaderDraft&&typeof window.OddsReaderDraft.setResearch==='function')window.OddsReaderDraft.setResearch(i,{hits:x.hits,played:x.played,rating:(100*x.rating).toFixed(2)});
 });
 set(get('quote'),'');
 set(get('prob'),'');
 get('verified').checked=false;get('verified').dispatchEvent(new Event('change',{bubbles:true}));
 document.querySelector('.tabs [data-tab="builder"]').click();
 pane.hidden=true;
 get('estNote').textContent='Historical hit rates and experimental ratings are shown for research. No modeled win probabilities have been imported. Do not calculate EV without a validated probability model and a real FanDuel quote.';
 var t=get('toast');if(t){t.textContent='Historical candidates imported. Confirm real sportsbook lines and model assumptions.';t.style.display='block';setTimeout(function(){t.style.display='none'},4500)}
}
get('histResults').addEventListener('click',function(e){var b=e.target.closest('[data-hist-use]');if(b){install([s.results[Number(b.dataset.histUse)]])}});
get('histLoad5').onclick=function(){
 var chosen=[],games=new Set();
 s.results.forEach(function(x){if(chosen.length>=5)return;var id=x.game.id;if(games.has(id))return;chosen.push(x);games.add(id)});
 if(chosen.length<5){get('histExplain').textContent='Only '+chosen.length+' qualifying separate games available, not enough for five independent legs. Try fewer restrictions or another week.';return}
 install(chosen)
};
window.OddsReaderHistorical={version:'2.1',status:function(){return {loaded:s.loaded,season:s.season,week:s.week,playerGames:s.rows.length,upcoming:s.games.length,results:s.results.length}}};
})();