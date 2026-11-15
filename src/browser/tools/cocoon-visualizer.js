import {analyzeInternalLinkEquity} from '../../link-equity.mjs';
import {auditCocoonGraph} from '../../cocoon-audit.mjs';
import {el,createToolFrame,renderMetrics,renderFindings,emitToolEvent,downloadText} from '../tool-shell.mjs';

const copy={
 ru:{
  title:'Визуализатор графа кокона и PageRank перелинковки',
  subtitle:'Загрузите JSON краула или карту страниц: посмотрите визуальный граф связей, найдите orphan-изоляты, тупиковые страницы и перекосы внутреннего PageRank.',
  modeLabel:'Cocoon Visualizer',
  exampleBtn:'Заполнить пример графа',
  siteUrlLabel:'Корневой URL сайта (origin)',
  jsonLabel:'JSON страниц ([{ url, title, cluster, kind, links: [{ href, anchor }] }]) или crawl.json',
  runBtn:'Построить граф',
  jsonBtn:'Скачать JSON-отчёт',
  invalidJson:'Введите корректный JSON страниц (от 1 до 500) или отчёт crawl.json.',
  doneOk:'Сироты и критические перекосы графа не обнаружены.',
  doneWarn:'Обнаружены изоляты, тупики или проблемы баланса перелинковки.',
  mNodes:'Узлов в графе',
  mEdges:'Внутренних связей',
  mOrphans:'Изолятов (orphan)',
  mDeadEnds:'Тупиков (out=0)',
  tabAll:'Все узлы',
  tabOrphans:'Изоляты',
  tabDeadEnds:'Тупики',
  tabHubs:'Хабы',
  colUrl:'Страница',
  colDepth:'Глубина',
  colPr:'PageRank',
  colDeg:'Вх / Исх'
 },
 en:{
  title:'Topic Cocoon & Internal Link Graph Visualizer',
  subtitle:'Inspect internal PageRank distribution, click depth, orphan pages and dead-end nodes in an interactive SVG link graph built from your crawl JSON.',
  modeLabel:'Cocoon Visualizer',
  exampleBtn:'Load sample graph',
  siteUrlLabel:'Site root URL (origin)',
  jsonLabel:'Pages JSON ([{ url, title, cluster, kind, links: [{ href, anchor }] }]) or crawl.json',
  runBtn:'Render graph',
  jsonBtn:'Download JSON report',
  invalidJson:'Enter a valid JSON array of 1 to 500 pages or a Reproleaf crawl.json object.',
  doneOk:'No orphan nodes or critical link equity bottlenecks detected.',
  doneWarn:'Orphans, dead ends or cocoon balance issues detected.',
  mNodes:'Graph nodes',
  mEdges:'Internal edges',
  mOrphans:'Orphan nodes',
  mDeadEnds:'Dead ends (out=0)',
  tabAll:'All nodes',
  tabOrphans:'Orphans',
  tabDeadEnds:'Dead ends',
  tabHubs:'Hubs',
  colUrl:'Page URL',
  colDepth:'Depth',
  colPr:'PageRank',
  colDeg:'In / Out'
 }
};

const samplePayload={
 siteUrl:'https://example.org',
 pages:[
  {url:'https://example.org/geo-hub/',title:'GEO Audit Hub',kind:'hub',cluster:'geo',links:[{href:'https://example.org/llms-txt/',anchor:'llms.txt validator'},{href:'https://example.org/ai-crawlers/',anchor:'AI crawler access guide'}]},
  {url:'https://example.org/llms-txt/',title:'LLMs.txt Guide',kind:'cluster',cluster:'geo',links:[{href:'https://example.org/geo-hub/',anchor:'GEO hub'},{href:'https://example.org/token-budget/',anchor:'context token budget'}]},
  {url:'https://example.org/ai-crawlers/',title:'AI Crawler Rules',kind:'cluster',cluster:'geo',links:[{href:'https://example.org/geo-hub/',anchor:'GEO hub'}]},
  {url:'https://example.org/token-budget/',title:'Token Budget',kind:'supporting',cluster:'geo',links:[]},
  {url:'https://example.org/orphan-draft/',title:'Unlinked Orphan Page',kind:'supporting',cluster:'geo',links:[{href:'https://example.org/geo-hub/',anchor:'GEO hub'}]}
 ]
};

function shortSlug(rawUrl){
 try{
  const u=new URL(rawUrl);
  return u.pathname==='/'?'/':u.pathname.replace(/\/$/,'').slice(-26);
 }catch{
  return String(rawUrl||'').slice(-26);
 }
}

