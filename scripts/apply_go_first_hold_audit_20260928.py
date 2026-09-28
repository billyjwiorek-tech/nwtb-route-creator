from pathlib import Path
import re

# This patch makes the 2026-09-28 deep audit authoritative in the browser.
# Category total remains 66 GO FIRST. Route-approved rises from 53 to 55;
# commercial-location holds fall from 13 to 11.

# --- chat.js: corrected commercial stops + cloud-authoritative route approval ---
p=Path('chat.js')
s=p.read_text(encoding='utf-8')

repls={
"'27727':{address:'10S530 Thames Dr, Downers Grove, IL 60516',note:'UZB current residential registration'}":
"'27727':{address:'15850 New Ave, Lemont, IL 60439',lat:41.6727040623,lon:-88.0066242944,note:'UZB TRANS verified commercial office — final audit 2026-09-28'}",
"'18153':{address:'2451 Sharon Ct, Naperville, IL 60565',note:'AFF TRANS current residential registration'}":
"'18153':{address:'1391 Roberts Rd Suite B, Morris, IL 60450',lat:41.385181,lon:-88.402842,note:'AFF TRANS verified commercial operating office — final audit 2026-09-28'}",
}
for old,new in repls.items():
    if old not in s: raise SystemExit(f'chat.js expected override not found: {old}')
    s=s.replace(old,new,1)

old="""    '11179','11935','24881','15474','11395','15096','12389','26423','11218','21986','11060'
  ]);"""
new="""    '11179','11935','24881','15474','11395','15096','12389','26423','11218','21986','11060','18153','27727'
  ]);"""
if old not in s: raise SystemExit('commercial GO FIRST set anchor not found')
s=s.replace(old,new,1)

old="""    '27727','11771','23016','18153','11252','26145','17219','16106','25606','12635','25909','25817','10803','28280'
  ]);"""
new="""    '11771','23016','11252','26145','17219','16106','25606','12635','25909','25817','10803','28280'
  ]);"""
if old not in s: raise SystemExit('residential GO FIRST set anchor not found')
s=s.replace(old,new,1)

# Cloud audit wins before legacy static lists. This makes future audited approvals durable.
old="""  function locationStatus(a){
    if(a?.broadType==='PROSPECT'){
      const addr=auditNorm(a?.address);"""
new="""  function locationStatus(a){
    if(a?.finalGoFirstMember===true&&a?.finalGoFirstRouteApproved===true)return 'COMMERCIAL_ROUTE_OK';
    if(a?.broadType==='PROSPECT'){
      const addr=auditNorm(a?.address);"""
if old not in s: raise SystemExit('locationStatus anchor not found')
s=s.replace(old,new,1)

old_notice="""  function updateAuditNotice(){
    try{const n=$('safetyNotice');if(n)n.innerHTML='<b>FINAL SALES DATABASE:</b> GO FIRST 66 • Verified Prospects 7 • Win-Back 232 • Active 135 • Total 440. <b>GO FIRST ROUTING:</b> 53 commercial stops approved • 13 valid GO FIRST accounts held until a commercial route stop is verified. Category membership and route-ready count are intentionally different.';}catch{}
  }"""
new_notice="""  function updateAuditNotice(){
    try{
      const n=$('safetyNotice');if(!n)return;
      const finalAccounts=accounts.filter(a=>a.finalIncluded!==false);
      const go=finalAccounts.filter(a=>a.layer==='GO FIRST');
      const approved=go.filter(a=>a.finalGoFirstRouteApproved===true).length;
      const hold=go.length-approved;
      n.innerHTML=`<b>FINAL SALES DATABASE:</b> GO FIRST ${go.length} • Verified Prospects ${finalAccounts.filter(a=>a.layer==='VERIFIED PROSPECTS').length} • Win-Back ${finalAccounts.filter(a=>a.layer==='WIN-BACK CUSTOMERS').length} • Active ${finalAccounts.filter(a=>a.layer==='ACTIVE CUSTOMERS').length} • Total ${finalAccounts.length}. <b>GO FIRST ROUTING:</b> ${approved} commercial stops approved • ${hold} valid GO FIRST accounts held until a commercial route stop is verified. Category membership and route-ready count are intentionally different.`;
    }catch{}
  }"""
