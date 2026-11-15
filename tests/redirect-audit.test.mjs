import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRedirectTraces,traceRedirects} from '../src/redirect-audit.mjs';
import {startApi} from '../src/api.mjs';

test('auditRedirectTraces passes clean 301 -> 200 single hop',()=>{
 const report=auditRedirectTraces({
  traces:[
   {
    startUrl:'http://evolkov.tech/tools/reproleaf',
    hops:[
     {url:'http://evolkov.tech/tools/reproleaf',status:301,location:'https://evolkov.tech/tools/reproleaf'},
     {url:'https://evolkov.tech/tools/reproleaf',status:200}
    ]
   }
  ]
 });
 assert.equal(report.ok,true);
 assert.equal(report.summary.errors,0);
 assert.equal(report.summary.warnings,0);
 assert.equal(report.traces[0].finalStatus,200);
});

test('auditRedirectTraces detects chains, temporary 302, loops and 404 targets',()=>{
 const report=auditRedirectTraces({
  traces:[
   {
    startUrl:'https://evolkov.tech/old-a',
    hops:[
     {url:'https://evolkov.tech/old-a',status:302,location:'https://evolkov.tech/old-b'},
     {url:'https://evolkov.tech/old-b',status:301,location:'https://evolkov.tech/gone'},
     {url:'https://evolkov.tech/gone',status:404}
    ]
   },
   {
    startUrl:'https://evolkov.tech/loop-a',
    hops:[
     {url:'https://evolkov.tech/loop-a',status:301,location:'https://evolkov.tech/loop-b'},
     {url:'https://evolkov.tech/loop-b',status:301,location:'https://evolkov.tech/loop-a'}
    ]
   }
  ]
 });
 assert.equal(report.ok,false);
 assert.equal(report.summary.chains,2);
 assert.equal(report.summary.loops,1);
 assert.equal(report.summary.brokenTargets,1);
 assert.equal(report.summary.temporaryRedirects,1);
 assert.ok(report.findings.some(f=>f.code==='REDIRECT_TEMPORARY_STATUS'));
 assert.ok(report.findings.some(f=>f.code==='REDIRECT_CHAIN_TOO_LONG'));
 assert.ok(report.findings.some(f=>f.code==='STATUS_CLIENT_ERROR_4XX'));
 assert.ok(report.findings.some(f=>f.code==='REDIRECT_LOOP'));
});

test('traceRedirects resolves hops manually and serves REST + MCP audit_redirect_chains',async t=>{
 const mockFetch=async(url)=>{
  if(url==='https://evolkov.tech/start'){
   return new Response(null,{status:301,headers:{location:'/mid'}});
  }
  if(url==='https://evolkov.tech/mid'){
   return new Response(null,{status:301,headers:{location:'/end'}});
  }
  return new Response('ok',{status:200});
 };
 const traced=await traceRedirects({urls:['https://evolkov.tech/start'],fetchImpl:mockFetch});
 assert.equal(traced.ok,true);
 assert.equal(traced.summary.chains,1);
 assert.equal(traced.traces[0].finalUrl,'https://evolkov.tech/end');

 const api=await startApi({port:0,aiOptions:{envPath:'missing-redirect.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const payload={
  traces:[
   {startUrl:'https://evolkov.tech/err',hops:[{url:'https://evolkov.tech/err',status:503}]}
  ]
 };
 const restRes=await fetch(`${api.url}/v1/redirect-audit`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify(payload)
 });
 assert.equal(restRes.status,200);
 const restBody=await restRes.json();
 assert.equal(restBody.ok,false);
 assert.ok(restBody.findings.some(f=>f.code==='STATUS_SERVER_ERROR_5XX'));

 const mcpRes=await fetch(`${api.url}/v1/mcp`,{
  method:'POST',
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({
   jsonrpc:'2.0',
   id:1,
   method:'tools/call',
   params:{name:'audit_redirect_chains',arguments:payload}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const toolData=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(toolData.ok,false);
});
