import test from 'node:test';
import assert from 'node:assert/strict';
import {auditBlog,blogSchema} from '../src/blog-graph.mjs';
import {exportReportCsv} from '../src/csv-export.mjs';
const page=(path,metadata,extra={})=>({url:'https://example.org'+path,title:path,kind:'other',textScope:'unknown',text:'',links:[],...(metadata?{metadata}:{}),...extra});
const inventory=pages=>({schemaVersion:1,siteUrl:'https://example.org/',evidenceScope:'metadata-only',coverage:'Saved partial sample:2completed; content and links omitted.',pages});
const assertNoLinks=report=>{
 for(const key of ['articles','internalLinkOccurrences','resolvedInternalLinkOccurrences','distinctInternalEdges','externalLinkOccurrences','externalDomains','noObservedIncoming','unresolvedTargets','clusters'])assert.equal(report.summary[key],null,key);
 for(const p of report.pages)for(const key of ['incomingPages','outgoingInternalTargets','externalTargets','unresolvedTargets','queryOccurrences','titleMatchesH1'])assert.equal(p[key],null,key);
 for(const key of ['edges','unresolvedTargets','clusters','recommendations'])assert.deepEqual(report[key],[]);
 assert(report.findings.every(f=>f.code.startsWith('inventory-')));assert.equal(report.findings.some(f=>/no-observed|orphan|link-url/.test(f.code)),false);
};
test('metadata-only pipeline observes supplied canonical cycle and no graph phases or metrics',()=>{
 const phases=[],report=auditBlog(inventory([page('/a',{canonical:'/b',httpStatus:200}),page('/b',{canonical:'/a',httpStatus:200})]),phase=>phases.push(phase));
 assert.deepEqual(phases,['validate','metadata','report']);assertNoLinks(report);assert.equal(report.kind,'blog-graph');assert.equal(report.scope.evidenceScope,'metadata-only');assert.equal(report.inventoryObservations.summary.canonicalCycleGroups,1);assert.equal(report.metadataSummary.canonicalCycleGroups,1);assert.equal(report.coverage.httpStatusKnownPages,2);assert.equal(report.findings.filter(f=>f.code==='inventory-canonical-cycle').length,1);
});
test('failed or truncated fields omitted from saved rows remain unknown, not empty observations',()=>{
 const report=auditBlog(inventory([page('/failed',undefined,{title:''}),page('/truncated',undefined,{title:''})]));assertNoLinks(report);assert.equal(report.coverage.titlesCompared,0);assert.equal(report.coverage.h1Compared,0);assert.equal(report.coverage.canonicalUnknownPages,2);assert.equal(report.coverage.httpStatusKnownPages,0);assert.equal(report.coverage.robotsMetaKnownPages,0);assert.deepEqual(report.findings,[]);
 for(const p of report.pages){assert.equal(p.metadataObservations.httpStatus,null);assert.equal(p.metadataObservations.robotsNoindex,null);assert.equal(p.metadataObservations.canonicalState,'unknown');}
});
test('metadata-only ignores supplied links/text for graph recommendations and keeps sample coverage',()=>{
 const input=inventory([page('/a',{}, {kind:'article',title:'A relevant article',text:'Long content for matching topics',cluster:'topic',links:[{href:'/b',anchor:'B'},{href:'invalid://bad'}]}),page('/b',{}, {kind:'article',title:'A relevant article',text:'Long content for matching topics',cluster:'topic'})]);
 const report=auditBlog(input);assertNoLinks(report);assert.equal(report.scope.coverage,input.coverage);assert(report.findings.some(f=>f.code==='inventory-duplicate-title'));assert(report.limits.some(value=>value.includes('saved sample')));
});
test('metadata-only exact URL identity preserves slash/query variants and prevents borrowing status',()=>{
 const report=auditBlog(inventory([page('/source',{canonical:'/target/'}),page('/target',{httpStatus:404}),page('/target/',{httpStatus:200}),page('/target/?v=2',{httpStatus:500})]));assertNoLinks(report);assert.equal(report.pages.length,4);assert.equal(report.findings.some(f=>f.code==='inventory-canonical-target-http-error'),false);assert.equal(report.pages[0].metadataObservations.canonicalUrl,'https://example.org/target/');
});
test('metadata-only rejects exact duplicates, credentials and other origins',()=>{
 assert.throws(()=>auditBlog(inventory([page('/a'),page('/a')])));
 for(const url of ['https://other.example/a','https://user:private@example.org/a'])assert.throws(()=>auditBlog(inventory([{...page('/a'),url}])));
});
test('urls-only remains a shortcut without metadata coverage or graph findings',()=>{
 const input=inventory([page('/a',{canonical:'/b'}),page('/b',{canonical:'/a'})]);input.evidenceScope='urls-only';const phases=[],report=auditBlog(input,phase=>phases.push(phase));assert.deepEqual(phases,['validate']);assert.equal(report.inventoryObservations,undefined);assert.deepEqual(report.findings,[]);assert.equal(report.summary.distinctInternalEdges,null);
});
test('existing stored-links mode still reports actual counts, metadata-only CSV leaves unknown counts blank',()=>{
 const input=inventory([page('/a',{canonical:'/b',httpStatus:200}),page('/b',{canonical:'/a',httpStatus:200})]),metadata=auditBlog(input),csv=exportReportCsv({report:metadata,kind:'pages'}).csv;
 assert(csv.includes('inventory-canonical-cycle'));assert(csv.includes('incoming_pages'));assert(csv.includes('"/a";"";"";"";'));
 const stored=auditBlog({...input,evidenceScope:'stored-links'});assert.equal(stored.summary.distinctInternalEdges,0);assert.equal(stored.summary.unresolvedTargets,0);
 assert.equal(blogSchema.safeParse(input).success,true);
});
