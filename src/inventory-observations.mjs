/*!
 * Houtini SEO Audit functional adaptation: duplicate grouping and supplied
 * canonical-target lookup from src/audit/checks.ts and checks-hreflang.ts,
 * commit ff75890fb5c9c39f3c52f8abf99cc2b4a531740d. Apache-2.0.
 * Upstream notices: Copyright 2024 Houtini Ltd; Copyright (c) 2026
 * Richard Baxter / Houtini. See vendor/houtini/LICENSE and
 * vendor/houtini/INVENTORY-PROVENANCE.txt.
 * Changes: bounded array adapter instead of SQL, explicit unknown coverage,
 * locale partitions, exact serialized URLs, grouped evidence and no forecasts.
 */
export const INVENTORY_OBSERVATION_LIMITS=Object.freeze({pages:1000,findings:1000,relatedRecords:5});
const bodyIncomplete=metadata=>[204,205,206].includes(metadata?.httpStatus);
const knownCount=value=>Number.isSafeInteger(value)&&value>=0&&value<=20000;
const owns=(object,key)=>Boolean(object)&&Object.hasOwn(object,key);
const normalize=value=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
function exactUrl(value,base){try{const url=new URL(value,base);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;return url.href;}catch{return null;}}
function noindex(value){return typeof value==='string'?value.toLowerCase().split(/[\s,]+/).some(token=>token==='noindex'||token==='none'):null;}

