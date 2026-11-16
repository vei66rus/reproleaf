import crypto from 'node:crypto';

function findingKey(finding){
 return `${finding.code}::${finding.message}`;
}

function pageReadFailed(page){
 return Boolean(page.readFailed||page.error||page.readError||page.fetchError||page.status===0||page.state==='failed'||page.findingKeys?.some(key=>/^(?:BATCH_)?(?:FILE_)?READ_(?:FAILED|ERROR)::/.test(key))||(page.findings||[]).some(f=>/(?:READ|FETCH)_(?:FAILED|ERROR)$/.test(f.code||'')));
}

function unconfirmedEntry(file,key,page){
 const verificationReasons=[];
 if(!page)verificationReasons.push('page-absent');
 else if(pageReadFailed(page))verificationReasons.push('read-failed');
 verificationReasons.push('engine-unknown','rule-coverage-unknown');
 return {file,key,reason:verificationReasons[0],verificationReasons};
}

export function createBaselineSnapshot(batchReport){
 const pages=(batchReport.pages||[]).map(page=>({
  file:page.file,
  ok:Boolean(page.ok),
  readFailed:pageReadFailed(page),
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
 const unconfirmed=[];
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
   if(!currKeys.has(key))unconfirmed.push(unconfirmedEntry(file,key,currPage));
  }
 }

 for(const file of baseMap.keys()){
  if(!currMap.has(file)){
   removedPages.push(file);
   for(const key of baseMap.get(file).findingKeys)unconfirmed.push(unconfirmedEntry(file,key,null));
  }
 }

 return {
  ok:false,
  verificationComplete:false,
  noObservedRegressions:regressions.length===0,
  outcome:regressions.length?'regressed':'unconfirmed',
  coverage:{state:'unknown',engine:'unknown',ruleExecution:'unknown',scope:'Supplied file and finding inventories only. Missing findings do not prove a rule ran successfully, files were read, or an issue was fixed.'},
  baselineSha256:baseSnapshot.snapshotSha256,
  currentSha256:currSnapshot.snapshotSha256,
  summary:{
   regressions:regressions.length,
   resolved:resolved.length,
   disappeared:unconfirmed.length,
   unconfirmed:unconfirmed.length,
   unchanged:unchanged.length,
   addedPages:addedPages.length,
   removedPages:removedPages.length
  },
  regressions,
  resolved,
  disappeared:unconfirmed,
  unconfirmed,
  unchanged,
  addedPages,
  removedPages
 };
}
