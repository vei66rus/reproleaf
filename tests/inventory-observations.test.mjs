import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditBlog,blogSchema} from '../src/blog-graph.mjs';
import {inventoryFromHtml} from '../src/import-html.mjs';
import {observeInventoryMetadata,INVENTORY_OBSERVATION_LIMITS} from '../src/inventory-observations.mjs';
import {exportReportCsv} from '../src/csv-export.mjs';
import {startApi} from '../src/api.mjs';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const example=JSON.parse(await readFile(path.join(root,'examples/blog-metadata-inventory.json'),'utf8'));
const inventory=pages=>({schemaVersion:1,siteUrl:'https://example.org',coverage:'Synthetic supplied inventory only.',pages});
const page=(pathname,metadata={},extra={})=>({url:'https://example.org'+pathname,title:pathname,kind:'other',links:[],metadata,...extra});
const codes=report=>report.findings.filter(f=>f.code.startsWith('inventory-')).map(f=>f.code);

test('shipped coherent example exercises exactly eight inventory observations',()=>{
 const report=auditBlog(example);assert.equal(new Set(codes(report)).size,8);assert.equal(report.inventoryObservations.summary.duplicateTitleGroups,1);assert.equal(report.inventoryObservations.summary.duplicateH1Groups,1);assert.equal(report.inventoryObservations.summary.canonicalCycleGroups,1);assert.equal(report.inventoryObservations.summary.canonicalChainSources,1);assert.equal(report.inventoryObservations.coverage.httpStatusKnownPages,5);assert.equal(report.pages.length,8);
});
test('legacy inventories remain valid with explicit unknown metadata and no canonical findings',()=>{
 const input=inventory([{url:'https://example.org/a',title:'A',links:[]}]),r=auditBlog(input);assert.equal(r.inventoryObservations.coverage.metadataProvidedPages,0);assert.equal(r.inventoryObservations.coverage.canonicalUnknownPages,1);assert.equal(r.pages[0].metadataObservations.httpStatus,null);assert.equal(r.pages[0].metadataObservations.robotsNoindex,null);assert.deepEqual(codes(r),[]);
});
test('URL-only evidence never runs metadata or hyperlink diagnostics',()=>{
 const r=auditBlog({...example,evidenceScope:'urls-only'});assert.deepEqual(r.findings,[]);assert.equal(r.inventoryObservations,undefined);assert.equal(r.summary.distinctInternalEdges,null);assert.equal(r.pages[0].metadataObservations,undefined);
});
test('duplicate grouping normalizes supplied values but partitions explicit and unknown locales',()=>{
 const r=auditBlog(inventory([page('/a',{}, {title:' Ｃache   Guide ',h1:' Heading ',locale:'en-US'}),page('/b',{}, {title:'cache guide',h1:'heading',locale:'EN-us'}),page('/ru',{}, {title:'cache guide',h1:'heading',locale:'ru'}),page('/unknown',{}, {title:'cache guide',h1:'heading'})]));const groups=r.inventoryObservations.groups;assert.equal(groups.length,2);assert(groups.every(g=>g.records.length===2&&g.locale==='en-us'));assert(r.findings.filter(f=>f.code.startsWith('inventory-duplicate')).every(f=>f.severity==='info'));assert.equal(r.pages.find(p=>p.url.endsWith('/ru')).issueCodes.includes('inventory-duplicate-title'),false);
});
test('missing or blank H1/title values are not grouped as duplicate content',()=>{
 const r=auditBlog(inventory([page('/a',{}, {title:'',h1:''}),page('/b',{}, {title:' '})]));assert.deepEqual(codes(r),[]);assert.equal(r.inventoryObservations.coverage.h1Compared,0);
});
test('canonical target outside inventory is unknown info, including intentional cross-origin targets',()=>{
 const r=auditBlog(inventory([page('/a',{canonical:'https://external.example/shared?q=1'}),page('/b',{canonical:'/missing'})]));const findings=r.findings.filter(f=>f.code==='inventory-canonical-target-outside');assert.equal(findings.length,2);assert(findings.every(f=>f.severity==='info'));assert.equal(r.inventoryObservations.coverage.canonicalTargetStatusUnknown,2);assert(!codes(r).includes('inventory-canonical-target-http-error'));assert(!codes(r).includes('inventory-invalid-canonical'));
});
test('canonical target HTTP finding requires supplied numeric observed status and never infers it',()=>{
 for(const status of [undefined,null,200,301]){const r=auditBlog(inventory([page('/a',{canonical:'/b'}),page('/b',{httpStatus:status})]));assert(!codes(r).includes('inventory-canonical-target-http-error'));}
 for(const status of [404,429,500,503]){const r=auditBlog(inventory([page('/a',{canonical:'/b'}),page('/b',{httpStatus:status})]));const f=r.findings.find(f=>f.code==='inventory-canonical-target-http-error');assert.equal(f.observedStatus,status);assert.match(f.why,/transient/);}
});
test('meta noindex/none uses exact tokens; missing metadata stays unknown',()=>{
 for(const value of ['noindex','NOINDEX, follow','none']){const r=auditBlog(inventory([page('/a',{canonical:'/b'}),page('/b',{robotsMeta:value})]));assert(codes(r).includes('inventory-canonical-target-noindex'));}
 for(const value of [undefined,null,'','index','not-noindex','googlebot:noindex','indexifembedded']){const r=auditBlog(inventory([page('/a',{canonical:'/b'}),page('/b',{robotsMeta:value})]));assert(!codes(r).includes('inventory-canonical-target-noindex'));assert.equal(r.pages[1].metadataObservations.robotsNoindex,value===undefined||value===null?null:false);}
});
test('canonical schemes and queries remain distinct and a self declaration is not a loop',()=>{
 const r=auditBlog(inventory([page('/a?q=1',{canonical:'/a?q=2'}),page('/a?q=2',{canonical:'/a?q=1'}),page('/self',{canonical:'/self'}),page('/scheme',{canonical:'http://example.org/scheme'})]));assert.equal(r.inventoryObservations.summary.canonicalCycleGroups,1);assert.deepEqual(r.inventoryObservations.canonicalCycles[0].records,['https://example.org/a?q=1','https://example.org/a?q=2']);assert.equal(r.pages.find(p=>p.url.endsWith('/self')).metadataObservations.canonicalState,'self');assert.equal(r.pages.find(p=>p.url.endsWith('/scheme')).metadataObservations.canonicalUrl,'http://example.org/scheme');assert(!r.inventoryObservations.canonicalCycles[0].records.some(x=>x.endsWith('/self')));
});
test('exact metadata source URL stays visible alongside legacy graph slash normalization',()=>{
 const r=auditBlog(inventory([page('/with/',{canonical:'/with/'})]));assert.equal(r.pages[0].url,'https://example.org/with');assert.equal(r.pages[0].metadataObservations.sourceUrl,'https://example.org/with/');assert.equal(r.pages[0].metadataObservations.canonicalState,'self');assert(exportReportCsv({report:r,kind:'pages'}).csv.includes('metadata_source_url'));
});
test('a chain needs two supplied non-self declarations; missing second canonical is unconfirmed',()=>{
 let r=auditBlog(inventory([page('/a',{canonical:'/b'}),page('/b',{})]));assert(!codes(r).includes('inventory-canonical-chain'));r=auditBlog(inventory([page('/a',{canonical:'/b'}),page('/b',{canonical:'/b'})]));assert(!codes(r).includes('inventory-canonical-chain'));r=auditBlog(inventory([page('/a',{canonical:'/b'}),page('/b',{canonical:'/unknown'})]));assert.deepEqual(r.findings.find(f=>f.code==='inventory-canonical-chain').declaredPath,['https://example.org/a','https://example.org/b','https://example.org/unknown']);
});
test('canonical URL credential and executable-scheme guards do not echo invalid raw values',()=>{
 for(const value of ['javascript:alert(1)','https://secret-user:secret-password@example.org/private','https://[invalid']){const r=auditBlog(inventory([page('/a',{canonical:value})]));assert(codes(r).includes('inventory-invalid-canonical'));assert.equal(r.pages[0].metadataObservations.canonicalUrl,null);assert(!JSON.stringify(r).includes('secret-password'));assert(!JSON.stringify(r).includes('javascript:alert'));}
});
test('observations are grouped and bounded while affected page codes and exact counts survive caps',()=>{
 const pages=Array.from({length:1000},(_,i)=>page('/p'+i,{canonical:'javascript:no',robotsMeta:'none'},{title:'Same',h1:'Same',resolutionBase:'https://example.org/p'+i}));const r=observeInventoryMetadata(pages);assert.equal(r.findings.length,INVENTORY_OBSERVATION_LIMITS.findings);assert.equal(r.findingCount,1002);assert.equal(r.findingsTruncated,true);assert.equal(r.groups[0].records.length,1000);assert(r.findings.every(f=>f.relatedRecords.length<=INVENTORY_OBSERVATION_LIMITS.relatedRecords));assert.equal(r.issueCodes.get('https://example.org/p999').has('inventory-invalid-canonical'),true);
});
test('metadata schema accepts explicit unknowns but rejects invented numeric statuses and unbounded extras',()=>{
 assert(blogSchema.safeParse(inventory([page('/a',{canonical:null,httpStatus:null,robotsMeta:null})])).success);
 for(const meta of [{httpStatus:'404'},{httpStatus:99},{httpStatus:600},{robotsMeta:'x'.repeat(2001)},{canonical:'x'.repeat(2049)},{observedAt:'not-a-date'},{source:'verified-google'},{xRobotsTag:'noindex'},{unexpected:true}])assert.equal(blogSchema.safeParse(inventory([page('/a',meta)])).success,false);
});
test('static HTML exporter supplies only observed HTML canonical/robots, honors base and keeps multiple canonical unknown',()=>{
 const r=inventoryFromHtml([{url:'https://example.org/dir/page',html:'<html lang="en"><head><base href="/base/"><title>Title</title><link rel="canonical" href="target"><meta name="robots" content="noindex"></head><h1>Heading</h1></html>'},{url:'https://example.org/multiple',html:'<link rel=canonical href=/one><link rel=canonical href=/two><title>Multiple</title>'}],'https://example.org');assert.equal(r.pages[0].metadata.canonical,'https://example.org/base/target');assert.equal(r.pages[0].metadata.robotsMeta,'noindex');assert.equal(r.pages[0].metadata.httpStatus,undefined);assert.equal(r.pages[0].metadata.source,'html');assert.equal(r.pages[1].metadata.canonical,null);
});
test('nonhierarchical HTML base cannot fabricate a relative canonical target',()=>{
 const r=inventoryFromHtml([{url:'https://example.org/a',html:'<base href="javascript:void(0)"><link rel=canonical href=relative><title>A</title>'}],'https://example.org');assert.equal(r.pages[0].metadata.canonical,null);assert.equal(auditBlog(r).pages[0].metadataObservations.canonicalState,'unknown');assert.throws(()=>inventoryFromHtml([{url:'https://example.org/a',html:'<base href="http://[invalid"><title>A</title>'}],'https://example.org'));
});
test('CSV exports preserve inventory observations and spreadsheet protection; historical reports retain old columns',()=>{
 const r=auditBlog(example),csv=exportReportCsv({report:r,kind:'pages'});assert(csv.csv.includes('canonical_url'));assert(csv.csv.includes('inventory-canonical-cycle'));assert(csv.csv.includes('404'));assert(csv.csv.includes('false'));assert.equal(csv.rowCount,8);const f=exportReportCsv({report:r,kind:'findings'});assert(f.csv.includes('related_records'));assert(f.csv.includes('affected_count'));assert.equal(f.rowCount,8);const old=exportReportCsv({report:{pages:[{url:'https://example.org/',title:'=1+1'}]},kind:'pages'});assert.equal(old.csv.includes('canonical_url'),false);assert(old.csv.includes("'=1+1"));
});
const disabled={envPath:'missing-inventory-test.env',enabled:false,apiKey:'',model:'',dailyBudgetUsd:0,inputPricePerMillion:0,outputPricePerMillion:0};
test('local HTTP and public inline MCP accept the additive metadata contract without widening page limits',async()=>{
 const api=await startApi({port:0,aiOptions:disabled});
 try{const direct=await fetch(api.url+'/v1/blog',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(example)});assert.equal(direct.status,200);const r=await direct.json();assert.equal(new Set(codes(r)).size,8);
 const call=inventory=>({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'audit_blog_links',arguments:{inventory}}});const post=async input=>(await fetch(api.url+'/v1/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify(input)})).json();const reply=await post(call(example));assert.equal(reply.result.isError,false);const report=JSON.parse(reply.result.content[0].text);assert.equal(new Set(codes(report)).size,8);const tooMany=inventory(Array.from({length:101},(_,i)=>page('/p'+i)));const rejected=await post(call(tooMany));assert(rejected.error);const bad=structuredClone(example);bad.pages[0].metadata.httpStatus='404';const invalid=await post(call(bad));assert(invalid.error||invalid.result.isError);
 }finally{await api.close();}
});
test('actual local stdio MCP consumes inline metadata using the shared schema',async()=>{
 const client=new Client({name:'inventory-contract-test',version:'1.0'}),transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'src/mcp.mjs')],cwd:root,env:{PATH:process.env.PATH,REPROLEAF_PUBLIC_MCP:'1'},stderr:'pipe'});
 try{await client.connect(transport);const response=await client.callTool({name:'audit_blog_links',arguments:{inventory:example}});assert.notEqual(response.isError,true);const report=JSON.parse(response.content[0].text);assert.equal(new Set(codes(report)).size,8);}finally{await client.close();}
});
