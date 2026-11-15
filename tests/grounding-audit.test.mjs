import test from 'node:test';
import assert from 'node:assert/strict';
import {auditClaimGrounding} from '../src/grounding-audit.mjs';
import {startApi} from '../src/api.mjs';

test('auditClaimGrounding passes when quantitative claims have inline links or source IDs',()=>{
 const markdown=`Cache TTL reduced latency by 42% in [the benchmark](https://evolkov.tech/bench).

Error rates stayed below 0.5% across 120ms p95 windows [src-1].`;
 const report=auditClaimGrounding({
  markdown,
  sources:[{id:'src-1',url:'https://evolkov.tech/report',title:'Latency report'}]
 });
 assert.equal(report.ok,true);
 assert.equal(report.summary.metricClaims,2);
 assert.equal(report.summary.groundedClaims,2);
 assert.equal(report.summary.ungroundedClaims,0);
 assert.equal(report.summary.groundingRate,1);
});

test('auditClaimGrounding flags unsupported metric claims and unknown citation IDs',()=>{
 const markdown=`Conversion increased by 35% overnight.

Memory dropped by 18MB [missing-src].`;
 const report=auditClaimGrounding({
  markdown,
  sources:[{id:'known-src',url:'https://evolkov.tech/known'}]
 });
 assert.equal(report.ok,false);
 assert.equal(report.summary.ungroundedClaims,1);
 assert.ok(report.findings.some(f=>f.code==='GROUNDING_UNSUPPORTED_METRIC_CLAIM'));
 assert.ok(report.findings.some(f=>f.code==='GROUNDING_UNKNOWN_SOURCE_REF'));
});

test('auditClaimGrounding exposes REST and MCP endpoints',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-grounding.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const payload={markdown:'Throughput improved by 2x according to our benchmark.'};
 const restRes=await fetch(`${api.url}/v1/grounding-audit`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify(payload)
 });
 assert.equal(restRes.status,200);
 const restBody=await restRes.json();
 assert.equal(restBody.summary.groundedClaims,1);

 const mcpRes=await fetch(`${api.url}/v1/mcp`,{
  method:'POST',
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({
   jsonrpc:'2.0',
   id:1,
   method:'tools/call',
   params:{name:'audit_claim_grounding',arguments:payload}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const toolData=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(toolData.summary.groundedClaims,1);
});
