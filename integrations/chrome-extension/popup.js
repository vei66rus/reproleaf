import {
 extCopy,
 resolveWebPanelUrl,
 evaluateTabAudit,
 buildCompetitorOrSerpExport,
 formatAiEditorPrompt
} from './handoff-core.mjs';

function extractActivePageDom(){
 const title=(document.title||'').trim();
 const descEl=document.querySelector('meta[name="description"]');
 const description=descEl?(descEl.getAttribute('content')||'').trim():'';
 const canonicalEl=document.querySelector('link[rel="canonical"]');
 const canonical=canonicalEl?(canonicalEl.getAttribute('href')||'').trim():'';
 const robotsEl=document.querySelector('meta[name="robots"]');
 const robots=robotsEl?(robotsEl.getAttribute('content')||'').trim():'';
 const hasViewport=Boolean(document.querySelector('meta[name="viewport"]'));

 const headings=Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).slice(0,100).map(el=>({
  level:Number(el.tagName.slice(1)),
  text:(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim().slice(0,200)
 })).filter(h=>h.text.length>0);

 const links=Array.from(document.querySelectorAll('a[href]')).slice(0,200).map(a=>({
  href:(a.getAttribute('href')||'').trim(),
  anchor:(a.innerText||a.textContent||'').replace(/\s+/g,' ').trim().slice(0,140)
 })).filter(l=>l.href.length>0);

 const images=Array.from(document.querySelectorAll('img')).slice(0,100);
 const missingAltCount=images.filter(img=>!img.hasAttribute('alt')).length;
 const missingDimensionsCount=images.filter(img=>!img.hasAttribute('width')||!img.hasAttribute('height')).length;
 const firstImageLazy=images.length>0&&(images[0].getAttribute('loading')||'').toLowerCase()==='lazy';
 const blockingHeadScripts=Array.from(document.querySelectorAll('head script[src]')).filter(s=>!s.hasAttribute('defer')&&!s.hasAttribute('async')&&s.getAttribute('type')!=='module').length;

 const jsonLdTypes=[];
 let jsonLdErrors=0;
 for(const script of document.querySelectorAll('script[type="application/ld+json"]')){
  try{
   const parsed=JSON.parse((script.textContent||'').trim());
   const stack=Array.isArray(parsed)?[...parsed]:[parsed];
   while(stack.length>0){
    const obj=stack.pop();
    if(!obj||typeof obj!=='object')continue;
    if(Array.isArray(obj['@graph']))stack.push(...obj['@graph']);
    const t=obj['@type'];
    if(typeof t==='string'&&t.trim())jsonLdTypes.push(t.trim());
    else if(Array.isArray(t))for(const x of t)if(typeof x==='string'&&x.trim())jsonLdTypes.push(x.trim());
   }
  }catch{
   jsonLdErrors+=1;
  }
 }

 const mainRoot=document.querySelector('main, article')||document.body;
 const bodyText=((mainRoot&&mainRoot.innerText)||'').replace(/\s+/g,' ').trim();
 const words=bodyText?bodyText.split(/\s+/).filter(Boolean):[];
 const hasTable=Boolean(document.querySelector('table'));
 const hasFaq=jsonLdTypes.includes('FAQPage')||Boolean(document.querySelector('details'))||/\b(?:faq|вопросы|ответы)\b/i.test(headings.map(h=>h.text).join(' '));
 const hasPricing=jsonLdTypes.includes('Offer')||jsonLdTypes.includes('Product')||/(?:[$€£₽]\s?\d|\/mo\b|pricing|тариф|цена)/i.test(bodyText);

 const termFreq=new Map();
 for(const w of (bodyText.toLowerCase().match(/[\p{L}\p{N}-]{4,}/gu)||[])){
  termFreq.set(w,(termFreq.get(w)||0)+1);
 }
 const topTerms=[...termFreq.entries()].sort((a,b)=>b[1]-a[1]).slice(0,25).map(([t])=>t);

 const host=location.hostname.toLowerCase();
 let serp={isSerp:false,engine:null,query:'',urls:[]};
 const isGoogle=/(^|\.)google\./.test(host)&&location.pathname.startsWith('/search');
 const isYandex=/(^|\.)ya(?:ndex)?\./.test(host)&&location.pathname.startsWith('/search');
 const isDdg=/(^|\.)duckduckgo\./.test(host);
 const isBing=/(^|\.)bing\./.test(host)&&location.pathname.startsWith('/search');
 if(isGoogle||isYandex||isDdg||isBing){
  const qEl=document.querySelector('input[name="q"], input[name="text"], textarea[name="q"]');
  const q=(qEl&&qEl.value)||new URLSearchParams(location.search).get('q')||new URLSearchParams(location.search).get('text')||'';
  const selector=isGoogle?'#search a h3, div.g a[href]':isYandex?'li.serp-item a[href]':isDdg?'article a[data-testid="result-title-a"]':'li.b_algo h2 a[href]';
  const foundUrls=[];
  const seen=new Set();
  for(const node of document.querySelectorAll(selector)){
   const a=node.tagName==='A'?node:node.closest('a');
   if(!a)continue;
   const href=(a.href||'').trim();
   if(!href.startsWith('http')||href.includes(host))continue;
   if(!seen.has(href)){seen.add(href);foundUrls.push(href);}
   if(foundUrls.length>=10)break;
  }
  if(foundUrls.length>0){
   serp={
    isSerp:true,
    engine:isGoogle?'google':isYandex?'yandex':isDdg?'duckduckgo':'bing',
    query:q.trim(),
    urls:foundUrls
   };
  }
 }

 const paragraphs=Array.from(document.querySelectorAll('main p, article p, p')).slice(0,60)
  .map(p=>(p.innerText||p.textContent||'').replace(/\s+/g,' ').trim())
  .filter(Boolean);
 const markdownLines=[];
 for(const h of headings)markdownLines.push(`${'#'.repeat(h.level)} ${h.text}`);
 for(const p of paragraphs.slice(0,25))markdownLines.push(p);

 return {
  url:location.href,
  origin:location.origin,
  title,
  description,
  canonical,
  robots,
  hasViewport,
  headings,
  linksCount:links.length,
  imagesCount:images.length,
  missingAltCount,
  missingDimensionsCount,
  firstImageLazy,
  blockingHeadScripts,
  jsonLdTypes:[...new Set(jsonLdTypes)],
  jsonLdErrors,
  wordCount:words.length,
  hasTable,
  hasFaq,
  hasPricing,
  topTerms,
  serp,
  packet:{
   schemaVersion:1,
   locale:document.documentElement.lang?.toLowerCase().startsWith('en')?'en':'ru',
   market:'',
   primaryQuery:'',
   readerTask:'',
   article:{
    title,
    description,
    renderedH1:headings.find(h=>h.level===1)?.text||'',
    h1Mode:'markdown',
    markdown:markdownLines.join('\n\n')||title||'Empty document'
   },
   sources:[],
   claims:[],
   glossary:[],
   reviewedSections:[]
  }
 };
}

