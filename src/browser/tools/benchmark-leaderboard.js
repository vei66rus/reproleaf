import pilotDataset from '../../../benchmarks/pilot-dataset.json' with {type:'json'};
import {el,createToolFrame,renderMetrics,emitToolEvent,downloadText,copyText} from '../tool-shell.mjs';
import {validateBenchmarkDataset,benchmarkCommand} from '../../benchmark-dataset.mjs';
import {csvCell} from '../../csv-export.mjs';

const copy={
 ru:{
  title:'Сравнение наблюдений бенчмарка сайтов',
  subtitle:'Снимок 24 доменов или ваш JSON из CLI. Проверка SHA-256 подтверждает целостность summary/results, но не подлинность, свежесть или цитируемость измерений.',
  modeLabel:'GEO Leaderboard',
  exampleBtn:'Загрузить пилот (24 домена)',
  jsonLabel:'JSON датасета Reproleaf Benchmark ({ sha256, summary, results })',
  runBtn:'Построить таблицу',
  jsonBtn:'Скачать JSON',
  csvBtn:'Скачать CSV',
  copyCliBtn:'Скопировать CLI-команду',
  copiedCli:'Скопировано!',
  searchPlaceholder:'Фильтр по домену...',
  invalidJson:'Введите корректный JSON отчёта benchmark с массивом results.',
  tabAll:'Все',
  tabPerfect:'100 / 100',
  tabLlms:'Валидный llms.txt',
  tabSchema:'Есть JSON-LD',
  tabMissingLlms:'llms.txt не прошёл проверку',
  mTotal:'Уникальных доменов в данных',
  mLlms:'Валидный llms.txt',
  mSchema:'Есть JSON-LD',
  mPerfect:'Оценка 100/100',
  colDomain:'Домен',
  colScore:'Рубрика источника',
  colLlms:'llms.txt',
  colSchema:'JSON-LD',
  colWords:'Слов без JS',
  colBots:'OAI / Perplexity',
  colTtfb:'TTFB',
  statusValid:'валидный',
  statusMissing:'проверка не пройдена',
  cliTitle:'Из распакованного набора: перепроверить домен локально',
  unknown:'Не проверено',checking:'Проверяем структуру и контрольную сумму…',changed:'Данные изменены. Постройте таблицу снова.',hashMatch:'SHA-256 summary/results совпал. Подлинность и свежесть измерений не подтверждаются; generatedAt не входит в сумму.',hashAbsent:'Контрольная сумма не предоставлена. Это импорт наблюдений, а не подтверждённые измерения.',scope:'Таблица не делает сетевых запросов. Неизвестные и недоступные измерения не считаются нулями. Правила robots.txt не подтверждают фактический доступ или цитирование ботом. Перед передачей проверьте содержимое отчёта.'
 },
 en:{
  title:'Compare supplied site benchmark observations',
  subtitle:'A 24-origin snapshot or your CLI JSON. SHA-256 checks summary/results integrity, not measurement authenticity, freshness or AI citations.',
  modeLabel:'GEO Leaderboard',
  exampleBtn:'Load pilot snapshot (24 origins)',
  jsonLabel:'Reproleaf Benchmark JSON ({ sha256, summary, results })',
  runBtn:'Render leaderboard',
  jsonBtn:'Download JSON',
  csvBtn:'Download CSV',
  copyCliBtn:'Copy CLI command',
  copiedCli:'Copied!',
  searchPlaceholder:'Filter by domain...',
  invalidJson:'Enter a valid benchmark JSON report with a non-empty results array.',
  tabAll:'All',
  tabPerfect:'100 / 100',
  tabLlms:'Valid llms.txt',
  tabSchema:'JSON-LD present',
  tabMissingLlms:'llms.txt check not passed',
  mTotal:'Unique supplied origins',
  mLlms:'Valid llms.txt',
  mSchema:'JSON-LD present',
  mPerfect:'100/100 score',
  colDomain:'Origin',
  colScore:'Source rubric',
  colLlms:'llms.txt',
  colSchema:'JSON-LD',
  colWords:'No-JS words',
  colBots:'OAI / Perplexity',
  colTtfb:'TTFB',
  statusValid:'valid',
  statusMissing:'check not passed',
  cliTitle:'From the extracted toolkit: re-check an origin locally',
  unknown:'Not checked',checking:'Checking structure and payload checksum…',changed:'Input changed. Render the table again.',hashMatch:'SHA-256 matches summary/results. Measurement authenticity and freshness are not verified; generatedAt is outside the checksum.',hashAbsent:'No checksum supplied. These are imported observations, not verified measurements.',scope:'The table makes no network requests. Missing or inaccessible measurements do not become zero. Robots rules do not establish actual bot access or citations. Review the report before sharing.'
 }
};

