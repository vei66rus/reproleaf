import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {getSiteProjectContext} from '../src/site-project.mjs';
import {createServer} from '../src/mcp.mjs';

const jobId='54fc8de9-5cb7-4d7f-8bed-201d5b061410';
const token='synthetic_comparison_project_token';
const privateId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const canary='PRIVATE_COMPARISON_EVIDENCE_NEVER_RETURN';
const env={REPROLEAF_SITE_ENDPOINT:'https://evolkov.tech/wp-json/evolkov/v1/reproleaf-crawl',REPROLEAF_SITE_PROJECT_TOKEN:token};
const comparison=()=>({schemaVersion:2,comparable:false,partialComparable:true,comparisonScope:'matched-successful-pages',verificationComplete:false,counts:{new:0,remaining:0,noLongerObserved:2,verifiedResolved:2,unconfirmed:1},coverage:{baselinePages:3,currentPages:3,commonUrls:3,successfulCommonUrls:2,comparablePages:2,expectedRulePairs:33,comparableRulePairs:22,unconfirmedRulePairs:11,baselineOnlyPages:0,currentOnlyPages:0},warnings:['run-incomplete'],verifiedResolved:[{projectId:privateId,rawHtml:canary}],pageComparisons:[{comparisonEvidence:{accessToken:token,jobId:privateId,body:canary}}],receivedHtmlSha256:canary});
const fixture=()=>({ok:true,job:{id:jobId,state:'partial',engine:'a'.repeat(64),url:'https://example.org/',scopeComplete:false,progress:{completed:2,failed:1}},pages:[{url:'https://example.org/a',status:'completed',report:{checks:[]}},{url:'https://example.org/b',status:'completed',report:{checks:[]}},{url:'https://example.org/c',status:'failed',report:null}],comparison:comparison()});
const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const read=data=>getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(data)});

test('v2 partial proof scope and bounded coverage survive the private context adapter',async()=>{
 const data=fixture(),result=await read(data),actual=result.comparison;
 assert.equal(actual.schemaVersion,2);assert.equal(actual.comparable,false);assert.equal(actual.partialComparable,true);
 assert.equal(actual.comparisonScope,'matched-successful-pages');assert.equal(actual.verificationComplete,false);
 assert.equal(actual.counts.verifiedResolved,2);assert.deepEqual(actual.coverage,data.comparison.coverage);
 assert.match(result.limits.join(' '),/not independent verification/);
 assert.match(result.limits.join(' '),/formerly good checks/);
 assert.match(result.limits.join(' '),/Legacy or unknown comparison/);
});

test('v2 complete or empty comparable scope is preserved only as server-reported flags',async()=>{
 const data=fixture();Object.assign(data.comparison,{comparable:true,partialComparable:false,comparisonScope:'full-snapshot',verificationComplete:true});
 const result=await read(data);assert.equal(result.comparison.verificationComplete,true);assert.equal(result.comparison.partialComparable,false);assert.equal(result.comparison.comparisonScope,'full-snapshot');
 Object.assign(data.comparison,{comparable:false,partialComparable:false,comparisonScope:'none',verificationComplete:false});data.comparison.counts.verifiedResolved=0;
 const none=await read(data);assert.equal(none.comparison.comparisonScope,'none');assert.equal(none.comparison.counts.verifiedResolved,0);
});

test('legacy and unknown versions cannot inherit invented v2 verification fields',async()=>{
 for(const schemaVersion of [1,undefined,3,'2',null]){
  const data=fixture();data.comparison.schemaVersion=schemaVersion;
  const result=await read(data),actual=result.comparison;
  assert.equal(actual.schemaVersion,schemaVersion===1?1:null);
  assert.equal(actual.partialComparable,null);assert.equal(actual.verificationComplete,null);assert.equal(actual.comparisonScope,'unknown');
  assert.deepEqual(actual.coverage,{});assert.equal(actual.counts.verifiedResolved,null);
  assert.equal(actual.counts.noLongerObserved,2,'The legacy reported count should not be relabeled as verified.');
 }
});

