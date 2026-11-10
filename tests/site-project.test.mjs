import {test} from 'node:test';
import {buildRecommendationEvidence} from '../src/recommendation-evidence.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {getSiteProjectContext,resolveSiteProjectConfig,siteProjectInputSchema} from '../src/site-project.mjs';
import {startApi} from '../src/api.mjs';
import {root} from '../src/catalog.mjs';
import {createServer} from '../src/mcp.mjs';

const jobId='54fc8de9-5cb7-4d7f-8bed-201d5b061410',token='synthetic_project_token_for_readonly_tests';
const env={REPROLEAF_SITE_ENDPOINT:'https://evolkov.tech/wp-json/evolkov/v1/reproleaf-crawl',REPROLEAF_SITE_PROJECT_TOKEN:token};
const fixture=()=>({ok:true,job:{id:jobId,state:'partial',engine:'html-v1',url:'https://example.org/start',scopeComplete:false,progress:{completed:2,failed:1,discovered:3,private:token}},pages:[{url:'https://example.org/a?token=private',status:'completed',report:{checks:[{code:'title',status:'attention',message:`Review ${token}`,suggestion:'Supply a descriptive title.'},{code:'h1',status:'good'}]}},{url:'https://example.org/b',status:'completed',report:{checks:[{code:'canonical',status:'problem',message:'Missing declaration'}]}}],graph:{metrics:{scannedPages:2,observedInternalEdges:1,private:token},recommendations:[{source:'https://example.org/a',target:'https://example.org/b',donorExcerpt:`Review ${token}`,suggestedAnchor:'technical audit'}],unresolvedTargets:[{url:'https://example.org/unscanned',state:'not-in-scanned-inventory'}]},comparison:{comparable:false,counts:{new:1,remaining:2,unconfirmed:3,noLongerObserved:0},warnings:[`Partial ${token}`]},private:token,body:'RAW_HTML_NEVER_RETURN'});
const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const expectCode=code=>error=>error.code===code&&!error.message.includes(token);

test('saved site context uses one configured authenticated read and returns compact observed evidence',async()=>{
 let calls=0;
 const result=await getSiteProjectContext({jobId},{env,fetchImpl:async(url,options)=>{calls++;assert.equal(url,`${env.REPROLEAF_SITE_ENDPOINT}/${jobId}/export`);assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.equal(options.headers['X-Reproleaf-Project-Token'],token);assert.equal(options.cache,'no-store');return json(fixture());}});
 assert.equal(calls,1);assert.equal(result.scope.complete,false);assert.equal(result.engine,'html-v1');
 assert.equal(result.priorityChecks[0].status,'problem');assert.equal(result.priorityChecksTotal,2);
 assert.equal(result.graph.recommendations[0].reviewRequired,true);assert.equal(result.comparison.counts.unconfirmed,3);
 assert.equal(result.priorityChecks[1].url,'https://example.org/a');
 assert.doesNotMatch(JSON.stringify(result),new RegExp(`${token}|RAW_HTML_NEVER_RETURN|token=private`));
 assert.equal(result.graph.metrics.private,undefined);assert.equal(result.scope.progress.private,undefined);
});

test('private context preserves only validated location evidence after redaction',async()=>{
 const data=fixture(),candidate=data.graph.recommendations[0];candidate.donorExcerpt='Use HTTP caching.';candidate.suggestedAnchor='HTTP caching';candidate.anchorEvidence=buildRecommendationEvidence(candidate);data.passageEvidence={private:'EXCERPT_PRIVATE_CANARY'};candidate.passageInventory={private:'EXCERPT_PRIVATE_CANARY'};
 let result=await getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(data)});assert.equal(result.graph.recommendations[0].anchorEvidence.status,'literal-span');assert(!JSON.stringify(result).includes('EXCERPT_PRIVATE_CANARY'));
 candidate.donorExcerpt=token+' '+candidate.donorExcerpt;candidate.anchorEvidence=buildRecommendationEvidence(candidate);result=await getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(data)});assert.equal(result.graph.recommendations[0].anchorEvidence.status,'unconfirmed');assert.equal(result.graph.recommendations[0].anchorEvidence.literalSpan,null);assert(!JSON.stringify(result).includes(token));
 candidate.donorExcerpt='Use HTTP caching.';candidate.suggestedAnchor='cache policy';candidate.anchorEvidence=buildRecommendationEvidence(candidate);result=await getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(data)});assert.equal(result.graph.recommendations[0].anchorEvidence.status,'text-edit-required');
});

