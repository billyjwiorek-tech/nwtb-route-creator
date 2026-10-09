/* FanDuel Odds Feed extension for Odds Reader Lab, October 2026.
   Uses The Odds API's publicly documented FanDuel bookmaker filter.
   Does not scrape the sportsbook or place bets.
*/
(function(){
'use strict';
var api='https://api.the-odds-api.com/v4/sports/americanfootball_nfl';
var key='',events=[],marketsByEvent={},list=[],generated=[],lastFetched=null,model={};
var $$=function(id){return document.getElementById(id)};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var percent=function(o){var n=Number(o);return n>0?100/(n+100):n<-99?100*-n/(-n+100):null};
var american=function(o){var n=Number(o);return isFinite(n)&&Math.abs(n)>=100?(n>0?'+':'')+Math.round(n):'—'};
var oddsDecimal=function(o){var n=Number(o);return n>0?1+n/100:n<=-100?1+100/(-n):null};
var toast=function(s){var t=$$('toast');if(t){t.textContent=s;t.style.display='block';setTimeout(function(){t.style.display='none'},3500)}};
var banner=document.createElement('style');
banner.textContent='#feed[hidden]{display:none!important}.fdcols{display:grid;grid-template-columns:1.1fr 1fr;gap:14px}.fdactions{display:flex;gap:8px;flex-wrap:wrap}.fdrow{background:#0d1e30;border:1px solid #36526c;border-radius:11px;padding:12px;margin:9px 0}.fdrow b{font-size:14px}.fdpill{font-size:11px;border-radius:40px;border:1px solid #51738b;padding:3px 8px;color:#b8dff7}.fdsmall{font-size:12px;color:#b5d0df;line-height:1.5}.fdwarn{color:#ffdda9}.fdnum{font-variant-numeric:tabular-nums}.fdbadge{color:#39dda6}.fdlegpick{background:#0f2638;border:1px solid #3b596f;border-radius:8px;padding:8px;margin-top:8px}.fdlegpick button{font-size:12px}.fdright{display:flex;justify-content:space-between;align-items:center;gap:9px}.fdkeyline{display:flex;gap:12px;align-items:flex-end}.fdkeyline label{flex:1}.fdkeyline button{min-width:160px}.fdscroll{max-height:570px;overflow-y:auto;padding-right:4px}@media(max-width:760px){.fdcols{grid-template-columns:1fr}.fdkeyline{display:block}.fdkeyline button{width:100%;margin:8px 0}}';
document.head.appendChild(banner);
var tabs=document.querySelector('.tabs');
if(!tabs)return;
var tab=document.createElement('button');tab.id='fdTab';tab.textContent='FanDuel Odds Feed';tabs.appendChild(tab);
var panel=document.createElement('section');panel.id='feed';panel.hidden=true;
panel.innerHTML=
'<h1>FanDuel odds feed <span class="fdbadge">Independent data source</span></h1>'+
'<p class="hint">Bring real FanDuel-listed NFL selections and individual American odds into the reader via The Odds API, an independent data provider. <b>No fake example lines. No automated FanDuel login or sportsbook scraping.</b></p>'+
'<div class="notice"><b>Coverage limits:</b> This shows FanDuel prices available to the connected data provider, which may omit some alternate lines or player props. The API does not provide the exact combined FanDuel same-game-parlay quote. Confirm that price from FanDuel’s public bet slip (screenshot or shared link) before comparing EV.</div>'+
'<div class="fdcols"><div class="card"><h2>1. Connect FanDuel market data</h2>'+
'<p class="hint">This optional external service requires its own API key. You can <a target="_blank" rel="noopener noreferrer" href="https://the-odds-api.com/">register for a free key at The Odds API</a>. No FanDuel account or login is needed. The key stays in this browser tab, is never saved in your parlay history, and is only sent to the provider via HTTPS. Requests use API credits.</p>'+
'<div class="fdkeyline"><label>Odds API key<input type="password" id="fdKey" autocomplete="off" placeholder="Paste your API key here"></label><button class="btn primary" id="fdLoad">Load FanDuel NFL odds</button></div>'+
'<p id="fdStatus" class="fdsmall" role="status">Not connected.</p>'+
'<div id="fdQuota" class="fdsmall"></div>'+
'<h3 style="margin-top:20px">Games available from FanDuel</h3><div id="fdGames" class="fdscroll">Connect the odds feed to see scheduled games.</div></div>'+
'<div class="card"><h2>2. Select markets and build bets</h2>'+
'<label>Selected NFL game<select id="fdGame"><option value="">Load FanDuel odds first</option></select></label>'+
'<div class="fdactions"><button class="btn" id="fdFeatured">Show game lines</button><button class="btn" id="fdMarketList">Find available player props & markets</button></div>'+
'<label>FanDuel markets found<select id="fdMarket"><option value="">Select a game first</option></select></label>'+
'<button class="btn" id="fdGetMarket">Load selected market odds</button>'+
'<p id="fdMarketStatus" class="fdsmall">Select a game and an available market.</p>'+
'<div id="fdOffers" class="fdscroll"></div></div></div>'+
'<div class="card" style="margin-top:14px"><h2>3. Parlay candidate generator (from real FanDuel selections)</h2>'+
'<div class="fdactions"><label>Legs<select id="fdCount"><option>2</option><option selected>3</option><option>4</option><option>5</option></select></label>'+
'<button class="btn" id="fdGenerate">Generate multigame combinations</button></div>'+
'<p class="hint">This generator only uses loaded FanDuel individual-leg prices. It chooses one leg per game and ranks by the product of quoted *implied* probabilities. <b>That is not an independent prediction, fair probability, EV, or actual parlay price.</b> SGPs require correlated probability models plus a genuine quoted bet slip.</p>'+
'<div id="fdCandidates"></div></div>'+
'<div class="card" style="margin-top:14px"><b>Source integrity</b><p class="hint">Only bookmaker key <b>fanduel</b> is accepted; every displayed price includes market type and update time. The feed contains provider-reported FanDuel odds, not independently verified direct FanDuel quotes. The standalone app remains separate from NFL Edge Lab and all NWTB data.</p></div>';
document.querySelector('main footer').before(panel);
function page(){
 ['builder','reader','history'].forEach(function(id){$$(id).hidden=true});
 var p2=$$('p2');if(p2)p2.hidden=true;
 panel.hidden=false;
 tabs.querySelectorAll('button').forEach(function(b){b.classList.toggle('active',b===tab)});
 window.scrollTo({top:0,behavior:'instant'});
}
tab.addEventListener('click',page);
tabs.querySelectorAll('button:not(#fdTab)').forEach(function(b){b.addEventListener('click',function(){panel.hidden=true;tab.classList.remove('active')})});
function stat(msg,bad){var e=$$('fdStatus');e.textContent=msg;e.style.color=bad?'#ffadad':'#b1efda'}
function marketStat(msg,bad){var e=$$('fdMarketStatus');e.textContent=msg;e.style.color=bad?'#ffadad':'#b1efda'}
function usage(response){
 var left=response.headers.get('x-requests-remaining'),last=response.headers.get('x-requests-last');
 if(left!==null||last!==null){$$('fdQuota').textContent='Provider credits remaining: '+(left||'?')+' • Cost of last request: '+(last||'?')+'.'} }
async function request(path,params){
 if(!key)throw Error('First enter a The Odds API key.');
 var search=new URLSearchParams(Object.assign({apiKey:key,bookmakers:'fanduel',oddsFormat:'american'},params||{}));
 var response=await fetch(api+path+'?'+search,{method:'GET',cache:'no-store',mode:'cors'});
 usage(response);
 if(!response.ok){var detail='';try{var d=await response.json();detail=d.message||d.error||''}catch(e){}
 throw Error('Provider returned '+response.status+(detail?': '+detail:''));}
 return await response.json();
}
function addOffers(event,book){
 if(!event||!book||book.key!=='fanduel')return;
 var markets=Array.isArray(book.markets)?book.markets:[];
 markets.forEach(function(m){
 (m.outcomes||[]).forEach(function(o){
 var n=Number(o.price);
 if(!isFinite(n)||Math.abs(n)<100||!o.name)return;
 var game=String(event.away_team)+' @ '+String(event.home_team);
 var pick=o.description?o.description+' — '+o.name:o.name;
 if(o.point!==undefined&&o.point!==null)pick+=' '+(Number(o.point)>0&&m.key==='spreads'?'+':'')+o.point;
 var entry={eventId:event.id,game:game,market:m.key,pick:pick,odds:n,updated:m.last_update||book.last_update||'',home:event.home_team,away:event.away_team,point:o.point??null,description:o.description||'',name:o.name||''};
 var id=[entry.eventId,entry.market,entry.pick,entry.odds].join('|');
 if(!list.some(function(l){return [l.eventId,l.market,l.pick,l.odds].join('|')===id}))list.push(entry);
 });
 });
}
function showGames(){
 var box=$$('fdGames');
 box.innerHTML=events.length?events.map(function(g){
 var fd=(g.bookmakers||[]).find(function(b){return b.key==='fanduel'});
 return '<div class="fdrow"><div class="fdright"><b>'+esc(g.away_team)+' @ '+esc(g.home_team)+'</b><button class="btn small" data-fdgame="'+esc(g.id)+'">View</button></div><div class="fdsmall">'+esc(new Date(g.commence_time).toLocaleString())+' • '+(fd?(fd.markets||[]).length+' main markets':'No FanDuel lines returned')+'</div></div>';
 }).join(''):'<p class="fdwarn">No current NFL events with FanDuel odds were returned. Try later.</p>';
 var s=$$('fdGame');s.innerHTML=events.map(function(g){return '<option value="'+esc(g.id)+'">'+esc(g.away_team)+' @ '+esc(g.home_team)+'</option>'}).join('')||'<option>No events</option>';
}
async function load(){
 key=$$('fdKey').value.trim();
 if(!key){stat('A The Odds API key is needed to access this provider’s FanDuel feed.',true);return}
 var b=$$('fdLoad');b.disabled=true;stat('Requesting current FanDuel NFL game lines…');
 try{
 var data=await request('/odds',{markets:'h2h,spreads,totals'});
 if(!Array.isArray(data))throw Error('Unexpected game odds format');
 list=[];events=data.filter(function(g){return (g.bookmakers||[]).some(function(b){return b.key==='fanduel'})});
 events.forEach(function(g){addOffers(g,(g.bookmakers||[]).find(function(b){return b.key==='fanduel'}))});
 lastFetched=new Date().toISOString();
 showGames();renderOffers();
 stat('FanDuel odds feed connected. '+events.length+' games • '+list.length+' individual selections • refreshed '+new Date(lastFetched).toLocaleString());
 marketStat('Select a game and market. Featured moneyline, spreads, totals are already loaded.');
 }catch(e){stat('Failed to retrieve FanDuel odds: '+e.message,true);$$('fdGames').textContent='No results loaded.'}
 finally{b.disabled=false}
}
$$('fdLoad').addEventListener('click',load);
$$('fdGames').addEventListener('click',function(e){var button=e.target.closest('[data-fdgame]');if(!button)return;$$('fdGame').value=button.dataset.fdgame;renderOffers();$$('fdGame').scrollIntoView({behavior:'smooth',block:'center'})});
$$('fdGame').addEventListener('change',function(){renderOffers();$$('fdMarket').innerHTML='<option value="">Click Find available markets</option>'});
function renderOffers(){
 var eventId=$$('fdGame').value;
 var offers=list.filter(function(l){return l.eventId===eventId});
 var s=$$('fdOffers');
 s.innerHTML=offers.length?offers.map(function(l){
 var idx=list.indexOf(l);
 return '<div class="fdrow"><div class="fdright"><b>'+esc(l.pick)+'</b><b class="fdnum fdbadge">'+american(l.odds)+'</b></div><p class="fdsmall">'+esc(l.market)+' • Updated '+esc(l.updated?new Date(l.updated).toLocaleString():'unknown')+'</p><button class="btn small" data-fdadd="'+idx+'">+ Add to my parlay</button></div>';
 }).join(''):'<p class="fdsmall">No odds fetched for this event/market. Select Find available markets, then load a market.</p>';
}
$$('fdFeatured').onclick=renderOffers;
async function marketList(){
 var id=$$('fdGame').value;if(!id)return marketStat('Choose a game first.',true);
 var btn=$$('fdMarketList');btn.disabled=true;marketStat('Querying markets published for FanDuel…');
 try{
 var data=await request('/events/'+encodeURIComponent(id)+'/markets',{});
 var book=(data.bookmakers||[]).find(function(b){return b.key==='fanduel'});
 var markets=book?.markets||[];
 marketsByEvent[id]=markets.map(function(m){return m.key}).filter(Boolean);
 $$('fdMarket').innerHTML=markets.length?markets.map(function(m){return '<option value="'+esc(m.key)+'">'+esc(m.key.replace(/_/g,' '))+'</option>'}).join(''):'<option value="">No available markets</option>';
 marketStat(markets.length+' distinct FanDuel markets found. Select one to fetch its individual prices. More markets may appear nearer kickoff.');
 }catch(e){marketStat('Could not fetch market list: '+e.message,true)}
 finally{btn.disabled=false}
}
$$('fdMarketList').onclick=marketList;
async function getMarket(){
 var id=$$('fdGame').value,market=$$('fdMarket').value;
 if(!id||!market)return marketStat('Select a game and market first.',true);
 var btn=$$('fdGetMarket');btn.disabled=true;marketStat('Fetching '+market+' FanDuel outcomes…');
 try{
 var response=await request('/events/'+encodeURIComponent(id)+'/odds',{markets:market});
 var book=(response.bookmakers||[]).find(function(b){return b.key==='fanduel'});
 if(!book){marketStat('Provider has no current FanDuel quote for this market.',true);return}
 var before=list.length;addOffers(response,book);
 marketStat('Loaded '+(list.length-before)+' additional selections. Missing items are not invented.');renderOffers()
 }catch(e){marketStat('Unable to load market: '+e.message,true)}
 finally{btn.disabled=false}
}
$$('fdGetMarket').onclick=getMarket;
function clickEvent(el,type){el.dispatchEvent(new Event(type||'input',{bubbles:true}))}
function installLegs(legs,name){
 if(!legs.length)return;
 if(!confirm('Replace the current unsaved parlay draft with these FanDuel selections? Saved history will remain unchanged.'))return;
 var current=document.querySelectorAll('#legs .leg').length;
 while(current>legs.length){var remove=document.querySelector('#legs .leg:last-child [data-del]');if(!remove)break;remove.click();current=document.querySelectorAll('#legs .leg').length}
 while(current<legs.length){$$('addLeg').click();current=document.querySelectorAll('#legs .leg').length}
 var n=$$('name');n.value=name;clickEvent(n);
 legs.forEach(function(leg,i){
 var data={game:leg.game,market:leg.market,pick:leg.pick,prob:'',price:american(leg.odds)};
 Object.keys(data).forEach(function(field){var input=document.querySelector('#legs [data-i="'+i+'"][data-field="'+field+'"]');if(input){input.value=data[field];clickEvent(input)}});
 });
 var joint=$$('prob');joint.value='';clickEvent(joint);
 var quote=$$('quote');quote.value='';clickEvent(quote);
 var verified=$$('verified');verified.checked=false;clickEvent(verified,'change');
 var builder=tabs.querySelector('[data-tab="builder"]');if(builder)builder.click();
 panel.hidden=true;
 toast('FanDuel individual leg odds imported. Add independently modeled JOINT probability and actual combined bet-slip quote.');
}
$$('fdOffers').addEventListener('click',function(e){var b=e.target.closest('[data-fdadd]');if(!b)return;var leg=list[Number(b.dataset.fdadd)];if(!leg)return;installLegs([leg],'FanDuel selection · '+leg.game)});
$$('fdGenerate').onclick=function(){
 var n=Number($$('fdCount').value);
 var buckets={};list.forEach(function(l){if(!buckets[l.eventId])buckets[l.eventId]=[];buckets[l.eventId].push(l)});
 var games=Object.keys(buckets);
 if(games.length<n){$$('fdCandidates').textContent='Need '+n+' different games with current FanDuel markets. Only '+games.length+' available.';return}
 var uniq=[];
 games.forEach(function(id){var l=buckets[id].filter(function(x){return x.market==='h2h'||x.market==='spreads'||x.market==='totals'});l.sort(function(a,b){return percent(b.odds)-percent(a.odds)});
 if(l.length)uniq.push({id:id,legs:l.slice(0,2)})});
 if(uniq.length<n){$$('fdCandidates').textContent='Not enough eligible market lines were returned.';return}
 var combinations=[];
 function walk(start,picked){
 if(combinations.length>8000)return;
 if(picked.length===n){combinations.push({legs:picked.slice(),proxy:picked.reduce(function(v,l){return v*(percent(l.odds)/100)},1)});return}
 for(var i=start;i<uniq.length;i++){for(var j=0;j<uniq[i].legs.length;j++){picked.push(uniq[i].legs[j]);walk(i+1,picked);picked.pop()}}}
 walk(0,[]);combinations.sort(function(a,b){return b.proxy-a.proxy});
 generated=combinations.slice(0,10);
 $$('fdCandidates').innerHTML=generated.map(function(c,i){
 return '<div class="fdrow"><div class="fdright"><b>Candidate '+(i+1)+'</b><b class="fdwarn">Bookmaker implied proxy '+(100*c.proxy).toFixed(2)+'%</b></div>'+
 c.legs.map(function(l){return '<div class="fdlegpick">'+esc(l.pick)+' <b>'+american(l.odds)+'</b><div class="fdsmall">'+esc(l.game)+'</div></div>'}).join('')+
 '<p class="fdsmall">Not a model forecast, true win probability, expected value, or FanDuel combined quote. Verify actual slip.</p>'+
 '<button class="btn small" data-fd-candidate="'+i+'">Use selections</button></div>';
 }).join('')||'<p>None available.</p>';
};
$$('fdCandidates').addEventListener('click',function(e){var b=e.target.closest('[data-fd-candidate]');if(!b)return;var c=generated[Number(b.dataset.fdCandidate)];if(c)installLegs(c.legs,'FanDuel feed candidate • '+c.legs.length+' legs')});
window.OddsReaderFanDuel={getSelections:function(){return list.map(function(l){return Object.assign({},l)})},getLastRefresh:function(){return lastFetched}};
})();
