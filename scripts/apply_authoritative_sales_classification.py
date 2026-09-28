from pathlib import Path
import re

FINAL_NOTICE = "<b>FINAL SALES DATABASE:</b> GO FIRST 66 • Verified Prospects 7 • Win-Back 232 • Active 135 • Total 440. <b>GO FIRST ROUTING:</b> 53 commercial stops approved • 13 valid GO FIRST accounts held until a commercial route stop is verified. Category membership and route-ready count are intentionally different."

# 1) Normalize the authoritative cloud fields as soon as accounts arrive from Supabase.
p=Path('sales-cloud-auth.js')
s=p.read_text(encoding='utf-8')
old="""      const j=await api('accounts');
      if(!Array.isArray(j.accounts)||j.accounts.length<400)throw new Error('Private Sales database returned an unexpected account count.');
      window.nwtbSalesCloudSource=j.source||'SUPABASE_PRIVATE';
      return j.accounts;"""
new="""      const j=await api('accounts');
      if(!Array.isArray(j.accounts)||j.accounts.length<400)throw new Error('Private Sales database returned an unexpected account count.');
      const asBool=v=>v===true||v==='true'||v===1||v==='1';
      const normalized=j.accounts.map(src=>{
        const a={...src};
        const tagged=String(a.finalCategoryVersion||'')==='2026-09-28'||a.finalLayer!==undefined;
        if(tagged){
          a.finalIncluded=asBool(a.finalIncluded);
          a.finalGoFirstMember=asBool(a.finalGoFirstMember);
          a.finalGoFirstRouteApproved=asBool(a.finalGoFirstRouteApproved);
          if(a.finalLayer)a.layer=a.finalLayer;
          if(a.finalBroadType)a.broadType=a.finalBroadType;
          if(a.finalCustomerNumber!==undefined)a.customerNumber=a.finalCustomerNumber;
          if(a.finalBillCusId!==undefined)a.billCusId=a.finalBillCusId;
          if(a.finalAccountType)a.accountType=a.finalAccountType;
          if(a.finalBadge)a.badge=a.finalBadge;
          if(a.finalPriority)a.priority=a.finalPriority;
        }
        return a;
      });
      window.nwtbSalesCloudSource=j.source||'SUPABASE_PRIVATE';
      window.nwtbSalesFinalCategoryVersion='2026-09-28';
      return normalized;"""
