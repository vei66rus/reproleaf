import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRawVsRenderedHtml} from '../src/hydration-diff-audit.mjs';
import {startApi} from '../src/api.mjs';

test('auditRawVsRenderedHtml passes when SSR and hydrated DOM match',()=>{
 const html='<!doctype html><html lang="en"><head><title>Reproleaf Guide</title><link rel="canonical" href="https://evolkov.tech/guide"><meta name="robots" content="index,follow"><script type="application/ld+json">{"@context":"https://schema.org"}</script></head><body><h1>Reproleaf Guide</h1><p>Static server rendered guide content with links.</p><a href="/docs">Docs</a></body></html>';
 const report=auditRawVsRenderedHtml({rawHtml:html,renderedHtml:html,url:'https://evolkov.tech/guide'});
 assert.equal(report.ok,true);
 assert.equal(report.summary.wordRatio,1);
 assert.equal(report.findings.length,0);
});

test('auditRawVsRenderedHtml detects CSR shell, missing H1, canonical/robots mutation and client-only schema',()=>{
 const rawHtml='<!doctype html><html><head><title>Loading</title><link rel="canonical" href="https://evolkov.tech/old"></head><body><div id="root"></div></body></html>';
 const bodyWords=Array.from({length:160},(_,i)=>`word${i}`).join(' ');
 const links=Array.from({length:5},(_,i)=>`<a href="/p${i}">P${i}</a>`).join('');
 const renderedHtml=`<!doctype html><html><head><title>Loaded Guide</title><link rel="canonical" href="https://evolkov.tech/new"><meta name="robots" content="noindex"><script type="application/ld+json">{"@type":"Article"}</script></head><body><h1>Loaded Guide</h1><p>${bodyWords}</p>${links}</body></html>`;
 const report=auditRawVsRenderedHtml({rawHtml,renderedHtml});
 assert.equal(report.ok,false);
 assert.ok(report.findings.some(f=>f.code==='HYDRATION_CSR_SHELL_EMPTY'));
 assert.ok(report.findings.some(f=>f.code==='HYDRATION_MISSING_H1_IN_RAW'));
 assert.ok(report.findings.some(f=>f.code==='HYDRATION_TITLE_MUTATED'));
 assert.ok(report.findings.some(f=>f.code==='HYDRATION_CANONICAL_MUTATED'));
 assert.ok(report.findings.some(f=>f.code==='HYDRATION_ROBOTS_MUTATED'));
 assert.ok(report.findings.some(f=>f.code==='HYDRATION_SCHEMA_CLIENT_ONLY'));
 assert.ok(report.findings.some(f=>f.code==='HYDRATION_LINKS_CLIENT_ONLY'));
});

test('auditRawVsRenderedHtml exposes REST and MCP endpoints',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-hydration.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const html='<!doctype html><html><head><title>Check</title></head><body><h1>Check</h1><p>Matched SSR content.</p></body></html>';
 const payload={rawHtml:html,renderedHtml:html};
 const restRes=await fetch(`${api.url}/v1/hydration-diff-audit`,{
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
   params:{name:'audit_hydration_diff',arguments:payload}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const toolData=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(toolData.ok,true);
});
