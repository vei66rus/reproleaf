import test from 'node:test';
import assert from 'node:assert/strict';
import {auditJsonLd} from '../src/schema-audit.mjs';
import {startApi} from '../src/api.mjs';

test('auditJsonLd validates valid @graph with Article, BreadcrumbList and FAQPage',()=>{
 const html=`<!doctype html><html><head>
 <script type="application/ld+json">
 {
  "@context":"https://schema.org",
  "@graph":[
   {"@type":"Organization","@id":"#org","name":"Reproleaf","url":"https://evolkov.tech"},
   {"@type":"Article","headline":"Cache invalidation guide","author":{"@id":"#org"},"datePublished":"2026-11-15","url":"https://evolkov.tech/en/blog/cache"},
   {"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://evolkov.tech/"}]},
   {"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Why bound TTL?","acceptedAnswer":{"@type":"Answer","text":"To avoid stale reads."}}]}
  ]
 }
 </script>
 </head><body></body></html>`;
 const report=auditJsonLd({html,url:'https://evolkov.tech/en/blog/cache'});
 assert.equal(report.ok,true);
 assert.equal(report.summary.blocks,1);
 assert.equal(report.summary.entities,4);
 assert.equal(report.summary.errors,0);
 assert.equal(report.summary.warnings,0);
 assert.deepEqual(report.summary.types,['Organization','Article','BreadcrumbList','FAQPage']);
});

test('auditJsonLd reports invalid JSON, missing fields, broken @id ref and relative URLs',()=>{
 const html=`<!doctype html><html><head>
 <script type="application/ld+json">{ invalid json</script>
 <script type="application/ld+json">
 {
  "@context":"https://schema.org",
  "@type":"Article",
  "author":{"@id":"#missing-author"},
  "datePublished":"15.11.2026",
  "url":"/relative/path"
 }
 </script>
 </head><body></body></html>`;
 const report=auditJsonLd({html,url:'https://evolkov.tech/post'});
 assert.equal(report.ok,false);
 assert.ok(report.findings.some(f=>f.code==='SCHEMA_INVALID_JSON'));
 assert.ok(report.findings.some(f=>f.code==='SCHEMA_ARTICLE_MISSING_FIELD'&&f.message.includes('headline')));
 assert.ok(report.findings.some(f=>f.code==='SCHEMA_ARTICLE_MISSING_FIELD'&&f.message.includes('datePublished')===false));
 assert.ok(report.findings.some(f=>f.code==='SCHEMA_INVALID_DATE'));
 assert.ok(report.findings.some(f=>f.code==='SCHEMA_RELATIVE_URL'));
 assert.ok(report.findings.some(f=>f.code==='SCHEMA_UNRESOLVED_ID_REF'));
});

test('auditJsonLd flags missing JSON-LD and exposes HTTP + MCP endpoints',async t=>{
 const emptyReport=auditJsonLd({html:'<html><body><p>No schema</p></body></html>'});
 assert.equal(emptyReport.ok,true);
 assert.equal(emptyReport.summary.blocks,0);
 assert.ok(emptyReport.findings.some(f=>f.code==='SCHEMA_MISSING'));

 const api=await startApi({port:0,aiOptions:{envPath:'missing-schema.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const html='<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Reproleaf","applicationCategory":"DeveloperApplication"}</script></head><body></body></html>';
 const restRes=await fetch(`${api.url}/v1/schema-audit`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({html})
 });
 assert.equal(restRes.status,200);
 const restBody=await restRes.json();
 assert.equal(restBody.ok,true);
 assert.deepEqual(restBody.summary.types,['SoftwareApplication']);

 const mcpRes=await fetch(`${api.url}/v1/mcp`,{
  method:'POST',
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({
   jsonrpc:'2.0',
   id:1,
   method:'tools/call',
   params:{name:'audit_jsonld_schema',arguments:{html}}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const toolData=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(toolData.ok,true);
});
