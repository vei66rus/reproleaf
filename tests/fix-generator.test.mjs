import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestSeoFixes} from '../src/fix-generator.mjs';
import {startApi} from '../src/api.mjs';

test('suggestSeoFixes generates escaped HTML head tags and valid Article + FAQPage JSON-LD without inventing omitted fields',()=>{
 const report=suggestSeoFixes({
  url:'https://evolkov.tech/tools/reproleaf',
  title:'Reproleaf SEO & AI Audit <Toolkit>',
  description:'Deterministic HTML, JSON-LD and llms.txt audit toolkit.',
  author:'Evgenii Volkov',
  datePublished:'2026-11-10',
  type:'Article',
  faq:[
   {q:'Does it fetch arbitrary URLs?',a:'No, public tools are stateless and offline.'}
  ]
 });
 assert.equal(report.ok,true);
 assert.equal(report.summary.jsonLdBlockCount,2);
 assert.ok(report.snippets.headHtml.includes('<title>Reproleaf SEO &amp; AI Audit &lt;Toolkit&gt;</title>'));
 assert.ok(report.snippets.headHtml.includes('<link rel="canonical" href="https://evolkov.tech/tools/reproleaf">'));
 assert.ok(!report.snippets.headHtml.includes('og:image'));
 assert.equal(report.snippets.jsonLd[0]['@type'],'Article');
 assert.equal(report.snippets.jsonLd[0].author.name,'Evgenii Volkov');
 assert.equal(report.snippets.jsonLd[1]['@type'],'FAQPage');
});

test('suggestSeoFixes warns on long title/description and escapes script-closing sequences in JSON-LD',()=>{
 const report=suggestSeoFixes({
  url:'https://evolkov.tech/app',
  title:'A'.repeat(70),
  description:'B'.repeat(170)+'</script>',
  type:'SoftwareApplication'
 });
 assert.ok(report.warnings.some(w=>w.code==='title-too-long'));
 assert.ok(report.warnings.some(w=>w.code==='description-too-long'));
 assert.ok(!report.snippets.jsonLdScripts[0].includes('</script>\n</script>'));
 assert.ok(report.snippets.jsonLdScripts[0].includes('\\u003c/script>'));
});

test('suggestSeoFixes exposes REST and MCP endpoints',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-fix.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const payload={
  url:'https://evolkov.tech/faq',
  title:'Reproleaf FAQ',
  type:'FAQPage',
  faq:[{q:'What is Reproleaf?',a:'A deterministic SEO and AI readiness linter.'}]
 };
 const restRes=await fetch(`${api.url}/v1/suggest-seo-fixes`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify(payload)
 });
 assert.equal(restRes.status,200);
 const restBody=await restRes.json();
 assert.equal(restBody.summary.jsonLdBlockCount,1);
 assert.ok(restBody.warnings.some(w=>w.code==='missing-description'));

 const mcpRes=await fetch(`${api.url}/v1/mcp`,{
  method:'POST',
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({
   jsonrpc:'2.0',
   id:1,
   method:'tools/call',
   params:{name:'suggest_seo_fixes',arguments:payload}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const parsed=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(parsed.snippets.jsonLd[0]['@type'],'FAQPage');
});