test('missing or malformed v2 proof metadata remains unknown instead of zero',async()=>{
 const data=fixture();Object.assign(data.comparison,{partialComparable:'true',verificationComplete:1,comparisonScope:canary});delete data.comparison.counts.verifiedResolved;delete data.comparison.coverage;
 const result=await read(data);
 assert.equal(result.comparison.partialComparable,null);assert.equal(result.comparison.verificationComplete,null);assert.equal(result.comparison.comparisonScope,'unknown');
 assert.equal(result.comparison.counts.verifiedResolved,null,'Clipped raw array length must not be used as the total verified count.');assert.deepEqual(result.comparison.coverage,{});
 assert.ok(!JSON.stringify(result).includes(canary));
});

test('comparison coverage accepts only allowlisted finite integer values within input budgets',async()=>{
 const data=fixture();data.comparison.coverage={baselinePages:1000,currentPages:1001,commonUrls:0,successfulCommonUrls:'2',comparablePages:-1,expectedRulePairs:11000,comparableRulePairs:11001,unconfirmedRulePairs:0.5,baselineOnlyPages:null,currentOnlyPages:0,private:token,projectId:privateId,receivedHtmlBytes:999,receivedHtmlSha256:canary};
 const output=(await read(data)).comparison.coverage;
 assert.deepEqual(output,{baselinePages:1000,commonUrls:0,expectedRulePairs:11000,currentOnlyPages:0});
});

test('verified correction totals are bounded and never inferred from rows or legacy aliases',async()=>{
 for(const value of [-1,0.5,'2',null,11001,Number.MAX_SAFE_INTEGER]){
  const data=fixture();data.comparison.counts.verifiedResolved=value;
  assert.equal((await read(data)).comparison.counts.verifiedResolved,null,String(value));
 }
 for(const value of [0,2,11000]){
  const data=fixture();data.comparison.counts.verifiedResolved=value;
  assert.equal((await read(data)).comparison.counts.verifiedResolved,value);
 }
});

test('comparison normalization does not expose raw rule rows, run lineage, hashes or capability values',async()=>{
 const result=await read(fixture()),actual=result.comparison;
 assert.deepEqual(Object.keys(actual),['available','schemaVersion','comparable','partialComparable','comparisonScope','verificationComplete','counts','coverage','warnings']);
 for(const forbidden of ['verifiedResolved','pageComparisons','comparisonEvidence','receivedHtmlSha256','projectId','jobId'])assert.equal(Object.hasOwn(actual,forbidden),false);
 for(const secret of [token,privateId,canary])assert.ok(!JSON.stringify(result).includes(secret));
});

test('real local MCP tool returns the compact v2 scope without fetching extra endpoints',async()=>{
 let calls=0;
 const server=createServer({publicMode:false,siteProjectOptions:{env,fetchImpl:async(url,options)=>{calls++;assert.equal(url,env.REPROLEAF_SITE_ENDPOINT+'/'+jobId+'/export');assert.equal(options.method,'GET');return json(fixture());}}});
 const client=new Client({name:'comparison-context-contract',version:'1.0'}),[clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(serverTransport);await client.connect(clientTransport);
  const response=await client.callTool({name:'get_site_project_context',arguments:{jobId}});
  assert.notEqual(response.isError,true);const result=JSON.parse(response.content.find(item=>item.type==='text').text);
  assert.equal(calls,1);assert.equal(result.comparison.partialComparable,true);assert.equal(result.comparison.counts.verifiedResolved,2);assert.equal(result.comparison.coverage.comparableRulePairs,22);
  for(const secret of [token,privateId,canary])assert.ok(!JSON.stringify(result).includes(secret));
 }finally{await client.close();await server.close();}
});
