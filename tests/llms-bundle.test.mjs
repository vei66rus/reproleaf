import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLlmsBundle} from '../src/llms-bundle.mjs';
import {startApi} from '../src/api.mjs';

test('buildLlmsBundle generates grouped llms.txt and token-capped llms-full.txt',()=>{
 const longBody=Array.from({length:600},(_,i)=>`token${i}`).join(' ');
 const report=buildLlmsBundle({
  siteTitle:'Reproleaf',
  summary:'Deterministic SEO & AI readiness toolkit.',
  maxFullTokens:600,
  pages:[
   {
    url:'https://evolkov.tech/docs/start',
    title:'Quick Start',
    section:'Docs',
    description:'Install and run Reproleaf.',
    markdown:'# Quick Start\n\nRun npx reproleaf-mcp.'
   },
   {
    url:'https://evolkov.tech/tools/audit',
    title:'HTML Audit',
    section:'Tools',
    description:'Check tags and canonicals.',
    markdown:'# HTML Audit\n\nDeterministic checks.'
   },
   {
    url:'https://evolkov.tech/blog/archive',
    title:'Old Archive',
    section:'Blog',
    optional:true,
    markdown:longBody
   }
  ]
 });
 assert.equal(report.ok,true);
 assert.ok(report.llmsTxt.includes('# Reproleaf\n> Deterministic SEO & AI readiness toolkit.'));
 assert.ok(report.llmsTxt.includes('## Docs\n- [Quick Start](https://evolkov.tech/docs/start): Install and run Reproleaf.'));
 assert.ok(report.llmsTxt.includes('## Tools\n- [HTML Audit](https://evolkov.tech/tools/audit): Check tags and canonicals.'));
 assert.ok(report.llmsTxt.includes('## Optional\n- [Old Archive](https://evolkov.tech/blog/archive)'));
 assert.equal(report.summary.includedInFullCount,2);
 assert.equal(report.summary.omittedFromFullCount,1);
 assert.deepEqual(report.summary.omittedUrls,['https://evolkov.tech/blog/archive']);
});

test('buildLlmsBundle rejects duplicate URLs',()=>{
 assert.throws(()=>buildLlmsBundle({
  siteTitle:'Reproleaf',
  pages:[
   {url:'https://evolkov.tech/a',title:'A'},
   {url:'https://evolkov.tech/a',title:'B'}
  ]
 }),/Duplicate page URL/);
});

test('buildLlmsBundle exposes REST and MCP endpoints',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-bundle.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const payload={
  siteTitle:'Reproleaf Docs',
  pages:[
   {url:'https://evolkov.tech/docs',title:'Docs',section:'Docs',markdown:'# Docs\n\nReady.'}
  ]
 };
 const restRes=await fetch(`${api.url}/v1/build-llms-bundle`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify(payload)
 });
 assert.equal(restRes.status,200);
 const restBody=await restRes.json();
 assert.equal(restBody.ok,true);
 assert.ok(restBody.llmsFullTxt.includes('Source: https://evolkov.tech/docs'));

 const mcpRes=await fetch(`${api.url}/v1/mcp`,{
  method:'POST',
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({
   jsonrpc:'2.0',
   id:1,
   method:'tools/call',
   params:{name:'build_llms_bundle',arguments:payload}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const parsed=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(parsed.summary.totalPages,1);
});
