import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDomPerfHints} from '../src/dom-perf-audit.mjs';
import {startApi} from '../src/api.mjs';

test('auditDomPerfHints passes clean HTML with viewport, dimensions and deferred scripts',()=>{
 const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/app.js" defer></script></head><body><h1>Guide</h1><img src="/hero.webp" width="1200" height="630" alt="Hero diagram"></body></html>';
 const report=auditDomPerfHints({html});
 assert.equal(report.ok,true);
 assert.equal(report.findings.length,0);
});

test('auditDomPerfHints flags missing viewport, lazy first image, missing dimensions and blocking head script',()=>{
 const html='<!doctype html><html><head><script src="/blocking.js"></script></head><body><img src="/hero.jpg" loading="lazy"></body></html>';
 const report=auditDomPerfHints({html});
 assert.equal(report.ok,false);
 assert.ok(report.findings.some(f=>f.code==='MOBILE_VIEWPORT_MISSING'));
 assert.ok(report.findings.some(f=>f.code==='LCP_FIRST_IMAGE_LAZY'));
 assert.ok(report.findings.some(f=>f.code==='CLS_IMAGE_MISSING_DIMENSIONS'));
 assert.ok(report.findings.some(f=>f.code==='HTML_IMAGE_MISSING_ALT'));
 assert.ok(report.findings.some(f=>f.code==='INP_RENDER_BLOCKING_HEAD_SCRIPT'));
});

test('auditDomPerfHints exposes REST and MCP endpoints',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-domperf.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const payload={html:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>OK</h1></body></html>'};
 const restRes=await fetch(`${api.url}/v1/dom-perf-audit`,{
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
   params:{name:'audit_dom_perf_hints',arguments:payload}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const toolData=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(toolData.ok,true);
});
