import {analyzeSerpGap} from '../../serp-gap-analyzer.mjs';
import {csvCell} from '../../csv-export.mjs';
import {el,createToolFrame,renderMetrics,emitToolEvent,downloadText} from '../tool-shell.mjs';

const copy={
 ru:{title:'Сравнение страницы с выбранными конкурентами',intro:'Сравните предоставленный HTML или профили страниц. Инструмент не получает выдачу, не открывает URL и не назначает обязательное число слов, FAQ или ключей.',mode:'Сравнение страниц',targetUrl:'URL вашей страницы — подпись, без сетевого запроса',targetHtml:'HTML вашей страницы',targetFile:'Или выберите HTML-файл вашей страницы, до 1 МиБ',competitors:'Страницы для сравнения: JSON-массив профилей',format:'Формат: [{"url":"https://example.com/guide","html":"<main>…</main>"}]. Можно передать измеренные поля wordCount, headings, schemaTypes, hasTable, hasFaq, hasPricing, terms. Отсутствующее поле означает «неизвестно».',files:'Или выберите JSON / до 20 HTML-файлов, каждый до 1 МиБ, суммарно до 5 МиБ',example:'Заполнить учебный пример',run:'Сравнить страницы',clear:'Очистить',json:'Скачать JSON',csv:'Скачать CSV сравнения',local:'HTML и файлы анализируются в браузере. В отчёт не включаются исходный HTML, параметры URL и фрагменты. Проверьте пути и текст перед передачей отчёта.',empty:'Добавьте вашу страницу и хотя бы одну страницу для сравнения.',invalid:'Проверьте JSON и поля входа. Нужен массив из 1–20 профилей.',limit:'Превышен лимит входа: до 1 МиБ на HTML, до 5 МиБ суммарно.',reading:'Читаем выбранные файлы…',done:'Сравнение готово. Отличия — повод проверить задачу читателя, а не обязательные SEO-правки.',changed:'Вход изменён. Запустите новое сравнение.',unknown:'Неизвестно',yes:'Есть',no:'Нет',rows:'Страниц для сравнения',words:'Медиана слов в известных данных',heading:'Медиана H2 в известных данных',target:'Ваша страница',source:'Страница',colWords:'Слова',colH2:'H2',colTable:'Таблица',colFaq:'FAQ-признак',colSchema:'Типы JSON-LD',observed:'Сравнение наблюдений',review:'Темы для редакторской проверки',terms:'Термины, встречающиеся в выбранных страницах',termsNote:'Лексическое отсутствие не доказывает пробел: проверьте смысл, синонимы и задачу читателя.',schemaNote:'Типы разметки других страниц не являются обязательными для вашей страницы. Используйте только соответствующие видимому содержимому типы.',coverage:'Покрытие',coverageNote:'Статический HTML; внешний CSS, JavaScript, реальные позиции и полнота выдачи не проверяются. Нулевое значение и отсутствие данных различаются.',sample:'Учебный пример, не результаты поисковой выдачи.'},
 en:{title:'Compare a page with selected competitors',intro:'Compare supplied HTML or measured page profiles. No search results or page URLs are fetched. Word counts, FAQs and keywords are not required quotas.',mode:'Page comparison',targetUrl:'Your page URL — a label, not a network request',targetHtml:'Your page HTML',targetFile:'Or choose your page HTML file, up to 1 MiB',competitors:'Comparison pages: a JSON array of profiles',format:'Format: [{"url":"https://example.com/guide","html":"<main>…</main>"}]. Measured wordCount, headings, schemaTypes, hasTable, hasFaq, hasPricing and terms are also accepted. An omitted field means unknown.',files:'Or choose JSON / up to 20 HTML files, 1 MiB per file and 5 MiB total',example:'Load a synthetic example',run:'Compare pages',clear:'Clear',json:'Download JSON',csv:'Download comparison CSV',local:'HTML and files are analyzed in your browser. Reports omit source HTML, URL query strings and fragments. Review paths and text before sharing.',empty:'Add your page and at least one comparison page.',invalid:'Check JSON and input fields. Provide an array of 1–20 profiles.',limit:'Input exceeds limits: up to 1 MiB per HTML document and 5 MiB total.',reading:'Reading selected files…',done:'Comparison ready. Differences are review candidates, not mandatory SEO fixes.',changed:'Input changed. Run a new comparison.',unknown:'Unknown',yes:'Present',no:'Absent',rows:'Comparison pages',words:'Median words, known observations',heading:'Median H2, known observations',target:'Your page',source:'Page',colWords:'Words',colH2:'H2',colTable:'Table',colFaq:'FAQ-like markup',colSchema:'JSON-LD types',observed:'Observed comparison',review:'Editorial review candidates',terms:'Terms observed on comparison pages',termsNote:'Lexical absence does not prove a gap: review meaning, synonyms and the reader task.',schemaNote:'Other pages using a schema type does not make it required. Use only types matching actual visible content.',coverage:'Coverage',coverageNote:'Static HTML only. External CSS, JavaScript, real rankings and search-result completeness are not verified. Zero and missing data remain distinct.',sample:'Synthetic example, not measured search results.'}
};