let locale=(navigator.language||'').toLowerCase().startsWith('ru')?'ru':'en';
let latestSnapshot=null;
let latestEval=null;
let latestExportJson='';
let latestPromptText='';

const badgeText=document.getElementById('badge-text');
const langBtn=document.getElementById('lang-btn');
const noteText=document.getElementById('note-text');
const inspectBtn=document.getElementById('inspect-btn');
const extractBtn=document.getElementById('extract-btn');
const copyPacketBtn=document.getElementById('copy-packet-btn');
const copyPromptBtn=document.getElementById('copy-prompt-btn');
const openWebBtn=document.getElementById('open-web-btn');
const statusEl=document.getElementById('status');
const resultsEl=document.getElementById('results');
const metricsEl=document.getElementById('metrics');
const extractPreview=document.getElementById('extract-preview');
const findingsEl=document.getElementById('findings');

function applyCopy(){
 const t=extCopy[locale];
 document.documentElement.lang=locale;
 badgeText.textContent=t.badge;
 langBtn.textContent=t.langLabel;
 noteText.textContent=t.note;
 inspectBtn.textContent=t.inspectBtn;
 extractBtn.textContent=t.extractBtn;
 copyPacketBtn.textContent=t.copyPacketBtn;
 copyPromptBtn.textContent=t.copyPromptBtn;
 openWebBtn.textContent=t.openWebBtn;
}

