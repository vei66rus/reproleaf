import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extractHtmlMetadataFacts,HTML_METADATA_FACTS_LIMITS} from '../src/html-metadata-facts.mjs';
import {auditBlog,blogSchema} from '../src/blog-graph.mjs';
import {inventoryFromHtml} from '../src/import-html.mjs';
import {crawlToBlogInventory} from '../src/crawl-inventory.mjs';
import {exportReportCsv} from '../src/csv-export.mjs';
const example=JSON.parse(await readFile(new URL('../examples/blog-html-metadata-facts.json',import.meta.url),'utf8'));
const page=(path,metadata={},extra={})=>({url:'https://example.org'+path,title:path,kind:'other',locale:'en',links:[],metadata,...extra});
const input=pages=>({schemaVersion:1,siteUrl:'https://example.org/',evidenceScope:'metadata-only',coverage:'Synthetic saved-sample facts only.',pages});
const codes=report=>report.findings.map(f=>f.code);

test('shipped supplied-facts example exercises exactly five new observations',()=>{
 const report=auditBlog(example);assert.deepEqual(new Set(codes(report)),new Set(['inventory-title-absent','inventory-description-absent','inventory-h1-count-review','inventory-multiple-canonicals','inventory-duplicate-description']));assert.equal(report.inventoryObservations.coverage.htmlFactsProvidedPages,3);assert.equal(report.inventoryObservations.summary.duplicateDescriptionGroups,1);assert.equal(report.summary.distinctInternalEdges,null);
 for(const f of report.findings){assert(f.sourceUrl||f.affectedCount>1);assert(f.observation&&f.why&&f.suggestion&&f.verifyHint);assert(f.upstreamRule);}
});
test('local parser captures static counts without scripts, templates, resource requests or source export',()=>{
 const html='<script>fetch("https://private.example/")</script><template><title>Hidden</title><h1>Hidden</h1><link rel=canonical></template><noscript><h1>Not rendered</h1></noscript><title> </title><meta name=description content=""><h1></h1><h1>Second</h1><link rel="canonical alternate" href="/a"><link rel=canonical href="/a">';
 const facts=extractHtmlMetadataFacts(html);assert.deepEqual(facts,{status:'observed',titlePresent:false,description:'',h1Count:2,canonicalCount:2});assert(!JSON.stringify(facts).includes('private.example'));
});
test('ambiguous or over-limit descriptions stay unknown rather than absent or silently truncated',()=>{
 for(const html of ['<meta name=description content=A><meta name=description content=B>',`<meta name=description content="${'x'.repeat(1001)}">`]){const facts=extractHtmlMetadataFacts(html);assert.equal(facts.description,null);const r=auditBlog(input([page('/a',{htmlFacts:facts})]));assert.equal(codes(r).includes('inventory-description-absent'),false);assert.equal(r.inventoryObservations.coverage.descriptionKnownPages,0);}
 assert.equal(extractHtmlMetadataFacts('<meta name=description content=A><meta name=description content=A>').description,'A');
});
test('SVG title tooltips are not document titles and the first HTML title determines presence',()=>{
 const svg='<html><head></head><body><h1>Page</h1><svg><title>Logo tooltip</title></svg></body></html>';assert.equal(extractHtmlMetadataFacts(svg).titlePresent,false);
 assert.equal(extractHtmlMetadataFacts('<title> </title><title>Second title</title>').titlePresent,false);
 assert.equal(extractHtmlMetadataFacts('<title>First title</title><title> </title>').titlePresent,true);
 const imported=inventoryFromHtml([{url:'https://example.org/a',html:svg}],'https://example.org');assert.equal(imported.pages[0].title,'');
 const crawl={summary:{origin:'https://example.org'},pages:[{url:'https://example.org/a',status:200,contentType:'text/html',title:'Logo tooltip',html:svg}]};assert.equal(crawlToBlogInventory(crawl).pages[0].title,'');
});
test('byte/depth/node limits record not-processed facts with an explicit bounded reason',()=>{
 assert.deepEqual(extractHtmlMetadataFacts('x'.repeat(HTML_METADATA_FACTS_LIMITS.bytes+1)),{status:'not-processed',reason:'size-limit'});assert.deepEqual(extractHtmlMetadataFacts('<div>'.repeat(130)+'x'+'</div>'.repeat(130)),{status:'not-processed',reason:'complexity-limit'});assert.deepEqual(extractHtmlMetadataFacts('<i>'.repeat(20001)),{status:'not-processed',reason:'complexity-limit'});
});
test('empty stored strings and omitted/partial/failed facts are not evidence of missing metadata',()=>{
 const rows=[page('/old',{}, {title:'',h1:''}),page('/partial',{htmlFacts:{status:'observed',h1Count:1}},{title:'',h1:''}),page('/failed',{htmlFacts:{status:'not-processed',reason:'size-limit'}},{title:'',h1:''})],r=auditBlog(input(rows));assert.deepEqual(r.findings,[]);assert.equal(r.inventoryObservations.coverage.titlePresenceKnownPages,0);assert.equal(r.inventoryObservations.coverage.htmlFactsNotProcessedPages,1);assert.equal(r.pages[1].metadataObservations.htmlFacts.titlePresent,null);assert.equal(r.pages[2].metadataObservations.htmlFacts.reason,'size-limit');
});
test('description groups use deterministic Unicode normalization and explicit locale partitions',()=>{
 const make=(p,description,locale)=>page(p,{htmlFacts:{status:'observed',description}},{locale});const r=auditBlog(input([make('/a','  Общий   ТЕКСТ ','ru'),make('/b','Общий текст','ru'),make('/c','Общий текст','en'),make('/d','Общий текст',undefined)]));assert.equal(r.inventoryObservations.summary.duplicateDescriptionGroups,1);const finding=r.findings.find(f=>f.code==='inventory-duplicate-description');assert.equal(finding.affectedCount,2);assert.equal(finding.severity,'info');assert.equal(finding.locale,'ru');
});
test('H1 count is advisory, missing counts do not default zero and invalid facts fail schema',()=>{
 const r=auditBlog(input([page('/a',{htmlFacts:{status:'observed',h1Count:0}}),page('/b',{htmlFacts:{status:'observed',h1Count:2}}),page('/c',{htmlFacts:{status:'observed',h1Count:1}}),page('/d',{htmlFacts:{status:'observed',h1Count:null}})]));const headings=r.findings.filter(f=>f.code==='inventory-h1-count-review');assert.equal(headings.length,2);assert(headings.every(f=>f.severity==='info'));for(const invalid of [-1,1.5,20001])assert.equal(blogSchema.safeParse(input([page('/x',{htmlFacts:{status:'observed',h1Count:invalid}})])).success,false);assert.equal(blogSchema.safeParse(input([page('/x',{htmlFacts:{status:'not-processed',reason:'size-limit',h1Count:0}})])).success,false);
});
test('actual supplied HTML importer and saved Node crawl bridge populate only supported facts',()=>{
 const html='<title>Title</title><meta name=description content="Description"><h1>A</h1><h1>B</h1><link rel=canonical href=/a><link rel=canonical href=/b>';
 const imported=inventoryFromHtml([{url:'https://example.org/a',html}],'https://example.org');assert.equal(imported.pages[0].metadata.htmlFacts.h1Count,2);assert.equal(imported.pages[0].metadata.canonical,null);assert(codes(auditBlog(imported)).includes('inventory-multiple-canonicals'));
 const crawl={summary:{origin:'https://example.org'},pages:[{url:'https://example.org/a',status:200,contentType:'text/html',html,title:'Title',canonical:'/a'},{url:'https://example.org/failed',status:500,contentType:'text/html',html},{url:'https://example.org/omitted',status:200,contentType:'text/html'}]};const converted=crawlToBlogInventory(crawl);assert.equal(converted.pages[0].metadata.htmlFacts.canonicalCount,2);assert.equal(converted.pages[0].metadata.canonical,null);assert.deepEqual(converted.pages[1].metadata.htmlFacts,{status:'not-processed',reason:'body-not-observed'});assert.equal(converted.pages[2].metadata.htmlFacts,undefined);assert(!JSON.stringify(converted).includes('"html":'));
});
test('urls-only still skips all facts and legacy facts-free CSV headers remain unchanged',()=>{
 const report=auditBlog({...example,evidenceScope:'urls-only'});assert.deepEqual(report.findings,[]);assert.equal(report.inventoryObservations,undefined);const old=auditBlog(input([page('/a')])),csv=exportReportCsv({report:old,kind:'pages'}).csv;assert(!csv.includes('html_facts_status'));const current=exportReportCsv({report:auditBlog(example),kind:'pages'}).csv;assert(current.includes('observed_h1_count'));assert(current.includes('inventory-h1-count-review'));assert(current.includes('"false"'));
});
test('HTTP204/205/206 retain status but cannot supply complete-document body facts',()=>{
 for(const status of [204,205,206]){
  const converted=crawlToBlogInventory({summary:{origin:'https://example.org'},pages:[{url:'https://example.org/a',status,contentType:'text/html',title:'Partial title',h1:['Partial'],canonical:'/a',robotsMeta:'index',internalLinks:[{url:'https://example.org/b'}],html:'<title>Partial</title><h1>Only a fragment</h1>'}]});
  const p=converted.pages[0];assert.equal(p.metadata.httpStatus,status);assert.deepEqual(p.metadata.htmlFacts,{status:'not-processed',reason:'incomplete-response'});assert.equal(p.title,'');assert.equal(p.h1,undefined);assert.equal(p.metadata.canonical,undefined);assert.equal(p.metadata.robotsMeta,undefined);assert.deepEqual(p.links,[]);
  const checked=auditBlog(converted);assert.deepEqual(checked.findings,[]);assert.equal(checked.pages[0].metadataObservations.canonicalState,'unknown');assert.equal(checked.pages[0].metadataObservations.robotsNoindex,null);
 }
});
test('explicit XHTML keeps supplied observations but HTML DOM facts remain unsupported',()=>{
 const xml='<html xmlns="http://www.w3.org/1999/xhtml"><head><x:title xmlns:x="http://www.w3.org/1999/xhtml">Real XHTML title</x:title></head><body><h1>Page</h1></body></html>',converted=crawlToBlogInventory({summary:{origin:'https://example.org'},pages:[{url:'https://example.org/a',status:200,contentType:'application/xhtml+xml',title:'Supplied title',canonical:'/a',robotsMeta:'index',html:xml}]});
 assert.equal(converted.pages[0].title,'Supplied title');assert.equal(converted.pages[0].metadata.canonical,'/a');assert.deepEqual(converted.pages[0].metadata.htmlFacts,{status:'not-processed',reason:'unsupported-document-type'});const checked=auditBlog(converted);assert.equal(checked.findings.some(f=>f.code==='inventory-title-absent'),false);assert.equal(checked.inventoryObservations.coverage.titlePresenceKnownPages,0);
});
