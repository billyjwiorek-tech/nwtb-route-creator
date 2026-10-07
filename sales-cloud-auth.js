(()=>{
  const API='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-sales-app';
  const APIKEY='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';

  async function api(action,body={}){
    const r=await fetch(API,{
      method:'POST',
      headers:{'content-type':'application/json','apikey':APIKEY},
      body:JSON.stringify({action,...body}),
      cache:'no-store'
    });
    const j=await r.json().catch(()=>({error:'Invalid cloud response.'}));
    if(!r.ok){const e=new Error(j.error||'NWTB Sales cloud request failed.');e.status=r.status;throw e}
    return j;
  }

  window.nwtbSalesApi=api;

  window.nwtbLoadSalesAccounts=async function(){
    const j=await api('accounts');
    if(!Array.isArray(j.accounts))throw new Error('Sales database returned an invalid account list.');
    const asBool=v=>v===true||v==='true'||v===1||v==='1';
    window.nwtbNormalizeSalesAccount=src=>{
      const a={...src};
      const tagged=String(a.finalCategoryVersion||'')==='2026-09-28'||a.finalLayer!==undefined;
      if(tagged){
        a.finalIncluded=asBool(a.finalIncluded);
        a.finalGoFirstMember=asBool(a.finalGoFirstMember);
        a.finalGoFirstRouteApproved=asBool(a.finalGoFirstRouteApproved);
        a.finalRouteApproved=asBool(a.finalRouteApproved);
        if(a.finalLayer)a.layer=a.finalLayer;
        if(a.finalBroadType)a.broadType=a.finalBroadType;
        if(a.finalCustomerNumber!==undefined)a.customerNumber=a.finalCustomerNumber;
        if(a.finalBillCusId!==undefined)a.billCusId=a.finalBillCusId;
        if(a.finalAccountType)a.accountType=a.finalAccountType;
        if(a.finalBadge)a.badge=a.finalBadge;
        if(a.finalPriority)a.priority=a.finalPriority;
      }
      a.routeEligible=!window.NwtbSalesPolicy.reason(a);
      return a;
    };
    const normalized=j.accounts.map(window.nwtbNormalizeSalesAccount);
    window.nwtbSalesCloudSource=j.source||'SUPABASE_READ_ONLY_NO_LOGIN';
    window.nwtbSalesFinalCategoryVersion='2026-09-28';
    return normalized;
  };

  window.nwtbSalesCloudLogout=async function(){};
})();