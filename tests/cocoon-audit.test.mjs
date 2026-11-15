import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCocoonGraph} from '../src/cocoon-audit.mjs';
import {startApi} from '../src/api.mjs';

test('auditCocoonGraph passes a well-formed semantic cocoon with bidirectional hub links',()=>{
 const report=auditCocoonGraph({
  siteUrl:'https://evolkov.tech',
  rootUrl:'https://evolkov.tech/seo-hub',
  pages:[
   {
    url:'https://evolkov.tech/seo-hub',
    cluster:'tech-seo',
    kind:'hub',
    links:[
     {href:'/canonical-guide',anchor:'canonical tag rules'},
     {href:'/hreflang-guide',anchor:'hreflang matrix setup'}
    ]
   },
   {
    url:'https://evolkov.tech/canonical-guide',
    cluster:'tech-seo',
    kind:'supporting',
    links:[
     {href:'/seo-hub',anchor:'technical SEO hub'},
     {href:'/hreflang-guide',anchor:'international hreflang guide'}
    ]
   },
   {
    url:'https://evolkov.tech/hreflang-guide',
    cluster:'tech-seo',
    kind:'supporting',
    links:[
     {href:'/seo-hub',anchor:'core technical SEO checklist'}
    ]
   }
  ]
 });
 assert.equal(report.ok,true);
 assert.equal(report.summary.errors,0);
 assert.equal(report.summary.warnings,0);
 assert.equal(report.summary.orphans,0);
 assert.equal(report.summary.deepPages,0);
});

test('auditCocoonGraph detects orphans, generic anchors, missing hub and anchor concentration',()=>{
 const report=auditCocoonGraph({
  siteUrl:'https://evolkov.tech',
  rootUrl:'https://evolkov.tech/home',
  pages:[
   {
    url:'https://evolkov.tech/home',
    kind:'hub',
    links:[
     {href:'/target',anchor:'exact keyword'},
     {href:'/p1',anchor:'read more'}
    ]
   },
   {
    url:'https://evolkov.tech/p1',
    cluster:'orphan-cluster',
    kind:'supporting',
    links:[
     {href:'/target',anchor:'exact keyword'}
    ]
   },
   {
    url:'https://evolkov.tech/p2',
    cluster:'orphan-cluster',
    kind:'supporting',
    links:[
     {href:'/target',anchor:'exact keyword'}
    ]
   },
   {
    url:'https://evolkov.tech/target',
    kind:'page',
    links:[]
   }
  ]
 });
 assert.equal(report.ok,false);
 assert.ok(report.findings.some(f=>f.code==='COCOON_ORPHAN_PAGE'&&f.url==='https://evolkov.tech/p2'));
 assert.ok(report.findings.some(f=>f.code==='COCOON_GENERIC_ANCHOR'));
 assert.ok(report.findings.some(f=>f.code==='COCOON_CLUSTER_MISSING_HUB'));
 assert.ok(report.findings.some(f=>f.code==='COCOON_ANCHOR_CONCENTRATION'));
});

test('auditCocoonGraph exposes REST and MCP audit_semantic_cocoon endpoints',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-cocoon.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const payload={
  siteUrl:'https://evolkov.tech',
  pages:[
   {url:'https://evolkov.tech/hub',cluster:'geo',kind:'hub',links:[{href:'/child',anchor:'geo guide'}]},
   {url:'https://evolkov.tech/child',cluster:'geo',kind:'supporting',links:[{href:'/hub',anchor:'geo hub'}]}
  ]
 };
 const restRes=await fetch(`${api.url}/v1/cocoon-audit`,{
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
   params:{name:'audit_semantic_cocoon',arguments:payload}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const toolData=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(toolData.ok,true);
});