function buildSvgGraph(nodes,edgeList,selectedUrl,onSelect){
 const svgNs='http://www.w3.org/2000/svg';
 const width=640;
 const height=340;
 const cx=width/2;
 const cy=height/2;
 const radius=Math.min(width,height)*0.36;
 const svg=document.createElementNS(svgNs,'svg');
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
 svg.setAttribute('class','reproleaf-link-graph');
 svg.setAttribute('role','img');
 svg.setAttribute('aria-label','Internal link graph visualization');

 const shownNodes=nodes.slice(0,36);
 const posMap=new Map();
 shownNodes.forEach((n,idx)=>{
  const angle=(idx/Math.max(1,shownNodes.length))*Math.PI*2-Math.PI/2;
  const r=n.clickDepth===0?radius*0.25:n.isOrphan?radius*1.08:radius*(0.65+(idx%3)*0.14);
  posMap.set(n.url,{x:cx+Math.cos(angle)*r,y:cy+Math.sin(angle)*r,node:n});
 });

 for(const edge of edgeList.slice(0,180)){
  const a=posMap.get(edge.from);
  const b=posMap.get(edge.to);
  if(!a||!b)continue;
  const line=document.createElementNS(svgNs,'line');
  line.setAttribute('x1',a.x.toFixed(1));
  line.setAttribute('y1',a.y.toFixed(1));
  line.setAttribute('x2',b.x.toFixed(1));
  line.setAttribute('y2',b.y.toFixed(1));
  const highlighted=selectedUrl&&(edge.from===selectedUrl||edge.to===selectedUrl);
  line.setAttribute('stroke',highlighted?'#014cd9':'#cbd5e1');
  line.setAttribute('stroke-width',highlighted?'2':'1');
  line.setAttribute('stroke-opacity',highlighted?'0.9':'0.55');
  svg.appendChild(line);
 }

 const maxPr=Math.max(0.001,...shownNodes.map(n=>n.pageRank||0));
 for(const n of shownNodes){
  const p=posMap.get(n.url);
  if(!p)continue;
  const g=document.createElementNS(svgNs,'g');
  g.style.cursor='pointer';
  const color=n.isOrphan?'#a63732':n.isDeadEnd?'#885b16':n.clickDepth===0?'#014cd9':'#27664a';
  const dotR=7+Math.round(((n.pageRank||0)/maxPr)*10);
  const circle=document.createElementNS(svgNs,'circle');
  circle.setAttribute('cx',p.x.toFixed(1));
  circle.setAttribute('cy',p.y.toFixed(1));
  circle.setAttribute('r',String(dotR));
  circle.setAttribute('fill',color);
  circle.setAttribute('stroke',selectedUrl===n.url?'#121212':'#ffffff');
  circle.setAttribute('stroke-width',selectedUrl===n.url?'2.5':'1.5');

  const tip=document.createElementNS(svgNs,'title');
  tip.textContent=`${n.url} | PR=${n.pageRank} | In=${n.inDegree} Out=${n.outDegree}`;
  circle.appendChild(tip);

  const label=document.createElementNS(svgNs,'text');
  label.setAttribute('x',p.x.toFixed(1));
  label.setAttribute('y',(p.y+dotR+12).toFixed(1));
  label.setAttribute('text-anchor','middle');
  label.setAttribute('font-size','10');
  label.setAttribute('fill','#273142');
  label.textContent=shortSlug(n.url);

  g.addEventListener('click',()=>onSelect(n.url===selectedUrl?null:n.url));
  g.append(circle,label);
  svg.appendChild(g);
 }

 return svg;
}

