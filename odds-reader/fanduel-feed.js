/* FanDuel Odds Feed extension for Odds Reader Lab, October 2026.
   Uses The Odds API's publicly documented FanDuel bookmaker filter.
   Does not scrape the sportsbook or place bets.
*/
(function(){
'use strict';
var api='https://api.the-odds-api.com/v4/sports/americanfootball_nfl';
var key='',events=[],marketsByEvent={},list=[],generated=[],lastFetched=null,model={};
var DEVICE_KEY_STORAGE='odds_reader_key_device_v1',storedKey='';
function loadStoredKey(){try{return localStorage.getItem(DEVICE_KEY_STORAGE)||''}catch(e){return ''}}
function clearPriceCaches(){try{sessionStorage.removeItem(FEATURED_CACHE_KEY);for(var i=sessionStorage.length-1;i>=0;i--){var k=sessionStorage.key(i);if(k&&k.indexOf('oddsreader_fdp_v1_')===0)sessionStorage.removeItem(k)}}catch(e){}}
function keyStatus(){
 if(!$('fdKeyStatus'))return;
 var input=$('fdKey').value.trim();
 $('fdKeyStatus').textContent=storedKey&&input===storedKey?'API key remembered on this browser until you delete or replace it.':'No saved key currently matching this field.';
}
function saveDeviceKey(){
 var value=$('fdKey').value.trim();
 if(!/^[A-Za-z0-9_-]{16,128}$/.test(value)){stat('Enter a valid API key before saving.',true);return false}
 try{
  if(storedKey&&storedKey!==value)clearPriceCaches();
  localStorage.setItem(DEVICE_KEY_STORAGE,value);
  localStorage.setItem('odds_reader_key_changed_at',String(Date.now()));
  storedKey=value;key=value;keyStatus();window.dispatchEvent(new Event('oddsreader:local-change'));return true;
 }catch(e){stat('Browser storage is blocked. This may be a private window or site storage is disabled.',true);return false}
}
function deleteDeviceKey(){
 if(!confirm('Delete your Odds API key from this browser? Saved parlay history will not be removed.'))return;
 try{localStorage.removeItem(DEVICE_KEY_STORAGE);localStorage.setItem('odds_reader_key_changed_at',String(Date.now()))}catch(e){}
 clearPriceCaches();storedKey='';key='';$('fdKey').value='';
 events=[];list=[];generated=[];lastFetched=null;
 $('fdGames').textContent='API key deleted. Reconnect to load current games.';
 $('fdGame').innerHTML='<option value="">Load FanDuel odds first</option>';
 $('fdMarket').innerHTML='<option value="">Choose a game first</option>';
 $('fdOffers').textContent='No selections loaded.';
 $('fdQuota').textContent='';keyStatus();window.dispatchEvent(new Event('oddsreader:local-change'));stat('API key deleted from this browser. No API credits used.');
}

var FEATURED_CACHE_KEY='oddsreader_fanduel_featured_snapshot_1',CACHE_AGE_MS=10*60*1000;
function cachedFeatured(){try{var x=JSON.parse(sessionStorage.getItem(FEATURED_CACHE_KEY)||'null');return x&&Array.isArray(x.data)&&Number.isFinite(x.at)?x:null}catch(e){return null}}
function storeFeatured(data){try{sessionStorage.setItem(FEATURED_CACHE_KEY,JSON.stringify({data:data,at:Date.now(),credits:$('fdQuota')?$('fdQuota').textContent:''}))}catch(e){}}
function useFeatured(data,savedAt,cached){list=[];events=data.filter(function(g){return(g.bookmakers||[]).some(function(b){return b.key==='fanduel'})});events.forEach(function(g){addOffers(g,(g.bookmakers||[]).find(function(b){return b.key==='fanduel'}))});lastFetched=new Date(savedAt).toISOString();showGames();renderOffers();stat('FanDuel odds feed '+(cached?'loaded from browser cache (0 credits charged).':'connected.')+' '+events.length+' games • '+list.length+' individual selections • price snapshot '+new Date(savedAt).toLocaleString()+(cached?' (refresh for latest odds).':''));marketStat('Choose a game and market. Featured moneyline, spreads, totals are loaded.');}
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
'<p class="hint">This optional external service requires its own API key. You can <a target="_blank" rel="noopener noreferrer" href="https://the-odds-api.com/">register for a free key at The Odds API</a>. No FanDuel account or login is needed. The key is remembered in this browser on this device until you delete it, is not written into parlay history, and is sent via HTTPS through this app’s cloud gateway to the data provider. Requests use API credits.</p>'+
'<div class="fdkeyline"><label>Odds API key<input type="password" id="fdKey" autocomplete="off" placeholder="Paste your API key here"></label><button class="btn primary" id="fdLoad">Load FanDuel NFL odds</button></div>'+ 
'<div class="fdactions" style="margin:8px 0"><button class="btn small" id="fdSaveDeviceKey" type="button">Save API Key</button><button class="btn small" id="fdDeleteDeviceKey" type="button">Delete API Key</button></div>'+ 
'<p id="fdKeyStatus" class="fdsmall">Key not yet remembered.</p>'+ 
'<p class="fdsmall">Key is saved on this device in browser storage and can be deleted or replaced. Avoid saving on shared computers. Cross-device secure synchronization will require a separate authenticated cloud database.</p>'+ 
'<button class="btn small" id="fdForceRefresh" type="button" style="margin-top:8px">Refresh live prices (uses 3 credits)</button>'+ 
'<p class="fdsmall">Credit saver: recent game-line data is reused for 10 minutes on this browser. Fresh odds can move at any time. The API charges 3 credits for moneyline + spread + total on a live refresh; each individual prop-market request may use additional credits.</p>'+
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
 var response=await fetch('./api/odds-proxy',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({apiKey:key,path:path,params:params||{}})});
 usage(response);
 if(!response.ok){var detail='';try{var d=await response.json();detail=d.error||d.message||''}catch(e){}
 throw Error('Odds connection returned '+response.status+(detail?': '+detail:''));}
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
 var id=[entry.eventId,entry.market,entry.pick].join('|');
 var old=list.findIndex(function(l){return [l.eventId,l.market,l.pick].join('|')===id});
 if(old>=0)list[old]=entry;else list.push(entry);
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
async function load(force){
 key=$('fdKey').value.trim();
 if(key!==storedKey&&key)saveDeviceKey();
 var snapshot=cachedFeatured();
 if(!force&&snapshot&&Date.now()-snapshot.at<CACHE_AGE_MS){useFeatured(snapshot.data,snapshot.at,true);if(snapshot.credits)$('fdQuota').textContent='Previous reading: '+snapshot.credits+' • no credits spent now.';return}
 if(!key){stat('A The Odds API key is needed to retrieve fresh FanDuel prices. If a recent snapshot exists, it will load without spending credits.',true);return}
 var b=$('fdLoad');b.disabled=true;$('fdForceRefresh').disabled=true;stat('Requesting current FanDuel NFL game lines… (this costs approximately 3 credits)');
 try{
 var data=await request('/odds',{markets:'h2h,spreads,totals'});
 if(!Array.isArray(data))throw Error('Unexpected game odds format');
 storeFeatured(data);
 useFeatured(data,Date.now(),false);
 }catch(e){stat('Failed to retrieve FanDuel odds: '+e.message+(e instanceof TypeError?' (The browser could not reach the app’s cloud odds gateway. Check your network or security software.)':''),true);$('fdGames').textContent='No results loaded.'}
 finally{b.disabled=false;$('fdForceRefresh').disabled=false}
}
$('fdSaveDeviceKey').addEventListener('click',function(){if(saveDeviceKey())stat('API key saved on this device. No API credits spent.')});
$('fdDeleteDeviceKey').addEventListener('click',deleteDeviceKey);
$('fdKey').addEventListener('input',keyStatus);
storedKey=loadStoredKey();if(storedKey){key=storedKey;$('fdKey').value=storedKey}keyStatus();
$('fdLoad').addEventListener('click',function(){load(false)});
$('fdForceRefresh').addEventListener('click',function(){if(!$('fdKey').value.trim()){stat('Paste your API key before requesting new live prices.',true);return}if(confirm('Refresh all FanDuel game lines now? The provider will charge approximately 3 additional API credits.'))load(true)});
(function(){var saved=cachedFeatured();if(saved&&Date.now()-saved.at<CACHE_AGE_MS){useFeatured(saved.data,saved.at,true);if(saved.credits)$('fdQuota').textContent='Previous reading: '+saved.credits+' • no credits spent on reload.'}})();
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
function appendLeg(l){
 var existing=Array.from(document.querySelectorAll('#legs .leg'));
 if(existing.some(function(div){return div.querySelector('[data-field="pick"]')?.value.trim()===l.pick && div.querySelector('[data-field="game"]')?.value.trim()===l.game})){toast('Already in the parlay.');return;}
 var index=existing.findIndex(function(div){return !div.querySelector('[data-field="pick"]')?.value.trim()});
 if(index<0){
  if(existing.length>=15){toast('15-leg maximum.');return}
  $('addLeg').click();index=document.querySelectorAll('#legs .leg').length-1;
 }
 var updates={game:l.game,market:l.market,pick:l.pick,price:american(l.odds),prob:''};
 Object.keys(updates).forEach(function(field){
  var element=document.querySelector('#legs [data-i="'+index+'"][data-field="'+field+'"]');
  if(element){element.value=updates[field];clickEvent(element)}
 });
 var joint=$('prob');joint.value='';clickEvent(joint);
 var quote=$('quote');quote.value='';clickEvent(quote);
 var ck=$('verified');ck.checked=false;clickEvent(ck,'change');
 var builder=tabs.querySelector('[data-tab="builder"]');if(builder)builder.click();
 panel.hidden=true;
 toast('FanDuel prop added to your parlay. '+(index+1)+' leg position selected. Combined quote requires bet-slip verification.');
}

$('fdOffers').addEventListener('click',function(e){var b=e.target.closest('[data-fdadd]');if(!b)return;var leg=list[Number(b.dataset.fdadd)];if(!leg)return;appendLeg(leg)});
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
window.OddsReaderFanDuel={getSelections:function(){return list.map(function(l){return Object.assign({},l)})},getLastRefresh:function(){return lastFetched},reloadSavedKey:function(){var old=storedKey;storedKey=loadStoredKey();key=storedKey;$('fdKey').value=storedKey;if(old!==storedKey)clearPriceCaches();keyStatus()},addSelection:appendLeg,getGames:function(){return events.map(function(e){return {id:e.id,home:e.home_team,away:e.away_team,commence_time:e.commence_time}})},refreshDisplay:renderOffers,ingestEventOdds:function(data){var book=(data&&data.bookmakers||[]).find(function(b){return b.key==='fanduel'});if(!book)return {markets:[],count:0};var before=list.length;addOffers(data,book);renderOffers();return {markets:(book.markets||[]).map(function(m){return m.key}),count:list.length-before};}};
})();
