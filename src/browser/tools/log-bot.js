import {analyzeAccessLogs} from '../../access-log-analyzer.mjs';
import {csvCell} from '../../csv-export.mjs';
import {el,createToolFrame,renderMetrics,renderFindings,emitToolEvent,downloadText} from '../tool-shell.mjs';

const MAX_BYTES=2*1024*1024,MAX_LINES=10000;
const words={
 en:{title:'Access Log Bot Checker',subtitle:'Analyze supplied Nginx/Apache combined logs or Cloudflare JSONL locally. Bot families come from claimed user-agent strings; identity and indexing are not verified.',mode:'Access logs',file:'Open a log file (up to 2 MiB)',raw:'Paste access log records',format:'Log format',auto:'Detect per record',combined:'Nginx / Apache combined',cloudflare:'Cloudflare JSONL',paths:'Optional site URLs, one per line (up to 500)',example:'Load example',run:'Analyze logs',clear:'Clear input',json:'Download JSON',csv:'Download CSV',limits:'Up to 10,000 nonempty records. No network requests. Queries, fragments and known sensitive path segments are removed from output; review remaining paths before sharing.',dirty:'Input changed. Run the check again to update the result.',reading:'Reading the selected file…',ready:'Input ready. Run the check.',missing:'Paste log records or choose a file.',tooBig:'The input exceeds 2 MiB.',tooMany:'The input exceeds 10,000 nonempty records.',noRecords:'No valid records could be parsed. Choose the matching format and check the input.',failed:'Could not read this file. Choose it again or paste the text.',done:'Review complete for the supplied records. User-agent names are claims, not verified bots.',noBots:'Records parsed; no known bot user-agent signatures observed. This is not proof that bots never visited.',total:'Parsed records',unparsed:'Unparsed records',bots:'Claimed bot requests',review:'Review candidates',families:'Claimed bot families',status:'Bot response classes',targets:'Most requested paths (sanitized)',absent:'Supplied paths without a matching bot request',key:'Family / path',hits:'Requests',notMeasured:'Not measured',invalid:'Check the input limits and format.',pathsLimit:'Supply at most 500 URLs.',emptyFile:'This file is empty.'},
 ru:{title:'Анализ логов обращений ботов',subtitle:'Локальная проверка Nginx/Apache combined и Cloudflare JSONL. Семейства определяются по заявленному User-Agent; подлинность бота и индексация не проверяются.',mode:'Access-логи',file:'Открыть лог-файл (до 2 МиБ)',raw:'Вставьте записи access-лога',format:'Формат лога',auto:'Определять по каждой записи',combined:'Nginx / Apache combined',cloudflare:'Cloudflare JSONL',paths:'URL сайта для сопоставления, по одному на строку (до 500)',example:'Заполнить пример',run:'Проверить лог',clear:'Очистить ввод',json:'Скачать JSON',csv:'Скачать CSV',limits:'До 10 000 непустых записей. Без сетевых запросов. Из результата удаляются query, fragment и известные чувствительные сегменты пути; остальные пути проверьте перед передачей.',dirty:'Ввод изменён. Запустите проверку повторно для актуального результата.',reading:'Читаем выбранный файл…',ready:'Данные готовы. Запустите проверку.',missing:'Вставьте записи лога или выберите файл.',tooBig:'Ввод превышает 2 МиБ.',tooMany:'Ввод превышает 10 000 непустых записей.',noRecords:'Не удалось разобрать ни одной записи. Проверьте формат и содержимое.',failed:'Не удалось прочитать файл. Выберите его заново или вставьте текст.',done:'Проверка переданных записей завершена. User-Agent не доказывает подлинность бота.',noBots:'Записи разобраны, известных сигнатур User-Agent ботов нет. Это не доказывает отсутствие посещений ботами.',total:'Разобрано записей',unparsed:'Не разобрано',bots:'Запросов с User-Agent бота',review:'Кандидатов на проверку',families:'Заявленные семейства ботов',status:'Классы ответов ботам',targets:'Самые запрашиваемые пути (очищены)',absent:'Переданные пути без совпавшего запроса бота',key:'Семейство / путь',hits:'Запросов',notMeasured:'Нет измерения',invalid:'Проверьте ограничения и формат ввода.',pathsLimit:'Передайте не больше 500 URL.',emptyFile:'Выбран пустой файл.'}
};