if old_notice not in s: raise SystemExit('chat updateAuditNotice anchor not found')
s=s.replace(old_notice,new_notice,1)
p.write_text(s,encoding='utf-8')

# --- index.html/app.html: dynamic safety notice, not stale 53/13 ---
old_html="""safetyNotice.innerHTML='<b>FINAL SALES DATABASE:</b> GO FIRST 66 • Verified Prospects 7 • Win-Back 232 • Active 135 • Total 440. <b>GO FIRST ROUTING:</b> 53 commercial stops approved • 13 valid GO FIRST accounts held until a commercial route stop is verified. Category membership and route-ready count are intentionally different.'"""
new_html="""safetyNotice.innerHTML=`<b>FINAL SALES DATABASE:</b> GO FIRST ${go.length} • Verified Prospects ${finalAccounts.filter(a=>a.layer==='VERIFIED PROSPECTS').length} • Win-Back ${finalAccounts.filter(a=>a.layer==='WIN-BACK CUSTOMERS').length} • Active ${finalAccounts.filter(a=>a.layer==='ACTIVE CUSTOMERS').length} • Total ${finalAccounts.length}. <b>GO FIRST ROUTING:</b> ${goRoute} commercial stops approved • ${goHold} valid GO FIRST accounts held until a commercial route stop is verified. Category membership and route-ready count are intentionally different.`"""
for name in ('index.html','app.html'):
    p=Path(name); s=p.read_text(encoding='utf-8')
    if old_html not in s: raise SystemExit(f'{name} stale safety notice not found')
    s=s.replace(old_html,new_html,1)
    p.write_text(s,encoding='utf-8')

# --- navigation.js: dynamic safety notice ---
p=Path('navigation.js'); s=p.read_text(encoding='utf-8')
pattern=r"  function setFinalSafetyNotice\(\)\{\n    try\{\n      const n=\$\('safetyNotice'\);\n      if\(n\)n\.innerHTML='.*?';\n    \}catch\{\}\n  \}"
new_nav="""  function setFinalSafetyNotice(){
    try{
      const n=$('safetyNotice');if(!n)return;
      const finalAccounts=accounts.filter(a=>a.finalIncluded!==false);
      const go=finalAccounts.filter(a=>a.layer==='GO FIRST');
      const approved=go.filter(a=>a.finalGoFirstRouteApproved===true).length;
      const hold=go.length-approved;
      n.innerHTML=`<b>FINAL SALES DATABASE:</b> GO FIRST ${go.length} • Verified Prospects ${finalAccounts.filter(a=>a.layer==='VERIFIED PROSPECTS').length} • Win-Back ${finalAccounts.filter(a=>a.layer==='WIN-BACK CUSTOMERS').length} • Active ${finalAccounts.filter(a=>a.layer==='ACTIVE CUSTOMERS').length} • Total ${finalAccounts.length}. <b>GO FIRST ROUTING:</b> ${approved} commercial stops approved • ${hold} valid GO FIRST accounts held until a commercial route stop is verified. Category membership and route-ready count are intentionally different.`;
    }catch{}
  }"""
s2,n=re.subn(pattern,new_nav,s,count=1,flags=re.S)
if n!=1: raise SystemExit('navigation setFinalSafetyNotice not replaced')
p.write_text(s2,encoding='utf-8')

# Guardrails.
chat=Path('chat.js').read_text(encoding='utf-8')
idx=Path('index.html').read_text(encoding='utf-8')
nav=Path('navigation.js').read_text(encoding='utf-8')
assert "1391 Roberts Rd Suite B, Morris, IL 60450" in chat
assert "15850 New Ave, Lemont, IL 60439" in chat
assert "'18153','27727'" in chat
assert "a?.finalGoFirstMember===true&&a?.finalGoFirstRouteApproved===true" in chat
assert '53 commercial stops approved' not in chat
assert '53 commercial stops approved' not in idx
assert '53 commercial stops approved' not in nav
assert '${goRoute} commercial stops approved' in idx
assert '${approved} commercial stops approved' in nav
print('GO FIRST hold audit applied: 66 total, cloud-authoritative 55 route-approved / 11 holds.')
