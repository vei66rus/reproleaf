import {auditEeatSignals} from '../../eeat-audit.mjs';
import {csvCell} from '../../csv-export.mjs';
import {el,createToolFrame,renderMetrics,renderFindings,emitToolEvent,downloadText} from '../tool-shell.mjs';

const MAX_BYTES=1024*1024;
const copy={
 en:{title:'Author and Trust Markup Inspector',subtitle:'Inspect supplied raw HTML for bylines, dates, entity markup and links. These technical observations do not verify author identity, source quality, Google E-E-A-T, rankings or AI citations.',mode:'Trust markup',file:'Open HTML or text file (up to 1 MiB)',url:'Page URL (optional, used only to distinguish external links)',html:'Paste the page HTML',example:'Load example',run:'Inspect HTML',clear:'Clear input',json:'Download JSON',csv:'Download CSV',limits:'The source stays in your browser. Scripts and HTML are parsed as data, never inserted into the page. External stylesheets, computed visibility, link destinations and credentials are not verified. Source HTML is omitted from exports.',dirty:'Input changed. Run the inspection again for an up-to-date result.',ready:'Input ready. Run the inspection.',reading:'Reading the selected file…',missing:'Paste HTML or select a file.',large:'HTML input exceeds 1 MiB.',invalidUrl:'Use an HTTP(S) page URL without credentials, or leave it blank.',invalid:'Could not inspect this input. Check its size and HTML structure.',fileError:'Could not read this file. Select it again or paste HTML.',emptyFile:'This file is empty.',done:'Inspection complete. Review the observations in the context of this page; no trust or ranking score is assigned.',observed:'Observed',absent:'Not observed',signal:'Technical observation',state:'Result',author:'Recognizable byline outside explicitly hidden HTML',entity:'Person or Organization JSON-LD entity',dates:'Valid ISO publication/update date signal',external:'External HTTP(S) links (quality not checked)',trust:'Recognizable About / Contact / Methodology links',sameAs:'sameAs property in JSON-LD',types:'Observed JSON-LD types',sourceLinks:'External link references (sanitized)',authorMetric:'Byline observed',dateMetric:'Date signal',externalMetric:'External links',trustMetric:'Trust-page links',yes:'Yes',no:'No'},
 ru:{title:'Проверка разметки автора и доверия',subtitle:'Технические наблюдения по переданному HTML: подпись автора, даты, сущности и ссылки. Проверка не подтверждает личность автора, качество источников, E-E-A-T Google, позиции или цитирование ИИ.',mode:'Разметка доверия',file:'Открыть HTML или текстовый файл (до 1 МиБ)',url:'URL страницы (необязательно, только для отделения внешних ссылок)',html:'Вставьте HTML страницы',example:'Заполнить пример',run:'Проверить HTML',clear:'Очистить ввод',json:'Скачать JSON',csv:'Скачать CSV',limits:'Исходник остаётся в браузере. HTML и скрипты разбираются как данные и не вставляются в страницу. Внешние стили, вычисленная видимость, адреса назначения ссылок и полномочия автора не проверяются. HTML не включается в экспорт.',dirty:'Ввод изменён. Запустите проверку заново для актуального результата.',ready:'Данные готовы. Запустите проверку.',reading:'Читаем выбранный файл…',missing:'Вставьте HTML или выберите файл.',large:'HTML превышает 1 МиБ.',invalidUrl:'Укажите HTTP(S) URL без логина и пароля либо оставьте поле пустым.',invalid:'Не удалось проверить ввод. Проверьте размер и структуру HTML.',fileError:'Не удалось прочитать файл. Выберите его заново или вставьте HTML.',emptyFile:'Выбран пустой файл.',done:'Проверка завершена. Оцените наблюдения с учётом задачи страницы; балл доверия или ранжирования не вычисляется.',observed:'Обнаружено',absent:'Не обнаружено',signal:'Техническое наблюдение',state:'Результат',author:'Распознаваемая подпись вне явно скрытого HTML',entity:'Сущность Person или Organization в JSON-LD',dates:'Валидная ISO-дата публикации или обновления',external:'Внешние HTTP(S) ссылки (качество не проверялось)',trust:'Распознаваемые ссылки About / Contact / Methodology',sameAs:'Свойство sameAs в JSON-LD',types:'Обнаруженные типы JSON-LD',sourceLinks:'Внешние ссылки (очищены)',authorMetric:'Подпись автора',dateMetric:'Сигнал даты',externalMetric:'Внешних ссылок',trustMetric:'Ссылок на страницы доверия',yes:'Да',no:'Нет'}
};

