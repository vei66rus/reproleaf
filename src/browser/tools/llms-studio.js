import {auditLlmsTxt} from '../../llms-txt.mjs';
import {buildLlmsBundle} from '../../llms-bundle.mjs';
import {auditLlmsBudget} from '../../llms-budget-audit.mjs';
import {el,createToolFrame,renderMetrics,renderFindings,emitToolEvent,copyText,downloadText} from '../tool-shell.mjs';

const copy={
 ru:{
  title:'Конструктор и бюджет-аудитор llms.txt / llms-full.txt',
  subtitle:'Проверьте структуру llms.txt и токен-бюджет под контекстное окно LLM, либо соберите готовые llms.txt и llms-full.txt прямо в браузере.',
  modeLabel:'llms.txt Studio',
  modeAudit:'Аудит llms.txt и бюджета',
  modeBuild:'Сборка llms.txt + llms-full.txt',
  exampleBtn:'Заполнить пример',
  targetTokensLabel:'Целевой лимит токенов',
  llmsTextLabel:'Содержимое llms.txt',
  pagesJsonLabel:'Необязательный JSON страниц ([{url, markdown}]) для точного подсчёта токенов',
  siteTitleLabel:'Название сайта / проекта',
  siteSummaryLabel:'Краткое описание (> summary)',
  buildPagesLabel:'JSON-массив страниц ([{url, title, section, description, markdown, optional}])',
  runBtn:'Проверить / Собрать',
  copyLlmsBtn:'Копировать llms.txt',
  copiedBtn:'Скопировано',
  downloadLlmsBtn:'Скачать llms.txt',
  downloadFullBtn:'Скачать llms-full.txt',
  doneAuditOk:'Аудит llms.txt пройден без критических ошибок.',
  doneAuditWarn:'Найдены ошибки структуры или превышение токен-бюджета.',
  doneBuildOk:'Сборка llms.txt и llms-full.txt завершена.',
  mLinks:'Ссылок всего',
  mIndexTok:'Токенов индекса',
  mCoreTok:'Токенов ядра',
  mOptTok:'Токенов Optional',
  mIncFull:'Вошло в full',
  mOmitFull:'Вышло за бюджет',
  budgetBarTitle:'Использование целевого контекста',
  largestHeading:'Самые тяжёлые страницы ядра',
  urlCol:'Страница',
  secCol:'Раздел',
  tokCol:'Токены',
  previewHeading:'Предпросмотр llms.txt'
 },
 en:{
  title:'llms.txt & llms-full.txt Studio + Token Budget Calculator',
  subtitle:'Audit llms.txt structure and context-window token budget, or compile llms.txt and token-capped llms-full.txt locally in your browser.',
  modeLabel:'llms.txt Studio',
  modeAudit:'Audit llms.txt & budget',
  modeBuild:'Build llms.txt + llms-full.txt',
  exampleBtn:'Load example',
  targetTokensLabel:'Target context token limit',
  llmsTextLabel:'llms.txt contents',
  pagesJsonLabel:'Optional pages JSON ([{url, markdown}]) for exact linked token counting',
  siteTitleLabel:'Site / project title',
  siteSummaryLabel:'Summary (> summary)',
  buildPagesLabel:'Pages JSON array ([{url, title, section, description, markdown, optional}])',
  runBtn:'Audit / Build',
  copyLlmsBtn:'Copy llms.txt',
  copiedBtn:'Copied',
  downloadLlmsBtn:'Download llms.txt',
  downloadFullBtn:'Download llms-full.txt',
  doneAuditOk:'llms.txt audit passed with no critical errors.',
  doneAuditWarn:'Structure issues or context-budget overflow detected.',
  doneBuildOk:'Compiled llms.txt and llms-full.txt bundle.',
  mLinks:'Total links',
  mIndexTok:'Index tokens',
  mCoreTok:'Core tokens',
  mOptTok:'Optional tokens',
  mIncFull:'In llms-full.txt',
  mOmitFull:'Omitted (over cap)',
  budgetBarTitle:'Core context window usage',
  largestHeading:'Largest core pages by token footprint',
  urlCol:'Page',
  secCol:'Section',
  tokCol:'Tokens',
  previewHeading:'llms.txt preview'
 }
};

function budgetBar(title,usedTokens,limitTokens){
 const pct=Math.min(100,limitTokens>0?Math.round((usedTokens/limitTokens)*100):0);
 const color=usedTokens>limitTokens?'#a63732':usedTokens>limitTokens*0.75?'#885b16':'#27664a';
 return el('div',{className:'reproleaf-audit-bar'},
  el('div',{className:'reproleaf-audit-head'},
   el('strong',{},title),
   el('span',{className:'reproleaf-audit-sub'},`${usedTokens} / ${limitTokens} tokens (${pct}%)`)
  ),
  el('div',{className:'reproleaf-distribution-track'},
   el('span',{className:'reproleaf-dist-seg',style:`width:${pct}%;--status-color:${color}`})
  )
 );
}

