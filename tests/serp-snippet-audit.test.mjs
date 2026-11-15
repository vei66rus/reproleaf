import test from 'node:test';
import assert from 'node:assert/strict';
import {auditSerpSnippet} from '../src/serp-snippet-audit.mjs';
import {startApi} from '../src/api.mjs';

test('auditSerpSnippet passes optimal title and description pixel widths',()=>{
 const report=auditSerpSnippet({
  title:'Deterministic SEO and GEO Audit Toolkit — Reproleaf',
  description:'Run deterministic HTML, Schema.org, OpenGraph, hreflang, and AI crawler checks across static builds or via MCP without network fetching.',
  h1:'Reproleaf Toolkit',
  primaryQuery:'seo audit toolkit'
 });
 assert.equal(report.ok,true);
 assert.ok(report.metrics.titlePixels>=200&&report.metrics.titlePixels<=580);
 assert.ok(report.metrics.descriptionPixels>=350&&report.metrics.descriptionPixels<=920);
 assert.equal(report.findings.filter(f=>f.severity!=='info').length,0);
});

test('auditSerpSnippet flags overlong title, missing description and absent query terms',()=>{
 const report=auditSerpSnippet({
  html:'<!doctype html><html><head><title>WWWWW MMMMM Very Long Title That Definitely Exceeds Five Hundred Eighty Pixels In Google Search Results Preview</title></head><body><h1>Main Heading</h1></body></html>',
  primaryQuery:'robots txt checker'
 });
 assert.ok(report.findings.some(f=>f.code==='SERP_TITLE_TRUNCATED'));
 assert.ok(report.findings.some(f=>f.code==='SERP_DESCRIPTION_MISSING'));
 assert.ok(report.findings.some(f=>f.code==='SERP_QUERY_NOT_IN_TITLE'));
});

test('auditSerpSnippet exposes REST and MCP endpoints',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-serp.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const payload={title:'Robots.txt Checker — Reproleaf',description:'Validate robots.txt Allow, Disallow, and AI crawler rules deterministically before deploy.'};
 const restRes=await fetch(`${api.url}/v1/serp-snippet-audit`,{
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
   params:{name:'audit_serp_snippet',arguments:payload}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const toolData=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(toolData.ok,true);
});
