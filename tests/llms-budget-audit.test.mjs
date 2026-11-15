import test from 'node:test';
import assert from 'node:assert/strict';
import {auditLlmsBudget} from '../src/llms-budget-audit.mjs';
import {startApi} from '../src/api.mjs';

test('auditLlmsBudget passes when core pages fit target context budget and optional pages are separated',()=>{
 const report=auditLlmsBudget({
  targetContextTokens:1000,
  llmsTxt:`# Reproleaf
> Deterministic SEO toolkit.

## Docs
- [Start](https://evolkov.tech/docs/start)

## Optional
- [Archive](https://evolkov.tech/blog/archive)`,
  pages:[
   {url:'https://evolkov.tech/docs/start',markdown:'# Start\n\nShort guide.'},
   {url:'https://evolkov.tech/blog/archive',markdown:'A'.repeat(8000)}
  ]
 });
 assert.equal(report.ok,true);
 assert.equal(report.summary.coreLinks,1);
 assert.equal(report.summary.optionalLinks,1);
 assert.ok(report.summary.coreTokens<100);
 assert.ok(report.summary.optionalTokens>=2000);
 assert.equal(report.findings.length,0);
});

test('auditLlmsBudget flags duplicate URLs, missing targets and oversized core sections',()=>{
 const report=auditLlmsBudget({
  targetContextTokens:1000,
  llmsTxt:`# Reproleaf

## Docs
- [Big Doc](https://evolkov.tech/docs/big)
- [Big Doc Again](https://evolkov.tech/docs/big)
- [Missing](https://evolkov.tech/docs/missing)`,
  pages:[
   {url:'https://evolkov.tech/docs/big',markdown:'X'.repeat(5000)}
  ]
 });
 assert.equal(report.ok,false);
 assert.ok(report.findings.some(f=>f.code==='duplicate-url'));
 assert.ok(report.findings.some(f=>f.code==='missing-page-content'));
 assert.ok(report.findings.some(f=>f.code==='oversized-core-budget'));
});

test('auditLlmsBudget exposes REST and MCP endpoints',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-budget.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const payload={
  llmsTxt:'# Reproleaf\n\n## Docs\n- [Guide](https://evolkov.tech/docs/guide)'
 };
 const restRes=await fetch(`${api.url}/v1/audit-llms-budget`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify(payload)
 });
 assert.equal(restRes.status,200);
 const restBody=await restRes.json();
 assert.equal(restBody.ok,true);
 assert.equal(restBody.summary.totalLinks,1);

 const mcpRes=await fetch(`${api.url}/v1/mcp`,{
  method:'POST',
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({
   jsonrpc:'2.0',
   id:1,
   method:'tools/call',
   params:{name:'audit_llms_budget',arguments:payload}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const parsed=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(parsed.summary.coreLinks,1);
});
