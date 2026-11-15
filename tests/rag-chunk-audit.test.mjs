import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRagChunks} from '../src/rag-chunk-audit.mjs';
import {startApi} from '../src/api.mjs';

test('auditRagChunks scores self-contained chunks at 1.0 extractability',()=>{
 const text=`# Cache Invalidation

Cache invalidation removes stale entries from application memory after a write operation or TTL expiration so clients never read outdated state.

## TTL Boundaries

Time-to-live boundaries define the maximum number of seconds an HTTP response or database cache key remains valid without revalidation.`;
 const report=auditRagChunks({text,locale:'en'});
 assert.equal(report.ok,true);
 assert.equal(report.summary.chunks,2);
 assert.equal(report.summary.autonomousChunks,2);
 assert.equal(report.summary.extractabilityRate,1);
 assert.equal(report.summary.warnings,0);
});

test('auditRagChunks detects pronoun-dependent openers, short and oversized chunks',()=>{
 const longParagraph=Array.from({length:210},(_,i)=>`token${i}`).join(' ');
 const text=`## Overview

It improves response times when configured properly across edge nodes and regional caches without extra round trips.

Short note.

${longParagraph}`;
 const report=auditRagChunks({text,locale:'en'});
 assert.equal(report.summary.pronounDependentOpenings,1);
 assert.equal(report.summary.undersizedChunks,1);
 assert.equal(report.summary.oversizedChunks,1);
 assert.ok(report.findings.some(f=>f.code==='RAG_PRONOUN_DEPENDENT_OPENING'));
 assert.ok(report.findings.some(f=>f.code==='RAG_CHUNK_TOO_SHORT'));
 assert.ok(report.findings.some(f=>f.code==='RAG_CHUNK_TOO_LONG'));
});

test('auditRagChunks supports Russian locale and exposes REST + MCP endpoints',async t=>{
 const ruText=`## Что такое кэш\n\nЭто ускоряет загрузку страниц при повторных визитах пользователей на сайт без обращения к базе данных.`;
 const ruReport=auditRagChunks({text:ruText,locale:'ru'});
 assert.equal(ruReport.summary.pronounDependentOpenings,1);

 const api=await startApi({port:0,aiOptions:{envPath:'missing-rag.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const payload={text:ruText,locale:'ru'};
 const restRes=await fetch(`${api.url}/v1/rag-chunk-audit`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify(payload)
 });
 assert.equal(restRes.status,200);
 const restBody=await restRes.json();
 assert.equal(restBody.summary.chunks,1);

 const mcpRes=await fetch(`${api.url}/v1/mcp`,{
  method:'POST',
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({
   jsonrpc:'2.0',
   id:1,
   method:'tools/call',
   params:{name:'audit_rag_chunks',arguments:payload}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const toolData=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(toolData.summary.chunks,1);
});