export function reviewLogText({rawLog,format='auto',crawledUrls=[]}){
 if(new TextEncoder().encode(rawLog).length>MAX_BYTES)throw Error('LOG_INPUT_TOO_LARGE');
 if(rawLog.split(/\r?\n/).filter(line=>line.trim()).length>MAX_LINES)throw Error('LOG_INPUT_TOO_MANY_LINES');
 if(crawledUrls.length>500)throw Error('LOG_PATH_LIMIT');
 if(!rawLog.trim())throw Error('LOG_INPUT_EMPTY');
 return analyzeAccessLogs({rawLog,format,crawledUrls});
}

export function logReportCsv(report){
 const rows=[['section','key','requests']];
 for(const [key,value] of Object.entries(report.hitsByBot))rows.push(['claimed_bot',key,value]);
 for(const [key,value] of Object.entries(report.botStatusDistribution))rows.push(['response_class',key,value]);
 for(const row of report.topCrawledPaths)rows.push(['sanitized_path',row.path,row.hits]);
 for(const row of report.topWastedTargets)rows.push(['review_candidate',row.target,row.hits]);
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
}

function table(title,rows,t){
 const body=el('tbody');
 for(const [key,hits] of rows)body.append(el('tr',{},el('td',{},key),el('td',{},String(hits))));
 return el('section',{},el('h4',{},title),el('table',{className:'reproleaf-page-table'},el('thead',{},el('tr',{},el('th',{},t.key),el('th',{},t.hits))),body));
}

