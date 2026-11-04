import {test} from 'node:test';
import assert from 'node:assert/strict';
let handler;
try{handler=(await import('../supabase/functions/salesforce-delivery-verification/handler.mjs')).handleRequest}catch{}
const req=(body={},token='valid')=>new Request('https://example.test',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
const deps={authorize:async token=>token==='Bearer valid',read:async date=>({date,partners:[],deliveries:[],checkedAt:'2026-11-04T00:00:00Z'})};
test('unauthenticated requests never query Salesforce',async()=>{assert.equal(typeof handler,'function');let calls=0;const r=await handler(req({date:'2026-11-04'},'wrong'),{...deps,read:async()=>{calls++}});assert.equal(r.status,401);assert.equal(calls,0)});
test('invalid and impossible dates cannot reach SOQL',async()=>{assert.equal(typeof handler,'function');for(const date of ['2026-02-30',"2026-11-04 OR Id != null",'2025-12-01',''])assert.equal((await handler(req({date}),deps)).status,400)});
test('valid request returns complete data and date',async()=>{assert.equal(typeof handler,'function');const r=await handler(req({date:'2026-11-04'}),deps);assert.equal(r.status,200);const data=await r.json();assert.equal(data.date,'2026-11-04');assert.equal(data.ok,true)});
test('Salesforce failures return no partial verification or upstream secret',async()=>{assert.equal(typeof handler,'function');const r=await handler(req({date:'2026-11-04'}),{...deps,read:async()=>{throw Error('access_token=private')}});assert.equal(r.status,502);assert.doesNotMatch(await r.text(),/private|access_token/)});

test('deployed entrypoint queries Salesforce live with pagination and no writes',async()=>{
 let serve;
 const oldDeno=globalThis.Deno,oldFetch=globalThis.fetch;
 const env={SUPABASE_ANON_KEY:'test-anon',SUPABASE_URL:'https://example.supabase.co',SALESFORCE_MY_DOMAIN:'https://avanimedia.my.salesforce.com',SALESFORCE_CLIENT_ID:'test-client',SALESFORCE_CLIENT_SECRET:'test-secret'};
 const calls=[];
 globalThis.Deno={env:{get:name=>env[name]},serve:fn=>{serve=fn}};
 globalThis.fetch=async(url,init={})=>{calls.push({url:String(url),method:init.method||'GET'});const u=String(url);let result;
  if(u.endsWith('/auth/v1/user'))result={id:'user',role:'authenticated'};
  else if(u.endsWith('/services/oauth2/token'))result={access_token:'test-sf',instance_url:env.SALESFORCE_MY_DOMAIN};
  else if(u.includes('/query/next'))result={records:[{Id:'d2',Program_Partner__c:'a01Rd00000nKW7fIAG',Delivery_Date__c:'2026-11-04',Delivered_Volume__c:20}],done:true};
  else if(decodeURIComponent(u).includes('FROM Partner_Delivery__c'))result={records:[{Id:'d1',Program_Partner__c:'a01Rd00000nKW7fIAG',Delivery_Date__c:'2026-11-04',Delivered_Volume__c:10}],done:false,nextRecordsUrl:'/services/data/v67.0/query/next'};
  else result={records:[{Id:'a01Rd00000nKW7fIAG',Name:'SalesboxAI',Program__c:'program',Program__r:{Name:'Paychex Q3',Client_Name_Text__c:'Paychex'}}],done:true};
  return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try{await import('../supabase/functions/salesforce-delivery-verification/index.ts');const response=await serve(req({date:'2026-11-04',partnerIds:['a01Rd00000sWcNSIA0']}));assert.equal(response.status,200);const data=await response.json();assert.equal(data.deliveries.length,2);assert.equal(data.partners[0].account,'Paychex');assert.ok(calls.some(c=>decodeURIComponent(c.url).includes("'a01Rd00000sWcNSIA0'")),'saved partners must be queried even outside program dates');assert.equal(calls.filter(c=>c.method!=='GET').length,1);assert.ok(calls.some(c=>decodeURIComponent(c.url).includes('Delivery_Date__c = 2026-11-04')))}finally{globalThis.Deno=oldDeno;globalThis.fetch=oldFetch}
});

test('malformed linked partner IDs cannot reach Salesforce',async()=>{let calls=0;const r=await handler(req({date:'2026-11-04',partnerIds:["bad' OR Id != null"]}),{...deps,read:async()=>{calls++;return {}}});assert.equal(r.status,400);assert.equal(calls,0)});