export function observeInventoryMetadata(inputPages){
 if(!Array.isArray(inputPages)||inputPages.length<1||inputPages.length>INVENTORY_OBSERVATION_LIMITS.pages)throw Error('INVENTORY_METADATA_LIMIT');
 const pages=inputPages.map(page=>({page,url:exactUrl(page.resolutionBase||page.url),metadata:page.metadata||{}}));
 const sourceUrls=new Map(pages.map(item=>[item.page.url,item.url]));
 const byUrl=new Map(pages.filter(page=>page.url).map(page=>[page.url,page]));
 const findings=[],issueCodes=new Map(inputPages.map(page=>[page.url,new Set()])),groups=[],cycles=[],metadata=new Map(),edges=new Map();
 const coverage={pages:pages.length,metadataProvidedPages:pages.filter(p=>p.page.metadata!==undefined).length,titlesCompared:0,h1Compared:0,descriptionsCompared:0,htmlFactsProvidedPages:0,htmlFactsNotProcessedPages:0,titlePresenceKnownPages:0,descriptionKnownPages:0,h1CountKnownPages:0,canonicalCountKnownPages:0,canonicalProvidedPages:0,canonicalEmptyPages:0,canonicalUnknownPages:0,httpStatusKnownPages:0,robotsMetaKnownPages:0,canonicalTargetsOutsideInventory:0,canonicalTargetStatusUnknown:0,canonicalTargetRobotsUnknown:0};
 let findingCount=0;
 const add=(records,code,message,extra={},severity='warning')=>{
  const unique=[...new Set(records)].sort();for(const record of unique)issueCodes.get(record)?.add(code);findingCount++;
  if(findings.length>=INVENTORY_OBSERVATION_LIMITS.findings)return;
  findings.push({code,severity,priority:severity==='info'?4:2,record:unique[0],sourceUrl:unique.length===1?sourceUrls.get(unique[0])??null:null,message,observation:message,why:'This is an observation from the supplied inventory, not a ranking or Google-selected canonical diagnosis.',suggestion:'Inspect the source metadata and intended page relationships before changing content.',verifyHint:'Repeat the export with the same scope after an intentional change.',evidenceSource:'supplied-inventory',affectedCount:unique.length,relatedRecords:unique.slice(0,INVENTORY_OBSERVATION_LIMITS.relatedRecords),relatedRecordsTruncated:unique.length>INVENTORY_OBSERVATION_LIMITS.relatedRecords,...extra});
 };
 for(const field of ['title','h1','description']){
  const buckets=new Map();
  for(const item of pages){
   if(bodyIncomplete(item.metadata))continue;
   const value=field==='description'?(item.metadata.htmlFacts?.status==='observed'?item.metadata.htmlFacts.description:null):item.page[field];if(typeof value!=='string'||!value.trim())continue;
   coverage[field==='title'?'titlesCompared':field==='h1'?'h1Compared':'descriptionsCompared']++;
   const locale=item.page.locale?.trim().toLowerCase()||null,key=JSON.stringify([locale,normalize(value)]);
   if(!buckets.has(key))buckets.set(key,{locale,value:normalize(value),records:[]});buckets.get(key).records.push(item.page.url);
  }
  for(const group of buckets.values())if(group.records.length>1){
   group.records.sort();groups.push({field,...group});
   add(group.records,field==='title'?'inventory-duplicate-title':field==='h1'?'inventory-duplicate-h1':'inventory-duplicate-description',`${group.records.length} supplied pages share the same normalized ${field==='title'?'title':field==='h1'?'H1':'description'} in locale partition ${group.locale||'unknown'}.`,{snippet:group.value.slice(0,240),locale:group.locale,...(field==='description'?{upstreamRule:'duplicate-meta-description'}:{}),why:'Repeated supplied values may be intentional. Text equality does not prove cannibalization, duplicate content or a search penalty.'},'info');
  }
 }
 for(const item of pages){
  const {page,url}=item,m=item.metadata,canonicalKnown=!bodyIncomplete(m)&&owns(m,'canonical')&&typeof m.canonical==='string',statusKnown=typeof m.httpStatus==='number',robotsKnown=!bodyIncomplete(m)&&typeof m.robotsMeta==='string';
  if(statusKnown)coverage.httpStatusKnownPages++;if(robotsKnown)coverage.robotsMetaKnownPages++;
  const observation={sourceUrl:url,canonicalState:canonicalKnown?'absent':'unknown',canonicalUrl:null,httpStatus:statusKnown?m.httpStatus:null,robotsNoindex:robotsKnown?noindex(m.robotsMeta):null,observedAt:m.observedAt??null,source:m.source||'supplied',...(typeof m.internalLinksObserved==='boolean'?{internalLinksObserved:m.internalLinksObserved}:{}),...(typeof m.externalLinksObserved==='boolean'?{externalLinksObserved:m.externalLinksObserved}:{}),...(!bodyIncomplete(m)&&typeof page.h1==='string'&&page.h1.trim()?{comparedH1:page.h1}:{}),comparisonKnown:{title:!bodyIncomplete(m)&&typeof page.title==='string'&&Boolean(page.title.trim()),h1:!bodyIncomplete(m)&&typeof page.h1==='string'&&Boolean(page.h1.trim()),description:!bodyIncomplete(m)&&m.htmlFacts?.status==='observed'&&typeof m.htmlFacts.description==='string'&&Boolean(m.htmlFacts.description.trim())}};
  if(m.htmlFacts){
   coverage.htmlFactsProvidedPages++;
   if(bodyIncomplete(m)||m.htmlFacts.status!=='observed'){coverage.htmlFactsNotProcessedPages++;observation.htmlFacts={status:'not-processed',reason:bodyIncomplete(m)?'incomplete-response':m.htmlFacts.reason};}
   else{
    const facts=m.htmlFacts;observation.htmlFacts={status:'observed',titlePresent:typeof facts.titlePresent==='boolean'?facts.titlePresent:null,description:typeof facts.description==='string'?facts.description:null,h1Count:knownCount(facts.h1Count)?facts.h1Count:null,canonicalCount:knownCount(facts.canonicalCount)?facts.canonicalCount:null};
    if(typeof facts.titlePresent==='boolean')coverage.titlePresenceKnownPages++;
    if(typeof facts.description==='string')coverage.descriptionKnownPages++;
    if(knownCount(facts.h1Count))coverage.h1CountKnownPages++;
    if(knownCount(facts.canonicalCount))coverage.canonicalCountKnownPages++;
    if(facts.titlePresent===false)add([page.url],'inventory-title-absent','The first HTML title element is absent or blank in supplied static-HTML facts.',{upstreamRule:'missing-title',why:'Only the first HTML title element is considered; SVG title tooltips are excluded. This is not a ranking prediction or a check of search-engine title rewriting.',suggestion:'Inspect the document title and add an accurate title where appropriate for this page.',verifyHint:'Repeat the same static-HTML capture and compare metadata.htmlFacts.titlePresent.'});
    if(typeof facts.description==='string'&&!facts.description.trim())add([page.url],'inventory-description-absent','Supplied static-HTML facts record no nonempty meta description.',{upstreamRule:'missing-meta-description',why:'A description is optional and search engines may choose other snippet text. No snippet or ranking effect was measured.',suggestion:'Review whether a page-specific description would help communicate the page purpose. Do not add filler or a fixed length target.',verifyHint:'Repeat the same capture and compare metadata.htmlFacts.description.'},'info');
    if(knownCount(facts.h1Count)&&facts.h1Count!==1)add([page.url],'inventory-h1-count-review',`Supplied static-HTML facts record ${facts.h1Count} H1 elements.`,{upstreamRule:facts.h1Count===0?'missing-h1':'multiple-h1',observedCount:facts.h1Count,why:'This is a heading-structure review prompt. Multiple H1 elements are not treated as an SEO violation or proof of a search penalty.',suggestion:'Review visible heading roles and the page purpose. Keep multiple H1 elements if that structure is intentional; no automatic rewrite is proposed.',verifyHint:'Repeat the same capture and compare metadata.htmlFacts.h1Count together with the intended page structure.'},'info');
    if(knownCount(facts.canonicalCount)&&facts.canonicalCount>1)add([page.url],'inventory-multiple-canonicals',`Supplied static-HTML facts record ${facts.canonicalCount} canonical link elements.`,{upstreamRule:'multiple-canonical',observedCount:facts.canonicalCount,why:'The count includes repeated identical declarations. It does not establish which URL a search engine selects.',suggestion:'Inspect all canonical elements and their values before deciding which declaration the template should emit.',verifyHint:'Repeat the same capture and compare metadata.htmlFacts.canonicalCount and the source canonical elements.'});
   }
  }
  metadata.set(page.url,observation);
  if(!canonicalKnown){coverage.canonicalUnknownPages++;continue;}
  coverage.canonicalProvidedPages++;
  if(!m.canonical.trim()){coverage.canonicalEmptyPages++;continue;}
  const target=exactUrl(m.canonical.trim(),url||undefined);
  if(!url||!target){observation.canonicalState='invalid';add([page.url],'inventory-invalid-canonical','A supplied canonical value is not a supported HTTP(S) URL without credentials.',{why:'The value could not be safely resolved. Its raw contents are not copied into this finding.'});continue;}
  observation.canonicalState=target===url?'self':'non-self';observation.canonicalUrl=target;edges.set(url,target);
 }
 const outside=new Map();
 for(const item of pages){
  const {page,url}=item,target=edges.get(url);if(!target||target===url)continue;
  const destination=byUrl.get(target);
  if(!destination){if(!outside.has(target))outside.set(target,[]);outside.get(target).push(page.url);coverage.canonicalTargetsOutsideInventory++;coverage.canonicalTargetStatusUnknown++;coverage.canonicalTargetRobotsUnknown++;continue;}
  const targetMeta=metadata.get(destination.page.url);
  if(targetMeta.httpStatus===null)coverage.canonicalTargetStatusUnknown++;
  else if(targetMeta.httpStatus>=400)add([page.url],'inventory-canonical-target-http-error',`The supplied canonical target has an observed HTTP ${targetMeta.httpStatus} value.`,{target,observedStatus:targetMeta.httpStatus,observedAt:targetMeta.observedAt,why:'Only the supplied response status is known. It may be transient; the tool did not request this URL and does not establish indexation.'});
  if(targetMeta.robotsNoindex===null)coverage.canonicalTargetRobotsUnknown++;
  else if(targetMeta.robotsNoindex)add([page.url],'inventory-canonical-target-noindex','The supplied canonical target has a supplied meta robots noindex/none observation.',{target,observedAt:targetMeta.observedAt,why:'This combines two supplied observations. Missing robots data is unknown; X-Robots-Tag and Google indexing are not checked.'});
 }
 for(const [target,records]of outside)add(records,'inventory-canonical-target-outside',`${records.length} supplied canonical declaration(s) point outside the supplied inventory.`,{target,why:'The target response and indexing directives are unknown. External canonicals can be intentional; an absent inventory URL is not a confirmed HTTP error.'},'info');
 const visited=new Set(),cycleMembers=new Set();
 for(const start of byUrl.keys()){
  if(visited.has(start))continue;
  const local=new Map(),path=[];let current=start;
  while(byUrl.has(current)&&edges.has(current)&&!visited.has(current)){
   if(local.has(current)){
    const members=path.slice(local.get(current));
    if(members.length>1){const records=members.map(url=>byUrl.get(url).page.url).sort();cycles.push({records,declaredUrls:members});for(const url of members)cycleMembers.add(url);add(records,'inventory-canonical-cycle',`${members.length} supplied pages form a cycle of non-self canonical declarations.`,{why:'This is a cycle of declared canonical URLs, not a redirect loop or proof of the canonical selected by a search engine.'});}
    break;
   }
   local.set(current,path.length);path.push(current);const next=edges.get(current);if(next===current)break;current=next;
  }
  for(const url of path)visited.add(url);
 }
 let chainSources=0;
 for(const item of pages){const start=item.url,middle=edges.get(start),end=edges.get(middle);if(!start||!middle||!end||middle===start||end===middle||cycleMembers.has(start))continue;chainSources++;add([item.page.url],'inventory-canonical-chain','At least two supplied non-self canonical declarations form a chain.',{target:middle,declaredPath:[start,middle,end],why:'The path contains supplied declarations only. A missing endpoint remains unchecked; no HTTP redirects or Google-selected canonical were observed.'});}
 return {findings,findingCount,findingsTruncated:findingCount>findings.length,groups,cycles,metadata,issueCodes,coverage,summary:{duplicateTitleGroups:groups.filter(g=>g.field==='title').length,duplicateH1Groups:groups.filter(g=>g.field==='h1').length,duplicateDescriptionGroups:groups.filter(g=>g.field==='description').length,canonicalCycleGroups:cycles.length,canonicalChainSources:chainSources},scope:{method:'NFKC, whitespace and deterministic case grouping within explicit locale partitions; unknown locale is a separate partition. Canonical relationships use exact WHATWG-serialized URLs with query, fragment and scheme retained; no forced HTTPS or slash folding.',source:'Optional supplied metadata, not live HTTP requests or independent provenance verification.',htmlFacts:'Only explicit observed values are checked. Missing, null, ambiguous, budget-limited or HTTP204/205/206 body-derived facts remain unknown; empty stored title/H1 strings are not evidence of absence.',limits:INVENTORY_OBSERVATION_LIMITS}};
}