const maxBytes=5*1024*1024;
const bytes=value=>new TextEncoder().encode(value).length;
export function compareSuppliedPages({targetHtml='',targetUrl='',competitorsText='',locale='en'}){
 if(bytes(targetHtml)>1048576||bytes(targetHtml)+bytes(competitorsText)>maxBytes)throw Error(copy[locale].limit);
 let raw;try{raw=JSON.parse(competitorsText);}catch{throw Error(copy[locale].invalid);}
 const competitors=Array.isArray(raw)?raw:raw?.competitors;
 const target=targetHtml.trim()?{...(targetUrl.trim()?{url:targetUrl.trim()}:{}),html:targetHtml}:raw?.target;
 if(!target||!Array.isArray(competitors)||competitors.length<1||competitors.length>20)throw Error(copy[locale].empty);
 const informative=profile=>profile&&typeof profile==='object'&&['html','wordCount','headings','schemaTypes','hasTable','hasFaq','hasPricing','terms'].some(key=>Object.hasOwn(profile,key));
 if(!informative(target)||!competitors.some(informative))throw Error(copy[locale].empty);
 return analyzeSerpGap({target,competitors,locale});
}

export function comparisonCsv(report){
 const rows=[['role','source_index','url_without_query_or_fragment','word_count','h2_count','has_table','has_faq_like_markup','schema_types']];
 for(const [index,page] of [report.targetComparison,...report.competitors].entries()){
  if(page)rows.push([index===0?'target':'comparison',index,page.url,page.wordCount,page.h2Count,page.hasTable,page.hasFaq,page.schemaTypes?.join('|')??'']);
 }
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}

