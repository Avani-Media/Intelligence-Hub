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
   map.set(key,{key,cid,publisher,account:c.Advertiser||'',campaign:c['Campaign Name']||'',day:days.join(' / ')||'Not set'});
  }
 }
 return [...map.values()].sort((a,b)=>a.account.localeCompare(b.account)||a.campaign.localeCompare(b.campaign)||a.publisher.localeCompare(b.publisher));
}
function verifyRows(rows,links,partners,deliveries,date){
 const byId=new Map(partners.map(p=>[p.id,p])),counts=new Map(),seen=new Set(),byPartner=new Map();
 // Count all saved links, including campaigns outside the visible date window.
 for(const link of Object.values(links)){if(link?.partnerId)counts.set(link.partnerId,(counts.get(link.partnerId)||0)+1)}
 for(const d of deliveries){if(d.date!==date||!d.id||seen.has(d.id))continue;seen.add(d.id);const list=byPartner.get(d.partnerId)||[];list.push(d);byPartner.set(d.partnerId,list)}
 return rows.map(r=>{const partner=byId.get(links[r.key]?.partnerId);if(!partner)return {...r,status:'link',volume:null,partner:null};const ds=byPartner.get(partner.id)||[],unknown=ds.some(d=>d.volume===null||!Number.isFinite(d.volume)),volume=ds.reduce((t,d)=>t+(Number(d.volume)||0),0);return {...r,partner,volume:unknown?null:volume,recordIds:ds.map(d=>d.id),status:counts.get(partner.id)>1?'shared':!ds.length?'missing':unknown?'unknown':volume===0?'zero':volume>0?'recorded':'adjustment'};});
}
if(typeof module!=='undefined'&&module.exports){module.exports={campaignRows,verifyRows,dateKey};return;}
if(window.__avaniSalesforceDeliveryVerification)return;window.__avaniSalesforceDeliveryVerification=true;
const VIEW='sf-delivery-verification',ID=VIEW+'-view';
const labels={link:'Link needed',recorded:'Recorded in SF',missing:'No SF record found',zero:'Record found — zero leads',shared:'Shared SF partner — review',unknown:'Record found — check volume',adjustment:'Adjustment recorded'};
const yesterday=()=>{const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)};
const state={date:yesterday(),search:'',status:'',loading:false,saving:false,error:'',notice:'',data:null,rows:[],links:{},loadId:0};
const root=()=>document.getElementById(ID);
const fmt=v=>v===null?'—':Number(v).toLocaleString('en-US');
const stamp=v=>new Date(v).toLocaleString('en-US',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'});
function render(){const el=root();if(!el)return;const verified=state.data?verifyRows(state.rows,state.links,state.data.partners,state.data.deliveries,state.date):[];
 const term=state.search.toLowerCase(),shown=verified.filter(r=>(!state.status||r.status===state.status)&&(!term||`${r.account} ${r.campaign} ${r.cid} ${r.publisher} ${r.partner?.name||''}`.toLowerCase().includes(term)));
 el.innerHTML=`<div class="sdv-shell"><header class="sdv-head"><div><span>Syndication Delivery</span><h2>Salesforce Delivery Verification</h2><p>Confirm whether delivered leads have been recorded in Salesforce for a specific delivery date.</p></div><button id="sdvRefresh" ${state.loading||state.saving?'disabled':''}>${state.loading?'Checking Salesforce…':'Refresh Salesforce'}</button></header><p class="sdv-info">Scheduled Client Delivery Day is a planning reference and may change. A missing SF record does not prove that delivery was due.</p><div class="sdv-toolbar"><label>Delivery date<input id="sdvDate" type="date" min="2026-01-01" value="${state.date}" ${state.saving?'disabled':''}></label><label>Campaign search<input id="sdvSearch" type="search" placeholder="Search client, campaign, CID or publisher" value="${esc(state.search)}"></label><label>Status<select id="sdvStatus"><option value="">All statuses</option>${Object.entries(labels).map(([v,l])=>`<option value="${v}" ${state.status===v?'selected':''}>${l}</option>`).join('')}</select></label></div><div id="sdvNotice" role="status">${esc(state.notice)}</div>${state.error?`<div class="sdv-error" role="alert">${esc(state.error)}</div>`:''}${state.loading?'<p class="sdv-empty" role="status">Checking Salesforce and loading campaign schedules…</p>':state.data?`<div class="sdv-cards"><article><span>Campaign / publisher rows</span><strong>${verified.length}</strong></article><article><span>Recorded in SF</span><strong>${verified.filter(r=>r.status==='recorded').length}</strong></article><article><span>No SF record found</span><strong>${verified.filter(r=>r.status==='missing').length}</strong></article><article><span>Link needed / review</span><strong>${verified.filter(r=>!['recorded','missing'].includes(r.status)).length}</strong></article></div><p class="sdv-check-time">Checked live: ${esc(stamp(state.data.checkedAt))} Manila · Delivery date: ${state.date} · Showing ${shown.length} of ${verified.length}</p><div class="sdv-table-wrap"><table><thead><tr><th>Client</th><th>Campaign / CID</th><th>Publisher</th><th>Scheduled Client Delivery Day</th><th>Leads recorded in SF</th><th>Status</th><th>Salesforce program partner</th></tr></thead><tbody>${shown.length?shown.map(rowMarkup).join(''):'<tr><td colspan="7" class="sdv-empty">No campaigns match this date and filters.</td></tr>'}</tbody></table></div><p class="sdv-foot">Counts reflect the linked Salesforce program partner on the selected delivery date, including zero-volume and adjustment records. “No SF record found” means the live check found no matching delivery record. Link each campaign and publisher once using the correct SF partner; shared links require review.</p>`:''}</div>`;
 el.querySelector('#sdvRefresh').addEventListener('click',load);
 el.querySelector('#sdvDate').addEventListener('change',e=>{if(!e.target.value)return;state.date=e.target.value;load()});
 el.querySelector('#sdvSearch').addEventListener('input',e=>{const input=e.target,start=input.selectionStart;state.search=input.value;render();const next=root().querySelector('#sdvSearch');next.focus();next.setSelectionRange(start,start)});
 el.querySelector('#sdvStatus').addEventListener('change',e=>{state.status=e.target.value;render()});
 el.querySelectorAll('[data-sdv-link]').forEach(b=>b.addEventListener('click',()=>openLink(b.dataset.sdvLink)));
}
function rowMarkup(r){return `<tr><td>${esc(r.account)}</td><td><strong>${esc(r.campaign)}</strong><small>CID ${esc(r.cid)}</small></td><td>${esc(r.publisher)}</td><td>${esc(r.day)}</td><td class="sdv-number">${fmt(r.volume)}</td><td><span class="sdv-status sdv-${r.status}">${labels[r.status]}</span>${r.status==='shared'?'<small>Partner total may span multiple linked campaigns.</small>':''}</td><td>${r.partner?`<a href="https://avanimedia.lightning.force.com/lightning/r/Program_Partner__c/${encodeURIComponent(r.partner.id)}/view" target="_blank" rel="noopener noreferrer">${esc(r.partner.name)} ↗</a><small>${esc(r.partner.program)}</small>`:''}<button data-sdv-link="${esc(r.key)}" ${state.saving?'disabled':''}>${r.partner?'Change link':'Link SF partner'}</button></td></tr>`}
async function allRows(client,table,columns,order,configure=q=>q){let out=[];for(let from=0;from<100000;from+=1000){const {data,error}=await configure(client.from(table).select(columns).order(order,{ascending:true})).range(from,from+999);if(error)throw error;out.push(...(data||[]));if((data||[]).length<1000)return out;}throw Error('Too many rows to verify completely.');}
async function load(){if(state.saving)return;const requestId=++state.loadId,date=state.date;state.loading=true;state.data=null;state.error='';state.notice='';render();
 try{const sb=window.avaniSupabase;if(!sb)throw Error('Please sign in to the Hub.');const [snapshot,schedules,settings]=await Promise.all([
 sb.from('dashboard_snapshots').select('payload').eq('dataset','performance').single(),
 allRows(sb,'syndication_delivery_schedule_current','contract_key,cid,publisher,client_delivery_day','contract_key'),
 allRows(sb,'hub_settings','setting_key,setting_value','setting_key',q=>q.like('setting_key','sf_delivery_link:%'))
 ]);if(requestId!==state.loadId)return;const links=Object.fromEntries(settings.map(r=>[r.setting_key,typeof r.setting_value==='string'?JSON.parse(r.setting_value):r.setting_value]));const partnerIds=[...new Set(Object.values(links).map(l=>l?.partnerId).filter(Boolean))];const result=await sb.functions.invoke('salesforce-delivery-verification',{body:{date,partnerIds}});if(requestId!==state.loadId)return;if(snapshot.error)throw snapshot.error;if(result.error)throw Error('Salesforce could not be checked. Please refresh or sign in again.');if(!result.data?.ok||result.data.date!==date||!Array.isArray(result.data.partners)||!Array.isArray(result.data.deliveries))throw Error(result.data?.error||'Salesforce returned an incomplete response.');
 if(!Array.isArray(snapshot.data?.payload))throw Error('Campaign source is unavailable.');
 state.rows=campaignRows(snapshot.data.payload,schedules,date);state.links=links;state.data=result.data;
 }catch(error){if(requestId===state.loadId){state.data=null;state.error=error.message||'Verification could not be completed.'}}finally{if(requestId===state.loadId){state.loading=false;render()}}
}
function closeLink(){document.getElementById('sdvLinkDialog')?.remove();}
function openLink(key){const row=state.rows.find(r=>r.key===key);if(!row||!state.data||state.saving)return;closeLink();const dialog=document.createElement('dialog');dialog.id='sdvLinkDialog';dialog.className='sdv-dialog';
 const current=state.links[key]?.partnerId||'';const partners=[...state.data.partners].sort((a,b)=>a.account.localeCompare(b.account)||a.program.localeCompare(b.program)||a.name.localeCompare(b.name));
 dialog.innerHTML=`<form method="dialog"><h3>Link Salesforce program partner</h3><p>${esc(row.account)} · CID ${esc(row.cid)} · ${esc(row.publisher)}</p><p>${esc(row.campaign)}</p><label>Find Salesforce partner<input id="sdvLinkSearch" type="search" placeholder="Search client, program or partner"></label><label>Salesforce program partner<select id="sdvLinkSelect" size="8"><option value="" ${!current?'selected':''}>No link</option>${partners.map(p=>`<option value="${esc(p.id)}" ${p.id===current?'selected':''}>${esc(p.account)} · ${esc(p.program)} · ${esc(p.name)} (${esc(p.publisher)})</option>`).join('')}</select></label><p>This saves a team link in the Hub. Select the exact program and partner that represent this campaign. It does not change Salesforce.</p><div class="sdv-dialog-actions"><button value="cancel">Cancel</button><button type="button" id="sdvSaveLink">Save link</button></div><p id="sdvLinkError" role="alert"></p></form>`;document.body.appendChild(dialog);dialog.showModal();
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
document.addEventListener('click',e=>{const target=e.target.closest?.('[data-view],[data-mode],[data-hub-mode]');if(target&&!target.matches(`[data-view="${VIEW}"]`))closeLink()},true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