test('PHP lexical recommendation basis is normalized while unknown bases remain omitted',async()=>{
 const data=fixture();data.graph.recommendations[0].basis='lexical-overlap-in-supplied-excerpt';
 const result=await getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(data)});assert.equal(result.graph.recommendations[0].basis,'lexical');
 data.graph.recommendations[0].basis='semantic-certification';const unknown=await getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(data)});assert.equal(unknown.graph.recommendations[0].basis,undefined);
});

test('compact recommendations retain the three declared target-topic source values',async()=>{
 const data=fixture(),base=data.graph.recommendations[0];
 const sources=['h1','title','leading-title-segment'];
 data.graph.recommendations=sources.map(targetTopicSource=>({...base,targetTopicSource}));
 const output=await getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(data)});
 assert.deepEqual(output.graph.recommendations.map(item=>item.targetTopicSource),sources);
 assert.equal(output.graph.recommendations.every(item=>item.reviewRequired),true);
});

test('missing, unknown and malformed target-topic provenance is omitted rather than inferred',async()=>{
 const data=fixture(),base=data.graph.recommendations[0];
 data.graph.recommendations=[base,...[token,'H1','semantic-model','',null,1,['h1'],{value:'h1'}].map(targetTopicSource=>({...base,targetTopicSource}))];
 const output=await getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(data)});
 for(const item of output.graph.recommendations)assert.equal(Object.hasOwn(item,'targetTopicSource'),false);
 assert.doesNotMatch(JSON.stringify(output.graph.recommendations),new RegExp(token));
});

test('caller cannot provide URLs, paths, tokens or malformed job IDs',async()=>{
 for(const input of [{jobId:'../../.env'},{jobId,url:'https://attacker.org/'},{jobId,token},{jobId,path:'secret'}])assert.equal(siteProjectInputSchema.safeParse(input).success,false);
 let calls=0;await assert.rejects(getSiteProjectContext({jobId,url:'https://attacker.org/'},{env,fetchImpl:async()=>{calls++;return json(fixture());}}));assert.equal(calls,0);
});

test('classified graph metrics and page counts preserve observed values and redact private fields',async()=>{
 const data=fixture();
 data.graph.metrics={observedContentEdges:3,observedNavigationEdges:4,unclassifiedEdges:2,private:token};
 data.graph.pages=[{url:`https://example.org/content?token=${token}`,observedContentIncomingPages:0,observedContentOutgoingPages:3,private:token},{url:`https://example.org/${token}`,observedContentIncomingPages:2,observedContentOutgoingPages:0,observedIncomingPages:99}];
 const output=await getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(data)});
 assert.deepEqual(output.graph.metrics,{observedContentEdges:3,observedNavigationEdges:4,unclassifiedEdges:2});
 assert.deepEqual(output.graph.pages[0],{url:'https://example.org/content',observedContentIncomingPages:0,observedContentOutgoingPages:3});
 assert.equal(output.graph.pages[1].observedContentIncomingPages,2);
 assert.equal(output.graph.pages[1].observedIncomingPages,undefined);
 assert.doesNotMatch(JSON.stringify(output),new RegExp(token));
 assert.match(output.limits.join(' '),/DOM placement, not semantic relevance/);
 assert.match(output.limits.join(' '),/overlap/);
});

