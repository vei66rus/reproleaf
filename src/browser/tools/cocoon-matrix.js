import {auditCannibalizationMatrix} from '../../cannibalization-audit.mjs';
import {auditIndexationHygiene} from '../../indexation-hygiene-audit.mjs';
import {auditCocoonGraph} from '../../cocoon-audit.mjs';
import {el,createToolFrame,renderMetrics,renderFindings,emitToolEvent,downloadText} from '../tool-shell.mjs';

const copy={
 ru:{
  title:'Матрица перелинковки, каннибализации и гигиены индексации',
  subtitle:'Загрузите JSON-карту страниц: проверьте структуру тематических коконов, orphan-страницы, глубину кликов, каннибализацию запросов и мусорные параметры URL.',
  modeLabel:'Cocoon Matrix',
  exampleBtn:'Заполнить пример',
  siteUrlLabel:'Корневой URL сайта (origin)',
  thresholdLabel:'Порог сходства каннибализации (0.3–1.0)',
  pagesLabel:'JSON страниц ([{ url, title, h1, primaryQuery, canonical, noindex, cluster, kind, links: [{ href, anchor }] }])',
  runBtn:'Построить матрицу',
  csvBtn:'Скачать CSV',
  jsonBtn:'Скачать JSON',
  invalidUrl:'Укажите корректный http/https URL сайта.',
  invalidJson:'Введите корректный JSON-массив страниц (от 1 до 500) или объект { siteUrl, pages }.',
  doneOk:'Каннибализации и критических ошибок перелинковки не найдено.',
  doneWarn:'Обнаружены пересечения запросов, проблемы коконов или ошибки индексации.',
  mPages:'Страниц проверено',
  mEdges:'Связей / коконов',
  mPairs:'Пар каннибализации',
  mIssues:'Orphan / ошибки индексации',
  originSkipped:'Коконовый граф пропущен: URL страниц не совпадают с origin сайта.',
  cocoonHeading:'Матрица страниц и перелинковки',
  cannibHeading:'Пары с пересечением интента',
  urlCol:'Страница',
  clusterCol:'Кокон / тип',
  degreeCol:'Вх / Исх',
  depthCol:'Глубина',
  pairCol:'Конфликтная пара',
  simCol:'Сходство',
  termsCol:'Общие термины'
 },
 en:{
  title:'Topic Cocoon, Cannibalization & Indexation Matrix',
  subtitle:'Inspect topic cluster links, orphan pages, click depth, query cannibalization pairs and URL indexation hygiene from a single JSON inventory.',
  modeLabel:'Cocoon Matrix',
  exampleBtn:'Load example',
  siteUrlLabel:'Site root URL (origin)',
  thresholdLabel:'Cannibalization overlap threshold (0.3-1.0)',
  pagesLabel:'Pages JSON ([{ url, title, h1, primaryQuery, canonical, noindex, cluster, kind, links: [{ href, anchor }] }])',
  runBtn:'Build matrix',
  csvBtn:'Download CSV',
  jsonBtn:'Download JSON',
  invalidUrl:'Enter a valid http/https site URL.',
  invalidJson:'Enter a valid JSON array of 1 to 500 pages, or { siteUrl, pages }.',
  doneOk:'No cannibalization conflicts or critical cocoon errors detected.',
  doneWarn:'Query overlap, cocoon structure or indexation issues detected.',
  mPages:'Pages checked',
  mEdges:'Edges / Clusters',
  mPairs:'Cannibal pairs',
  mIssues:'Orphans / Index errors',
  originSkipped:'Cocoon graph skipped: page URLs do not match siteUrl origin.',
  cocoonHeading:'Page Link & Depth Matrix',
  cannibHeading:'Overlapping Intent Pairs',
  urlCol:'Page URL',
  clusterCol:'Cluster / Kind',
  degreeCol:'In / Out',
  depthCol:'Depth',
  pairCol:'Overlapping pair',
  simCol:'Overlap',
  termsCol:'Shared terms'
 }
};

