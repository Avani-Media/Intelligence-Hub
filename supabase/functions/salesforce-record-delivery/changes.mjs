const partnerId=v=>typeof v==='string'&&/^a01(?:[A-Za-z0-9]{12}|[A-Za-z0-9]{15})$/.test(v);
const recordId=v=>typeof v==='string'&&/^a00(?:[A-Za-z0-9]{12}|[A-Za-z0-9]{15})$/.test(v);
const requestId=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const complete=(d,auditRecorded=true)=>({ok:true,status:d.kind==='delete'?'deleted':'updated',requestId:d.id,deliveryId:d.record_id,date:d.after_snapshot?.date||d.before_snapshot.date,volume:d.after_snapshot?.volume??d.before_snapshot.volume,auditRecorded});
function dateValid(date,now,allowFuture=false){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);return typeof date==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date&&date>='2026-01-01'&&(allowFuture||date<=today);}
export async function executeChange(input,user,{db,sf,now=()=>new Date(),fail}){
 const audit=db.changes;
 if(input.action==='list_records'){
  if(!partnerId(input.partnerId)||!dateValid(input.date,now(),true))fail(400,'INVALID_INPUT','Choose a linked partner and valid delivery date.');
  const records=await sf.listDeliveries(input.partnerId,input.date);return {ok:true,records};
 }
 if(input.action==='prepare_change'){
  if(!['edit','delete'].includes(input.kind)||!recordId(input.recordId)||!partnerId(input.partnerId))fail(400,'INVALID_INPUT','Choose the exact delivery entry to manage.');
  if(input.kind==='edit'&&(!dateValid(input.date,now())||!Number.isSafeInteger(input.volume)||input.volume<1||input.volume>1000000))fail(400,'INVALID_INPUT','Enter a valid delivery date and whole lead count from 1 to 1,000,000.');
  if(!await sf.canChange(input.kind))fail(403,'SF_CHANGE_NOT_ALLOWED','The Salesforce connection does not allow this action on Partner Delivery.');
  const original=await sf.getDelivery(input.recordId);
  if(!original||original.partnerId!==input.partnerId)fail(409,'RECORD_CHANGED','The entry no longer belongs to this partner. Refresh verification.');
  if(original.locked)fail(423,'RECORD_LOCKED','This entry is locked in Salesforce. Manage the lock in Salesforce first.');
  if(!original.modified||!Number.isFinite(Date.parse(original.modified)))fail(409,'MISSING_VERSION','The Salesforce record version could not be confirmed.');
  const partner=await sf.getPartner(original.partnerId);if(!partner)fail(409,'PARTNER_CHANGED','The Salesforce partner is unavailable.');
  if(input.kind==='edit'&&partner.programId!==original.programId)fail(409,'PROGRAM_MISMATCH','This entry has a different program from its Salesforce partner. Review it in Salesforce first.');
  if(input.kind==='edit'&&input.date===original.date&&input.volume===original.volume)fail(400,'NO_CHANGES','Change the delivery date or lead count before reviewing.');
  if(input.kind==='edit'&&input.date!==original.date&&(await sf.findDeliveries(original.partnerId,input.date)).some(r=>(r.Id||r.id)!==original.id))fail(409,'DELIVERY_EXISTS','Another delivery exists for this partner on the new date.');
  const after=input.kind==='edit'?{date:input.date,volume:input.volume}:null;
  const d=await audit.createDraft({user_id:user.id,user_email:user.email,kind:input.kind,record_id:original.id,partner_id:original.partnerId,before_snapshot:original,after_snapshot:after,review:partner,expires_at:new Date(now().getTime()+600000).toISOString()});
  return {ok:true,status:'review',requestId:d.id,kind:d.kind,before:d.before_snapshot,after:d.after_snapshot,review:d.review,expiresAt:d.expires_at};
 }
 if(input.action!=='submit_change'||!requestId(input.requestId))fail(400,'INVALID_REQUEST','Prepare this change for review again.');
 const d=await audit.get(input.requestId,user.id);if(!d)fail(404,'NOT_FOUND','This review was not found for your account.');
 if(d.status==='succeeded')return complete(d);
 if(['checking','submitting','uncertain'].includes(d.status))fail(409,'OUTCOME_UNKNOWN','This change is processing or needs checking. Refresh verification and check Salesforce before trying again.');
 if(d.status!=='prepared')fail(409,'PREVIOUS_ATTEMPT','Refresh verification and prepare a new review.');
 if(Date.parse(d.expires_at)<now().getTime())fail(409,'DRAFT_EXPIRED','This review expired. Prepare it again.');
 if(!await audit.claim(d.id,user.id))fail(409,'IN_PROGRESS','Another submission is managing this record.');
 if(!await db.acquirePartner(d.partner_id,d.id)){await audit.finish(d.id,{status:'failed',error_code:'IN_PROGRESS'});fail(409,'IN_PROGRESS','Another Hub delivery action is processing for this partner.');}
 let keepLock=false;
 try{
  const current=await sf.getDelivery(d.record_id),before=d.before_snapshot;
  if(!current||!['modified','partnerId','programId','date','volume','free','rejected'].every(k=>current[k]===before[k]))fail(409,'RECORD_CHANGED','The Salesforce entry changed after your review. Refresh and review it again.');
  if(current.locked)fail(423,'RECORD_LOCKED','This entry is locked in Salesforce.');
  if(!await sf.canChange(d.kind))fail(403,'SF_CHANGE_NOT_ALLOWED','The Salesforce connection no longer allows this action.');
  if(d.kind==='edit'){
   const partner=await sf.getPartner(d.partner_id);if(partner?.programId!==before.programId)fail(409,'PARTNER_CHANGED','The partner program changed after your review.');
   if(!dateValid(d.after_snapshot.date,now())||!Number.isSafeInteger(d.after_snapshot.volume)||d.after_snapshot.volume<1||d.after_snapshot.volume>1000000)fail(400,'INVALID_INPUT','Prepare a valid date and lead count again.');
   if(d.after_snapshot.date!==before.date&&(await sf.findDeliveries(d.partner_id,d.after_snapshot.date)).some(r=>(r.Id||r.id)!==d.record_id))fail(409,'DELIVERY_EXISTS','Another delivery now exists for this partner on the new date.');
  }
  await audit.finish(d.id,{status:'submitting'});keepLock=true;
  try{await sf.changeDelivery(d.kind,d.record_id,d.kind==='edit'?{Delivery_Date__c:d.after_snapshot.date,Delivered_Volume__c:d.after_snapshot.volume}:null,before.modified)}
  catch(error){if(error.definite){keepLock=false;fail(error.conflict?409:422,error.conflict?'RECORD_CHANGED':'SF_REJECTED',error.conflict?'The entry changed in Salesforce. Refresh and review again.':'Salesforce rejected this change. Check record permissions, locks and validation rules.');}try{await audit.finish(d.id,{status:'uncertain',error_code:'OUTCOME_UNKNOWN'})}catch{}return {ok:false,code:'OUTCOME_UNKNOWN',error:'Salesforce did not confirm the result. The Hub will not retry this change automatically. Refresh verification and check the entry in Salesforce.'};}
  let auditRecorded=true;try{await audit.finish(d.id,{status:'succeeded',error_code:null});keepLock=false}catch{auditRecorded=false}
  return complete(d,auditRecorded);
 }catch(error){try{await audit.finish(d.id,{status:'failed',error_code:error.code||'PRE_CHANGE_CHECK_FAILED'})}catch{}throw error}
 finally{if(!keepLock)try{await db.releasePartner(d.partner_id,d.id)}catch{}}
}
