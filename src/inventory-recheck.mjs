const codes=new Set(['inventory-duplicate-title','inventory-duplicate-h1','inventory-invalid-canonical','inventory-canonical-target-outside','inventory-canonical-target-http-error','inventory-canonical-target-noindex','inventory-canonical-chain','inventory-canonical-cycle','inventory-title-absent','inventory-description-absent','inventory-h1-count-review','inventory-multiple-canonicals','inventory-duplicate-description']);
export const isInventoryFinding=finding=>codes.has(finding?.code);
const bodyIncomplete=page=>{const meta=page?.metadataObservations,status=meta?.httpStatus;if(meta?.htmlFacts?.status==='not-processed'&&['unsupported-document-type','incomplete-response','body-not-observed'].includes(meta.htmlFacts.reason))return true;return status!==null&&status!==undefined&&(!Number.isInteger(status)||status<100||status>599||[204,205,206].includes(status));};
export const hasIncompleteLinkEvidence=report=>Array.isArray(report?.pages)&&(report.pages.length>1000||report.pages.some(page=>bodyIncomplete(page)||page.metadataObservations?.internalLinksObserved===false));
const safeUrl=value=>{if(typeof value!=='string'||value.length>2048)return false;try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{return false;}};
const knownCanonical=page=>{if(bodyIncomplete(page))return false;const meta=page?.metadataObservations;if(!safeUrl(meta?.sourceUrl))return false;if(meta.canonicalState==='absent')return meta.canonicalUrl===null;if(!safeUrl(meta.canonicalUrl))return false;return meta.canonicalState==='self'?meta.canonicalUrl===meta.sourceUrl:meta.canonicalState==='non-self'&&meta.canonicalUrl!==meta.sourceUrl;};
const localeOf=page=>page?.locale?.trim().toLowerCase()||null;
const factsOf=page=>!bodyIncomplete(page)&&page?.metadataObservations?.htmlFacts?.status==='observed'?page.metadataObservations.htmlFacts:null;
const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=20000;
const normalized=value=>typeof value==='string'&&value.length<=1000&&value.trim()?value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase():null;
const comparedValue=(page,field)=>bodyIncomplete(page)?null:normalized(field==='title'?page.title:field==='h1'?page.metadataObservations?.comparedH1:factsOf(page)?.description);

