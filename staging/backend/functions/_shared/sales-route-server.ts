import './sales-route-policy.js'
const policy = (globalThis as any).NwtbSalesPolicy

export async function loadSalesDatabase(db:any) {
  const {data,error}=await db.from('sales_accounts').select('id,source_index,payload').eq('active',true).order('source_index',{ascending:true})
  if(error)throw new Error('Could not read current Sales route approvals.')
  const {data:visits,error:visitError}=await db.from('prospect_visit_status').select('account_key,status')
  if(visitError)throw new Error('Could not check Sales visit restrictions.')
  const status=new Map((visits||[]).map((v:any)=>[v.account_key,v.status]))
  return (data||[]).map((row:any)=>{
    const a={...row.payload,salesAccountId:row.id}
    const cn=String(a.finalCustomerNumber??a.customerNumber??'').trim()
    const key=cn?'CUST:'+cn:'ADDR:'+String(a.name||'').trim().toUpperCase()+'|'+String(a.address||'').trim().toUpperCase()
    a.visitStatus=status.get(key)||'NOT_VISITED'
    return a
  })
}

export async function validateSalesRoute(db:any,stops:unknown) {
  const database=await loadSalesDatabase(db)
  return policy.validate(stops,database)
}

export const salesHoldMessage=policy.MESSAGE
