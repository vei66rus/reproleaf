import {z} from 'zod';

export const webmasterCsvSchema=z.object({
 csvText:z.string().min(1).max(10485760),
 source:z.enum(['auto','gsc','yandex']).default('auto'),
 minImpressions:z.number().int().min(1).max(1000000).default(50)
}).strict();

export const WEBMASTER_CSV_LIMITS=Object.freeze({bytes:10485760,rows:50000});
const aliases={query:['query','queries','top queries','keyword','поисковый запрос','запрос'],page:['page','top pages','landing page','url','страница','адрес страницы'],clicks:['clicks','клики'],impressions:['impressions','shows','показы'],position:['position','average position','avg position','позиция','средняя позиция'],ctr:['ctr']};
const error=(code)=>{throw new Error(code);};
const byteLength=text=>new TextEncoder().encode(text).length;
export function parseStrictGscCsv(text,limits=WEBMASTER_CSV_LIMITS){
 if(typeof text!=='string'||byteLength(text)>limits.bytes)error('GSC_FILE_LIMIT');
 text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 if(!text.trim())error('GSC_EMPTY');
 let first='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){first+='""';i++;continue;}quoted=!quoted;}if(c==='\n'&&!quoted)break;first+=c;}
 const counts={',':0,';':0,'\t':0};quoted=false;
 for(let i=0;i<first.length;i++){if(first[i]==='"'){if(quoted&&first[i+1]==='"'){i++;continue;}quoted=!quoted;}else if(!quoted&&Object.hasOwn(counts,first[i]))counts[first[i]]++;}
 const delimiter=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
 const rows=[];let row=[],field='',state='start';
 const finishField=()=>{row.push(field);field='';state='start';};
 const finishRow=()=>{finishField();if(row.some(v=>v.trim()))rows.push(row);row=[];if(rows.length>limits.rows+1)error('GSC_ROW_LIMIT');};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='\0')error('GSC_CSV_INVALID');
  if(state==='quoted'){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else state='closed';}else field+=c;continue;}
  if(c===delimiter){finishField();continue;}
  if(c==='\n'){finishRow();continue;}
  if(state==='closed'){if(c===' '||c==='\t')continue;error('GSC_CSV_INVALID');}
  if(c==='"'){if(state!=='start')error('GSC_CSV_INVALID');state='quoted';continue;}
  field+=c;state='plain';
 }
 if(state==='quoted')error('GSC_CSV_INVALID');
 if(field||row.length||state==='closed')finishRow();
 if(rows.length<2)error('GSC_EMPTY');
 const headers=rows.shift().map(v=>v.trim().toLowerCase());
 if(headers.some(v=>!v)||new Set(headers).size!==headers.length)error('GSC_HEADERS');
 const columns={};
 for(const [key,names] of Object.entries(aliases)){const found=headers.map((v,i)=>names.includes(v)?i:-1).filter(i=>i>=0);if(found.length>1)error('GSC_HEADERS');if(found.length)columns[key]=found[0];}
 if((columns.query===undefined&&columns.page===undefined)||['clicks','impressions','position'].some(k=>columns[k]===undefined))error('GSC_HEADERS');
 const parseNumeric=(value,kind)=>{
  let raw=value.trim();
  if(!raw)error('GSC_NUMBERS');
  if(kind==='ctr'&&raw.endsWith('%'))raw=raw.slice(0,-1).trim();
  if(/[\s\u00A0\u202F]/u.test(raw)){
   if(kind!=='count'||!/^\d{1,3}(?:[ \u00A0\u202F]\d{3})+(?:[,.]0+)?$/u.test(raw))error('GSC_NUMBERS');
   raw=raw.replace(/[ \u00A0\u202F]/gu,'');
  }
  if(kind==='count'&&/^[1-9]\d{0,2}(?:[,\.]\d{3})+$/.test(raw))raw=raw.replace(/[,\.]/g,'');
  else raw=raw.replace(',','.');
  if(!/^\d+(?:\.\d+)?$/.test(raw))error('GSC_NUMBERS');
  const number=Number(raw);
  if(!Number.isFinite(number)||number>Number.MAX_SAFE_INTEGER||(kind==='count'&&!Number.isSafeInteger(number)))error('GSC_NUMBERS');
  return number;
 };
 const normalized=rows.map(cells=>{
  if(cells.length!==headers.length)error('GSC_CSV_INVALID');
  const get=k=>columns[k]===undefined?'':cells[columns[k]].trim();
  const query=get('query'),page=get('page');
  if(!query&&!page)error('GSC_IDENTITY');
  if(query.length>1000||page.length>4096)error('GSC_CELL_LIMIT');
  if(page){let u;try{u=new URL(page);}catch{error('GSC_PAGE_URL');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)error('GSC_PAGE_URL');}
  const clicks=parseNumeric(get('clicks'),'count'),impressions=parseNumeric(get('impressions'),'count'),position=parseNumeric(get('position'),'position');
  if(clicks>impressions||position>1000||(impressions>0&&position===0))error('GSC_NUMBERS');
  if(columns.ctr!==undefined&&get('ctr')&&parseNumeric(get('ctr'),'ctr')>100)error('GSC_NUMBERS');
  return {query,page,clicks,impressions,position,ctr:impressions?clicks/impressions:0};
 });
 return {rows:normalized,hasQuery:columns.query!==undefined,hasPage:columns.page!==undefined};
}

