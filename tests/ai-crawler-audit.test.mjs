import test from 'node:test';
import assert from 'node:assert/strict';
import {auditAiCrawlerAccess} from '../src/ai-crawler-audit.mjs';
import {startApi} from '../src/api.mjs';

const richHtml=`<!doctype html><html><head><title>Guide</title></head><body><main><h1>Cache invalidation</h1><p>${Array.from({length:60},(_,i)=>`word${i}`).join(' ')}</p></main></body></html>`;

test('auditAiCrawlerAccess allows search AI bots while allowing selective training blocks',()=>{
 const robotsTxt=`User-agent: GPTBot\nDisallow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: *\nAllow: /\n`;
 const report=auditAiCrawlerAccess({
  url:'https://evolkov.tech/en/tools/reproleaf',
  robotsTxt,
  html:richHtml
 });
 assert.equal(report.ok,true);
 assert.equal(report.summary.errors,0);
 assert.equal(report.summary.warnings,0);
 const gptBot=report.bots.find(b=>b.agent==='GPTBot');
 const oaiSearch=report.bots.find(b=>b.agent==='OAI-SearchBot');
 assert.equal(gptBot.status,'blocked');
 assert.equal(oaiSearch.status,'allowed');
});

test('auditAiCrawlerAccess flags blocked search bots, nosnippet meta and sparse non-JS HTML',()=>{
 const robotsTxt=`User-agent: *\nDisallow: /docs/\n`;
 const sparseHtml=`<html><head><meta name="robots" content="nosnippet, noai"></head><body><div id="root"></div><script>window.render()</script></body></html>`;
 const report=auditAiCrawlerAccess({
  url:'https://evolkov.tech/docs/api',
  robotsTxt,
  html:sparseHtml
 });
 assert.equal(report.ok,false);
 assert.ok(report.findings.some(f=>f.code==='AI_CRAWLER_SEARCH_BLOCKED'));
 assert.ok(report.findings.some(f=>f.code==='AI_META_CITATION_RESTRICTED'));
 assert.ok(report.findings.some(f=>f.code==='AI_NO_JS_CONTENT_SPARSE'));
});

test('auditAiCrawlerAccess exposes REST and MCP endpoints',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-ai-crawler.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const payload={robotsTxt:'User-agent: *\nAllow: /\n',html:richHtml};
 const restRes=await fetch(`${api.url}/v1/ai-crawler-audit`,{
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
   params:{name:'audit_ai_crawler_access',arguments:payload}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const toolData=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(toolData.ok,true);
});