function renderAudit(snapshot){
 const t=extCopy[locale];
 latestSnapshot=snapshot;
 latestEval=evaluateTabAudit(snapshot,locale);
 latestExportJson=JSON.stringify(snapshot.packet,null,2);
 latestPromptText=formatAiEditorPrompt(snapshot,latestEval,locale);
 copyPacketBtn.disabled=false;
 copyPromptBtn.disabled=false;
 openWebBtn.disabled=false;
 resultsEl.hidden=false;
 extractPreview.hidden=true;

 metricsEl.replaceChildren();
 for(const [val,label] of [
  [latestEval.metrics.headings,t.mHeadings],
  [latestEval.metrics.words,t.mWords],
  [latestEval.metrics.findings,t.mIssues]
 ]){
  const box=document.createElement('div');
  box.className='rl-ext-metric';
  const st=document.createElement('strong');
  st.textContent=String(val);
  const sp=document.createElement('span');
  sp.textContent=label;
  box.append(st,sp);
  metricsEl.append(box);
 }

 findingsEl.replaceChildren();
 if(latestEval.findings.length===0){
  const ok=document.createElement('li');
  ok.textContent=t.okEmpty;
  findingsEl.append(ok);
 }else{
  for(const f of latestEval.findings){
   const li=document.createElement('li');
   li.dataset.sev=f.severity;
   li.textContent=`[${f.code}] ${f.message}`;
   findingsEl.append(li);
  }
 }
}

async function captureActiveTab(){
 const t=extCopy[locale];
 statusEl.textContent=t.reading;
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!tab?.id){
  statusEl.textContent=t.noTab;
  return null;
 }
 const injection=await chrome.scripting.executeScript({target:{tabId:tab.id},func:extractActivePageDom});
 const snapshot=injection?.[0]?.result;
 if(!snapshot){
  statusEl.textContent=t.readFail;
  return null;
 }
 return snapshot;
}

langBtn.addEventListener('click',()=>{
 locale=locale==='ru'?'en':'ru';
 applyCopy();
 if(latestSnapshot)renderAudit(latestSnapshot);
});

inspectBtn.addEventListener('click',async()=>{
 const t=extCopy[locale];
 try{
  const snapshot=await captureActiveTab();
  if(!snapshot)return;
  renderAudit(snapshot);
  statusEl.textContent=t.doneInspect;
 }catch{
  statusEl.textContent=t.blocked;
 }
});

extractBtn.addEventListener('click',async()=>{
 const t=extCopy[locale];
 try{
  const snapshot=await captureActiveTab();
  if(!snapshot)return;
  renderAudit(snapshot);
  const extracted=buildCompetitorOrSerpExport(snapshot);
  latestExportJson=JSON.stringify(extracted.payload,null,2);
  extractPreview.hidden=false;
  extractPreview.textContent=latestExportJson.slice(0,1200);
  statusEl.textContent=extracted.mode==='serp-cluster'?t.doneExtractSerp:t.doneExtractComp;
 }catch{
  statusEl.textContent=t.blocked;
 }
});

copyPacketBtn.addEventListener('click',async()=>{
 const t=extCopy[locale];
 if(!latestExportJson)return;
 try{
  await navigator.clipboard.writeText(latestExportJson);
  statusEl.textContent=t.copiedPacket;
 }catch{
  statusEl.textContent=t.copyFail;
 }
});

copyPromptBtn.addEventListener('click',async()=>{
 const t=extCopy[locale];
 if(!latestPromptText)return;
 try{
  await navigator.clipboard.writeText(latestPromptText);
  statusEl.textContent=t.copiedPrompt;
 }catch{
  statusEl.textContent=t.copyFail;
 }
});

openWebBtn.addEventListener('click',async()=>{
 const t=extCopy[locale];
 if(!latestSnapshot)return;
 try{
  if(latestExportJson)await navigator.clipboard.writeText(latestExportJson);
  const targetUrl=resolveWebPanelUrl(locale,'geo-readiness-checker');
  if(chrome?.tabs?.create)await chrome.tabs.create({url:targetUrl});
  statusEl.textContent=t.copiedAndWeb;
 }catch{
  statusEl.textContent=t.copyFail;
 }
});

applyCopy();