export function mount(root){
 const language=root.dataset.language==='en'?'en':'ru',t=copy[language];
 const frame=createToolFrame({root,title:t.title,subtitle:t.intro,modeLabel:t.mode,language});
 const targetUrl=el('input',{type:'url',className:'ym-disable-keys',placeholder:'https://example.com/guide'});
 const targetHtml=el('textarea',{rows:8,className:'ym-disable-keys',spellcheck:false});
 const targetFile=el('input',{type:'file',accept:'.html,.htm,text/html',className:'ym-disable-keys'});
 const competitors=el('textarea',{rows:10,className:'ym-disable-keys',spellcheck:false});
 const files=el('input',{type:'file',multiple:true,accept:'.json,.html,.htm,application/json,text/html',className:'ym-disable-keys'});
 const example=el('button',{type:'button',className:'reproleaf-text-button'},t.example);
 const submit=el('button',{type:'submit',className:'agent-kit-download'},t.run);
 const clear=el('button',{type:'button',className:'reproleaf-text-button'},t.clear);
 const json=el('button',{type:'button',className:'reproleaf-text-button',disabled:true},t.json);
 const csv=el('button',{type:'button',className:'reproleaf-text-button',disabled:true},t.csv);
 frame.form.append(example,el('label',{},t.targetUrl,targetUrl),el('label',{},t.targetHtml,targetHtml),el('label',{},t.targetFile,targetFile),el('label',{},t.competitors,competitors),el('p',{className:'reproleaf-help'},t.format),el('label',{},t.files,files),el('p',{className:'reproleaf-help'},t.local),el('div',{className:'agent-kit-actions'},submit,clear,json,csv));
 let report=null,targetRead=0,competitorRead=0,pendingReads=0;
 function invalidate(){report=null;json.disabled=true;csv.disabled=true;frame.metrics.hidden=true;frame.extra.replaceChildren();frame.findings.replaceChildren();frame.findingsTitle.hidden=true;frame.status.textContent=t.changed;}
 for(const input of [targetUrl,targetHtml,competitors])input.addEventListener('input',()=>{if(input===targetHtml)targetRead++;if(input===competitors)competitorRead++;invalidate();});
 function showError(error){invalidate();frame.status.textContent=error?.name==='ZodError'?t.invalid:(error.message||t.invalid);}
 targetFile.addEventListener('change',async()=>{
  const seq=++targetRead;invalidate();const file=targetFile.files?.[0];if(!file)return;
  targetHtml.value='';pendingReads++;submit.disabled=true;frame.status.textContent=t.reading;
  try{if(file.size>1048576)throw Error(t.limit);const text=await file.text();if(seq!==targetRead)return;targetHtml.value=text;frame.status.textContent=t.changed;}
  catch(error){if(seq===targetRead)showError(error);}finally{pendingReads--;submit.disabled=pendingReads>0;}
 });
 files.addEventListener('change',async()=>{
  const seq=++competitorRead;invalidate();const selected=[...files.files||[]];if(!selected.length)return;
  competitors.value='';pendingReads++;submit.disabled=true;frame.status.textContent=t.reading;
  try{
   if(selected.length>20||selected.some(file=>file.size>1048576)||selected.reduce((sum,file)=>sum+file.size,0)>maxBytes)throw Error(t.limit);
   const values=await Promise.all(selected.map(file=>file.text()));if(seq!==competitorRead)return;
   if(selected.length===1&&selected[0].name.toLowerCase().endsWith('.json'))competitors.value=values[0];
   else{if(selected.some(file=>!(/\.html?$/i.test(file.name))))throw Error(t.invalid);competitors.value=JSON.stringify(values.map(html=>({html})),null,2);}
   frame.status.textContent=t.changed;
  }catch(error){if(seq===competitorRead)showError(error);}finally{pendingReads--;submit.disabled=pendingReads>0;}
 });
 example.addEventListener('click',()=>{
  targetRead++;competitorRead++;targetFile.value='';files.value='';invalidate();targetUrl.value='https://example.com/target';
  targetHtml.value='<main><h1>Redirect audit</h1><p>Check redirect destinations and preserve the report.</p></main>';
  competitors.value=JSON.stringify([{url:'https://one.example/guide',html:'<main><h1>Redirect audit guide</h1><h2>Collect redirect traces</h2><p>Use a bounded request and record status, destination and timestamp.</p><h2>Review the result</h2><table><tr><th>Status</th><th>Destination</th></tr><tr><td>301</td><td>Guide</td></tr></table></main>'},{url:'https://two.example/guide',html:'<main><h1>Redirect audit workflow</h1><h2>Collect redirect traces</h2><p>Record status, destination, timestamp and conditions. Compare the same inputs before and after the change.</p></main>'}],null,2);
  frame.status.textContent=t.sample;
 });
 clear.addEventListener('click',()=>{targetRead++;competitorRead++;for(const input of [targetUrl,targetHtml,competitors,targetFile,files])input.value='';invalidate();frame.status.textContent=t.empty;});
 function value(observation){return observation===null||observation===undefined?t.unknown:typeof observation==='boolean'?(observation?t.yes:t.no):String(observation);}
 function render(){
  renderMetrics(frame.metrics,[{value:report.competitors.length,label:t.rows},{value:value(report.benchmarks.words.median),label:t.words},{value:value(report.benchmarks.medianH2Count),label:t.heading}]);
  const table=el('table',{className:'reproleaf-page-table'}),body=el('tbody');
  table.append(el('thead',{},el('tr',{},...[t.source,t.colWords,t.colH2,t.colTable,t.colFaq,t.colSchema].map(label=>el('th',{},label)))),body);
  for(const [index,page] of [report.targetComparison,...report.competitors].entries()){
   if(!page)continue;const labels=[t.source,t.colWords,t.colH2,t.colTable,t.colFaq,t.colSchema];
   const cells=[index===0?t.target:page.url||`${t.source} ${index}`,value(page.wordCount),value(page.h2Count),value(page.hasTable),value(page.hasFaq),page.schemaTypes===null?t.unknown:page.schemaTypes.join(', ')||t.no];
   body.append(el('tr',{},...cells.map((cell,i)=>el('td',{'data-label':labels[i]},cell))));
  }
  frame.extra.append(el('h4',{},t.observed),table,el('h4',{},t.terms),el('p',{className:'reproleaf-help'},t.termsNote));
  const terms=el('ul');for(const term of report.benchmarks.topSharedTerms)terms.append(el('li',{},`${term.term}: ${term.competitorCount}/${term.observedCompetitorCount}`));frame.extra.append(terms);
  frame.extra.append(el('h4',{},t.coverage),el('p',{className:'reproleaf-help'},t.coverageNote),el('p',{className:'reproleaf-help'},t.schemaNote));
  const unknown=Object.entries(report.coverage.observed).filter(([,count])=>count<report.competitors.length).map(([key,count])=>`${key}: ${count}/${report.competitors.length}`).join('; ');
  if(unknown)frame.extra.append(el('p',{className:'reproleaf-help'},unknown));
  frame.status.textContent=t.done;
 }
 frame.form.addEventListener('submit',event=>{
  event.preventDefault();invalidate();if(pendingReads){frame.status.textContent=t.reading;return;}
  try{report=compareSuppliedPages({targetHtml:targetHtml.value,targetUrl:targetUrl.value,competitorsText:competitors.value,locale:language});render();json.disabled=false;csv.disabled=false;emitToolEvent(root,{tool:'serp-gap',ok:true,action:'run',codes:[],errorCount:0,warningCount:0});}
  catch(error){showError(error);}
 });
 json.addEventListener('click',()=>{if(report)downloadText('reproleaf-page-comparison.json',JSON.stringify(report,null,2));});
 csv.addEventListener('click',()=>{if(report)downloadText('reproleaf-page-comparison.csv',comparisonCsv(report),'text/csv;charset=utf-8');});
}
