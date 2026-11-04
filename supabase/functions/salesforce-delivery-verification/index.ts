import {handleRequest} from './handler.mjs';
const env=(name:string)=>{const value=Deno.env.get(name);if(!value)throw Error('Configuration unavailable');return value};
async function request(url:string,init:RequestInit={}){const r=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Upstream unavailable');return r.json()}
async function authorize(auth:string){
 if(!/^Bearer \S+$/.test(auth))return false;
 const key=env('SUPABASE_ANON_KEY');
 const user=await request(env('SUPABASE_URL')+'/auth/v1/user',{headers:{apikey:key,Authorization:auth}});
 return Boolean(user?.id && user?.role==='authenticated');
}
async function read(date:string,linkedPartnerIds:string[]=[]){
 const domain=env('SALESFORCE_MY_DOMAIN').replace(/\/$/,'');
 const token=await request(domain+'/services/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:env('SALESFORCE_CLIENT_ID'),client_secret:env('SALESFORCE_CLIENT_SECRET')})});
 const base=token.instance_url||domain;
 if(!/^https:\/\/[a-zA-Z0-9.-]+\.(salesforce\.com|my\.salesforce\.com)$/.test(base))throw Error('Invalid Salesforce host');
 const query=async(soql:string)=>{const records:any[]=[];let path='/services/data/v67.0/query?q='+encodeURIComponent(soql);for(let i=0;path&&i<50;i++){
  if(!path.startsWith('/services/data/'))throw Error('Invalid page');
  const page=await request(base+path,{headers:{Authorization:'Bearer '+token.access_token}});records.push(...(page.records||[]));
  path=page.nextRecordsUrl||'';if(!path&&!page.done)throw Error('Incomplete query');
 }if(path)throw Error('Too many pages');return records};
 // Partner relationship is authoritative, including records with a mismatched Program__c.
 const deliveries=await query(`SELECT Id,Program_Partner__c,Delivery_Date__c,Delivered_Volume__c FROM Partner_Delivery__c WHERE Delivery_Date__c = ${date} AND Program_Partner__c != null ORDER BY Id LIMIT 10000`);
 if(deliveries.length>=10000)throw Error('Result limit');
 const ids=[...new Set([...linkedPartnerIds,...deliveries.map(d=>d.Program_Partner__c)])];
 if(ids.some(id=>!/^a01[a-zA-Z0-9]{12,15}$/.test(id)))throw Error('Invalid partner');
 // Include active programs with no deliveries, plus any partner that actually has delivery on this date.
 const deliveryIds=ids.length?' OR Id IN ('+ids.map(id=>`'${id}'`).join(',')+')':'';
 const partners=await query(`SELECT Id,Name,Partner__r.Name,Program__c,Program__r.Name,Program__r.Client_Name_Text__c,Program__r.Start_Date__c,Program__r.End_Date__c,Program__r.Program_Volume__c,Program__r.Delivered_Volume__c FROM Program_Partner__c WHERE ((Program__r.Start_Date__c <= ${date} AND Program__r.End_Date__c >= ${date})${deliveryIds}) ORDER BY Name LIMIT 10000`);
 if(partners.length>=10000)throw Error('Result limit');
 return {date,checkedAt:new Date().toISOString(),partners:partners.map(p=>({id:p.Id,name:p.Name,publisher:p.Partner__r?.Name||'',programId:p.Program__c,program:p.Program__r?.Name||'',account:p.Program__r?.Client_Name_Text__c||'',start:p.Program__r?.Start_Date__c||'',end:p.Program__r?.End_Date__c||'',programVolume:p.Program__r?.Program_Volume__c??null,programDelivered:p.Program__r?.Delivered_Volume__c??null})),deliveries:deliveries.map(d=>({id:d.Id,partnerId:d.Program_Partner__c,date:d.Delivery_Date__c,volume:d.Delivered_Volume__c==null?null:Number(d.Delivered_Volume__c)}))};
}
Deno.serve((req:Request)=>handleRequest(req,{authorize,read}));
