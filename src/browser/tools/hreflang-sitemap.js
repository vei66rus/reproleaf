import {auditHreflangMatrix} from '../../hreflang-audit.mjs';
import {csvCell} from '../../csv-export.mjs';
import {el,createToolFrame,renderMetrics,renderFindings,emitToolEvent,downloadText} from '../tool-shell.mjs';

const SITEMAP_NS='http://www.sitemaps.org/schemas/sitemap/0.9',XHTML_NS='http://www.w3.org/1999/xhtml';
const MAX_BYTES=5*1024*1024,MAX_ENTRIES=5000,MAX_MATRIX=500,DISPLAY_LIMIT=100;
const beforeSample=`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="${SITEMAP_NS}" xmlns:xhtml="${XHTML_NS}">
 <url><loc>https://example.org/guide</loc><xhtml:link rel="alternate" hreflang="en" href="https://example.org/guide"/><xhtml:link rel="alternate" hreflang="ru" href="https://example.org/ru/guide"/></url>
 <url><loc>https://example.org/ru/guide</loc><xhtml:link rel="alternate" hreflang="en" href="https://example.org/guide"/><xhtml:link rel="alternate" hreflang="ru" href="https://example.org/ru/guide"/></url>
 <url><loc>https://example.org/old-guide</loc></url>
</urlset>`;
const afterSample=beforeSample.replace('https://example.org/old-guide','https://example.org/new-guide');

function inputBytes(text){return new TextEncoder().encode(text).length;}
function httpReference(value){
 try{const url=new URL(value);return /^https?:\/\//i.test(value)&&!/[\s\u0000-\u001f\u007f]/.test(value)&&value.length<=2048&&!url.username&&!url.password&&!url.hash;}catch{return false;}
}
function childElements(node,name,namespace){return [...node.children].filter(child=>child.localName===name&&child.namespaceURI===namespace);}
function hasUnexpectedText(node){return [...node.childNodes].some(child=>[3,4].includes(child.nodeType)&&child.textContent.trim());}

export function parseXmlSitemap(source,{Parser=globalThis.DOMParser}={}){
 if(typeof source!=='string'||!source.trim())throw Error('SITEMAP_INPUT_EMPTY');
 if(inputBytes(source)>MAX_BYTES)throw Error('SITEMAP_TOO_LARGE');
 if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source))throw Error('SITEMAP_DTD_NOT_SUPPORTED');
 if(typeof Parser!=='function')throw Error('SITEMAP_XML_PARSER_UNAVAILABLE');
 const doc=new Parser().parseFromString(source,'application/xml');
 const root=doc.documentElement;
 const parserErrors=[...doc.getElementsByTagName('parsererror')].filter(node=>['http://www.mozilla.org/newlayout/xml/parsererror.xml','http://www.w3.org/1999/xhtml'].includes(node.namespaceURI));
 if(!root||root.localName==='parsererror'||parserErrors.length)throw Error('SITEMAP_INVALID_XML');
 if(root.namespaceURI!==SITEMAP_NS)throw Error('SITEMAP_INVALID_NAMESPACE');
 if(!['urlset','sitemapindex'].includes(root.localName))throw Error('SITEMAP_INVALID_ROOT');
 const kind=root.localName==='urlset'?'urlset':'sitemapindex',entryName=kind==='urlset'?'url':'sitemap';
 const entries=[...root.children];
 if(hasUnexpectedText(root))throw Error('SITEMAP_MIXED_ENTRIES');
 if(!entries.length)throw Error('SITEMAP_NO_ENTRIES');
 if(entries.length>MAX_ENTRIES)throw Error('SITEMAP_TOO_MANY_ENTRIES');
 if(entries.some(node=>node.namespaceURI!==SITEMAP_NS||node.localName!==entryName))throw Error('SITEMAP_MIXED_ENTRIES');
 const urls=[],matrixPages=[],counts=new Map(),ignoredExtensions=new Set();
 for(const entry of entries){
  if(hasUnexpectedText(entry)||[...entry.children].some(child=>child.localName==='loc'&&child.namespaceURI!==SITEMAP_NS))throw Error('SITEMAP_INVALID_LOC');
  const locations=childElements(entry,'loc',SITEMAP_NS);
  if(locations.length!==1||locations[0].children.length)throw Error('SITEMAP_INVALID_LOC');
  const url=locations[0].textContent.trim();
  if(!httpReference(url))throw Error('SITEMAP_INVALID_URL');
  urls.push(url);counts.set(url,(counts.get(url)||0)+1);
  const alternates=[];
  for(const child of entry.children){
   if(child.localName==='link'&&(child.getAttribute('rel')||'').trim().toLowerCase()==='alternate'){
    if(child.namespaceURI!==XHTML_NS||kind!=='urlset')throw Error('SITEMAP_INVALID_ALTERNATE_NAMESPACE');
    const hreflang=(child.getAttribute('hreflang')||'').trim(),href=(child.getAttribute('href')||'').trim();
    if(!hreflang||hreflang.length>32||!httpReference(href))throw Error('SITEMAP_INVALID_ALTERNATE');
    if(alternates.length>=100)throw Error('SITEMAP_TOO_MANY_ALTERNATES');
    alternates.push({hreflang,href});
   }else if(child.namespaceURI!==SITEMAP_NS)ignoredExtensions.add(`${child.namespaceURI||'(no namespace)'}:${child.localName}`);
  }
  matrixPages.push({url,alternates});
 }
 const uniqueUrls=[...counts.keys()],duplicates=[...counts].filter(([,count])=>count>1).map(([url,count])=>({url,count}));
 return {kind,entryCount:entries.length,uniqueCount:uniqueUrls.length,urls:uniqueUrls,duplicates,duplicateEntryCount:entries.length-uniqueUrls.length,matrixPages,scope:{locations:kind==='urlset'?'page-urls':'child-sitemap-references',fetchedUrls:false,ignoredExtensions:[...ignoredExtensions],otherSitemapFieldsValidated:false}};
}

