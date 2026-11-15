export const extCopy={
 ru:{
  badge:'activeTab only',
  note:'Чтение открытой вкладки только по клику. Нулевая сетевая телеметрия.',
  inspectBtn:'Проверить вкладку',
  extractBtn:'SERP / Конкурент JSON',
  copyPacketBtn:'Пакет Reproleaf',
  copyPromptBtn:'Промпт для Cursor / Claude',
  openWebBtn:'Открыть на evolkov.tech',
  tabInspect:'Аудит страницы',
  tabExtract:'SERP / Gap',
  langLabel:'EN',
  reading:'Чтение DOM активной вкладки…',
  noTab:'Активная вкладка недоступна.',
  readFail:'Не удалось прочитать DOM этой вкладки.',
  blocked:'Браузер не разрешил доступ к системной странице.',
  doneInspect:'Проверка завершена: SEO, JSON-LD, DOM и AI-видимость.',
  doneExtractSerp:'Извлечена SERP-выдача для кластеризатора Reproleaf.',
  doneExtractComp:'Извлечён профиль страницы для SERP Gap Analyzer.',
  copiedPacket:'JSON-пакет скопирован в буфер обмена.',
  copiedPrompt:'Промпт замечаний для AI-редактора скопирован.',
  copiedAndWeb:'Отчёт скопирован. Открыта веб-панель evolkov.tech.',
  copyFail:'Не удалось скопировать в буфер обмена.',
  mHeadings:'Заголовки',
  mWords:'Слов',
  mIssues:'Замечания',
  okEmpty:'Критических замечаний по структуре, JSON-LD и AI-видимости не обнаружено.',
  serpFoundPrefix:'SERP:'
 },
 en:{
  badge:'activeTab only',
  note:'Inspects the active tab only on click. Zero background collection or network sends.',
  inspectBtn:'Inspect Active Tab',
  extractBtn:'Extract SERP / Competitor',
  copyPacketBtn:'Copy Reproleaf JSON',
  copyPromptBtn:'Copy Prompt for Cursor / Claude',
  openWebBtn:'Open in evolkov.tech',
  tabInspect:'Page Audit',
  tabExtract:'SERP / Gap',
  langLabel:'RU',
  reading:'Reading active tab DOM…',
  noTab:'Active tab is unavailable.',
  readFail:'Failed to read active tab DOM.',
  blocked:'Browser restricted access to this internal tab.',
  doneInspect:'Inspection complete: SEO, JSON-LD, DOM perf & AI visibility.',
  doneExtractSerp:'Extracted live SERP results for Reproleaf SERP clusterer.',
  doneExtractComp:'Extracted competitor profile for Reproleaf SERP Gap Analyzer.',
  copiedPacket:'JSON packet copied to clipboard.',
  copiedPrompt:'Fix prompt for AI editor copied to clipboard.',
  copiedAndWeb:'Sanitized packet copied. Opened evolkov.tech web panel.',
  copyFail:'Clipboard write failed.',
  mHeadings:'Headings',
  mWords:'Words',
  mIssues:'Findings',
  okEmpty:'No structural SEO, JSON-LD, DOM perf or AI-visibility issues detected.',
  serpFoundPrefix:'SERP:'
 }
};

export function resolveWebPanelUrl(locale='en',toolSlug='geo-readiness-checker'){
 const cleanSlug=String(toolSlug||'geo-readiness-checker').replace(/[^a-z0-9-]/gi,'')||'geo-readiness-checker';
 return locale==='ru'
  ?`https://evolkov.tech/tools/${cleanSlug}/`
  :`https://evolkov.tech/en/tools/${cleanSlug}/`;
}

