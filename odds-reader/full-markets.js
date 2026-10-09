/* Odds Reader Lab — documented NFL FanDuel player and alternate markets. */
(function(){
'use strict';
var fd=window.OddsReaderFanDuel;
if(!fd||!document.getElementById('feed'))return;
var $=function(id){return document.getElementById(id)};
var esc=function(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var groups=[
{key:'TD',title:'Touchdown scorers',markets:'player_anytime_td,player_1st_td,player_last_td,player_tds_over,player_tds,player_reception_tds,player_rush_tds,player_pass_tds'},
{key:'PASS',title:'Passing props',markets:'player_pass_yds,player_pass_attempts,player_pass_completions,player_pass_interceptions,player_pass_longest_completion,player_pass_rush_yds'},
{key:'RUSH',title:'Rushing props',markets:'player_rush_yds,player_rush_attempts,player_rush_longest,player_rush_tds'},
{key:'REC',title:'Receiving props',markets:'player_reception_yds,player_receptions,player_reception_longest,player_reception_tds'},
{key:'ALT',title:'Alternate lines',markets:'player_pass_yds_alternate,player_pass_tds_alternate,player_pass_attempts_alternate,player_pass_completions_alternate,player_pass_interceptions_alternate,player_rush_yds_alternate,player_rush_attempts_alternate,player_reception_yds_alternate,player_receptions_alternate,player_rush_tds_alternate,player_reception_tds_alternate,player_rush_reception_yds_alternate,player_pass_rush_yds_alternate'},
{key:'COMBO',title:'Combined & other props',markets:'player_rush_reception_yds,player_rush_reception_tds,player_pass_rush_reception_yds,player_pass_rush_reception_tds,player_pass_longest_completion_alternate,player_reception_longest_alternate,player_rush_longest_alternate,player_rush_reception_tds_alternate,player_pass_rush_reception_yds_alternate'}
];
var selected=['TD','PASS','RUSH','REC'],cachePrefix='oddsreader_fdp_v1_',ttl=10*60*1000,loading=false,offers=[],snapshots={};
var css=document.createElement('style');
css.textContent='.fdp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.fdp-grid label{display:flex;align-items:center;gap:9px;border:1px solid #3e5b73;border-radius:10px;padding:10px;font-weight:700;cursor:pointer}.fdp-grid label input{width:19px;height:19px;margin:0;accent-color:#1fc399}.fdp-line{border:1px solid #35526d;background:#0b2034;padding:12px;border-radius:10px;margin:9px 0}.fdp-money{font-weight:850;color:#39e0aa;font-size:18px}.fdp-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.fdp-row{display:flex;gap:10px;flex-wrap:wrap}.fdp-row label{flex:1 1 160px}.fdp-alert{background:#3a2b1c;color:#ffe0a1;padding:13px;border-radius:10px;border:1px solid #826343;font-size:13px;line-height:1.5}.fdp-results{max-height:590px;overflow:auto}.fdp-muted{color:#a9c9df;font-size:12px}@media(max-width:700px){.fdp-grid{grid-template-columns:1fr}}';
document.head.appendChild(css);
var pane=document.createElement('div');pane.className='card';pane.id='fdpExplorer';pane.style.marginTop='18px';
pane.innerHTML='<h2>Full FanDuel NFL Player Props & Alternate Lines</h2>'+
'<div class="fdp-alert"><b>Protect your free credits:</b> Markets are charged separately per game. This tool requests one selected game only. Loading every market across all 26 games could exhaust your allowance. Every new request requires your approval. Actual prices and market availability come only from the provider.</div>'+
'<div class="fdp-row"><label>Selected matchup<select id="fdpGame"></select></label><label>Search player<input id="fdpSearch" placeholder="Player name or market"></label></div>'+
'<h3>Market categories</h3><div class="fdp-grid" id="fdpGroups"></div>'+
'<div class="fdp-row" style="margin:12px 0"><button class="btn small" id="fdpSelectAll">Select all markets</button><button class="btn small" id="fdpCore">Core props</button><button class="btn small" id="fdpClear">Clear</button></div>'+
'<p id="fdpCost" class="fdp-muted"></p>'+
'<div class="fdp-row"><button class="btn primary" id="fdpLoad">Load selected markets for ONE game</button><button class="btn" id="fdpFresh">Refresh from provider (uses credits)</button></div>'+
'<p id="fdpStatus" class="fdp-muted">Choose a game and categories, then load FanDuel prop markets.</p>'+
'<div id="fdpQuota" class="fdp-muted"></div>'+
'<h3>Live market results</h3><div class="fdp-row"><label>Category<select id="fdpFilter"><option value="">All market types</option></select></label><label>Sort<select id="fdpSort"><option value="player">By player</option><option value="market">By market</option><option value="odds">By odds</option></select></label></div>'+
'<p class="fdp-muted" id="fdpMissing"></p><div class="fdp-results" id="fdpResults">No markets loaded yet.</div>';
$('feed').appendChild(pane);
function chosen(){return [...new Set(groups.filter(function(g){return selected.indexOf(g.key)>=0}).flatMap(function(g){return g.markets.split(',')}))]}
function status(message,bad){$('fdpStatus').textContent=message;$('fdpStatus').style.color=bad?'#ffaaaa':'#a9edce'}
function updateCost(){$('fdpCost').textContent=chosen().length+' markets selected • up to '+chosen().length+' API credits for ONE game; actual cost depends on markets returned. No request is automatic.'}
function paint(){
 $('fdpGroups').innerHTML=groups.map(function(g){return '<label><input type="checkbox" data-group="'+g.key+'" '+(selected.indexOf(g.key)>=0?'checked':'')+'><span>'+esc(g.title)+'<div class="fdp-muted">'+g.markets.split(',').length+' markets</div></span></label>'}).join('');
 updateCost();
}
paint();
$('fdpGroups').onchange=function(e){var k=e.target.dataset.group;if(!k)return;selected=selected.filter(function(x){return x!==k});if(e.target.checked)selected.push(k);updateCost()};
$('fdpSelectAll').onclick=function(){selected=groups.map(function(g){return g.key});paint()};
$('fdpCore').onclick=function(){selected=['TD','PASS','RUSH','REC'];paint()};
$('fdpClear').onclick=function(){selected=[];paint()};
function refreshGames(){
 var games=fd.getGames(),old=$('fdpGame').value;
 $('fdpGame').innerHTML=games.length?games.map(function(g){return '<option value="'+esc(g.id)+'">'+esc(g.away)+' @ '+esc(g.home)+' — '+esc(new Date(g.commence_time).toLocaleDateString())+'</option>'}).join(''):'<option value="">Load main NFL odds above first</option>';
 if(games.some(function(g){return g.id===old}))$('fdpGame').value=old;
 else if(games.some(function(g){return g.id===$('fdGame').value}))$('fdpGame').value=$('fdGame').value;
}
$('fdTab').addEventListener('click',function(){refreshGames();draw()});
$('fdpGame').onchange=function(){$('fdGame').value=this.value;fd.refreshDisplay();draw()};
function cache(id,keys){
 try{var obj=JSON.parse(sessionStorage.getItem(cachePrefix+id+'_'+keys.join(','))||'null');return obj&&Date.now()-obj.at<ttl?obj:null}catch(e){return null}
}
function save(id,keys,data){try{sessionStorage.setItem(cachePrefix+id+'_'+keys.join(','),JSON.stringify({data:data,at:Date.now()}))}catch(e){}}
function category(l){var group=groups.find(function(g){return g.markets.split(',').indexOf(l.market)>=0});return group?group.title:'Other player markets'}
function draw(){
 var id=$('fdpGame').value,prev=$('fdpFilter').value;
 var all=fd.getSelections().filter(function(l){return l.eventId===id&&l.market.indexOf('player_')===0});
 var available=[...new Set(all.map(category))].sort();
 $('fdpFilter').innerHTML='<option value="">All market types</option>'+available.map(function(v){return '<option value="'+esc(v)+'">'+esc(v)+'</option>'}).join('');
 if(available.includes(prev))$('fdpFilter').value=prev;
 var typed=$('fdpSearch').value.trim().toLowerCase(),filter=$('fdpFilter').value;
 all=all.filter(function(l){return(!typed||(l.pick+' '+l.market).toLowerCase().includes(typed))&&(!filter||category(l)===filter)});
 var order=$('fdpSort').value;
 all.sort(function(a,b){return order==='odds'?a.odds-b.odds:order==='market'?(a.market+a.pick).localeCompare(b.market+b.pick):(a.description+a.pick).localeCompare(b.description+b.pick)});
 offers=all;
 var shot=snapshots[id];
 $('fdpMissing').textContent=all.length+' selections shown'+(shot?' • '+shot.found+' market types returned, '+shot.notFound+' requested markets missing • retrieved '+new Date(shot.at).toLocaleString():'');
 $('fdpResults').innerHTML=all.length?all.slice(0,350).map(function(l,i){
 var odds=(Number(l.odds)>0?'+':'')+l.odds;
 return '<div class="fdp-line"><div class="fdp-head"><strong>'+esc(l.pick)+'</strong><span class="fdp-money">'+esc(odds)+'</span></div><div class="fdp-muted">'+esc(l.market)+' • FanDuel via Odds API • '+esc(l.updated?new Date(l.updated).toLocaleString():'date unknown')+'</div><button class="btn small" data-add="'+i+'">+ Add to parlay</button></div>'
 }).join('')+(all.length>350?'<div class="fdp-muted">Showing 350 of '+all.length+'. Use filters to find the rest.</div>':''):'<p class="fdp-muted">No FanDuel prices loaded for this market or player. Unavailable prices will not be invented.</p>';
}
$('fdpResults').addEventListener('click',function(e){var b=e.target.closest('[data-add]');if(b&&offers[Number(b.dataset.add)])fd.addSelection(offers[Number(b.dataset.add)])});
$('fdpFilter').onchange=draw;$('fdpSort').onchange=draw;$('fdpSearch').oninput=draw;
async function load(force){
 if(loading)return;
 refreshGames();
 var id=$('fdpGame').value,keys=chosen(),game=fd.getGames().find(function(g){return g.id===id});
 if(!game)return status('Load FanDuel NFL games above first.',true);
 if(!keys.length)return status('Choose at least one category.',true);
 if(keys.length>48)return status('Too many market keys. Choose fewer categories.',true);
 var existing=force?null:cache(id,keys);
 if(existing){
  var result=fd.ingestEventOdds(existing.data);
  snapshots[id]={at:existing.at,found:result.markets.length,notFound:keys.filter(function(k){return result.markets.indexOf(k)<0}).length};
  status('Loaded browser cached snapshot • 0 additional API credits • quoted prices may have changed.');
  draw();return;
 }
 if(!$('fdKey').value.trim())return status('Paste your provider API key above before making a new request.',true);
 if(!confirm('Load '+keys.length+' selected markets for '+game.away+' @ '+game.home+'?\n\nMaximum estimated cost: '+keys.length+' additional API credits for this ONE game. Actual charge is based on returned markets.\n\nContinue?'))return;
 loading=true;$('fdpLoad').disabled=true;$('fdpFresh').disabled=true;
 status('Retrieving provider-reported FanDuel player props and alternate lines…');
 try{
  var resp=await fetch('./api/odds-proxy',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:$('fdKey').value.trim(),path:'/events/'+id+'/odds',params:{markets:keys.join(',')}})});
  var remaining=resp.headers.get('x-requests-remaining'),cost=resp.headers.get('x-requests-last');
  if(remaining!==null||cost!==null)$('fdpQuota').textContent='API credits remaining: '+(remaining||'unknown')+' • Last request cost: '+(cost||'unknown');
  var data=await resp.json();
  if(!resp.ok)throw Error(data.error||'Provider request failed ('+resp.status+')');
  var result=fd.ingestEventOdds(data);
  save(id,keys,data);
  snapshots[id]={at:Date.now(),found:result.markets.length,notFound:keys.filter(function(k){return result.markets.indexOf(k)<0}).length};
  status('Retrieved '+result.markets.length+' available market types; '+snapshots[id].notFound+' requested types are not currently offered. Prices appear below.');
  draw();
 }catch(e){status('Cannot retrieve these markets: '+(e.message||e)+'. Try a smaller category or another game.',true)}
 finally{loading=false;$('fdpLoad').disabled=false;$('fdpFresh').disabled=false}
}
$('fdpLoad').onclick=function(){load(false)};
$('fdpFresh').onclick=function(){load(true)};
refreshGames();draw();
window.OddsReaderFullMarkets={categories:groups.length,marketKeys:chosen};
})();