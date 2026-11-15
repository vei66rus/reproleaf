import crypto from 'node:crypto';

function findingKey(finding){
 return `${finding.code}::${finding.message}`;
}

export function createBaselineSnapshot(batchReport){
 const pages=(batchReport.pages||[]).map(page=>({
  file:page.file,
  ok:Boolean(page.ok),
  errors:Number(page.errors||0),
  warnings:Number(page.warnings||0),
  findingKeys:[...new Set((page.findings||[]).map(findingKey))].sort()
 })).sort((a,b)=>a.file.localeCompare(b.file));

 const canonical=JSON.stringify({version:1,pages});
 const snapshotSha256=crypto.createHash('sha256').update(canonical).digest('hex');

 return {
  version:1,
  snapshotSha256,
  summary:{
   pagesCount:pages.length,
   totalErrors:pages.reduce((s,p)=>s+p.errors,0),
   totalWarnings:pages.reduce((s,p)=>s+p.warnings,0)
  },
  pages
 };
}

export function diffBaselineSnapshots({baseline,current}){
 const baseSnapshot=baseline.version===1&&Array.isArray(baseline.pages)&&baseline.pages[0]?.findingKeys?baseline:createBaselineSnapshot(baseline);
 const currSnapshot=current.version===1&&Array.isArray(current.pages)&&current.pages[0]?.findingKeys?current:createBaselineSnapshot(current);

 const baseMap=new Map(baseSnapshot.pages.map(p=>[p.file,p]));
 const currMap=new Map(currSnapshot.pages.map(p=>[p.file,p]));

 const regressions=[];
 const resolved=[];
 const unchanged=[];
 const addedPages=[];
 const removedPages=[];

 for(const [file,currPage] of currMap){
  const basePage=baseMap.get(file);
  if(!basePage){
   addedPages.push(file);
   for(const key of currPage.findingKeys)regressions.push({file,key,reason:'new-page-finding'});
   continue;
  }
  const baseKeys=new Set(basePage.findingKeys);
  const currKeys=new Set(currPage.findingKeys);
  for(const key of currKeys){
   if(!baseKeys.has(key))regressions.push({file,key,reason:'new-finding'});
   else unchanged.push({file,key});
  }
  for(const key of baseKeys){
   if(!currKeys.has(key))resolved.push({file,key});
  }
 }

 for(const file of baseMap.keys()){
  if(!currMap.has(file))removedPages.push(file);
 }

 return {
  ok:regressions.length===0,
  baselineSha256:baseSnapshot.snapshotSha256,
  currentSha256:currSnapshot.snapshotSha256,
  summary:{
   regressions:regressions.length,
   resolved:resolved.length,
   unchanged:unchanged.length,
   addedPages:addedPages.length,
   removedPages:removedPages.length
  },
  regressions,
  resolved,
  addedPages,
  removedPages
 };
}