export function filterBenchmarkRows(results,tab='all',query=''){
 const q=String(query||'').trim().toLowerCase();
 return (Array.isArray(results)?results:[]).filter(row=>{
  if(q&&!String(row.origin||'').toLowerCase().includes(q))return false;
  if(tab==='perfect')return Number(row.score)===100;
  if(tab==='llms')return Boolean(row.llmsTxtValid);
  if(tab==='schema')return Array.isArray(row.jsonLdTypes)&&row.jsonLdTypes.length>0;
  if(tab==='missing_llms')return row.llmsTxtValid===false;
  return true;
 }).sort((a,b)=>String(a.origin)<String(b.origin)?-1:String(a.origin)>String(b.origin)?1:0);
}

export function formatBenchmarkCsv(results){
 const header=['origin','status','score','llmsTxtValid','llmsTxtStatus','jsonLdCount','jsonLdTypes','wordCount','oaiSearchBot','perplexityBot','ttfbMs'].join(',');
 const esc=csvCell;
 const lines=(results||[]).map(r=>[
  esc(r.origin),
  esc(r.status),
  esc(r.score??''),
  esc(r.llmsTxtValid??''),
  esc(r.llmsTxtStatus??''),
  esc(Array.isArray(r.jsonLdTypes)?r.jsonLdTypes.length:''),
  esc((r.jsonLdTypes||[]).join('|')),
  esc(r.wordCount??''),
  esc(r.aiBots?.['OAI-SearchBot']||''),
  esc(r.aiBots?.['PerplexityBot']||''),
  esc(r.ttfbMs??'')
 ].join(','));
 return '\uFEFF'+[header,...lines].join('\r\n')+'\r\n';
}