test('legacy graph counts stay unknown and invalid classified metrics are not converted to zero',async()=>{
 const data=fixture();
 data.graph.metrics={observedContentEdges:null,observedNavigationEdges:'4',unclassifiedEdges:-1,scannedPages:2};
 data.graph.pages=[{url:'https://example.org/legacy',observedIncomingPages:0,observedOutgoingPages:9},{url:'https://example.org/invalid',observedContentIncomingPages:'2',observedContentOutgoingPages:-1},{url:'https://example.org/unknown',observedContentIncomingPages:null,observedContentOutgoingPages:null}];
 const output=await getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(data)});
 assert.deepEqual(output.graph.metrics,{scannedPages:2});
 assert.equal(output.graph.pages.length,3);
 for(const page of output.graph.pages){assert.equal(page.observedContentIncomingPages,null);assert.equal(page.observedContentOutgoingPages,null);}
 delete data.graph.pages;
 const legacy=await getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(data)});
 assert.deepEqual(legacy.graph.pages,[]);
});

test('compact graph pages cap at twenty and omit unsafe URLs and unknown keys',async()=>{
 const data=fixture();
 data.graph.pages=Array.from({length:25},(_,i)=>({url:`https://example.org/${i}`,observedContentIncomingPages:i,observedContentOutgoingPages:Number.MAX_SAFE_INTEGER+1,secret:token}));
 data.graph.pages[1].url='javascript:alert(1)';data.graph.pages[2].url='https://user:password@example.org/';
 const output=await getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(data)});
 assert.equal(output.graph.pages.length,18);
 assert.equal(output.graph.pages.at(-1).observedContentIncomingPages,19);
 for(const page of output.graph.pages){assert.deepEqual(Object.keys(page),['url','observedContentIncomingPages','observedContentOutgoingPages']);assert.equal(page.observedContentOutgoingPages,null);}
 assert.doesNotMatch(JSON.stringify(output.graph.pages),/secret|password|javascript/);
});

test('compact recommendations preserve only known link region provenance and lexical basis',async()=>{
 const data=fixture(),base=data.graph.recommendations[0];
 data.graph.recommendations=[{...base,existingLinkRegions:['navigation','navigation','other',token,'content','unknown','extra'],donorRegion:'content',basis:'lexical',private:token},{...base,existingLinkRegions:['navigation'],donorRegion:'body',basis:'unverified-model',instructions:token},{...base,existingLinkRegions:'navigation',donorRegion:token,basis:token}];
 const output=await getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(data)}),items=output.graph.recommendations;
 assert.deepEqual(items[0].existingLinkRegions,['navigation','other','content','unknown']);
 assert.equal(items[0].donorRegion,'content');assert.equal(items[0].basis,'lexical');
 assert.deepEqual(items[1].existingLinkRegions,['navigation']);assert.equal(items[1].donorRegion,'body');assert.equal(items[1].basis,undefined);
 assert.deepEqual(items[2].existingLinkRegions,[]);assert.equal(items[2].donorRegion,'unknown');assert.equal(items[2].basis,undefined);
 for(const item of items){assert.equal(item.private,undefined);assert.equal(item.instructions,undefined);assert.equal(item.reviewRequired,true);}
 assert.doesNotMatch(JSON.stringify(items),new RegExp(token));
});

test('endpoint config requires an explicit HTTPS crawler path and a header-safe secret',()=>{
 for(const endpoint of ['', 'http://evolkov.tech/wp-json/evolkov/v1/reproleaf-crawl','https://user:pass@evolkov.tech/wp-json/evolkov/v1/reproleaf-crawl','https://evolkov.tech/wp-json/evolkov/v1/reproleaf-crawl?token=x','https://evolkov.tech/wp-json/evolkov/v1/reproleaf-crawl#x','https://localhost/wp-json/evolkov/v1/reproleaf-crawl','https://127.0.0.1/wp-json/evolkov/v1/reproleaf-crawl','https://evolkov.tech/other'])assert.throws(()=>resolveSiteProjectConfig({...env,REPROLEAF_SITE_ENDPOINT:endpoint}),expectCode('RL_SITE_CONFIG_INVALID'));
 for(const secret of ['', 'short',`${token}\nInjected: header`])assert.throws(()=>resolveSiteProjectConfig({...env,REPROLEAF_SITE_PROJECT_TOKEN:secret}),expectCode('RL_SITE_TOKEN_REQUIRED'));
});

