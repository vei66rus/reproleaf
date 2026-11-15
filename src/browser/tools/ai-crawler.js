import {auditAiCrawlerAccess} from '../../ai-crawler-audit.mjs';
import {el,createToolFrame,renderMetrics,renderFindings,emitToolEvent,downloadText} from '../tool-shell.mjs';

const copy={
 ru:{
  title:'Аудит доступности для AI-ботов',
  subtitle:'Проверьте robots.txt и HTML без JavaScript: разрешены ли OAI-SearchBot, PerplexityBot, ClaudeBot и не блокируется ли цитирование.',
  mode:'AI-краулеры',
  exampleBtn:'Заполнить пример',
  urlLabel:'URL страницы (необязательно)',
  robotsLabel:'Содержимое robots.txt',
  htmlLabel:'Сырой HTML до выполнения JS (необязательно)',
  runBtn:'Проверить AI-доступ',
  downloadBtn:'Скачать JSON',
  doneOk:'Проверка завершена: поисковые AI-боты имеют доступ.',
  doneWarn:'Обнаружены ограничения для AI-поиска.',
  missing:'Укажите robots.txt или HTML.',
  mSearchAllowed:'Поиск AI открыт',
  mSearchBlocked:'Поиск AI закрыт',
  mTrainingAllowed:'Обучение открыто',
  mWords:'Слов без JS',
  botCol:'Бот',
  roleCol:'Роль',
  statusCol:'Статус',
  ruleCol:'Правило'
 },
 en:{
  title:'AI Crawler Access Audit',
  subtitle:'Verify robots.txt rules and non-JS HTML visibility for OAI-SearchBot, PerplexityBot, ClaudeBot and citation directives.',
  mode:'AI crawlers',
  exampleBtn:'Load example',
  urlLabel:'Page URL (optional)',
  robotsLabel:'robots.txt contents',
  htmlLabel:'Raw non-JS HTML (optional)',
  runBtn:'Audit AI access',
  downloadBtn:'Download JSON',
  doneOk:'Audit finished: AI search crawlers can access this target.',
  doneWarn:'Restrictions affecting AI search visibility were detected.',
  missing:'Provide robots.txt or HTML.',
  mSearchAllowed:'Search bots open',
  mSearchBlocked:'Search bots blocked',
  mTrainingAllowed:'Training open',
  mWords:'Non-JS words',
  botCol:'Bot',
  roleCol:'Role',
  statusCol:'Status',
  ruleCol:'Rule'
 }
};

export function mount(root){
 const language=root.dataset.language==='en'?'en':'ru';
 const t=copy[language];
 const frame=createToolFrame({root,title:t.title,subtitle:t.subtitle,modeLabel:t.mode,language});

 const urlInput=el('input',{type:'url',className:'ym-disable-keys',placeholder:'https://example.com/guide',maxLength:2048});
 const robotsInput=el('textarea',{className:'ym-disable-keys reproleaf-short',rows:6,spellcheck:'false',maxLength:524288});
 const htmlInput=el('textarea',{className:'ym-disable-keys reproleaf-short',rows:6,spellcheck:'false',maxLength:1048576});
 const exampleBtn=el('button',{type:'button',className:'reproleaf-text-button'},t.exampleBtn);
 const runBtn=el('button',{type:'submit',className:'agent-kit-download'},t.runBtn);
 const downloadBtn=el('button',{type:'button',className:'reproleaf-text-button',disabled:true},t.downloadBtn);

 frame.form.append(
  exampleBtn,
  el('label',{},t.urlLabel,urlInput),
  el('label',{},t.robotsLabel,robotsInput),
  el('label',{},t.htmlLabel,htmlInput),
  el('div',{className:'agent-kit-actions'},runBtn,downloadBtn)
 );

 let lastReport=null;

 exampleBtn.onclick=()=>{
  urlInput.value='https://evolkov.tech/tools/reproleaf';
  robotsInput.value='User-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /';
  htmlInput.value='<!doctype html><html><head><title>Reproleaf SEO Guide</title></head><body><main><h1>Reproleaf SEO Guide</h1><p>'+'Reproleaf checks HTML headings, canonical tags, JSON-LD schema and AI bot directives directly without JavaScript execution. '.repeat(12)+'</p></main></body></html>';
 };

 downloadBtn.onclick=()=>{
  if(!lastReport)return;
  downloadText('reproleaf-ai-crawler-audit.json',JSON.stringify(lastReport,null,2)+'\n');
  emitToolEvent(root,{tool:'ai-crawler',ok:lastReport.findings.length===0,action:'download_json'});
 };

 frame.form.addEventListener('submit',event=>{
  event.preventDefault();
  const payload={};
  if(urlInput.value.trim())payload.url=urlInput.value.trim();
  if(robotsInput.value.trim())payload.robotsTxt=robotsInput.value;
  if(htmlInput.value.trim())payload.html=htmlInput.value;
  if(!payload.robotsTxt&&!payload.html){
   frame.status.textContent=t.missing;
   return;
  }
  try{
   const report=auditAiCrawlerAccess(payload);
   lastReport=report;
   downloadBtn.disabled=false;
   const blockedSearch=report.bots.filter(b=>b.role==='search'&&b.status==='blocked').length;
   const allowedSearch=report.bots.filter(b=>b.role==='search'&&b.status==='allowed').length;
   const allowedTrain=report.bots.filter(b=>b.role==='training'&&b.status==='allowed').length;
   frame.status.textContent=report.findings.length===0?t.doneOk:t.doneWarn;
   renderMetrics(frame.metrics,[
    {value:allowedSearch,label:t.mSearchAllowed},
    {value:blockedSearch,label:t.mSearchBlocked},
    {value:allowedTrain,label:t.mTrainingAllowed},
    {value:report.summary.visibleWordsNoJs??'—',label:t.mWords}
   ]);

   frame.extra.replaceChildren();
   if(report.bots.length>0){
    const tbody=el('tbody');
    for(const bot of report.bots){
     tbody.append(el('tr',{},
      el('td',{},bot.agent),
      el('td',{},bot.role),
      el('td',{},el('span',{className:bot.status==='blocked'?'reproleaf-state reproleaf-state--problem':'reproleaf-state reproleaf-state--good'},bot.status)),
      el('td',{},bot.rule||'default')
     ));
    }
    frame.extra.append(el('table',{className:'reproleaf-page-table'},
     el('thead',{},el('tr',{},el('th',{},t.botCol),el('th',{},t.roleCol),el('th',{},t.statusCol),el('th',{},t.ruleCol))),
     tbody
    ));
   }

   renderFindings(frame.findings,frame.findingsTitle,report.findings,language);
   emitToolEvent(root,{
    tool:'ai-crawler',
    ok:report.findings.length===0,
    errorCount:report.findings.filter(f=>f.severity==='error').length,
    warningCount:report.findings.filter(f=>f.severity==='warning'||f.severity==='warn').length,
    codes:report.findings.map(f=>f.code),
    action:'run'
   });
  }catch(error){
   frame.status.textContent=error.message||'Invalid input';
  }
 });
}
