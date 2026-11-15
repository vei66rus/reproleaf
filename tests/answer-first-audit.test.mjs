import test from 'node:test';
import assert from 'node:assert/strict';
import {auditAnswerFirst} from '../src/answer-first-audit.mjs';
import {startApi} from '../src/api.mjs';

test('auditAnswerFirst passes direct answer-first H2/H3 sections in Markdown',()=>{
 const report=auditAnswerFirst({
  markdown:`# Guide

## What is a canonical tag?

A canonical tag tells search engines which URL is the preferred version of a page when duplicate or near-duplicate URLs exist.

### How do you add one?

Place a link rel="canonical" element inside the HTML head pointing to the absolute primary URL.`
 });
 assert.equal(report.ok,true);
 assert.equal(report.summary.totalHeadings,2);
 assert.equal(report.summary.questionHeadings,2);
 assert.equal(report.summary.snippetReadyHeadings,2);
 assert.equal(report.findings.length,0);
});

test('auditAnswerFirst flags missing answer, filler preambles and overlong first paragraphs in Markdown and HTML',()=>{
 const longAnswer=Array.from({length:75},(_,i)=>`detail${i}`).join(' ')+'.';
 const mdReport=auditAnswerFirst({
  markdown:`## Как работает индексация?

- Пункт 1
- Пункт 2

## Зачем нужен sitemap?

В современном мире давайте разберёмся зачем нужен файл sitemap.xml для сайта.

## Why keep paragraphs short?

${longAnswer}`
 });
 assert.equal(mdReport.ok,false);
 assert.ok(mdReport.findings.some(f=>f.code==='missing-answer-paragraph'&&f.severity==='error'));
 assert.ok(mdReport.findings.some(f=>f.code==='filler-preamble'));
 assert.ok(mdReport.findings.some(f=>f.code==='overlong-first-paragraph'));

 const htmlReport=auditAnswerFirst({
  html:'<article><h2>What is llms.txt?</h2><p>In this section, we explore llms.txt.</p><h3>How big should it be?</h3><ul><li>Small</li></ul></article>'
 });
 assert.equal(htmlReport.ok,false);
 assert.equal(htmlReport.summary.totalHeadings,2);
 assert.ok(htmlReport.findings.some(f=>f.code==='filler-preamble'));
 assert.ok(htmlReport.findings.some(f=>f.code==='missing-answer-paragraph'));
});

test('auditAnswerFirst exposes REST and MCP endpoints',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-answer-first.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const payload={markdown:'## What is Reproleaf?\n\nReproleaf is a deterministic HTML and SEO auditing toolkit.'};
 const restRes=await fetch(`${api.url}/v1/answer-first-audit`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify(payload)
 });
 assert.equal(restRes.status,200);
 const restBody=await restRes.json();
 assert.equal(restBody.ok,true);
 assert.equal(restBody.summary.snippetReadyHeadings,1);

 const mcpRes=await fetch(`${api.url}/v1/mcp`,{
  method:'POST',
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({
   jsonrpc:'2.0',
   id:1,
   method:'tools/call',
   params:{name:'audit_answer_first',arguments:payload}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const parsed=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(parsed.ok,true);
 assert.equal(parsed.summary.questionHeadings,1);
});
