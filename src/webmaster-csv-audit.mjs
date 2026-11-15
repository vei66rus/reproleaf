import {z} from 'zod';

export const webmasterCsvSchema=z.object({
 csvText:z.string().min(1).max(10485760),
 source:z.enum(['auto','gsc','yandex']).default('auto'),
 minImpressions:z.number().int().min(1).max(1000000).default(50)
}).strict();

function detectDelimiter(headerLine){
 const counts={',':0,';':0,'\t':0};
 let inQuotes=false;
 for(const ch of headerLine){
  if(ch==='"')inQuotes=!inQuotes;
  else if(!inQuotes&&Object.hasOwn(counts,ch))counts[ch]+=1;
 }
 return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0]||',';
}

export function parseCsvRecords(rawText){
 const text=String(rawText||'').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trim();
 if(!text)return [];
 const firstBreak=text.indexOf('\n');
 const firstLine=firstBreak===-1?text:text.slice(0,firstBreak);
 const delimiter=detectDelimiter(firstLine);

 const rows=[];
 let row=[];
 let field='';
 let inQuotes=false;

 for(let i=0;i<text.length;i+=1){
  const ch=text[i];
  if(inQuotes){
   if(ch==='"'){
    if(text[i+1]==='"'){field+='"';i+=1;}
    else inQuotes=false;
   }else{
    field+=ch;
   }
   continue;
  }
  if(ch==='"'){
   inQuotes=true;
  }else if(ch===delimiter){
   row.push(field.trim());
   field='';
  }else if(ch==='\n'){
   row.push(field.trim());
   if(row.some(cell=>cell!==''))rows.push(row);
   row=[];
   field='';
  }else{
   field+=ch;
  }
 }
 row.push(field.trim());
 if(row.some(cell=>cell!==''))rows.push(row);
 if(rows.length<2)return [];

 const headers=rows[0].map(h=>h.trim());
 return rows.slice(1).map(vals=>{
  const obj={};
  for(let idx=0;idx<headers.length;idx+=1){
   obj[headers[idx]]=vals[idx]??'';
  }
  return obj;
 });
}

function parseNumber(raw){
 if(raw===undefined||raw===null||raw==='')return 0;
 const s=String(raw).trim().replace(/\s+/g,'').replace(/%/g,'').replace(',','.');
 const n=Number(s);
 return Number.isFinite(n)?n:0;
}

function parseCtr(raw){
 const str=String(raw||'').trim();
 const n=parseNumber(str);
 if(str.includes('%')||n>1)return Number((n/100).toFixed(4));
 return Number(n.toFixed(4));
}

function pickField(row,candidates){
 const entries=Object.entries(row);
 for(const cand of candidates){
  const match=entries.find(([k])=>k.toLowerCase()===cand);
  if(match)return match[1];
 }
 return undefined;
}

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
 const rawRows=parseCsvRecords(input.csvText);
 if(rawRows.length===0){
  throw Error('CSV contains no data rows.');
 }

 const normalized=[];
 for(const row of rawRows){
  const query=pickField(row,['top queries','query','queries','поисковый запрос','запрос','keyword'])||'';
  const page=pickField(row,['page','top pages','landing page','url','страница','адрес страницы'])||'';
  const clicks=parseNumber(pickField(row,['clicks','клики']));
  const impressions=parseNumber(pickField(row,['impressions','показы','shows']));
  const rawCtr=pickField(row,['ctr']);
  const ctr=rawCtr!==undefined?parseCtr(rawCtr):(impressions>0?Number((clicks/impressions).toFixed(4)):0);
  const position=parseNumber(pickField(row,['position','average position','avg position','позиция','средняя позиция']));
  if(!query&&!page)continue;
  normalized.push({query,page,clicks,impressions,ctr,position});
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
  summary:{
   rowCount:normalized.length,
   minImpressions:input.minImpressions,
   quickWinCount:quickWins.length,
   lowCtrCount:lowCtrOpportunities.length,
   cannibalizationCount:cannibalizationConflicts.length,
   totalClicks:normalized.reduce((s,r)=>s+r.clicks,0),
   totalImpressions:normalized.reduce((s,r)=>s+r.impressions,0)
  },
  quickWins:quickWins.slice(0,100),
  lowCtrOpportunities:lowCtrOpportunities.slice(0,100),
  cannibalizationConflicts:cannibalizationConflicts.slice(0,100)
 };
}
