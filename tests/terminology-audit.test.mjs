import test from 'node:test';
import assert from 'node:assert/strict';
import {auditTerminologyConsistency} from '../src/terminology-audit.mjs';
import {startApi} from '../src/api.mjs';

test('auditTerminologyConsistency passes when canonical entities and casing are consistent',()=>{
 const report=auditTerminologyConsistency({
  text:'Reproleaf runs deterministic checks and exports SARIF reports.',
  glossary:[
   {canonical:'Reproleaf',aliases:['ReproLeaf CLI'],forbidden:['Repro-leaf']},
   {canonical:'SARIF',aliases:['sarif report']}
  ]
 });
 assert.equal(report.ok,true);
 assert.equal(report.summary.canonicalMatches,2);
 assert.equal(report.summary.consistencyScore,1);
 assert.equal(report.findings.length,0);
});

test('auditTerminologyConsistency flags casing drift, aliases and forbidden variants across documents',()=>{
 const report=auditTerminologyConsistency({
  documents:[
   {id:'intro.md',text:'reproleaf integrates with MCP.'},
   {id:'guide.md',text:'Use Repro-leaf or ReproLeaf CLI for audits.'}
  ],
  glossary:[
   {canonical:'Reproleaf',aliases:['ReproLeaf CLI'],forbidden:['Repro-leaf']}
  ]
 });
 assert.equal(report.ok,false);
 assert.equal(report.summary.casingDriftMatches,1);
 assert.equal(report.summary.aliasMatches,1);
 assert.equal(report.summary.forbiddenMatches,1);
 assert.ok(report.findings.some(f=>f.code==='TERMINOLOGY_CASING_DRIFT'));
 assert.ok(report.findings.some(f=>f.code==='TERMINOLOGY_NON_CANONICAL_ALIAS'));
 assert.ok(report.findings.some(f=>f.code==='TERMINOLOGY_FORBIDDEN_VARIANT'));
});

test('auditTerminologyConsistency exposes REST and MCP endpoints',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-terminology.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const payload={
  text:'Reproleaf checks OpenGraph tags.',
  glossary:[{canonical:'Reproleaf'},{canonical:'OpenGraph',aliases:['Open Graph']}]
 };
 const restRes=await fetch(`${api.url}/v1/terminology-audit`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify(payload)
 });
 assert.equal(restRes.status,200);
 const restBody=await restRes.json();
 assert.equal(restBody.summary.canonicalMatches,2);

 const mcpRes=await fetch(`${api.url}/v1/mcp`,{
  method:'POST',
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({
   jsonrpc:'2.0',
   id:1,
   method:'tools/call',
   params:{name:'audit_terminology_consistency',arguments:payload}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const toolData=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(toolData.summary.canonicalMatches,2);
});
