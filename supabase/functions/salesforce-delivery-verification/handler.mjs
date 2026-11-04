const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function handleRequest(req,{authorize,read}){
 if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});
 if(req.method!=='POST')return json({ok:false,error:'Use POST.'},405);
 try{if(!await authorize(req.headers.get('Authorization')||''))return json({ok:false,error:'Please sign in to the Hub again.'},401)}catch{return json({ok:false,error:'Unable to verify your Hub session.'},401)}
 let date,partnerIds;try{const text=await req.text();if(text.length>64000)throw Error();const body=JSON.parse(text);date=body.date;partnerIds=body.partnerIds??[]}catch{return json({ok:false,error:'Choose a valid delivery date.'},400)}
 if(typeof date!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(date)||date<'2026-01-01'||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)return json({ok:false,error:'Choose a valid delivery date from Jan 1, 2026 onward.'},400);
 if(!Array.isArray(partnerIds)||partnerIds.length>1000||partnerIds.some(id=>typeof id!=='string'||!/^a01(?:[a-zA-Z0-9]{12}|[a-zA-Z0-9]{15})$/.test(id)))return json({ok:false,error:'Invalid Salesforce partner links.'},400);
 try{return json({ok:true,...await read(date,partnerIds)})}catch{return json({ok:false,error:'Salesforce could not be checked. No delivery statuses have been confirmed. Please retry.'},502)}
}