export function inspectTrustHtml({html,url}){
 if(!html.trim())throw Error('EEAT_INPUT_EMPTY');
 if(new TextEncoder().encode(html).length>MAX_BYTES)throw Error('EEAT_INPUT_TOO_LARGE');
 let cleanUrl;
 if(url?.trim()){
  try{const candidate=new URL(url.trim());if(!['http:','https:'].includes(candidate.protocol)||candidate.username||candidate.password)throw Error();candidate.search='';candidate.hash='';cleanUrl=candidate.href;}catch{throw Error('EEAT_INVALID_URL');}
 }
 const report=auditEeatSignals({html,...(cleanUrl?{url:cleanUrl}:{})});
 const {score,rating,legacyMetrics,...observations}=report;
 return {kind:'trust-markup-observations',...observations,coverage:{inputBytes:new TextEncoder().encode(html).length,htmlExecuted:false,externalRequests:false},scope:{...report.scope,interpretation:'Technical observations only. Presence of markup does not establish expertise, primary-source quality, search performance or citation.'}};
}

export function trustSignalRows(report){
 const signals=report.signals;
 return [
  ['author',signals.author.visible],['entity',signals.schema.hasPerson||signals.schema.hasOrganization],
  ['dates',Boolean(signals.dates.published||signals.dates.modified||signals.dates.timeTags.length||signals.schema.hasDatePublished||signals.schema.hasDateModified)],
  ['external',signals.externalLinksCount===null?null:signals.externalLinksCount>0],['trust',signals.trustLinks.length>0],['sameAs',signals.schema.hasSameAs]
 ];
}

export function trustReportCsv(report){
 return '\uFEFF'+[['technical_observation','observed'],...trustSignalRows(report)].map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
}

