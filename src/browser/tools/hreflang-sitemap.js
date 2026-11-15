import {auditHreflangMatrix} from '../../hreflang-audit.mjs';
import {el,createToolFrame,renderMetrics,renderFindings,emitToolEvent,downloadText} from '../tool-shell.mjs';

const copy={
 ru:{
  title:'Инспектор Hreflang-матрицы и Sitemap Diff',
  subtitle:'Сравните две локальные XML-карты сайта (до и после релиза) на добавленные/удалённые URL и проверьте взаимность обратных ссылок hreflang и x-default.',
  modeLabel:'Hreflang & Sitemap Diff',
  exampleBtn:'Заполнить пример',
  beforeLabel:'Sitemap XML (ДО) или JSON hreflang-матрицы',
  afterLabel:'Sitemap XML (ПОСЛЕ) для diff',
  runBtn:'Проверить diff и hreflang',
  jsonBtn:'Скачать JSON-отчёт',
  doneOk:'Расхождений и ошибок возвратных hreflang не обнаружено.',
  doneWarn:'Обнаружены отличия URL или ошибки матрицы hreflang.',
  invalidInput:'Вставьте корректный XML (<urlset>) или JSON-матрицу hreflang.',
  mBefore:'URL до',
  mAfter:'URL после',
  mAdded:'Добавлено',
  mRemoved:'Удалено',
  colStatus:'Изменение',
  colUrl:'URL'
 },
 en:{
  title:'Hreflang Matrix & Sitemap Diff Inspector',
  subtitle:'Compare two local XML sitemaps (before vs after release) for added/removed URLs and validate reciprocal hreflang, self-links and x-default rules.',
  modeLabel:'Hreflang & Sitemap Diff',
  exampleBtn:'Load sample input',
  beforeLabel:'Before Sitemap XML (or Hreflang JSON matrix)',
  afterLabel:'After Sitemap XML (optional diff target)',
  runBtn:'Inspect diff & hreflang',
  jsonBtn:'Download JSON report',
  doneOk:'Zero sitemap regressions or broken reciprocal hreflang links found.',
  doneWarn:'Sitemap diff changes or hreflang matrix issues detected.',
  invalidInput:'Provide valid XML (<urlset>) or a JSON hreflang matrix.',
  mBefore:'URLs before',
  mAfter:'URLs after',
  mAdded:'Added',
  mRemoved:'Removed',
  colStatus:'Delta',
  colUrl:'URL'
 }
};

const sampleBeforeXml=`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://example.org/tools/llms-txt</loc>
    <xhtml:link rel="alternate" hreflang="ru" href="https://example.org/tools/llms-txt"/>
    <xhtml:link rel="alternate" hreflang="en" href="https://example.org/en/tools/llms-txt"/>
  </url>
  <url>
    <loc>https://example.org/en/tools/llms-txt</loc>
    <xhtml:link rel="alternate" hreflang="en" href="https://example.org/en/tools/llms-txt"/>
    <xhtml:link rel="alternate" hreflang="ru" href="https://example.org/tools/llms-txt"/>
  </url>
  <url>
    <loc>https://example.org/legacy-page</loc>
  </url>
</urlset>`;

const sampleAfterXml=`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://example.org/tools/llms-txt</loc>
    <xhtml:link rel="alternate" hreflang="ru" href="https://example.org/tools/llms-txt"/>
    <xhtml:link rel="alternate" hreflang="en" href="https://example.org/en/tools/llms-txt"/>
  </url>
  <url>
    <loc>https://example.org/en/tools/llms-txt</loc>
    <xhtml:link rel="alternate" hreflang="en" href="https://example.org/en/tools/llms-txt"/>
  </url>
  <url>
    <loc>https://example.org/tools/eeat-audit</loc>
  </url>
</urlset>`;

function parseXmlSitemap(xmlText){
 const urls=[];
 const matrixPages=[];
 const urlBlocks=[...String(xmlText||'').matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)];
 for(const block of urlBlocks){
  const body=block[1];
  const locMatch=body.match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/i);
  if(!locMatch)continue;
  const loc=locMatch[1].replace(/&amp;/g,'&').trim();
  if(!loc)continue;
  urls.push(loc);
  const alternates=[];
  for(const tag of body.matchAll(/<[^>]*:link\b([^>]+)>|<link\b([^>]+)>/gi)){
   const attrs=tag[1]||tag[2]||'';
   const rel=(attrs.match(/\brel=["']([^"']+)["']/i)||[])[1]||'';
   const hl=(attrs.match(/\bhreflang=["']([^"']+)["']/i)||[])[1]||'';
   const href=(attrs.match(/\bhref=["']([^"']+)["']/i)||[])[1]||'';
   if(rel.toLowerCase()==='alternate'&&hl&&href){
    alternates.push({hreflang:hl.trim(),href:href.replace(/&amp;/g,'&').trim()});
   }
  }
  matrixPages.push({url:loc,alternates});
 }
 return {urls,matrixPages};
}