export function mount(root){
 const language=root.dataset.language==='ru'?'ru':'en',t=words[language];
 const frame=createToolFrame({root,title:t.title,subtitle:t.subtitle,modeLabel:t.mode,language});
 const file=el('input',{type:'file',accept:'.log,.txt,.jsonl,.ndjson',className:'ym-disable-keys','data-log-file':''});
 const raw=el('textarea',{rows:10,maxLength:MAX_BYTES,spellcheck:false,className:'ym-disable-keys','data-log-input':''});
 const paths=el('textarea',{rows:3,maxLength:200000,spellcheck:false,className:'ym-disable-keys reproleaf-short','data-log-paths':''});
 const format=el('select',{'data-log-format':''},el('option',{value:'auto'},t.auto),el('option',{value:'combined'},t.combined),el('option',{value:'cloudflare-jsonl'},t.cloudflare));
 const example=el('button',{type:'button',className:'reproleaf-text-button','data-log-example':''},t.example);
 const run=el('button',{type:'submit',className:'agent-kit-download'},t.run);
 const clear=el('button',{type:'button',className:'reproleaf-text-button','data-log-clear':''},t.clear);
 const json=el('button',{type:'button',className:'reproleaf-text-button',disabled:true,'data-log-json':''},t.json);
 const csv=el('button',{type:'button',className:'reproleaf-text-button',disabled:true,'data-log-csv':''},t.csv);
 frame.form.append(example,el('label',{},t.file,file),el('label',{},t.format,format),el('label',{},t.raw,raw),el('label',{},t.paths,paths),el('p',{className:'reproleaf-help'},t.limits),el('div',{className:'agent-kit-actions'},run,clear,json,csv));
 let revision=0,lastReport=null;
 function invalidate(message=t.dirty){
  revision++;lastReport=null;json.disabled=csv.disabled=true;run.disabled=false;frame.metrics.hidden=true;frame.metrics.replaceChildren();frame.extra.replaceChildren();frame.findings.replaceChildren();frame.findingsTitle.hidden=true;frame.status.textContent=message;
 }
 function fail(error){
  const messages={LOG_INPUT_TOO_LARGE:t.tooBig,LOG_INPUT_TOO_MANY_LINES:t.tooMany,LOG_PATH_LIMIT:t.pathsLimit,LOG_INPUT_EMPTY:t.missing};
  frame.status.textContent=messages[error.message]||t.invalid;
 }
 for(const input of [raw,paths,format])input.addEventListener('input',()=>invalidate());
 format.addEventListener('change',()=>invalidate());
 file.addEventListener('change',async()=>{
  invalidate(t.reading);raw.value='';const selected=file.files?.[0];if(!selected){frame.status.textContent=t.ready;return;}
  const token=revision;run.disabled=true;
  try{
   if(selected.size>MAX_BYTES)throw Error('LOG_INPUT_TOO_LARGE');
   if(selected.size===0){frame.status.textContent=t.emptyFile;return;}
   const text=await selected.text();if(token!==revision)return;
   raw.value=text;frame.status.textContent=t.ready;
  }catch(error){if(token===revision){raw.value='';frame.status.textContent=error.message==='LOG_INPUT_TOO_LARGE'?t.tooBig:t.failed;}}
  finally{if(token===revision)run.disabled=false;}
 });
 example.addEventListener('click',()=>{
  invalidate(t.ready);file.value='';format.value='combined';paths.value='https://example.com/guide\nhttps://example.com/new-guide';
  raw.value=['192.0.2.1 - - [15/Nov/2026:12:00:00 +0000] "GET /guide HTTP/1.1" 200 4500 "-" "Googlebot/2.1"','192.0.2.2 - - [15/Nov/2026:12:01:00 +0000] "GET /missing?utm_source=demo HTTP/1.1" 404 512 "-" "OAI-SearchBot/1.0"','192.0.2.3 - - [15/Nov/2026:12:02:00 +0000] "GET /old-guide HTTP/1.1" 301 512 "-" "PerplexityBot/1.0"'].join('\n');
 });
 clear.addEventListener('click',()=>{raw.value=paths.value=file.value='';format.value='auto';invalidate(t.ready);});
 json.addEventListener('click',()=>{if(lastReport)downloadText('reproleaf-log-bot.json',JSON.stringify(lastReport,null,2)+'\n');});
 csv.addEventListener('click',()=>{if(lastReport)downloadText('reproleaf-log-bot.csv',logReportCsv(lastReport),'text/csv;charset=utf-8');});
 frame.form.addEventListener('submit',event=>{
  event.preventDefault();invalidate();
  try{
   const report=reviewLogText({rawLog:raw.value,format:format.value,crawledUrls:paths.value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean)});
   if(report.summary.totalHits===0){frame.status.textContent=t.noRecords;return;}
   lastReport=report;json.disabled=csv.disabled=false;
   frame.status.textContent=report.summary.botHits?t.done:t.noBots;
   renderMetrics(frame.metrics,[{value:report.summary.totalHits,label:t.total},{value:report.summary.unparsedLines,label:t.unparsed},{value:report.summary.botHits,label:t.bots},{value:report.summary.reviewCandidateHits,label:t.review}]);
   frame.extra.append(table(t.families,Object.entries(report.hitsByBot),t),table(t.status,Object.entries(report.botStatusDistribution),t),table(t.targets,report.topCrawledPaths.map(row=>[row.path,row.hits]),t));
   if(report.invisiblePages.length)frame.extra.append(el('h4',{},t.absent),el('ul',{},...report.invisiblePages.map(value=>el('li',{},value))));
   const findings=report.findings.map(f=>({...f,message:language==='ru'?({'LOGS_HIGH_CRAWL_BUDGET_WASTE':'Запросы с редиректами, ошибками и выбранными параметрами требуют проверки. Это не измеренный расход краулингового бюджета.','LOGS_BOT_5XX_ERRORS':'Для запросов с User-Agent ботов наблюдались ответы 5xx. Подлинность ботов не проверялась.','LOGS_INVISIBLE_CRAWLED_PAGES':'Некоторые переданные пути не встретились у известных User-Agent в этих записях. Вывод об индексации невозможен.','LOGS_NO_KNOWN_BOT_UA':'В переданных записях не обнаружены известные User-Agent ботов.'}[f.code]||f.message):f.message}));
   renderFindings(frame.findings,frame.findingsTitle,findings,language);
   emitToolEvent(root,{tool:'log-bot',ok:report.ok,errorCount:report.findings.filter(f=>f.severity==='error').length,warningCount:report.findings.filter(f=>f.severity==='warning').length,codes:report.findings.map(f=>f.code),action:'run'});
  }catch(error){fail(error);}
 });
}
