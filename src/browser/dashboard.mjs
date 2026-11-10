const catalog={
 title:['Title страницы','Page title','Укажите title из CMS. Проверьте, ясно ли он описывает ответ.','Supply the CMS title and check that it describes the answer.'],
 description:['Метаописание','Meta description','Добавьте описание содержания и пользы страницы.','Describe the page content and its usefulness.'],
 h1:['Главный заголовок H1','Main H1','Укажите H1 из шаблона либо оставьте один H1 внутри Markdown.','Supply the template H1, or use one H1 in Markdown.'],
 hierarchy:['Структура H1–H6','Heading hierarchy','Выстройте вложенность разделов без пропущенных уровней.','Keep section levels in a consistent hierarchy.'],
 'query-title':['Запрос в title','Query in title','Оцените, уместна ли точная фраза в title. Синонимы проверяются вручную.','Consider whether the exact phrase belongs in the title. Review synonyms manually.'],
 'query-h1':['Запрос в H1','Query in H1','Передайте реальный H1 и оцените связь с задачей читателя.','Supply the actual H1 and review its relation to the reader task.'],
 'query-body':['Запрос в тексте','Query in body','Проверьте, отвечает ли статья на запрос. Не увеличивайте плотность механически.','Check whether the article answers the query. Avoid mechanical density targets.'],
 'internal-links':['Ссылки в Markdown','Markdown links','Добавьте полезное продолжение чтения, если оно нужно читателю.','Add useful onward reading where it helps the reader.'],
 inventory:['Адреса внутренних ссылок','Internal target inventory','Передайте список страниц для сверки адресов. Отсутствие в списке не доказывает 404.','Supply page paths to compare targets. Absence does not prove a 404.'],
 'link-safety':['Схемы адресов','Link schemes','Замените javascript: и data: на безопасный адрес.','Replace javascript: and data: links with a safe destination.'],
 images:['Alt изображений','Image alt text','Опишите смысловое изображение; пустой alt допустим для декоративного.','Describe meaningful images. Empty alt can be correct for decorative images.'],
 sources:['Записи доказательств','Evidence records','Свяжите заявленные факты с источниками; для расчётов укажите воспроизведение.','Bind declared facts to sources and document calculation reproduction.'],
 terminology:['Глоссарий','Glossary','Добавьте правила терминологии или проверьте найденные варианты.','Supply terminology rules or review flagged variants.'],
 'reader-task':['Задача читателя','Reader task','Сформулируйте, что человек сможет сделать после чтения.','State what the reader should be able to do.']
};
const states={ru:{good:'Проверено',attention:'Внимание',problem:'Проблема',unchecked:'Нет данных'},en:{good:'Checked',attention:'Review',problem:'Problem',unchecked:'No data'}};
const marks={good:'✓',attention:'!',problem:'×',unchecked:'?'};
const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
export function renderDashboard(host,report,language='en'){
 host.replaceChildren();const ru=language==='ru',i=ru?0:1,d=report.diagnostics;
 const auditBar=element('div',undefined,'reproleaf-audit-bar');
 if(d){
  const total=d.checks.length||1,evaluated=d.summary.good+d.summary.attention+d.summary.problem;
  const barHead=element('div',undefined,'reproleaf-audit-head');
  barHead.append(
   element('strong',ru?`Пройдено проверок: ${d.summary.good} из ${evaluated||total}`:`Checks passed: ${d.summary.good} of ${evaluated||total}`),
   element('span',ru?`Контракт H1–H6, ссылки и доказательства (без искусственного SEO-балла)`:`H1–H6 contract, links and evidence (no synthetic SEO score)`,'reproleaf-audit-sub')
  );
  const track=element('div',undefined,'reproleaf-distribution-track');
  for(const key of ['good','attention','problem','unchecked']){
   const count=d.summary[key]||0;if(!count)continue;
   const seg=element('span',undefined,`reproleaf-dist-seg reproleaf-state--${key}`);
   seg.style.width=`${Math.max(4,Math.round((count/total)*100))}%`;
   seg.title=`${states[language][key]}: ${count}`;
   track.append(seg);
  }
  auditBar.append(barHead,track);
  host.append(auditBar);
 }else if(report.summary){
  const pagesCount=report.summary.pages||0,urlsOnly=report.scope?.evidenceScope==='urls-only'||report.summary.noObservedIncoming===null;
  const barHead=element('div',undefined,'reproleaf-audit-head');
  if(urlsOnly){
   barHead.append(
    element('strong',ru?`Импортированы только URL: ${pagesCount} адресов`:`Imported URLs only: ${pagesCount} addresses`),
    element('span',ru?'Гиперссылки и входящие связи из XML не проверяются':'Hyperlinks and incoming links are not evaluated from XML','reproleaf-audit-sub')
   );
  }else{
   const linked=(report.pages||[]).filter(p=>(p.incomingPages||0)>0).length;
   barHead.append(
    element('strong',ru?`Связанность выгрузки: ${linked} из ${pagesCount} страниц с входящими`:`Inventory connectivity: ${linked} of ${pagesCount} pages have incoming links`),
    element('span',ru?`Кандидатов перелинковки: ${(report.recommendations||[]).length} · Кластеров: ${(report.clusters||[]).length}`:`Link opportunities: ${(report.recommendations||[]).length} · Clusters: ${(report.clusters||[]).length}`,'reproleaf-audit-sub')
   );
  }
  auditBar.append(barHead);
  host.append(auditBar);
 }
 const metrics=element('div',undefined,'reproleaf-metrics');
 const values=d?[[ru?'Слов':'Words',d.metrics.words],[ru?'Заголовков':'Headings',d.metrics.headings],[ru?'Ссылок':'Links',d.metrics.links],[ru?'Изображений':'Images',d.metrics.images]]:[[ru?'Страниц':'Pages',report.summary.pages],[ru?'Связей':'Links',report.summary.distinctInternalEdges??'—'],[ru?'Без входящих в наборе':'No observed incoming',report.summary.noObservedIncoming??'—'],[ru?'Кластеров':'Clusters',(report.clusters||[]).length]];
 for(const[label,value]of values){const cell=element('div');cell.append(element('strong',String(value)),element('span',label));metrics.append(cell);}host.append(metrics);
 if(!d){renderGraph(host,report,ru);return;}
 const summary=element('div',undefined,'reproleaf-status-summary');
 const filter=element('select');filter.setAttribute('aria-label',ru?'Фильтр проверок':'Filter checks');for(const[value,label]of [['all',ru?'Все проверки':'All checks'],...Object.entries(states[language])]){const option=element('option',label);option.value=value;filter.append(option);}
 for(const status of Object.keys(states[language])){
  const item=element('button',`${marks[status]} ${states[language][status]}: ${d.summary[status]}`,`reproleaf-state reproleaf-state--${status}`);
  item.type='button';
  item.onclick=()=>{filter.value=filter.value===status?'all':status;populate();};
  summary.append(item);
 }
 host.append(summary,filter);
 const rows=element('ul',undefined,'reproleaf-checks');
 function populate(){rows.replaceChildren();for(const check of d.checks.filter(c=>filter.value==='all'||c.status===filter.value)){
  const row=element('li',undefined,`reproleaf-check reproleaf-state--${check.status}`),label=catalog[check.code];
  row.append(element('span',marks[check.status],'reproleaf-light'));
  const body=element('div');body.append(element('strong',label?.[i]||check.code),element('small',states[language][check.status]));
  if(check.status!=='good')body.append(element('p',label?.[i+2]||''));
  row.append(body);if(check.value!==null&&typeof check.value==='number')row.append(element('span',String(check.value),'reproleaf-check-value'));rows.append(row);
 }if(!rows.children.length)rows.append(element('li',ru?'Нет проверок с этим статусом.':'No checks have this status.'));}
 filter.onchange=populate;populate();host.append(rows);
 const map=renderInspection(d,language,code=>{filter.value='all';populate();const at=d.checks.findIndex(c=>c.code===code),row=rows.children[at];row.tabIndex=-1;row.focus({preventScroll:true});row.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
 metrics.after(map);
}
function renderInspection(d,language,onSelect){
 const ru=language==='ru',map=element('section',undefined,'reproleaf-inspection'),header=element('div',undefined,'reproleaf-inspection-header');
 header.append(element('strong',ru?'Карта проверки':'Inspection map'),element('span',ru?'Готово':'Complete','reproleaf-inspection-badge'));map.append(header);
 const sheet=element('div',undefined,'reproleaf-document');sheet.setAttribute('aria-label',ru?'Проверки разделов документа':'Document checks');
 for(const kind of ['title','meta','heading','line','line','line','image','line','line','link'])sheet.append(element('span',undefined,'reproleaf-document-'+kind));
 const spots=[['title',88,8],['description',88,20],['h1',88,32],['hierarchy',88,44],['query-body',88,55],['images',88,69],['internal-links',88,88],['sources',12,55]];
 for(const[code,x,y]of spots){const check=d.checks.find(c=>c.code===code);if(!check)continue;const label=catalog[code]?.[ru?0:1]||code,button=element('button',marks[check.status],`reproleaf-map-marker reproleaf-state--${check.status}`);button.type='button';button.style.left=x+'%';button.style.top=y+'%';button.setAttribute('aria-label',`${label}: ${states[language][check.status]}`);button.title=`${label}: ${states[language][check.status]}`;button.onclick=()=>onSelect(code);sheet.append(button);}
 map.append(sheet,element('p',ru?'Нажмите на маркер, чтобы перейти к проверке.':'Select a marker to inspect its check.','reproleaf-help'));return map;
}
function renderGraph(host,report,ru){
 if(report.scope?.evidenceScope==='urls-only'){host.append(element('p',ru?'XML содержит адреса, но не гиперссылки. Загрузите JSON из WordPress, чтобы увидеть граф связей и рекомендации.':'XML contains URLs, not hyperlinks. Upload the WordPress JSON to see link relationships and recommendations.','reproleaf-help'));return;}
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 440 320');svg.setAttribute('role','img');svg.setAttribute('aria-label',ru?'Граф переданных внутренних ссылок. Сплошные линии — наблюдаемые связи.':'Supplied internal-link graph. Solid lines represent observed links.');svg.classList.add('reproleaf-link-graph');
 const nodes=report.pages.slice(0,40),positions=new Map(nodes.map((p,i)=>[p.url,{x:220+135*Math.cos(2*Math.PI*i/nodes.length),y:160+125*Math.sin(2*Math.PI*i/nodes.length)}]));let count=0;
 for(const edge of report.edges||[]){const a=positions.get(edge.source),b=positions.get(edge.target);if(!a||!b||count>=120)continue;const line=document.createElementNS(ns,'line');for(const[k,v]of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y}))line.setAttribute(k,v);line.setAttribute('stroke','#c8ced8');svg.append(line);count++;}
 for(const[nodeIndex,node]of nodes.entries()){const p=positions.get(node.url),circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('r',6);circle.setAttribute('fill',node.incomingPages?'#267453':'#a76b18');const title=document.createElementNS(ns,'title');title.textContent=`${nodeIndex+1}. ${node.title}: ${node.url}`;circle.append(title);svg.append(circle);const label=document.createElementNS(ns,'text');label.setAttribute('x',p.x+10);label.setAttribute('y',p.y+4);label.setAttribute('font-size',10);label.textContent=String(nodeIndex+1);svg.append(label);}
 host.append(svg,element('p',ru?`Показано ${nodes.length} из ${report.pages.length} страниц и ${count} наблюдаемых связей. Это часть выгрузки, не карта всего интернета. Номера соответствуют порядку страниц в отчёте.`:`Showing ${nodes.length} of ${report.pages.length} pages and ${count} observed links. This is the supplied scope, not the whole web. Numbers follow report page order.`,'reproleaf-help'));
}