function escapeCsvCell(value){
 const raw=String(value??'').replace(/\r\n|\r|\n/g,' ');
 const neutralized=/^[=+\-@\t]/.test(raw)?`'${raw}`:raw;
 return `"${neutralized.replace(/"/g,'""')}"`;
}

function buildCsvReport(pages,cocoonMap,cannibalCountMap,hygieneCountMap){
 const headers=['url','cluster','kind','in_degree','out_degree','click_depth','cannibal_pairs','hygiene_findings'];
 const lines=[headers.join(',')];
 for(const p of pages){
  const node=cocoonMap.get(p.url);
  lines.push([
   escapeCsvCell(p.url),
   escapeCsvCell(node?.cluster||p.cluster||''),
   escapeCsvCell(node?.kind||p.kind||'page'),
   escapeCsvCell(node?node.inDegree:''),
   escapeCsvCell(node?node.outDegree:''),
   escapeCsvCell(node&&node.clickDepth!==null?node.clickDepth:''),
   escapeCsvCell(cannibalCountMap.get(p.url)||0),
   escapeCsvCell(hygieneCountMap.get(p.url)||0)
  ].join(','));
 }
 return `${lines.join('\n')}\n`;
}

function buildExample(language){
 if(language==='ru'){
  return {
   siteUrl:'https://evolkov.tech',
   pages:[
    {
     url:'https://evolkov.tech/seo-audit',
     title:'Технический SEO аудит сайта',
     h1:'Технический SEO аудит сайта',
     primaryQuery:'seo аудит сайта',
     cluster:'seo-audit',
     kind:'hub',
     links:[
      {href:'https://evolkov.tech/seo-audit/checklist',anchor:'чек-лист технического аудита'},
      {href:'https://evolkov.tech/seo-audit/robots-txt',anchor:'подробнее'}
     ]
    },
    {
     url:'https://evolkov.tech/seo-audit/checklist',
     title:'Чек-лист SEO аудита и индексации',
     h1:'Технический SEO аудит сайта',
     primaryQuery:'seo аудит сайта',
     cluster:'seo-audit',
     kind:'supporting',
     links:[
      {href:'https://evolkov.tech/seo-audit',anchor:'вернуться к хабу SEO аудита'}
     ]
    },
    {
     url:'https://evolkov.tech/seo-audit/robots-txt?utm_source=tg',
     canonical:'https://evolkov.tech/seo-audit/robots-txt?utm_source=tg',
     noindex:false,
     title:'Настройка robots.txt для AI-ботов',
     h1:'Настройка robots.txt',
     primaryQuery:'robots txt ai боты',
     cluster:'seo-audit',
     kind:'supporting',
     links:[]
    },
    {
     url:'https://evolkov.tech/seo-audit/orphan-guide',
     title:'Словарь мета-тегов',
     h1:'Мета-теги для поиска',
     primaryQuery:'словарь мета тегов',
     cluster:'seo-audit',
     kind:'supporting',
     links:[]
    }
   ]
  };
 }
 return {
  siteUrl:'https://evolkov.tech',
  pages:[
   {
    url:'https://evolkov.tech/seo-audit',
    title:'Technical SEO Audit Guide',
    h1:'Technical SEO Audit Guide',
    primaryQuery:'technical seo audit',
    cluster:'seo-audit',
    kind:'hub',
    links:[
     {href:'https://evolkov.tech/seo-audit/checklist',anchor:'technical audit checklist'},
     {href:'https://evolkov.tech/seo-audit/robots-txt',anchor:'read more'}
    ]
   },
   {
    url:'https://evolkov.tech/seo-audit/checklist',
    title:'Technical SEO Audit Checklist',
    h1:'Technical SEO Audit Guide',
    primaryQuery:'technical seo audit',
    cluster:'seo-audit',
    kind:'supporting',
    links:[
     {href:'https://evolkov.tech/seo-audit',anchor:'technical seo audit hub'}
    ]
   },
   {
    url:'https://evolkov.tech/seo-audit/robots-txt?utm_source=newsletter',
    canonical:'https://evolkov.tech/seo-audit/robots-txt?utm_source=newsletter',
    noindex:false,
    title:'Robots.txt Rules for AI Search Crawlers',
    h1:'Robots.txt Configuration',
    primaryQuery:'robots txt ai crawlers',
    cluster:'seo-audit',
    kind:'supporting',
    links:[]
   },
   {
    url:'https://evolkov.tech/seo-audit/orphan-glossary',
    title:'Meta Tag Glossary',
    h1:'Search Meta Tags',
    primaryQuery:'meta tag glossary',
    cluster:'seo-audit',
    kind:'supporting',
    links:[]
   }
  ]
 };
}

