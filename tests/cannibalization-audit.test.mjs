import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCannibalizationMatrix} from '../src/cannibalization-audit.mjs';
import {startApi} from '../src/api.mjs';

test('auditCannibalizationMatrix passes distinct topic pages',()=>{
 const report=auditCannibalizationMatrix({
  pages:[
   {url:'/tools/robots-txt-checker',title:'Robots.txt Checker',h1:'Robots.txt Validator',primaryQuery:'robots txt checker'},
   {url:'/tools/hreflang-checker',title:'Hreflang Matrix Checker',h1:'Hreflang Return Links',primaryQuery:'hreflang checker'}
  ]
 });
 assert.equal(report.ok,true);
 assert.equal(report.pairs.length,0);
});

test('auditCannibalizationMatrix flags exact primaryQuery conflicts and high token overlap',()=>{
 const report=auditCannibalizationMatrix({
  pages:[
   {url:'/blog/robots-guide',title:'Robots.txt Checker Guide',h1:'Robots.txt Checker',primaryQuery:'robots txt checker'},
   {url:'/tools/robots-checker',title:'Online Robots.txt Checker',h1:'Robots.txt Checker Tool',primaryQuery:'robots txt checker'},
   {url:'/guides/robots-rules',title:'Robots.txt Checker Rules',h1:'Robots.txt Checker Rules'}
  ]
 });
 assert.equal(report.ok,false);
 assert.equal(report.summary.exactQueryConflicts,1);
 assert.ok(report.findings.some(f=>f.code==='CANNIBALIZATION_EXACT_QUERY'));
 assert.ok(report.findings.some(f=>f.code==='CANNIBALIZATION_HIGH_OVERLAP'));
});

test('auditCannibalizationMatrix exposes REST and MCP endpoints',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-cannibal.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const payload={
  pages:[
   {url:'/a',title:'OpenGraph Checker',h1:'OpenGraph Checker'},
   {url:'/b',title:'OpenGraph Checker Online',h1:'OpenGraph Checker'}
  ]
 };
 const restRes=await fetch(`${api.url}/v1/cannibalization-audit`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify(payload)
 });
 assert.equal(restRes.status,200);
 const restBody=await restRes.json();
 assert.ok(restBody.pairs.length>=1);

 const mcpRes=await fetch(`${api.url}/v1/mcp`,{
  method:'POST',
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({
   jsonrpc:'2.0',
   id:1,
   method:'tools/call',
   params:{name:'audit_cannibalization',arguments:payload}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const toolData=JSON.parse(mcpBody.result.content[0].text);
 assert.ok(toolData.pairs.length>=1);
});