export function evaluateTabAudit(snapshot,locale='ru'){
 const isRu=locale==='ru';
 const findings=[];
 const headings=Array.isArray(snapshot.headings)?snapshot.headings:[];
 const h1List=headings.filter(h=>h.level===1);

 if(!snapshot.title){
  findings.push({severity:'warning',code:'title-not-provided',message:isRu?'Отсутствует тег <title>.':'Missing <title> tag.'});
 }else if(snapshot.title.length>65){
  findings.push({severity:'warning',code:'title-too-long',message:isRu?`Длина title ${snapshot.title.length} симв. (возможна обрезка в SERP).`:`Title length is ${snapshot.title.length} chars (may truncate in SERP).`});
 }
 if(!snapshot.description){
  findings.push({severity:'warning',code:'description-not-provided',message:isRu?'Отсутствует meta[name="description"].':'Missing meta[name="description"].'});
 }
 if(!snapshot.canonical){
  findings.push({severity:'warning',code:'canonical-missing',message:isRu?'Не задан link[rel="canonical"].':'Missing link[rel="canonical"].'});
 }
 if(h1List.length!==1){
  findings.push({severity:'error',code:'h1-count',message:isRu?`Найдено H1: ${h1List.length} (нужен ровно 1).`:`Found ${h1List.length} H1 headings (expected exactly 1).`});
 }

 let prev=0;
 for(const h of headings){
  if(prev>0&&h.level>prev+1){
   findings.push({severity:'warning',code:'heading-level-gap',message:isRu?`Скачок уровня H${prev} -> H${h.level} («${h.text.slice(0,50)}»).`:`Heading jump H${prev} -> H${h.level} ("${h.text.slice(0,50)}").`});
  }
  prev=h.level;
 }

 const jsonLdTypes=Array.isArray(snapshot.jsonLdTypes)?snapshot.jsonLdTypes:[];
 if(snapshot.jsonLdErrors>0){
  findings.push({severity:'error',code:'jsonld-parse-error',message:isRu?`Битый JSON-LD блок: ${snapshot.jsonLdErrors}.`:`Invalid JSON-LD block count: ${snapshot.jsonLdErrors}.`});
 }else if(jsonLdTypes.length===0){
  findings.push({severity:'warning',code:'jsonld-missing',message:isRu?'Не обнаружена микроразметка JSON-LD Schema.org.':'No JSON-LD Schema.org structured data detected.'});
 }

 if(!snapshot.hasViewport){
  findings.push({severity:'warning',code:'dom-missing-viewport',message:isRu?'Нет meta[name="viewport"] для мобильной вёрстки.':'Missing mobile meta[name="viewport"].'});
 }
 if((snapshot.missingAltCount||0)>0){
  findings.push({severity:'warning',code:'missing-image-alt',message:isRu?`Изображений без alt: ${snapshot.missingAltCount} из ${snapshot.imagesCount||0}.`:`Images missing alt attribute: ${snapshot.missingAltCount} of ${snapshot.imagesCount||0}.`});
 }
 if((snapshot.missingDimensionsCount||0)>0){
  findings.push({severity:'warning',code:'dom-image-missing-dimensions',message:isRu?`Картинок без width/height (риск CLS): ${snapshot.missingDimensionsCount}.`:`Images missing width/height (CLS risk): ${snapshot.missingDimensionsCount}.`});
 }
 if(snapshot.firstImageLazy){
  findings.push({severity:'warning',code:'dom-lazy-hero-image',message:isRu?'Первое изображение имеет loading="lazy" (риск задержки LCP).':'First image sets loading="lazy" (LCP risk).'});
 }
 if((snapshot.blockingHeadScripts||0)>0){
  findings.push({severity:'info',code:'dom-blocking-head-script',message:isRu?`Блокирующих скриптов в <head>: ${snapshot.blockingHeadScripts}.`:`Render-blocking scripts in <head>: ${snapshot.blockingHeadScripts}.`});
 }

 const robots=(snapshot.robots||'').toLowerCase();
 if(/\b(?:noindex|nosnippet|noai|noimageai)\b/.test(robots)){
  findings.push({severity:'error',code:'ai-visibility-blocked',message:isRu?`Мета-тег robots ограничивает индексацию/цитирование: "${snapshot.robots}".`:`Robots meta restricts indexing or AI snippets: "${snapshot.robots}".`});
 }
 if((snapshot.wordCount||0)<120){
  findings.push({severity:'warning',code:'ai-thin-visible-text',message:isRu?`Мало видимого текста (${snapshot.wordCount||0} слов) для цитирования ИИ.`:`Low visible word count (${snapshot.wordCount||0} words) for AI citation.`});
 }

 return {
  ok:findings.every(f=>f.severity!=='error'),
  findings,
  metrics:{
   headings:headings.length,
   words:snapshot.wordCount||0,
   jsonLdTypes,
   findings:findings.length
  }
 };
}

export function buildCompetitorOrSerpExport(snapshot){
 if(snapshot.serp&&snapshot.serp.isSerp&&Array.isArray(snapshot.serp.urls)&&snapshot.serp.urls.length>0){
  return {
   mode:'serp-cluster',
   payload:{
    entries:[
     {
      query:snapshot.serp.query||snapshot.title||'serp query',
      urls:snapshot.serp.urls.slice(0,10)
     }
    ]
   },
   summary:{
    engine:snapshot.serp.engine,
    query:snapshot.serp.query,
    urlsCount:snapshot.serp.urls.length
   }
  };
 }

 return {
  mode:'serp-gap-competitor',
  payload:{
   competitors:[
    {
     url:snapshot.url||'https://example.com/',
     title:snapshot.title||'',
     wordCount:snapshot.wordCount||0,
     headings:(snapshot.headings||[]).filter(h=>h.level<=3),
     schemaTypes:snapshot.jsonLdTypes||[],
     hasTable:Boolean(snapshot.hasTable),
     hasFaq:Boolean(snapshot.hasFaq),
     hasPricing:Boolean(snapshot.hasPricing),
     terms:Array.isArray(snapshot.topTerms)?snapshot.topTerms:[]
    }
   ]
  },
  summary:{
   url:snapshot.url,
   wordCount:snapshot.wordCount||0,
   schemaTypes:snapshot.jsonLdTypes||[]
  }
 };
}

export function formatAiEditorPrompt(snapshot,evaluation,locale='ru'){
 const findings=evaluation?.findings||[];
 const header=locale==='ru'
  ?'Проверь и исправь следующие подтверждённые SEO/GEO-замечания строго для указанного URL без выдумывания фактов:'
  :'Review and fix only these observed SEO/GEO findings for the target page without inventing unverified facts:';
 const lines=[
  header,
  `URL: ${snapshot.url||'-'}`,
  `Title: ${snapshot.title||'(missing)'}`,
  `Canonical: ${snapshot.canonical||'(missing)'}`,
  `JSON-LD @type: ${(snapshot.jsonLdTypes||[]).join(', ')||'(none)'}`,
  `Visible words: ${snapshot.wordCount||0}`,
  '',
  locale==='ru'?'Наблюдаемые замечания:':'Observed findings:'
 ];
 if(findings.length===0){
  lines.push(locale==='ru'?'- Структурных ошибок не выявлено.':'- No structural findings reported.');
 }else{
  for(const f of findings){
   lines.push(`- [${f.severity.toUpperCase()}] ${f.code}: ${f.message}`);
  }
 }
 return lines.join('\n');
}