function isSafeHttpUrl(raw){
 try{
  const parsed=new URL(raw);
  return parsed.protocol==='http:'||parsed.protocol==='https:';
 }catch{
  return false;
 }
}

function normalizePagesPayload(parsed){
 const list=Array.isArray(parsed)?parsed:Array.isArray(parsed?.pages)?parsed.pages:null;
 if(!list||list.length===0||list.length>500)return null;
 return {
  siteUrl:typeof parsed?.siteUrl==='string'?parsed.siteUrl:undefined,
  overlapThreshold:typeof parsed?.overlapThreshold==='number'?parsed.overlapThreshold:undefined,
  pages:list
 };
}

export function mount(root){
 const language=root.dataset.language==='en'?'en':'ru';
 const t=copy[language];
 const frame=createToolFrame({root,title:t.title,subtitle:t.subtitle,modeLabel:t.modeLabel,language});

 const siteUrlInput=el('input',{type:'url',className:'ym-disable-keys',value:'https://evolkov.tech',maxLength:2048});
 const thresholdInput=el('input',{type:'number',className:'ym-disable-keys',value:'0.6',min:'0.3',max:'1',step:'0.05'});
 const pagesInput=el('textarea',{className:'ym-disable-keys',rows:11,spellcheck:'false',maxLength:500000});

 const exampleBtn=el('button',{type:'button',className:'reproleaf-text-button'},t.exampleBtn);
 const runBtn=el('button',{type:'submit',className:'agent-kit-download'},t.runBtn);
 const csvBtn=el('button',{type:'button',className:'reproleaf-text-button',disabled:true},t.csvBtn);
 const jsonBtn=el('button',{type:'button',className:'reproleaf-text-button',disabled:true},t.jsonBtn);

 exampleBtn.addEventListener('click',()=>{
  const ex=buildExample(language);
  siteUrlInput.value=ex.siteUrl;
  thresholdInput.value='0.6';
  pagesInput.value=JSON.stringify(ex.pages,null,2);
 });

 frame.form.append(
  exampleBtn,
  el('div',{className:'reproleaf-fields'},
   el('label',{},t.siteUrlLabel,siteUrlInput),
   el('label',{},t.thresholdLabel,thresholdInput)
  ),
  el('label',{},t.pagesLabel,pagesInput),
  el('div',{className:'agent-kit-actions'},runBtn,csvBtn,jsonBtn)
 );

 let lastReport=null;
 let lastCsv='';

 frame.form.addEventListener('submit',(event)=>{
  event.preventDefault();
  frame.extra.replaceChildren();
  lastReport=null;
  lastCsv='';
  csvBtn.disabled=true;
  jsonBtn.disabled=true;

  const siteRaw=siteUrlInput.value.trim();
  if(!isSafeHttpUrl(siteRaw)){
   frame.status.textContent=t.invalidUrl;
   renderMetrics(frame.metrics,[]);
   frame.findings.replaceChildren();
   frame.findingsTitle.hidden=true;
   return;
  }

  let parsedJson;
  try{
   parsedJson=JSON.parse(pagesInput.value.trim());
  }catch{
   frame.status.textContent=t.invalidJson;
   renderMetrics(frame.metrics,[]);
   frame.findings.replaceChildren();
   frame.findingsTitle.hidden=true;
   return;
  }

  const normalized=normalizePagesPayload(parsedJson);
  if(!normalized){
   frame.status.textContent=t.invalidJson;
   renderMetrics(frame.metrics,[]);
   frame.findings.replaceChildren();
   frame.findingsTitle.hidden=true;
   return;
  }

  const rawPages=normalized.pages;
  const thresholdNum=Number(thresholdInput.value);
  const overlapThreshold=Number.isFinite(thresholdNum)&&thresholdNum>=0.3&&thresholdNum<=1?thresholdNum:0.6;
  const effectiveSiteUrl=normalized.siteUrl&&isSafeHttpUrl(normalized.siteUrl)?normalized.siteUrl:siteRaw;
  const siteOrigin=new URL(effectiveSiteUrl).origin;

  try{
   const hygieneInputPages=[];
   const cannibInputPages=[];
   const cocoonInputPages=[];
   const seenCocoonUrls=new Set();

   for(const item of rawPages){
    if(!item||typeof item!=='object'||typeof item.url!=='string'||!isSafeHttpUrl(item.url)){
     throw Error(t.invalidJson);
    }
    const cleanUrl=item.url.trim();
    hygieneInputPages.push({
     url:cleanUrl,
     canonical:typeof item.canonical==='string'&&isSafeHttpUrl(item.canonical)?item.canonical.trim():undefined,
     noindex:Boolean(item.noindex),
     hasPrevLink:Boolean(item.hasPrevLink),
     hasNextLink:Boolean(item.hasNextLink)
    });
    cannibInputPages.push({
     url:cleanUrl,
     title:typeof item.title==='string'?item.title.slice(0,400):'',
     h1:typeof item.h1==='string'?item.h1.slice(0,400):'',
     primaryQuery:typeof item.primaryQuery==='string'?item.primaryQuery.slice(0,200):undefined,
     headings:Array.isArray(item.headings)?item.headings.filter(h=>typeof h==='string').slice(0,50).map(h=>h.slice(0,300)):[]
    });
    const parsedUrl=new URL(cleanUrl);
    parsedUrl.hash='';
    if(parsedUrl.origin===siteOrigin&&!seenCocoonUrls.has(parsedUrl.href)){
     seenCocoonUrls.add(parsedUrl.href);
     cocoonInputPages.push({
      url:parsedUrl.href,
      title:typeof item.title==='string'?item.title.slice(0,300):undefined,
      cluster:typeof item.cluster==='string'?item.cluster.slice(0,120):undefined,
      kind:['hub','cluster','supporting','money','page'].includes(item.kind)?item.kind:'page',
      links:Array.isArray(item.links)
       ?item.links.slice(0,500).filter(l=>l&&typeof l.href==='string').map(l=>({
         href:l.href.slice(0,2048),
         anchor:typeof l.anchor==='string'?l.anchor.slice(0,300):''
        }))
       :[]
     });
    }
   }

   const hygieneRes=auditIndexationHygiene({pages:hygieneInputPages});
   const cannibRes=cannibInputPages.length>=2
    ?auditCannibalizationMatrix({pages:cannibInputPages,overlapThreshold})
    :{ok:true,summary:{pagesChecked:cannibInputPages.length,overlappingPairs:0,exactQueryConflicts:0},pairs:[],findings:[]};
   const cocoonRes=cocoonInputPages.length>=1
    ?auditCocoonGraph({siteUrl:effectiveSiteUrl,pages:cocoonInputPages})
    :null;

   const combinedFindings=[
    ...(cocoonRes?cocoonRes.findings:[]),
    ...cannibRes.findings,
    ...hygieneRes.findings
   ];
   const errorCount=combinedFindings.filter(f=>f.severity==='error').length;
   const warningCount=combinedFindings.filter(f=>f.severity==='warning').length;
   const ok=errorCount===0&&cannibRes.summary.overlappingPairs===0;

   frame.status.textContent=ok?t.doneOk:t.doneWarn;
   renderMetrics(frame.metrics,[
    {label:t.mPages,value:hygieneRes.summary.pagesChecked},
    {label:t.mEdges,value:cocoonRes?`${cocoonRes.summary.internalEdges} / ${cocoonRes.summary.clusters}`:'0 / 0'},
    {label:t.mPairs,value:cannibRes.summary.overlappingPairs},
    {label:t.mIssues,value:`${cocoonRes?cocoonRes.summary.orphans:0} / ${hygieneRes.summary.errors}`}
   ]);

   const cocoonMap=new Map((cocoonRes?.pages||[]).map(p=>[p.url,p]));
   const cannibCountMap=new Map();
   for(const pair of cannibRes.pairs){
    cannibCountMap.set(pair.urlA,(cannibCountMap.get(pair.urlA)||0)+1);
    cannibCountMap.set(pair.urlB,(cannibCountMap.get(pair.urlB)||0)+1);
   }
   const hygieneCountMap=new Map();
   for(const hf of hygieneRes.findings){
    hygieneCountMap.set(hf.url,(hygieneCountMap.get(hf.url)||0)+1);
   }

   if(!cocoonRes){
    frame.extra.append(el('p',{className:'reproleaf-help'},t.originSkipped));
   }else{
    const rows=cocoonRes.pages.slice(0,40).map(node=>el('tr',{},
     el('td',{},node.url),
     el('td',{},`${node.cluster||'-'} / ${node.kind}`),
     el('td',{},`${node.inDegree} / ${node.outDegree}`),
     el('td',{},node.clickDepth===null?'-':String(node.clickDepth))
    ));
    frame.extra.append(
     el('h4',{},t.cocoonHeading),
     el('table',{className:'reproleaf-page-table'},
      el('thead',{},el('tr',{},el('th',{},t.urlCol),el('th',{},t.clusterCol),el('th',{},t.degreeCol),el('th',{},t.depthCol))),
      el('tbody',{},...rows)
     )
    );
   }

   if(cannibRes.pairs.length>0){
    const pairRows=cannibRes.pairs.slice(0,25).map(pair=>el('tr',{},
     el('td',{},`${pair.urlA} <-> ${pair.urlB}`),
     el('td',{},`${Math.round(pair.similarity*100)}%`),
     el('td',{},pair.sharedTerms.join(', ')||'-')
    ));
    frame.extra.append(
     el('h4',{},t.cannibHeading),
     el('table',{className:'reproleaf-page-table'},
      el('thead',{},el('tr',{},el('th',{},t.pairCol),el('th',{},t.simCol),el('th',{},t.termsCol))),
      el('tbody',{},...pairRows)
     )
    );
   }

   renderFindings(frame.findings,frame.findingsTitle,combinedFindings,language);

   lastReport={
    siteUrl:effectiveSiteUrl,
    overlapThreshold,
    hygiene:hygieneRes,
    cannibalization:cannibRes,
    cocoon:cocoonRes
   };
   lastCsv=buildCsvReport(hygieneInputPages,cocoonMap,cannibCountMap,hygieneCountMap);
   csvBtn.disabled=false;
   jsonBtn.disabled=false;

   emitToolEvent(root,{
    tool:'cocoon-matrix',
    ok,
    errorCount,
    warningCount,
    codes:[...new Set(combinedFindings.map(f=>f.code))],
    action:'run'
   });
  }catch(err){
   frame.status.textContent=err?.message||t.invalidJson;
   renderMetrics(frame.metrics,[]);
   frame.findings.replaceChildren();
   frame.findingsTitle.hidden=true;
  }
 });

 csvBtn.addEventListener('click',()=>{
  if(!lastCsv)return;
  downloadText('cocoon-matrix.csv',lastCsv,'text/csv;charset=utf-8');
  emitToolEvent(root,{tool:'cocoon-matrix',ok:true,errorCount:0,warningCount:0,codes:[],action:'export'});
 });

 jsonBtn.addEventListener('click',()=>{
  if(!lastReport)return;
  downloadText('cocoon-matrix-audit.json',JSON.stringify(lastReport,null,2));
  emitToolEvent(root,{tool:'cocoon-matrix',ok:true,errorCount:0,warningCount:0,codes:[],action:'export'});
 });

 return ()=>{};
}
