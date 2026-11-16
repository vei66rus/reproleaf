import {buildMarkupReview,markupFindingTitle} from './markup-review.js';
import {el,createToolFrame,renderMetrics,downloadText,emitToolEvent} from '../tool-shell.mjs';
import {decodeHtmlBytes} from '../../html-byte-decoder.mjs';

export const BATCH_MARKUP_LIMITS=Object.freeze({files:20,totalBytes:5242880,fileBytes:1048576,decodedTextBytes:1048576});
const stop=code=>{throw new Error(code);};
const allowedErrors=new Set(['MARKUP_EMPTY','MARKUP_SIZE','MARKUP_COMPLEX','MARKUP_MODE','MARKUP_URL']);
const yieldTurn=()=>globalThis.scheduler?.yield?globalThis.scheduler.yield():new Promise(resolve=>setTimeout(resolve,0));
function readFileCancellable(file,signal){
 if(signal?.aborted)return Promise.resolve({aborted:true});
 return new Promise(resolve=>{
  let settled=false;
  const finish=value=>{if(settled)return;settled=true;signal?.removeEventListener('abort',onAbort);resolve(value);};
  const onAbort=()=>finish({aborted:true});signal?.addEventListener('abort',onAbort,{once:true});
  Promise.resolve().then(async()=>{
   if(typeof file.arrayBuffer==='function'){
    const buffer=await file.arrayBuffer();if(signal?.aborted)return {aborted:true};const bytes=new Uint8Array(buffer);
    if(bytes.byteLength!==file.size)return {error:'BATCH_METADATA'};
    const decoded=decodeHtmlBytes(bytes,{maxBytes:BATCH_MARKUP_LIMITS.fileBytes,maxDecodedBytes:BATCH_MARKUP_LIMITS.decodedTextBytes});
    return decoded.ok?{text:decoded.text,encoding:decoded.encoding}:{error:decoded.error==='HTML_TEXT_LIMIT'?'BATCH_TEXT_LIMIT':'BATCH_ENCODING',encoding:decoded.encoding};
   }
   if(typeof file.text!=='function')return {error:'BATCH_READ'};
   const text=await file.text();if(signal?.aborted)return {aborted:true};
   // File-like string adapters use a declared UTF-8 text size. Native browser
   // Files use the byte branch above, where legacy encoding can expand freely.
   if(typeof text!=='string'||new TextEncoder().encode(text).length!==file.size)return {error:'BATCH_METADATA'};
   return {text,encoding:{source:'already-decoded-string',selected:null,byteLength:null,scope:'Caller supplied a UTF-8-sized string; original bytes and encoding were not observed.'}};
  }).then(value=>finish(value),()=>finish({error:'BATCH_READ'}));
 });
}
function summarize(files){
 const checked=files.filter(f=>f.status==='checked'),duplicates=files.filter(f=>f.status==='duplicate');
 const observed=[...checked,...duplicates];
 return {inputFiles:files.length,processedFiles:files.filter(f=>f.status!=='not-processed').length,uniqueCheckedFiles:checked.length,duplicateFiles:duplicates.length,failedFiles:files.filter(f=>f.status==='failed').length,notProcessedFiles:files.filter(f=>f.status==='not-processed').length,filesWithErrors:observed.filter(f=>f.summary.errors>0).length,filesWithWarnings:observed.filter(f=>f.summary.warnings>0).length};
}
export async function runMarkupBatch(inputFiles,{mode='jsonld-schema',signal,onProgress=()=>{},yieldControl=yieldTurn}={}){
 if(!['jsonld-schema','social-meta'].includes(mode))stop('BATCH_MODE');
 const files=Array.from(inputFiles||[]);
 if(!files.length||files.length>BATCH_MARKUP_LIMITS.files)stop('BATCH_COUNT');
 let totalBytes=0;
 for(const file of files){if(!file||!Number.isSafeInteger(file.size)||file.size<0)stop('BATCH_METADATA');totalBytes+=file.size;}
 if(totalBytes>BATCH_MARKUP_LIMITS.totalBytes)stop('BATCH_TOTAL');
 const outcomes=files.map((file,index)=>({id:`file-${String(index+1).padStart(2,'0')}`,status:'not-processed',reason:'pending',declaredBytes:file.size,summary:null}));
 const seen=new Map(),byId=new Map();
 const progress=currentId=>onProgress({completed:summarize(outcomes).processedFiles,total:files.length,currentId,files:outcomes.map(file=>({...file}))});
 progress(null);
 for(let index=0;index<files.length;index++){
  if(signal?.aborted)break;
  const file=files[index],outcome=outcomes[index];
  if(file.size>BATCH_MARKUP_LIMITS.fileBytes){outcome.status='failed';outcome.reason='BATCH_FILE_LIMIT';progress(outcome.id);await yieldControl();continue;}
  if(typeof file.name!=='string'||!/\.html?$/i.test(file.name)){outcome.status='failed';outcome.reason='BATCH_TYPE';progress(outcome.id);await yieldControl();continue;}
  const loaded=await readFileCancellable(file,signal);
  if(signal?.aborted||loaded.aborted)break;
  if(loaded.error||typeof loaded.text!=='string'){
   outcome.status='failed';outcome.reason=loaded.error||'BATCH_READ';if(loaded.encoding)outcome.encoding=loaded.encoding;progress(outcome.id);await yieldControl();continue;
  }
  const text=loaded.text;
  outcome.encoding=loaded.encoding;
  if(text.length>BATCH_MARKUP_LIMITS.decodedTextBytes||new TextEncoder().encode(text).length>BATCH_MARKUP_LIMITS.decodedTextBytes){outcome.status='failed';outcome.reason='BATCH_TEXT_LIMIT';progress(outcome.id);await yieldControl();continue;}
  if(seen.has(text)){
   const previous=byId.get(seen.get(text));outcome.status='duplicate';outcome.reason='identical-decoded-content';outcome.duplicateOf=previous.id;outcome.summary={...previous.summary};
  }else{
   try{
    const report=buildMarkupReview({mode,text,format:'html',encoding:loaded.encoding});
    if(signal?.aborted)break;
    outcome.status='checked';outcome.reason=null;outcome.report=report;outcome.summary={errors:report.summary.errors,warnings:report.summary.warnings};seen.set(text,outcome.id);byId.set(outcome.id,outcome);
   }catch(error){outcome.status='failed';outcome.reason=allowedErrors.has(error.message)?error.message:'BATCH_CHECK';}
  }
  progress(outcome.id);await yieldControl();
 }
 const cancelled=Boolean(signal?.aborted);
 for(const outcome of outcomes)if(outcome.status==='not-processed')outcome.reason=cancelled?'cancelled':'not-started';
 const summary=summarize(outcomes);
 const report={schemaVersion:1,tool:'batch-markup',mode,status:cancelled?'cancelled':'completed',complete:!cancelled&&summary.failedFiles===0&&summary.notProcessedFiles===0,ok:!cancelled&&summary.failedFiles===0&&summary.notProcessedFiles===0&&summary.filesWithErrors===0,summary,scope:{networkUsed:false,rawHtmlIncluded:false,fileNamesIncluded:false,identifiers:'Ordinal selection-order IDs only; original file names remain in the local UI.',duplicates:'Exact decoded content reuses the first successful check in this run; all file rows remain present.',pageUrls:'No per-file URL is invented. Only supplied HTML metadata is inspected.',inputEncoding:'Bounded BOM/header/meta HTML decoding with fatal errors; raw-byte and decoded UTF-8 text budgets are separate. Each row retains encoding provenance.',coverage:'Local structural profiles, not full Schema.org, Google rich-result, indexing, image-fetch or social-platform rendering validation.',limits:BATCH_MARKUP_LIMITS},files:outcomes};
 progress(null);return report;
}
export function formatBatchMarkupCsv(report){
 const rows=[['record','file_id','status','duplicate_of','error_code','errors','warnings','finding_code','finding_severity','observation','next_step','encoding','encoding_source','raw_bytes','decoded_utf8_bytes']];
 for(const file of report.files){
  rows.push(['file',file.id,file.status,file.duplicateOf||'',file.reason||'',file.summary?.errors??'',file.summary?.warnings??'','','','','',file.encoding?.selected||'',file.encoding?.source||'',file.encoding?.byteLength??'',file.encoding?.decodedUtf8Bytes??'']);
  for(const finding of file.report?.findings||[])rows.push(['finding',file.id,file.status,'','',file.summary.errors,file.summary.warnings,finding.code,finding.severity,finding.message,finding.recommendation||'','','','','']);
 }
 const cell=value=>{let text=String(value??'');if(/^[\s\uFEFF]*[=+\-@]/u.test(text)||/^[\t\r\n]/u.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
export function localBatchLabel(name){return String(name||'').replaceAll('\\','/').split('/').at(-1).replace(/[\u0000-\u001F\u007F]/g,'').slice(0,160)||'HTML';}
const copy={
 ru:{title:'Пакетная проверка HTML-файлов',intro:'Проверьте до 20 локальных HTML-файлов: до 1 МиБ каждый и до 5 МиБ суммарно. Файлы обрабатываются по очереди в браузере, без запросов к URL.',files:'Выбрать HTML-файлы',run:'Проверить файлы',cancel:'Остановить',clear:'Очистить',json:'Скачать JSON',csv:'Скачать CSV',ready:'Выберите файлы для проверки.',changed:'Выбор изменён. Запустите пакетную проверку.',running:'Обработано',cancelled:'Проверка остановлена. Необработанные файлы отмечены в таблице.',done:'Пакет обработан. Проверьте замечания и полноту каждой строки.',failed:'Проверка завершилась с непроверенными файлами. Это не полный успешный результат.',names:'Исходные имена видны только в этой вкладке. В экспорт попадают file-01, file-02 и другие порядковые ID, без имён файлов и исходного HTML. Проверьте оставшиеся значения метатегов и пути перед передачей.',dedupe:'Одинаковое декодированное содержимое использует первый успешный результат; файл остаётся отдельной строкой со ссылкой на исходную проверку.',scope:'Локальные структурные профили. Проверка не подтверждает индексацию, право на расширенные результаты или вид карточки на платформе.',columns:['ID и локальное имя','Статус','Ошибки / замечания'],status:{checked:'Проверен',duplicate:'Повтор содержимого',failed:'Не проверен: ошибка','not-processed':'Не обработан'},mChecked:'Уникальных проверок',mDuplicates:'Повторных файлов',mFailed:'Ошибок чтения/проверки',mPending:'Не обработано',errors:{BATCH_COUNT:'Выберите от 1 до 20 файлов.',BATCH_METADATA:'Не удалось определить размер выбранных файлов.',BATCH_TOTAL:'Суммарный размер превышает 5 МиБ.',BATCH_MODE:'Неподдержанный режим проверки.',BATCH_FILE_LIMIT:'Файл превышает 1 МиБ.',BATCH_TYPE:'Нужен файл .html или .htm.',BATCH_READ:'Не удалось прочитать файл.',BATCH_TEXT_LIMIT:'Декодированный текст превышает 1 МиБ UTF-8.',BATCH_ENCODING:'Не удалось строго декодировать файл по объявленной кодировке.',BATCH_CHECK:'Проверка файла не завершилась.',MARKUP_EMPTY:'Файл пуст.',MARKUP_SIZE:'Превышен бюджет размера файла.',MARKUP_COMPLEX:'Превышен бюджет сложности HTML/JSON-LD.'}},
 en:{title:'Batch HTML file inspector',intro:'Check up to 20 local HTML files, up to 1 MiB each and 5 MiB total. Files are processed in sequence in your browser without URL requests.',files:'Choose HTML files',run:'Check files',cancel:'Stop',clear:'Clear',json:'Download JSON',csv:'Download CSV',ready:'Choose files to inspect.',changed:'Selection changed. Run a new batch.',running:'Processed',cancelled:'Stopped. Unprocessed files remain listed in the table.',done:'Batch processed. Review findings and coverage for every row.',failed:'Some files remain unchecked. This is not a complete successful result.',names:'Original names stay in this tab. Exports use ordinal IDs such as file-01, without input file names or source HTML. Review remaining meta values and paths before sharing.',dedupe:'Identical decoded contents reuse the first successful check in this run. Each file keeps its own row and a reference to that check.',scope:'Local structural profiles. These checks do not establish indexing, rich-result eligibility or actual social-platform card rendering.',columns:['ID and local name','Status','Errors / warnings'],status:{checked:'Checked',duplicate:'Duplicate content',failed:'Unchecked: failed','not-processed':'Not processed'},mChecked:'Unique checks',mDuplicates:'Duplicate files',mFailed:'Read/check failures',mPending:'Not processed',errors:{BATCH_COUNT:'Choose between 1 and 20 files.',BATCH_METADATA:'File sizes could not be determined.',BATCH_TOTAL:'Total size exceeds 5 MiB.',BATCH_MODE:'Unsupported check mode.',BATCH_FILE_LIMIT:'File exceeds 1 MiB.',BATCH_TYPE:'Choose an .html or .htm file.',BATCH_READ:'The file could not be read.',BATCH_TEXT_LIMIT:'Decoded text exceeds 1 MiB of UTF-8.',BATCH_ENCODING:'The file could not be decoded strictly using its declared encoding.',BATCH_CHECK:'The file check did not complete.',MARKUP_EMPTY:'File is empty.',MARKUP_SIZE:'File size budget exceeded.',MARKUP_COMPLEX:'HTML/JSON-LD complexity budget exceeded.'}}
};
export function mountBatch(root,{mode='jsonld-schema'}={}){
 const language=root.dataset.language==='en'?'en':'ru',t=copy[language],frame=createToolFrame({root,title:t.title,subtitle:t.intro,modeLabel:mode==='jsonld-schema'?'JSON-LD batch':'Social meta batch',language});
 const input=el('input',{type:'file',multiple:true,accept:'.html,.htm,text/html',className:'ym-disable-keys'}),run=el('button',{type:'submit',className:'agent-kit-download'},t.run),cancel=el('button',{type:'button',className:'reproleaf-text-button',disabled:true},t.cancel),clear=el('button',{type:'button',className:'reproleaf-text-button'},t.clear),json=el('button',{type:'button',className:'reproleaf-text-button',disabled:true},t.json),csv=el('button',{type:'button',className:'reproleaf-text-button',disabled:true},t.csv),progress=el('progress',{max:1,value:0,hidden:true,'aria-label':t.running});
 frame.form.append(el('label',{},t.files,input),el('p',{className:'reproleaf-help'},t.names),el('p',{className:'reproleaf-help'},t.dedupe),el('div',{className:'agent-kit-actions'},run,cancel,clear,json,csv));frame.extra.append(progress);
 frame.form.append(el('p',{className:'reproleaf-help'},language==='ru'?'Исходные байты каждого файла и декодированный текст имеют отдельный лимит 1 МиБ. Размер текста считается в UTF-8; сумма исходных файлов ограничена 5 МиБ.':'Each file has separate 1 MiB limits for raw bytes and decoded UTF-8 text. The total raw-file limit is 5 MiB.'));
 let revision=0,active=null,last=null,labels=[];
 function renderFiles(files){
  const table=el('table',{className:'reproleaf-page-table'},el('thead',{},el('tr',{},...t.columns.map(label=>el('th',{},label))))),body=el('tbody',{});
  for(const [index,file] of files.entries()){
   const name=el('td',{},el('strong',{},file.id),el('small',{},labels[index]||''));
   if(file.encoding)name.append(el('small',{},`${file.encoding.selected||(language==='ru'?'Не декодирован':'Not decoded')} / ${file.encoding.source||''}`));
   const report=file.report||(file.duplicateOf?files.find(previous=>previous.id===file.duplicateOf)?.report:null);
   if(report){
    const list=el('ul',{className:'reproleaf-findings'});
    for(const finding of report.findings.slice(0,10))list.append(el('li',{},el('div',{className:'reproleaf-finding-head'},el('code',{className:'reproleaf-finding-code'},finding.code)),el('strong',{className:'reproleaf-finding-title'},markupFindingTitle(finding,language)),el('details',{},el('summary',{},language==='ru'?'Исходное наблюдение (EN)':'Original observation'),el('p',{className:'reproleaf-help'},finding.message),...(finding.recommendation?[el('p',{className:'reproleaf-help'},finding.recommendation)]:[]))));
    if(!report.findings.length)list.append(el('li',{},language==='ru'?'По выполненному локальному профилю замечаний нет.':'No findings under the executed local profile.'));
    name.append(el('details',{'data-batch-findings':file.id},el('summary',{},language==='ru'?`Замечания: ${report.findings.length}`:`Findings: ${report.findings.length}`),el('p',{className:'reproleaf-help'},language==='ru'?'В этом списке до 10 замечаний. Полный результат есть в JSON/CSV.':'This preview shows up to 10 findings. JSON/CSV contain the full bounded result.'),list));
   }
   body.append(el('tr',{},name,el('td',{},t.status[file.status]||file.status,...(file.duplicateOf?[el('small',{},file.duplicateOf)]:[]),...(t.errors[file.reason]?[el('small',{},t.errors[file.reason])]:[])),el('td',{},file.summary?`${file.summary.errors} / ${file.summary.warnings}`:(language==='ru'?'Не проверено':'Not checked'))));
  }
  table.append(body);frame.extra.replaceChildren(progress,table,el('p',{className:'reproleaf-help'},t.scope));
 }
 function invalidate(){revision++;active?.abort();active=null;last=null;run.disabled=false;cancel.disabled=true;json.disabled=csv.disabled=true;progress.hidden=true;frame.metrics.hidden=true;frame.metrics.replaceChildren();frame.extra.replaceChildren(progress);frame.status.textContent=t.changed;}
 input.addEventListener('change',()=>{invalidate();labels=Array.from(input.files||[]).map(file=>localBatchLabel(file.name));});
 clear.onclick=()=>{invalidate();input.value='';labels=[];frame.status.textContent=t.ready;};
 cancel.onclick=()=>active?.abort();
 frame.form.addEventListener('submit',async event=>{
  event.preventDefault();invalidate();const token=revision,controller=new AbortController();active=controller;run.disabled=true;cancel.disabled=false;
  try{
   const result=await runMarkupBatch(Array.from(input.files||[]),{mode,signal:controller.signal,onProgress:update=>{if(token!==revision)return;progress.hidden=false;progress.max=update.total;progress.value=update.completed;frame.status.textContent=`${t.running}: ${update.completed} / ${update.total}`;renderFiles(update.files);}});
   if(token!==revision)return;last=result;progress.hidden=true;renderFiles(result.files);renderMetrics(frame.metrics,[{value:result.summary.uniqueCheckedFiles,label:t.mChecked},{value:result.summary.duplicateFiles,label:t.mDuplicates},{value:result.summary.failedFiles,label:t.mFailed},{value:result.summary.notProcessedFiles,label:t.mPending}]);frame.status.textContent=result.status==='cancelled'?t.cancelled:result.complete?t.done:t.failed;json.disabled=csv.disabled=false;emitToolEvent(root,{tool:mode,ok:result.ok,errorCount:result.summary.filesWithErrors+result.summary.failedFiles,warningCount:result.summary.filesWithWarnings,codes:result.complete?[]:['BATCH_PARTIAL'],action:'run'});
  }catch(error){if(token===revision)frame.status.textContent=t.errors[error.message]||t.errors.BATCH_CHECK;}
  finally{if(token===revision){active=null;run.disabled=false;cancel.disabled=true;}}
 });
 json.onclick=()=>{if(last)downloadText(`reproleaf-${mode}-batch.json`,JSON.stringify(last,null,2));};csv.onclick=()=>{if(last)downloadText(`reproleaf-${mode}-batch.csv`,formatBatchMarkupCsv(last),'text/csv;charset=utf-8');};frame.status.textContent=t.ready;
 return {cancel:()=>active?.abort()};
}
