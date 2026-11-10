import {executionProfileLabel} from '../execution-profile.mjs';
import {createProjectStore,projectLimits} from './project-store.mjs';
import {compareRuns,reportKind,findingKey} from '../history.mjs';
import {comparisonHtml} from '../report-html.mjs';
const text={
 ru:{unsaved:'Есть несохранённые изменения.',saved:'Проект сохранён в этом браузере.',empty:'Новый проект',open:'Проект открыт. Можно повторить проверку.',recorded:'Проверка добавлена в историю.',name:'Укажите название проекта.',choose:'Сначала выберите сохранённый проект.',needTwo:'Нужны две разные проверки одного типа.',discard:'Есть несохранённые изменения. Продолжить без сохранения?',deleted:'Проект и его история удалены.',notStored:'Отчёт готов, но история не сохранена.',history:'Сохранённые проверки',retention:`Хранятся последние ${projectLimits.runs} проверок каждого проекта.`,imported:'Архив импортирован как отдельная копия проекта.',archived:'Проект перемещён в архив.',unarchived:'Проект возвращён из архива.',baselineSet:'Базовая проверка закреплена.',baselineCleared:'Базовая проверка снята.',decisionSaved:'Решение по замечанию сохранено в проекте.',kinds:{editorial:'Статья',blog:'Карта ссылок',frontend:'Web Dev'},objectKinds:{article:'Статья',site:'Сайт',scenario:'Сценарий'},groups:{added:'Новые',remaining:'Остались',resolved:'Больше не найдены при сопоставимой проверке',unverified:'Не подтверждено'},decisionLabels:{accepted:'В работе',deferred:'Отложено',dismissed:'Отклонено'},warnings:{'engine-changed':'Изменилась версия проверяющего ядра.','inventory-scope-changed':'Изменился состав страниц или объём выгрузки.','frontend-scope-changed':'Изменились условия проверки интерфейса.','configuration-changed':'Изменились настройки, запрос или правила проверки.','execution-profile-unknown':'Политика выполнения неизвестна. Повторите проверку текущей CLI.','execution-profile-changed':'Изменилась политика сети или эмуляции браузера.','unversioned-target-state':'Отпечаток конечного состояния адреса отсутствует. Нужна повторная проверка.','unversioned-adapter':'В отчёте нет корректного SHA-256 адаптера. Результат не подтверждён.','unversioned-browser':'Версия браузера неизвестна. Условия проверки не подтверждены.','unversioned-checker':'В отчёте нет версии проверяющего кода. Исчезновение ошибки требует нового подтверждения.','run-incomplete':'Базовый или повторный запуск не завершён без ошибок.','different-object':'Сравниваются разные объекты проверки внутри проекта.'},failed:{'project-name':'Название — от 1 до 100 символов.','project-conflict':'Этот проект изменился в другой вкладке. Откройте его заново перед сохранением.','project-missing':'Проект больше не найден. Обновите список.','run-missing':'Выбранная проверка больше не найдена.','project-limit':'Достигнут предел в 20 проектов. Экспортируйте и удалите ненужный.','storage-budget':'Локальная история достигла 32 МиБ. Экспортируйте и удалите ненужные проекты.','record-too-large':'Эта запись больше 8 МиБ. Скачайте отчёт отдельно или уменьшите выгрузку.','storage-unavailable':'Браузер не разрешил локальную историю. Проверки доступны без сохранения.','storage-blocked':'Обновление хранилища заблокировано другой вкладкой.','invalid-archive':'Файл не является корректным архивом проекта Reproleaf.','invalid-object':'Название объекта — до 120 символов.','invalid-note':'Заметка — до 500 символов.','invalid-decision':'Некорректный статус или ключ замечания.','decision-limit':'Достигнут предел в 500 сохранённых решений в проекте.'}},
 en:{unsaved:'There are unsaved changes.',saved:'Project saved in this browser.',empty:'New project',open:'Project opened. You can run a fresh check.',recorded:'Check added to history.',name:'Enter a project name.',choose:'Select a saved project first.',needTwo:'Choose two different checks of the same type.',discard:'There are unsaved changes. Continue without saving?',deleted:'Project and history deleted.',notStored:'The report is ready, but history was not saved.',history:'Saved checks',retention:`The latest ${projectLimits.runs} checks are retained per project.`,imported:'Archive imported as a separate project copy.',archived:'Project moved to archive.',unarchived:'Project restored from archive.',baselineSet:'Baseline check pinned.',baselineCleared:'Baseline check unpinned.',decisionSaved:'Finding decision saved in project.',kinds:{editorial:'Article',blog:'Link inventory',frontend:'Web Dev'},objectKinds:{article:'Article',site:'Site',scenario:'Scenario'},groups:{added:'New',remaining:'Remaining',resolved:'No longer found under comparable checks',unverified:'Unconfirmed'},decisionLabels:{accepted:'Accepted',deferred:'Deferred',dismissed:'Dismissed'},warnings:{'engine-changed':'The checking engine version changed.','inventory-scope-changed':'Page membership or inventory scope changed.','frontend-scope-changed':'Frontend check conditions changed.','configuration-changed':'Query, configuration or checking rules changed.','unversioned-checker':'The report lacks a checker fingerprint. A disappearing issue needs fresh verification.','run-incomplete':'The baseline or repeat run did not complete without errors.','different-object':'Different target objects within the project are being compared.'},failed:{'project-name':'Use a name between 1 and 100 characters.','project-conflict':'Another tab changed this project. Reopen it before saving.','project-missing':'Project no longer exists. Refresh the list.','run-missing':'The selected check no longer exists.','project-limit':'The 20-project limit was reached. Export and remove an unused project.','storage-budget':'Local history reached 32 MiB. Export and remove unused projects.','record-too-large':'This record exceeds 8 MiB. Download the report separately or narrow the inventory.','storage-unavailable':'Local history is unavailable. Checks still work without saving.','storage-blocked':'Another tab is blocking the storage upgrade.','invalid-archive':'The file is not a valid Reproleaf project archive.','invalid-object':'Target object name must be up to 120 characters.','invalid-note':'Note must be up to 500 characters.','invalid-decision':'Invalid finding decision status or key.','decision-limit':'The 500-decision limit for this project was reached.'}}
};
const el=(tag,value,className)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(className)n.className=className;return n;};
const hasOwn=(obj,key)=>Boolean(obj&&typeof obj==='object'&&Object.hasOwn(obj,key));
const formatBytes=(bytes,ru)=>{
 if(bytes<1024)return `${bytes} ${ru?'Б':'B'}`;
 if(bytes<1048576)return `${(bytes/1024).toFixed(1)} ${ru?'КиБ':'KiB'}`;
 return `${(bytes/1048576).toFixed(2)} ${ru?'МиБ':'MiB'}`;
};
function ensureControls(host,ru,workspace){
 const actions=host.querySelector('.reproleaf-project-actions'),fields=host.querySelector('.reproleaf-project-fields'),historyBox=host.querySelector('.reproleaf-project-history');
 if(actions&&!host.querySelector('[data-project-import]')){
  const importBtn=el('button',ru?'Импорт архива':'Import archive');importBtn.type='button';importBtn.dataset.projectImport='';
  const importInput=el('input');importInput.type='file';importInput.accept='application/json,.json';importInput.hidden=true;importInput.dataset.projectImportFile='';
  const archiveBtn=el('button',ru?'В архив':'Archive');archiveBtn.type='button';archiveBtn.dataset.projectArchive='';
  const deleteBtn=host.querySelector('[data-project-delete]');
  if(deleteBtn){actions.insertBefore(importBtn,deleteBtn);actions.insertBefore(importInput,deleteBtn);actions.insertBefore(archiveBtn,deleteBtn);}
  else actions.append(importBtn,importInput,archiveBtn);
 }
 if(fields&&!host.querySelector('[data-project-object]')){
  const extra=el('div',undefined,'reproleaf-project-fields reproleaf-project-extra');
  const objKindLabel=el('label',ru?'Тип объекта':'Target type'),objKind=el('select',undefined,'ym-disable-keys');objKind.dataset.projectObjectKind='';
  for(const [val,label]of [['article',ru?'Статья':'Article'],['site',ru?'Сайт':'Site'],['scenario',ru?'Сценарий':'Scenario']]){const opt=el('option',label);opt.value=val;objKind.append(opt);}
  objKind.value=workspace==='web'?'scenario':'article';objKindLabel.append(objKind);
  const objLabel=el('label',ru?'Объект проверки (путь или сценарий)':'Target object (path or scenario)'),objInput=el('input',undefined,'ym-disable-keys');objInput.type='text';objInput.maxLength=120;objInput.autocomplete='off';objInput.placeholder=workspace==='web'?(ru?'Модальное окно / форма':'Modal / form'):(ru?'/blog/article-slug':'/blog/article-slug');objInput.dataset.projectObject='';objLabel.append(objInput);
  const noteLabel=el('label',ru?'Заметка к проверке':'Check note'),noteInput=el('input',undefined,'ym-disable-keys');noteInput.type='text';noteInput.maxLength=500;noteInput.autocomplete='off';noteInput.placeholder=ru?'Например: после правки H2 и ссылок':'E.g. after updating H2 and internal links';noteInput.dataset.projectNote='';noteLabel.append(noteInput);
  const filterLabel=el('label',ru?'Поиск проектов':'Filter projects'),filterInput=el('input',undefined,'ym-disable-keys');filterInput.type='search';filterInput.maxLength=100;filterInput.autocomplete='off';filterInput.placeholder=ru?'Фильтр по названию…':'Filter by name…';filterInput.dataset.projectSearch='';
  const archWrap=el('span',undefined,'reproleaf-archive-toggle'),archCheck=el('input');archCheck.type='checkbox';archCheck.dataset.projectShowArchived='';archWrap.append(archCheck,el('span',ru?'Показать архивные':'Show archived'));
  filterLabel.append(filterInput,archWrap);
  extra.append(objKindLabel,objLabel,noteLabel,filterLabel);
  fields.after(extra);
 }
 if(!host.querySelector('[data-project-storage]')){
  const storageBar=el('p',undefined,'reproleaf-help reproleaf-storage-bar');storageBar.dataset.projectStorage='';
  const statusEl=host.querySelector('[data-project-status]');
  if(statusEl)statusEl.after(storageBar);else host.append(storageBar);
 }
 if(historyBox&&!host.querySelector('[data-project-object-filter]')){
  const filterWrap=el('div',undefined,'reproleaf-project-fields'),filterLabel=el('label',ru?'Фильтр истории по объекту':'Filter history by target'),filterSelect=el('select',undefined,'ym-disable-keys');
  filterSelect.dataset.projectObjectFilter='';const allOpt=el('option',ru?'Все объекты проекта':'All project targets');allOpt.value='';filterSelect.append(allOpt);
  filterLabel.append(filterSelect);filterWrap.append(filterLabel);
  const countEl=historyBox.querySelector('[data-project-count]');
  if(countEl)countEl.after(filterWrap);else historyBox.prepend(filterWrap);
 }
 if(historyBox&&!host.querySelector('[data-project-decisions]')){
  const decBox=el('div',undefined,'reproleaf-project-decisions');decBox.dataset.projectDecisions='';
  historyBox.append(decBox);
 }
}
export function mountProjects(host,{workspace,language='en',capture,restore,rerun,showReport,describeFinding=f=>f.message||f.code,onDecisionChange,store=createProjectStore()}){
 if(!host)return {dirty(){},token(){return null;},getDecisions(){return {};},async setDecision(){},async record(){}};
 const t=text[language],ru=language==='ru';
 ensureControls(host,ru,workspace);
 const status=host.querySelector('[data-project-status]'),picker=host.querySelector('[data-project-picker]'),name=host.querySelector('[data-project-name]'),before=host.querySelector('[data-run-before]'),after=host.querySelector('[data-run-after]'),history=host.querySelector('[data-project-runs]'),comparison=host.querySelector('[data-run-comparison]'),objectKindInput=host.querySelector('[data-project-object-kind]'),objectInput=host.querySelector('[data-project-object]'),noteInput=host.querySelector('[data-project-note]'),searchInput=host.querySelector('[data-project-search]'),showArchivedInput=host.querySelector('[data-project-show-archived]'),archiveBtn=host.querySelector('[data-project-archive]'),importBtn=host.querySelector('[data-project-import]'),importFile=host.querySelector('[data-project-import-file]'),storageEl=host.querySelector('[data-project-storage]'),objectFilter=host.querySelector('[data-project-object-filter]'),decisionsBox=host.querySelector('[data-project-decisions]');
 let active=null,runs=[],generation=0,dirty=false,noteDirty=false,currentRunId=null,lastRun=null,busy=false,applying=false,deletion=null,unavailable=false;
 const currentObjectKey=()=>objectInput?.value.trim()||'default';
 const currentObjectKind=()=>objectKindInput?.value||(workspace==='web'?'scenario':'article');
 const currentNote=()=>noteInput?.value.trim()||'';
 const isPinnedRun=run=>{
  if(!active)return false;
  const objKey=run.objectKey||'default';
  return active.baselineRunId===run.id||(hasOwn(active.baselines,objKey)&&active.baselines[objKey]===run.id);
 };
 const dismissDelete=()=>{deletion=null;host.querySelector('[data-project-delete-confirm]').hidden=true;};
 const apply=state=>{applying=true;try{restore(state);}finally{applying=false;}};
 const stamp=run=>{
  const obj=run.objectKey&&run.objectKey!=='default'?` · [${run.objectKey}]`:'';
  const pinned=isPinnedRun(run)?` · ${ru?'Базовая':'Baseline'}`:'';
  return `${new Intl.DateTimeFormat(ru?'ru-RU':'en-GB',{dateStyle:'short',timeStyle:'medium'}).format(new Date(run.createdAt))} · ${t.kinds[reportKind(run.report)]} · #${run.sequence}${obj}${pinned}`;
 };
 const say=value=>status.textContent=value;
 const fail=error=>say(t.failed[error.message]||(error.name==='QuotaExceededError'?t.failed['storage-budget']:t.failed['storage-unavailable']));
 function mark(){if(applying)return;dirty=true;lastRun=null;say(t.unsaved);}
 function controls(){
  for(const button of host.querySelectorAll('button'))button.disabled=busy;
  for(const input of host.querySelectorAll('select,input'))input.disabled=busy;
  if(archiveBtn)archiveBtn.textContent=active?.archived?(ru?'Из архива':'Unarchive'):(ru?'В архив':'Archive');
 }
 async function action(work){if(busy)return;busy=true;controls();try{await work();}catch(error){fail(error);}finally{busy=false;controls();}}
 async function refresh(){
  const includeArchived=!!showArchivedInput?.checked,query=(searchInput?.value||'').trim().toLocaleLowerCase();
  const items=(await store.list({includeArchived})).filter(p=>!query||p.name.toLocaleLowerCase().includes(query)||p.id===active?.id);
  const selected=active?.id||'';picker.replaceChildren();const empty=el('option',t.empty);empty.value='';picker.append(empty);
  for(const p of items){const option=el('option',p.archived?`${p.name} (${ru?'архив':'archived'})`:p.name);option.value=p.id;picker.append(option);}
  picker.value=selected;picker.dispatchEvent(new Event('change'));
  if(storageEl&&store.usage){
   const stats=await store.usage();
   storageEl.textContent=ru?`Хранилище: ${stats.projectCount} / ${stats.maxProjects} проектов${stats.archivedCount?` (в архиве: ${stats.archivedCount})`:''} · ${formatBytes(stats.totalBytes,true)} из ${formatBytes(stats.maxBytes,true)}`:`Storage: ${stats.projectCount} / ${stats.maxProjects} projects${stats.archivedCount?` (${stats.archivedCount} archived)`:''} · ${formatBytes(stats.totalBytes,false)} of ${formatBytes(stats.maxBytes,false)}`;
  }
  if(archiveBtn)archiveBtn.textContent=active?.archived?(ru?'Из архива':'Unarchive'):(ru?'В архив':'Archive');
 }
 function renderDecisions(){
  if(!decisionsBox)return;
  decisionsBox.replaceChildren();
  const entries=Object.entries(active?.decisions||{});
  if(!entries.length)return;
  const details=el('details');
  details.append(el('summary',ru?`Решения по замечаниям (${entries.length})`:`Finding decisions (${entries.length})`));
  const list=el('ul',undefined,'reproleaf-decisions-list');
  for(const [key,item]of entries){
   let label=key;try{const parsed=JSON.parse(key);if(Array.isArray(parsed))label=parsed.filter(Boolean).join(' · ');}catch{}
   const li=el('li'),badge=el('strong',`${t.decisionLabels[item.status]||item.status}: `),textSpan=el('span',label+(item.reason?` — ${item.reason}`:'')),clearBtn=el('button',ru?'Сбросить':'Clear','reproleaf-text-button');
   clearBtn.type='button';
   clearBtn.onclick=()=>action(async()=>{
    if(!active)return;
    active=await store.setDecision({projectId:active.id,key,status:null,expectedRevision:active.revision});
    renderDecisions();onDecisionChange?.(active.decisions||{});
   });
   li.append(badge,textSpan,clearBtn);list.append(li);
  }
  details.append(list);decisionsBox.append(details);
 }
 function renderHistory(){
  const workspaceRuns=runs.filter(r=>r.workspace===workspace);
  if(objectFilter){
   const currentFilter=objectFilter.value;
   const objectKeys=[...new Set([...Object.keys(active?.objects||{}),...workspaceRuns.map(r=>r.objectKey||'default')])];
   objectFilter.replaceChildren();
   const allOpt=el('option',ru?'Все объекты проекта':'All project targets');allOpt.value='';objectFilter.append(allOpt);
   for(const key of objectKeys){const opt=el('option',key==='default'?(ru?'Основной объект':'Default target'):key);opt.value=key;objectFilter.append(opt);}
   objectFilter.value=objectKeys.includes(currentFilter)?currentFilter:'';
  }
  const selectedObject=objectFilter?.value||'';
  const visible=workspaceRuns.filter(r=>!selectedObject||(r.objectKey||'default')===selectedObject);
  history.replaceChildren();before.replaceChildren();after.replaceChildren();comparison.replaceChildren();
  const activeObjKey=currentObjectKey();
  const pinnedId=(selectedObject&&hasOwn(active?.baselines,selectedObject)?active.baselines[selectedObject]:null)||(hasOwn(active?.baselines,activeObjKey)?active.baselines[activeObjKey]:null)||active?.baselineRunId||null;
  for(const run of visible){
   for(const select of [before,after]){const option=el('option',stamp(run));option.value=run.id;select.append(option);}
   const item=el('li'),infoWrap=el('span',stamp(run));
   if(run.note){const noteSmall=el('small',` — ${run.note}`,'reproleaf-run-note');infoWrap.append(noteSmall);}
   const btnGroup=el('div',undefined,'reproleaf-run-actions');
   if(store.setBaseline){
    const isPinned=isPinnedRun(run);
    const pinBtn=el('button',isPinned?(ru?'Снять базу':'Unpin'):(ru?'Базовая':'Baseline'),'reproleaf-text-button');
    pinBtn.type='button';
    pinBtn.onclick=()=>action(async()=>{
     if(!active)return;
     active=await store.setBaseline({projectId:active.id,runId:isPinned?null:run.id,objectKey:run.objectKey||'default',expectedRevision:active.revision});
     renderHistory();say(isPinned?t.baselineCleared:t.baselineSet);
    });
    btnGroup.append(pinBtn);
   }
   if(rerun){
    const repeatBtn=el('button',ru?'Повторить':'Re-run','reproleaf-text-button');
    repeatBtn.type='button';
    repeatBtn.onclick=()=>{
     if(dirty&&!confirm(t.discard))return;
     generation++;dismissDelete();dirty=false;noteDirty=false;lastRun=null;currentRunId=run.id;
     if(objectInput)objectInput.value=run.objectKey&&run.objectKey!=='default'?run.objectKey:'';
     if(objectKindInput&&run.objectKind)objectKindInput.value=run.objectKind;
     if(noteInput)noteInput.value=run.note||'';
     apply(run.state);rerun(run);
    };
    btnGroup.append(repeatBtn);
   }
   const open=el('button',ru?'Открыть':'Open','reproleaf-text-button');open.type='button';
   open.onclick=()=>{
    if(dirty&&!confirm(t.discard))return;
    generation++;dismissDelete();dirty=false;noteDirty=false;lastRun=null;currentRunId=run.id;
    if(objectInput)objectInput.value=run.objectKey&&run.objectKey!=='default'?run.objectKey:'';
    if(objectKindInput&&run.objectKind)objectKindInput.value=run.objectKind;
    if(noteInput)noteInput.value=run.note||'';
    apply(run.state);showReport(run.report,{historical:true,createdAt:run.createdAt,engine:run.engine,runId:run.id,note:run.note,objectKey:run.objectKey});
    say((ru?'Открыта сохранённая проверка: ':'Saved check opened: ')+stamp(run));
   };
   btnGroup.append(open);item.append(infoWrap,btnGroup);history.append(item);
  }
  after.value=visible[0]?.id||'';
  const defaultBefore=pinnedId&&visible.some(r=>r.id===pinnedId)&&pinnedId!==after.value?pinnedId:(visible[1]?.id||visible[0]?.id||'');
  before.value=defaultBefore;
  for(const select of [before,after])select.dispatchEvent(new Event('change'));
  host.querySelector('[data-project-count]').textContent=active?`${active.name} · ${t.history}: ${visible.length}. ${t.retention}`:t.retention;
  renderDecisions();
 }
 host.querySelector('[data-project-save]').onclick=()=>action(async()=>{
  if(!name.value.trim()){say(t.name);name.focus();return;}
  const state=capture(),pending=lastRun,objectKey=currentObjectKey(),objectKind=currentObjectKind(),note=currentNote();
  active=await store.save({id:active?.id,name:name.value,workspace,state,objectKey,objectKind,expectedRevision:active?.revision});generation++;dismissDelete();dirty=JSON.stringify(capture())!==JSON.stringify(state)||name.value.trim()!==active.name;
  if(pending&&JSON.stringify(pending.state)===JSON.stringify(state)){const saved=await store.append({projectId:active.id,workspace,...pending,objectKey,objectKind,note:note||pending.note||'',expectedRevision:active.revision});active=saved.project;currentRunId=saved.run.id;lastRun=null;noteDirty=false;}
  else if(noteDirty&&store.updateRunNote){
   const targetRun=runs.find(r=>r.id===currentRunId&&r.workspace===workspace)||runs.find(r=>r.workspace===workspace);
   if(targetRun){const updated=await store.updateRunNote({projectId:active.id,runId:targetRun.id,note,expectedRevision:active.revision});active=updated.project;noteDirty=false;}
  }
  runs=(await store.get(active.id)).runs;await refresh();renderHistory();say(dirty?t.unsaved:t.saved);
 });
 host.querySelector('[data-project-open]').onclick=()=>action(async()=>{
  if(!picker.value){say(t.choose);return;}if(dirty&&!confirm(t.discard))return;
  const loaded=await store.get(picker.value);generation++;dismissDelete();active=loaded.project;runs=loaded.runs;name.value=active.name;
  const savedObj=hasOwn(active.activeObject,workspace)?active.activeObject[workspace]:null;
  if(objectInput)objectInput.value=savedObj?.key&&savedObj.key!=='default'?savedObj.key:'';
  if(objectKindInput&&savedObj?.kind)objectKindInput.value=savedObj.kind;
  const latestWorkspaceRun=runs.find(r=>r.workspace===workspace);
  currentRunId=latestWorkspaceRun?.id||null;
  if(noteInput)noteInput.value=latestWorkspaceRun?.note||'';
  dirty=false;noteDirty=false;lastRun=null;apply(hasOwn(active.drafts,workspace)?active.drafts[workspace]:null);await refresh();renderHistory();onDecisionChange?.(active.decisions||{});say(t.open);
 });
 host.querySelector('[data-project-new]').onclick=()=>{
  if(busy||(dirty&&!confirm(t.discard)))return;
  generation++;dismissDelete();active=null;runs=[];dirty=false;noteDirty=false;currentRunId=null;lastRun=null;name.value='';
  if(objectInput)objectInput.value='';if(noteInput)noteInput.value='';
  picker.value='';picker.dispatchEvent(new Event('change'));apply(null);renderHistory();onDecisionChange?.({});say(t.empty);
 };
 if(archiveBtn)archiveBtn.onclick=()=>action(async()=>{
  if(!active){say(t.choose);return;}
  const nextArchived=!active.archived;
  active=await store.setArchived({id:active.id,archived:nextArchived,expectedRevision:active.revision});
  if(nextArchived&&showArchivedInput&&!showArchivedInput.checked)showArchivedInput.checked=true;
  await refresh();renderHistory();say(nextArchived?t.archived:t.unarchived);
 });
 if(importBtn&&importFile){
  importBtn.onclick=()=>{if(!busy)importFile.click();};
  importFile.onchange=()=>action(async()=>{
   const file=importFile.files?.[0];importFile.value='';if(!file)return;
   if(file.size>projectLimits.recordBytes)throw Error('record-too-large');
   let parsed;try{parsed=JSON.parse(await file.text());}catch{throw Error('invalid-archive');}
   const imported=await store.importArchive(parsed,{language});
   generation++;dismissDelete();active=imported.project;runs=imported.runs;name.value=active.name;dirty=false;noteDirty=false;lastRun=null;
   const latestWorkspaceRun=runs.find(r=>r.workspace===workspace);
   currentRunId=latestWorkspaceRun?.id||null;
   if(objectInput)objectInput.value='';if(noteInput)noteInput.value=latestWorkspaceRun?.note||'';
   apply(hasOwn(active.drafts,workspace)?active.drafts[workspace]:null);await refresh();renderHistory();onDecisionChange?.(active.decisions||{});
   say(`${t.imported} (${active.name})`);
  });
 }
 if(searchInput)searchInput.addEventListener('input',()=>void refresh());
 if(showArchivedInput)showArchivedInput.addEventListener('change',()=>void refresh());
 if(objectFilter)objectFilter.addEventListener('change',renderHistory);
 if(noteInput)noteInput.addEventListener('input',()=>{noteDirty=true;});
 if(objectInput)objectInput.addEventListener('change',()=>{
  if(!active)return;
  const compositeKey=`${workspace}:${currentObjectKey()}`;
  const draft=hasOwn(active.objectDrafts,compositeKey)?active.objectDrafts[compositeKey]:null;
  if(draft&&(!dirty||confirm(t.discard))){dirty=false;apply(draft);}
 });
 const confirmation=host.querySelector('[data-project-delete-confirm]');
 host.querySelector('[data-project-delete]').onclick=()=>{if(!active){say(t.choose);return;}deletion={id:active.id,revision:active.revision};confirmation.hidden=false;host.querySelector('[data-project-delete-name]').textContent=active.name;};
 host.querySelector('[data-project-delete-cancel]').onclick=dismissDelete;
 host.querySelector('[data-project-delete-yes]').onclick=()=>action(async()=>{const deleting=deletion;if(!deleting||active?.id!==deleting.id||active.revision!==deleting.revision)throw Error('project-conflict');await store.remove(deleting.id,deleting.revision);generation++;dismissDelete();active=null;runs=[];dirty=false;noteDirty=false;currentRunId=null;lastRun=null;confirmation.hidden=true;picker.value='';name.value='';if(objectInput)objectInput.value='';if(noteInput)noteInput.value='';apply(null);await refresh();renderHistory();onDecisionChange?.({});say(t.deleted);});
 host.querySelector('[data-project-export]').onclick=()=>action(async()=>{
  if(!active){say(t.choose);return;}const data=await store.get(active.id),url=URL.createObjectURL(new Blob([JSON.stringify({schemaVersion:1,format:'reproleaf-project',exportedAt:new Date().toISOString(),...data},null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='reproleaf-project.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 host.querySelector('[data-run-compare]').onclick=()=>{
  const a=runs.find(r=>r.id===before.value),b=runs.find(r=>r.id===after.value);if(!a||!b){say(t.needTwo);return;}
  const result=compareRuns(a,b);comparison.replaceChildren();if(!result.compatible){say(t.needTwo);return;}
  comparison.append(el('p',`${stamp(a)} → ${stamp(b)}`,'reproleaf-help'));
  for(const warning of result.warnings)comparison.append(el('p',t.warnings[warning]||warning,'reproleaf-comparison-warning'));
  const counts=el('div',undefined,'reproleaf-diff-counts');
  for(const group of ['added','remaining','resolved','unverified']){const count=el('div',undefined,`reproleaf-diff-count reproleaf-diff-count--${group}`);count.append(el('strong',String(result[group].length)),el('span',t.groups[group]));counts.append(count);}comparison.append(counts);
  for(const group of ['added','resolved','unverified','remaining'])if(result[group].length){
   const details=el('details');details.append(el('summary',`${t.groups[group]} (${result[group].length})`));const list=el('ul');
   for(const finding of result[group].slice(0,100)){
    const item=el('li',describeFinding(finding));
    if(finding.record)item.append(el('small',finding.record));
    if(active&&store.setDecision&&group!=='resolved'){
     const fKey=findingKey(finding),existingDecision=hasOwn(active.decisions,fKey)?active.decisions[fKey]:null;
     const decActions=el('div',undefined,'reproleaf-run-actions');
     if(existingDecision)decActions.append(el('small',`${t.decisionLabels[existingDecision.status]||existingDecision.status}${existingDecision.reason?`: ${existingDecision.reason}`:''}`));
     for(const [statusKey,label]of [['accepted',ru?'В работу':'Accept'],['deferred',ru?'Отложить':'Defer'],['dismissed',ru?'Отклонить':'Dismiss']]){
      const btn=el('button',label,'reproleaf-text-button');btn.type='button';
      btn.onclick=()=>action(async()=>{
       if(!active)return;
       active=await store.setDecision({projectId:active.id,key:fKey,status:statusKey,reason:statusKey!=='accepted'?(noteInput?.value.trim()||''):'',expectedRevision:active.revision});
       renderDecisions();onDecisionChange?.(active.decisions||{});say(t.decisionSaved);
      });
      decActions.append(btn);
     }
     item.append(decActions);
    }
    list.append(item);
   }
   details.append(list);comparison.append(details);
  }
  const metricItems=Array.isArray(result.metrics)?result.metrics:[];
  if(metricItems.length){
   const metricLabels=ru?{pages:'Страниц в выгрузке',distinctInternalEdges:'Внутренних связей',noObservedIncoming:'Без входящих ссылок',unresolvedTargets:'Адреса вне выгрузки'}:{pages:'Pages in inventory',distinctInternalEdges:'Distinct internal links',noObservedIncoming:'No observed incoming',unresolvedTargets:'Unresolved targets'};
   const metricDetails=el('details');
   metricDetails.append(el('summary',ru?`Показатели покрытия (${metricItems.length})`:`Coverage metrics (${metricItems.length})`));
   const metricList=el('ul');
   for(const m of metricItems)metricList.append(el('li',`${metricLabels[m.name]||m.name}: ${m.before??'—'} → ${m.after??'—'}`));
   metricDetails.append(metricList);comparison.append(metricDetails);
  }
  if(result.graphDiff&&(result.graphDiff.addedEdges.length||result.graphDiff.removedEdges.length||result.graphDiff.addedPages.length||result.graphDiff.removedPages.length)){
   const graphDetails=el('details');
   graphDetails.append(el('summary',ru?`Изменения графа (+${result.graphDiff.addedEdges.length} / −${result.graphDiff.removedEdges.length} связей)`:`Graph changes (+${result.graphDiff.addedEdges.length} / −${result.graphDiff.removedEdges.length} links)`));
   const graphList=el('ul');
   for(const edge of result.graphDiff.addedEdges.slice(0,50))graphList.append(el('li',`+ ${edge.source} → ${edge.target}`));
   for(const edge of result.graphDiff.removedEdges.slice(0,50))graphList.append(el('li',`− ${edge.source} → ${edge.target}`));
   for(const pageUrl of result.graphDiff.addedPages.slice(0,30))graphList.append(el('li',(ru?'Новая страница: ':'Added page: ')+pageUrl));
   for(const pageUrl of result.graphDiff.removedPages.slice(0,30))graphList.append(el('li',(ru?'Исчезла страница: ':'Removed page: ')+pageUrl));
   graphDetails.append(graphList);comparison.append(graphDetails);
  }
  if(result.environmentDiff?.before&&result.environmentDiff?.after){
   const env=result.environmentDiff,envDetails=el('details');
   const anyChanged=env.targetChanged||env.viewportChanged||env.browserChanged||env.adapterChanged||env.checkerChanged||env.executionProfileChanged||env.targetStateChanged;
   const uncertain=result.warnings.some(w=>['unversioned-checker','unversioned-adapter','unversioned-browser','unversioned-target-state','execution-profile-unknown'].includes(w));
   envDetails.open=Boolean(anyChanged||uncertain);
   envDetails.append(el('summary',uncertain?(ru?'Условия проверки интерфейса (не подтверждены)':'Frontend check environment (unconfirmed)'):ru?(anyChanged?'Условия проверки интерфейса (есть изменения)':'Условия проверки интерфейса (совпадают)'):(anyChanged?'Frontend check environment (changed)':'Frontend check environment (matched)')));
   const envList=el('ul');
   const shortHash=h=>h?h.slice(0,12):'—';
   for(const [label,beforeVal,afterVal,changedFlag]of [
    [ru?'Цель':'Target',env.before.target,env.after.target,env.targetChanged],
    ['Viewport',env.before.viewport,env.after.viewport,env.viewportChanged],
    [ru?'Браузер':'Browser',env.before.browser,env.after.browser,env.browserChanged],
    [ru?'Хэш адаптера':'Adapter SHA-256',shortHash(env.before.adapterSha256),shortHash(env.after.adapterSha256),env.adapterChanged],
    [ru?'Хэш проверяющего кода':'Checker SHA-256',shortHash(env.before.checkerSha256),shortHash(env.after.checkerSha256),env.checkerChanged],
    [ru?'Состояние конечного адреса':'Final route state',shortHash(env.before.targetStateSha256),shortHash(env.after.targetStateSha256),env.targetStateChanged],
    [ru?'Политика выполнения':'Execution policy',executionProfileLabel(env.before.executionProfile,language),executionProfileLabel(env.after.executionProfile,language),env.executionProfileChanged]
   ]){
    envList.append(el('li',changedFlag?`${label}: ${beforeVal} → ${afterVal}`:`${label}: ${afterVal}`));
   }
   envDetails.append(envList);comparison.append(envDetails);
  }
  const exportActions=el('div',undefined,'reproleaf-project-actions reproleaf-comparison-exports');
  const dlHtml=el('button',ru?'Скачать сравнение — HTML':'Download comparison — HTML');dlHtml.type='button';dlHtml.dataset.comparisonHtml='';
  dlHtml.onclick=()=>{const url=URL.createObjectURL(new Blob([comparisonHtml(result,a,b,language,{projectName:active?.name||''})],{type:'text/html'}));const link=el('a');link.href=url;link.download='reproleaf-comparison.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const dlJson=el('button',ru?'Скачать сравнение — JSON':'Download comparison — JSON');dlJson.type='button';dlJson.dataset.comparisonJson='';
  dlJson.onclick=()=>{const payload={schemaVersion:1,format:'reproleaf-comparison',exportedAt:new Date().toISOString(),project:active?{id:active.id,name:active.name}:null,before:{id:a.id,sequence:a.sequence,createdAt:a.createdAt,objectKey:a.objectKey||'default',note:a.note||''},after:{id:b.id,sequence:b.sequence,createdAt:b.createdAt,objectKey:b.objectKey||'default',note:b.note||''},comparison:result};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json'}));const link=el('a');link.href=url;link.download='reproleaf-comparison.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  exportActions.append(dlHtml,dlJson);comparison.append(exportActions);
  comparison.append(el('p',ru?'Сравниваются уникальные замечания. «Больше не найдено» относится к этой повторной проверке, а не гарантирует отсутствие ошибок. Пропавшие из объёма проверки данные отмечены отдельно.':'Comparisons use distinct findings. “No longer found” applies to this repeat check, not a guarantee of correctness. Findings missing from the checking scope are separated.','reproleaf-help'));say('');
 };
 name.addEventListener('input',()=>{dismissDelete();dirty=true;say(t.unsaved);});
 void refresh().then(renderHistory).catch(error=>{unavailable=true;fail(error);});
 return {
  dirty:mark,
  token:()=>({id:active?.id||null,generation}),
  getDecisions:()=>({...active?.decisions||{}}),
  async setDecision(key,status,reason=''){
   if(!active){say(t.choose);return null;}
   await action(async()=>{
    active=await store.setDecision({projectId:active.id,key,status,reason,expectedRevision:active.revision});
    renderDecisions();onDecisionChange?.(active.decisions||{});say(t.decisionSaved);
   });
   return active?.decisions||{};
  },
  async record({state,report,engine,context,token}){
   if(token&&token.generation!==generation)return;
   const objectKey=currentObjectKey(),objectKind=currentObjectKind(),note=currentNote();
   lastRun={state,report,engine,context,objectKey,objectKind,note};dirty=true;
   if(!active){if(unavailable){say(t.notStored+' '+t.failed['storage-unavailable']);return;}say(ru?'Назовите и сохраните проект, чтобы добавить эту проверку в историю.':'Name and save a project to retain this check.');return;}
   const selected=active.id,at=generation;
   try{const saved=await store.append({projectId:selected,workspace,...lastRun,expectedRevision:active.revision});if(at!==generation||active?.id!==selected)return;active=saved.project;currentRunId=saved.run.id;lastRun=null;noteDirty=false;dirty=JSON.stringify(capture())!==JSON.stringify(state)||name.value.trim()!==active.name;runs=(await store.get(selected)).runs;await refresh();renderHistory();say(dirty?t.unsaved:t.recorded+(saved.pruned?' '+t.retention:''));}catch(error){say(t.notStored+' '+(t.failed[error.message]||t.failed['storage-unavailable']));}
  }
 };
}
