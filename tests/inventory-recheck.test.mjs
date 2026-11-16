import test from 'node:test';
import assert from 'node:assert/strict';
import {auditBlog} from '../src/blog-graph.mjs';
import {compareReports} from '../src/history.mjs';
import {crawlToBlogInventory} from '../src/crawl-inventory.mjs';
const page=(p,metadata={},extra={})=>({url:'https://example.org'+p,title:p,kind:'other',locale:'en',links:[],metadata,...extra});
const input=pages=>({schemaVersion:1,siteUrl:'https://example.org/',evidenceScope:'metadata-only',coverage:'Same synthetic supplied sample.',pages});
const report=pages=>auditBlog(input(pages));
const facts=values=>({htmlFacts:{status:'observed',...values}});
const check=(before,after,code,state)=>{const delta=compareReports(before,after);assert(delta[state].some(f=>f.code===code),JSON.stringify({code,state,delta}));if(state==='unverified')assert.equal(delta.resolved.some(f=>f.code===code),false);return delta;};

for(const [code,oldValue,newValue]of [['inventory-title-absent',{titlePresent:false},{titlePresent:true}],['inventory-description-absent',{description:''},{description:'Useful description'}],['inventory-h1-count-review',{h1Count:2},{h1Count:1}],['inventory-multiple-canonicals',{canonicalCount:2},{canonicalCount:1}]])test(code+' requires explicit positive repeat evidence, never omitted or failed facts',()=>{
 const before=report([page('/a',facts(oldValue))]);check(before,report([page('/a',facts(newValue))]),code,'resolved');for(const metadata of [{},{htmlFacts:{status:'not-processed',reason:'complexity-limit'}},facts({})])check(before,report([page('/a',metadata)]),code,'unverified');
});
for(const field of ['title','h1','description'])test('duplicate '+field+' resolution requires the complete known locale partition and no intersecting group',()=>{
 const make=(p,value)=>field==='description'?page(p,facts({description:value})):page(p,{}, {[field]:value});
 const code='inventory-duplicate-'+field,before=report([make('/a','Shared'),make('/b','Shared'),make('/c','Shared')]);
 check(before,report([make('/a','A'),make('/b','B'),make('/c','C')]),code,'resolved');
 check(before,report([make('/a','A'),make('/b','B'),make('/c','')]),code,'unverified');
 check(before,report([make('/a','A'),make('/b','Shared'),make('/c','Shared')]),code,'unverified');
 const changedLocale=report([make('/a','A'),{...make('/b','B'),locale:'ru'},make('/c','C')]);const delta=check(before,changedLocale,code,'unverified');assert(delta.scopeChanged);
 const truncated=structuredClone(before);truncated.inventoryObservations.groups[0].records.pop();check(truncated,report([make('/a','A'),make('/b','B'),make('/c','C')]),code,'unverified');
});
test('new intersecting duplicate group with a different first record does not claim old members fixed',()=>{
 const make=(p,value)=>page(p,facts({description:value}));const before=report([make('/z-a','Shared'),make('/z-b','Shared'),make('/a-new','Other')]),after=report([make('/z-a','New group'),make('/z-b','Unique'),make('/a-new','New group')]);check(before,after,'inventory-duplicate-description','unverified');
});
test('invalid canonical needs a known valid or explicitly absent replacement',()=>{
 const before=report([page('/a',{canonical:'javascript:private'})]);check(before,report([page('/a',{canonical:''})]),'inventory-invalid-canonical','resolved');check(before,report([page('/a',{})]),'inventory-invalid-canonical','unverified');
});
test('outside canonical group is not resolved when one original member still points outside or is unknown',()=>{
 const before=report([page('/a',{canonical:'/outside'}),page('/b',{canonical:'/outside'})]);check(before,report([page('/a',{canonical:'/a'}),page('/b',{canonical:'/b'})]),'inventory-canonical-target-outside','resolved');check(before,report([page('/a',{canonical:'/a'}),page('/b',{canonical:'/outside'})]),'inventory-canonical-target-outside','unverified');check(before,report([page('/a',{canonical:'/a'}),page('/b',{})]),'inventory-canonical-target-outside','unverified');
});
test('canonical target HTTP status disappearance is unknown; positive observed replacement can resolve',()=>{
 const before=report([page('/a',{canonical:'/b'}),page('/b',{canonical:'/b',httpStatus:404})]);check(before,report([page('/a',{canonical:'/b'}),page('/b',{canonical:'/b',httpStatus:200})]),'inventory-canonical-target-http-error','resolved');check(before,report([page('/a',{canonical:'/b'}),page('/b',{canonical:'/b'})]),'inventory-canonical-target-http-error','unverified');check(before,report([page('/a',{canonical:'/b'}),page('/b',{canonical:'/b',httpStatus:100})]),'inventory-canonical-target-http-error','unverified');
});
test('canonical target noindex needs known false rather than missing robots data',()=>{
 const before=report([page('/a',{canonical:'/b'}),page('/b',{canonical:'/b',robotsMeta:'noindex'})]);for(const robotsMeta of ['index',''])check(before,report([page('/a',{canonical:'/b'}),page('/b',{canonical:'/b',robotsMeta})]),'inventory-canonical-target-noindex','resolved');check(before,report([page('/a',{canonical:'/b'}),page('/b',{canonical:'/b'})]),'inventory-canonical-target-noindex','unverified');
});
test('canonical chain requires known termination, not an omitted declaration or a new cycle',()=>{
 const before=report([page('/a',{canonical:'/b'}),page('/b',{canonical:'/c'}),page('/c',{canonical:'/c'})]);check(before,report([page('/a',{canonical:'/b'}),page('/b',{canonical:'/b'}),page('/c',{canonical:'/c'})]),'inventory-canonical-chain','resolved');check(before,report([page('/a',{canonical:'/b'}),page('/b',{}),page('/c',{canonical:'/c'})]),'inventory-canonical-chain','unverified');check(before,report([page('/a',{canonical:'/b'}),page('/b',{canonical:'/a'}),page('/c',{canonical:'/c'})]),'inventory-canonical-chain','unverified');
});
test('canonical cycle needs known acyclic termination for every old member',()=>{
 const before=report([page('/a',{canonical:'/b'}),page('/b',{canonical:'/a'})]);check(before,report([page('/a',{canonical:'/a'}),page('/b',{canonical:'/a'})]),'inventory-canonical-cycle','resolved');for(const replacement of [{},{canonical:'javascript:invalid'},{canonical:'/outside'}])check(before,report([page('/a',{canonical:'/a'}),page('/b',replacement)]),'inventory-canonical-cycle','unverified');
});
test('truncated reports and hidden exact-source URL changes cannot establish inventory resolution',()=>{
 const before=report([page('/a',facts({titlePresent:false}))]),after=report([page('/a',facts({titlePresent:true}))]);after.inventoryObservations.findingsTruncated=true;check(before,after,'inventory-title-absent','unverified');
 const old=auditBlog({...input([page('/a/',{canonical:'javascript:invalid'})]),evidenceScope:'stored-links'}),repeat=auditBlog({...input([page('/a',{canonical:''})]),evidenceScope:'stored-links'});assert.equal(old.pages[0].url,repeat.pages[0].url);const delta=check(old,repeat,'inventory-invalid-canonical','unverified');assert(delta.warnings.includes('inventory-scope-changed'));
});
test('a missing current duplicate group contradicted by its summary is not positive evidence',()=>{
 const make=(p,value)=>page(p,facts({description:value})),before=report([make('/a','Same'),make('/b','Same')]),after=report([make('/a','A'),make('/b','B')]);after.inventoryObservations.summary.duplicateDescriptionGroups=1;check(before,after,'inventory-duplicate-description','unverified');
});
for(const field of ['title','h1','description'])test('duplicate '+field+' cannot be cleared by deleting findings and groups while values still match',()=>{
 const make=p=>field==='description'?page(p,facts({description:'Same'})):page(p,{}, {[field]:'Same'}),before=report([make('/a'),make('/b')]),after=structuredClone(before);after.findings=[];after.inventoryObservations.groups=[];after.inventoryObservations.findingCount=0;after.inventoryObservations.findingsReturned=0;after.inventoryObservations.summary[field==='title'?'duplicateTitleGroups':field==='h1'?'duplicateH1Groups':'duplicateDescriptionGroups']=0;check(before,after,'inventory-duplicate-'+field,'unverified');
});
test('a fabricated baseline duplicate group with contradictory page values is unverified',()=>{
 const before=report([page('/a',{}, {title:'Same'}),page('/b',{}, {title:'Same'})]),after=report([page('/a',{}, {title:'A'}),page('/b',{}, {title:'B'})]);before.pages[1].title='Different';check(before,after,'inventory-duplicate-title','unverified');
});
test('partial/no-representation responses cannot falsely resolve H1 findings after a full response',()=>{
 const make=(status,html)=>auditBlog(crawlToBlogInventory({summary:{origin:'https://example.org'},pages:[{url:'https://example.org/a',status,contentType:'text/html',title:'A',h1:['First'],html}]}));const before=make(200,'<title>A</title><meta name=description content=D><h1>First</h1><h1>Second</h1>');
 for(const status of [204,205,206])check(before,make(status,'<title>A</title><meta name=description content=D><h1>First</h1>'),'inventory-h1-count-review','unverified');
 const manipulated=make(200,'<title>A</title><meta name=description content=D><h1>First</h1>');manipulated.pages[0].metadataObservations.httpStatus=206;check(before,manipulated,'inventory-h1-count-review','unverified');
});
test('known partial bodies cannot positively clear duplicate or canonical directive observations',()=>{
 const before=report([page('/a',{httpStatus:200},{title:'Same'}),page('/b',{httpStatus:200},{title:'Same'})]),after=report([page('/a',{httpStatus:206},{title:'Different A'}),page('/b',{httpStatus:206},{title:'Different B'})]);check(before,after,'inventory-duplicate-title','unverified');
 const old=report([page('/a',{canonical:'/b',httpStatus:200}),page('/b',{canonical:'/a',httpStatus:200,robotsMeta:'noindex'})]),partial=report([page('/a',{canonical:'/b',httpStatus:200}),page('/b',{canonical:'/b',httpStatus:206,robotsMeta:'index'})]);check(old,partial,'inventory-canonical-cycle','unverified');check(old,partial,'inventory-canonical-target-noindex','unverified');
});
test('an explicitly unsupported capture cannot establish positive HTML-fact or duplicate fixes',()=>{
 const before=report([page('/a',facts({titlePresent:false}))]),after=report([page('/a',{htmlFacts:{status:'not-processed',reason:'unsupported-document-type'}})]);check(before,after,'inventory-title-absent','unverified');
 const old=report([page('/a',{}, {title:'Same'}),page('/b',{}, {title:'Same'})]),unsupported=report([page('/a',{htmlFacts:{status:'not-processed',reason:'unsupported-document-type'}},{title:'A'}),page('/b',{htmlFacts:{status:'not-processed',reason:'unsupported-document-type'}},{title:'B'})]);check(old,unsupported,'inventory-duplicate-title','unverified');
});
test('unknown links on partial/no-representation donors cannot falsely resolve legacy graph findings',()=>{
 const make=(status,links)=>auditBlog(crawlToBlogInventory({summary:{origin:'https://example.org'},pages:[{url:'https://example.org/a',status,contentType:'text/html',title:'A',h1:['First'],internalLinks:links,html:'<title>A</title><meta name=description content=D><h1>First</h1>'}]})),before=make(200,[{url:'https://example.org/not-in-inventory',anchor:'Outside inventory'}]);
 assert(before.findings.some(f=>f.code==='unresolved-internal-targets'));for(const status of [204,205,206]){const delta=check(before,make(status,[]),'unresolved-internal-targets','unverified');assert.equal(delta.graphDiff,null);}
});
test('systematic producer availability separates HTML facts, internal arrays and external arrays',()=>{
 const make=({status=200,contentType='text/html',internal=[],external=[],omitInternal=false,omitExternal=false,omitMime=false,h1Count=1}={})=>{const p={url:'https://example.org/a',status,title:'A',h1:['First'],html:'<title>A</title><meta name=description content=D>'+Array.from({length:h1Count},(_,i)=>`<h1>Heading ${i}</h1>`).join('')};if(!omitMime)p.contentType=contentType;if(!omitInternal)p.internalLinks=internal;if(!omitExternal)p.externalLinks=external;return auditBlog(crawlToBlogInventory({summary:{origin:'https://example.org'},pages:[p]}));};
 const before=make({h1Count:2,internal:[{url:'https://example.org/not-in-inventory'}]});
 for(const status of [204,205,206,301,302,404,410,500,503]){const after=make({status});assert.equal(after.pages[0].metadataObservations.httpStatus,status);assert.equal(after.pages[0].metadataObservations.internalLinksObserved,false);assert.equal(after.pages[0].metadataObservations.htmlFacts.status,'not-processed');assert.equal(after.summary.distinctInternalEdges,null);check(before,after,'inventory-h1-count-review','unverified');check(before,after,'unresolved-internal-targets','unverified');}
 for(const options of [{contentType:'application/pdf'},{contentType:'text/plain'},{contentType:''},{contentType:null},{omitMime:true}]){const after=make(options);assert.equal(after.pages[0].metadataObservations.htmlFacts.reason,'body-not-observed');assert.equal(after.summary.noObservedIncoming,null);check(before,after,'inventory-h1-count-review','unverified');check(before,after,'unresolved-internal-targets','unverified');}
 const missingInternal=make({omitInternal:true});assert.equal(missingInternal.pages[0].metadataObservations.htmlFacts.status,'observed');assert.equal(missingInternal.pages[0].metadataObservations.internalLinksObserved,false);assert.equal(missingInternal.summary.distinctInternalEdges,null);assert.deepEqual(missingInternal.recommendations,[]);check(before,missingInternal,'inventory-h1-count-review','resolved');check(before,missingInternal,'unresolved-internal-targets','unverified');
 const missingExternal=make({omitExternal:true});assert.equal(missingExternal.pages[0].metadataObservations.internalLinksObserved,true);assert.equal(missingExternal.pages[0].metadataObservations.externalLinksObserved,false);assert.equal(missingExternal.summary.externalDomains,null);assert.equal(missingExternal.summary.distinctInternalEdges,0);check(before,missingExternal,'unresolved-internal-targets','resolved');
 const complete=make();assert.equal(complete.pages[0].metadataObservations.internalLinksObserved,true);assert.equal(complete.summary.distinctInternalEdges,0);check(before,complete,'unresolved-internal-targets','resolved');check(before,complete,'inventory-h1-count-review','resolved');
 const xml=make({contentType:'application/xhtml+xml'});assert.equal(xml.pages[0].metadataObservations.htmlFacts.reason,'unsupported-document-type');check(before,xml,'inventory-h1-count-review','unverified');check(before,xml,'unresolved-internal-targets','unverified');
});
