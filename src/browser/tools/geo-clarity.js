import {auditGeoReadiness} from '../../geo-readiness-audit.mjs';
import {auditAnswerFirst} from '../../answer-first-audit.mjs';
import {auditEditorialClarity} from '../../editorial-clarity-audit.mjs';
import {el,createToolFrame,renderMetrics,renderFindings,emitToolEvent,downloadText} from '../tool-shell.mjs';

const copy={
 ru:{
  title:'GEO Scorecard, Answer-First и редакторский линтер',
  subtitle:'Проверьте готовность материала к цитированию в AI-поиске (6 сигналов), прямые ответы под H2/H3 до 65 слов, стены текста и AI-клише.',
  modeLabel:'GEO + Clarity',
  exampleBtn:'Заполнить пример',
  urlLabel:'URL страницы (необязательно)',
  mdLabel:'Черновик статьи в Markdown (необязательно)',
  htmlLabel:'Опубликованный HTML с JSON-LD (необязательно)',
  robotsLabel:'robots.txt (необязательно)',
  llmsLabel:'llms.txt (необязательно)',
  runBtn:'Запустить GEO и Clarity аудит',
  downloadBtn:'Скачать JSON',
  missing:'Заполните хотя бы одно поле: Markdown, HTML, robots.txt или llms.txt.',
  doneOk:'Критических проблем не найдено. Материал готов к индексации и цитированию.',
  doneWarn:'Найдены замечания по структуре ответа, тексту или AI-сигналам.',
  mReadiness:'GEO готовность',
  mPillars:'Проверено опор',
  mSnippetReady:'Answer-First H2/H3',
  mClarity:'Стен / AI-клише',
  pillarsHeading:'Состояние 6 сигналов GEO',
  sectionsHeading:'Разделы H2/H3 (Answer-First)',
  secHeadingCol:'Заголовок',
  secWordsCol:'Слов в 1-м абзаце',
  secReadyCol:'Статус',
  readyYes:'Готов к сниппету',
  readyNo:'Нужна правка'
 },
 en:{
  title:'GEO Scorecard, Answer-First & Editorial Clarity Linter',
  subtitle:'Evaluate AI search citation readiness (6 signals), direct answers under H2/H3 within 65 words, walls of text and AI filler cliches.',
  modeLabel:'GEO + Clarity',
  exampleBtn:'Load example',
  urlLabel:'Page URL (optional)',
  mdLabel:'Markdown draft (optional)',
  htmlLabel:'Published HTML with JSON-LD (optional)',
  robotsLabel:'robots.txt (optional)',
  llmsLabel:'llms.txt (optional)',
  runBtn:'Run GEO & Clarity audit',
  downloadBtn:'Download JSON',
  missing:'Provide at least one of Markdown, HTML, robots.txt or llms.txt.',
  doneOk:'No critical errors detected. Content passes GEO & clarity checks.',
  doneWarn:'Answer-first, clarity or AI-search warnings detected.',
  mReadiness:'GEO readiness',
  mPillars:'Signals checked',
  mSnippetReady:'Answer-First H2/H3',
  mClarity:'Walls / Cliches',
  pillarsHeading:'6 GEO Readiness Signals',
  sectionsHeading:'H2/H3 Sections (Answer-First)',
  secHeadingCol:'Heading',
  secWordsCol:'First paragraph words',
  secReadyCol:'Status',
  readyYes:'Snippet-ready',
  readyNo:'Needs edit'
 }
};

const signalLabels={
 ru:{
  aiCrawlerAccess:'Доступ AI-ботов',
  llmsTxt:'Файл llms.txt',
  structuredData:'JSON-LD разметка',
  answerFirst:'Answer-First H2/H3',
  ragChunks:'RAG-чанки текста',
  promptInjectionSafety:'Чистота от инъекций'
 },
 en:{
  aiCrawlerAccess:'AI Crawler Access',
  llmsTxt:'llms.txt',
  structuredData:'JSON-LD Schema',
  answerFirst:'Answer-First H2/H3',
  ragChunks:'RAG Chunks',
  promptInjectionSafety:'Prompt Injection Safety'
 }
};

