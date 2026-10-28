// Connection checks only. No recurring job, financial data, or caller-supplied message.
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
function adminKeys(env){
 const keys=[env('SUPABASE_SERVICE_ROLE_KEY'),env('SUPABASE_SECRET_KEY')].filter(Boolean);
 try {const bundled=JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}');if(typeof bundled==='string')keys.push(bundled);else if(bundled&&typeof bundled==='object')for(const v of Object.values(bundled))if(typeof v==='string')keys.push(v);}catch{}
 return keys;
}
async function authorized(token,env,request){
 const keys=adminKeys(env);if(!token||!keys.length)return false;
 // Supabase Dashboard testing and server-side administration.
 if(keys.includes(token))return true;
 const base=env('SUPABASE_URL');if(!base)return false;
 const userResponse=await request(base+'/auth/v1/user',{headers:{apikey:keys[0],Authorization:'Bearer '+token}});
 if(!userResponse.ok)return false;
 const user=await userResponse.json();if(!user.id||!user.email)return false;
 const settingsResponse=await request(base+'/rest/v1/hub_settings?setting_key=eq.revenue_forecast_editor_emails&select=setting_value',{headers:{apikey:keys[0],Authorization:'Bearer '+keys[0]}});
 if(!settingsResponse.ok)return false;
 const rows=await settingsResponse.json(),emails=rows[0]?.setting_value;
 return Array.isArray(emails)&&emails.some(email=>String(email).trim().toLowerCase()===user.email.toLowerCase());
}
function validWebhook(value){
 try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='hooks.slack.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/services\/[^/]+\/[^/]+\/[^/]+$/.test(u.pathname);}catch{return false;}
}
function digestPreview(){
 return {
  text:'TEST PREVIEW — Avani Revenue HQ digest. Fictional sample data only. Increases +$2,100; decreases -$5,000; net change -$2,900. Daily digest is disabled.',
  unfurl_links:false,unfurl_media:false,
  blocks:[
   {type:'header',text:{type:'plain_text',text:'TEST PREVIEW — Revenue HQ Digest',emoji:true}},
   {type:'context',elements:[{type:'mrkdwn',text:'*SAMPLE DATA ONLY* · All clients and amounts below are fictional. This is a layout test.'}]},
   {type:'section',fields:[{type:'mrkdwn',text:'*Forecast increases*\n+$2,100.00'},{type:'mrkdwn',text:'*Forecast decreases*\n-$5,000.00'},{type:'mrkdwn',text:'*Net forecast change*\n-$2,900.00'},{type:'mrkdwn',text:'*Affected opportunities*\n2 sample opportunities'}]},
   {type:'divider'},
   {type:'section',text:{type:'mrkdwn',text:'*↑ Increase · Sample Client A*\nSample opportunity: Content Syndication\n*Revenue month:* October 2026\n*Before:* $20,000.00 → *After:* $22,100.00\n*Change: +$2,100.00*'}},
   {type:'section',text:{type:'mrkdwn',text:'*↓ Decrease · Sample Client B*\nSample opportunity: Paid Media\n*Revenue month:* November 2026\n*Before:* $30,000.00 → *After:* $25,000.00\n*Change: -$5,000.00*'}},
   {type:'divider'},
   {type:'actions',elements:[{type:'button',text:{type:'plain_text',text:'Open Revenue HQ'},url:'https://avani-media.github.io/Intelligence-Hub/',action_id:'open_revenue_hq_preview'}]},
   {type:'context',elements:[{type:'mrkdwn',text:'Preview only · No Salesforce records changed · No daily schedule enabled.'}]}
  ]
 };
}
export async function handleRequest(req,env,request){
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(!['GET','POST'].includes(req.method))return json({ok:false,error:'Use GET or POST.'},405);
 const token=(req.headers.get('Authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1]||'';
 try{
  if(!await authorized(token,env,request))return json({ok:false,error:'Revenue HQ editor or administrator access is required.'},401);
 }catch{return json({ok:false,error:'Unable to verify access.'},503);}
 let action='status';
 if(req.method==='POST'){
  try{const text=await req.text();if(text.length>2048)return json({ok:false,error:'Request is too large.'},413);action=JSON.parse(text||'{}').action||'status';}catch{return json({ok:false,error:'Request must be JSON.'},400);}
 }
 if(!['status','test','preview'].includes(action))return json({ok:false,error:'Use action status, test or preview. Recurring digests are not enabled.'},400);
 const webhook=(env('REVENUE_HQ_SLACK_WEBHOOK_URL')||'').trim(),configured=!!webhook,webhookValid=validWebhook(webhook);
 if(action==='status')return json({ok:true,configured,webhookValid,digestEnabled:false});
 if(!configured||!webhookValid)return json({ok:false,error:'The Revenue HQ Slack webhook is missing or invalid.'},503);
 const payload=action==='preview'?digestPreview():{text:'Avani Revenue HQ — connection test\nThis is a test of the Revenue HQ notification connection. No forecast changes or client data are included. The daily digest is not enabled.',unfurl_links:false,unfurl_media:false};
 try{
  const result=await request(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(15000)});
  const body=await result.text();if(!result.ok||body.trim()!=='ok')return json({ok:false,error:'Slack rejected the test message.',slackStatus:result.status},502);
  return json({ok:true,action,sent:true,digestEnabled:false});
 }catch{return json({ok:false,error:'The Slack test request failed or timed out. Check the channel before retrying to avoid duplicates.'},502);}
}