/** Confirm supplied rule conditions only, never missing evidence or source authenticity. */
export function createInventoryRecheck(before,after){
 const complete=report=>Array.isArray(report.pages)&&report.pages.length>0&&report.pages.length<=1000&&report.summary?.pages===report.pages.length&&report.inventoryObservations?.coverage?.pages===report.pages.length&&!report.inventoryObservations.findingsTruncated&&!(report.inventoryObservations.findingsReturned<report.inventoryObservations.findingCount);
 if(!complete(before)||!complete(after))return ()=>false;
 const baselineRows=new Map(before.pages.map(page=>[page.url,page])),rows=new Map(after.pages.map(page=>[page.url,page])),sources=new Map(after.pages.filter(page=>page.metadataObservations?.sourceUrl).map(page=>[page.metadataObservations.sourceUrl,page]));
 if(baselineRows.size!==before.pages.length||rows.size!==after.pages.length||sources.size!==after.pages.length)return ()=>false;
 const beforeGroups=before.inventoryObservations.groups,afterGroups=after.inventoryObservations.groups;
 const validGroups=groups=>Array.isArray(groups)&&groups.length<=1500&&groups.every(group=>Array.isArray(group.records)&&group.records.length>=2&&group.records.length<=1000&&group.records.every(record=>typeof record==='string'))&&groups.reduce((sum,group)=>sum+group.records.length,0)<=3000;
 const groupCoverage=(report,field)=>{const groups=report.inventoryObservations.groups,key=field==='title'?'duplicateTitleGroups':field==='h1'?'duplicateH1Groups':'duplicateDescriptionGroups';return validGroups(groups)&&report.inventoryObservations.summary?.[key]===groups.filter(group=>group.field===field).length;};
 const groupRecords=(groups,finding,field)=>{if(!validGroups(groups))return null;const group=groups.find(group=>group.field===field&&group.records.includes(finding.record));if(!group||group.records.length!==finding.affectedCount)return null;return group;};
 function terminatesKnown(url){
  const seen=new Set();
  for(let i=0;i<=after.pages.length;i++){
   if(seen.has(url))return false;seen.add(url);const page=sources.get(url),meta=page?.metadataObservations;if(!knownCanonical(page))return false;
   if(meta.canonicalState==='absent'||meta.canonicalState==='self')return true;
   if(typeof meta.canonicalUrl!=='string')return false;url=meta.canonicalUrl;
  }
  return false;
 }
 function canonicalTarget(page){const meta=page?.metadataObservations;return meta?.canonicalState==='non-self'&&typeof meta.canonicalUrl==='string'?sources.get(meta.canonicalUrl):null;}
 function noNonself(page){return knownCanonical(page)&&page.metadataObservations.canonicalState!=='non-self';}
 return finding=>{
  const page=rows.get(finding.record),facts=factsOf(page),baselineFacts=factsOf(baselineRows.get(finding.record));
  if(finding.code==='inventory-title-absent')return baselineFacts?.titlePresent===false&&facts?.titlePresent===true;
  if(finding.code==='inventory-description-absent')return typeof baselineFacts?.description==='string'&&baselineFacts.description.length<=1000&&!baselineFacts.description.trim()&&typeof facts?.description==='string'&&facts.description.length<=1000&&facts.description.trim()!=='';
  if(finding.code==='inventory-h1-count-review')return count(baselineFacts?.h1Count)&&(baselineFacts.h1Count===0||baselineFacts.h1Count>1)&&facts?.h1Count===1;
  if(finding.code==='inventory-multiple-canonicals')return count(baselineFacts?.canonicalCount)&&baselineFacts.canonicalCount>1&&count(facts?.canonicalCount)&&facts.canonicalCount<=1;
  if(['inventory-duplicate-title','inventory-duplicate-h1','inventory-duplicate-description'].includes(finding.code)){
   const field=finding.code==='inventory-duplicate-title'?'title':finding.code==='inventory-duplicate-h1'?'h1':'description',group=groupRecords(beforeGroups,finding,field);
   if(!group||!groupCoverage(before,field)||!groupCoverage(after,field)||!group.records.every(record=>rows.has(record)))return false;
   if(new Set(group.records).size!==group.records.length)return false;
   const baselineValues=group.records.map(record=>{const page=baselineRows.get(record);return page&&localeOf(page)===(group.locale??null)?comparedValue(page,field):null;});
   if(baselineValues.some(value=>value===null||value!==baselineValues[0])||group.value!==baselineValues[0])return false;
   const partition=after.pages.filter(page=>localeOf(page)===(group.locale??null));
   if(!partition.length||partition.some(page=>page.metadataObservations?.comparisonKnown?.[field]!==true))return false;
   const values=partition.map(page=>({record:page.url,value:comparedValue(page,field)}));if(values.some(item=>item.value===null))return false;
   const frequencies=new Map();for(const item of values)frequencies.set(item.value,(frequencies.get(item.value)||0)+1);
   if(values.some(item=>group.records.includes(item.record)&&frequencies.get(item.value)>1))return false;
   return !afterGroups.some(current=>current.field===field&&current.records.some(record=>group.records.includes(record)));
  }
  if(finding.code==='inventory-invalid-canonical')return knownCanonical(page);
  if(finding.code==='inventory-canonical-target-outside'){
   const original=before.pages.filter(page=>page.metadataObservations?.canonicalState==='non-self'&&page.metadataObservations.canonicalUrl===finding.target);
   if(!original.length||original.length!==finding.affectedCount)return false;
   return original.every(old=>{const current=rows.get(old.url);return noNonself(current)||knownCanonical(current)&&Boolean(canonicalTarget(current));});
  }
  if(finding.code==='inventory-canonical-target-http-error'){
   if(noNonself(page))return true;if(!knownCanonical(page))return false;const status=canonicalTarget(page)?.metadataObservations?.httpStatus;
   return Number.isSafeInteger(status)&&status>=200&&status<400;
  }
  if(finding.code==='inventory-canonical-target-noindex')return noNonself(page)||knownCanonical(page)&&!bodyIncomplete(canonicalTarget(page))&&canonicalTarget(page)?.metadataObservations?.robotsNoindex===false;
  if(finding.code==='inventory-canonical-chain'){
   if(noNonself(page))return true;if(!knownCanonical(page))return false;return noNonself(canonicalTarget(page));
  }
  if(finding.code==='inventory-canonical-cycle'){
   const cycles=before.inventoryObservations.canonicalCycles;if(!Array.isArray(cycles)||cycles.length>500||cycles.length!==before.inventoryObservations.summary?.canonicalCycleGroups||cycles.some(cycle=>!Array.isArray(cycle.records)||cycle.records.length<2||cycle.records.length>1000)||cycles.reduce((sum,cycle)=>sum+cycle.records.length,0)>1000)return false;
   const cycle=cycles.find(cycle=>Array.isArray(cycle.records)&&cycle.records.includes(finding.record));
   if(!cycle||cycle.records.length!==finding.affectedCount)return false;
   return cycle.records.every(record=>{const current=rows.get(record);return current?.metadataObservations?.sourceUrl&&terminatesKnown(current.metadataObservations.sourceUrl);});
  }
  return false;
 };
}
