export function el(tag,attrs={},...children){
 const node=document.createElement(tag);
 for(const [key,val] of Object.entries(attrs)){
  if(val===undefined||val===null||val===false)continue;
  if(key==='className')node.className=val;
  else if(key==='hidden')node.hidden=Boolean(val);
  else if(key.startsWith('data-'))node.setAttribute(key,String(val));
  else if(key in node&&typeof val!=='string')node[key]=val;
  else node.setAttribute(key,String(val));
 }
 for(const child of children){
  if(child===undefined||child===null||child===false)continue;
  node.append(typeof child==='string'||typeof child==='number'?document.createTextNode(String(child)):child);
 }
 return node;
}

export function emitToolEvent(root,detail){
 const payload={
  tool:String(detail.tool||'').slice(0,80),
  ok:Boolean(detail.ok),
  errorCount:Number.isFinite(detail.errorCount)?Math.max(0,Math.trunc(detail.errorCount)):0,
  warningCount:Number.isFinite(detail.warningCount)?Math.max(0,Math.trunc(detail.warningCount)):0,
  codes:Array.isArray(detail.codes)?detail.codes.slice(0,30).map(c=>String(c).slice(0,80)):[],
  action:String(detail.action||'run').slice(0,40)
 };
 root.dispatchEvent(new CustomEvent('reproleaf:tool-event',{bubbles:true,detail:payload}));
 return payload;
}

export function createToolFrame({root,title,subtitle,modeLabel,language}){
 root.classList.add('reproleaf-workbench');
 root.replaceChildren();
 const heading=el('h2',{},title);
 const intro=el('p',{},subtitle);
 const toolbar=el('div',{className:'reproleaf-toolbar'},
  el('h3',{tabIndex:-1,'data-reproleaf-title':''},title),
  el('span',{className:'reproleaf-analysis-label'},modeLabel)
 );
 const form=el('form',{className:'ym-disable-submit'});
 const status=el('p',{className:'reproleaf-status',role:'status','aria-live':'polite'},
  language==='ru'?'Заполните поля и запустите проверку.':'Fill in the fields and run the check.'
 );
 const metrics=el('div',{className:'reproleaf-metrics',hidden:true});
 const findingsTitle=el('h4',{hidden:true},language==='ru'?'Замечания и рекомендации':'Findings and suggestions');
 const findings=el('ul',{className:'reproleaf-findings'});
 const extra=el('div',{});
 const aside=el('aside',{className:'reproleaf-report'},
  el('p',{className:'reproleaf-report-label'},language==='ru'?'Результат':'Review'),
  status,
  metrics,
  extra,
  findingsTitle,
  findings
 );
 const layout=el('div',{className:'reproleaf-layout'},form,aside);
 root.append(heading,intro,toolbar,layout);
 return {form,status,metrics,findingsTitle,findings,extra,aside};
}

export function renderMetrics(container,items){
 container.replaceChildren();
 if(!items.length){
  container.hidden=true;
  return;
 }
 for(const item of items){
  container.append(el('div',{},el('strong',{},String(item.value)),el('span',{},item.label)));
 }
 container.hidden=false;
}

export function renderFindings(listEl,titleEl,findings,language){
 listEl.replaceChildren();
 if(!findings.length){
  titleEl.hidden=false;
  listEl.append(el('li',{},el('span',{className:'reproleaf-state reproleaf-state--good'},language==='ru'?'Проблем не обнаружено':'No issues found')));
  return;
 }
 titleEl.hidden=false;
 for(const f of findings){
  const isErr=f.severity==='error'||f.severity==='critical';
  const isWarn=f.severity==='warn'||f.severity==='warning';
  const badgeClass=isErr?'reproleaf-sev-badge reproleaf-sev--error':isWarn?'reproleaf-sev-badge reproleaf-sev--warning':'reproleaf-sev-badge reproleaf-sev--info';
  const badgeText=isErr?(language==='ru'?'ОШИБКА':'ERROR'):isWarn?(language==='ru'?'ВНИМАНИЕ':'WARN'):'INFO';
  const item=el('li',{className:isErr?'reproleaf-finding--error':''},
   el('div',{className:'reproleaf-finding-head'},
    el('span',{className:badgeClass},badgeText),
    el('span',{className:'reproleaf-finding-code'},f.code||'check'),
    f.target?el('span',{className:'reproleaf-finding-cat'},f.target):null
   ),
   el('strong',{className:'reproleaf-finding-title'},f.message||''),
   (f.recommendation||f.suggestion)?el('p',{className:'reproleaf-help'},f.recommendation||f.suggestion):null
  );
  listEl.append(item);
 }
}

export function downloadText(filename,text,mimeType='application/json'){
 const url=URL.createObjectURL(new Blob([text],{type:mimeType}));
 const link=document.createElement('a');
 link.href=url;
 link.download=filename;
 link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export async function copyText(text,button,doneLabel,resetLabel){
 try{
  await navigator.clipboard.writeText(text);
  button.textContent=doneLabel;
  setTimeout(()=>{button.textContent=resetLabel;},1500);
 }catch{}
}