function notProcessed(reason,count){return {ok:false,status:'not-processed',reason,summary:{pages:count,errors:0,warnings:0,uncheckedReturnLinks:0},findings:[]};}

export function inspectSitemapInputs(beforeText,afterText='',options={}){
 if(typeof beforeText!=='string'||!beforeText.trim())throw Error('SITEMAP_INPUT_EMPTY');
 if(inputBytes(beforeText)>MAX_BYTES||inputBytes(afterText)>MAX_BYTES)throw Error('SITEMAP_TOO_LARGE');
 if(/^[\s\uFEFF]*[\[{]/.test(beforeText)){
  if(afterText.trim())throw Error('HREFLANG_JSON_AFTER_NOT_SUPPORTED');
  const json=JSON.parse(beforeText.replace(/^\uFEFF/,'')),matrix=auditHreflangMatrix(Array.isArray(json)?{pages:json}:json);
  return {mode:'hreflang-json',matrix,findings:matrix.findings,scope:{suppliedPages:matrix.summary.pages,httpStatusChecked:false,remoteUrlsFetched:false}};
 }
 const before=parseXmlSitemap(beforeText,options),hasAfter=Boolean(afterText.trim()),after=hasAfter?parseXmlSitemap(afterText,options):null,target=after||before;
 if(after&&before.kind!==after.kind)throw Error('SITEMAP_MIXED_KINDS');
 const beforeSet=new Set(before.urls),afterSet=new Set(after?.urls||[]);
 const added=after?after.urls.filter(url=>!beforeSet.has(url)):[],removed=after?before.urls.filter(url=>!afterSet.has(url)):[],unchanged=after?before.urls.filter(url=>afterSet.has(url)):[];
 let matrix;
 if(target.kind==='sitemapindex')matrix=notProcessed('sitemapindex-references-not-pages',0);
 else if(target.duplicates.length)matrix=notProcessed('duplicate-page-urls',target.entryCount);
 else if(target.matrixPages.length>MAX_MATRIX)matrix=notProcessed('matrix-limit-500-pages',target.matrixPages.length);
 else if(!target.matrixPages.some(page=>page.alternates.length))matrix=notProcessed('no-hreflang-alternates',target.matrixPages.length);
 else matrix=auditHreflangMatrix({pages:target.matrixPages});
 const findings=[...matrix.findings];
 for(const [stage,inventory] of [['before',before],['after',after]])if(inventory)for(const duplicate of inventory.duplicates)findings.push({code:'SITEMAP_DUPLICATE_URL',severity:'warning',stage,target:duplicate.url,message:`${stage}: the same location occurs ${duplicate.count} times. Difference counts use unique locations.`});
 return {mode:hasAfter?'sitemap-comparison':'sitemap-inventory',kind:target.kind,before:{entryCount:before.entryCount,uniqueCount:before.uniqueCount,duplicateEntryCount:before.duplicateEntryCount,duplicates:before.duplicates,locations:before.urls},after:after?{entryCount:after.entryCount,uniqueCount:after.uniqueCount,duplicateEntryCount:after.duplicateEntryCount,duplicates:after.duplicates,locations:after.urls}:null,difference:after?{added,removed,unchanged}:null,matrix,findings,scope:{...target.scope,beforeIgnoredExtensions:before.scope.ignoredExtensions,afterIgnoredExtensions:after?.scope.ignoredExtensions||[],comparison:'Exact XML-decoded, trimmed loc values; unique locations; no URL fetching, redirects or content comparison.',matrixPageLimit:MAX_MATRIX,entryLimit:MAX_ENTRIES,displayLimit:DISPLAY_LIMIT}};
}

export function sitemapReportCsv(report){
 const rows=[['section','status','source','target','code']];
 if(!report.difference)for(const url of report.before?.locations||[])rows.push(['inventory_location',report.scope?.locations||'', '',url,'']);
 for(const [state,urls] of Object.entries(report.difference||{}))for(const url of urls)rows.push(['inventory_difference',state,'',url,'']);
 for(const item of report.matrix.matrix||[])rows.push(['hreflang_page',item.hasSelfLink?'self-reference-observed':'self-reference-not-observed',item.url,'',item.codes.join(' ')]);
 for(const finding of report.findings)rows.push(['finding',finding.severity,finding.url||finding.stage||'',finding.target||'',finding.code]);
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
}

const copy={
 en:{title:'Hreflang Matrix and Sitemap Inventory',subtitle:'Inspect supplied hreflang JSON or compare two local XML inventories. Page URLs and child-sitemap references stay separate; missing pages remain unchecked.',mode:'Hreflang / XML',before:'Before XML sitemap or hreflang JSON',after:'After XML sitemap (optional; leave blank for JSON)',beforeFile:'Open the first XML / JSON file',afterFile:'Open the second XML file',example:'Load sample input',run:'Inspect supplied data',clear:'Clear input',json:'Download JSON',csv:'Download CSV',limits:'Each input: up to 5 MiB and 5,000 XML entries. Hreflang matrix: up to 500 supplied pages. No URLs or child sitemaps are fetched. Query values stay in exact location comparisons and exports: review them before sharing. HTTP status, rendered language and other XML extension fields are not checked.',dirty:'Input changed. Run the inspection again.',ready:'Input ready. Run the inspection.',reading:'Reading the selected file…',fileError:'Could not read this file. Select it again or paste the content.',done:'Supplied data processed. Review differences and matrix coverage; this is not a live-site or indexing verification.',partial:'Matrix coverage is partial: some referenced pages were not supplied.',issues:'Supplied data processed with matrix issues to review.',notProcessed:'The hreflang matrix was not processed:',reasons:{'sitemapindex-references-not-pages':'the input lists child sitemaps, not pages. No child sitemap was fetched.','duplicate-page-urls':'duplicate page locations make matrix selection ambiguous.','matrix-limit-500-pages':'the matrix exceeds 500 pages; inventory comparison is still available.','no-hreflang-alternates':'no hreflang alternates were supplied.'},mBefore:'Unique locations before',mAfter:'Unique locations after',mAdded:'Added unique locations',mRemoved:'Removed unique locations',pages:'Supplied matrix pages',missing:'Missing return links',unchecked:'Unchecked targets',duplicate:'Duplicate entries',delta:'Difference',location:'Location',added:'Added',removed:'Removed',unchanged:'Unchanged',limited:'At most 100 rows per group are displayed. JSON / CSV includes the full bounded result.',matrix:'Hreflang observations',language:'Codes',self:'Self-reference',yes:'Observed',no:'Not observed',invalid:'Could not inspect this input. Check the XML / JSON structure and limits.'},
 ru:{title:'Hreflang-матрица и инвентарь sitemap',subtitle:'Проверьте JSON hreflang или сравните две локальные XML-карты. URL страниц и ссылки на дочерние карты разделены; отсутствующие страницы остаются непроверенными.',mode:'Hreflang / XML',before:'XML-карта ДО или JSON hreflang-матрицы',after:'XML-карта ПОСЛЕ (необязательно; для JSON оставьте пустым)',beforeFile:'Открыть первый XML / JSON файл',afterFile:'Открыть второй XML файл',example:'Заполнить пример',run:'Проверить переданные данные',clear:'Очистить ввод',json:'Скачать JSON',csv:'Скачать CSV',limits:'Каждый ввод: до 5 МиБ и 5 000 XML-записей. Hreflang-матрица: до 500 переданных страниц. URL и дочерние карты не загружаются. Query сохраняется в точном сравнении адресов и экспорте: проверьте его перед передачей. HTTP-статусы, язык отрендеренного текста и другие XML-расширения не проверяются.',dirty:'Ввод изменён. Запустите проверку повторно.',ready:'Данные готовы. Запустите проверку.',reading:'Читаем выбранный файл…',fileError:'Не удалось прочитать файл. Выберите его заново или вставьте содержимое.',done:'Переданные данные обработаны. Проверьте различия и охват матрицы; это не проверка живого сайта или индексации.',partial:'Охват матрицы частичный: некоторые целевые страницы не переданы.',issues:'Переданные данные обработаны; в матрице есть замечания.',notProcessed:'Hreflang-матрица не обрабатывалась:',reasons:{'sitemapindex-references-not-pages':'ввод содержит ссылки на дочерние карты, а не страницы. Карты не загружались.','duplicate-page-urls':'дубли адресов не позволяют однозначно выбрать сведения страницы.','matrix-limit-500-pages':'передано больше 500 страниц; сравнение инвентарей доступно отдельно.','no-hreflang-alternates':'альтернативы hreflang не переданы.'},mBefore:'Уникальных адресов до',mAfter:'Уникальных адресов после',mAdded:'Уникальных добавлено',mRemoved:'Уникальных удалено',pages:'Передано страниц матрицы',missing:'Нет возвратной ссылки',unchecked:'Не проверено целей',duplicate:'Повторных записей',delta:'Различие',location:'Адрес',added:'Добавлен',removed:'Удалён',unchanged:'Без изменения',limited:'Показано не больше 100 строк на группу. JSON / CSV содержит полный результат в пределах лимитов.',matrix:'Наблюдения hreflang',language:'Коды',self:'Ссылка на себя',yes:'Обнаружена',no:'Не обнаружена',invalid:'Не удалось проверить ввод. Проверьте структуру XML / JSON и ограничения.'}
};
const errorCopy={
 SITEMAP_INPUT_EMPTY:['Вставьте XML-карту или JSON-матрицу.','Paste an XML sitemap or JSON matrix.'],SITEMAP_TOO_LARGE:['Размер ввода превышает 5 МиБ.','Input exceeds 5 MiB.'],SITEMAP_DTD_NOT_SUPPORTED:['DTD и объявления ENTITY не поддерживаются.','DTD and ENTITY declarations are not supported.'],SITEMAP_INVALID_XML:['XML не является корректным документом.','The XML document is not well formed.'],SITEMAP_INVALID_NAMESPACE:['Нужно пространство имён sitemap http://www.sitemaps.org/schemas/sitemap/0.9.','Use the sitemap namespace http://www.sitemaps.org/schemas/sitemap/0.9.'],SITEMAP_INVALID_ROOT:['Корневой элемент должен быть urlset или sitemapindex.','The root must be urlset or sitemapindex.'],SITEMAP_NO_ENTRIES:['В карте нет записей: матрица не проверялась.','No entries were supplied; the matrix was not checked.'],SITEMAP_TOO_MANY_ENTRIES:['В XML больше 5 000 записей.','The XML exceeds 5,000 entries.'],SITEMAP_MIXED_ENTRIES:['В корне карты есть неверный тип записи или пространство имён.','The sitemap root contains an invalid entry type or namespace.'],SITEMAP_INVALID_LOC:['У записи должен быть ровно один текстовый loc.','Each entry must have exactly one text-only loc.'],SITEMAP_INVALID_URL:['Адрес должен быть абсолютным HTTP(S) URL без пробелов, логина и fragment.','Use an absolute HTTP(S) URL without whitespace, credentials or a fragment.'],SITEMAP_INVALID_ALTERNATE_NAMESPACE:['Для альтернатив требуется XHTML namespace внутри urlset.','Alternate links require the XHTML namespace inside urlset.'],SITEMAP_INVALID_ALTERNATE:['У альтернативы нужны hreflang и корректный абсолютный href.','Each alternate needs hreflang and a valid absolute href.'],SITEMAP_TOO_MANY_ALTERNATES:['У страницы больше 100 альтернатив.','A page exceeds 100 alternates.'],SITEMAP_MIXED_KINDS:['Нельзя сравнивать URL страниц со ссылками на дочерние карты.','Page URLs cannot be compared with child-sitemap references.'],HREFLANG_JSON_AFTER_NOT_SUPPORTED:['При проверке JSON оставьте второе поле пустым.','Leave the second input blank when inspecting JSON.']
};

export function mount(root,options={}){
 const language=(options.language||root.dataset.language)==='ru'?'ru':'en',t=copy[language];
 const frame=createToolFrame({root,title:t.title,subtitle:t.subtitle,modeLabel:t.mode,language});
 const before=el('textarea',{rows:10,maxLength:MAX_BYTES,spellcheck:false,className:'ym-disable-keys','data-hreflang-before':''}),after=el('textarea',{rows:8,maxLength:MAX_BYTES,spellcheck:false,className:'ym-disable-keys','data-hreflang-after':''});
 const beforeFile=el('input',{type:'file',accept:'.xml,.json,.txt',className:'ym-disable-keys','data-hreflang-before-file':''}),afterFile=el('input',{type:'file',accept:'.xml,.txt',className:'ym-disable-keys','data-hreflang-after-file':''});
 const run=el('button',{type:'submit',className:'agent-kit-download'},t.run),sample=el('button',{type:'button',className:'reproleaf-text-button','data-hreflang-example':''},t.example),clear=el('button',{type:'button',className:'reproleaf-text-button','data-hreflang-clear':''},t.clear),json=el('button',{type:'button',className:'reproleaf-text-button',disabled:true,'data-hreflang-json':''},t.json),csv=el('button',{type:'button',className:'reproleaf-text-button',disabled:true,'data-hreflang-csv':''},t.csv);
 frame.form.append(sample,el('label',{},t.beforeFile,beforeFile),el('label',{},t.before,before),el('label',{},t.afterFile,afterFile),el('label',{},t.after,after),el('p',{className:'reproleaf-help'},t.limits),el('div',{className:'agent-kit-actions'},run,clear,json,csv));
 frame.form.append(el('p',{className:'reproleaf-help'},language==='ru'?'Проверяется поддерживаемая форма кодов языка и региона, а не их наличие в реестрах ISO. x-default необязателен.':'Supported language/region syntax is checked, not ISO registry membership. x-default is optional.'));
 let latest=null;
 const versions=new Map([[before,0],[after,0]]),pendingFiles=new Map();
 function invalidate(message=t.dirty){latest=null;run.disabled=pendingFiles.size>0;json.disabled=csv.disabled=true;frame.metrics.replaceChildren();frame.metrics.hidden=true;frame.extra.replaceChildren();frame.findings.replaceChildren();frame.findingsTitle.hidden=true;frame.status.textContent=message;}
 function cancelFileReads(){for(const area of [before,after])versions.set(area,versions.get(area)+1);pendingFiles.clear();}
 function showError(error){frame.status.textContent=errorCopy[error.message]?.[language==='ru'?0:1]||t.invalid;}
 for(const area of [before,after])area.addEventListener('input',()=>{versions.set(area,versions.get(area)+1);pendingFiles.delete(area);invalidate();});
 for(const [file,area] of [[beforeFile,before],[afterFile,after]])file.addEventListener('change',async()=>{
  const token=versions.get(area)+1;versions.set(area,token);pendingFiles.delete(area);invalidate(t.reading);area.value='';const selected=file.files?.[0];if(!selected){frame.status.textContent=t.ready;return;}
  const readId={};pendingFiles.set(area,readId);run.disabled=true;
  try{if(selected.size>MAX_BYTES)throw Error('SITEMAP_TOO_LARGE');const text=await selected.text();if(token!==versions.get(area))return;area.value=text;invalidate(t.ready);}
  catch(error){if(token===versions.get(area)){area.value='';if(errorCopy[error.message])showError(error);else frame.status.textContent=t.fileError;}}
  finally{if(pendingFiles.get(area)===readId)pendingFiles.delete(area);run.disabled=pendingFiles.size>0;}
 });
 sample.addEventListener('click',()=>{cancelFileReads();invalidate(t.ready);beforeFile.value=afterFile.value='';before.value=beforeSample;after.value=afterSample;});
 clear.addEventListener('click',()=>{cancelFileReads();before.value=after.value=beforeFile.value=afterFile.value='';invalidate(t.ready);});
 json.addEventListener('click',()=>{if(latest)downloadText('reproleaf-hreflang-inventory.json',JSON.stringify(latest,null,2)+'\n');});
 csv.addEventListener('click',()=>{if(latest)downloadText('reproleaf-hreflang-inventory.csv',sitemapReportCsv(latest),'text/csv;charset=utf-8');});
 frame.form.addEventListener('submit',event=>{
  event.preventDefault();invalidate();
  try{
   const report=inspectSitemapInputs(before.value,after.value);latest=report;json.disabled=csv.disabled=false;
   if(report.mode==='hreflang-json')renderMetrics(frame.metrics,[{value:report.matrix.summary.pages,label:t.pages},{value:report.matrix.summary.missingReturnLinks,label:t.missing},{value:report.matrix.summary.uncheckedReturnLinks,label:t.unchecked}]);
   else {
    const noPair=language==='ru'?'Нет пары':'No pair';
    renderMetrics(frame.metrics,[{value:report.before.uniqueCount,label:t.mBefore},{value:report.after?.uniqueCount??noPair,label:t.mAfter},{value:report.difference?.added.length??noPair,label:t.mAdded},{value:report.difference?.removed.length??noPair,label:t.mRemoved},{value:report.before.duplicateEntryCount+(report.after?.duplicateEntryCount||0),label:t.duplicate}]);
   }
   if(report.matrix.status==='not-processed')frame.extra.append(el('p',{className:'reproleaf-help'},t.notProcessed+' '+(t.reasons[report.matrix.reason]||(language==='ru'?'Альтернативы не переданы.':'No alternates were supplied.'))));
   if(!report.difference&&report.before?.locations?.length){const body=el('tbody');for(const url of report.before.locations.slice(0,DISPLAY_LIMIT))body.append(el('tr',{},el('td',{},url)));frame.extra.append(el('h4',{},(language==='ru'?'Переданные адреса':'Supplied locations')+` (${report.before.uniqueCount})`),el('table',{className:'reproleaf-page-table'},body));}
   for(const [state,urls] of Object.entries(report.difference||{}))if(urls.length){
    const body=el('tbody');for(const url of urls.slice(0,DISPLAY_LIMIT))body.append(el('tr',{},el('td',{},t[state]),el('td',{},url)));
    frame.extra.append(el('h4',{},`${t[state]} (${urls.length})`),el('table',{className:'reproleaf-page-table'},el('thead',{},el('tr',{},el('th',{},t.delta),el('th',{},t.location))),body));
   }
   if(report.matrix.matrix?.length){const body=el('tbody');for(const page of report.matrix.matrix.slice(0,DISPLAY_LIMIT))body.append(el('tr',{},el('td',{},page.url),el('td',{},page.codes.join(', ')),el('td',{},page.hasSelfLink?t.yes:t.no)));frame.extra.append(el('h4',{},t.matrix),el('table',{className:'reproleaf-page-table'},el('thead',{},el('tr',{},el('th',{},t.location),el('th',{},t.language),el('th',{},t.self))),body));}
   frame.extra.append(el('p',{className:'reproleaf-help'},t.limited));
   const ruFindings={HREFLANG_NON_CANONICAL_PAGE:'Страница объявляет альтернативы, но её переданный canonical указывает на другой адрес.',HREFLANG_INVALID_CODE:'Код hreflang не соответствует поддерживаемой форме.',HREFLANG_DUPLICATE_CODE:'На странице повторяется одно значение hreflang.',HREFLANG_MISSING_SELF:'Не обнаружена hreflang-ссылка страницы на себя.',HREFLANG_HTML_LANG_MISMATCH:'Переданный html[lang] не совпадает с языком ссылки на себя.',HREFLANG_MISSING_X_DEFAULT:'Необязательный x-default не объявлен. Это само по себе не является ошибкой hreflang.',HREFLANG_TARGET_NOT_SUPPLIED:'Целевая страница не передана: возвратная ссылка не проверялась.',HREFLANG_MISSING_RETURN_LINK:'У переданной целевой страницы нет возвратной ссылки с ожидаемым языком исходной страницы.',SITEMAP_DUPLICATE_URL:'В инвентаре повторяется один адрес. Сравнение использует уникальные адреса.'};
   const shownFindings=language==='ru'?report.findings.map(finding=>({...finding,message:(ruFindings[finding.code]||finding.message)+(finding.url?' '+finding.url:''),recommendation:undefined})):report.findings;
   if(shownFindings.length||report.matrix.status!=='not-processed')renderFindings(frame.findings,frame.findingsTitle,shownFindings,language);
   frame.status.textContent=report.matrix.status==='not-processed'?t.notProcessed+' '+(t.reasons[report.matrix.reason]||(language==='ru'?'Альтернативы не переданы.':'No alternates were supplied.')):report.matrix.status==='partial'?t.partial:report.matrix.summary.errors?t.issues:t.done;
   emitToolEvent(root,{tool:'hreflang-sitemap',ok:report.matrix.ok,errorCount:report.findings.filter(f=>f.severity==='error').length,warningCount:report.findings.filter(f=>f.severity==='warning').length,codes:report.findings.map(f=>f.code),action:'run'});
  }catch(error){showError(error);}
 });
}
