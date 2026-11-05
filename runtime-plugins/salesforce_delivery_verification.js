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
function partnerLinkMarkup(partner){return `<a href="https://avanimedia.lightning.force.com/lightning/r/Program_Partner__c/${encodeURIComponent(partner.id)}/view" target="_blank" rel="noopener noreferrer" title="Open Salesforce program partner">${esc(partner.number||partner.name)} ↗</a>`;}
function canRecordDelivery(row,allowed){return !!allowed&&row.status==='missing'&&!!row.partner?.id&&!fullyDelivered(row);}
function recordDeliveryDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
if(typeof module!=='undefined'&&module.exports){module.exports={campaignRows,verifyRows,dateKey,autoLinks,visibleCampaignRows,partnerLinkMarkup,canRecordDelivery,recordDeliveryDate};return;}
if(window.__avaniSalesforceDeliveryVerification)return;window.__avaniSalesforceDeliveryVerification=true;
const VIEW='sf-delivery-verification',ID=VIEW+'-view';
const labels={link:'Needs confirmation',recorded:'Recorded in SF',missing:'No SF record found',zero:'Record found — zero leads',shared:'Shared SF partner — review',unknown:'Record found — check volume',adjustment:'Adjustment recorded'};
const yesterday=()=>{const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)};
const state={date:yesterday(),showComplete:false,canRecord:false,writerUnavailable:false,lastCreated:null,search:'',status:'',loading:false,saving:false,error:'',notice:'',data:null,rows:[],links:{},loadId:0};
const root=()=>document.getElementById(ID);
const fmt=v=>v===null?'—':Number(v).toLocaleString('en-US');
const stamp=v=>new Date(v).toLocaleString('en-US',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'});
function render(){const el=root();if(!el)return;const allVerified=state.data?verifyRows(state.rows,autoLinks(state.rows,state.links,state.data.partners,state.date),state.data.partners,state.data.deliveries,state.date):[];const verified=visibleCampaignRows(allVerified,state.showComplete),hiddenCount=allVerified.length-visibleCampaignRows(allVerified).length;
 const term=state.search.toLowerCase(),shown=verified.filter(r=>(!state.status||r.status===state.status)&&(!term||`${r.account} ${r.campaign} ${r.cid} ${r.publisher} ${r.partner?.name||''} ${r.partner?.number||''}`.toLowerCase().includes(term)));
 el.innerHTML=`<div class="sdv-shell"><header class="sdv-head"><div><span>Syndication Delivery</span><h2>Salesforce Delivery Verification</h2><p>Confirm whether delivered leads have been recorded in Salesforce for a specific delivery date.</p></div><button id="sdvRefresh" ${state.loading||state.saving?'disabled':''}>${state.loading?'Checking Salesforce…':'Refresh Salesforce'}</button></header><p class="sdv-info">Scheduled Client Delivery Day is a planning reference and may change. A missing SF record does not prove that delivery was due.</p><div class="sdv-toolbar"><label>Delivery date<input id="sdvDate" type="date" min="2026-01-01" value="${state.date}" ${state.saving?'disabled':''}></label><label>Campaign search<input id="sdvSearch" type="search" placeholder="Search client, campaign, CID or publisher" value="${esc(state.search)}"></label><label>Status<select id="sdvStatus"><option value="">All statuses</option>${Object.entries(labels).map(([v,l])=>`<option value="${v}" ${state.status===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="sdv-completed-filter"><input id="sdvShowComplete" type="checkbox" ${state.showComplete?'checked':''}>Show fully delivered campaigns</label></div><div id="sdvNotice" role="status">${esc(state.notice)}${state.lastCreated?` <a href="https://avanimedia.lightning.force.com/lightning/r/Partner_Delivery__c/${encodeURIComponent(state.lastCreated)}/view" target="_blank" rel="noopener noreferrer">View recorded delivery ↗</a>`:""}</div>${state.writerUnavailable?'<p>Recording is temporarily unavailable; delivery verification is still available.</p>':''}${state.error?`<div class="sdv-error" role="alert">${esc(state.error)}</div>`:''}${state.loading?'<p class="sdv-empty" role="status">Checking Salesforce and loading campaign schedules…</p>':state.data?`<div class="sdv-cards"><article><span>Campaign / publisher rows</span><strong>${verified.length}</strong></article><article><span>Recorded in SF</span><strong>${verified.filter(r=>r.status==='recorded').length}</strong></article><article><span>No SF record found</span><strong>${verified.filter(r=>r.status==='missing').length}</strong></article><article><span>Needs confirmation / review</span><strong>${verified.filter(r=>!['recorded','missing'].includes(r.status)).length}</strong></article></div><p class="sdv-check-time">Checked live: ${esc(stamp(state.data.checkedAt))} Manila · Delivery date: ${state.date} · Showing ${shown.length} of ${verified.length}${!state.showComplete&&hiddenCount?` · ${hiddenCount} fully delivered campaign/publisher rows hidden`:""}</p><div class="sdv-table-wrap"><table><thead><tr><th>Client</th><th>Campaign / CID</th><th>Publisher</th><th>Scheduled Client Delivery Day</th><th>Leads recorded in SF</th><th>Status</th><th>Salesforce program partner</th></tr></thead><tbody>${shown.length?shown.map(rowMarkup).join(''):'<tr><td colspan="7" class="sdv-empty">No campaigns match this date and filters.</td></tr>'}</tbody></table></div><p class="sdv-foot">Counts reflect the linked Salesforce program partner on the selected delivery date, including zero-volume and adjustment records. “No SF record found” means the live check found no matching delivery record. Clear matches are linked automatically using client, publisher, service, region/segment and campaign dates. Manual links take priority; ambiguous and shared matches require confirmation. Completed programs are hidden using current Salesforce total volume across all delivery dates; enable Show fully delivered campaigns to review past entries.</p>`:''}</div>`;
 el.querySelector('#sdvRefresh').addEventListener('click',load);
 el.querySelector('#sdvDate').addEventListener('change',e=>{if(!e.target.value)return;state.date=e.target.value;load()});
 el.querySelector('#sdvSearch').addEventListener('input',e=>{const input=e.target,start=input.selectionStart;state.search=input.value;render();const next=root().querySelector('#sdvSearch');next.focus();next.setSelectionRange(start,start)});
 el.querySelector('#sdvShowComplete').addEventListener('change',e=>{state.showComplete=e.target.checked;render()});
 el.querySelector('#sdvStatus').addEventListener('change',e=>{state.status=e.target.value;render()});
 el.querySelectorAll('[data-sdv-record]').forEach(b=>b.addEventListener('click',()=>openRecord(b.dataset.sdvRecord)));
 el.querySelectorAll('[data-sdv-link]').forEach(b=>b.addEventListener('click',()=>openLink(b.dataset.sdvLink)));
}
function rowMarkup(r){return `<tr><td>${esc(r.account)}</td><td><strong>${esc(r.campaign)}</strong><small>CID ${esc(r.cid)}</small>${fullyDelivered(r)?`<small>Fully delivered in SF · ${fmt(r.partner.programDelivered)} / ${fmt(r.partner.programVolume)}</small>`:""}</td><td>${esc(r.publisher)}</td><td>${esc(r.day)}</td><td class="sdv-number">${fmt(r.volume)}</td><td><span class="sdv-status sdv-${r.status}">${labels[r.status]}</span>${r.status==='shared'?'<small>Partner total may span multiple linked campaigns.</small>':''}</td><td>${r.partner?`${partnerLinkMarkup(r.partner)}`:''}<button data-sdv-link="${esc(r.key)}" ${state.saving?'disabled':''}>${r.partner?'Change link':'Review link'}</button>${canRecordDelivery(r,state.canRecord)?`<button class="sdv-record-button" data-sdv-record="${esc(r.key)}" ${state.saving?'disabled':''}>Record Delivery</button>`:''}</td></tr>`}
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
function closeRecord(){if(!state.saving)document.getElementById('sdvRecordDialog')?.remove();}
function openRecord(key){
 if(state.saving||!state.data||!state.canRecord)return;
 const links=autoLinks(state.rows,state.links,state.data.partners,state.date),row=verifyRows(state.rows,links,state.data.partners,state.data.deliveries,state.date).find(r=>r.key===key);
 if(!row||!canRecordDelivery(row,state.canRecord))return;
 closeRecord();closeLink();
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
 if(!nav.querySelector(`[data-view="${VIEW}"]`)){const button=document.createElement('button');button.type='button';button.dataset.view=VIEW;button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8v3H8zM6 5H4v16h16V5h-2M8 13l3 3 5-6"/></svg><span>Salesforce Delivery Verification</span>';const campaigns=nav.querySelector('[data-view="campaigns"]');if(campaigns)campaigns.insertAdjacentElement('afterend',button);else nav.appendChild(button);button.addEventListener('click',()=>{closeLink();window.showView?.(VIEW);load()})}
}
window.addEventListener('avani:authenticated',()=>{init();if(root()?.classList.contains('active'))load()});
document.addEventListener('click',e=>{const target=e.target.closest?.('[data-view],[data-mode],[data-hub-mode]');if(target&&!target.matches(`[data-view="${VIEW}"]`)){closeLink();closeRecord()}},true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
