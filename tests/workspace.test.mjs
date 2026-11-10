import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {root} from '../src/catalog.mjs';
import {reviewEditorial} from '../src/editorial-core.mjs';
import {auditBlog} from '../src/blog-graph.mjs';
import {inventoryFromHtml} from '../src/import-html.mjs';
import {startApi} from '../src/api.mjs';
const packet=()=>({schemaVersion:1,locale:'en',market:'',primaryQuery:'testing',readerTask:'',article:{title:'Testing',description:'',h1Mode:'renderer',markdown:'Testing observation.'},sources:[],claims:[],glossary:[],reviewedSections:[]});
test('traffic lights preserve unknown H1 and missing evidence; observations are not green evidence',()=>{
 const p=packet();p.claims=[{id:'observation',text:'Testing observation.',kind:'observation',sourceIds:[]}];
 const r=reviewEditorial(p),status=code=>r.diagnostics.checks.find(c=>c.code===code).status;
 assert.equal(status('h1'),'unchecked');assert.equal(status('sources'),'attention');assert.equal(status('terminology'),'unchecked');assert.equal(status('query-title'),'good');
 p.claims[0].kind='fact';assert.equal(reviewEditorial(p).diagnostics.checks.find(c=>c.code==='sources').status,'problem');
});
test('sitemap-only inventories do not manufacture link counts or orphan findings',()=>{
 const result=auditBlog({schemaVersion:1,siteUrl:'https://example.com',evidenceScope:'urls-only',coverage:'XML URLs only',pages:[{url:'https://example.com/a',title:'/a',links:[]}]});
 assert.equal(result.summary.distinctInternalEdges,null);assert.equal(result.summary.noObservedIncoming,null);assert.deepEqual(result.findings,[]);assert.deepEqual(result.edges,[]);
});
test('HTML adapter honors base, ignores scripts and forms, and does not execute source',()=>{
 const data=inventoryFromHtml([{url:'https://example.com/article/',html:'<title>Source</title><base href="/guides/"><main><h1>Heading</h1><a href="child/">Child</a><script>throw Error("RUN")</script><form>PRIVATE_FORM</form></main>'}], 'https://example.com');
 assert.equal(data.pages[0].links[0].href,'https://example.com/guides/child/');assert.equal(data.pages[0].h1,'Heading');assert.doesNotMatch(data.pages[0].text,/PRIVATE_FORM|RUN/);
});
test('local API shares the core and rejects foreign Origin, invalid bodies and excessive payloads',async()=>{
 const api=await startApi({port:0,maxBytes:2048});try{
  const result=await fetch(api.url+'/v1/editorial',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(packet())});assert.equal(result.status,200);assert.deepEqual(await result.json(),reviewEditorial(packet()));
  assert.equal((await fetch(api.url+'/v1/editorial',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://unrelated.example'},body:'{}'})).status,403);
  assert.equal((await fetch(api.url+'/v1/editorial',{method:'POST',headers:{'Content-Type':'application/json',Origin:'null'},body:'{}'})).status,403);
  assert.equal((await fetch(api.url+'/v1/editorial',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(3000)})).status,413);
  assert.equal((await fetch(api.url+'/v1/editorial',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
  assert.equal((await fetch(api.url+'/v1/editorial')).status,405);
  const health=await (await fetch(api.url+'/health')).json();
  assert.equal(health.readOnly,true);
  assert.equal(health.limits.maxBytes,2048);
  const schemas=await (await fetch(api.url+'/v1/schemas')).json();
  assert.equal(schemas.schemaVersion,1);
  assert.ok(schemas.schemas.editorial);
  assert.ok(schemas.schemas.blog);
  assert.ok(schemas.schemas.adapter);
  assert.ok(schemas.schemas.diagnose);
  assert.ok(schemas.schemas.aiReview);
  assert.ok(schemas.examples.aiReview);
  assert.ok(Array.isArray(schemas.findingCodes.editorial));
  assert.ok(Array.isArray(schemas.errorCodes));
  const casesResp=await (await fetch(api.url+'/v1/cases')).json();
  assert.equal(casesResp.total,9);
  assert.ok(Array.isArray(casesResp.unverifiedHeuristics));
  const clientsResp=await (await fetch(api.url+'/v1/clients')).json();
  assert.equal(clientsResp.clients.some(c=>c.id==='codex'&&c.verifiedLocalStdio===true),true);
  assert.equal(clientsResp.clients.some(c=>c.id==='claude-code'&&c.verifiedLocalStdio===true),true);
  assert.equal(clientsResp.clients.some(c=>c.id==='gemini-cli'&&c.verifiedLocalStdio===true),true);
  assert.equal(clientsResp.clients.some(c=>c.id==='chatgpt'&&c.verifiedLocalStdio===false),true);
  const diagResp=await fetch(api.url+'/v1/diagnose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stack:'react',category:'forms',symptom:'Duplicate async submit'})});
  assert.equal(diagResp.status,200);
  const diagJson=await diagResp.json();
  assert.equal(diagJson.matchedRules[0].id,'async-submit-double-fire');
 }finally{await api.close();}
 const limitedApi=await startApi({port:0,rateLimitPerMinute:3});
 try{
  const r1=reviewEditorial(packet()),p2=packet();p2.article.description='Added description.';const r2=reviewEditorial(p2);
  const cmpResp=await fetch(limitedApi.url+'/v1/compare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({before:r1,after:r2})});
  assert.equal(cmpResp.status,200);
  const cmpJson=await cmpResp.json();
  assert.equal(cmpJson.resolved.some(f=>f.code==='description-not-provided'),true);
  assert.equal((await fetch(limitedApi.url+'/health')).status,200);
  assert.equal((await fetch(limitedApi.url+'/health')).status,200);
  const throttled=await fetch(limitedApi.url+'/health');
  assert.equal(throttled.status,429);
  assert.ok(throttled.headers.get('retry-after'));
  const throttledJson=await throttled.json();
  assert.equal(throttledJson.code,'RL_RATE_LIMIT');
 }finally{await limitedApi.close();}
 const mcpApi=await startApi({port:0});
 try{
  const initRes=await (await fetch(mcpApi.url+'/v1/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test-client',version:'1.0'}}})})).json();
  assert.equal(initRes.result.serverInfo.name,'reproleaf-public');
  const listRes=await (await fetch(mcpApi.url+'/v1/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})})).json();
  const toolNames=listRes.result.tools.map(t=>t.name);
  assert.equal(toolNames.includes('diagnose_project'),true);
  assert.equal(toolNames.includes('get_latest_evidence'),false);
  assert.equal(toolNames.includes('get_case_source'),false);
  const callRes=await (await fetch(mcpApi.url+'/v1/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'diagnose_project',arguments:{stack:'react',category:'forms'}}})})).json();
  assert.equal(callRes.result.isError,false);
  assert.match(callRes.result.content[0].text,/async-submit-double-fire/);
  const restrictedCall=await (await fetch(mcpApi.url+'/v1/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'get_latest_evidence',arguments:{id:'nested-scroll-trap'}}})})).json();
  assert.equal(restrictedCall.error.code,-32601);
 }finally{await mcpApi.close();}
 let releaseSlow;
 const slowPromise=new Promise(resolve=>{releaseSlow=resolve;});
 const concApi=await startApi({port:0,maxConcurrent:1,beforeProcess:()=>slowPromise});
 try{
  const firstReq=fetch(concApi.url+'/v1/diagnose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stack:'html'})});
  await new Promise(resolve=>setTimeout(resolve,30));
  const secondRes=await fetch(concApi.url+'/v1/diagnose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stack:'html'})});
  assert.equal(secondRes.status,429);
  const secondJson=await secondRes.json();
  assert.equal(secondJson.code,'RL_CONCURRENCY_LIMIT');
  releaseSlow();
  assert.equal((await firstReq).status,200);
 }finally{await concApi.close();}
 const timeoutApi=await startApi({port:0,requestTimeoutMs:40,beforeProcess:()=>new Promise(resolve=>setTimeout(resolve,120))});
 try{
  const timedOutRes=await fetch(timeoutApi.url+'/v1/diagnose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stack:'html'})});
  assert.equal(timedOutRes.status,408);
  const timedOutJson=await timedOutRes.json();
  assert.equal(timedOutJson.code,'RL_REQUEST_TIMEOUT');
 }finally{await timeoutApi.close();}
});
test('AI review layer enforces explicit enablement, durable budget reservations, disclosure and inventory URL restrictions',async(t)=>{
 const ledgerDir=await mkdtemp(path.join(os.tmpdir(),'reproleaf-ai-'));t.after(()=>rm(ledgerDir,{recursive:true,force:true}));
 const enabledOptions={enabled:true,inputPricePerMillion:.15,outputPricePerMillion:.60,envPath:'nonexistent.env'};
 const disabledApi=await startApi({port:0,aiOptions:{apiKey:'',envPath:'nonexistent.env'}});
 try{
  const st=await (await fetch(disabledApi.url+'/v1/ai-status')).json();
  assert.equal(st.enabled,false);
  assert.equal(st.policy.keysOnServerOnly,true);
  assert.equal(Object.hasOwn(st,'apiKey'),false);
  const res=await fetch(disabledApi.url+'/v1/ai-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:'ru',focus:'priorities',includeDraft:false,report:{kind:'editorial-review',findings:[{code:'description-not-provided',severity:'warning',message:'Description missing'}],allowedUrls:['/guide/caching']}})});
  assert.equal(res.status,503);
  const errBody=await res.json();
  assert.equal(errBody.code,'RL_AI_DISABLED');
 }finally{await disabledApi.close();}

 const mockFetch=async()=>({
  ok:true,
  status:200,
  json:async()=>({
   usage:{prompt_tokens:500,completion_tokens:300},
   choices:[{
    message:{
     content:JSON.stringify({
      summary:'Add a meta description and link only to existing inventory pages.',
      priorities:[
       {rank:1,findingCode:'description-not-provided',title:'Supply meta description',rationale:'Helps SERP snippet clarity.',suggestedRewrite:'Clear description of cache TTL.',targetUrl:'/guide/caching',verificationStep:'Rerun editorial check.'},
       {rank:2,findingCode:'fabricated-code',title:'Hallucinated target test',rationale:'Testing URL filter.',suggestedRewrite:'Link here.',targetUrl:'/broken-unverified-link',verificationStep:'Rerun check.'}
      ],
      linkPlan:[
       {sourceUrl:'/guide/caching',targetUrl:'/guide/invalidation',suggestedAnchor:'cache invalidation',placementHint:'Section 2',rationale:'Same cluster'},
       {sourceUrl:'/guide/caching',targetUrl:'/non-existent-page',suggestedAnchor:'bad link',placementHint:'Footer',rationale:'Hallucinated'}
      ],
      limitations:['Does not verify live HTTP status codes.']
     })
    }
   }]
  })
 });

 const activeApi=await startApi({port:0,aiOptions:{...enabledOptions,ledgerPath:path.join(ledgerDir,'active.json'),apiKey:'sk-test-valid-server-side-key-1234567890',model:'gpt-4o-mini',dailyBudgetUsd:0.0045,fetchImpl:mockFetch}});
 try{
  const payload={
   language:'en',
   focus:'linking',
   includeDraft:false,
   report:{
    kind:'editorial-review',
    findings:[
     {code:'description-not-provided',severity:'warning',message:'Meta description not supplied.'},
     {code:'unknown-internal-target',severity:'error',message:'Unknown internal target.',record:'/broken-unverified-link'}
    ],
    allowedUrls:['/guide/caching','/guide/invalidation']
   }
  };
  const first=await fetch(activeApi.url+'/v1/ai-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(first.status,200);
  const body=await first.json();
  assert.equal(body.ok,true);
  assert.equal(body.disclosure.draftIncluded,false);
  assert.equal(body.disclosure.allowedUrlCount,2);
  assert.equal(body.review.status,'ai-hypothesis-unverified');
  assert.equal(body.review.verifiedFact,false);
  assert.equal(body.review.priorities[0].targetUrl,'/guide/caching');
  assert.equal(body.review.priorities[1].targetUrl,null);
  assert.equal(body.review.priorities[1].findingCode,'description-not-provided');
  assert.equal(body.review.linkPlan.length,1);
  assert.equal(body.review.linkPlan[0].targetUrl,'/guide/invalidation');
  assert.equal(body.review.guardrails.droppedHallucinatedUrls,2);

  const second=await fetch(activeApi.url+'/v1/ai-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(second.status,200);
  const third=await fetch(activeApi.url+'/v1/ai-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(third.status,429);
  const thirdBody=await third.json();
  assert.equal(thirdBody.code,'RL_AI_BUDGET_EXCEEDED');
 }finally{await activeApi.close();}

 let releaseUpstream;
 const upstreamGate=new Promise(resolve=>{releaseUpstream=resolve;});
 const slowFetch=async()=>{
  await upstreamGate;
  return mockFetch();
 };
 const inflightApi=await startApi({port:0,aiOptions:{...enabledOptions,ledgerPath:path.join(ledgerDir,'inflight.json'),apiKey:'sk-test-valid-server-side-key-1234567890',model:'gpt-4o-mini',dailyBudgetUsd:0.0022,fetchImpl:slowFetch}});
 try{
  const reqBody=JSON.stringify({language:'en',focus:'priorities',includeDraft:false,report:{kind:'editorial-review',findings:[{code:'description-not-provided',severity:'warning',message:'Missing'}],allowedUrls:['/guide/caching']}});
  const p1=fetch(inflightApi.url+'/v1/ai-review',{method:'POST',headers:{'Content-Type':'application/json'},body:reqBody});
  await new Promise(resolve=>setTimeout(resolve,30));
  const p2=await fetch(inflightApi.url+'/v1/ai-review',{method:'POST',headers:{'Content-Type':'application/json'},body:reqBody});
  assert.equal(p2.status,429);
  const p2Body=await p2.json();
  assert.equal(p2Body.code,'RL_AI_BUDGET_EXCEEDED');
  releaseUpstream();
  assert.equal((await p1).status,200);
 }finally{await inflightApi.close();}
});

test('Sanitized public sharing, voluntary contribution validation, and activeTab extension contract',async()=>{
 const api=await startApi({port:0});
 try{
  const sanRes=await fetch(api.url+'/v1/sanitize-report',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({
    report:{
     kind:'editorial-review',
     summary:{errors:1,warnings:1},
     findings:[
      {
       code:'unknown-internal-target',
       severity:'error',
       message:'Contact editor@internal.corp or key sk-secret1234567890abcdef or Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 or OPENAI_API_KEY=supersecretvalue in C:\\Users\\MainUser\\secret.txt',
       observation:'Page "Cache" (https://internal-staging.corp/guide/cache?token=abc#sec) has 0 incoming links.',
       suggestion:'Link from https://internal-staging.corp/hub?preview=1.',
       record:'https://internal-staging.corp/guide/cache?token=abc#sec',
       snippet:'private draft text that must be omitted by default'
      }
     ],
     strengths:[{code:'heading-hierarchy',message:'No heading level gaps.'}]
    },
    stripOrigin:true,
    includeSnippets:false,
    language:'ru'
   })
  });
  assert.equal(sanRes.status,200);
  const sanitized=await sanRes.json();
  assert.equal(sanitized.format,'reproleaf-sanitized-report');
  assert.equal(sanitized.redactionPolicy.draftRemoved,true);
  assert.equal(sanitized.redactionPolicy.originStripped,true);
  assert.equal(sanitized.findings[0].record,'/guide/cache');
  assert.equal(sanitized.findings[0].observation,'Page "Cache" (/guide/cache) has 0 incoming links.');
  assert.equal(sanitized.findings[0].suggestion,'Link from /hub.');
  assert.equal(sanitized.findings[0].snippet,undefined);
  assert.ok(!sanitized.findings[0].message.includes('editor@internal.corp'));
  assert.ok(!sanitized.findings[0].message.includes('sk-secret1234567890abcdef'));
  assert.ok(!sanitized.findings[0].message.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
  assert.ok(!sanitized.findings[0].message.includes('supersecretvalue'));
  assert.ok(!sanitized.findings[0].message.includes('C:\\Users\\MainUser'));
  assert.ok(sanitized.attributionBadge.markdown.includes('Reproleaf'));
  assert.match(sanitized.fingerprintSha256,/^[a-f0-9]{64}$/);

  const validContribution={
   id:'synthetic-sticky-header-overlap',
   title:'Sticky header covers anchor scroll target on mobile viewport',
   stack:'HTML / CSS',
   category:'scroll',
   symptom:'Navigating to an in-page hash link leaves the target heading hidden underneath a fixed top navigation bar.',
   applicability:'Pages with fixed or sticky headers and in-page table of contents links.',
   versions:'Chromium 130+, mobile viewport 360x640 and 390x844',
   preconditions:['Fixed header height is at least 56px','Target heading has no scroll-margin-top'],
   steps:['Navigate to #section-2 at 360x640','Measure target heading top relative to fixed header bottom'],
   expected:'Target heading top is at or below the bottom edge of the fixed header.',
   acceptance:'broken variant overlaps header; fixed variant with scroll-margin-top clears header at 360x640 and 390x844.',
   fixSummary:'Add scroll-margin-top matching the sticky header height on anchor targets.',
   limitations:['Does not test smooth scroll timing animations on physical iOS Safari.'],
   syntheticSource:'<!doctype html><header style="position:fixed;top:0;height:64px">Nav</header><main><h2 id="s2" style="scroll-margin-top:72px">Section</h2></main>',
   authorAttribution:'Community Contributor',
   publicationConsent:true,
   noPrivateDataConfirmed:true
  };

  const contribOk=await fetch(api.url+'/v1/contribution-preview',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify(validContribution)
  });
  assert.equal(contribOk.status,200);
  const contribBody=await contribOk.json();
  assert.equal(contribBody.format,'reproleaf-contribution-packet');
  assert.equal(contribBody.status,'pending-independent-verification');
  assert.equal(contribBody.candidateCase.id,'synthetic-sticky-header-overlap');
  assert.match(contribBody.provenance.sourceSha256,/^[a-f0-9]{64}$/);

  const leakyContribution={
   ...validContribution,
   syntheticSource:'const key = "sk-proj-1234567890abcdefghijklmno";'
  };
  const contribLeak=await fetch(api.url+'/v1/contribution-preview',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify(leakyContribution)
  });
  assert.equal(contribLeak.status,400);
  const leakBody=await contribLeak.json();
  assert.equal(leakBody.code,'RL_PRIVATE_DATA_DETECTED');
 }finally{await api.close();}

 const extManifestRaw=await readFile(path.join(root,'integrations/chrome-extension/manifest.json'),'utf8');
 const extManifest=JSON.parse(extManifestRaw);
 assert.equal(extManifest.manifest_version,3);
 assert.deepEqual(extManifest.permissions,['activeTab','scripting']);
 assert.equal(extManifest.host_permissions,undefined);
 assert.equal(extManifest.background,undefined);
});
