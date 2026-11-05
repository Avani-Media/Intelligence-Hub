;(()=>{
'use strict';
const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const keyFor=(cid,publisher)=>'sf_delivery_link:'+encodeURIComponent(String(cid))+':'+norm(publisher);
function dateKey(value){const text=String(value||'').trim();if(/^\d{4}-\d{2}-\d{2}/.test(text))return text.slice(0,10);const m=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);return m?`${m[3].length===2?'20':''}${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`:'';}
function campaignRows(campaigns,schedules,date){
 const map=new Map();
 for(const c of campaigns){const start=dateKey(c['Start Date']),end=dateKey(c['End Date']);if(!start||!end||date<start||date>end)continue;
  const pubs=Array.isArray(c.PublisherBreakdown)?c.PublisherBreakdown:[];
  for(const p of pubs){const publisher=p.Publisher??p.publisher,cid=String(c.CID||'').trim();if(!cid||!publisher||norm(publisher)==='unspecified')continue;
   const key=keyFor(cid,publisher),days=[...new Set(schedules.filter(s=>String(s.cid)===cid&&norm(s.publisher)===norm(publisher)).map(s=>s.client_delivery_day).filter(Boolean))].sort();
   map.set(key,{key,cid,publisher,account:c.Advertiser||'',campaign:c['Campaign Name']||'',start,end,day:days.join(' / ')||'Not set'});
  }
 }
 return [...map.values()].sort((a,b)=>a.account.localeCompare(b.account)||a.campaign.localeCompare(b.campaign)||a.publisher.localeCompare(b.publisher));
}
// Explicit publisher aliases; no fuzzy company or publisher matching.
const publisherKey=value=>({infusemedia:'infuse',accountmedia:'accountmedia',technologyadvice:'technologyadvice',salesboxai:'salesboxai'}[norm(value)]||norm(value));
function programEvidence(value){
 const text=String(value||'').toLowerCase().replace(/hand[ -]?raiser/g,' handraiser ').replace(/[^a-z0-9]+/g,' ');
 const services=[[/\b(cs|syndication)\b/,'cs'],[/\b(handraiser|mql|hr)\b/,'hr'],[/\bwebinar\b/,'webinar'],[/\b(paid[ -]media|linkedin|6sense)\b/,'pm']].filter(([re])=>re.test(text)).map(([,key])=>key);
 const region=[[/\b(us|usa|nam|amer|north america)\b/,'nam'],[/\b(apj|apac|au|australia)\b/,'apj'],[/\bemea\b/,'emea'],[/\b(fr|french|france)\b/,'fr'],[/\b(uk|united kingdom)\b/,'uk'],[/\b(de|german|germany)\b/,'de']].filter(([re])=>re.test(text)).map(([,key])=>key);
 const segment=[...text.matchAll(/\b(named|core)\b/g)].map(m=>m[1]);
 const quarters=[...text.matchAll(/\bq([1-4])/g)].map(m=>m[1]);
 const cqs=[...text.matchAll(/\b(\d+)\s*cqs?\b/g)].map(m=>m[1]);
 const touches=[...text.matchAll(/\b(single|one|1|double|two|2)\s*touch\b/g)].map(m=>['single','one','1'].includes(m[1])?'1':'2');
 return {cqs:[...new Set(cqs)].sort().join('|'),touches:[...new Set(touches)].sort().join('|'),services:[...new Set(services)],region:[...new Set(region)].sort().join('|'),segment:[...new Set(segment)].sort().join('|'),quarters:[...new Set(quarters)].sort().join('|')};
}
function autoLinks(rows,saved,partners,date){
 const links={...saved};
 for(const row of rows){
  if(Object.prototype.hasOwnProperty.call(saved,row.key))continue;
  const source=programEvidence(row.campaign),start=dateKey(row.start),end=dateKey(row.end);
  if(!start||!end||source.services.length!==1)continue;
  const candidates=partners.filter(p=>{
   if(norm(row.account)!==norm(p.account)||publisherKey(row.publisher)!==publisherKey(p.publisher))return false;
   const ps=dateKey(p.start),pe=dateKey(p.end);if(!ps||!pe||date<ps||date>pe)return false;
   const a=Date.parse(start),b=Date.parse(end),c=Date.parse(ps),d=Date.parse(pe),day=86400000;
   const overlap=Math.max(0,Math.min(b,d)-Math.max(a,c)+day),span=Math.max(b-a+day,d-c+day);
   if(Math.abs(a-c)>14*day||Math.abs(b-d)>45*day||overlap/span<.6)return false;
   const target=programEvidence(p.program+' '+p.name);
   if(target.services.length!==1||source.services[0]!==target.services[0])return false;
   if(source.region!==target.region||source.segment!==target.segment)return false;
   if(source.quarters&&target.quarters&&source.quarters!==target.quarters)return false;
   if(source.cqs&&target.cqs&&source.cqs!==target.cqs)return false;
   if(source.touches&&target.touches&&source.touches!==target.touches)return false;
   return true;
  });
  if(candidates.length===1)links[row.key]={partnerId:candidates[0].id,source:'auto'};
 }
 return links;
}
function verifyRows(rows,links,partners,deliveries,date){
 const byId=new Map(partners.map(p=>[p.id,p])),counts=new Map(),seen=new Set(),byPartner=new Map();
 // Count all saved links, including campaigns outside the visible date window.
 for(const link of Object.values(links)){if(link?.partnerId)counts.set(link.partnerId,(counts.get(link.partnerId)||0)+1)}
 for(const d of deliveries){if(d.date!==date||!d.id||seen.has(d.id))continue;seen.add(d.id);const list=byPartner.get(d.partnerId)||[];list.push(d);byPartner.set(d.partnerId,list)}
 return rows.map(r=>{const partner=byId.get(links[r.key]?.partnerId);if(!partner)return {...r,status:'link',volume:null,partner:null};const ds=byPartner.get(partner.id)||[],unknown=ds.some(d=>d.volume===null||!Number.isFinite(d.volume)),volume=ds.reduce((t,d)=>t+(Number(d.volume)||0),0);return {...r,partner,linkSource:links[r.key]?.source||'manual',volume:unknown?null:volume,recordIds:ds.map(d=>d.id),status:counts.get(partner.id)>1?'shared':!ds.length?'missing':unknown?'unknown':volume===0?'zero':volume>0?'recorded':'adjustment'};});
}
function fullyDelivered(row){const p=row.partner;return !!p&&typeof p.programVolume==='number'&&Number.isFinite(p.programVolume)&&p.programVolume>0&&typeof p.programDelivered==='number'&&Number.isFinite(p.programDelivered)&&p.programDelivered>=p.programVolume;}
function visibleCampaignRows(rows,showComplete=false){return showComplete?rows:rows.filter(row=>!fullyDelivered(row));}
function partnerLinkMarkup(partner){return `<a class="sdv-partner-number" href="https://avanimedia.lightning.force.com/lightning/r/Program_Partner__c/${encodeURIComponent(partner.id)}/view" target="_blank" rel="noopener noreferrer" title="Open Salesforce program partner">${esc(partner.number||partner.name)} ↗</a>`;}
function canRecordDelivery(row,allowed){return !!allowed&&row.status==='missing'&&!!row.partner?.id&&!fullyDelivered(row);}
function recordDeliveryDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function canManageDelivery(row,allowed){return !!allowed&&!!row.partner?.id&&!!row.recordIds?.length&&row.status!=='shared';}
function amNumberMatches(row,query){const term=norm(query);if(!term)return true;const number=String(row.partner?.number||'');return /^AM\s*-\s*\d+$/i.test(number)&&norm(number).includes(term);}
function filterVerificationRows(rows,{client='',status='',search=''}={}){return rows.filter(r=>(!client||r.account===client)&&(!status||r.status===status)&&amNumberMatches(r,search));}
function csvAmNumber(value){const m=String(value??'').trim().match(/^(?:AM\s*-?\s*)?(\d+)$/i);return m?'AM - '+m[1].replace(/^0+(?=\d)/,''):'';}
function parseDeliveryCsv(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>262144)throw Error('Choose a CSV file up to 256 KiB.');
 text=text.replace(/^\ufeff/,'');const grid=[];let row=[],cell='',quoted=false,closed=false;
 const field=()=>{row.push(cell);cell='';closed=false};
 const line=()=>{field();if(row.some(v=>v.trim()))grid.push(row);row=[];if(grid.length>101)throw Error('Use at most 100 delivery rows per upload.');};
 for(let i=0;i<text.length;i++){
  const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=c;continue;}
  if(c===','){field();continue}if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;line();continue}
  if(closed){if(c===' '||c==='\t')continue;throw Error('Invalid CSV: unexpected text after a quoted value.');}
  if(c==='"'){if(cell.length)throw Error('Invalid CSV quoting.');quoted=true}else cell+=c;
 }
 if(quoted)throw Error('Invalid CSV: a quoted value was not closed.');if(cell.length||row.length||closed)line();
 if(grid.length<2)throw Error('Include a header and at least one delivery row.');
 const headers=grid.shift().map(norm),am=headers.indexOf('amnumber'),countHeaders=['leadsdelivered','numberofleads','leadcount','leads'];
 const counts=headers.map((h,i)=>countHeaders.includes(h)?i:-1).filter(i=>i>=0);
 if(am<0||headers.filter(h=>h==='amnumber').length!==1||counts.length!==1)throw Error('Use the columns AM Number and Leads Delivered, with each header appearing once.');
 const rows=grid.map((cells,i)=>{if(cells.length!==headers.length)throw Error(`CSV row ${i+2} has a different number of columns from the header.`);const rawNumber=cells[am].trim(),number=csvAmNumber(rawNumber),rawVolume=cells[counts[0]].trim(),valid=/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(rawVolume),volume=valid?Number(rawVolume.replace(/,/g,'')):NaN,errors=[];
  if(!number)errors.push('Enter a complete AM number.');if(!Number.isSafeInteger(volume)||volume<1||volume>1000000)errors.push('Leads must be a whole number from 1 to 1,000,000.');
  return {line:i+2,rawNumber,number,volume:Number.isFinite(volume)?volume:null,errors,status:'unreviewed'};
 });
 const seen=new Map();for(const r of rows)if(r.number)seen.set(r.number,(seen.get(r.number)||0)+1);
 for(const r of rows)if(seen.get(r.number)>1)r.errors.push('Repeated AM number in this file. Combine it into one row.');return rows;
}
function buildDeliveryCsvPreview(text,data,date){
 if(data?.date!==date||!Array.isArray(data.partners)||!Array.isArray(data.deliveries))throw Error('A complete live Salesforce check is required for this date.');
 const rows=parseDeliveryCsv(text),byNumber=new Map(),groups=new Map();
 for(const p of data.partners){const key=csvAmNumber(p.number);if(key){const list=byNumber.get(key)||[];if(!list.some(v=>v.id===p.id))list.push(p);byNumber.set(key,list)}}
 for(const r of rows){
  const matches=byNumber.get(r.number)||[];if(matches.length!==1){r.errors.push(matches.length?'Multiple Salesforce partners use this AM number. Review the link.':'AM number was not found for this date.');continue}
  const p=r.partner=matches[0];
  if(!p.programId||!p.start||!p.end||date<p.start||date>p.end)r.errors.push('The delivery date is outside this Salesforce program.');
  if(data.deliveries.some(d=>d.partnerId===p.id&&d.date===date))r.errors.push('A Salesforce delivery entry already exists for this date.');
  if(typeof p.programVolume!=='number'||!Number.isFinite(p.programVolume)||p.programVolume<=0||typeof p.programDelivered!=='number'||!Number.isFinite(p.programDelivered)||p.programDelivered<0)r.errors.push('Salesforce remaining volume could not be verified.');
  else{r.remaining=Math.max(0,p.programVolume-p.programDelivered);if(!r.remaining)r.errors.push('This Salesforce program is fully delivered.');}
  if(!r.errors.length){const g=groups.get(p.programId)||[];g.push(r);groups.set(p.programId,g)}
 }
 for(const group of groups.values()){const total=group.reduce((s,r)=>s+r.volume,0),remaining=Math.min(...group.map(r=>r.remaining));if(total>remaining)for(const r of group)r.errors.push(`This file requests ${total.toLocaleString('en-US')} leads for the program; only ${remaining.toLocaleString('en-US')} remain.`);}
 for(const r of rows)r.status=r.errors.length?'blocked':'pending';return rows;
}
async function runDeliveryCsvRows(rows,call,onProgress=()=>{},shouldStop=()=>false){
 let halt=false;
 const definite=new Set(['DELIVERY_EXISTS','DRAFT_EXPIRED','PREVIOUS_ATTEMPT','INVALID_DATE','INVALID_VOLUME','INVALID_PARTNER','PARTNER_CHANGED','CSV_PARTNER_CHANGED','VOLUME_EXCEEDED','VOLUME_UNAVAILABLE','PROGRAM_DATE','SF_REJECTED','SF_CREATE_NOT_ALLOWED']);
 for(const row of rows){if(row.status!=='ready')continue;
  if(halt||shouldStop()){row.status='not_attempted';row.message='Not attempted. Review a new upload before recording.';onProgress();continue}
  row.status='recording';onProgress();
  try{const result=await call({action:'submit',requestId:row.requestId});
   if(result?.status!=='recorded'||!/^a00(?:[A-Za-z0-9]{12}|[A-Za-z0-9]{15})$/.test(result.deliveryId))throw Object.assign(Error('Salesforce did not confirm the result. Check Salesforce before recording again.'),{code:'UNCONFIRMED'});
   row.status='recorded';row.deliveryId=result.deliveryId;row.message=result.auditRecorded===false?'Recorded in Salesforce; Hub audit confirmation is pending.':'Recorded in Salesforce.';if(result.auditRecorded===false)halt=true;
  }catch(error){row.status=definite.has(error.code)?'failed':'uncertain';row.message=error.message||'Check Salesforce before recording again.';if(row.status==='uncertain')halt=true;}
  onProgress();
 }return rows;
}
function deliveryCsvResults(rows,date){const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';return [['AM Number','Leads Delivered','Delivery Date','Client','Program','Publisher','Status','Salesforce Delivery ID','Details'],...rows.map(r=>[r.number||r.rawNumber,r.volume,date,r.partner?.account,r.partner?.program,r.partner?.publisher,r.status,r.deliveryId,r.message||r.errors?.join(' ')])].map(r=>r.map(cell).join(',')).join('\r\n');}
function deliveryCsvTemplate(rows){
 const seen=new Set(),eligible=rows.filter(r=>{const n=csvAmNumber(r.partner?.number);if(!n||r.status!=='missing'||fullyDelivered(r)||seen.has(n))return false;seen.add(n);return true});
 if(!eligible.length)throw Error('No eligible campaign rows match the current date and filters.');
 const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
 return [['AM Number','Leads Delivered','Client','Campaign','Publisher'],...eligible.map(r=>[csvAmNumber(r.partner.number),'',r.account,r.campaign,r.publisher])].map(r=>r.map(cell).join(',')).join('\r\n');
}
if(typeof module!=='undefined'&&module.exports){module.exports={campaignRows,verifyRows,dateKey,autoLinks,visibleCampaignRows,partnerLinkMarkup,canRecordDelivery,recordDeliveryDate,canManageDelivery,amNumberMatches,filterVerificationRows,parseDeliveryCsv,buildDeliveryCsvPreview,runDeliveryCsvRows,deliveryCsvResults,deliveryCsvTemplate};return;}
if(window.__avaniSalesforceDeliveryVerification)return;window.__avaniSalesforceDeliveryVerification=true;
const VIEW='sf-delivery-verification',ID=VIEW+'-view';
const labels={link:'Needs confirmation',recorded:'Recorded in SF',missing:'No SF record found',zero:'Record found — zero leads',shared:'Shared SF partner — review',unknown:'Record found — check volume',adjustment:'Adjustment recorded'};
const state={date:recordDeliveryDate(),showComplete:false,canRecord:false,writerUnavailable:false,lastCreated:null,search:'',client:'',status:'',loading:false,saving:false,error:'',notice:'',data:null,rows:[],links:{},loadId:0};
const root=()=>document.getElementById(ID);
const fmt=v=>v===null?'—':Number(v).toLocaleString('en-US');
const stamp=v=>new Date(v).toLocaleString('en-US',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'});
function render(){const el=root();if(!el)return;const allVerified=state.data?verifyRows(state.rows,autoLinks(state.rows,state.links,state.data.partners,state.date),state.data.partners,state.data.deliveries,state.date):[];const verified=visibleCampaignRows(allVerified,state.showComplete),clientRows=filterVerificationRows(verified,{client:state.client}),hiddenCount=filterVerificationRows(allVerified,{client:state.client}).length-clientRows.length;const clients=[...new Set([...allVerified.map(r=>r.account),state.client].filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const shown=filterVerificationRows(clientRows,{status:state.status,search:state.search});
 el.innerHTML=`<div class="sdv-shell"><header class="sdv-head"><div><h2>Salesforce Partner Delivery</h2><p>Manage content syndication delivery entries in Salesforce: check recorded leads, add deliveries, and edit or delete entries.</p></div><div class="sdv-header-actions">${state.data?`<button id="sdvDownloadTemplate" ${state.loading||state.saving?'disabled':''}>Download Delivery Template</button>${state.canRecord?`<button id="sdvUploadCsv" class="sdv-upload-button" ${state.loading||state.saving?'disabled':''}>Upload Delivery CSV</button>`:''}`:''}<button id="sdvRefresh" ${state.loading||state.saving?'disabled':''}>${state.loading?'Checking Salesforce…':'Refresh Salesforce'}</button></div></header><p class="sdv-info">Scheduled Client Delivery Day is a planning reference and may change. A missing SF record does not prove that delivery was due.</p><div class="sdv-toolbar"><label class="sdv-date-filter"><span>Delivery date</span><input id="sdvDate" type="date" min="2026-01-01" value="${state.date}" ${state.saving?'disabled':''}></label><label>AM number search<input id="sdvSearch" type="search" placeholder="Search AM number, e.g. AM - 15773" value="${esc(state.search)}"></label><label>Client<select id="sdvClient"><option value="">All clients</option>${clients.map(client=>`<option value="${esc(client)}" ${client===state.client?'selected':''}>${esc(client)}</option>`).join('')}</select></label><label>Status<select id="sdvStatus"><option value="">All statuses</option>${Object.entries(labels).map(([v,l])=>`<option value="${v}" ${state.status===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="sdv-completed-filter"><input id="sdvShowComplete" type="checkbox" ${state.showComplete?'checked':''}>Show fully delivered campaigns</label></div><div id="sdvNotice" role="status">${esc(state.notice)}${state.lastCreated?` <a href="https://avanimedia.lightning.force.com/lightning/r/Partner_Delivery__c/${encodeURIComponent(state.lastCreated)}/view" target="_blank" rel="noopener noreferrer">View recorded delivery ↗</a>`:""}</div>${state.writerUnavailable?'<p>Recording is temporarily unavailable; delivery verification is still available.</p>':''}${state.error?`<div class="sdv-error" role="alert">${esc(state.error)}</div>`:''}${state.loading?'<p class="sdv-empty" role="status">Checking Salesforce and loading campaign schedules…</p>':state.data?`<p class="sdv-check-time">Checked live: ${esc(stamp(state.data.checkedAt))} Manila · Delivery date: ${state.date} · Showing ${shown.length} of ${clientRows.length}${!state.showComplete&&hiddenCount?` · ${hiddenCount} fully delivered campaign/publisher rows hidden`:""}</p><div class="sdv-table-wrap"><table><thead><tr><th>Client</th><th>Campaign / CID</th><th>Publisher</th><th>Scheduled Client Delivery Day</th><th>Leads recorded in SF</th><th>Status</th><th>Salesforce program partner</th></tr></thead><tbody>${shown.length?shown.map(rowMarkup).join(''):'<tr><td colspan="7" class="sdv-empty">No campaigns match this date and filters.</td></tr>'}</tbody></table></div><p class="sdv-foot">Counts reflect the linked Salesforce program partner on the selected delivery date, including zero-volume and adjustment records. “No SF record found” means the live check found no matching delivery record. Clear matches are linked automatically using client, publisher, service, region/segment and campaign dates. Manual links take priority; ambiguous and shared matches require confirmation. Completed programs are hidden using current Salesforce total volume across all delivery dates; enable Show fully delivered campaigns to review past entries.</p>`:''}</div>`;
 el.querySelector('#sdvRefresh').addEventListener('click',load);
 el.querySelector('#sdvDownloadTemplate')?.addEventListener('click',downloadCurrentDeliveryTemplate);
 el.querySelector('#sdvUploadCsv')?.addEventListener('click',openCsv);
 el.querySelector('#sdvDate').addEventListener('change',e=>{if(!e.target.value)return;state.date=e.target.value;load()});
 el.querySelector('#sdvSearch').addEventListener('input',e=>{const input=e.target,start=input.selectionStart;state.search=input.value;render();const next=root().querySelector('#sdvSearch');next.focus();next.setSelectionRange(start,start)});
 el.querySelector('#sdvShowComplete').addEventListener('change',e=>{state.showComplete=e.target.checked;render()});
 el.querySelector('#sdvClient').addEventListener('change',e=>{state.client=e.target.value;render()});
 el.querySelector('#sdvStatus').addEventListener('change',e=>{state.status=e.target.value;render()});
 el.querySelectorAll('[data-sdv-manage]').forEach(b=>b.addEventListener('click',()=>openManage(b.dataset.sdvManage)));
 el.querySelectorAll('[data-sdv-record]').forEach(b=>b.addEventListener('click',()=>openRecord(b.dataset.sdvRecord)));
 el.querySelectorAll('[data-sdv-link]').forEach(b=>b.addEventListener('click',()=>openLink(b.dataset.sdvLink)));
}
function rowMarkup(r){return `<tr><td>${esc(r.account)}</td><td><strong>${esc(r.campaign)}</strong><small>CID ${esc(r.cid)}</small>${fullyDelivered(r)?`<small>Fully delivered in SF · ${fmt(r.partner.programDelivered)} / ${fmt(r.partner.programVolume)}</small>`:""}</td><td>${esc(r.publisher)}</td><td><span class="sdv-day">${esc(r.day)}</span></td><td class="sdv-number">${fmt(r.volume)}</td><td><span class="sdv-status sdv-${r.status}">${labels[r.status]}</span>${r.status==='shared'?'<small>Partner total may span multiple linked campaigns.</small>':''}</td><td><div class="sdv-partner-actions">${r.partner?`${partnerLinkMarkup(r.partner)}`:''}<button class="sdv-link-control" title="${r.partner?'Change Salesforce partner link':'Review Salesforce partner link'}" aria-label="${r.partner?'Change Salesforce partner link':'Review Salesforce partner link'}" data-sdv-link="${esc(r.key)}" ${state.saving?'disabled':''}>${r.partner?'↔':'Review link'}</button>${canRecordDelivery(r,state.canRecord)?`<button class="sdv-record-button" data-sdv-record="${esc(r.key)}" ${state.saving?'disabled':''}>Record Delivery</button>`:''}${canManageDelivery(r,state.canRecord)?`<button data-sdv-manage="${esc(r.key)}" ${state.saving?'disabled':''}>Manage entries</button>`:''}</div></td></tr>`}
async function allRows(client,table,columns,order,configure=q=>q){let out=[];for(let from=0;from<100000;from+=1000){const {data,error}=await configure(client.from(table).select(columns).order(order,{ascending:true})).range(from,from+999);if(error)throw error;out.push(...(data||[]));if((data||[]).length<1000)return out;}throw Error('Too many rows to verify completely.');}
async function load(){if(state.saving)return;const requestId=++state.loadId,date=state.date;state.loading=true;state.data=null;state.error='';state.notice='';state.lastCreated=null;render();
 try{const sb=window.avaniSupabase;if(!sb)throw Error('Please sign in to the Hub.');const [snapshot,schedules,settings,capabilities]=await Promise.all([
 sb.from('dashboard_snapshots').select('payload').eq('dataset','performance').single(),
 allRows(sb,'syndication_delivery_schedule_current','contract_key,cid,publisher,client_delivery_day','contract_key'),
 allRows(sb,'hub_settings','setting_key,setting_value','setting_key',q=>q.like('setting_key','sf_delivery_link:%')),
 sb.functions.invoke('salesforce-record-delivery',{body:{action:'capabilities'}}).catch(()=>({error:true}))
 ]);if(requestId!==state.loadId)return;const links=Object.fromEntries(settings.map(r=>[r.setting_key,typeof r.setting_value==='string'?JSON.parse(r.setting_value):r.setting_value]));const partnerIds=[...new Set(Object.values(links).map(l=>l?.partnerId).filter(Boolean))];const result=await sb.functions.invoke('salesforce-delivery-verification',{body:{date,partnerIds}});if(requestId!==state.loadId)return;if(snapshot.error)throw snapshot.error;if(result.error)throw Error('Salesforce could not be checked. Please refresh or sign in again.');if(!result.data?.ok||result.data.date!==date||!Array.isArray(result.data.partners)||!Array.isArray(result.data.deliveries))throw Error(result.data?.error||'Salesforce returned an incomplete response.');
 if(!Array.isArray(snapshot.data?.payload))throw Error('Campaign source is unavailable.');
 state.canRecord=!capabilities.error&&capabilities.data?.canRecord===true;state.writerUnavailable=!!capabilities.error;state.rows=campaignRows(snapshot.data.payload,schedules,date);state.links=links;state.data=result.data;
 }catch(error){if(requestId===state.loadId){state.data=null;state.error=error.message||'Verification could not be completed.'}}finally{if(requestId===state.loadId){state.loading=false;render()}}
}
async function writerCall(body){
 const {data,error}=await window.avaniSupabase.functions.invoke('salesforce-record-delivery',{body});
 if(error){let detail=null;try{detail=await error.context?.json?.()}catch{}throw Object.assign(new Error(detail?.error||'Salesforce did not confirm the result. Refresh verification and check Salesforce before recording again.'),{code:detail?.code||'UNCONFIRMED'});}
 if(!data?.ok)throw Object.assign(new Error(data?.error||'Salesforce did not confirm the result.'),{code:data?.code||'UNCONFIRMED'});
 return data;
}
function downloadDeliveryCsv(contents,filename){const url=URL.createObjectURL(new Blob(['\ufeff',contents],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function downloadCurrentDeliveryTemplate(){
 if(!state.data||state.loading||state.saving)return;
 try{const links=autoLinks(state.rows,state.links,state.data.partners,state.date),rows=filterVerificationRows(verifyRows(state.rows,links,state.data.partners,state.data.deliveries,state.date),{client:state.client,status:state.status,search:state.search});downloadDeliveryCsv(deliveryCsvTemplate(rows),`salesforce-delivery-template-${state.date}.csv`);state.notice='Template downloaded for the selected date and filters. Fill in Leads Delivered; remove any rows you are not recording.';}
 catch(error){state.notice=error.message;}render();
}
function closeCsv(){if(!state.saving)document.getElementById('sdvCsvDialog')?.close();}
function openCsv(){
 if(state.saving||!state.canRecord||!state.data)return;closeRecord();closeLink();closeManage();closeCsv();
 const dialog=document.createElement('dialog');dialog.id='sdvCsvDialog';dialog.className='sdv-dialog sdv-csv-dialog';
 dialog.innerHTML=`<h3>Upload Delivery CSV</h3><p>Record delivery entries for one date using exact AM numbers. Uploading and reviewing will not create Salesforce delivery entries.</p><div id="sdvCsvInputs" class="sdv-csv-inputs"><label>Delivery date (Eastern Time)<input id="sdvCsvDate" type="date" required min="2026-01-01" max="${recordDeliveryDate()}" value="${recordDeliveryDate()}"></label><label>Delivery CSV<input id="sdvCsvFile" type="file" accept=".csv,text/csv"></label></div><p>Columns: <strong>AM Number</strong> and <strong>Leads Delivered</strong>. Up to 100 rows / 256 KiB. One row per AM number; positive whole lead counts.</p><div class="sdv-csv-tools"><button id="sdvCsvTemplate" type="button">Download Delivery Template</button><button id="sdvCsvReview" type="button">Review CSV</button><button id="sdvCsvReset" type="button" hidden>Change file or date</button></div><p id="sdvCsvMessage" role="status" aria-live="polite">The template uses the main table’s selected date and filters. The upload date above applies to every CSV row.</p><div id="sdvCsvTable"></div><label id="sdvCsvConfirmation" class="sdv-record-confirm" hidden><input id="sdvCsvConfirm" type="checkbox"><span id="sdvCsvConfirmText"></span></label><div class="sdv-dialog-actions"><button id="sdvCsvExport" type="button" hidden>Download results</button><button id="sdvCsvStop" type="button" hidden>Stop after current row</button><button id="sdvCsvClose" type="button">Close</button><button id="sdvCsvRecord" type="button" hidden disabled>Record All</button></div>`;
 document.body.appendChild(dialog);dialog.showModal();
 let rows=[],batchDate='',phase='input',stop=false,submitted=false;
 const $=id=>dialog.querySelector('#'+id),message=$('sdvCsvMessage'),review=$('sdvCsvReview'),record=$('sdvCsvRecord'),dateInput=$('sdvCsvDate'),fileInput=$('sdvCsvFile'),confirm=$('sdvCsvConfirm');
 const unload=e=>{if(state.saving){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',unload);
 dialog.addEventListener('cancel',e=>{if(state.saving)e.preventDefault()});
 dialog.addEventListener('close',()=>{window.removeEventListener('beforeunload',unload);dialog.remove();if(submitted){state.date=batchDate;load()}},{once:true});
 const statusLabels={blocked:'Needs attention',pending:'Checking',ready:'Ready',recording:'Recording…',recorded:'Recorded',failed:'Not recorded',uncertain:'Check Salesforce',not_attempted:'Not attempted'};
 function showRows(){
  $('sdvCsvTable').innerHTML=rows.length?`<div class="sdv-csv-table-wrap"><table><thead><tr><th>Row / AM number</th><th>Client / Salesforce program</th><th>Publisher</th><th>Leads</th><th>Result</th></tr></thead><tbody>${rows.map(r=>`<tr><td><small>CSV row ${r.line}</small><strong>${esc(r.number||r.rawNumber)}</strong></td><td>${esc(r.partner?.account||'—')}<small>${esc(r.partner?.program||'')}</small></td><td>${esc(r.partner?.publisher||'—')}</td><td>${fmt(r.volume)}</td><td><span class="sdv-csv-status sdv-csv-${r.status}">${statusLabels[r.status]||esc(r.status)}</span><small>${esc(r.message||r.errors.join(' '))}</small>${r.deliveryId?`<a href="https://avanimedia.lightning.force.com/lightning/r/Partner_Delivery__c/${encodeURIComponent(r.deliveryId)}/view" target="_blank" rel="noopener noreferrer">View SF entry ↗</a>`:''}</td></tr>`).join('')}</tbody></table></div>`:'';
 }
 function freeze(value){dateInput.disabled=value;fileInput.disabled=value;review.disabled=value;$('sdvCsvTemplate').disabled=value;$('sdvCsvClose').disabled=value;}
 function reset(){if(state.saving||phase==='done')return;rows=[];batchDate='';phase='input';confirm.checked=false;$('sdvCsvConfirmation').hidden=true;record.hidden=true;review.hidden=false;$('sdvCsvReset').hidden=true;$('sdvCsvExport').hidden=true;dateInput.disabled=false;fileInput.disabled=false;showRows();message.textContent='Choose the date and completed CSV, then review.';}
 dateInput.addEventListener('change',reset);fileInput.addEventListener('change',reset);
 $('sdvCsvReset').addEventListener('click',reset);$('sdvCsvClose').addEventListener('click',closeCsv);$('sdvCsvTemplate').addEventListener('click',downloadCurrentDeliveryTemplate);
 $('sdvCsvExport').addEventListener('click',()=>downloadDeliveryCsv(deliveryCsvResults(rows,batchDate),`salesforce-delivery-results-${batchDate}.csv`));
 confirm.addEventListener('change',()=>{record.disabled=!confirm.checked||phase!=='review'});
 $('sdvCsvStop').addEventListener('click',()=>{stop=true;$('sdvCsvStop').disabled=true;message.textContent='Stopping after the current row. Completed entries will remain recorded.'});
 review.addEventListener('click',async()=>{
  if(state.saving||phase!=='input')return;
  if(!dateInput.reportValidity())return;const file=fileInput.files?.[0];if(!file){message.textContent='Choose your completed CSV file first.';return}if(file.size>262144){message.textContent='Choose a CSV file up to 256 KiB.';return}
  state.saving=true;freeze(true);render();message.textContent='Checking the CSV against live Salesforce data…';batchDate=dateInput.value;
  try{
   const text=await file.text();parseDeliveryCsv(text);
   const {data,error}=await window.avaniSupabase.functions.invoke('salesforce-delivery-verification',{body:{date:batchDate}});
   if(error||!data?.ok)throw Error('Salesforce could not be checked. Refresh or sign in again.');
   rows=buildDeliveryCsvPreview(text,data,batchDate);showRows();
   for(const row of rows){if(row.status!=='pending')continue;
    message.textContent=`Preparing CSV row ${row.line} for review…`;
    try{const draft=await writerCall({action:'prepare',source:'csv',partnerId:row.partner.id,expectedNumber:row.number,date:batchDate,volume:row.volume});const r=draft.review;
     if(draft.status!=='review'||!draft.requestId||r?.partnerId!==row.partner.id||r.date!==batchDate||r.volume!==row.volume||csvAmNumber(r.number)!==row.number||r.csvNumber!==row.number)throw Error('Salesforce review did not match this CSV row. Upload and review again.');
     row.requestId=draft.requestId;row.expiresAt=draft.expiresAt;row.partner={...row.partner,...r};row.status='ready';row.message='Ready for your confirmation.';
    }catch(error){row.status='blocked';row.errors.push(error.message);}
    showRows();
   }
   phase='review';const ready=rows.filter(r=>r.status==='ready'),blocked=rows.length-ready.length,total=ready.reduce((s,r)=>s+r.volume,0);
   message.textContent=`${ready.length} ready · ${blocked} need attention · ${fmt(total)} leads to record on ${batchDate}. No Salesforce delivery entries have been created.`;
   $('sdvCsvConfirmText').textContent=`I confirm the ${ready.length} ready rows, ${fmt(total)} leads, Salesforce program partners and delivery date ${batchDate}. Rows needing attention will be skipped.`;
   $('sdvCsvConfirmation').hidden=!ready.length;record.hidden=!ready.length;record.textContent=`Record All (${ready.length})`;review.hidden=true;$('sdvCsvReset').hidden=false;$('sdvCsvExport').hidden=false;
  }catch(error){message.textContent=error.message;rows=[];showRows();phase='input';}
  finally{state.saving=false;freeze(false);if(phase==='review'){dateInput.disabled=true;fileInput.disabled=true;}render();}
 });
 record.addEventListener('click',async()=>{
  if(state.saving||phase!=='review'||!confirm.checked)return;
  phase='recording';state.saving=true;submitted=true;freeze(true);render();record.disabled=true;confirm.disabled=true;$('sdvCsvReset').hidden=true;$('sdvCsvExport').hidden=true;$('sdvCsvStop').hidden=false;
  await runDeliveryCsvRows(rows,writerCall,()=>{showRows();message.textContent=`${rows.filter(r=>r.status==='recorded').length} recorded · ${rows.filter(r=>r.status==='recording').length?'Recording next row…':'Checking results…'} Keep this window open until recording finishes.`},()=>stop);
  phase='done';state.saving=false;freeze(false);dateInput.disabled=true;fileInput.disabled=true;record.hidden=true;review.hidden=true;$('sdvCsvTemplate').hidden=true;$('sdvCsvConfirmation').hidden=true;$('sdvCsvStop').hidden=true;$('sdvCsvExport').hidden=false;
  const recorded=rows.filter(r=>r.status==='recorded').length,uncertain=rows.some(r=>r.status==='uncertain'||r.message?.includes('audit confirmation'));
  message.textContent=`Finished: ${recorded} of ${rows.length} rows recorded. ${uncertain?'Check Salesforce for rows needing confirmation before uploading again.':'Review any rows that were not recorded before making a new upload.'} Download results to keep this row-by-row record.`;render();
 });
}
function closeRecord(){if(!state.saving)document.getElementById('sdvRecordDialog')?.remove();}
function openRecord(key){
 if(state.saving||!state.data||!state.canRecord)return;
 const links=autoLinks(state.rows,state.links,state.data.partners,state.date),row=verifyRows(state.rows,links,state.data.partners,state.data.deliveries,state.date).find(r=>r.key===key);
 if(!row||!canRecordDelivery(row,state.canRecord))return;
 closeRecord();closeLink();closeManage();
 const dialog=document.createElement('dialog');dialog.id='sdvRecordDialog';dialog.className='sdv-dialog';
 const maxDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 dialog.innerHTML=`<form id="sdvRecordForm"><h3>Record Delivery in Salesforce</h3><p>${esc(row.account)} · CID ${esc(row.cid)} · Campaign publisher: ${esc(row.publisher)}</p><p>${esc(row.campaign)}</p><div id="sdvRecordFields"><label>Delivery date (Eastern Time)<input id="sdvRecordDate" type="date" min="2026-01-01" max="${maxDate}" required value="${recordDeliveryDate()}"></label><label>Delivered lead count<input id="sdvRecordVolume" type="number" min="1" max="1000000" step="1" required inputmode="numeric" placeholder="Enter delivered leads"></label></div><div id="sdvRecordReview"></div><p id="sdvRecordMessage" role="status">Reviewing will not create a Salesforce record.</p><div class="sdv-dialog-actions"><button id="sdvRecordCancel" type="button">Cancel</button><button id="sdvRecordPrepare" type="submit">Review delivery</button><button id="sdvRecordSubmit" type="button" hidden disabled>Record in Salesforce</button><button id="sdvRecordRefresh" type="button" hidden>Refresh verification</button></div></form>`;
 document.body.appendChild(dialog);dialog.showModal();
 dialog.addEventListener('cancel',e=>{if(state.saving)e.preventDefault()});dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 const cancel=dialog.querySelector('#sdvRecordCancel'),prepare=dialog.querySelector('#sdvRecordPrepare'),submit=dialog.querySelector('#sdvRecordSubmit'),refresh=dialog.querySelector('#sdvRecordRefresh'),message=dialog.querySelector('#sdvRecordMessage');
 let draft=null;
 cancel.addEventListener('click',closeRecord);
 refresh.addEventListener('click',()=>{closeRecord();load()});
 dialog.querySelector('#sdvRecordForm').addEventListener('submit',async e=>{
  e.preventDefault();if(draft||state.saving)return;
  if(!e.target.reportValidity())return;
  state.saving=true;prepare.disabled=true;cancel.disabled=true;message.textContent='Checking Salesforce and preparing your review…';
  try{
   const volume=Number(dialog.querySelector('#sdvRecordVolume').value),date=dialog.querySelector('#sdvRecordDate').value;
   draft=await writerCall({action:'prepare',partnerId:row.partner.id,date,volume});
   const r=draft.review;if(!r||draft.status!=='review'||!draft.requestId)throw Error('The review could not be prepared.');
   dialog.querySelector('#sdvRecordFields').hidden=true;prepare.hidden=true;submit.hidden=false;
   dialog.querySelector('#sdvRecordReview').innerHTML=`<dl class="sdv-record-review"><dt>Salesforce program partner</dt><dd>${esc(r.number||r.partnerId)} · ${esc(r.name)}</dd><dt>Salesforce publisher</dt><dd>${esc(r.publisher)}</dd><dt>Salesforce program</dt><dd>${esc(r.program)}</dd><dt>Delivery date</dt><dd>${esc(r.date)}</dd><dt>Leads to record</dt><dd><strong>${fmt(r.volume)}</strong></dd></dl><label class="sdv-record-confirm"><input id="sdvRecordConfirm" type="checkbox">I confirm this Salesforce program partner, delivery date and lead count are correct.</label>`;
   dialog.querySelector('#sdvRecordConfirm').addEventListener('change',e=>{submit.disabled=!e.target.checked});
   message.textContent='Confirm to create one Partner Delivery record. This does not send leads to the client. Rates are calculated by Salesforce.';
  }catch(error){message.textContent=error.message;prepare.disabled=false;refresh.hidden=false;draft=null;}
  finally{state.saving=false;cancel.disabled=false;}
 });
 submit.addEventListener('click',async()=>{
  if(!draft||state.saving||!dialog.querySelector('#sdvRecordConfirm')?.checked)return;
  state.saving=true;submit.disabled=true;cancel.disabled=true;dialog.querySelector('#sdvRecordConfirm').disabled=true;message.textContent='Saving the confirmed delivery in Salesforce…';
  let result;
  try{result=await writerCall({action:'submit',requestId:draft.requestId});if(result.status!=='recorded'||!/^a00(?:[A-Za-z0-9]{12}|[A-Za-z0-9]{15})$/.test(result.deliveryId))throw Error('Salesforce did not confirm a saved record. Refresh verification and check Salesforce before recording again.');}
  catch(error){message.textContent=error.message;refresh.hidden=false;}
  finally{state.saving=false;cancel.disabled=false;}
  if(result?.status==='recorded'&&/^a00(?:[A-Za-z0-9]{12}|[A-Za-z0-9]{15})$/.test(result.deliveryId)){
   state.date=result.date;closeRecord();await load();state.lastCreated=result.deliveryId;state.notice=`${fmt(result.volume)} leads recorded in Salesforce.${result.auditRecorded===false?' The SF record was saved; its Hub audit confirmation is pending.':''}`;render();
  }
 });
}
function closeManage(){if(!state.saving)document.getElementById('sdvManageDialog')?.remove();}
async function openManage(key){
 if(state.saving||!state.canRecord||!state.data)return;
 const links=autoLinks(state.rows,state.links,state.data.partners,state.date),row=verifyRows(state.rows,links,state.data.partners,state.data.deliveries,state.date).find(r=>r.key===key);
 if(!row||!canManageDelivery(row,state.canRecord))return;
 closeRecord();closeLink();closeManage();
 const dialog=document.createElement('dialog');dialog.id='sdvManageDialog';dialog.className='sdv-dialog';
 dialog.innerHTML=`<h3>Manage Salesforce delivery entries</h3><p>${esc(row.account)} · CID ${esc(row.cid)} · ${esc(row.publisher)}</p><p>${esc(row.campaign)}</p><div id="sdvManageContent"></div><p id="sdvManageMessage" role="status">Loading individual Salesforce entries…</p><div class="sdv-dialog-actions"><button type="button" id="sdvManageBack" hidden>Back to entries</button><button type="button" id="sdvManageRefresh" hidden>Refresh verification</button><button type="button" id="sdvManageClose">Close</button></div>`;
 document.body.appendChild(dialog);dialog.showModal();
 dialog.addEventListener('cancel',e=>{if(state.saving)e.preventDefault()});dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 const content=dialog.querySelector('#sdvManageContent'),message=dialog.querySelector('#sdvManageMessage'),back=dialog.querySelector('#sdvManageBack'),close=dialog.querySelector('#sdvManageClose'),refresh=dialog.querySelector('#sdvManageRefresh');
 let records=[];
 const busy=value=>{state.saving=value;close.disabled=value;back.disabled=value;refresh.disabled=value};
 close.addEventListener('click',closeManage);back.addEventListener('click',()=>{if(!state.saving)showList()});refresh.addEventListener('click',()=>{closeManage();load()});
 function showList(){
  back.hidden=true;refresh.hidden=true;message.textContent='Choose one entry. Editing or deleting will require another review and confirmation.';
  content.innerHTML=records.length?`<div class="sdv-entry-list">${records.map((r,i)=>`<article><div><a href="https://avanimedia.lightning.force.com/lightning/r/Partner_Delivery__c/${encodeURIComponent(r.id)}/view" target="_blank" rel="noopener noreferrer">${esc(r.name||r.id)} ↗</a><small>${esc(r.date)} · ${fmt(r.volume)} leads${r.locked?' · Locked in Salesforce':''}</small></div><div><button type="button" data-edit-entry="${i}" ${r.locked?'disabled':''}>Edit</button><button type="button" class="sdv-delete-button" data-delete-entry="${i}" ${r.locked?'disabled':''}>Delete</button></div></article>`).join('')}</div>`:'<p>No entries were found. Refresh verification to see the latest status.</p>';
  content.querySelectorAll('[data-edit-entry]').forEach(b=>b.addEventListener('click',()=>showEdit(records[Number(b.dataset.editEntry)])));
  content.querySelectorAll('[data-delete-entry]').forEach(b=>b.addEventListener('click',()=>prepareChange(records[Number(b.dataset.deleteEntry)],'delete')));
 }
 function showEdit(record){
  back.hidden=false;message.textContent='Edit the delivery date or lead count, then review the change.';
  const maxDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  content.innerHTML=`<form id="sdvEditForm"><p><strong>${esc(record.name||record.id)}</strong></p><label>Delivery date<input id="sdvEditDate" type="date" required min="2026-01-01" max="${maxDate}" value="${esc(record.date)}"></label><label>Delivered lead count<input id="sdvEditVolume" type="number" required min="1" max="1000000" step="1" value="${record.volume===null?'':Number(record.volume)}"></label><button type="submit">Review changes</button></form>`;
  content.querySelector('#sdvEditForm').addEventListener('submit',e=>{e.preventDefault();if(state.saving||!e.target.reportValidity())return;prepareChange(record,'edit',{date:content.querySelector('#sdvEditDate').value,volume:Number(content.querySelector('#sdvEditVolume').value)})});
 }
 async function prepareChange(record,kind,patch={}){
  if(state.saving)return;busy(true);content.querySelectorAll('button').forEach(b=>b.disabled=true);message.textContent='Checking the exact Salesforce entry and preparing review…';
  try{
   const draft=await writerCall({action:'prepare_change',kind,recordId:record.id,partnerId:row.partner.id,...patch});
   const before=draft.before,after=draft.after,r=draft.review;
   if(draft.status!=='review'||!draft.requestId||!before||!r)throw Error('The change review could not be prepared.');
   back.hidden=false;
   content.innerHTML=`<h4>${kind==='delete'?'Confirm deletion':'Review changes'}</h4><dl class="sdv-record-review"><dt>Salesforce entry</dt><dd>${esc(before.name||before.id)}<small>${esc(before.id)}</small></dd><dt>Program partner</dt><dd>${esc(r.number||r.id)} · ${esc(r.name)}</dd><dt>Salesforce program</dt><dd>${esc(r.program)}</dd><dt>Delivery date</dt><dd>${esc(before.date)}${kind==='edit'?` → <strong>${esc(after.date)}</strong>`:''}</dd><dt>Delivered leads</dt><dd>${fmt(before.volume)}${kind==='edit'?` → <strong>${fmt(after.volume)}</strong>`:''}</dd>${before.free||before.rejected?`<dt>Other recorded leads</dt><dd>Free: ${fmt(before.free)} · Rejected: ${fmt(before.rejected)}</dd>`:''}</dl><label class="sdv-record-confirm"><input type="checkbox" id="sdvConfirmChange">${kind==='delete'?'I confirm deletion of this exact Salesforce delivery entry.':'I confirm the updated date and lead count for this exact Salesforce entry.'}</label><button id="sdvSubmitChange" type="button" class="${kind==='delete'?'sdv-delete-button':''}" disabled>${kind==='delete'?'Delete entry from Salesforce':'Save changes to Salesforce'}</button>`;
   message.textContent=kind==='delete'?'This removes the selected delivery entry from Salesforce and affects its recorded delivery totals.':'The partner, program and rates will stay the same.';
   const submit=content.querySelector('#sdvSubmitChange'),confirm=content.querySelector('#sdvConfirmChange');
   confirm.addEventListener('change',()=>{submit.disabled=!confirm.checked});
   submit.addEventListener('click',async()=>{
    if(state.saving||!confirm.checked)return;busy(true);confirm.disabled=true;submit.disabled=true;message.textContent=kind==='delete'?'Deleting the confirmed entry in Salesforce…':'Saving the confirmed changes in Salesforce…';
    let result;
    try{result=await writerCall({action:'submit_change',requestId:draft.requestId});if(!['updated','deleted'].includes(result.status))throw Error('Salesforce did not confirm the change. Refresh verification before trying again.');}
    catch(error){message.textContent=error.message;refresh.hidden=false;back.hidden=true;}
    finally{busy(false);}
    if(result&&['updated','deleted'].includes(result.status)){state.date=result.date;closeManage();await load();state.notice=result.status==='deleted'?'Delivery entry deleted in Salesforce.':'Delivery entry updated in Salesforce.';if(result.auditRecorded===false)state.notice+=' The Hub audit confirmation is pending.';if(result.status==='updated')state.lastCreated=result.deliveryId;render();}
   });
  }catch(error){message.textContent=error.message;back.hidden=false;refresh.hidden=false;content.querySelectorAll('[data-edit-entry],[data-delete-entry],button[type="submit"]').forEach(b=>b.disabled=false)}
  finally{busy(false);}
 }
 try{const data=await writerCall({action:'list_records',partnerId:row.partner.id,date:state.date});if(!Array.isArray(data.records))throw Error('The entry list could not be loaded.');records=data.records;if(dialog.isConnected)showList();}
 catch(error){message.textContent=error.message;refresh.hidden=false;}
}
function closeLink(){document.getElementById('sdvLinkDialog')?.remove();}
function openLink(key){const row=state.rows.find(r=>r.key===key);if(!row||!state.data||state.saving)return;closeLink();const dialog=document.createElement('dialog');dialog.id='sdvLinkDialog';dialog.className='sdv-dialog';
 const current=autoLinks(state.rows,state.links,state.data.partners,state.date)[key]?.partnerId||'';const partners=[...state.data.partners].sort((a,b)=>a.account.localeCompare(b.account)||a.program.localeCompare(b.program)||a.name.localeCompare(b.name));
 dialog.innerHTML=`<form method="dialog"><h3>Link Salesforce program partner</h3><p>${esc(row.account)} · CID ${esc(row.cid)} · ${esc(row.publisher)}</p><p>${esc(row.campaign)}</p><label>Find Salesforce partner<input id="sdvLinkSearch" type="search" placeholder="Search client, program or partner"></label><label>Salesforce program partner<select id="sdvLinkSelect" size="8"><option value="" ${!current?'selected':''}>No link</option>${partners.map(p=>`<option value="${esc(p.id)}" ${p.id===current?'selected':''}>${p.number?esc(p.number)+' · ':''}${esc(p.account)} · ${esc(p.program)} · ${esc(p.name)} (${esc(p.publisher)})</option>`).join('')}</select></label><p>This saves a team link in the Hub. Select the exact program and partner that represent this campaign. It does not change Salesforce.</p><div class="sdv-dialog-actions"><button value="cancel">Cancel</button><button type="button" id="sdvSaveLink">Save link</button></div><p id="sdvLinkError" role="alert"></p></form>`;document.body.appendChild(dialog);dialog.showModal();
 dialog.querySelector('#sdvLinkSearch').addEventListener('input',e=>{const term=e.target.value.toLowerCase();dialog.querySelectorAll('#sdvLinkSelect option').forEach(o=>{o.hidden=!!o.value&&!o.textContent.toLowerCase().includes(term)})});
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 dialog.querySelector('#sdvSaveLink').addEventListener('click',async()=>{const partnerId=dialog.querySelector('#sdvLinkSelect').value;if(partnerId&&!state.data.partners.some(p=>p.id===partnerId))return;state.saving=true;const save=dialog.querySelector('#sdvSaveLink');save.disabled=true;save.textContent='Saving…';
  try{const value={partnerId,confirmedAt:new Date().toISOString()};const {error}=await window.avaniSupabase.from('hub_settings').upsert({setting_key:key,setting_value:value,updated_at:new Date().toISOString()},{onConflict:'setting_key'});if(error)throw error;state.links[key]=value;state.notice='Salesforce partner link saved.';closeLink();}
  catch(error){dialog.querySelector('#sdvLinkError').textContent=error.message||'Link could not be saved.';save.disabled=false;save.textContent='Save link';}
  finally{state.saving=false;render();}
 });
}
function init(){const main=document.querySelector('.main'),nav=document.querySelector('#sidebar .nav');if(!main||!nav)return;
 if(!root()){const section=document.createElement('section');section.id=ID;section.className='view sdv-view';main.appendChild(section);render()}
 if(!nav.querySelector(`[data-view="${VIEW}"]`)){const button=document.createElement('button');button.type='button';button.dataset.view=VIEW;button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8v3H8zM6 5H4v16h16V5h-2M8 13l3 3 5-6"/></svg><span>Salesforce Partner Delivery</span>';const campaigns=nav.querySelector('[data-view="campaigns"]');if(campaigns)campaigns.insertAdjacentElement('afterend',button);else nav.appendChild(button);button.addEventListener('click',()=>{closeLink();window.showView?.(VIEW);load()})}
}
window.addEventListener('avani:authenticated',()=>{init();if(root()?.classList.contains('active'))load()});
document.addEventListener('click',e=>{const target=e.target.closest?.('[data-view],[data-mode],[data-hub-mode]');if(target&&!target.matches(`[data-view="${VIEW}"]`)){closeLink();closeRecord();closeManage();closeCsv()}},true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
