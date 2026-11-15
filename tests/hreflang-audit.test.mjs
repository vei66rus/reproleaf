import test from 'node:test';
import assert from 'node:assert/strict';
import {auditHreflangMatrix} from '../src/hreflang-audit.mjs';
import {startApi} from '../src/api.mjs';

test('auditHreflangMatrix passes reciprocal ru/en/x-default group',()=>{
 const report=auditHreflangMatrix({
  pages:[
   {
    url:'https://evolkov.tech/tools/reproleaf',
    htmlLang:'ru',
    canonical:'https://evolkov.tech/tools/reproleaf',
    alternates:[
     {hreflang:'ru',href:'https://evolkov.tech/tools/reproleaf'},
     {hreflang:'en',href:'https://evolkov.tech/en/tools/reproleaf'},
     {hreflang:'x-default',href:'https://evolkov.tech/en/tools/reproleaf'}
    ]
   },
   {
    url:'https://evolkov.tech/en/tools/reproleaf',
    htmlLang:'en',
    canonical:'https://evolkov.tech/en/tools/reproleaf',
    alternates:[
     {hreflang:'ru',href:'https://evolkov.tech/tools/reproleaf'},
     {hreflang:'en',href:'https://evolkov.tech/en/tools/reproleaf'},
     {hreflang:'x-default',href:'https://evolkov.tech/en/tools/reproleaf'}
    ]
   }
  ]
 });
 assert.equal(report.ok,true);
 assert.equal(report.summary.errors,0);
 assert.equal(report.summary.warnings,0);
 assert.equal(report.summary.missingReturnLinks,0);
});

test('auditHreflangMatrix detects missing return links, missing self, invalid code and html[lang] mismatch',()=>{
 const report=auditHreflangMatrix({
  pages:[
   {
    url:'https://evolkov.tech/ru/page',
    htmlLang:'en',
    canonical:'https://evolkov.tech/ru/canonical-other',
    alternates:[
     {hreflang:'ru',href:'https://evolkov.tech/ru/page'},
     {hreflang:'en',href:'https://evolkov.tech/en/page'},
     {hreflang:'invalid_code_1234',href:'https://evolkov.tech/de/page'}
    ]
   },
   {
    url:'https://evolkov.tech/en/page',
    htmlLang:'en',
    alternates:[
     {hreflang:'de',href:'https://evolkov.tech/de/page'}
    ]
   }
  ]
 });
 assert.equal(report.ok,false);
 assert.ok(report.findings.some(f=>f.code==='HREFLANG_NON_CANONICAL_PAGE'));
 assert.ok(report.findings.some(f=>f.code==='HREFLANG_HTML_LANG_MISMATCH'));
 assert.ok(report.findings.some(f=>f.code==='HREFLANG_INVALID_CODE'));
 assert.ok(report.findings.some(f=>f.code==='HREFLANG_MISSING_RETURN_LINK'));
 assert.ok(report.findings.some(f=>f.code==='HREFLANG_MISSING_SELF'));
 assert.ok(report.findings.some(f=>f.code==='HREFLANG_MISSING_X_DEFAULT'));
});

test('auditHreflangMatrix exposes REST and MCP audit_hreflang_matrix endpoints',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-hreflang.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const payload={
  pages:[
   {
    url:'https://evolkov.tech/a',
    htmlLang:'en',
    alternates:[{hreflang:'en',href:'https://evolkov.tech/a'}]
   }
  ]
 };
 const restRes=await fetch(`${api.url}/v1/hreflang-audit`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify(payload)
 });
 assert.equal(restRes.status,200);
 const restBody=await restRes.json();
 assert.equal(restBody.ok,true);

 const mcpRes=await fetch(`${api.url}/v1/mcp`,{
  method:'POST',
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({
   jsonrpc:'2.0',
   id:1,
   method:'tools/call',
   params:{name:'audit_hreflang_matrix',arguments:payload}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const toolData=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(toolData.ok,true);
});