export function mount(root,options={}){
 const language=options.language==='ru'?'ru':'en';
 const t=copy[language];
 const frame=createToolFrame({root,title:t.title,subtitle:t.subtitle,modeLabel:t.modeLabel,language});

 const beforeArea=el('textarea',{rows:9,value:sampleBeforeXml});
 const afterArea=el('textarea',{rows:9,value:sampleAfterXml});
 const runBtn=el('button',{type:'submit',className:'agent-kit-download'},t.runBtn);
 const sampleBtn=el('button',{type:'button',className:'reproleaf-text-button'},t.exampleBtn);
 const jsonBtn=el('button',{type:'button',className:'reproleaf-text-button',disabled:true},t.jsonBtn);

 frame.form.append(
  el('label',{},t.beforeLabel,beforeArea),
  el('label',{},t.afterLabel,afterArea),
  el('div',{className:'agent-kit-actions'},runBtn,sampleBtn,jsonBtn)
 );

 let latestReport=null;

 sampleBtn.addEventListener('click',()=>{
  beforeArea.value=sampleBeforeXml;
  afterArea.value=sampleAfterXml;
 });

 jsonBtn.addEventListener('click',()=>{
  if(!latestReport)return;
  downloadText('reproleaf-hreflang-sitemap-diff.json',JSON.stringify(latestReport,null,2),'application/json');
 });

 frame.form.addEventListener('submit',event=>{
  event.preventDefault();
  try{
   const rawBefore=beforeArea.value.trim();
   const rawAfter=afterArea.value.trim();
   if(!rawBefore)throw Error(t.invalidInput);

   if(rawBefore.startsWith('{')||rawBefore.startsWith('[')){
    const json=JSON.parse(rawBefore);
    const pages=Array.isArray(json)?json:json.pages;
    const matrix=auditHreflangMatrix({pages});
    latestReport={mode:'hreflang-json',matrix};
    jsonBtn.disabled=false;
    frame.extra.replaceChildren();
    renderMetrics(frame.metrics,[
     {value:matrix.summary.pagesChecked,label:'Pages'},
     {value:matrix.summary.missingReturnLinks,label:'Missing return'},
     {value:matrix.summary.missingSelfLinks,label:'Missing self'},
     {value:matrix.findings.length,label:'Findings'}
    ]);
    renderFindings(frame.findings,frame.findingsTitle,matrix.findings,language);
    frame.status.textContent=matrix.ok?t.doneOk:t.doneWarn;
    return;
   }

   const parsedBefore=parseXmlSitemap(rawBefore);
   const parsedAfter=rawAfter?parseXmlSitemap(rawAfter):parsedBefore;
   const beforeSet=new Set(parsedBefore.urls);
   const afterSet=new Set(parsedAfter.urls);
   const added=parsedAfter.urls.filter(u=>!beforeSet.has(u));
   const removed=parsedBefore.urls.filter(u=>!afterSet.has(u));

   const hreflangTarget=parsedAfter.matrixPages.filter(p=>p.alternates.length>0);
   const hreflangAudit=hreflangTarget.length>0?auditHreflangMatrix({pages:parsedAfter.matrixPages}):{ok:true,findings:[]};

   const findings=[
    ...removed.map(u=>({code:'SITEMAP_URL_REMOVED',severity:'warning',target:u,message:`URL removed in target sitemap: ${u}`})),
    ...hreflangAudit.findings
   ];

   latestReport={beforeCount:parsedBefore.urls.length,afterCount:parsedAfter.urls.length,added,removed,hreflangAudit};
   jsonBtn.disabled=false;

   renderMetrics(frame.metrics,[
    {value:parsedBefore.urls.length,label:t.mBefore},
    {value:parsedAfter.urls.length,label:t.mAfter},
    {value:added.length,label:t.mAdded},
    {value:removed.length,label:t.mRemoved}
   ]);
   renderFindings(frame.findings,frame.findingsTitle,findings,language);

   const deltaRows=[
    ...added.map(u=>({delta:'+ added',cls:'reproleaf-state--good',url:u})),
    ...removed.map(u=>({delta:'- removed',cls:'reproleaf-state--problem',url:u}))
   ];
   frame.extra.replaceChildren();
   if(deltaRows.length>0){
    frame.extra.append(el('table',{className:'reproleaf-page-table'},
     el('thead',{},el('tr',{},el('th',{},t.colStatus),el('th',{},t.colUrl))),
     el('tbody',{},...deltaRows.slice(0,50).map(r=>el('tr',{},
      el('td',{},el('span',{className:`reproleaf-state ${r.cls}`},r.delta)),
      el('td',{},r.url)
     )))
    ));
   }
   frame.status.textContent=findings.length===0?t.doneOk:t.doneWarn;
   emitToolEvent(root,{tool:'hreflang-sitemap',ok:hreflangAudit.ok&&removed.length===0,errorCount:findings.filter(f=>f.severity==='error').length,warningCount:findings.filter(f=>f.severity==='warning').length,codes:findings.map(f=>f.code)});
  }catch(err){
   frame.status.textContent=err?.message||t.invalidInput;
  }
 });
}