test('cross-host and same-host redirects are rejected before a second authenticated request',async()=>{
 for(const location of ['https://attacker.org/steal',`${env.REPROLEAF_SITE_ENDPOINT}/other`]){
  let calls=0;await assert.rejects(getSiteProjectContext({jobId},{env,fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{Location:location}});}}),expectCode('RL_SITE_REDIRECT_REJECTED'));assert.equal(calls,1);
 }
 const redirected=json(fixture());Object.defineProperty(redirected,'url',{value:'https://attacker.org/steal'});
 await assert.rejects(getSiteProjectContext({jobId},{env,fetchImpl:async()=>redirected}),expectCode('RL_SITE_RESPONSE_URL_REJECTED'));
});

test('request and streaming-body timeout are bounded and never expose transport errors',async()=>{
 let signal;
 await assert.rejects(getSiteProjectContext({jobId},{env,timeoutMs:10,fetchImpl:async(_,options)=>{signal=options.signal;return new Promise(()=>{});}}),expectCode('RL_SITE_TIMEOUT'));assert.equal(signal.aborted,true);
 await assert.rejects(getSiteProjectContext({jobId},{env,timeoutMs:10,fetchImpl:async()=>new Response(new ReadableStream({start(){}}),{headers:{'Content-Type':'application/json'}})}),expectCode('RL_SITE_TIMEOUT'));
 await assert.rejects(getSiteProjectContext({jobId},{env,fetchImpl:async()=>{throw new Error(`Transport leaked ${token}`);}}),expectCode('RL_SITE_REQUEST_FAILED'));
});

test('response bytes are bounded by streamed size and declared size with an absolute8MiB ceiling',async()=>{
 await assert.rejects(getSiteProjectContext({jobId},{env,maxBytes:32,fetchImpl:async()=>json(fixture())}),expectCode('RL_SITE_BODY_TOO_LARGE'));
 await assert.rejects(getSiteProjectContext({jobId},{env,maxBytes:16*1024*1024,fetchImpl:async()=>new Response('{}',{headers:{'Content-Type':'application/json','Content-Length':String(9*1024*1024)}})}),expectCode('RL_SITE_BODY_TOO_LARGE'));
});

test('malformed JSON, content types, statuses and mismatched report identity fail closed',async()=>{
 for(const [response,code] of [[new Response('<html>bad</html>'),'RL_SITE_CONTENT_TYPE_INVALID'],[new Response('{',{headers:{'Content-Type':'application/json'}}),'RL_SITE_RESPONSE_INVALID'],[new Response(token,{status:403}),'RL_SITE_REQUEST_FAILED'],[json({ok:true}),'RL_SITE_SCHEMA_INVALID']])await assert.rejects(getSiteProjectContext({jobId},{env,fetchImpl:async()=>response}),expectCode(code));
 const wrong=fixture();wrong.job.id='db843275-e868-4884-a306-848cf23117b3';await assert.rejects(getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(wrong)}),expectCode('RL_SITE_SCHEMA_INVALID'));
 const unchecked=fixture();unchecked.pages[0].report.checks[0].status='invented';await assert.rejects(getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(unchecked)}),expectCode('RL_SITE_SCHEMA_INVALID'));
});

test('context output caps findings and link suggestions while preserving observed totals',async()=>{
 const data=fixture();data.pages[0].report.checks=Array.from({length:100},(_,i)=>({code:`check-${i}`,status:'attention',message:'m'.repeat(3000)}));data.graph.recommendations=Array.from({length:100},()=>data.graph.recommendations[0]);
 const output=await getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(data)});
 assert.equal(output.priorityChecks.length,30);assert.equal(output.priorityChecksTotal,101);assert.equal(output.graph.recommendations.length,15);assert.equal(output.graph.truncated,true);assert.ok(JSON.stringify(output).length<50000);
});