export function mount(root,options={}){
 const language=(options.language||root?.dataset?.language||root?.dataset?.reproleafLang)==='ru'?'ru':'en';
 const t=copy[language];
 const frame=createToolFrame({root,title:t.title,subtitle:t.subtitle,modeLabel:t.modeLabel,language});

 const jsonTa=el('textarea',{rows:8,spellcheck:'false'},JSON.stringify(pilotDataset,null,2));
 jsonTa.value=JSON.stringify(pilotDataset,null,2);
 const exampleBtn=el('button',{type:'button',className:'reproleaf-text-button'},t.exampleBtn);
 const runBtn=el('button',{type:'submit',className:'agent-kit-download'},t.runBtn);
 const downloadJsonBtn=el('button',{type:'button',className:'reproleaf-text-button'},t.jsonBtn);
 const downloadCsvBtn=el('button',{type:'button',className:'reproleaf-text-button'},t.csvBtn);

 frame.form.append(
  el('label',{},t.jsonLabel,jsonTa),
  el('div',{className:'agent-kit-actions'},runBtn,exampleBtn,downloadJsonBtn,downloadCsvBtn)
 );

 let currentData=null,currentRows=[],revision=0;
 let activeTab='all';
 let searchQuery='';
 let selectedOrigin=pilotDataset.results?.[0]?.origin||'https://evolkov.tech';

 function renderResultView(){
  frame.extra.replaceChildren();
  const allRows=currentRows;
  const perfectCount=allRows.filter(r=>Number(r.score)===100).length;
  const llmsCount=allRows.filter(r=>r.llmsTxtValid).length;
  const schemaCount=allRows.filter(r=>Array.isArray(r.jsonLdTypes)&&r.jsonLdTypes.length>0).length;
  const missingLlmsCount=allRows.filter(r=>r.llmsTxtValid===false).length;

  const tabs=[
   {id:'all',label:`${t.tabAll} (${allRows.length})`},
   {id:'llms',label:`${t.tabLlms} (${llmsCount})`},
   {id:'schema',label:`${t.tabSchema} (${schemaCount})`},
   {id:'missing_llms',label:`${t.tabMissingLlms} (${missingLlmsCount})`}
  ];

  const tabsBar=el('div',{className:'reproleaf-explorer-tabs'});
  for(const tab of tabs){
   const btn=el('button',{type:'button',className:`reproleaf-explorer-tab${activeTab===tab.id?' is-active':''}`},tab.label);
   btn.addEventListener('click',()=>{
    activeTab=tab.id;
    renderResultView();
   });
   tabsBar.append(btn);
  }

  const searchInput=el('input',{type:'search',placeholder:t.searchPlaceholder,value:searchQuery});
  searchInput.value=searchQuery;
  searchInput.addEventListener('input',()=>{
   searchQuery=searchInput.value;
   const start=searchInput.selectionStart,end=searchInput.selectionEnd;
   renderResultView();
   const next=frame.extra.querySelector('input[type=search]');next?.focus({preventScroll:true});if(next&&start!==null&&end!==null)next.setSelectionRange(start,end);
  });

  const explorerBar=el('div',{className:'reproleaf-explorer-bar'},tabsBar,searchInput);
  const visibleRows=filterBenchmarkRows(allRows,activeTab,searchQuery);
  const tbody=el('tbody');
  for(const row of visibleRows){
   const hostLabel=String(row.origin||'').replace(/^https?:\/\//,'');
   const llmsLabel=row.llmsTxtValid===null?t.unknown:row.llmsTxtValid?`${t.statusValid} (${row.llmsTxtStatus})`:`${t.statusMissing} (${row.llmsTxtStatus})`;
   const schemaLabel=row.jsonLdTypes===null?t.unknown:row.jsonLdTypes?.length?`${row.jsonLdTypes.length}: ${row.jsonLdTypes.slice(0,3).join(', ')}`:'0';
   const botsLabel=`${row.aiBots?.['OAI-SearchBot']||'-'} / ${row.aiBots?.['PerplexityBot']||'-'}`;
   const tr=el('tr',{className:selectedOrigin===row.origin?'is-selected':''},
    el('td',{'data-label':t.colDomain},hostLabel),
    el('td',{'data-label':t.colLlms},llmsLabel),
    el('td',{'data-label':t.colSchema},schemaLabel),
    el('td',{'data-label':t.colWords},row.wordCount===null?t.unknown:String(row.wordCount)),
    el('td',{'data-label':t.colBots},botsLabel),
    el('td',{'data-label':t.colTtfb},row.ttfbMs!==null&&row.ttfbMs!==undefined?`${row.ttfbMs} ms`:'-')
   );
   tr.addEventListener('click',()=>{
    selectedOrigin=row.origin;
    renderResultView();
   });
   tbody.append(tr);
  }

  const table=el('table',{className:'reproleaf-page-table'},
   el('thead',{},el('tr',{},
    el('th',{},t.colDomain),
    el('th',{},t.colLlms),
    el('th',{},t.colSchema),
    el('th',{},t.colWords),
    el('th',{},t.colBots),
    el('th',{},t.colTtfb)
   )),
   tbody
  );

  const cmd=benchmarkCommand(selectedOrigin);
  const copyBtn=el('button',{type:'button',className:'reproleaf-text-button'},t.copyCliBtn);
  copyBtn.addEventListener('click',()=>copyText(cmd,copyBtn,t.copiedCli,t.copyCliBtn));
  const cliBox=el('div',{className:'reproleaf-help'},
   el('p',{},t.cliTitle),
   el('pre',{},cmd),
   copyBtn
  );

  frame.extra.append(explorerBar,table,cliBox);
 }

 function invalidate(message=t.changed){currentData=null;currentRows=[];downloadJsonBtn.disabled=true;downloadCsvBtn.disabled=true;frame.metrics.hidden=true;frame.extra.replaceChildren();frame.status.textContent=message;}
 jsonTa.addEventListener('input',()=>{revision++;invalidate();});
 async function run(source='run'){
  const seq=++revision;invalidate(t.checking);
  try{
   if(jsonTa.value.length>5*1024*1024)throw Error('BENCHMARK_SIZE');
   const validated=await validateBenchmarkDataset(JSON.parse(jsonTa.value));
   if(seq!==revision)return;
   currentData=validated.data;currentRows=validated.viewRows;
   selectedOrigin=currentRows[0].origin;
   const rows=currentRows,knownLlms=rows.filter(row=>row.llmsTxtValid!==null),knownSchema=rows.filter(row=>row.jsonLdTypes!==null);
   renderMetrics(frame.metrics,[{label:t.mTotal,value:rows.length},{label:t.mLlms,value:`${knownLlms.filter(row=>row.llmsTxtValid).length}/${knownLlms.length}`},{label:t.mSchema,value:`${knownSchema.filter(row=>row.jsonLdTypes.length>0).length}/${knownSchema.length}`}]);
   frame.status.className='reproleaf-status reproleaf-state reproleaf-state--info';
   frame.status.textContent=validated.integrity.status==='match'?t.hashMatch:t.hashAbsent;
   renderResultView();frame.extra.prepend(el('p',{className:'reproleaf-help'},t.scope));
   downloadJsonBtn.disabled=false;downloadCsvBtn.disabled=false;
   emitToolEvent(root,{tool:'benchmark-leaderboard',action:source,ok:true,errorCount:0,warningCount:0,codes:[]});
  }catch(error){
   if(seq!==revision)return;
   invalidate();
   frame.status.className='reproleaf-status reproleaf-state reproleaf-state--error';
   frame.status.textContent=t.invalidJson+(error.message==='BENCHMARK_HASH_MISMATCH'?' SHA-256 mismatch.':'');
  }
 }

 exampleBtn.addEventListener('click',()=>{
  jsonTa.value=JSON.stringify(pilotDataset,null,2);
  run('example');
 });
 frame.form.addEventListener('submit',event=>{
  event.preventDefault();
  run('run');
 });
 downloadJsonBtn.addEventListener('click',()=>{
  if(!currentData)return;downloadText('geo-benchmark-leaderboard.json',JSON.stringify(currentData,null,2),'application/json');
  emitToolEvent(root,{tool:'benchmark-leaderboard',action:'export',ok:true,errorCount:0,warningCount:0,codes:[]});
 });
 downloadCsvBtn.addEventListener('click',()=>{
  if(!currentData)return;downloadText('geo-benchmark-leaderboard.csv',formatBenchmarkCsv(currentRows),'text/csv');
  emitToolEvent(root,{tool:'benchmark-leaderboard',action:'export',ok:true,errorCount:0,warningCount:0,codes:[]});
 });

 run('run');
}