export function mount(root){
 const language=root.dataset.language==='en'?'en':'ru';
 const t=copy[language];
 const frame=createToolFrame({root,title:t.title,subtitle:t.subtitle,modeLabel:t.modeLabel,language});

 const radioAudit=el('input',{type:'radio',name:'llmsMode',value:'audit',checked:true,className:'ym-disable-keys'});
 const radioBuild=el('input',{type:'radio',name:'llmsMode',value:'build',className:'ym-disable-keys'});
 const modeSwitch=el('fieldset',{className:'reproleaf-modes'},
  el('legend',{},t.modeLabel),
  el('label',{},radioAudit,t.modeAudit),
  el('label',{},radioBuild,t.modeBuild)
 );

 const limitSelect=el('select',{className:'ym-disable-keys'},
  el('option',{value:'8000'},'8 000'),
  el('option',{value:'16000'},'16 000'),
  el('option',{value:'32000',selected:true},'32 000'),
  el('option',{value:'64000'},'64 000'),
  el('option',{value:'128000'},'128 000')
 );

 const llmsTextInput=el('textarea',{className:'ym-disable-keys reproleaf-short',rows:8,spellcheck:'false',maxLength:200000});
 const auditPagesInput=el('textarea',{className:'ym-disable-keys reproleaf-short',rows:5,spellcheck:'false',maxLength:300000,placeholder:'[{"url":"https://evolkov.tech/docs/start","markdown":"# Start\\n\\nGuide text"}]'});
 const auditBox=el('div',{},
  el('label',{},t.llmsTextLabel,llmsTextInput),
  el('label',{},t.pagesJsonLabel,auditPagesInput)
 );

 const siteTitleInput=el('input',{type:'text',className:'ym-disable-keys',maxLength:160,placeholder:'Reproleaf'});
 const siteSummaryInput=el('input',{type:'text',className:'ym-disable-keys',maxLength:600});
 const buildPagesInput=el('textarea',{className:'ym-disable-keys reproleaf-short',rows:8,spellcheck:'false',maxLength:400000});
 const buildBox=el('div',{hidden:true},
  el('div',{className:'reproleaf-fields'},
   el('label',{},t.siteTitleLabel,siteTitleInput),
   el('label',{},t.siteSummaryLabel,siteSummaryInput)
  ),
  el('label',{},t.buildPagesLabel,buildPagesInput)
 );

 const exampleBtn=el('button',{type:'button',className:'reproleaf-text-button'},t.exampleBtn);
 const runBtn=el('button',{type:'submit',className:'agent-kit-download'},t.runBtn);
 const copyLlmsBtn=el('button',{type:'button',className:'reproleaf-text-button',disabled:true},t.copyLlmsBtn);
 const downloadLlmsBtn=el('button',{type:'button',className:'reproleaf-text-button',disabled:true},t.downloadLlmsBtn);
 const downloadFullBtn=el('button',{type:'button',className:'reproleaf-text-button',hidden:true},t.downloadFullBtn);

 frame.form.append(
  modeSwitch,
  exampleBtn,
  el('label',{},t.targetTokensLabel,limitSelect),
  auditBox,
  buildBox,
  el('div',{className:'agent-kit-actions'},runBtn,copyLlmsBtn,downloadLlmsBtn,downloadFullBtn)
 );

 function syncMode(){
  const isBuild=radioBuild.checked;
  auditBox.hidden=isBuild;
  buildBox.hidden=!isBuild;
  downloadFullBtn.hidden=!isBuild;
 }
 radioAudit.addEventListener('change',syncMode);
 radioBuild.addEventListener('change',syncMode);

 let lastLlmsTxt='';
 let lastFullTxt='';

 exampleBtn.onclick=()=>{
  if(radioBuild.checked){
   siteTitleInput.value='Reproleaf';
   siteSummaryInput.value='Deterministic technical SEO, HTML, JSON-LD and GEO audit toolkit.';
   buildPagesInput.value=JSON.stringify([
    {
     url:'https://evolkov.tech/tools/reproleaf',
     title:'SEO & GEO Workspace',
     section:'Tools',
     description:'Client-side SEO, JSON-LD, llms.txt and AI readiness audits.',
     markdown:'# Reproleaf Workspace\n\nDeterministic audits in browser, CLI and MCP.'
    },
    {
     url:'https://evolkov.tech/blog/geo-readiness',
     title:'AI Search Readiness Guide',
     section:'Docs',
     description:'How search AI crawlers read robots.txt and JSON-LD.',
     markdown:'# AI Search Readiness\n\nVerify OAI-SearchBot and PerplexityBot access cleanly.'
    }
   ],null,2);
  }else{
   llmsTextInput.value='# Reproleaf\n> Deterministic technical SEO and GEO auditing toolkit.\n\n## Tools\n- [Reproleaf SEO Workspace](https://evolkov.tech/tools/reproleaf): Free SEO, JSON-LD and link audit.\n\n## Optional\n- [Archive Notes](https://evolkov.tech/blog/archive): Historical changelog.';
   auditPagesInput.value=JSON.stringify([
    {url:'https://evolkov.tech/tools/reproleaf',markdown:'# Reproleaf\n\nRuns deterministic checks in browser and CLI.'},
    {url:'https://evolkov.tech/blog/archive',markdown:'Changelog notes. '.repeat(80)}
   ],null,2);
  }
 };

 copyLlmsBtn.onclick=()=>{
  if(!lastLlmsTxt)return;
  void copyText(lastLlmsTxt,copyLlmsBtn,t.copiedBtn,t.copyLlmsBtn);
  emitToolEvent(root,{tool:'llms-studio',ok:true,action:'copy_llms_txt'});
 };

 downloadLlmsBtn.onclick=()=>{
  if(!lastLlmsTxt)return;
  downloadText('llms.txt',lastLlmsTxt,'text/plain;charset=utf-8');
  emitToolEvent(root,{tool:'llms-studio',ok:true,action:'download_llms_txt'});
 };

 downloadFullBtn.onclick=()=>{
  if(!lastFullTxt)return;
  downloadText('llms-full.txt',lastFullTxt,'text/plain;charset=utf-8');
  emitToolEvent(root,{tool:'llms-studio',ok:true,action:'download_llms_full_txt'});
 };

 frame.form.addEventListener('submit',event=>{
  event.preventDefault();
  const limit=Number(limitSelect.value)||32000;
  try{
   if(radioBuild.checked){
    const pages=JSON.parse(buildPagesInput.value||'[]');
    const bundle=buildLlmsBundle({
     siteTitle:siteTitleInput.value.trim(),
     ...(siteSummaryInput.value.trim()?{summary:siteSummaryInput.value.trim()}:{}),
     maxFullTokens:limit,
     pages
    });
    lastLlmsTxt=bundle.llmsTxt;
    lastFullTxt=bundle.llmsFullTxt;
    copyLlmsBtn.disabled=false;
    downloadLlmsBtn.disabled=false;
    downloadFullBtn.disabled=false;

    frame.status.textContent=t.doneBuildOk;
    renderMetrics(frame.metrics,[
     {value:bundle.summary.totalPages,label:t.mLinks},
     {value:bundle.summary.estimatedIndexTokens,label:t.mIndexTok},
     {value:bundle.summary.includedInFullCount,label:t.mIncFull},
     {value:bundle.summary.omittedFromFullCount,label:t.mOmitFull}
    ]);
    frame.extra.replaceChildren(
     budgetBar(t.budgetBarTitle,bundle.summary.estimatedFullTokens,bundle.summary.maxFullTokens),
     el('div',{className:'reproleaf-ai-rewrite'},
      el('p',{className:'reproleaf-report-label'},t.previewHeading),
      el('pre',{},bundle.llmsTxt)
     )
    );
    renderFindings(frame.findings,frame.findingsTitle,[],language);
    emitToolEvent(root,{tool:'llms-studio',ok:true,action:'build'});
   }else{
    const content=llmsTextInput.value;
    const pages=auditPagesInput.value.trim()?JSON.parse(auditPagesInput.value):undefined;
    const specReport=auditLlmsTxt({content});
    const budgetReport=auditLlmsBudget({llmsTxt:content,targetContextTokens:limit,...(pages?{pages}:{})});
    const mergedFindings=[...specReport.findings,...budgetReport.findings];
    const ok=specReport.ok&&budgetReport.ok;

    lastLlmsTxt=content;
    lastFullTxt='';
    copyLlmsBtn.disabled=!content.trim();
    downloadLlmsBtn.disabled=!content.trim();

    frame.status.textContent=ok?t.doneAuditOk:t.doneAuditWarn;
    renderMetrics(frame.metrics,[
     {value:budgetReport.summary.totalLinks,label:t.mLinks},
     {value:budgetReport.summary.indexTokens,label:t.mIndexTok},
     {value:budgetReport.summary.coreTokens,label:t.mCoreTok},
     {value:budgetReport.summary.optionalTokens,label:t.mOptTok}
    ]);

    frame.extra.replaceChildren(
     budgetBar(t.budgetBarTitle,budgetReport.summary.coreTokens,budgetReport.summary.targetContextTokens)
    );
    if(budgetReport.largestCorePages.length>0){
     const tbody=el('tbody');
     for(const row of budgetReport.largestCorePages){
      tbody.append(el('tr',{},
       el('td',{},row.title,el('small',{},row.url)),
       el('td',{},row.section),
       el('td',{},String(row.tokens))
      ));
     }
     frame.extra.append(
      el('h4',{},t.largestHeading),
      el('table',{className:'reproleaf-page-table'},
       el('thead',{},el('tr',{},el('th',{},t.urlCol),el('th',{},t.secCol),el('th',{},t.tokCol))),
       tbody
      )
     );
    }

    renderFindings(frame.findings,frame.findingsTitle,mergedFindings,language);
    emitToolEvent(root,{
     tool:'llms-studio',
     ok,
     errorCount:mergedFindings.filter(f=>f.severity==='error').length,
     warningCount:mergedFindings.filter(f=>f.severity==='warning'||f.severity==='warn').length,
     codes:mergedFindings.map(f=>f.code),
     action:'audit'
    });
   }
  }catch(error){
   frame.status.textContent=error.message||'Invalid input';
  }
 });
}
