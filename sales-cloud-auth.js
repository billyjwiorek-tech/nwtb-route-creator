/* Sales opens directly. Employee chat owns its separate optional identity. */
(()=>{
  const API='https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-sales-app';
  const APIKEY='sb_publishable_EqF-iooqhmngSG5BbzOxfQ_Vnf9Altc';

  async function api(action,body={}){
    const headers={'content-type':'application/json','apikey':APIKEY};
    // Named chat sessions are optional; Sales reads never require or create one.
    const token=localStorage.getItem('nwtb_chat_token');if(token)headers['x-nwtb-session']=token;
    const response=await fetch(API,{method:'POST',headers,body:JSON.stringify({action,...body}),cache:'no-store'});
    const data=await response.json().catch(()=>({error:'Invalid cloud response.'}));
    if(!response.ok){const error=new Error(data.error||'Could not load Sales.');error.status=response.status;throw error}
    return data;
  }
  window.nwtbSalesApi=api;

  const asBool=value=>value===true||value==='true'||value===1||value==='1';
  window.nwtbNormalizeSalesAccount=source=>{
    const account={...source};
    if(String(account.finalCategoryVersion||'')==='2026-09-28'||account.finalLayer!==undefined){
      for(const field of ['finalIncluded','finalGoFirstMember','finalGoFirstRouteApproved','finalRouteApproved'])account[field]=asBool(account[field]);
      for(const [final,field]of [['finalLayer','layer'],['finalBroadType','broadType'],['finalAccountType','accountType'],['finalBadge','badge'],['finalPriority','priority']])if(account[final])account[field]=account[final];
      if(account.finalCustomerNumber!==undefined)account.customerNumber=account.finalCustomerNumber;
      if(account.finalBillCusId!==undefined)account.billCusId=account.finalBillCusId;
    }
    account.routeEligible=!window.NwtbSalesPolicy.reason(account);return account;
  };

  function connectionNotice(message){
    let box=document.getElementById('nwtbSalesConnectionStatus');
    if(!message){box?.remove();return}
    if(!box){box=document.createElement('div');box.id='nwtbSalesConnectionStatus';box.setAttribute('role','alert');box.style.cssText='margin:16px;padding:16px;border:1px solid #d9dee4;border-left:5px solid #b54708;border-radius:10px;background:#fff8eb;color:#713b12;font:15px/1.5 Arial';document.body.prepend(box)}
    box.replaceChildren();const text=document.createElement('div');text.textContent=message;box.appendChild(text);
    const retry=document.createElement('button');retry.type='button';retry.textContent='RETRY';retry.style.cssText='margin-top:10px;padding:10px 18px;border:0;border-radius:8px;background:#17202a;color:#fff;font-weight:800;cursor:pointer';retry.onclick=()=>location.reload();box.appendChild(retry);
  }
  window.nwtbLoadSalesAccounts=async function(){
    try{
      const result=await api('accounts');
      if(!result.ok||!Array.isArray(result.accounts))throw Error('Sales returned an invalid business list.');
      window.nwtbSalesCloudSource=result.source||'SUPABASE_SALES_DIRECT_ACCESS_ROUTE_APPROVED';
      window.nwtbSalesFinalCategoryVersion='2026-09-28';connectionNotice('');
      return result.accounts.map(window.nwtbNormalizeSalesAccount);
    }catch(error){connectionNotice('Could not load the Sales businesses. Check your internet connection, then retry. '+(error.message||''));throw error}
  };
})();
