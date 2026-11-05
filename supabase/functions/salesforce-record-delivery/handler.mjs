const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,'Content-Type':'application/json','Cache-Control':'no-store'}});
export class DeliveryError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code}}
const fail=(status,code,message)=>{throw new DeliveryError(status,code,message)};
const today=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
function validate(input,now){
 if(typeof input.partnerId!=='string'||!/^a01(?:[A-Za-z0-9]{12}|[A-Za-z0-9]{15})$/.test(input.partnerId))fail(400,'INVALID_PARTNER','Choose a linked Salesforce program partner.');
 if(typeof input.volume!=='number'||!Number.isSafeInteger(input.volume)||input.volume<=0||input.volume>1000000)fail(400,'INVALID_VOLUME','Enter a whole lead count from 1 to 1,000,000.');
 const d=input.date;
 if(typeof d!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d||d<'2026-01-01'||d>today(now))fail(400,'INVALID_DATE','Choose a delivery date from Jan 1, 2026 through today.');
}
const reviewOf=d=>({...d.review,partnerId:d.partner_id,programId:d.program_id,date:d.delivery_date,volume:d.delivered_volume});
const recorded=(d,auditRecorded=true)=>({ok:true,status:'recorded',requestId:d.id,deliveryId:d.sf_delivery_id,date:d.delivery_date,volume:d.delivered_volume,auditRecorded});
export async function execute(input,user,{db,sf,now=()=>new Date()}){
 if(!user?.id)fail(401,'AUTH_REQUIRED','Please sign in to the Hub again.');
 const allowed=await db.isWriter(user.id);
 if(input.action==='capabilities')return {ok:true,canRecord:allowed};
 if(!allowed)fail(403,'WRITER_REQUIRED','Recording deliveries is limited to approved Hub delivery editors.');
 if(input.action==='prepare'){
  const instant=now();validate(input,instant);
  if(!await sf.canCreate())fail(403,'SF_CREATE_NOT_ALLOWED','The Salesforce connection cannot create Partner Delivery records with the required fields.');
  const partner=await sf.getPartner(input.partnerId);
  if(!partner?.programId)fail(400,'INVALID_PARTNER','Salesforce could not resolve the program for this partner.');
  if((await sf.findDeliveries(partner.id,input.date)).length)fail(409,'DELIVERY_EXISTS','Salesforce already has a delivery entry for this partner and date. Review it in Salesforce instead of creating another.');
  const draft=await db.createDraft({user_id:user.id,user_email:user.email,partner_id:partner.id,program_id:partner.programId,delivery_date:input.date,delivered_volume:input.volume,review:{number:partner.number,name:partner.name,program:partner.program,publisher:partner.publisher,account:partner.account},expires_at:new Date(instant.getTime()+10*60*1000).toISOString()});
  return {ok:true,status:'review',requestId:draft.id,review:reviewOf(draft),expiresAt:draft.expires_at};
 }
 if(input.action!=='submit')fail(400,'INVALID_ACTION','Choose a supported delivery action.');
 if(typeof input.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.requestId))fail(400,'INVALID_REQUEST','Prepare the delivery for review again.');
 const draft=await db.get(input.requestId,user.id);
 if(!draft)fail(404,'NOT_FOUND','This delivery draft was not found for your account.');
 if(draft.status==='succeeded')return recorded(draft);
 if(['checking','submitting','uncertain'].includes(draft.status))fail(409,'OUTCOME_UNKNOWN','This delivery is being processed or needs confirmation. Refresh verification and check Salesforce before recording again.');
 if(draft.status!=='prepared')fail(409,'PREVIOUS_ATTEMPT','This draft cannot be submitted again. Refresh verification before preparing a new entry.');
 // Expired drafts are not mutated here: another request may already own the active claim.
 if(Date.parse(draft.expires_at)<now().getTime())fail(409,'DRAFT_EXPIRED','The review expired. Prepare and confirm the delivery again.');
 validate({partnerId:draft.partner_id,date:draft.delivery_date,volume:draft.delivered_volume},now());
 if(!await db.claim(draft.id,user.id))fail(409,'IN_PROGRESS','Another Hub submission exists for this partner and date. Refresh verification before continuing.');
 try{
  if(!await sf.canCreate())fail(403,'SF_CREATE_NOT_ALLOWED','The Salesforce connection does not allow this delivery to be created.');
  const partner=await sf.getPartner(draft.partner_id);
  if(partner?.programId!==draft.program_id)fail(409,'PARTNER_CHANGED','The Salesforce partner or program changed. Review the link and prepare again.');
  if((await sf.findDeliveries(draft.partner_id,draft.delivery_date)).length)fail(409,'DELIVERY_EXISTS','A delivery entry now exists for this partner and date. Refresh verification and review it in Salesforce.');
  await db.finish(draft.id,{status:'submitting'});
  let result;
  try{result=await sf.createDelivery({Program_Partner__c:draft.partner_id,Program__c:draft.program_id,Delivery_Date__c:draft.delivery_date,Delivered_Volume__c:draft.delivered_volume});}
  catch(error){
   if(error?.definite)fail(422,'SF_REJECTED','Salesforce rejected the entry. '+(error.safeMessage||'Check the program partner and required fields.'));
   try{await db.finish(draft.id,{status:'uncertain',error_code:'OUTCOME_UNKNOWN'})}catch{}
   return {ok:false,code:'OUTCOME_UNKNOWN',requestId:draft.id,error:'Salesforce did not confirm the result. The Hub will not retry automatically. Refresh verification and check the Salesforce partner before recording again.'};
  }
  if(!result?.id){try{await db.finish(draft.id,{status:'uncertain',error_code:'MISSING_RESULT_ID'})}catch{}return {ok:false,code:'OUTCOME_UNKNOWN',requestId:draft.id,error:'Salesforce did not return a record ID. Check Salesforce before recording again.'};}
  let auditRecorded=true;
  try{await db.finish(draft.id,{status:'succeeded',sf_delivery_id:result.id,error_code:null})}catch{auditRecorded=false}
  return recorded({...draft,sf_delivery_id:result.id},auditRecorded);
 }catch(error){
  try{await db.finish(draft.id,{status:error?.code==='DELIVERY_EXISTS'?'blocked':'failed',error_code:error?.code||'PRE_CREATE_CHECK_FAILED'})}catch{}
  throw error;
 }
}
export async function handleRequest(req,deps){
 if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});
 if(req.method!=='POST')return json({ok:false,error:'Use POST.'},405);
 try{
  const user=await deps.authenticate(req.headers.get('Authorization')||'');
  if(!user?.id)return json({ok:false,code:'AUTH_REQUIRED',error:'Please sign in to the Hub again.'},401);
  const text=await req.text();if(text.length>2000)fail(400,'INVALID_INPUT','Delivery request is too large.');
  let input;try{input=JSON.parse(text)}catch{fail(400,'INVALID_INPUT','Invalid delivery request.');}
  if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'INVALID_INPUT','Invalid delivery request.');
  const result=await execute(input,user,deps);return json(result,result.code==='OUTCOME_UNKNOWN'?202:200);
 }catch(error){return json({ok:false,code:error instanceof DeliveryError?error.code:'UNAVAILABLE',error:error instanceof DeliveryError?error.message:'The delivery could not be prepared or confirmed. Refresh verification and check Salesforce before trying again.'},error instanceof DeliveryError?error.status:502);}
}