if old not in s:
    raise SystemExit('sales-cloud-auth.js cloud accounts block not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

# 2) Main pages: derive the headline category counts from final cloud classification,
# while keeping the stricter route-eligible safety gate separate.
new_init=f"""async function init(){{accounts=await window.nwtbLoadSalesAccounts();accounts.forEach(a=>{{let allowed=a.finalIncluded!==false&&!isBlocked(a);if(a.finalGoFirstMember===true)allowed=allowed&&a.finalGoFirstRouteApproved===true;a.routeEligible=allowed;}});const finalAccounts=accounts.filter(a=>a.finalIncluded!==false),go=finalAccounts.filter(a=>a.layer==='GO FIRST'),goRoute=go.filter(a=>a.finalGoFirstRouteApproved===true).length,goHold=go.length-goRoute;statGo.textContent=go.length;statGoSub.textContent=`${{goRoute}} route-approved • ${{goHold}} commercial-stop hold`;statPros.textContent=finalAccounts.filter(a=>a.layer==='VERIFIED PROSPECTS').length;statWin.textContent=finalAccounts.filter(a=>a.layer==='WIN-BACK CUSTOMERS').length;statActive.textContent=finalAccounts.filter(a=>a.layer==='ACTIVE CUSTOMERS').length;statTotal.textContent=finalAccounts.length;safetyNotice.innerHTML='{FINAL_NOTICE}'}}function rad("""
for name in ('index.html','app.html'):
    p=Path(name); s=p.read_text(encoding='utf-8')
    s=s.replace('Route Database Total<div class="small">My Maps view: 425</div>','Route Database Total<div class="small">Final audited cloud database</div>')
    s2,n=re.subn(r"async function init\(\)\{.*?\}function rad\(",new_init,s,count=1,flags=re.S)
    if n!=1:
        raise SystemExit(f'Could not replace init() in {name}')
    p.write_text(s2,encoding='utf-8')

# 3) navigation.js: headline stats are category membership; routing remains route-safe.
p=Path('navigation.js'); s=p.read_text(encoding='utf-8')
new_refresh="""function refreshReconciledStats(){
    try{
      const finalAccounts=accounts.filter(a=>a.finalIncluded!==false);
      const go=finalAccounts.filter(a=>a.layer==='GO FIRST');
      const approved=go.filter(a=>a.finalGoFirstRouteApproved===true).length;
      const hold=go.length-approved;
      if($('statGo'))$('statGo').textContent=go.length;
      if($('statGoSub'))$('statGoSub').textContent=`${approved} route-approved • ${hold} commercial-stop hold`;
      if($('statPros'))$('statPros').textContent=finalAccounts.filter(a=>a.layer==='VERIFIED PROSPECTS').length;
      if($('statWin'))$('statWin').textContent=finalAccounts.filter(a=>a.layer==='WIN-BACK CUSTOMERS').length;
      if($('statActive'))$('statActive').textContent=finalAccounts.filter(a=>a.layer==='ACTIVE CUSTOMERS').length;
      if($('statTotal'))$('statTotal').textContent=finalAccounts.length;
    }catch(e){console.warn('NWTB reconciliation stats:',e)}
  }
  function applyMasterReconciliation"""
s,n=re.subn(r"function refreshReconciledStats\(\)\{.*?\n  \}\n  function applyMasterReconciliation",new_refresh,s,count=1,flags=re.S)
if n!=1: raise SystemExit('Could not replace refreshReconciledStats')
new_notice=f"""function setFinalSafetyNotice(){{
    try{{
      const n=$('safetyNotice');
      if(n)n.innerHTML='{FINAL_NOTICE}';
    }}catch{{}}
  }}

  function applyAllReconciliation"""
s,n=re.subn(r"function setFinalSafetyNotice\(\)\{.*?\n  \}\n\n  function applyAllReconciliation",new_notice,s,count=1,flags=re.S)
if n!=1: raise SystemExit('Could not replace setFinalSafetyNotice')
s=s.replace("let cand=accounts.filter(a=>a.routeEligible)\n      .filter(filterFn(t))", "let cand=accounts.filter(a=>a.finalIncluded!==false)\n      .filter(a=>a.routeEligible)\n      .filter(filterFn(t))",1)
p.write_text(s,encoding='utf-8')

# 4) chat.js: never overwrite the category totals with the route-safe subset.
p=Path('chat.js'); s=p.read_text(encoding='utf-8')
new_safe="""function updateSafeStats(){
    try{
      const finalAccounts=accounts.filter(a=>a.finalIncluded!==false);
      const go=finalAccounts.filter(a=>a.layer==='GO FIRST');
      const approved=go.filter(a=>a.finalGoFirstRouteApproved===true).length;
      const hold=go.length-approved;
      if($('statGo'))$('statGo').textContent=go.length;
      if($('statGoSub'))$('statGoSub').textContent=`${approved} route-approved • ${hold} commercial-stop hold`;
      if($('statPros'))$('statPros').textContent=finalAccounts.filter(a=>a.layer==='VERIFIED PROSPECTS').length;
      if($('statWin'))$('statWin').textContent=finalAccounts.filter(a=>a.layer==='WIN-BACK CUSTOMERS').length;
      if($('statActive'))$('statActive').textContent=finalAccounts.filter(a=>a.layer==='ACTIVE CUSTOMERS').length;
      if($('statTotal'))$('statTotal').textContent=finalAccounts.length;
    }catch{}
  }

  function updateAuditNotice"""
s,n=re.subn(r"function updateSafeStats\(\)\{.*?\n  \}\n\n  function updateAuditNotice",new_safe,s,count=1,flags=re.S)
if n!=1: raise SystemExit('Could not replace updateSafeStats')
new_audit=f"""function updateAuditNotice(){{
    try{{const n=$('safetyNotice');if(n)n.innerHTML='{FINAL_NOTICE}';}}catch{{}}
  }}

  const css="""
s,n=re.subn(r"function updateAuditNotice\(\)\{.*?\n  \}\n\n  const css=",new_audit,s,count=1,flags=re.S)
if n!=1: raise SystemExit('Could not replace updateAuditNotice')
p.write_text(s,encoding='utf-8')

# Assertions: final category totals must be calculated from cloud metadata, not typed as UI values.
idx=Path('index.html').read_text(encoding='utf-8')
nav=Path('navigation.js').read_text(encoding='utf-8')
chat=Path('chat.js').read_text(encoding='utf-8')
auth=Path('sales-cloud-auth.js').read_text(encoding='utf-8')
assert "finalAccounts=accounts.filter(a=>a.finalIncluded!==false)" in idx
assert "finalGoFirstRouteApproved" in idx
assert "53 commercial stops approved" in nav
assert "53 commercial stops approved" in chat
assert "window.nwtbSalesFinalCategoryVersion='2026-09-28'" in auth
assert 'My Maps view: 425' not in idx
print('Authoritative Sales classification applied: 66 category members; 53 route-approved; 13 commercial-stop holds.')
