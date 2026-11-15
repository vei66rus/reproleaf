import test from 'node:test';
import assert from 'node:assert/strict';
import {auditIndexationHygiene} from '../src/indexation-hygiene-audit.mjs';
import {startApi} from '../src/api.mjs';

test('auditIndexationHygiene passes clean self-canonical pagination and stripped utm canonicals',()=>{
 const report=auditIndexationHygiene({
  pages:[
   {url:'https://evolkov.tech/blog?page=2',canonical:'https://evolkov.tech/blog?page=2'},
   {url:'https://evolkov.tech/tools/reproleaf?utm_source=x',canonical:'https://evolkov.tech/tools/reproleaf'}
  ]
 });
 assert.equal(report.ok,true);
 assert.equal(report.findings.length,0);
});

test('auditIndexationHygiene flags paginated canonical-to-root, dirty params and noindex+canonical',()=>{
 const report=auditIndexationHygiene({
  pages:[
   {url:'https://evolkov.tech/blog/page/2/',canonical:'https://evolkov.tech/blog/'},
   {url:'https://evolkov.tech/tools?sort=asc',noindex:false},
   {url:'https://evolkov.tech/old',canonical:'https://evolkov.tech/new',noindex:true}
  ]
 });
 assert.equal(report.ok,false);
 assert.ok(report.findings.some(f=>f.code==='INDEXATION_PAGINATION_CANONICAL_TO_ROOT'));
 assert.ok(report.findings.some(f=>f.code==='INDEXATION_TRACKING_PARAM_INDEXABLE'));
 assert.ok(report.findings.some(f=>f.code==='INDEXATION_NOINDEX_WITH_CANONICAL_TARGET'));
});

test('auditIndexationHygiene exposes REST and MCP endpoints',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-hygiene.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const payload={pages:[{url:'https://evolkov.tech/blog?page=2',canonical:'https://evolkov.tech/blog?page=2'}]};
 const restRes=await fetch(`${api.url}/v1/indexation-hygiene-audit`,{
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
   params:{name:'audit_indexation_hygiene',arguments:payload}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const toolData=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(toolData.ok,true);
});
