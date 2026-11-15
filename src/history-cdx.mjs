import {z} from 'zod';
import {assertSafePublicUrl} from './network-guard.mjs';

export const historyAuditSchema=z.object({
 domain:z.string().min(3).max(253),
 allowNetwork:z.boolean().default(false),
 limit:z.number().int().min(10).max(2000).default(300),
 timeoutMs:z.number().int().min(1000).max(30000).default(15000),
 cdxRows:z.array(z.array(z.string())).optional()
}).strict().superRefine((val,ctx)=>{
 if(!val.cdxRows&&!val.allowNetwork){
  ctx.addIssue({code:z.ZodIssueCode.custom,message:'Provide offline cdxRows or set allowNetwork: true (--allow-network).'});
 }
});

function parseCdxTable(rows){
 if(!Array.isArray(rows)||rows.length===0)return [];
 const first=rows[0];
 const hasHeader=first[0]==='timestamp'||first[0]==='urlkey'||first.includes('original');
 const header=hasHeader?first:['timestamp','original','mimetype','statuscode'];
 const dataRows=hasHeader?rows.slice(1):rows;

 const idxTs=header.indexOf('timestamp');
 const idxOrig=header.indexOf('original');
 const idxMime=header.indexOf('mimetype');
 const idxStatus=header.indexOf('statuscode');

 return dataRows.map(r=>({
  timestamp:String(r[idxTs>=0?idxTs:0]||''),
  original:String(r[idxOrig>=0?idxOrig:1]||''),
  mimetype:String(r[idxMime>=0?idxMime:2]||''),
  statuscode:String(r[idxStatus>=0?idxStatus:3]||'')
 })).filter(item=>item.timestamp.length>=6&&item.original);
}

function topSectionFromUrl(raw){
 try{
  const u=new URL(raw);
  const seg=u.pathname.split('/').filter(Boolean)[0];
  return seg?`/${seg}/`:'/';
 }catch{
  return '/';
 }
}

export async function analyzeArchiveHistory(rawInput,{fetchImpl=fetch,lookupAll}={}){
 const input=historyAuditSchema.parse(rawInput);
 await assertSafePublicUrl(`https://${input.domain.replace(/^https?:\/\//i,'').split('/')[0]}/`,{lookupAll});
 const cleanDomain=input.domain.replace(/^https?:\/\//i,'').split('/')[0].toLowerCase();

 let rows=input.cdxRows;
 if(!rows){
  const params=new URLSearchParams({
   url:`${cleanDomain}/*`,
   output:'json',
   fl:'timestamp,original,mimetype,statuscode',
   filter:'statuscode:200',
   collapse:'urlkey',
   limit:String(input.limit)
  });
  const cdxUrl=`https://web.archive.org/cdx/search/cdx?${params.toString()}`;
  const res=await fetchImpl(cdxUrl,{
   method:'GET',
   redirect:'manual',
   signal:AbortSignal.timeout(input.timeoutMs),
   headers:{accept:'application/json','user-agent':'ReproleafHistory/1.0'}
  });
  if(!res.ok){
   throw Error(`Wayback CDX API returned HTTP ${res.status}`);
  }
  rows=await res.json();
 }

 const records=parseCdxTable(rows);
 const byYear=new Map();
 const earliestYearSections=new Set();
 const latestYearSections=new Set();
 const sectionYears=new Map();

 for(const rec of records){
  const year=rec.timestamp.slice(0,4);
  const sec=topSectionFromUrl(rec.original);
  if(!byYear.has(year))byYear.set(year,{year,captures:0,sections:new Set()});
  const yObj=byYear.get(year);
  yObj.captures+=1;
  yObj.sections.add(sec);

  if(!sectionYears.has(sec))sectionYears.set(sec,new Set());
  sectionYears.get(sec).add(year);
 }

 const sortedYears=[...byYear.keys()].sort();
 if(sortedYears.length>=1){
  for(const s of byYear.get(sortedYears[0]).sections)earliestYearSections.add(s);
  for(const s of byYear.get(sortedYears[sortedYears.length-1]).sections)latestYearSections.add(s);
 }

 const vanishedSections=[...earliestYearSections].filter(s=>s!=='/'&&!latestYearSections.has(s));
 const newlyAppearedSections=[...latestYearSections].filter(s=>s!=='/'&&!earliestYearSections.has(s));
 const overlapSections=[...earliestYearSections].filter(s=>latestYearSections.has(s)).length;
 const denominator=new Set([...earliestYearSections,...latestYearSections]).size;
 const sectionContinuityRatio=denominator>0?Number((overlapSections/denominator).toFixed(4)):1;

 const findings=[];
 if(vanishedSections.length>0){
  findings.push({
   code:'HISTORY_REMOVED_SECTIONS',
   severity:'warning',
   sections:vanishedSections,
   message:`${vanishedSections.length} previously indexed top-level section(s) disappeared between ${sortedYears[0]} and ${sortedYears[sortedYears.length-1]}: ${vanishedSections.slice(0,8).join(', ')}`
  });
 }
 if(sortedYears.length>=2&&sectionContinuityRatio<0.35){
  findings.push({
   code:'HISTORY_POSSIBLE_TOPIC_PIVOT',
   severity:'warning',
   ratio:sectionContinuityRatio,
   message:`Low structural continuity (${Math.round(sectionContinuityRatio*100)}%) between earliest (${sortedYears[0]}) and latest (${sortedYears[sortedYears.length-1]}) archived snapshots.`
  });
 }

 return {
  ok:true,
  domain:cleanDomain,
  summary:{
   totalRecords:records.length,
   yearsObserved:sortedYears,
   firstYear:sortedYears[0]||null,
   latestYear:sortedYears[sortedYears.length-1]||null,
   sectionContinuityRatio,
   vanishedSectionCount:vanishedSections.length,
   newSectionCount:newlyAppearedSections.length
  },
  yearlyBreakdown:sortedYears.map(y=>({
   year:y,
   captures:byYear.get(y).captures,
   sections:[...byYear.get(y).sections].sort()
  })),
  vanishedSections,
  newlyAppearedSections,
  findings
 };
}
