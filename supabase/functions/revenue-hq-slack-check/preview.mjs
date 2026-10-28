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
 if(!view||!Array.isArray(view.months)||view.months.length!==3||!view.months.every(k=>/^\d{4}-(0[1-9]|1[0-2])$/.test(k))||!Array.isArray(view.rows)||view.rows.length>1000||!Array.isArray(view.changes)||view.changes.length>1000)throw Error('Refresh Revenue HQ and use Preview Slack digest to capture the current view.');
 if(!Number.isFinite(Date.parse(view.capturedAt)))throw Error('HQ snapshot timestamp is missing.');
 const rows=view.rows.map(r=>({...r,currentCents:cents(r.current),workingCents:cents(r.working),deliveredCents:cents(r.delivered),remainingCents:r.remaining===undefined?cents(r.working)-cents(r.delivered):cents(r.remaining)}));
 const sums=rows.reduce((a,r)=>({current:a.current+r.currentCents,working:a.working+r.workingCents,delivered:a.delivered+r.deliveredCents,remaining:a.remaining+r.remainingCents}),{current:0,working:0,delivered:0,remaining:0});
 // The rendered KPI rollup is authoritative for the current signed-in HQ view.
 if(view.totals)for(const key of ['current','delivered','remaining'])sums[key]=cents(view.totals[key]);
 const changes=view.changes.map(r=>{if(!view.months.includes(r.month))throw Error('Forecast change is outside the selected quarter.');const before=cents(r.before),after=cents(r.after);return {...r,beforeCents:before,afterCents:after,delta:after-before};}).filter(r=>r.delta!==0);
 const increases=changes.reduce((t,r)=>t+Math.max(0,r.delta),0),decreases=changes.reduce((t,r)=>t+Math.min(0,r.delta),0);
 const filters=Object.entries(view.filters||{}).filter(([,v])=>v&&v!=='quarter').map(([k,v])=>safe(k)+': '+safe(v)).join(' · ')||'All accounts and stages · Quarter View';
 const period=`${monthLabel(view.months[0])}–${monthLabel(view.months[2])}`;
 const blocks=[
  {type:'header',text:{type:'plain_text',text:'TEST PREVIEW — Revenue HQ',emoji:true}},
  {type:'context',elements:[{type:'mrkdwn',text:`*Actual selected HQ view* · ${period}\n${filters}\nCaptured: ${timestamp(view.capturedAt)} · Salesforce sync: ${timestamp(view.lastSyncAt)}`}]},
  {type:'section',fields:[...(view.portfolioForecast===undefined?[]:[field('Total Salesforce Forecast',money(cents(view.portfolioForecast)))]),field('Quarter Salesforce Forecast',money(sums.current)),field('Delivered Revenue',money(sums.delivered)),field('Remaining Revenue',money(sums.remaining))]},
  {type:'divider'},
  section('*Recorded Salesforce forecast changes — past 24 hours*\nWithin this selected HQ view. These are changes captured by sync history; working drafts are excluded.'),
  {type:'section',fields:[field('Increases',signed(increases)),field('Decreases',signed(decreases)),field('Net change',signed(increases+decreases))]},
 ];
 for(const r of changes.slice(0,10))blocks.push(section(`*${r.delta>0?'↑ Increase':'↓ Decrease'} · ${safe(r.account)}*\n${opportunityLink(r)}\n*Revenue month:* ${monthLabel(r.month)}\n*Before:* ${money(r.beforeCents)} → *After:* ${money(r.afterCents)}\n*Change: ${signed(r.delta)}*`));
 if(!changes.length)blocks.push(section('No recorded Salesforce forecast changes in the past 24 hours match this view.'));
 if(changes.length>10)blocks.push(section(`Showing 10 of ${changes.length} changed opportunity-months. Change totals include all ${changes.length}.`));
 blocks.push({type:'divider'},section(`*Current opportunities — ${rows.length} in this view*`));
 for(const r of rows.slice(0,8))blocks.push(section(`*${safe(r.account)}* · ${opportunityLink(r)}\nSalesforce ${money(r.currentCents)} · Delivered ${money(r.deliveredCents)} · Remaining ${money(r.remainingCents)}`));
 if(rows.length>8)blocks.push(section(`Showing the first 8 of ${rows.length} opportunities in HQ order. KPI totals include all ${rows.length}; open the Hub for the full table.`));
 if(!rows.length)blocks.push(section('No opportunities match the selected HQ filters.'));
 blocks.push({type:'actions',elements:[{type:'button',text:{type:'plain_text',text:'Open Revenue HQ'},url:'https://avani-media.github.io/Intelligence-Hub/',action_id:'open_revenue_hq_preview'}]},{type:'context',elements:[{type:'mrkdwn',text:'Test preview using your signed-in HQ snapshot · No Salesforce edits · No recurring schedule enabled.'}]});
 return {text:`TEST PREVIEW — actual Revenue HQ view: ${period}. Forecast ${money(sums.current)}, delivered ${money(sums.delivered)}, remaining ${money(sums.remaining)}. Recorded net change ${signed(increases+decreases)}. Daily digest disabled.`,blocks,unfurl_links:false,unfurl_media:false};
}
