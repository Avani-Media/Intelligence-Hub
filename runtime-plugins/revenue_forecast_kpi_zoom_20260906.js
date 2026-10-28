
;(()=>{
'use strict';
if(window.__avaniRevenueKpiZoomLoaded)return;
window.__avaniRevenueKpiZoomLoaded=true;

const INFO=[
  {
    label:'Total Salesforce Forecast',
    copy:'All current Salesforce forecast revenue on non-archived Closed Won opportunities from Jan 1, 2026 forward. This card is portfolio-wide and does not change with the quarter filters.',
    formula:'Closed Won Salesforce schedule revenue · 2026 onward'
  },
  {
    label:'Quarter Salesforce Forecast',
    copy:'Current Salesforce forecast revenue for the campaigns matching your active filters in the quarter shown, excluding Closed Lost and archived opportunities.',
    formula:'Visible Salesforce forecast · selected quarter'
  },
  {
    label:'Delivered Revenue',
    copy:'Revenue already recorded from Salesforce Partner Delivery for the visible campaigns and delivery months in this quarter.',
    formula:'Σ Client Delivery Revenue from Partner Delivery'
  },
  {
    label:'Remaining Revenue',
    copy:'How much of the current Working Reforecast is still not represented by delivered revenue for the visible campaigns.',
    formula:'Working Reforecast − Delivered Revenue'
  },
  {
    label:'Committed',
    copy:'Working Reforecast assigned to campaigns currently categorized as Committed within the active filters and quarter.',
    formula:'Σ Working Reforecast · Committed'
  },
  {
    label:'Verbal',
    copy:'Working Reforecast assigned to campaigns currently categorized as Verbal within the active filters and quarter.',
    formula:'Σ Working Reforecast · Verbal'
  },
  {
    label:'Negotiate',
    copy:'Working Reforecast assigned to campaigns currently categorized as Negotiate within the active filters and quarter.',
    formula:'Σ Working Reforecast · Negotiate'
  },
  {
    label:'Lost Revenue',
    copy:'Revenue associated with Closed Lost opportunities in the selected quarter and active filters.',
    formula:'Σ Current Salesforce Forecast · Closed Lost'
  }
];

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let activeOverlay=null;
let lastTrigger=null;
let normalizeQueued=false;

function compactCard(card){
  if(!card||card.id==='rfRemainingKpi')return;
  if(card.classList.contains('rf-kpi-flip-card')){
    const front=card.querySelector('.rf-kpi-front');
    const children=front?[...front.childNodes]:[];
    card.innerHTML='';
    children.forEach(node=>card.appendChild(node));
    card.classList.remove('rf-kpi-flip-card','rf-kpi-flipped');
  }
  card.dataset.rfFlipReady='1';
  card.setAttribute('role','button');
  card.setAttribute('tabindex','0');
  card.setAttribute('aria-haspopup','dialog');
  card.setAttribute('aria-expanded','false');
}

function normalizeCards(){
  normalizeQueued=false;
  document.querySelectorAll('#rf-view .rf-summary .rf-kpi').forEach(compactCard);
}

function scheduleNormalize(){
  if(normalizeQueued)return;
  normalizeQueued=true;
  requestAnimationFrame(normalizeCards);
}

function closeZoom(restoreFocus=true){
  if(!activeOverlay)return;
  const overlay=activeOverlay;
  activeOverlay=null;
  overlay.classList.remove('is-open');
  document.body.classList.remove('rf-kpi-zoom-open');
  document.querySelectorAll('#rf-view .rf-summary .rf-kpi[aria-expanded="true"]').forEach(card=>card.setAttribute('aria-expanded','false'));
  const trigger=lastTrigger;
  lastTrigger=null;
  setTimeout(()=>overlay.remove(),210);
  if(restoreFocus&&trigger?.isConnected)trigger.focus({preventScroll:true});
}

function openZoom(card){
  compactCard(card);
  const cards=[...document.querySelectorAll('#rf-view .rf-summary .rf-kpi')];
  const index=cards.indexOf(card);
  const cardLabel=card.querySelector(':scope > span')?.textContent?.trim()||'';
  const info=INFO.find(item=>item.label===cardLabel)||INFO[index];
  if(index<0||!info)return;

  if(activeOverlay){
    if(lastTrigger===card){closeZoom();return;}
    closeZoom(false);
  }

  const label=cardLabel||info.label;
  const value=card.querySelector(':scope > strong')?.textContent?.trim()||'';
  const style=getComputedStyle(card);
  const a=style.getPropertyValue('--rf-kpi-a').trim()||'#1677ff';
  const b=style.getPropertyValue('--rf-kpi-b').trim()||'#4f46e5';
  const glow=style.getPropertyValue('--rf-kpi-glow').trim()||'rgba(77,112,255,.38)';

  const overlay=document.createElement('div');
  overlay.className='rf-kpi-zoom-overlay';
  overlay.setAttribute('role','presentation');
  overlay.innerHTML=`<section class="rf-kpi-zoom-card" role="dialog" aria-modal="true" aria-label="${esc(label)} details" style="--rf-kpi-a:${esc(a)};--rf-kpi-b:${esc(b)};--rf-kpi-glow:${esc(glow)}"><button class="rf-kpi-zoom-close" type="button" aria-label="Close KPI details">×</button><div class="rf-kpi-zoom-content"><span class="rf-kpi-zoom-kicker">Revenue HQ KPI</span><span class="rf-kpi-zoom-label">${esc(label)}</span><strong class="rf-kpi-zoom-value">${esc(value)}</strong><p class="rf-kpi-zoom-copy">${esc(info.copy)}</p><span class="rf-kpi-zoom-formula">${esc(info.formula)}</span><span class="rf-kpi-zoom-hint">Click the card again, click outside, or press Esc to close</span></div></section>`;
  document.body.appendChild(overlay);
  activeOverlay=overlay;
  lastTrigger=card;
  card.setAttribute('aria-expanded','true');
  document.body.classList.add('rf-kpi-zoom-open');
  requestAnimationFrame(()=>overlay.classList.add('is-open'));
  overlay.querySelector('.rf-kpi-zoom-close')?.focus({preventScroll:true});
}

document.addEventListener('click',e=>{
  const card=e.target.closest?.('#rf-view .rf-summary .rf-kpi');
  if(card&&card.id!=='rfRemainingKpi'){openZoom(card);return;}
  const close=e.target.closest?.('.rf-kpi-zoom-close');
  if(close){e.stopPropagation();closeZoom();return;}
  if(activeOverlay&&e.target===activeOverlay){closeZoom();return;}
  const zoomCard=e.target.closest?.('.rf-kpi-zoom-card');
  if(activeOverlay&&zoomCard&&!e.target.closest?.('button'))closeZoom();
});

document.addEventListener('keydown',e=>{
  const card=e.target.closest?.('#rf-view .rf-summary .rf-kpi');
  if(card&&card.id!=='rfRemainingKpi'&&(e.key==='Enter'||e.key===' ')){
    e.preventDefault();
    openZoom(card);
    return;
  }
  if(e.key==='Escape'&&activeOverlay){
    e.preventDefault();
    closeZoom();
  }
});

const observer=new MutationObserver(scheduleNormalize);
observer.observe(document.body,{childList:true,subtree:true});
scheduleNormalize();
})();

