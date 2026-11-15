import test from 'node:test';
import assert from 'node:assert/strict';
import {auditEditorialClarity} from '../src/editorial-clarity-audit.mjs';
import {startApi} from '../src/api.mjs';

test('auditEditorialClarity passes concise scannable Markdown',()=>{
 const report=auditEditorialClarity({
  markdown:'# Guide\n\nReproleaf checks HTML deterministically.\n\n## Checks\n\n- Canonical tags\n- JSON-LD syntax\n- Robots rules',
  locale:'en'
 });
 assert.equal(report.ok,true);
 assert.equal(report.findings.length,0);
});

test('auditEditorialClarity flags walls of text, long sentences and AI cliches',()=>{
 const wall=Array.from({length:300},(_,i)=>`word${i}`).join(' ');
 const longSent=Array.from({length:32},(_,i)=>`clause${i}`).join(' ')+'.';
 const report=auditEditorialClarity({
  markdown:`# Draft\n\nIn today's fast-paced world, we delve into SEO. ${longSent}\n\n${wall}`,
  locale:'en'
 });
 assert.ok(report.findings.some(f=>f.code==='EDITORIAL_WALL_OF_TEXT'));
 assert.ok(report.findings.some(f=>f.code==='EDITORIAL_LONG_SENTENCE'));
 assert.ok(report.findings.some(f=>f.code==='EDITORIAL_AI_CLICHE'));
});

test('auditEditorialClarity exposes REST and MCP endpoints',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-clarity.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const payload={markdown:'# Заголовок\n\nВ современном мире это играет ключевую роль.',locale:'ru'};
 const restRes=await fetch(`${api.url}/v1/editorial-clarity-audit`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify(payload)
 });
 assert.equal(restRes.status,200);
 const restBody=await restRes.json();
 assert.ok(restBody.summary.cliches>=2);

 const mcpRes=await fetch(`${api.url}/v1/mcp`,{
  method:'POST',
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({
   jsonrpc:'2.0',
   id:1,
   method:'tools/call',
   params:{name:'audit_editorial_clarity',arguments:payload}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const toolData=JSON.parse(mcpBody.result.content[0].text);
 assert.ok(toolData.summary.cliches>=2);
});
