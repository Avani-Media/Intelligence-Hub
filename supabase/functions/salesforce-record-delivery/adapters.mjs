export function createDependencies(env,fetcher=fetch){
 const required=name=>{const value=env(name);if(!value)throw Error('Configuration unavailable');return value};
 const adminKey=()=>{const direct=env('SUPABASE_SERVICE_ROLE_KEY')||env('SUPABASE_SECRET_KEY');if(direct)return direct;const bundled=env('SUPABASE_SECRET_KEYS');if(!bundled)throw Error('Server key unavailable');const parsed=JSON.parse(bundled);const keys=typeof parsed==='string'?[parsed]:Array.isArray(parsed)?parsed:Object.values(parsed);const key=keys.find(v=>typeof v==='string'&&v);if(!key)throw Error('Server key unavailable');return key};
 const send=async(url,init={})=>fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)});
 const json=async response=>{const data=await response.json();if(!response.ok)throw Object.assign(Error('Upstream request failed'),{httpStatus:response.status,dbCode:data?.code});return data};
 const authenticate=async auth=>{if(!/^Bearer \S+$/.test(auth))return null;try{const data=await json(await send(required('SUPABASE_URL')+'/auth/v1/user',{headers:{apikey:required('SUPABASE_ANON_KEY'),Authorization:auth}}));if(data?.id&&data.role==='authenticated'&&typeof data.email==='string')return {id:data.id,email:data.email.trim().toLowerCase()};return null}catch{return null}};
 const rest=async(table,query,method='GET',body)=>{const key=adminKey();const response=await send(required('SUPABASE_URL')+'/rest/v1/'+table+'?'+query,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});return json(response)};
 const db={
  isWriter:async uid=>{const rows=await rest('sf_delivery_writers','select=user_id&user_id=eq.'+encodeURIComponent(uid)+'&limit=1');return rows.length===1},
  createDraft:async data=>{const rows=await rest('sf_delivery_submissions','select=*','POST',{...data,status:'prepared'});if(!rows[0]?.id)throw Error('Audit unavailable');return rows[0]},
  get:async(id,uid)=>(await rest('sf_delivery_submissions','select=*&id=eq.'+encodeURIComponent(id)+'&user_id=eq.'+encodeURIComponent(uid)+'&limit=1'))[0]||null,
  claim:async(id,uid)=>{try{const rows=await rest('sf_delivery_submissions','id=eq.'+encodeURIComponent(id)+'&user_id=eq.'+encodeURIComponent(uid)+'&status=eq.prepared&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&select=id','PATCH',{status:'checking',updated_at:new Date().toISOString()});return rows.length===1}catch(error){if(error.httpStatus===409&&error.dbCode==='23505')return false;throw error}},
  finish:async(id,fields)=>{const rows=await rest('sf_delivery_submissions','id=eq.'+encodeURIComponent(id)+'&select=id','PATCH',{...fields,updated_at:new Date().toISOString()});if(rows.length!==1)throw Error('Audit update unavailable')}
 };
 let session;
 const sfSession=()=>session||(session=(async()=>{const domain=required('SALESFORCE_MY_DOMAIN').replace(/\/$/,'');if(!/^https:\/\/[a-zA-Z0-9.-]+\.salesforce\.com$/.test(domain))throw Error('Invalid Salesforce host');const result=await json(await send(domain+'/services/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:required('SALESFORCE_CLIENT_ID'),client_secret:required('SALESFORCE_CLIENT_SECRET')})}));const base=result.instance_url||domain;if(!/^https:\/\/[a-zA-Z0-9.-]+\.salesforce\.com$/.test(base)||!result.access_token)throw Error('Invalid Salesforce session');return {base,token:result.access_token}})());
 const sfGet=async path=>{const s=await sfSession();return json(await send(s.base+'/services/data/v67.0/'+path,{headers:{Authorization:'Bearer '+s.token}}))};
 const query=async soql=>{const result=await sfGet('query?q='+encodeURIComponent(soql));if(!result.done||!Array.isArray(result.records))throw Error('Incomplete Salesforce query');return result.records};
 const allowedFields=['Program_Partner__c','Program__c','Delivery_Date__c','Delivered_Volume__c'];
 const changes={
  createDraft:async data=>{const rows=await rest('sf_delivery_changes','select=*','POST',{...data,status:'prepared'});if(!rows[0]?.id)throw Error('Change audit unavailable');return rows[0]},
  get:async(id,uid)=>(await rest('sf_delivery_changes','select=*&id=eq.'+encodeURIComponent(id)+'&user_id=eq.'+encodeURIComponent(uid)+'&limit=1'))[0]||null,
  claim:async(id,uid)=>{try{const rows=await rest('sf_delivery_changes','id=eq.'+encodeURIComponent(id)+'&user_id=eq.'+encodeURIComponent(uid)+'&status=eq.prepared&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&select=id','PATCH',{status:'checking',updated_at:new Date().toISOString()});return rows.length===1}catch(e){if(e.httpStatus===409&&e.dbCode==='23505')return false;throw e}},
  finish:async(id,fields)=>{const rows=await rest('sf_delivery_changes','id=eq.'+encodeURIComponent(id)+'&select=id','PATCH',{...fields,updated_at:new Date().toISOString()});if(rows.length!==1)throw Error('Change audit update unavailable')}
 };
 db.changes=changes;
 db.acquirePartner=async(partner,requestId)=>{try{await rest('sf_delivery_partner_locks','select=request_id','POST',{partner_id:partner,request_id:requestId});return true}catch(e){if(e.httpStatus===409&&e.dbCode==='23505')return false;throw e}};
 db.releasePartner=async(partner,requestId)=>{await rest('sf_delivery_partner_locks','partner_id=eq.'+encodeURIComponent(partner)+'&request_id=eq.'+encodeURIComponent(requestId),'DELETE')};
 const deliveryFields='Id,Name,Program_Partner__c,Program__c,Delivery_Date__c,Delivered_Volume__c,Free_Delivered_Leads__c,Rejected_Leads__c,LastModifiedDate,Lock_Record__c,Lock_Partner_Delivery_Record__c';
 const normalizeDelivery=r=>({id:r.Id,name:r.Name,partnerId:r.Program_Partner__c,programId:r.Program__c,date:r.Delivery_Date__c,volume:r.Delivered_Volume__c??null,free:r.Free_Delivered_Leads__c??0,rejected:r.Rejected_Leads__c??0,modified:r.LastModifiedDate,locked:!!(r.Lock_Record__c||r.Lock_Partner_Delivery_Record__c)});
 const validRecord=id=>typeof id==='string'&&/^a00(?:[A-Za-z0-9]{12}|[A-Za-z0-9]{15})$/.test(id);
 const sf={
  canChange:async kind=>{const d=await sfGet('sobjects/Partner_Delivery__c/describe');return kind==='delete'?!!d.deletable:!!d.updateable&&['Delivery_Date__c','Delivered_Volume__c'].every(name=>d.fields?.find(f=>f.name===name)?.updateable)},
  getDelivery:async id=>{if(!validRecord(id))throw Error('Invalid delivery ID');const rows=await query(`SELECT ${deliveryFields} FROM Partner_Delivery__c WHERE Id = '${id}' LIMIT 1`);return rows[0]?normalizeDelivery(rows[0]):null},
  listDeliveries:async(partner,date)=>{if(!/^a01(?:[A-Za-z0-9]{12}|[A-Za-z0-9]{15})$/.test(partner)||!/^20\d{2}-\d{2}-\d{2}$/.test(date))throw Error('Invalid delivery scope');const rows=await query(`SELECT ${deliveryFields} FROM Partner_Delivery__c WHERE Program_Partner__c = '${partner}' AND Delivery_Date__c = ${date} ORDER BY CreatedDate,Id LIMIT 201`);if(rows.length>200)throw Error('Too many delivery records');return rows.map(normalizeDelivery)},
  changeDelivery:async(kind,id,payload,version)=>{
   if(!['edit','delete'].includes(kind)||!validRecord(id)||!Number.isFinite(Date.parse(version)))throw Error('Invalid delivery change');
   const session=await sfSession(),headers={Authorization:'Bearer '+session.token,'Content-Type':'application/json','If-Unmodified-Since':new Date(version).toUTCString()};
   const response=await send(session.base+'/services/data/v67.0/sobjects/Partner_Delivery__c/'+id,{method:kind==='edit'?'PATCH':'DELETE',headers,...(kind==='edit'?{body:JSON.stringify({Delivery_Date__c:payload.Delivery_Date__c,Delivered_Volume__c:payload.Delivered_Volume__c})}:{})});
   if(response.status===204)return {id};
   if([400,401,403,404,405,409,412,415,422].includes(response.status))throw Object.assign(Error('Salesforce rejected change'),{definite:true,conflict:response.status===412||response.status===404});
   throw Error('Unconfirmed Salesforce change');
  },
  canCreate:async()=>{const d=await sfGet('sobjects/Partner_Delivery__c/describe');if(!d.createable||!Array.isArray(d.fields))return false;if(!allowedFields.every(name=>d.fields.find(f=>f.name===name)?.createable))return false;return !d.fields.some(f=>f.createable&&!f.nillable&&!f.defaultedOnCreate&&!f.calculated&&!allowedFields.includes(f.name))},
  getPartner:async id=>{if(!/^a01(?:[A-Za-z0-9]{12}|[A-Za-z0-9]{15})$/.test(id))throw Error('Invalid partner');const [p]=await query(`SELECT Id,Name,AUTO_Program_Partner_Number__c,Program_Partner_Number__c,Partner__r.Name,Program__c,Program__r.Name,Program__r.Client_Name_Text__c FROM Program_Partner__c WHERE Id = '${id}' LIMIT 1`);if(!p)return null;return {id:p.Id,programId:p.Program__c,number:p.AUTO_Program_Partner_Number__c||p.Program_Partner_Number__c||'',name:p.Name,publisher:p.Partner__r?.Name||'',program:p.Program__r?.Name||'',account:p.Program__r?.Client_Name_Text__c||''}},
  findDeliveries:async(partnerId,date)=>{if(!/^a01(?:[A-Za-z0-9]{12}|[A-Za-z0-9]{15})$/.test(partnerId)||!/^20\d{2}-\d{2}-\d{2}$/.test(date))throw Error('Invalid delivery query');return query(`SELECT Id,Delivered_Volume__c FROM Partner_Delivery__c WHERE Program_Partner__c = '${partnerId}' AND Delivery_Date__c = ${date} ORDER BY Id LIMIT 2`)},
  createDelivery:async payload=>{const s=await sfSession();const response=await send(s.base+'/services/data/v67.0/sobjects/Partner_Delivery__c',{method:'POST',headers:{Authorization:'Bearer '+s.token,'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(allowedFields.map(key=>[key,payload[key]])))});
   let data;try{data=await response.json()}catch{throw Error('Unconfirmed Salesforce result')}
   if(!response.ok){if([400,401,403,404,405,415,422].includes(response.status))throw Object.assign(Error('Salesforce rejected the entry'),{definite:true,safeMessage:response.status===403?'The integration user needs create access to Partner Delivery.':'Check the partner and Salesforce validation rules.'});throw Error('Unconfirmed Salesforce result')}
   if(!data.success||typeof data.id!=='string'||!/^a00(?:[A-Za-z0-9]{12}|[A-Za-z0-9]{15})$/.test(data.id))throw Error('Unconfirmed Salesforce result');return {id:data.id};
  }
 };
 return {authenticate,db,sf};
}
