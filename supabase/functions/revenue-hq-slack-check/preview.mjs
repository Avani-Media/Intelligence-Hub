const cents=v=>{if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e12)throw Error('Invalid HQ amount.');return Math.round(v*100);};
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2}).format(n/100);
const signed=n=>(n>0?'+':'')+money(n);
const safe=v=>String(v??'').replace(/[\r\n]+/g,' ').slice(0,250).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const section=text=>({type:'section',text:{type:'mrkdwn',text}});
const field=(label,value)=>({type:'mrkdwn',text:`*${label}*\n${value}`});
const monthLabel=k=>new Date(k+'-01T00:00:00Z').toLocaleDateString('en-US',{month:'short',year:'numeric',timeZone:'UTC'});
const timestamp=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('en-US',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' Manila':'Not available';
function opportunityLink(row){const name=safe(row.opportunity);return /^[a-zA-Z0-9]{15,18}$/.test(row.sfId||'')?`<https://avanimedia.lightning.force.com/lightning/r/Opportunity/${row.sfId}/view|${name}>`:name;}
export function buildHqPreview(view){
 if(!view||!Array.isArray(view.months)||view.months.length!==3||!view.months.every(k=>/^\d{4}-(0[1-9]|1[0-2])$/.test(k))||!Array.isArray(view.issues)||view.issues.length>1000)throw Error('Refresh Revenue HQ and use Preview Slack digest to capture this quarter’s corrections.');
 if(!Number.isFinite(Date.parse(view.capturedAt)))throw Error('HQ snapshot timestamp is missing.');
 const current=new Date(view.capturedAt).toISOString().slice(0,7);
 const issues=view.issues.map(r=>{if(!view.months.includes(r.month))throw Error('Correction is outside the selected quarter.');const forecast=cents(r.forecast),delivered=cents(r.delivered);return {...r,forecastCents:forecast,deliveredCents:delivered,gap:forecast-delivered};}).filter(r=>r.gap<0||(r.month<current&&r.gap!==0));
 const campaigns=new Set(issues.map(r=>r.sfId||r.account+'|'+r.opportunity)).size;
 const over=issues.reduce((t,r)=>t+Math.max(0,-r.gap),0),pastRemaining=issues.reduce((t,r)=>t+Math.max(0,r.gap),0);
 const filters=Object.entries(view.filters||{}).filter(([,v])=>v&&v!=='quarter').map(([k,v])=>safe(k)+': '+safe(v)).join(' · ')||'All accounts and stages · Quarter View';
 const period=`${monthLabel(view.months[0])}–${monthLabel(view.months[2])}`;
 const blocks=[
  {type:'header',text:{type:'plain_text',text:'TEST PREVIEW — Salesforce Corrections',emoji:true}},
  {type:'context',elements:[{type:'mrkdwn',text:`*${period}* · ${filters}\nCaptured: ${timestamp(view.capturedAt)} · Salesforce sync: ${timestamp(view.lastSyncAt)}`}]},
 ];
 if(issues.length){
  blocks.push({type:'section',fields:[field('Campaigns needing review',String(campaigns)),field('Affected revenue months',String(issues.length)),field('Delivered above SF forecast',money(over)),field('Past-month remaining balance',money(pastRemaining))]},{type:'divider'});
  for(const r of issues.slice(0,35))blocks.push(section(`*${r.gap<0?'Update forecast':'Reconcile past month'} · ${safe(r.account)}*\n${opportunityLink(r)}\n*Revenue month:* ${monthLabel(r.month)}\n*Salesforce forecast:* ${money(r.forecastCents)}\n*Recorded delivery:* ${money(r.deliveredCents)}\n*${r.gap<0?'Over forecast':'Remaining balance'}: ${money(Math.abs(r.gap))}*\n${r.gap<0?'Review the Salesforce revenue schedule: recorded delivery exceeds its forecast.':'Review the past month in Salesforce and reconcile its schedule with recorded delivery.'}`));
  if(issues.length>35)blocks.push(section(`Showing 35 of ${issues.length} affected opportunity-months. Totals include all corrections; open Revenue HQ for the remaining items.`));
 }else blocks.push(section('No Salesforce forecast corrections identified in the selected quarter and filters.'));
 blocks.push({type:'actions',elements:[{type:'button',text:{type:'plain_text',text:'Open Revenue HQ'},url:'https://avani-media.github.io/Intelligence-Hub/',action_id:'open_revenue_hq_preview'}]},{type:'context',elements:[{type:'mrkdwn',text:'Quarter-specific Salesforce corrections only · Future delivery still due and working-only draft differences are excluded · Test preview; recurring delivery is disabled.'}]});
 return {text:`TEST PREVIEW — ${period}: ${campaigns} campaigns need Salesforce review. Over forecast ${money(over)}; past-month remaining ${money(pastRemaining)}. Daily digest disabled.`,blocks,unfurl_links:false,unfurl_media:false};
}
