import pilotDataset from '../../../benchmarks/pilot-dataset.json' with {type:'json'};
import {el,createToolFrame,renderMetrics,emitToolEvent,downloadText,copyText} from '../tool-shell.mjs';

const copy={
 ru:{
  title:'Лидерборд GEO и AI-готовности доменов',
  subtitle:'Верифицированный корпус реальных замеров (/robots.txt, /, /llms.txt, JSON-LD) или вставьте свой JSON из CLI reproleaf benchmark.',
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
  tabMissingLlms:'Нет llms.txt',
  mTotal:'Проверено доменов',
  mLlms:'Валидный llms.txt',
  mSchema:'Есть JSON-LD',
  mPerfect:'Оценка 100/100',
  colDomain:'Домен',
  colScore:'Балл',
  colLlms:'llms.txt',
  colSchema:'JSON-LD',
  colWords:'Слов без JS',
  colBots:'OAI / Perplexity',
  colTtfb:'TTFB',
  statusValid:'валидный',
  statusMissing:'нет',
  cliTitle:'Воспроизвести или перепроверить домен локально:'
 },
 en:{
  title:'GEO & AI Search Readiness Benchmark Leaderboard',
  subtitle:'Verified real-world corpus across public developer docs and OSS origins, or paste your own JSON from reproleaf benchmark.',
  modeLabel:'GEO Leaderboard',
  exampleBtn:'Load verified pilot (24 origins)',
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
  tabMissingLlms:'Missing llms.txt',
  mTotal:'Tested origins',
  mLlms:'Valid llms.txt',
  mSchema:'JSON-LD present',
  mPerfect:'100/100 score',
  colDomain:'Origin',
  colScore:'Score',
  colLlms:'llms.txt',
  colSchema:'JSON-LD',
  colWords:'No-JS words',
  colBots:'OAI / Perplexity',
  colTtfb:'TTFB',
  statusValid:'valid',
  statusMissing:'missing',
  cliTitle:'Reproduce or re-check an origin locally:'
 }
};

export function filterBenchmarkRows(results,tab='all',query=''){
 const q=String(query||'').trim().toLowerCase();
 return (Array.isArray(results)?results:[]).filter(row=>{
  if(q&&!String(row.origin||'').toLowerCase().includes(q))return false;
  if(tab==='perfect')return Number(row.score)===100;
  if(tab==='llms')return Boolean(row.llmsTxtValid);
  if(tab==='schema')return Array.isArray(row.jsonLdTypes)&&row.jsonLdTypes.length>0;
  if(tab==='missing_llms')return !row.llmsTxtValid;
  return true;
 }).sort((a,b)=>(b.score??0)-(a.score??0)||(a.ttfbMs??99999)-(b.ttfbMs??99999));
}

