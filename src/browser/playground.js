import {recommendationEvidenceText,readRecommendationEvidence} from '../recommendation-evidence-copy.mjs';
import {mountProjects} from './projects.js';
import {editorialContext,findingKey} from '../history.mjs';
import './selects.js';
import {reportHtml} from '../report-html.mjs';
import {renderDashboard} from './dashboard.mjs';
import {importSitemap} from './sitemap.mjs';
import {composeHandoff,providers} from './ai-handoff.mjs';
import {buildSanitizedReportPayload} from '../sanitize-core.mjs';
const copy={
 ru:{checking:'Проверяем…',invalid:'Исправьте формат пакета.',failed:'Проверка не завершилась. Попробуйте ещё раз с меньшим текстом.',done:'Структурная проверка завершена.',errors:'Ошибок',warnings:'Замечаний',review:'Факты, полноту ответа и качество источников нужно проверить редактору.',report:'reproleaf-report.json',notSaved:'Изменения ещё не проверены.',packetTooLarge:'Пакет слишком большой: максимум 1 МБ.',json:'Не удалось прочитать JSON. Проверьте формат.',noReport:'Сначала запустите проверку.'},
 en:{checking:'Checking…',invalid:'Fix the packet format.',failed:'The check did not finish. Try again with a smaller draft.',done:'Structural check complete.',errors:'Errors',warnings:'Warnings',review:'Factual support, intent coverage and source quality still need editorial review.',report:'reproleaf-report.json',notSaved:'These changes have not been checked.',packetTooLarge:'The packet is too large: maximum 1 MiB.',json:'Could not parse the JSON packet.',noReport:'Run a check first.'}
};
const messages={
 'title-not-provided':['Title не указан: его соответствие запросу не проверено.','Search title was not supplied or evaluated.'],
 'description-not-provided':['Description не указан: метаописание не проверено.','Meta description was not supplied or evaluated.'],
 'primary-query-not-provided':['Основной запрос не указан: вхождения фразы не считаем.','No primary query supplied: phrase occurrences are unknown.'],
 'reader-task-not-provided':['Задача читателя не задана: покрытие интента проверяется отдельно.','No reader task supplied: intent coverage needs a separate review.'],
 'h1-count':['Проверьте H1 с учётом выбранного способа вывода заголовка.','Check the H1 against the selected renderer mode.'],
 'heading-level-gap':['В иерархии заголовков пропущен уровень.','The heading hierarchy skips a level.'],
 'duplicate-source-id':['Идентификатор источника повторяется.','A source identifier is duplicated.'],
 'duplicate-claim-id':['Идентификатор утверждения повторяется.','A claim identifier is duplicated.'],
 'claim-not-in-draft':['Заявленное утверждение не найдено в тексте дословно.','The declared claim is not present verbatim in the draft.'],
 'unbound-fact':['У заявленного факта нет привязки к источнику.','A declared factual claim has no source binding.'],
 'unknown-source':['Утверждение ссылается на неизвестный источник.','A claim references an unknown source.'],
 'unreviewed-source':['Источник указан, но его поддержку ещё не проверил редактор.','The source is recorded but its support has not been reviewed.'],
 'missing-calculation-evidence':['Для расчёта не хватает артефакта, допущений или способа повторить результат.','A calculation needs an artifact, assumptions and reproduction steps.'],
 'observation-needs-review':['Нужно проверить происхождение и границы наблюдения.','Observation provenance and limitations need review.'],
 'raw-html-not-audited':['Встроенный HTML нужно проверить отдельно после рендера.','Embedded HTML needs a separate rendered-page review.'],
 'unknown-internal-target':['Внутренняя ссылка отсутствует в переданном списке страниц.','An internal link is absent from the supplied site inventory.'],
 'internal-inventory-not-provided':['Список страниц не указан: внутренние адреса не проверены.','No site inventory supplied: internal targets were not checked.'],
 'unsafe-link-scheme':['В ссылке использована небезопасная схема адреса.','A link uses an unsafe URL scheme.'],
 'glossary-variant':['Найден вариант термина, запрещённый переданным глоссарием.','A term conflicts with the supplied glossary.'],
 'no-declared-claims':['Утверждения и источники не описаны: фактическое покрытие не проверено.','Claims and sources were not declared: factual coverage was not checked.'],
 'sections-need-editorial-review':['Разделам нужна редакторская проверка ответа и доказательств.','Sections still need editorial review of their answers and evidence.'],
 'no-observed-incoming':['Из других страниц этой выгрузки нет входящих ссылок. Проверьте также меню и хабы.','No other supplied page links here. Review omitted navigation and hubs.'],
 'no-observed-outgoing':['Не найдены исходящие внутренние связи с другими страницами набора.','No outgoing internal link resolved to another supplied page.'],
 'unresolved-internal-targets':['Часть внутренних адресов отсутствует в выгрузке. Это ещё не подтверждённые 404.','Some internal targets are absent from the inventory, not proven 404s.'],
 'no-observed-topic-link':['Не найдена связь с другой страницей того же заданного кластера.','No observed link to or from the same declared topic cluster.'],
 'invalid-link-url':['Один из адресов ссылок не удалось разобрать.','A stored link URL could not be parsed.']
};
const findingCategories={
 'title-not-provided':'metadata',
 'description-not-provided':'metadata',
 'primary-query-not-provided':'metadata',
 'reader-task-not-provided':'metadata',
 'h1-count':'headings',
 'heading-level-gap':'headings',
 'internal-inventory-not-provided':'links',
 'unknown-internal-target':'links',
 'unsafe-link-scheme':'links',
 'invalid-link-url':'links',
 'no-observed-incoming':'links',
 'no-observed-outgoing':'links',
 'no-observed-topic-link':'links',
 'unresolved-internal-targets':'links',
 'raw-html-not-audited':'terminology',
 'glossary-variant':'terminology',
 'no-declared-claims':'evidence',
 'duplicate-source-id':'evidence',
 'duplicate-claim-id':'evidence',
 'claim-not-in-draft':'evidence',
 'unbound-fact':'evidence',
 'unknown-source':'evidence',
 'unreviewed-source':'evidence',
 'missing-calculation-evidence':'evidence',
 'observation-needs-review':'evidence',
 'sections-need-editorial-review':'evidence'
};
const categoryNames={
 ru:{all:'Все категории',headings:'Заголовки H1–H6',metadata:'Метаданные и запрос',links:'Перелинковка и URL',evidence:'Источники и расчёты',terminology:'Глоссарий и HTML'},
 en:{all:'All categories',headings:'Headings H1–H6',metadata:'Metadata & query',links:'Internal links & URLs',evidence:'Evidence & claims',terminology:'Glossary & HTML'}
};
export function mount(root){
 if(root.dataset.mounted)return;root.dataset.mounted='true';
 const language=root.dataset.language==='en'?'en':'ru',t=copy[language],form=root.querySelector('form'),status=root.querySelector('[data-check-status]'),list=root.querySelector('[data-findings]'),resultBox=root.querySelector('[data-check-result]'),submit=form.querySelector('[type=submit]'),download=root.querySelector('[data-download-report]');
 let report=null,worker=null,timer=null,revision=0,memory,reportInfo=null,activeSeverity='all',activeCategory='all',searchQuery='';
 root.querySelector('[data-download-html]').onclick=()=>{if(!report){status.textContent=t.noReport;return;}const url=URL.createObjectURL(new Blob([reportHtml(report,language)],{type:'text/html'}));const link=document.createElement('a');link.href=url;link.download='reproleaf-report.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const htmlDownloadBtn=root.querySelector('[data-download-html]');
 if(htmlDownloadBtn&&!root.querySelector('[data-download-sanitized]')){
  const sanitizedBtn=document.createElement('button');
  sanitizedBtn.type='button';
  sanitizedBtn.className='agent-kit-download';
  sanitizedBtn.dataset.downloadSanitized='';
  sanitizedBtn.textContent=language==='ru'?'Очищенный отчёт (без черновика)':'Sanitized report (no draft)';
  sanitizedBtn.onclick=async()=>{
   if(!report){status.textContent=t.noReport;return;}
   const sanitized=buildSanitizedReportPayload({
    report,
    stripOrigin:true,
    includeSnippets:false,
    language,
    translateMessage:f=>messages[f.code]?.[language==='ru'?0:1]||f.message
   });
   const url=URL.createObjectURL(new Blob([JSON.stringify(sanitized,null,2)+'\n'],{type:'application/json'}));
   const link=document.createElement('a');link.href=url;link.download='reproleaf-sanitized-report.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   try{await navigator.clipboard.writeText(sanitized.attributionBadge.markdown);status.textContent=language==='ru'?'Очищенный отчёт скачан, бейдж проверки скопирован в буфер обмена.':'Sanitized report downloaded and attribution badge copied to clipboard.';}catch{}
  };
  htmlDownloadBtn.after(sanitizedBtn);
 }
 const field=name=>form.elements.namedItem(name);

 const toolbar=root.querySelector('.reproleaf-toolbar');
 const analysisLabel=toolbar?.querySelector('[data-analysis-label]');
 function syncAnalysisLabel(){
  if(!analysisLabel)return;
  const mode=field('mode')?.value||'text';
  const labels=language==='ru'?{text:'Статья',packet:'Пакет доказательств',blog:'Связи страниц'}:{text:'Article',packet:'Evidence packet',blog:'Page links'};
  analysisLabel.textContent=labels[mode]||labels.text;
 }
 syncAnalysisLabel();

 let explorerBar=resultBox?.querySelector('[data-findings-explorer]');
 if(resultBox&&list&&!explorerBar){
  explorerBar=document.createElement('div');
  explorerBar.className='reproleaf-explorer-bar';
  explorerBar.dataset.findingsExplorer='';
  list.before(explorerBar);
 }

 const aiPreview=root.querySelector('[data-ai-preview]'),aiIntent=root.querySelector('[data-ai-intent]'),aiDraft=root.querySelector('[data-ai-draft]'),aiStatus=root.querySelector('[data-ai-status]');
 const aiSection=root.querySelector('[data-ai-handoff]');
 let aiDisclosureEl=null,aiFocusEl=null,aiRunBtn=null,aiCopilotStatusEl=null,aiOutputEl=null;

 function collectAllowedUrls(){
  const urls=new Set();
  if(report?.kind==='blog-graph'){
   for(const p of report.pages||[])if(p.url)urls.add(p.url);
   for(const rec of report.recommendations||[]){if(rec.source)urls.add(rec.source);if(rec.target)urls.add(rec.target);}
  }else{
   if(Array.isArray(report?.context?.sitePaths)){
    for(const item of report.context.sitePaths){const s=String(item||'').trim();if(s)urls.add(s);}
   }
   if(field('mode')?.value==='packet'){
    try{
     const pktPaths=JSON.parse(field('packet')?.value||'{}')?.sitePaths;
     if(Array.isArray(pktPaths))for(const item of pktPaths){const s=String(item||'').trim();if(s)urls.add(s);}
    }catch{}
   }
   if(field('useInventory')?.checked){
    for(const line of (field('sitePaths')?.value||'').split(/\r?\n/)){const s=line.trim();if(s)urls.add(s);}
   }
  }
  return [...urls].slice(0,250);
 }

 function currentDraftText(){
  if(field('mode').value==='text')return field('markdown').value||'';
  if(field('mode').value==='packet'){try{return JSON.parse(field('packet').value).article?.markdown||'';}catch{return '';}}
  return '';
 }

 function updateAiDisclosure(){
  if(!aiDisclosureEl)return;
  const includeDraft=Boolean(aiDraft?.checked&&!aiDraft?.disabled);
  const draftLen=includeDraft?Math.min(8000,currentDraftText().length):0;
  const findingsCount=report?.findings?.length||0;
  const urlCount=collectAllowedUrls().length;
  aiDisclosureEl.textContent=language==='ru'
   ?`Состав пакета для ИИ: находок ядра (${findingsCount}), разрешённых URL из проекта (${urlCount}), метаданные${includeDraft?`, черновик (${draftLen} симв.)`:' (черновик не передаётся)'}. Ключ OpenAI хранится только на сервере.`
   :`Payload sent to AI: core findings (${findingsCount}), allowed project URLs (${urlCount}), metadata${includeDraft?`, draft excerpt (${draftLen} chars)`:' (draft excluded)'}. OpenAI key stays strictly on the server.`;
 }

 if(aiSection&&!aiSection.querySelector('[data-ai-copilot]')){
  const copilot=document.createElement('div');
  copilot.className='reproleaf-ai-copilot';
  copilot.dataset.aiCopilot='';
  const head=document.createElement('div');head.className='reproleaf-ai-copilot-head';
  const title=document.createElement('strong');title.textContent=language==='ru'?'Встроенный ИИ-разбор Reproleaf (обучен правилам ядра)':'Built-in Reproleaf AI Co-Pilot (trained on core rules)';
  const badge=document.createElement('span');badge.className='reproleaf-ai-pill';badge.textContent=language==='ru'?'OpenAI · дневной лимит':'OpenAI · daily cap';
  head.append(title,badge);

  const focusLabel=document.createElement('label');
  focusLabel.textContent=language==='ru'?'Задача для ИИ-ассистента':'AI review focus';
  aiFocusEl=document.createElement('select');
  aiFocusEl.className='ym-disable-keys';
  aiFocusEl.dataset.aiFocus='';
  const focusOpts=language==='ru'
   ?[['priorities','Приоритизация правок (Топ шагов по находкам)'],['metadata','Улучшение Title, H1 и Description под задачу'],['linking','План внутренней перелинковки и анкоров по карте URL'],['evidence','Разбор доказательной базы, расчётов и структуры']]
   :[['priorities','Prioritize fixes (top actions from findings)'],['metadata','Improve Title, H1 and Description for reader task'],['linking','Internal linking & anchor plan from supplied URLs'],['evidence','Evidence bindings, calculations & heading review']];
  for(const [val,text] of focusOpts){const opt=document.createElement('option');opt.value=val;opt.textContent=text;aiFocusEl.append(opt);}
  focusLabel.append(aiFocusEl);

  aiDisclosureEl=document.createElement('p');
  aiDisclosureEl.className='reproleaf-help reproleaf-ai-disclosure';
  aiDisclosureEl.dataset.aiDisclosure='';

  const runRow=document.createElement('div');runRow.className='reproleaf-ai-copilot-actions';
  aiRunBtn=document.createElement('button');
  aiRunBtn.type='button';
  aiRunBtn.className='agent-kit-download reproleaf-ai-run-btn';
  aiRunBtn.dataset.aiRun='';
  aiRunBtn.textContent=language==='ru'?'Запустить ИИ-разбор по отчёту ↗':'Run AI review on report ↗';
  runRow.append(aiRunBtn);

  aiCopilotStatusEl=document.createElement('p');
  aiCopilotStatusEl.className='reproleaf-help';
  aiCopilotStatusEl.setAttribute('role','status');
  aiCopilotStatusEl.setAttribute('aria-live','polite');
  aiCopilotStatusEl.dataset.aiCopilotStatus='';

  aiOutputEl=document.createElement('div');
  aiOutputEl.className='reproleaf-ai-output';
  aiOutputEl.dataset.aiOutput='';
  aiOutputEl.hidden=true;

  copilot.append(head,focusLabel,aiDisclosureEl,runRow,aiCopilotStatusEl,aiOutputEl);
  const firstHeading=aiSection.querySelector('h4');
  if(firstHeading)firstHeading.after(copilot);else aiSection.prepend(copilot);

  aiRunBtn.onclick=async()=>{
   if(!report){
    aiCopilotStatusEl.textContent=t.noReport;
    return;
   }
   aiRunBtn.disabled=true;
   aiOutputEl.hidden=true;
   aiOutputEl.replaceChildren();
   aiCopilotStatusEl.textContent=language==='ru'
    ?'Передаём структурный отчёт модели и сверяем рекомендуемые URL со списком страниц…'
    :'Sending structural report to the model and verifying URLs against the supplied inventory…';

   const includeDraft=Boolean(aiDraft?.checked&&!aiDraft?.disabled);
   const draftText=includeDraft?currentDraftText().slice(0,8000):undefined;
   const activeProjectId=root.querySelector('[data-project-picker]')?.value||'default';
   const payload={
    language,
    focus:aiFocusEl.value,
    projectId:activeProjectId,
    includeDraft,
    ...(draftText?{draftExcerpt:draftText}:{}),
    report:{
     kind:report.kind==='blog-graph'?'blog-graph':'editorial-review',
     findings:(report.findings||[]).slice(0,40).map(f=>({
      code:f.code,
      severity:f.severity,
      message:messages[f.code]?.[language==='ru'?0:1]||f.message,
      ...(f.record?{record:String(f.record).slice(0,500)}:{}),
      ...(f.observation?{observation:String(f.observation).slice(0,500)}:{}),
      ...(f.why?{why:String(f.why).slice(0,500)}:{}),
      ...(f.snippet?{snippet:String(f.snippet).slice(0,500)}:{}),
      ...(f.suggestion?{suggestion:String(f.suggestion).slice(0,500)}:{}),
      ...(f.verifyHint?{verifyHint:String(f.verifyHint).slice(0,500)}:{})
     })),
     strengths:(report.strengths||[]).slice(0,20).map(s=>({code:s.code,message:s.message})),
     allowedUrls:collectAllowedUrls(),
     recommendations:(report.recommendations||[]).slice(0,20).map(r=>({
      source:r.source,
      target:r.target,
      ...(r.sourceTitle?{sourceTitle:r.sourceTitle}:{}),
      ...(r.targetTitle?{targetTitle:r.targetTitle}:{}),
      ...(r.excerpt?{excerpt:r.excerpt}:{}),
      ...(r.suggestedAnchor?{suggestedAnchor:r.suggestedAnchor}:{}),
      anchorStatus:readRecommendationEvidence(r).status,
      ...(r.hubConnection?{hubConnection:r.hubConnection}:{})
     })),
     ...(field('mode').value!=='blog'?{
      metadata:{
       title:field('title')?.value||'',
       description:field('description')?.value||'',
       primaryQuery:field('primaryQuery')?.value||'',
       readerTask:field('readerTask')?.value||'',
       renderedH1:field('renderedH1')?.value||'',
       h1Mode:field('h1Mode')?.value==='markdown'?'markdown':'renderer'
      }
     }:{})
    }
   };

   try{
    let res=await fetch('/wp-json/evolkov/v1/reproleaf-ai',{
     method:'POST',
     headers:{'Content-Type':'application/json'},
     body:JSON.stringify(payload)
    });
    if(res.status===404){
     res=await fetch('/v1/ai-review',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
     });
    }
    const data=await res.json().catch(()=>null);
    if(!res.ok||!data?.review){
     const errMsg=data?.message||(language==='ru'?'Серверный ИИ-разбор сейчас недоступен. Используйте детерминированный отчёт или скопируйте запрос для чата ниже.':'Server AI review is currently unavailable. Use the deterministic report or copy the prompt below.');
     aiCopilotStatusEl.textContent=errMsg;
     aiRunBtn.disabled=false;
     return;
    }
    aiCopilotStatusEl.textContent=language==='ru'
     ?`ИИ-разбор готов (${data.model||'gpt-4o-mini'}). Каждая рекомендация помечена как гипотеза и требует повторной проверки.`
     :`AI review complete (${data.model||'gpt-4o-mini'}). Every recommendation is marked as a hypothesis requiring repeat verification.`;
    renderAiOutput(data);
   }catch{
    aiCopilotStatusEl.textContent=language==='ru'
     ?'Не удалось связаться с серверным API ИИ. Детерминированная проверка и ручная передача промпта работают в обычном режиме.'
     :'Could not reach the server AI endpoint. Deterministic checks and manual prompt handoff remain available.';
   }
   aiRunBtn.disabled=false;
  };
 }

 function renderAiOutput(data){
  if(!aiOutputEl)return;
  aiOutputEl.replaceChildren();
  aiOutputEl.hidden=false;
  const rev=data.review;
  const metaBar=document.createElement('div');metaBar.className='reproleaf-ai-meta';
  const hypBadge=document.createElement('span');hypBadge.className='reproleaf-ai-badge-unverified';
  hypBadge.textContent=language==='ru'?'Гипотеза ИИ · не является проверенным фактом':'AI hypothesis · not a verified fact';
  metaBar.append(hypBadge);
  if(data.budget&&typeof data.budget.remainingUsd==='number'){
   const budgetSpan=document.createElement('span');budgetSpan.className='reproleaf-ai-budget';
   budgetSpan.textContent=language==='ru'?`Остаток дневного лимита: $${data.budget.remainingUsd.toFixed(2)}`:`Daily budget remaining: $${data.budget.remainingUsd.toFixed(2)}`;
   metaBar.append(budgetSpan);
  }
  aiOutputEl.append(metaBar);

  if(rev.summary){
   const sumP=document.createElement('p');sumP.className='reproleaf-ai-summary';sumP.textContent=rev.summary;
   aiOutputEl.append(sumP);
  }

  if(rev.priorities?.length){
   const pList=document.createElement('ol');pList.className='reproleaf-ai-priorities';
   for(const item of rev.priorities){
    const li=document.createElement('li');li.className='reproleaf-ai-card';
    const top=document.createElement('div');top.className='reproleaf-ai-card-head';
    const rankSpan=document.createElement('span');rankSpan.className='reproleaf-ai-rank';rankSpan.textContent=`#${item.rank}`;
    const codeTag=document.createElement('code');codeTag.className='reproleaf-finding-code';codeTag.textContent=item.findingCode;
    const titleStrong=document.createElement('strong');titleStrong.textContent=item.title;
    top.append(rankSpan,codeTag,titleStrong);
    li.append(top);
    if(item.rationale){
     const rat=document.createElement('p');rat.textContent=item.rationale;li.append(rat);
    }
    if(item.suggestedRewrite){
     const rewWrap=document.createElement('div');rewWrap.className='reproleaf-ai-rewrite';
     const rewCode=document.createElement('pre');rewCode.textContent=item.suggestedRewrite;
     const copyBtn=document.createElement('button');copyBtn.type='button';copyBtn.className='reproleaf-text-button';
     copyBtn.textContent=language==='ru'?'Скопировать вариант':'Copy rewrite';
     copyBtn.onclick=async()=>{try{await navigator.clipboard.writeText(item.suggestedRewrite);copyBtn.textContent=language==='ru'?'Скопировано':'Copied';}catch{}};
     rewWrap.append(rewCode,copyBtn);
     li.append(rewWrap);
    }
    if(item.targetUrl){
     const urlSmall=document.createElement('small');urlSmall.className='reproleaf-finding-record';
     urlSmall.textContent=(language==='ru'?'Проверенный URL из выгрузки: ':'Verified inventory URL: ')+item.targetUrl;
     li.append(urlSmall);
    }
    if(item.verificationStep){
     const verSmall=document.createElement('small');verSmall.className='reproleaf-finding-record';
     verSmall.textContent=(language==='ru'?'Как подтвердить: ':'How to verify: ')+item.verificationStep;
     li.append(verSmall);
    }
    pList.append(li);
   }
   aiOutputEl.append(pList);
  }

  if(rev.linkPlan?.length){
   const lHead=document.createElement('h5');lHead.textContent=language==='ru'?'План внутренней перелинковки (только существующие URL)':'Internal link plan (verified inventory URLs only)';
   const lList=document.createElement('ul');lList.className='reproleaf-suggestions';
   for(const link of rev.linkPlan){
    const li=document.createElement('li');
    const st=document.createElement('strong');st.textContent=`${link.sourceUrl} → ${link.targetUrl}`;
    const anc=document.createElement('small');anc.textContent=(language==='ru'?'Рекомендуемый анкор: «':'Suggested anchor: “')+link.suggestedAnchor+(language==='ru'?'»':'”');
    const hint=document.createElement('small');hint.textContent=link.placementHint||link.rationale;
    const mdBtn=document.createElement('button');mdBtn.type='button';mdBtn.className='reproleaf-text-button';
    mdBtn.textContent=language==='ru'?'Скопировать Markdown-ссылку':'Copy Markdown link';
    mdBtn.onclick=async()=>{try{await navigator.clipboard.writeText(`[${link.suggestedAnchor||link.targetUrl}](${link.targetUrl})`);mdBtn.textContent=language==='ru'?'Скопировано':'Copied';}catch{}};
    li.append(st,anc,hint,mdBtn);
    lList.append(li);
   }
   aiOutputEl.append(lHead,lList);
  }

  if(rev.limitations?.length){
   const limBox=document.createElement('div');limBox.className='reproleaf-ai-limitations';
   const limTitle=document.createElement('small');limTitle.textContent=(language==='ru'?'Границы ИИ-разбора: ':'AI review boundaries: ')+rev.limitations.join(' · ');
   limBox.append(limTitle);
   aiOutputEl.append(limBox);
  }
 }

 function refreshHandoff(){
  if(!aiPreview)return;
  let draft='';
  if(aiDraft.checked){if(field('mode').value==='text')draft=field('markdown').value;else if(field('mode').value==='packet'){try{draft=JSON.parse(field('packet').value).article?.markdown||'';}catch{draft='';}}}
  aiDraft.disabled=field('mode').value==='blog';
  aiPreview.value=composeHandoff({language,intent:aiIntent.value,report:report?{...report,...(reportInfo?{savedEvidence:reportInfo}:{})}:null,draft,includeDraft:aiDraft.checked&&!aiDraft.disabled});
  aiStatus.textContent='';
  updateAiDisclosure();
 }
 if(aiPreview){
  aiIntent.onchange=refreshHandoff;aiDraft.onchange=refreshHandoff;
  const copyPrompt=async()=>{try{await navigator.clipboard.writeText(aiPreview.value);aiStatus.textContent=language==='ru'?'Запрос скопирован. Вставьте его в чат.':'Prompt copied. Paste it into the chat.';}catch{aiPreview.focus();aiPreview.select();aiStatus.textContent=language==='ru'?'Скопируйте выделенный запрос вручную: браузер не дал доступ к буферу обмена.':'Copy the selected prompt manually: clipboard access was unavailable.';}};
  root.querySelector('[data-ai-copy]').onclick=copyPrompt;
  for(const button of root.querySelectorAll('[data-ai-provider]'))button.onclick=()=>{
   const destination=providers[button.dataset.aiProvider];if(!destination)return;
   const copying=copyPrompt();window.open(destination,'_blank','noopener,noreferrer');void copying;
  };
  refreshHandoff();
 }
 function showView(view){root.dataset.view=view;for(const button of root.querySelectorAll('[data-workspace-view]'))button.setAttribute('aria-pressed',String(button.dataset.workspaceView===view));}
 for(const button of root.querySelectorAll('[data-workspace-view]'))button.onclick=()=>showView(button.dataset.workspaceView);
 function changed(){memory?.dirty();reportInfo=null;revision++;const hadResult=Boolean(report||worker);finish();report=null;if(aiOutputEl){aiOutputEl.hidden=true;aiOutputEl.replaceChildren();}refreshHandoff();if(!hadResult)return;download.disabled=true;resultBox.hidden=true;status.textContent=t.notSaved;}
 form.addEventListener('input',changed);
 form.addEventListener('change',event=>{
  if(event.target.name==='mode'){const mode=field('mode').value;root.querySelector('[data-text-fields]').hidden=mode!=='text';root.querySelector('[data-packet-fields]').hidden=mode!=='packet';root.querySelector('[data-blog-fields]').hidden=mode!=='blog';for(const input of root.querySelectorAll('[data-text-fields] [data-required]'))input.required=mode==='text';field('packet').required=mode==='packet';field('blog').required=mode==='blog';syncAnalysisLabel();}
  if(event.target.name==='useInventory'){field('sitePaths').disabled=!field('useInventory').checked;updateAiDisclosure();}
 });
 field('blogFile').onchange=async()=>{const file=field('blogFile').files[0];if(!file)return;changed();const snapshot=revision;field('blog').value='';if(file.size>5*1024*1024){status.textContent=language==='ru'?'Выгрузка больше 5 МБ. Подготовьте меньший набор.':'Inventory exceeds 5 MiB. Prepare a smaller scope.';return;}const text=await file.text();if(snapshot===revision){field('blog').value=text;refreshHandoff();}};
 root.querySelector('[data-load-blog-example]').onclick=()=>{changed();field('blog').value=JSON.stringify({schemaVersion:1,siteUrl:'https://example.org',coverage:'Synthetic three-page example; stored links only.',pages:[{url:'https://example.org/cache/',title:'Cache guide',cluster:'performance',text:'Cache invalidation for web applications.',links:[{href:'/invalidation/',anchor:'cache invalidation'}]},{url:'https://example.org/invalidation/',title:'Cache invalidation',cluster:'performance',text:'Cache strategies and invalidation.',links:[]},{url:'https://example.org/rendering/',title:'Rendering guide',text:'Rendering a web application.',links:[]}]},null,2);};
 root.querySelector('[data-load-example]').onclick=()=>{
  changed();field('title').value=language==='ru'?'Как посчитать ячейки сетки':'Count grid cells';field('description').value=language==='ru'?'Умножьте число строк на число столбцов.':'Multiply the rows by the columns.';field('primaryQuery').value=language==='ru'?'ячейки сетки':'grid cells';field('readerTask').value=language==='ru'?'Посчитать ячейки сетки два на два.':'Count the cells of a two-by-two grid.';field('h1Mode').value='renderer';field('markdown').value=language==='ru'?'Сетка два на два содержит четыре ячейки.\n\n## Расчёт\n\nДве строки × два столбца = четыре ячейки.\n\nПодробнее: [пример расчёта](/guide/calculation).':'A two-by-two grid has four cells.\n\n## Calculation\n\nTwo rows × two columns = four cells.\n\nRead the [calculation example](/guide/calculation).';field('sitePaths').value='/guide/calculation';field('useInventory').checked=true;field('sitePaths').disabled=false;refreshHandoff();
 };
 function finish(){root.querySelector('[data-analysis-progress]').hidden=true;clearTimeout(timer);worker?.terminate();worker=null;submit.disabled=false;form.removeAttribute('aria-busy');}

 function renderFindingsList(){
  if(!report)return;
  list.replaceChildren();
  const decisions=memory?.getDecisions?.()||{},decisionNames=language==='ru'?{accepted:'В работе',deferred:'Отложено',dismissed:'Отклонено'}:{accepted:'Accepted',deferred:'Deferred',dismissed:'Dismissed'};
  const allFindings=report.findings||[];
  const q=searchQuery.trim().toLowerCase();
  const filtered=allFindings.filter(f=>{
   if(activeSeverity!=='all'&&f.severity!==activeSeverity)return false;
   const cat=findingCategories[f.code]||'evidence';
   if(activeCategory!=='all'&&cat!==activeCategory)return false;
   if(q){
    const label=(messages[f.code]?.[language==='ru'?0:1]||f.message||'').toLowerCase();
    const hay=[f.code,label,f.record||'',f.snippet||'',f.observation||'',f.suggestion||''].join(' ').toLowerCase();
    if(!hay.includes(q))return false;
   }
   return true;
  });

  if(!filtered.length){
   const empty=document.createElement('li');
   empty.className='reproleaf-finding';
   empty.textContent=language==='ru'?'По выбранному фильтру замечаний не найдено.':'No findings match the current filter.';
   list.append(empty);
   return;
  }

  for(const finding of filtered.slice(0,40)){
   const item=document.createElement('li'),label=messages[finding.code]?.[language==='ru'?0:1]||finding.message;
   item.className=`reproleaf-finding reproleaf-finding--${finding.severity}`;
   const headRow=document.createElement('div');headRow.className='reproleaf-finding-head';
   const sevBadge=document.createElement('span');sevBadge.className=`reproleaf-sev-badge reproleaf-sev--${finding.severity}`;
   sevBadge.textContent=finding.severity==='error'?(language==='ru'?'ОШИБКА':'ERROR'):finding.severity==='warning'?(language==='ru'?'ВНИМАНИЕ':'WARN'):'INFO';
   const codeBadge=document.createElement('code');codeBadge.className='reproleaf-finding-code';codeBadge.textContent=finding.code;
   const catKey=findingCategories[finding.code]||'evidence';
   const catSpan=document.createElement('span');catSpan.className='reproleaf-finding-cat';catSpan.textContent=categoryNames[language][catKey]||catKey;
   headRow.append(sevBadge,codeBadge,catSpan);
   item.append(headRow);

   const msgStrong=document.createElement('strong');msgStrong.className='reproleaf-finding-title';msgStrong.textContent=label;
   item.append(msgStrong);

   if(finding.record){const detail=document.createElement('span');detail.className='reproleaf-finding-record';detail.textContent=finding.record;item.append(detail);}
   if(finding.snippet){const snip=document.createElement('code');snip.className='reproleaf-finding-record reproleaf-finding-snippet';snip.textContent=(language==='ru'?'Фрагмент: ':'Snippet: ')+finding.snippet;item.append(snip);}
   if(finding.observation||finding.why||finding.suggestion||finding.verifyHint){
    const guidance=document.createElement('small');guidance.className='reproleaf-finding-record';
    const parts=[];
    if(finding.observation&&finding.observation!==label)parts.push((language==='ru'?'Наблюдение: ':'Observation: ')+finding.observation);
    if(finding.why)parts.push((language==='ru'?'Причина: ':'Why: ')+finding.why);
    if(finding.suggestion)parts.push((language==='ru'?'Правка: ':'Fix: ')+finding.suggestion);
    if(finding.verifyHint)parts.push((language==='ru'?'Проверка: ':'Verify: ')+finding.verifyHint);
    if(parts.length){guidance.textContent=parts.join(' · ');item.append(guidance);}
   }
   if(memory?.setDecision){
    const fKey=findingKey(finding),existing=Object.hasOwn(decisions,fKey)?decisions[fKey]:null;
    const actions=document.createElement('div');actions.className='reproleaf-run-actions';
    if(existing){const badge=document.createElement('small');badge.textContent=`${decisionNames[existing.status]||existing.status}${existing.reason?`: ${existing.reason}`:''}`;actions.append(badge);}
    for(const [statusKey,btnText]of [['accepted',language==='ru'?'В работу':'Accept'],['deferred',language==='ru'?'Отложить':'Defer'],['dismissed',language==='ru'?'Отклонить':'Dismiss']]){
     const btn=document.createElement('button');btn.type='button';btn.className='reproleaf-text-button';btn.textContent=btnText;
     btn.onclick=()=>{const noteVal=root.querySelector('[data-project-note]')?.value.trim()||'';void memory.setDecision(fKey,statusKey,statusKey!=='accepted'?noteVal:'');};
     actions.append(btn);
    }
    item.append(actions);
   }
   list.append(item);
  }
 }

 function buildExplorerToolbar(){
  if(!explorerBar||!report)return;
  explorerBar.replaceChildren();
  const allFindings=report.findings||[];
  const counts={
   all:allFindings.length,
   error:allFindings.filter(f=>f.severity==='error').length,
   warning:allFindings.filter(f=>f.severity==='warning').length,
   info:allFindings.filter(f=>f.severity==='info').length
  };
  const tabs=document.createElement('div');tabs.className='reproleaf-explorer-tabs';
  const tabDefs=language==='ru'
   ?[['all',`Все (${counts.all})`],['error',`Ошибки (${counts.error})`],['warning',`Внимание (${counts.warning})`],['info',`Справка (${counts.info})`]]
   :[['all',`All (${counts.all})`],['error',`Errors (${counts.error})`],['warning',`Warnings (${counts.warning})`],['info',`Info (${counts.info})`]];
  for(const [sev,labelText] of tabDefs){
   const btn=document.createElement('button');btn.type='button';
   btn.className=`reproleaf-explorer-tab${activeSeverity===sev?' is-active':''}`;
   btn.textContent=labelText;
   btn.onclick=()=>{activeSeverity=sev;buildExplorerToolbar();renderFindingsList();};
   tabs.append(btn);
  }

  const controls=document.createElement('div');controls.className='reproleaf-explorer-controls';
  const catSelect=document.createElement('select');
  catSelect.className='ym-disable-keys reproleaf-explorer-select';
  catSelect.setAttribute('aria-label',language==='ru'?'Категория замечаний':'Finding category');
  for(const [catKey,catLabel] of Object.entries(categoryNames[language])){
   const opt=document.createElement('option');opt.value=catKey;opt.textContent=catLabel;
   if(catKey===activeCategory)opt.selected=true;
   catSelect.append(opt);
  }
  catSelect.onchange=()=>{activeCategory=catSelect.value;renderFindingsList();};

  const searchInput=document.createElement('input');
  searchInput.type='search';
  searchInput.className='ym-disable-keys reproleaf-explorer-search';
  searchInput.placeholder=language==='ru'?'Поиск по коду, URL или тексту…':'Filter by code, URL or snippet…';
  searchInput.value=searchQuery;
  searchInput.oninput=()=>{searchQuery=searchInput.value;renderFindingsList();};

  controls.append(catSelect,searchInput);
  explorerBar.append(tabs,controls);
 }

 function displayReport(result,info={}){
   report=result;reportInfo=info.historical?{createdAt:info.createdAt,engine:info.engine}:null;
   activeSeverity='all';activeCategory='all';searchQuery='';
   renderDashboard(root.querySelector('[data-dashboard]'),report,language);const errors=report.findings.filter(f=>f.severity==='error').length,warnings=report.findings.filter(f=>f.severity==='warning').length;
   status.textContent=`${t.done} ${t.errors}: ${errors}. ${t.warnings}: ${warnings}.`;
   resultBox.hidden=false;root.querySelector('[data-result-note]').textContent=t.review;
   const strengths=root.querySelector('[data-strengths]');strengths.replaceChildren();
   const labels={ru:{'heading-contract':'Разметка H1 внутри текста соответствует выбранному способу вывода.','heading-hierarchy':'В заголовках не пропущены уровни.','known-internal-targets':'Внутренние ссылки найдены в переданном списке страниц.','configured-terminology':'Не найдены варианты терминов, запрещённые вашим глоссарием.','declared-evidence-records':'У заявленных утверждений заполнены записи доказательств; истинность ещё требует ревью.'},en:{}};
   if(report.kind==='blog-graph'){labels.ru['graph-scope']=`Проанализировано страниц: ${report.summary.pages}.`;labels.ru['observed-incoming']='У каждой статьи в этом наборе есть входящая связь из другой переданной страницы.';}
   for(const strength of report.strengths){const item=document.createElement('li');item.textContent=labels[language][strength.code]||strength.message;strengths.append(item);}

   buildExplorerToolbar();
   renderFindingsList();

   const decisions=memory?.getDecisions?.()||{},decisionNames=language==='ru'?{accepted:'В работе',deferred:'Отложено',dismissed:'Отклонено'}:{accepted:'Accepted',deferred:'Deferred',dismissed:'Dismissed'};
   if(report.kind==='blog-graph'){
    root.querySelector('[data-result-counts]').textContent=language==='ru'?`Страниц: ${report.summary.pages}. Внутренних связей: ${report.summary.distinctInternalEdges??'нет данных'}. Без наблюдаемых входящих: ${report.summary.noObservedIncoming??'нет данных'}. Неразрешённых адресов: ${report.summary.unresolvedTargets??0}.`:`Pages: ${report.summary.pages}. Distinct internal edges: ${report.summary.distinctInternalEdges??'unknown'}. No observed incoming: ${report.summary.noObservedIncoming??'unknown'}. Unresolved targets: ${report.summary.unresolvedTargets??0}.`;
    const details=root.querySelector('[data-blog-details]');details.hidden=false;const rows=details.querySelector('tbody'),suggestions=details.querySelector('[data-link-suggestions]');rows.replaceChildren();suggestions.replaceChildren();
    let extraBox=details.querySelector('[data-blog-extra]');
    if(!extraBox){extraBox=document.createElement('div');extraBox.dataset.blogExtra='';details.append(extraBox);}
    extraBox.replaceChildren();
    for(const page of report.pages.slice(0,50)){const tr=document.createElement('tr');for(const [index,value]of [page.title,page.incomingPages,page.outgoingInternalTargets,page.cluster||'—'].entries()){const td=document.createElement('td');td.dataset.label=(language==='ru'?['Страница','Входящих','Исходящих','Тема']:['Page','Incoming','Outgoing','Topic'])[index];td.textContent=String(value??'—');if(index===0){const url=document.createElement('small');url.textContent=page.url;td.append(url);}tr.append(td);}rows.append(tr);}
    const allRecs=report.recommendations||[];
    const activeRecs=allRecs.filter(s=>{const k=JSON.stringify(['link-recommendation',`${s.source} -> ${s.target}`]);return !(Object.hasOwn(decisions,k)&&decisions[k]?.status==='dismissed');});
    const dismissedCount=allRecs.length-activeRecs.length;
    for(const suggestion of activeRecs.slice(0,15)){
     const li=document.createElement('li');
     const titleLine=document.createElement('strong');
     titleLine.textContent=`${suggestion.sourceTitle||suggestion.source} → ${suggestion.targetTitle||suggestion.target}`;
     li.append(titleLine);
     const urlsLine=document.createElement('small');
     urlsLine.textContent=`${suggestion.source} → ${suggestion.target}`;
     li.append(urlsLine);
     if(suggestion.excerpt){
      const excerptNote=document.createElement('small');
      excerptNote.textContent=(language==='ru'?'Фрагмент-донор: «':'Donor fragment: “')+suggestion.excerpt+(language==='ru'?'»':'”');
      li.append(excerptNote);
     }
     if(suggestion.suggestedAnchor){
      const anchorNote=document.createElement('small');
      anchorNote.textContent=(language==='ru'?'Вариант анкора: ':'Suggested anchor: ')+suggestion.suggestedAnchor;
      li.append(anchorNote);
     }
     const evidenceNote=document.createElement('small');evidenceNote.dataset.recommendationEvidence=readRecommendationEvidence(suggestion).status;evidenceNote.textContent=recommendationEvidenceText(suggestion,language);li.append(evidenceNote);
     const metaParts=[(language==='ru'?'Совпадающие слова: ':'Shared terms: ')+(suggestion.sharedTerms.join(', ')||'—')];
     if(suggestion.sameDeclaredCluster)metaParts.push(language==='ru'?'один тематический кластер':'same declared cluster');
     if(suggestion.hubConnection)metaParts.push(suggestion.hubConnection==='spoke-to-hub'?(language==='ru'?'статья → хаб кластера':'article → cluster hub'):(language==='ru'?'хаб кластера → статья':'cluster hub → article'));
     if(suggestion.reciprocalSuggested)metaParts.push(language==='ru'?'взаимный кандидат':'mutual candidate');
     const note=document.createElement('small');note.textContent=metaParts.join(' · ');li.append(note);
     const recActions=document.createElement('div');recActions.className='reproleaf-run-actions';
     const copyMdBtn=document.createElement('button');copyMdBtn.type='button';copyMdBtn.className='reproleaf-text-button';
     copyMdBtn.textContent=language==='ru'?'Скопировать Markdown-ссылку':'Copy Markdown link';
     copyMdBtn.onclick=async()=>{try{await navigator.clipboard.writeText(`[${suggestion.suggestedAnchor||suggestion.targetTitle||suggestion.target}](${suggestion.target})`);copyMdBtn.textContent=language==='ru'?'Скопировано':'Copied';}catch{}};
     recActions.append(copyMdBtn);
     if(memory?.setDecision){
      const recKey=JSON.stringify(['link-recommendation',`${suggestion.source} -> ${suggestion.target}`]);
      const existingRec=Object.hasOwn(decisions,recKey)?decisions[recKey]:null;
      if(existingRec){const badge=document.createElement('small');badge.textContent=`${decisionNames[existingRec.status]||existingRec.status}${existingRec.reason?`: ${existingRec.reason}`:''}`;recActions.append(badge);}
      const acceptBtn=document.createElement('button');acceptBtn.type='button';acceptBtn.className='reproleaf-text-button';acceptBtn.textContent=language==='ru'?'В работу':'Accept';
      acceptBtn.onclick=()=>void memory.setDecision(recKey,'accepted','');
      const dismissBtn=document.createElement('button');dismissBtn.type='button';dismissBtn.className='reproleaf-text-button';dismissBtn.textContent=language==='ru'?'Отклонить':'Dismiss';
      dismissBtn.onclick=()=>{const reason=root.querySelector('[data-project-note]')?.value.trim()||'';void memory.setDecision(recKey,'dismissed',reason);};
      recActions.append(acceptBtn,dismissBtn);
     }
     li.append(recActions);
     suggestions.append(li);
    }
    if(dismissedCount>0){
     const dismissedInfo=document.createElement('p');dismissedInfo.className='reproleaf-help';
     dismissedInfo.textContent=language==='ru'?`Скрыто отклонённых рекомендаций в этом проекте: ${dismissedCount}. Сбросить можно в списке решений проекта.`:`Dismissed recommendations hidden in this project: ${dismissedCount}. Reset them in the project decisions list.`;
     extraBox.append(dismissedInfo);
    }
    if(report.edges?.length){
     const edgeHeading=document.createElement('h4');edgeHeading.textContent=language==='ru'?'Существующие внутренние связи':'Existing internal links';
     const edgeList=document.createElement('ul');edgeList.className='reproleaf-suggestions';
     for(const edge of report.edges.slice(0,30)){
      const li=document.createElement('li');li.textContent=`${edge.source} → ${edge.target}`;
      if(edge.anchors?.length){const anchors=document.createElement('small');anchors.textContent=(language==='ru'?'Анкоры: ':'Anchors: ')+edge.anchors.join(', ');li.append(anchors);}
      edgeList.append(li);
     }
     extraBox.append(edgeHeading,edgeList);
    }
    if(report.clusters?.length){
     const clusterHeading=document.createElement('h4');clusterHeading.textContent=language==='ru'?'Тематические кластеры и хабы':'Topic clusters and hubs';
     const clusterList=document.createElement('ul');clusterList.className='reproleaf-suggestions';
     for(const cl of report.clusters){
      const li=document.createElement('li');
      li.textContent=language==='ru'?`Кластер «${cl.name}»: страниц ${cl.pageCount} (статей ${cl.articleCount}, хабов ${cl.hubUrls.length}), связей внутри кластера: ${cl.internalEdges}`:`Cluster “${cl.name}”: ${cl.pageCount} pages (${cl.articleCount} articles, ${cl.hubUrls.length} hubs), internal links: ${cl.internalEdges}`;
      if(cl.weakConnections?.length){const w=document.createElement('small');w.textContent=cl.weakConnections.join(' ');li.append(w);}
      clusterList.append(li);
     }
     extraBox.append(clusterHeading,clusterList);
    }
    if(report.unresolvedTargets?.length){
     const unresHeading=document.createElement('h4');unresHeading.textContent=language==='ru'?'Адреса вне переданной выгрузки (не подтверждённые 404)':'Targets outside supplied inventory (not proven 404s)';
     const unresList=document.createElement('ul');unresList.className='reproleaf-suggestions';
     for(const item of report.unresolvedTargets.slice(0,25)){
      const li=document.createElement('li');li.textContent=item.url;
      const from=document.createElement('small');from.textContent=(language==='ru'?'Ссылаются: ':'Referenced from: ')+item.referencedFrom.join(', ');
      li.append(from);unresList.append(li);
     }
     extraBox.append(unresHeading,unresList);
    }
    root.querySelector('[data-result-note]').textContent=language==='ru'?'Это связи внутри переданной выгрузки, не внешние бэклинки. Кандидаты подобраны лексически и по кластерам; уместность и анкор проверяет редактор.':'These are links within the supplied inventory, not external backlinks. Candidates use lexical and cluster overlap; review relevance and anchors.';
   }else{
    root.querySelector('[data-blog-details]').hidden=true;
    const q=report.observations.queryOccurrences;
    root.querySelector('[data-result-counts]').textContent=language==='ru'?`Ссылок: ${report.coverage.markdownLinks}. Источников: ${report.coverage.sourceRecords}. Точные вхождения фразы — title: ${q.title??'нет данных'}, H1: ${q.h1??'нет данных'}, текст: ${q.body??'нет данных'}.`:`Links: ${report.coverage.markdownLinks}. Sources: ${report.coverage.sourceRecords}. Exact phrase counts — title: ${q.title??'unknown'}, H1: ${q.h1??'unknown'}, body: ${q.body??'unknown'}.`;
   }
   if(report.scope?.evidenceScope==='urls-only')root.querySelector('[data-result-note]').textContent=language==='ru'?'Импортированы только адреса. Гиперссылки, тексты, HTTP-статусы и индексация не проверены. Загрузите JSON с содержимым для анализа перелинковки.':'Only URLs were imported. Hyperlinks, content, HTTP status and indexation were not checked. Upload a stored-content JSON inventory to analyze links.';
   download.disabled=false;refreshHandoff();
   if(info.historical)status.textContent=(language==='ru'?'Сохранённая проверка от ':'Saved check from ')+new Date(info.createdAt).toLocaleString(language==='ru'?'ru-RU':'en-GB')+(language==='ru'?'. Повторный анализ ещё не запускался.':'. No fresh check was run.');
   showView('report');
 }
 form.addEventListener('submit',event=>{
  event.preventDefault();changed();list.replaceChildren();root.querySelector('[data-strengths]').replaceChildren();root.querySelector('[data-result-note]').textContent='';root.querySelector('[data-result-counts]').textContent='';root.querySelector('[data-blog-details]').hidden=true;resultBox.hidden=true;download.disabled=true;
  let packet;
  try{
   if(field('mode').value==='packet'||field('mode').value==='blog'){const blog=field('mode').value==='blog',value=field(blog?'blog':'packet').value;if(value.length>(blog?5*1048576:1048576))throw Error(t.packetTooLarge);try{packet=blog&&value.trimStart().startsWith('<')?importSitemap(value):JSON.parse(value);}catch(error){throw Error(blog?error.message:t.json);}}
   else{packet={schemaVersion:1,locale:language,market:'',primaryQuery:field('primaryQuery').value,readerTask:field('readerTask').value,article:{title:field('title').value,description:field('description').value,renderedH1:field('renderedH1').value,h1Mode:field('h1Mode').value,markdown:field('markdown').value},sources:[],claims:[],glossary:[],reviewedSections:[]};if(field('useInventory').checked)packet.sitePaths=field('sitePaths').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);}
  }catch(error){status.textContent=error.message;return;}
  root.querySelector('[data-analysis-progress]').hidden=false;submit.disabled=true;form.setAttribute('aria-busy','true');status.textContent=t.checking;const snapshot=revision,inputState=captureInput(),projectToken=memory.token();
  try{worker=new Worker(new URL(__REPROLEAF_WORKER__,import.meta.url),{type:'module'});}catch{finish();status.textContent=t.failed;return;}
  timer=setTimeout(()=>{finish();status.textContent=t.failed;},8000);
  worker.onerror=()=>{finish();status.textContent=t.failed;};
  worker.onmessage=event=>{
   if(snapshot!==revision)return;
   const response=event.data;
   if(response.type==='progress'){const phases={ru:{validate:'Проверяем формат данных',structure:'Разбираем текст и заголовки',evidence:'Сверяем записи источников',links:'Анализируем переданные ссылки',candidates:'Ищем кандидатов для связей',report:'Готовим отчёт'},en:{validate:'Validating input',structure:'Parsing text and headings',evidence:'Checking evidence records',links:'Analyzing supplied links',candidates:'Finding link candidates',report:'Preparing report'}};const label=phases[language][response.phase]||t.checking;status.textContent=label;root.querySelector('[data-analysis-progress]').setAttribute('aria-valuetext',label);return;}
   finish();
   if(!response.ok){status.textContent=t.invalid;resultBox.hidden=false;for(const issue of response.issues){const item=document.createElement('li');item.textContent=`${issue.path}: ${issue.message}`;list.append(item);}showView('report');return;}
   displayReport(response.result);
   void memory.record({state:inputState,report:response.result,engine:__REPROLEAF_WORKER__,context:field('mode').value==='blog'?null:editorialContext(packet),token:projectToken});
  };
  worker.postMessage({kind:field('mode').value==='blog'?'blog':'editorial',payload:packet});
 });
 download.onclick=()=>{if(!report){status.textContent=t.noReport;return;}const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=t.report;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent)return;
  if(event.data?.type==='reproleaf:ping'){window.parent.postMessage({type:'reproleaf:ready'},location.origin);return;}
  if(event.data?.type!=='reproleaf:inventory')return;
  const value=JSON.stringify(event.data.inventory);if(value.length>5*1048576)return;
  changed();field('mode').value='blog';form.querySelector('input[name=mode][value=blog]').dispatchEvent(new Event('change',{bubbles:true}));field('blog').value=value;showView('editor');form.requestSubmit();
 });
 if(window.parent!==window)window.parent.postMessage({type:'reproleaf:ready'},location.origin);

 const inputNames=['markdown','title','description','primaryQuery','readerTask','h1Mode','renderedH1','sitePaths','packet','blog'];
 function captureInput(){return {mode:field('mode').value,useInventory:field('useInventory').checked,values:Object.fromEntries(inputNames.map(name=>[name,field(name).value]))};}
 function restoreInput(state){
  changed();for(const name of inputNames)field(name).value=typeof state?.values?.[name]==='string'?state.values[name]:name==='h1Mode'?'renderer':'';
  field('mode').value=['text','packet','blog'].includes(state?.mode)?state.mode:'text';field('useInventory').checked=!!state?.useInventory;field('sitePaths').disabled=!field('useInventory').checked;
  form.querySelector('input[name=mode]:checked').dispatchEvent(new Event('change',{bubbles:true}));field('h1Mode').dispatchEvent(new Event('change',{bubbles:true}));field('blogFile').value='';resultBox.hidden=true;download.disabled=true;showView('editor');refreshHandoff();syncAnalysisLabel();
 }
 memory=mountProjects(root.querySelector('[data-project-workspace=seo]'),{workspace:'seo',language,capture:captureInput,restore:restoreInput,rerun:()=>form.requestSubmit(),showReport:displayReport,onDecisionChange:()=>{if(report)displayReport(report,reportInfo?{historical:true,...reportInfo}:{});},describeFinding:f=>messages[f.code]?.[language==='ru'?0:1]||f.message||f.code});

}