function stateBadgeClass(status){
 if(status==='pass')return 'reproleaf-state reproleaf-state--good';
 if(status==='warn')return 'reproleaf-state reproleaf-state--attention';
 if(status==='fail')return 'reproleaf-state reproleaf-state--problem';
 return 'reproleaf-state reproleaf-state--unchecked';
}

export function mount(root){
 const language=root.dataset.language==='en'?'en':'ru';
 const t=copy[language];
 const frame=createToolFrame({root,title:t.title,subtitle:t.subtitle,modeLabel:t.modeLabel,language});

 const urlInput=el('input',{type:'url',className:'ym-disable-keys',placeholder:'https://evolkov.tech/tools/reproleaf',maxLength:2048});
 const mdInput=el('textarea',{className:'ym-disable-keys',rows:8,spellcheck:'false',maxLength:200000});
 const htmlInput=el('textarea',{className:'ym-disable-keys reproleaf-short',rows:4,spellcheck:'false',maxLength:1000000});
 const robotsInput=el('textarea',{className:'ym-disable-keys reproleaf-short',rows:3,spellcheck:'false',maxLength:524288});
 const llmsInput=el('textarea',{className:'ym-disable-keys reproleaf-short',rows:3,spellcheck:'false',maxLength:524288});

 const exampleBtn=el('button',{type:'button',className:'reproleaf-text-button'},t.exampleBtn);
 const runBtn=el('button',{type:'submit',className:'agent-kit-download'},t.runBtn);
 const downloadBtn=el('button',{type:'button',className:'reproleaf-text-button',disabled:true},t.downloadBtn);

 frame.form.append(
  exampleBtn,
  el('label',{},t.urlLabel,urlInput),
  el('label',{},t.mdLabel,mdInput),
  el('details',{className:'reproleaf-options'},
   el('summary',{},'HTML / robots.txt / llms.txt'),
   el('label',{},t.htmlLabel,htmlInput),
   el('label',{},t.robotsLabel,robotsInput),
   el('label',{},t.llmsLabel,llmsInput)
  ),
  el('div',{className:'agent-kit-actions'},runBtn,downloadBtn)
 );

 let lastReport=null;

 exampleBtn.onclick=()=>{
  urlInput.value='https://evolkov.tech/tools/reproleaf';
  mdInput.value=language==='ru'
   ?'# Руководство по GEO и Answer-First\n\n## Как проверить готовность сайта к AI-поиску?\n\nПроверьте правила robots.txt для OAI-SearchBot и PerplexityBot, наличие валидного JSON-LD без JS и прямые ответы до 65 слов под каждым вопросом H2.\n\n- Разрешите поисковых AI-ботов\n- Оформите llms.txt с разделом Optional'
   :'# GEO & Answer-First Guide\n\n## How do you verify AI search readiness?\n\nAudit robots.txt rules for OAI-SearchBot and PerplexityBot, validate non-JS HTML with JSON-LD schema and place concise 40-65 word answers directly under every question heading.\n\n- Allow search AI crawlers\n- Publish structured llms.txt';
  robotsInput.value='User-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /';
  llmsInput.value='# Reproleaf\n> Deterministic technical SEO and GEO auditing toolkit.\n\n## Docs\n- [Guide](https://evolkov.tech/tools/reproleaf): Overview';
  htmlInput.value='<!doctype html><html><head><title>Reproleaf Guide</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"GEO Guide","author":{"@type":"Person","name":"Evgenii Volkov"},"datePublished":"2026-11-15","dateModified":"2026-11-15"}</script></head><body><main><h1>GEO Guide</h1><p>'+'Reproleaf checks HTML headings, canonical tags, JSON-LD and AI directives deterministically. '.repeat(16)+'</p></main></body></html>';
 };

 downloadBtn.onclick=()=>{
  if(!lastReport)return;
  downloadText('reproleaf-geo-clarity-audit.json',JSON.stringify(lastReport,null,2)+'\n');
  emitToolEvent(root,{tool:'geo-clarity',ok:lastReport.geo.ok,action:'download_json'});
 };

 frame.form.addEventListener('submit',event=>{
  event.preventDefault();
  const payload={locale:language};
  const urlVal=urlInput.value.trim();
  if(urlVal){
   try{
    const parsedUrl=new URL(urlVal);
    if(parsedUrl.protocol==='http:'||parsedUrl.protocol==='https:')payload.url=parsedUrl.href;
   }catch{}
  }
  if(mdInput.value.trim())payload.markdown=mdInput.value;
  if(htmlInput.value.trim())payload.html=htmlInput.value;
  if(robotsInput.value.trim())payload.robotsTxt=robotsInput.value;
  if(llmsInput.value.trim())payload.llmsTxt=llmsInput.value;

  if(!payload.markdown&&!payload.html&&!payload.robotsTxt&&!payload.llmsTxt){
   frame.status.textContent=t.missing;
   return;
  }

  try{
   const geoReport=auditGeoReadiness(payload);
   const clarityReport=payload.markdown?auditEditorialClarity({markdown:payload.markdown,locale:language}):null;
   const answerReport=(payload.markdown||payload.html)
    ?auditAnswerFirst(payload.markdown?{markdown:payload.markdown}:{html:payload.html})
    :null;

   const combinedFindings=[
    ...geoReport.findings,
    ...(clarityReport?clarityReport.findings:[])
   ];
   const allOk=geoReport.ok&&(clarityReport?clarityReport.ok:true);
   lastReport={geo:geoReport,clarity:clarityReport,answerFirst:answerReport};
   downloadBtn.disabled=false;

   frame.status.textContent=allOk&&combinedFindings.length===0?t.doneOk:t.doneWarn;
   renderMetrics(frame.metrics,[
    {value:`${geoReport.summary.readinessPercent}%`,label:t.mReadiness},
    {value:`${geoReport.summary.evaluatedCount}/${geoReport.summary.totalSignals}`,label:t.mPillars},
    {value:answerReport?`${answerReport.summary.snippetReadyHeadings}/${answerReport.summary.totalHeadings}`:'—',label:t.mSnippetReady},
    {value:clarityReport?clarityReport.summary.wallsOfText+clarityReport.summary.cliches:'—',label:t.mClarity}
   ]);

   frame.extra.replaceChildren();
   const chips=el('div',{className:'reproleaf-status-summary'});
   for(const [key,val] of Object.entries(geoReport.signals)){
    const label=signalLabels[language][key]||key;
    chips.append(el('span',{className:stateBadgeClass(val.status)},`${label}: ${val.status.toUpperCase()}`));
   }
   frame.extra.append(el('h4',{},t.pillarsHeading),chips);

   if(answerReport&&answerReport.sections.length>0){
    const tbody=el('tbody');
    for(const sec of answerReport.sections){
     tbody.append(el('tr',{},
      el('td',{},`H${sec.level}: ${sec.heading}`),
      el('td',{},String(sec.firstParagraphWords)),
      el('td',{},el('span',{className:sec.snippetReady?'reproleaf-state reproleaf-state--good':'reproleaf-state reproleaf-state--attention'},sec.snippetReady?t.readyYes:t.readyNo))
     ));
    }
    frame.extra.append(
     el('h4',{},t.sectionsHeading),
     el('table',{className:'reproleaf-page-table'},
      el('thead',{},el('tr',{},el('th',{},t.secHeadingCol),el('th',{},t.secWordsCol),el('th',{},t.secReadyCol))),
      tbody
     )
    );
   }

   renderFindings(frame.findings,frame.findingsTitle,combinedFindings,language);
   emitToolEvent(root,{
    tool:'geo-clarity',
    ok:allOk,
    errorCount:combinedFindings.filter(f=>f.severity==='error'||f.severity==='critical').length,
    warningCount:combinedFindings.filter(f=>f.severity==='warning'||f.severity==='warn').length,
    codes:combinedFindings.map(f=>f.code),
    action:'run'
   });
  }catch(error){
   frame.status.textContent=error.message||'Invalid input';
  }
 });
}