export function mount(root,options={}){
 const language=options.language==='ru'?'ru':'en';
 const t=copy[language];
 const frame=createToolFrame({root,title:t.title,subtitle:t.subtitle,modeLabel:t.modeLabel,language});

 const siteUrlInput=el('input',{type:'url',value:samplePayload.siteUrl,required:true});
 const jsonArea=el('textarea',{rows:10,value:JSON.stringify(samplePayload.pages,null,2)});
 const runBtn=el('button',{type:'submit',className:'agent-kit-download'},t.runBtn);
 const sampleBtn=el('button',{type:'button',className:'reproleaf-text-button'},t.exampleBtn);
 const jsonBtn=el('button',{type:'button',className:'reproleaf-text-button',disabled:true},t.jsonBtn);

 frame.form.append(
  el('label',{},t.siteUrlLabel,siteUrlInput),
  el('label',{},t.jsonLabel,jsonArea),
  el('div',{className:'agent-kit-actions'},runBtn,sampleBtn,jsonBtn)
 );

 let latestReport=null;
 let activeFilter='all';
 let selectedUrl=null;

 function renderVisualizer(){
  if(!latestReport)return;
  frame.extra.replaceChildren();
  const {equity,edgeList}=latestReport;
  const bar=el('div',{className:'reproleaf-explorer-bar'});
  const tabs=el('div',{className:'reproleaf-explorer-tabs'});
  for(const [id,label] of [['all',t.tabAll],['orphans',t.tabOrphans],['deadEnds',t.tabDeadEnds],['hubs',t.tabHubs]]){
   const btn=el('button',{type:'button',className:`reproleaf-explorer-tab${activeFilter===id?' is-active':''}`},label);
   btn.addEventListener('click',()=>{activeFilter=id;renderVisualizer();});
   tabs.append(btn);
  }
  bar.append(tabs);

  const filtered=equity.nodes.filter(n=>{
   if(activeFilter==='orphans')return n.isOrphan;
   if(activeFilter==='deadEnds')return n.isDeadEnd;
   if(activeFilter==='hubs')return n.inDegree>=2||n.outDegree>=3||n.clickDepth===0;
   return true;
  });

  const table=el('table',{className:'reproleaf-page-table'},
   el('thead',{},el('tr',{},el('th',{},t.colUrl),el('th',{},t.colDepth),el('th',{},t.colPr),el('th',{},t.colDeg))),
   el('tbody',{},...filtered.slice(0,40).map(n=>el('tr',{},
    el('td',{'data-label':t.colUrl},shortSlug(n.url),el('small',{},n.url)),
    el('td',{'data-label':t.colDepth},n.clickDepth===null?'-':String(n.clickDepth)),
    el('td',{'data-label':t.colPr},String(n.pageRank)),
    el('td',{'data-label':t.colDeg},`${n.inDegree} / ${n.outDegree}`)
   )))
  );

  const svg=buildSvgGraph(filtered,edgeList,selectedUrl,url=>{selectedUrl=url;renderVisualizer();});
  frame.extra.append(bar,svg,table);
 }

 sampleBtn.addEventListener('click',()=>{
  siteUrlInput.value=samplePayload.siteUrl;
  jsonArea.value=JSON.stringify(samplePayload.pages,null,2);
 });

 jsonBtn.addEventListener('click',()=>{
  if(!latestReport)return;
  downloadText('reproleaf-cocoon-graph.json',JSON.stringify(latestReport,null,2),'application/json');
 });

 frame.form.addEventListener('submit',event=>{
  event.preventDefault();
  try{
   const parsed=JSON.parse(jsonArea.value);
   const rawPages=Array.isArray(parsed)?parsed:Array.isArray(parsed.pages)?parsed.pages:null;
   if(!rawPages||rawPages.length===0)throw Error(t.invalidJson);
   const siteOrigin=new URL((parsed.siteUrl||parsed.summary?.startUrl||siteUrlInput.value).trim()).origin;
   const startUrl=parsed.summary?.startUrl||rawPages[0].url;
   const normalizedPages=rawPages.slice(0,500).map(p=>({
    url:p.url,
    title:p.title||p.url,
    cluster:p.cluster||'default',
    kind:p.kind||'page',
    links:Array.isArray(p.links)?p.links:Array.isArray(p.internalLinks)?p.internalLinks.map(href=>({href,anchor:''})):[]
   }));

   const edgeList=[];
   const knownSet=new Set(normalizedPages.map(p=>p.url));
   for(const p of normalizedPages){
    for(const l of p.links){
     if(knownSet.has(l.href)&&l.href!==p.url)edgeList.push({from:p.url,to:l.href});
    }
   }

   const equity=analyzeInternalLinkEquity({startUrl,pages:normalizedPages.map(p=>({url:p.url,title:p.title,links:p.links}))});
   let cocoonAudit=null;
   try{
    if(normalizedPages.every(p=>p.url.startsWith(siteOrigin))){
     cocoonAudit=auditCocoonGraph({siteUrl:siteOrigin,pages:normalizedPages});
    }
   }catch{}

   const combinedFindings=[...equity.findings,...(cocoonAudit?.findings||[])];
   latestReport={equity,cocoonAudit,edgeList,findings:combinedFindings};
   jsonBtn.disabled=false;

   renderMetrics(frame.metrics,[
    {value:equity.summary.nodeCount,label:t.mNodes},
    {value:edgeList.length,label:t.mEdges},
    {value:equity.summary.orphanCount,label:t.mOrphans},
    {value:equity.summary.deadEndCount,label:t.mDeadEnds}
   ]);
   renderFindings(frame.findings,frame.findingsTitle,combinedFindings,language);
   frame.status.textContent=combinedFindings.length===0?t.doneOk:t.doneWarn;
   renderVisualizer();
   emitToolEvent(root,{tool:'cocoon-visualizer',ok:equity.ok,errorCount:combinedFindings.filter(f=>f.severity==='error').length,warningCount:combinedFindings.filter(f=>f.severity==='warning').length,codes:combinedFindings.map(f=>f.code)});
  }catch(err){
   frame.status.textContent=err?.message||t.invalidJson;
  }
 });
}