test('pending and failed pages preserve readiness without inventing completed observations',async()=>{
 const data=fixture();data.job.state='running';data.pages.push({url:'https://example.org/pending',status:'queued'},{url:'https://example.org/failed',status:'failed',report:null});data.graph={};data.comparison={};
 const output=await getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(data)});
 assert.equal(output.readiness.state,'in-progress');assert.equal(output.scope.observedPages,2);assert.equal(output.scope.inventoryPages,4);assert.equal(output.priorityChecksTotal,2);assert.equal(output.comparison.available,false);
 data.pages[0].report=null;await assert.rejects(getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(data)}),expectCode('RL_SITE_SCHEMA_INVALID'));
 const empty=fixture();empty.job.state='queued';empty.pages=[];empty.graph={};empty.comparison={};
 const pending=await getSiteProjectContext({jobId},{env,fetchImpl:async()=>json(empty)});assert.equal(pending.readiness.checksAvailable,false);assert.equal(pending.readiness.state,'in-progress');
});

test('job UUID can default to an explicit local environment setting',async()=>{
 const result=await getSiteProjectContext({},{env:{...env,REPROLEAF_SITE_JOB_ID:jobId},fetchImpl:async()=>json(fixture())});assert.equal(result.jobId,jobId);
 await assert.rejects(getSiteProjectContext({},{env,fetchImpl:async()=>json(fixture())}),expectCode('RL_SITE_JOB_REQUIRED'));
 await assert.rejects(getSiteProjectContext({},{env:{...env,REPROLEAF_SITE_JOB_ID:token},fetchImpl:async()=>json(fixture())}),expectCode('RL_SITE_JOB_REQUIRED'));
});

test('public mode cannot use operator server credentials or expose the private tool',async()=>{
 let calls=0;await assert.rejects(getSiteProjectContext({jobId},{env,publicMode:true,fetchImpl:async()=>{calls++;return json(fixture());}}),expectCode('RL_SITE_PRIVATE_TOOL'));assert.equal(calls,0);
 const client=new Client({name:'public-site-contract',version:'1.0.0'}),transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'src/mcp.mjs')],env:{...process.env,...env,REPROLEAF_PUBLIC_MCP:'1'},stderr:'pipe'});
 try{await client.connect(transport);assert.equal((await client.listTools()).tools.some(tool=>tool.name==='get_site_project_context'),false);await assert.rejects(client.callTool({name:'get_site_project_context',arguments:{jobId}}),/not found/);}finally{await client.close();}
 const api=await startApi({port:0});
 try{const response=await fetch(`${api.url}/v1/mcp`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});const body=await response.json();assert.equal(body.result.tools.some(tool=>tool.name==='get_site_project_context'),false);}finally{await api.close();}
});

test('private MCP registration executes the saved-context tool with injected transport and read-only annotations',async()=>{
 const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
 const server=createServer({publicMode:false,siteProjectOptions:{env,fetchImpl:async()=>json(fixture())}}),client=new Client({name:'private-site-contract',version:'1.0.0'});
 try{
  await server.connect(serverTransport);await client.connect(clientTransport);
  const tool=(await client.listTools()).tools.find(item=>item.name==='get_site_project_context');
  assert.equal(tool.annotations.readOnlyHint,true);assert.equal(tool.annotations.destructiveHint,false);
  const result=await client.callTool({name:'get_site_project_context',arguments:{jobId}});
  assert.equal(result.isError,undefined);assert.equal(JSON.parse(result.content[0].text).kind,'private-site-project-context');assert.doesNotMatch(JSON.stringify(result),new RegExp(token));
  const rejected=await client.callTool({name:'get_site_project_context',arguments:{jobId,url:'https://attacker.org/'}});assert.equal(rejected.isError,true);
 }finally{await client.close();await server.close();}
});
