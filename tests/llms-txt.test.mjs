import test from 'node:test';
import assert from 'node:assert/strict';
import {auditLlmsTxt,generateLlmsTxt} from '../src/llms-txt.mjs';
import {startApi} from '../src/api.mjs';

test('generateLlmsTxt builds a spec-compliant llms.txt that passes auditLlmsTxt',()=>{
 const generated=generateLlmsTxt({
  title:'Reproleaf',
  summary:'Deterministic SEO, GEO, and mobile-web verification toolkit for CLI and MCP.',
  sections:[
   {
    heading:'Docs',
    links:[
     {title:'Methodology',url:'https://evolkov.tech/en/tools/reproleaf-methodology',description:'Scoring and verification boundaries'},
     {title:'Workspace',url:'https://evolkov.tech/en/tools/reproleaf',description:'Browser SEO and link audit tool'}
    ]
   }
  ]
 });
 assert.equal(generated.ok,true);
 assert.equal(generated.audit.summary.errors,0);
 assert.equal(generated.audit.summary.warnings,0);
 assert.equal(generated.audit.summary.links,2);
 assert.match(generated.llmsTxt,/^# Reproleaf\n\n> Deterministic/);
});

test('auditLlmsTxt detects missing H1, unsafe schemes, relative links and missing summary',()=>{
 const bad=`## Links\n- [Bad](javascript:alert(1))\n- [Rel](/docs)\n- [Rel](/docs)\n`;
 const report=auditLlmsTxt({content:bad,siteUrl:'https://evolkov.tech'});
 assert.equal(report.ok,false);
 assert.ok(report.findings.some(f=>f.code==='LLMS_MISSING_H1'));
 assert.ok(report.findings.some(f=>f.code==='LLMS_UNSAFE_LINK_SCHEME'));
 assert.ok(report.findings.some(f=>f.code==='LLMS_RELATIVE_LINK'));
 assert.ok(report.findings.some(f=>f.code==='LLMS_DUPLICATE_LINK'));
 assert.ok(report.findings.some(f=>f.code==='LLMS_MISSING_SUMMARY_BLOCKQUOTE'));
});

test('llms-txt endpoints work via REST and public MCP',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-llms.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const spec={
  title:'Reproleaf',
  summary:'Local SEO verification core.',
  sections:[{heading:'Core',links:[{title:'Home',url:'https://evolkov.tech/'}]}]
 };
 const genRes=await fetch(`${api.url}/v1/llms-txt-generate`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify(spec)
 });
 assert.equal(genRes.status,200);
 const genBody=await genRes.json();
 assert.equal(genBody.ok,true);

 const mcpRes=await fetch(`${api.url}/v1/mcp`,{
  method:'POST',
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({
   jsonrpc:'2.0',
   id:1,
   method:'tools/call',
   params:{name:'audit_llms_txt',arguments:{content:genBody.llmsTxt,siteUrl:'https://evolkov.tech'}}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const toolData=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(toolData.ok,true);
});