export function parseCsvRecords(rawText){return parseStrictGscCsv(rawText).rows;}

function expectedCtrForPosition(pos){
 if(pos<=1.5)return 0.22;
 if(pos<=3.5)return 0.09;
 if(pos<=6.5)return 0.04;
 if(pos<=10.5)return 0.02;
 if(pos<=15.5)return 0.01;
 return 0.005;
}

export function auditWebmasterCsv(rawInput){
 const input=webmasterCsvSchema.parse(rawInput);
 const source=parseStrictGscCsv(input.csvText);
 const normalized=source.rows;
 let totalClicks=0,totalImpressions=0;
 for(const row of normalized){
  totalClicks+=row.clicks;totalImpressions+=row.impressions;
  if(!Number.isSafeInteger(totalClicks)||!Number.isSafeInteger(totalImpressions))error('GSC_NUMBERS');
 }

 const quickWins=[];
 const lowCtrOpportunities=[];
 const byQuery=new Map();

 for(const item of normalized){
  const expectedCtr=expectedCtrForPosition(item.position||20);
  if(item.query&&item.position>=4&&item.position<=15&&item.impressions>=input.minImpressions){
   const upsideClicks=Math.max(0,Math.round(item.impressions*expectedCtr-item.clicks));
   quickWins.push({...item,expectedCtr,upsideClicks});
  }
  if(item.impressions>=input.minImpressions&&item.position>0&&item.position<=12&&item.ctr<expectedCtr*0.55){
   lowCtrOpportunities.push({...item,expectedCtr,ctrGap:Number((expectedCtr-item.ctr).toFixed(4))});
  }
  if(item.query&&item.page){
   const qKey=item.query.toLowerCase();
   if(!byQuery.has(qKey))byQuery.set(qKey,{query:item.query,pages:new Map()});
   const qGroup=byQuery.get(qKey);
   const prev=qGroup.pages.get(item.page)||{page:item.page,clicks:0,impressions:0,position:item.position};
   prev.clicks+=item.clicks;
   prev.impressions+=item.impressions;
   qGroup.pages.set(item.page,prev);
  }
 }

 const cannibalizationConflicts=[];
 for(const group of byQuery.values()){
  if(group.pages.size<2)continue;
  const pageList=[...group.pages.values()].sort((a,b)=>b.impressions-a.impressions||b.clicks-a.clicks);
  const totalImpr=pageList.reduce((s,p)=>s+p.impressions,0);
  if(totalImpr===0)continue;
  const meaningful=pageList.filter(p=>p.impressions/totalImpr>=0.1);
  if(meaningful.length>=2){
   cannibalizationConflicts.push({
    query:group.query,
    totalImpressions:totalImpr,
    dominantShare:Number((pageList[0].impressions/totalImpr).toFixed(4)),
    pages:pageList
   });
  }
 }

 quickWins.sort((a,b)=>b.upsideClicks-a.upsideClicks||b.impressions-a.impressions);
 lowCtrOpportunities.sort((a,b)=>b.impressions-a.impressions);
 cannibalizationConflicts.sort((a,b)=>b.totalImpressions-a.totalImpressions);

 return {
  ok:cannibalizationConflicts.length===0,
  scope:{hasQuery:source.hasQuery,hasPage:source.hasPage,overlapStatus:source.hasQuery&&source.hasPage?"observed-candidates":"not-checked",ctrModel:"Illustrative fixed curve, not a traffic forecast",categoryLimit:100,source:input.source},
  summary:{
   rowCount:normalized.length,
   minImpressions:input.minImpressions,
   quickWinCount:quickWins.length,
   lowCtrCount:lowCtrOpportunities.length,
   cannibalizationCount:cannibalizationConflicts.length,
   totalClicks,
   totalImpressions
  },
  quickWins:quickWins.slice(0,100),
  lowCtrOpportunities:lowCtrOpportunities.slice(0,100),
  cannibalizationConflicts:cannibalizationConflicts.slice(0,100)
 };
}