export function mount(root){
 const language=root.dataset.language==='ru'?'ru':'en',t=copy[language];
 const frame=createToolFrame({root,title:t.title,subtitle:t.subtitle,modeLabel:t.mode,language});
 const file=el('input',{type:'file',accept:'.html,.htm,.txt',className:'ym-disable-keys','data-eeat-file':''});
 const url=el('input',{type:'text',maxLength:2048,autocomplete:'off',className:'ym-disable-keys','data-eeat-url':''});
 const html=el('textarea',{rows:12,maxLength:MAX_BYTES,spellcheck:false,className:'ym-disable-keys','data-eeat-input':''});
 const example=el('button',{type:'button',className:'reproleaf-text-button','data-eeat-example':''},t.example);
 const run=el('button',{type:'submit',className:'agent-kit-download'},t.run);
 const clear=el('button',{type:'button',className:'reproleaf-text-button','data-eeat-clear':''},t.clear);
 const json=el('button',{type:'button',disabled:true,className:'reproleaf-text-button','data-eeat-json':''},t.json);
 const csv=el('button',{type:'button',disabled:true,className:'reproleaf-text-button','data-eeat-csv':''},t.csv);
 frame.form.append(example,el('label',{},t.file,file),el('label',{},t.url,url),el('label',{},t.html,html),el('p',{className:'reproleaf-help'},t.limits),el('div',{className:'agent-kit-actions'},run,clear,json,csv));
 let revision=0,lastReport=null;
 function invalidate(message=t.dirty){revision++;lastReport=null;json.disabled=csv.disabled=true;run.disabled=false;frame.metrics.replaceChildren();frame.metrics.hidden=true;frame.extra.replaceChildren();frame.findings.replaceChildren();frame.findingsTitle.hidden=true;frame.status.textContent=message;}
 for(const input of [url,html])input.addEventListener('input',()=>invalidate());
 file.addEventListener('change',async()=>{
  invalidate(t.reading);html.value='';const selected=file.files?.[0];if(!selected){frame.status.textContent=t.ready;return;}
  const token=revision;run.disabled=true;
  try{
   if(selected.size>MAX_BYTES){frame.status.textContent=t.large;return;}
   if(selected.size===0){frame.status.textContent=t.emptyFile;return;}
   const text=await selected.text();if(token!==revision)return;html.value=text;frame.status.textContent=t.ready;
  }catch{if(token===revision){html.value='';frame.status.textContent=t.fileError;}}
  finally{if(token===revision)run.disabled=false;}
 });
 example.addEventListener('click',()=>{
  invalidate(t.ready);file.value='';url.value='https://example.com/guide';
  html.value='<!doctype html><html><head><meta name="author" content="Example Author"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","datePublished":"2026-11-01","author":{"@type":"Person","name":"Example Author","sameAs":["https://example.com/author"]}}</script></head><body><main><h1>Example guide</h1><p class="byline"><a rel="author" href="/author/example">Example Author</a></p><time datetime="2026-11-01">November 1</time><p>Consult the <a href="https://schema.org/Article">Article reference</a>.</p></main><footer><a href="/about">About</a><a href="/contact">Contact</a></footer></body></html>';
 });
 clear.addEventListener('click',()=>{html.value=url.value=file.value='';invalidate(t.ready);});
 json.addEventListener('click',()=>{if(lastReport)downloadText('reproleaf-trust-markup.json',JSON.stringify(lastReport,null,2)+'\n');});
 csv.addEventListener('click',()=>{if(lastReport)downloadText('reproleaf-trust-markup.csv',trustReportCsv(lastReport),'text/csv;charset=utf-8');});
 frame.form.addEventListener('submit',event=>{
  event.preventDefault();invalidate();
  try{
   const report=inspectTrustHtml({html:html.value,url:url.value});lastReport=report;json.disabled=csv.disabled=false;frame.status.textContent=t.done;
   const rows=trustSignalRows(report),dates=rows.find(row=>row[0]==='dates')[1];
   renderMetrics(frame.metrics,[{value:report.signals.author.visible?t.yes:t.no,label:t.authorMetric},{value:dates?t.yes:t.no,label:t.dateMetric},{value:report.signals.externalLinksCount??(language==='ru'?'Не проверено':'Not checked'),label:t.externalMetric},{value:report.signals.trustLinks.length,label:t.trustMetric}]);
   const body=el('tbody');for(const [key,observed] of rows)body.append(el('tr',{},el('td',{},t[key]),el('td',{},observed===null?(language==='ru'?'Не проверено':'Not checked'):observed?t.observed:t.absent)));
   frame.extra.append(el('table',{className:'reproleaf-page-table'},el('thead',{},el('tr',{},el('th',{},t.signal),el('th',{},t.state))),body));
   if(report.signals.schema.types.length)frame.extra.append(el('h4',{},t.types),el('p',{},report.signals.schema.types.join(', ')));
   if(report.signals.externalLinks.length)frame.extra.append(el('h4',{},t.sourceLinks),el('ul',{},...report.signals.externalLinks.map(link=>el('li',{},link))));
   const messages={'EEAT_MISSING_VISIBLE_AUTHOR':'Не обнаружена распознаваемая подпись вне явно скрытого HTML. Meta author не является видимой подписью.','EEAT_INCOMPLETE_ENTITY_SCHEMA':'В переданном JSON-LD не обнаружены Person или Organization. Выбор разметки зависит от реального автора и типа страницы.','EEAT_MISSING_PUBLICATION_DATES':'Не обнаружена валидная ISO-дата публикации или обновления в проверяемых полях.','EEAT_NO_EXTERNAL_LINKS':'Не обнаружены внешние HTTP(S) ссылки. Наличие ссылки само по себе не подтверждает первоисточник или обоснованность тезиса.','EEAT_MISSING_TRUST_PAGES':'Не обнаружены распознаваемые ссылки About, Contact, Editorial или Methodology.'};
   messages.EEAT_EXTERNAL_LINK_SCOPE_UNKNOWN='URL страницы не передан: разделение внешних и внутренних ссылок не проверялось.';
   const findings=report.findings.map(f=>language==='ru'?{...f,message:messages[f.code]||f.message,recommendation:undefined}:f);
   renderFindings(frame.findings,frame.findingsTitle,findings,language);
   emitToolEvent(root,{tool:'eeat',ok:report.ok,errorCount:report.findings.filter(f=>f.severity==='error').length,warningCount:report.findings.filter(f=>f.severity==='warning').length,codes:report.findings.map(f=>f.code),action:'run'});
  }catch(error){frame.status.textContent=({'EEAT_INPUT_EMPTY':t.missing,'EEAT_INPUT_TOO_LARGE':t.large,'EEAT_INVALID_URL':t.invalidUrl}[error.message])||t.invalid;}
 });
}