export function formatBenchmarkCsv(results){
 const header=['origin','status','score','llmsTxtValid','llmsTxtStatus','jsonLdCount','jsonLdTypes','wordCount','oaiSearchBot','perplexityBot','ttfbMs'].join(',');
 const esc=v=>{
  const s=String(v??'');
  const safe=/^[=+\-@\t\r]/.test(s)?`'${s}`:s;
  return `"${safe.replace(/"/g,'""')}"`;
 };
 const lines=(results||[]).map(r=>[
  esc(r.origin),
  esc(r.status),
  r.score??0,
  Boolean(r.llmsTxtValid),
  r.llmsTxtStatus??'',
  Array.isArray(r.jsonLdTypes)?r.jsonLdTypes.length:0,
  esc((r.jsonLdTypes||[]).join('|')),
  r.wordCount??0,
  esc(r.aiBots?.['OAI-SearchBot']||''),
  esc(r.aiBots?.['PerplexityBot']||''),
  r.ttfbMs??''
 ].join(','));
 return [header,...lines].join('\n');
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

 let currentData=pilotDataset;
 let activeTab='all';
 let searchQuery='';
 let selectedOrigin=pilotDataset.results?.[0]?.origin||'https://evolkov.tech';

 function renderResultView(){
  frame.extra.replaceChildren();
  const allRows=Array.isArray(currentData?.results)?currentData.results:[];
  const perfectCount=allRows.filter(r=>Number(r.score)===100).length;
  const llmsCount=allRows.filter(r=>r.llmsTxtValid).length;
  const schemaCount=allRows.filter(r=>Array.isArray(r.jsonLdTypes)&&r.jsonLdTypes.length>0).length;
  const missingLlmsCount=allRows.filter(r=>!r.llmsTxtValid).length;

  const tabs=[
   {id:'all',label:`${t.tabAll} (${allRows.length})`},
   {id:'perfect',label:`${t.tabPerfect} (${perfectCount})`},
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
   renderResultView();
  });

  const explorerBar=el('div',{className:'reproleaf-explorer-bar'},tabsBar,searchInput);
  const visibleRows=filterBenchmarkRows(allRows,activeTab,searchQuery);
  const tbody=el('tbody');
  for(const row of visibleRows){
   const hostLabel=String(row.origin||'').replace(/^https?:\/\//,'');
   const scoreCls=row.score>=80?'reproleaf-sev-badge reproleaf-sev--good':row.score>=60?'reproleaf-sev-badge reproleaf-sev--warning':'reproleaf-sev-badge reproleaf-sev--error';
   const llmsLabel=row.llmsTxtValid?`${t.statusValid} (${row.llmsTxtStatus??200})`:`${t.statusMissing} (${row.llmsTxtStatus??'-'})`;
   const schemaLabel=row.jsonLdTypes?.length?`${row.jsonLdTypes.length}: ${row.jsonLdTypes.slice(0,3).join(', ')}`:'0';
   const botsLabel=`${row.aiBots?.['OAI-SearchBot']||'-'} / ${row.aiBots?.['PerplexityBot']||'-'}`;
   const tr=el('tr',{className:selectedOrigin===row.origin?'is-selected':''},
    el('td',{'data-label':t.colDomain},hostLabel),
    el('td',{'data-label':t.colScore},el('span',{className:scoreCls},`${row.score}/100`)),
    el('td',{'data-label':t.colLlms},llmsLabel),
    el('td',{'data-label':t.colSchema},schemaLabel),
    el('td',{'data-label':t.colWords},String(row.wordCount??0)),
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
    el('th',{},t.colScore),
    el('th',{},t.colLlms),
    el('th',{},t.colSchema),
    el('th',{},t.colWords),
    el('th',{},t.colBots),
    el('th',{},t.colTtfb)
   )),
   tbody
  );

  const cmd=`npx reproleaf benchmark ${selectedOrigin} --allow-network`;
  const copyBtn=el('button',{type:'button',className:'reproleaf-text-button'},t.copyCliBtn);
  copyBtn.addEventListener('click',()=>copyText(cmd,copyBtn,t.copiedCli,t.copyCliBtn));
  const cliBox=el('div',{className:'reproleaf-help'},
   el('p',{},t.cliTitle),
   el('pre',{},cmd),
   copyBtn
  );

  frame.extra.append(explorerBar,table,cliBox);
 }

 function run(source='run'){
  let parsed;
  try{
   parsed=JSON.parse(jsonTa.value);
   if(!parsed||!Array.isArray(parsed.results)||!parsed.results.length)throw Error('empty');
  }catch{
   frame.status.className='reproleaf-status reproleaf-state reproleaf-state--error';
   frame.status.textContent=t.invalidJson;
   frame.metrics.hidden=true;
   frame.extra.replaceChildren();
   return;
  }
  currentData=parsed;
  selectedOrigin=parsed.results[0].origin||selectedOrigin;
  const rows=parsed.results;
  const perfect=rows.filter(r=>Number(r.score)===100).length;
  const validLlms=rows.filter(r=>r.llmsTxtValid).length;
  const hasSchema=rows.filter(r=>Array.isArray(r.jsonLdTypes)&&r.jsonLdTypes.length>0).length;
  renderMetrics(frame.metrics,[
   {label:t.mTotal,value:rows.length},
   {label:t.mLlms,value:`${validLlms}/${rows.length}`},
   {label:t.mSchema,value:`${hasSchema}/${rows.length}`},
   {label:t.mPerfect,value:`${perfect}/${rows.length}`}
  ]);
  const shaNote=parsed.sha256?`SHA-256: ${parsed.sha256.slice(0,16)}...`:t.modeLabel;
  frame.status.className='reproleaf-status reproleaf-state reproleaf-state--info';
  frame.status.textContent=shaNote;
  renderResultView();
  emitToolEvent(root,{tool:'benchmark-leaderboard',action:source,ok:true,errorCount:0,warningCount:0,codes:[]});
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
  downloadText('geo-benchmark-leaderboard.json',JSON.stringify(currentData,null,2),'application/json');
  emitToolEvent(root,{tool:'benchmark-leaderboard',action:'export',ok:true,errorCount:0,warningCount:0,codes:[]});
 });
 downloadCsvBtn.addEventListener('click',()=>{
  downloadText('geo-benchmark-leaderboard.csv',formatBenchmarkCsv(currentData?.results||[]),'text/csv');
  emitToolEvent(root,{tool:'benchmark-leaderboard',action:'export',ok:true,errorCount:0,warningCount:0,codes:[]});
 });

 run('run');
}
