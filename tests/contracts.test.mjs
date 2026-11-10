import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {Client as ModernClient} from '@modelcontextprotocol/client';
import {StdioClientTransport as ModernTransport} from '@modelcontextprotocol/client/stdio';
import {root,catalog} from '../src/catalog.mjs';
import {buildSite} from '../src/build.mjs';
import {startServer} from '../src/server.mjs';
import {currentEvidenceInputs,inspectFreshness} from '../src/evidence.mjs';
import {adapterSchema} from '../src/adapter.mjs';
import {diagnoseFromPackageJson} from '../src/diagnose-project.mjs';
let server,client,transport;
before(async()=>{
 await buildSite();server=await startServer();
 client=new Client({name:'pilot-contract-check',version:'0.1.0'});
 transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'src/mcp.mjs')],stderr:'pipe'});
 await client.connect(transport);
});
after(async()=>{await client?.close();await server?.close();});
test('MCP lists actual cases, returns clean source, and rejects path injection',async()=>{
 const listing=await client.listTools();assert.equal(listing.tools.length,15);
 const result=JSON.parse((await client.callTool({name:'list_cases',arguments:{query:'phaser'}})).content[0].text);
 assert.equal(result.cases.length,1);assert.equal(result.cases[0].id,'canvas-touch-trap');
 const item=JSON.parse((await client.callTool({name:'get_case',arguments:{id:'nested-scroll-trap'}})).content[0].text);assert.match(item.runCommand,/nested-scroll-trap/);assert.match(item.provenance,/synthetic/);assert.ok(item.applicability);assert.ok(Array.isArray(item.preconditions)&&item.preconditions.length>0);
 assert.equal(item.citationUrl,'https://evolkov.tech/en/tools/web-dev-cases#nested-scroll-trap');
 const methodology=JSON.parse((await client.callTool({name:'get_check_rule',arguments:{id:'editorial:h1-count',language:'ru'}})).content[0].text);assert.match(methodology.title,/H1/);assert.match(methodology.citationUrl,/tools\/reproleaf-methodology#editorial-h1-count/);
 const rules=JSON.parse((await client.callTool({name:'list_check_rules',arguments:{domain:'browser',limit:20}})).content[0].text);assert.equal(rules.total,9);
 const source=JSON.parse((await client.callTool({name:'get_case_source',arguments:{id:'canvas-resize-gap',asset:'fixture'}})).content[0].text);assert.match(source.source,/THREE/);
 const invalid=await client.callTool({name:'get_case_source',arguments:{id:'../../.env',asset:'fixture'}});assert.equal(invalid.isError,true);
 const unknownAsset=await client.callTool({name:'get_case_source',arguments:{id:'canvas-resize-gap',asset:'../../.env'}});assert.equal(unknownAsset.isError,true);
 const resources=await client.listResources();assert.equal(resources.resources.length,catalog.cases.length);
 const resource=await client.readResource({uri:'mwc://cases/modal-close-unreachable'});assert.match(resource.contents[0].text,/acceptance/);
 const diagnosis=JSON.parse((await client.callTool({name:'diagnose_project',arguments:{dependencies:{react:'^19.0.0',next:'15.1.0'},renderMode:'ssr',symptom:'Fixed bottom bar covers focused input field after scrollIntoView',category:'focus'}})).content[0].text);
 assert.equal(diagnosis.kind,'project-diagnosis');
 assert.equal(diagnosis.matchedRules[0].id,'sticky-bar-focus-occlusion');
 assert.ok(diagnosis.matchedRules[0].verificationPlan.independentCheckCondition);
 assert.ok(diagnosis.adapterTemplate.checks.length>0);
 assert.ok(Array.isArray(diagnosis.unverifiedHeuristics)&&diagnosis.unverifiedHeuristics.every(h=>h.status==='unverified-heuristic'));
 const baseReport={at:'2026-11-05T10:00:00.000Z',target:'http://127.0.0.1:4179/fixtures/sticky-bar-focus-occlusion/',viewport:{width:390,height:844},browser:'Chromium 1',executionProfile:{schemaVersion:2,allowNetwork:false,methods:['GET','HEAD'],analyticsPolicy:'known-analytics-blocked-v1',isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',webSockets:'blocked'},blockedMethods:[],blockedTransports:[],targetStateSha256:'d'.repeat(64),checkerSha256:'a'.repeat(64),adapterSha256:'b'.repeat(64),results:[{id:'sticky-bar-focus-occlusion-focus',type:'focus-occlusion',status:'fail'}],runtimeErrors:[]};
 const afterReport={...baseReport,results:[{id:'sticky-bar-focus-occlusion-focus',type:'focus-occlusion',status:'pass'}]};
 const compared=JSON.parse((await client.callTool({name:'compare_check_runs',arguments:{before:baseReport,after:afterReport}})).content[0].text);
 assert.equal(compared.resolved.length,1);
 assert.equal(compared.environmentDiff.viewportChanged,false);
 const viewportChangedReport={...afterReport,viewport:{width:360,height:640}};
 const drifted=JSON.parse((await client.callTool({name:'compare_check_runs',arguments:{before:baseReport,after:viewportChangedReport}})).content[0].text);
 assert.equal(drifted.resolved.length,0);
 assert.equal(drifted.unverified.length,1);
 assert.equal(drifted.environmentDiff.viewportChanged,true);
 const badCompare=await client.callTool({name:'compare_check_runs',arguments:{before:{},after:{}}});
 assert.equal(badCompare.isError,true);
 const badTargetUrl=await client.callTool({name:'diagnose_project',arguments:{targetUrl:'file:///etc/passwd'}});
 assert.equal(badTargetUrl.isError,true);
 assert.ok(adapterSchema.parse(diagnosis.adapterTemplate));
 const pkgDiagnosis=diagnoseFromPackageJson({dependencies:{astro:'^5.0.0'},devDependencies:{typescript:'^5.0.0'}},{symptom:'Disclosure button aria-expanded resets after hydration'});
 assert.equal(pkgDiagnosis.environment.renderMode,'islands');
 assert.equal(pkgDiagnosis.matchedRules[0].id,'ssr-disclosure-hydration-reset');
 assert.ok(adapterSchema.parse(pkgDiagnosis.adapterTemplate));
});
test('MCP requires active application selection and preserves unconfirmed context',async()=>{
 const applications=[{id:'legacy',dependencies:{nuxt:'4'}},{id:'site',dependencies:{astro:'7',react:'19'}}];
 const pending=JSON.parse((await client.callTool({name:'diagnose_project',arguments:{applications}})).content[0].text);assert.equal(pending.status,'needs-application-selection');assert.equal(pending.adapterTemplate,null);
 const selected=JSON.parse((await client.callTool({name:'diagnose_project',arguments:{applications,activeApplication:'site',interaction:{hydratesServerHtml:false}}})).content[0].text);assert.equal(selected.selectedApplication,'site');assert.equal(selected.environment.notableVersions.nuxt,undefined);assert(selected.matchedRules.every(r=>r.category!=='hydration'&&r.verificationStatus==='not-run'));
 assert.equal((await client.callTool({name:'diagnose_project',arguments:{applications,activeApplication:'missing'}})).isError,true);
});

test('preview provides HTML content, noindex headers and loopback-only host handling',async()=>{
 const response=await fetch(server.origin);const text=await response.text();assert.equal(response.status,200);assert.match(response.headers.get('x-robots-tag'),/noindex/);assert.match(text,/<h1>Reproducible mobile web bugs/);assert.equal((text.match(/<h1>/g)||[]).length,1);
 for(const item of catalog.cases){const page=await fetch(server.origin+'/cases/'+item.id+'/');assert.equal(page.status,200);const html=await page.text();assert.match(html,/Independent acceptance check/);assert.match(html,/SYNTHETIC EXAMPLE/);assert.match(html,/name="robots" content="noindex,nofollow"/);}
 assert.equal((await fetch(server.origin+'/.env')).status,404);
 const invalidHostStatus=await new Promise((resolve,reject)=>{const request=http.get(server.origin,{headers:{Host:'attacker.invalid'}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);});
 assert.equal(invalidHostStatus,403);
 assert.equal((await fetch(server.origin,{method:'POST'})).status,405);
});
test('acceptance checks do not read fixture variant, fixed flag or implementation styles',async()=>{
 const source=await readFile(path.join(root,'src/checks.mjs'),'utf8');
 assert.doesNotMatch(source,/URLSearchParams|location\.search|className|classList|touchAction|overscrollBehavior|fixtureReady/);
 for(const item of catalog.cases)assert.match(source,new RegExp(item.id));
});
test('evidence detects changed or missing inputs and never follows saved arbitrary paths',async()=>{
 const current={...await currentEvidenceInputs(),environment:{node:process.version}};
 assert.equal((await inspectFreshness(current)).stale,false);
 const changed=structuredClone(current);changed.sourceHashes['src/checks.mjs']='outdated';
 assert.equal((await inspectFreshness(changed)).stale,true);
 const malicious=structuredClone(current);malicious.sourceHashes['../../.env']='never-read';
 const result=await inspectFreshness(malicious);assert.equal(result.stale,true);assert.ok(result.mismatches.some(m=>m.reason==='unknown recorded source; not read'));
 assert.equal((await inspectFreshness({environment:{node:process.version}})).stale,true);
});
test('MCP also negotiates the pinned 2026 protocol and serves read-only tools',async()=>{
 const modern=new ModernClient({name:'pilot-modern-check',version:'0.1.0'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
 const pipe=new ModernTransport({command:process.execPath,args:[path.join(root,'src/mcp.mjs')],stderr:'pipe'});
 try{
  await modern.connect(pipe);const tools=await modern.listTools();assert.equal(tools.tools.length,15);
  const result=await modern.callTool({name:'get_case',arguments:{id:'canvas-touch-trap'}});
  assert.match(JSON.stringify(result),/canvas-touch-trap/);
 }finally{await modern.close();await pipe.close();}
});
