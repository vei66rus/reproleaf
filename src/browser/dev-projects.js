import {executionProfileLabel} from '../execution-profile.mjs';
import './selects.js';
import {mountApplicationContext} from './dev-context.js';
import {mountProjects} from './projects.js';
import {normalizeFrontendEvidence} from '../history.mjs';
const element=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
for(const root of document.querySelectorAll('[data-dev-projects]')){
 const language=root.dataset.language==='en'?'en':'ru',ru=language==='ru',input=root.querySelector('[data-dev-report-text]'),file=root.querySelector('[data-dev-report-file]'),status=root.querySelector('[data-dev-report-status]'),output=root.querySelector('[data-dev-report-output]'),importBtn=root.querySelector('[data-dev-report-import]');
 let revision=0;
 const labels=ru?{pass:'Пройдена',fail:'Проблема',unsupported:'Не поддерживается','setup-error':'Ошибка настройки'}:{pass:'Passed',fail:'Problem',unsupported:'Unsupported','setup-error':'Setup error'};
 function display(report,info={}){
  output.replaceChildren();const heading=element('h3',ru?'Наблюдения CLI':'CLI observations');output.append(heading,element('p',report.target),element('p',`${report.viewport.width} × ${report.viewport.height} · ${report.browser}${report.adapterSha256?` · adapter ${report.adapterSha256.slice(0,10)}`:''}${report.checkerSha256?` · checker ${report.checkerSha256.slice(0,10)}`:''}`));
  const profile=report.executionProfile;
  output.append(element('p',profile?(ru?'Политика выполнения: ':'Execution policy: ')+executionProfileLabel(profile,language):(ru?'Политика выполнения неизвестна. Для подтверждённого сравнения повторите проверку текущей CLI.':'Execution policy is unknown. Repeat with the current CLI before confirming a comparison.')));
  if(report.blockedMethods?.length||report.blockedTransports?.length)output.append(element('p',ru?'Во время проверки заблокированы сетевые методы или каналы. Это могло изменить страницу; результат сравнения останется неподтверждённым.':'Network methods or transports were blocked during this run. This may change the page; repair comparisons remain unconfirmed.'));
  const table=element('table');table.className='reproleaf-dev-results';const body=element('tbody');
  for(const check of report.checks){const row=element('tr');row.append(element('th',check.id),element('td',labels[check.status]),element('td',check.reason||check.type));body.append(row);}table.append(body);output.append(table);
  for(const finding of report.findings.filter(f=>['setup-error','runtime-error'].includes(f.code)))output.append(element('p',finding.message));
  status.textContent=(ru?'Время отчёта CLI: ':'CLI report time: ')+new Date(report.at).toLocaleString(ru?'ru-RU':'en-GB')+(ru?'. Импортированные данные; новый запуск здесь не выполнялся.':'. Imported evidence; no fresh run was performed here.');
  if(info.historical)status.textContent+=(ru?' Открыта локальная история.':' Opened from local history.');
 }
 let memory;const applicationContext=mountApplicationContext(root,{onDirty:()=>memory?.dirty()});
 memory=mountProjects(root.querySelector('[data-project-workspace=web]'),{workspace:'web',language,capture:()=>({reportText:input.value,applicationContext:applicationContext.capture()}),restore:state=>{revision++;applicationContext.restore(state?.applicationContext);input.value=typeof state?.reportText==='string'?state.reportText:'';file.value='';output.replaceChildren();status.textContent='';},rerun:()=>importBtn.click(),showReport:display});
 input.addEventListener('input',()=>{revision++;memory.dirty();output.replaceChildren();status.textContent='';});
 file.onchange=async()=>{const selected=file.files[0];if(!selected)return;revision++;memory.dirty();output.replaceChildren();input.value='';const at=revision;if(selected.size>1048576){status.textContent=ru?'Файл больше 1 МиБ.':'File exceeds 1 MiB.';return;}try{const data=await selected.text();if(at===revision)input.value=data;}catch{status.textContent=ru?'Не удалось прочитать файл.':'Could not read the file.';}};
 importBtn.onclick=async()=>{
  if(input.value.length>1048576){status.textContent=ru?'Отчёт больше 1 МиБ.':'Report exceeds 1 MiB.';return;}
  try{const report=normalizeFrontendEvidence(JSON.parse(input.value)),token=memory.token();display(report);await memory.record({state:{reportText:input.value,applicationContext:applicationContext.capture()},report,engine:report.checkerSha256||'unversioned-cli',context:null,token});}
  catch{output.replaceChildren();status.textContent=ru?'Нужен JSON-отчёт команды check --adapter: target, viewport и результаты с уникальными id. Отчёт synthetic verify --all имеет другой формат.':'Use a check --adapter JSON report with target, viewport and uniquely identified results. A synthetic verify --all report uses a different format.';}
 };
}
