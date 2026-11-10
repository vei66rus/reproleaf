import http from 'node:http';
import {version} from './version.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {editorialSchema,reviewEditorial} from './editorial-core.mjs';
import {blogSchema,auditBlog} from './blog-graph.mjs';
import {adapterSchema} from './adapter.mjs';
import {diagnoseSchema,diagnoseProject} from './diagnose-project.mjs';
import {compareReports} from './history.mjs';
import {catalog,getCase} from './catalog.mjs';
import {findingCodeCatalog,errorCodeCatalog,clientSetups} from './client-setups.mjs';
import {aiReviewRequestSchema,resolveAiConfig,createAiBudgetTracker,runAiReview} from './ai-review.mjs';
import {sanitizeReportSchema,contributionSchema,sanitizeReportForSharing,prepareContributionPacket} from './public-share.mjs';
import {caseCitationUrl,listCheckRules,getCheckRule,listCheckRulesSchema,getCheckRuleSchema} from './check-rules.mjs';
import {publicGatewayLimits,parsePublicRpc,rpcError,assertPublicRequestBudget,proxyClientIdentity,exactOriginAllowed,normalizePeer,acceptsPublicMcp} from './public-gateway-policy.mjs';
import {getServerInstructions} from './server-instructions.mjs';

const compareInputSchema=z.object({
 before:z.record(z.string(),z.unknown()),
 after:z.record(z.string(),z.unknown())
}).strict();

const listCasesInputSchema=z.object({
 query:z.string().max(120).optional(),
 limit:z.number().int().min(1).max(20).default(10),
 offset:z.number().int().min(0).max(10000).default(0)
}).strict();

const caseIdSchema=z.object({id:z.enum(catalog.cases.map(c=>c.id))}).strict();

const precomputedSchemas={
 schemaVersion:1,
 publicGatewayLimits,
 schemas:{
  editorial:z.toJSONSchema(editorialSchema),
  blog:z.toJSONSchema(blogSchema),
  adapter:z.toJSONSchema(adapterSchema),
  diagnose:z.toJSONSchema(diagnoseSchema),
  aiReview:z.toJSONSchema(aiReviewRequestSchema),
  sanitizeReport:z.toJSONSchema(sanitizeReportSchema),
  contribution:z.toJSONSchema(contributionSchema)
 },
 findingCodes:findingCodeCatalog,
 errorCodes:errorCodeCatalog,
 examples:{
  editorial:{endpoint:'POST /v1/editorial',payload:{schemaVersion:1,locale:'en',market:'',primaryQuery:'cache invalidation',readerTask:'Choose a TTL strategy',article:{title:'Cache invalidation guide',description:'Overview of TTL and event-based invalidation.',h1Mode:'renderer',markdown:'Cache invalidation keeps responses fresh.\n\n## TTL strategy\n\nSet explicit bounds.'},sources:[],claims:[],glossary:[],reviewedSections:[]}},
  blog:{endpoint:'POST /v1/blog',payload:{schemaVersion:1,siteUrl:'https://example.org',coverage:'Stored article links',pages:[{url:'https://example.org/a/',title:'Guide A',text:'Cache invalidation guide',links:[]}]}},
  diagnose:{endpoint:'POST /v1/diagnose',payload:{stack:'react',renderMode:'ssr',category:'focus',symptom:'Fixed bottom bar covers focused input after scrollIntoView'}},
  compare:{endpoint:'POST /v1/compare',payload:{before:{findings:[]},after:{findings:[]}}},
  aiReview:{endpoint:'POST /v1/ai-review',payload:{language:'en',focus:'priorities',projectId:'default',includeDraft:false,report:{kind:'editorial-review',findings:[{code:'description-not-provided',severity:'warning',message:'Meta description was not supplied.'}],allowedUrls:['/guide/caching']}}},
  sanitizeReport:{endpoint:'POST /v1/sanitize-report',payload:{report:{kind:'editorial-review',findings:[{code:'description-not-provided',severity:'warning',message:'Meta description was not supplied.'}]},stripOrigin:true,includeSnippets:false,language:'en'}},
  contribution:{endpoint:'POST /v1/contribution-preview',payload:{id:'drawer-scroll-lock-escape',title:'Body scroll lock remains active after drawer unmounts',stack:'Vue',category:'scroll',symptom:'Document remains non-scrollable after closing a mobile navigation drawer.',applicability:'Vue 3 SPA drawers toggling overflow hidden on documentElement.',versions:'Vue 3.5+, Chromium mobile',preconditions:['Mobile viewport 390x844'],steps:['Open navigation drawer','Close drawer','Swipe up on main content'],expected:'Main document scrolls vertically after drawer closes.',acceptance:'window.scrollY increases by at least 60px after touch-scroll gesture.',fixSummary:'Restore documentElement overflow in onUnmounted cleanup.',limitations:['Chromium viewport emulation only'],syntheticSource:'export function mountDrawer(root){root.innerHTML="<div class=drawer>Synthetic</div>";}',publicationConsent:true,noPrivateDataConfirmed:true}}
 }
};

const publicBlogSchema=blogSchema.extend({pages:blogSchema.shape.pages.max(publicGatewayLimits.blogPages)});
const publicEditorialSchema=editorialSchema.extend({article:editorialSchema.shape.article.extend({markdown:z.string().min(1).max(publicGatewayLimits.markdown)})});
const publicMcpTools=[
 {name:'list_check_rules',description:'List deterministic check rules, inputs, limitations and methodology citations.',inputSchema:z.toJSONSchema(listCheckRulesSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'get_check_rule',description:'Read one bundled check rule by domain-qualified ID.',inputSchema:z.toJSONSchema(getCheckRuleSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'list_cases',description:'List synthetic mobile web reproductions (read-only public subset).',inputSchema:z.toJSONSchema(listCasesInputSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'get_case',description:'Get symptom, preconditions, acceptance condition and limitations for a known case.',inputSchema:z.toJSONSchema(caseIdSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'list_workflows',description:'List generalized Reproleaf workflows and their automation limits.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'diagnose_project',description:'Rank candidate checks from supplied application metadata. Select activeApplication when several applications exist. Rendering mode and preconditions remain unconfirmed unless supplied; no repository files are read and no bugs are verified.',inputSchema:precomputedSchemas.schemas.diagnose,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'review_editorial_packet',description:'Check supplied article evidence within public text/glossary work limits. No source fetching or semantic guarantee.',inputSchema:{type:'object',properties:{packet:z.toJSONSchema(publicEditorialSchema)},required:['packet'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_blog_links',description:'Audit inline inventory only: at most 100 pages, 10000 links and 200000 supplied text units. No server files or crawling.',inputSchema:{type:'object',properties:{inventory:z.toJSONSchema(publicBlogSchema)},required:['inventory'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'compare_check_runs',description:'Compare baseline and post-fix check reports.',inputSchema:z.toJSONSchema(compareInputSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'get_schemas',description:'Return versioned JSON schemas, finding codes and error codes.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'get_client_setups',description:'Return verified client setup configurations and connection checks.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}}
];

function handlePublicMcpRpc(rpc){
 if(!rpc||typeof rpc!=='object'||rpc.jsonrpc!=='2.0'||typeof rpc.method!=='string'){
  return {jsonrpc:'2.0',id:rpc?.id??null,error:{code:-32600,message:'Invalid JSON-RPC 2.0 request'}};
 }
 const id=rpc.id??null;
 if(rpc.method==='initialize'){
  return {jsonrpc:'2.0',id,result:{protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'reproleaf-public',version},instructions:getServerInstructions({publicMode:true})}};
 }
 if(rpc.method==='notifications/initialized'||rpc.method==='ping'){
  return {jsonrpc:'2.0',id,result:{}};
 }
 if(rpc.method==='tools/list'){
  return {jsonrpc:'2.0',id,result:{tools:publicMcpTools}};
 }
 if(rpc.method==='tools/call'){
  const toolName=rpc.params?.name,args=rpc.params?.arguments||{};
  try{
   if(['list_workflows','get_schemas','get_client_setups'].includes(toolName))z.object({}).strict().parse(args);
   if(['review_editorial_packet','audit_blog_links'].includes(toolName))z.object({[toolName==='audit_blog_links'?'inventory':'packet']:z.unknown()}).strict().parse(args);
   let data;
   if(toolName==='list_cases'){
    const {query,limit,offset}=listCasesInputSchema.parse(args);
    const q=(query||'').toLowerCase(),matches=catalog.cases.filter(c=>JSON.stringify(c).toLowerCase().includes(q));
    data={status:catalog.status,provenance:catalog.provenance,total:matches.length,nextOffset:offset+limit<matches.length?offset+limit:null,cases:matches.slice(offset,offset+limit).map(item=>({...item,citationUrl:caseCitationUrl(item.id)}))};
   }else if(toolName==='get_case'){
    const parsed=caseIdSchema.parse(args);
    data={...getCase(parsed.id),provenance:catalog.provenance,casePage:caseCitationUrl(parsed.id),citationUrl:caseCitationUrl(parsed.id)};
   }else if(toolName==='list_check_rules'){
    data=listCheckRules(args);
   }else if(toolName==='get_check_rule'){
    data=getCheckRule(args);
   }else if(toolName==='list_workflows'){
    data={workflows:[{id:'mobile-web-review',purpose:'Reproduce and verify a mobile UI failure with local acceptance evidence.'},{id:'editorial-evidence',purpose:'Prepare and review an article evidence packet; no ranking or factual-truth guarantee.'},{id:'blog-link-graph',purpose:'Audit supplied internal link coverage and editorial link candidates.'}]};
   }else if(toolName==='diagnose_project'){
    data=diagnoseProject(args);
   }else if(toolName==='review_editorial_packet'){
    data=reviewEditorial(args.packet);
   }else if(toolName==='audit_blog_links'){
    if(!args.inventory)throw Error('Inline inventory is required on the public MCP endpoint.');
    data=auditBlog(args.inventory);
   }else if(toolName==='compare_check_runs'){
    const parsed=compareInputSchema.parse(args);
    data=compareReports(parsed.before,parsed.after);
   }else if(toolName==='get_schemas'){
    data=precomputedSchemas;
   }else if(toolName==='get_client_setups'){
    data={schemaVersion:1,clients:clientSetups};
   }else{
    return {jsonrpc:'2.0',id,error:{code:-32601,message:`Unknown or restricted tool: ${String(toolName)}`}};
   }
   return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(data,null,2)}],isError:false}};
  }catch(error){
   return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify({error:'invalid-input',code:'RL_INVALID_INPUT',message:error.message})}],isError:true}};
  }
 }
 return {jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}};
}

function handlePublicMcpHttp(input){
 try{assertPublicRequestBudget(input);}catch(error){return {status:400,body:rpcError(input?.id,error.rpcCode||-32600,error.message)};}
 const batch=Array.isArray(input),responses=[];
 for(const item of batch?input:[input]){
  try{
   const parsed=parsePublicRpc(item);if(parsed.notification)continue;
   if(batch&&parsed.rpc.method==='initialize'){responses.push(rpcError(item.id,-32600,'Initialize cannot be batched'));continue;}
   if(parsed.rpc.method.startsWith('notifications/')){responses.push(rpcError(item.id,-32600,'Notifications must not have an id'));continue;}
   responses.push(handlePublicMcpRpc(parsed.rpc));
  }catch(error){responses.push(rpcError(item?.id,error.rpcCode||-32600,error.message));}
 }
 return responses.length?{status:200,body:batch?responses:responses[0]}:{status:202};
}

export async function startApi({port=4180,listenHost='127.0.0.1',publicGatewayOnly=false,maxBytes=1048576,maxConcurrent=8,rateLimitPerMinute=120,requestTimeoutMs=10000,allowedHosts=[],allowedOrigins=[],trustedProxyPeers=[],maxRateBuckets=1000,beforeProcess,aiOptions={}}={}){
 if(typeof publicGatewayOnly!=='boolean'||!['127.0.0.1','::1','0.0.0.0'].includes(listenHost))throw Error('Invalid API binding policy');
 if(listenHost==='0.0.0.0'&&!publicGatewayOnly)throw Error('Non-loopback binding requires publicGatewayOnly');
 if(!Number.isSafeInteger(maxRateBuckets)||maxRateBuckets<1||maxRateBuckets>100000)throw Error('Invalid rate bucket limit');
 if(!Array.isArray(trustedProxyPeers)||trustedProxyPeers.length>32||trustedProxyPeers.some(peer=>!normalizePeer(peer)))throw Error('Trusted proxy peers must be explicit IP literals');
 let activeRequests=0;
 const rateWindows=new Map();
 const aiConfig=publicGatewayOnly?{enabled:false,apiKey:'',model:'',dailyBudgetUsd:0,inputPricePerMillion:0,outputPricePerMillion:0}:resolveAiConfig(aiOptions);
 const aiBudgetTracker=publicGatewayOnly?null:aiOptions.budgetTracker||createAiBudgetTracker(aiConfig);
 const getEndpoints=new Set(['/health','/v1/schemas','/v1/cases','/v1/clients','/v1/ai-status']);
 const postEndpoints=new Set(['/v1/editorial','/v1/blog','/v1/diagnose','/v1/compare','/v1/mcp','/v1/ai-review','/v1/sanitize-report','/v1/contribution-preview']);

 function checkRateLimit(clientKey){
  const now=Date.now();
  if(rateWindows.size>=maxRateBuckets){
   for(const [k,entry]of rateWindows)if(now>=entry.resetAt)rateWindows.delete(k);
  }
  let entry=rateWindows.get(clientKey);
  if(!entry||now>=entry.resetAt){
   if(!entry&&rateWindows.size>=maxRateBuckets)return {allowed:false,retryAfterSeconds:60};
   entry={count:0,resetAt:now+60000};
   rateWindows.set(clientKey,entry);
  }
  entry.count++;
  if(entry.count>rateLimitPerMinute){
   return {allowed:false,retryAfterSeconds:Math.max(1,Math.ceil((entry.resetAt-now)/1000))};
  }
  return {allowed:true,retryAfterSeconds:0};
 }

 const server=http.createServer(async(req,res)=>{
  let timedOut=false;
  const respond=(status,data,extraHeaders={})=>{
   if(res.headersSent)return;
   res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extraHeaders});
   res.end(JSON.stringify(data));
  };
  const timer=setTimeout(()=>{
   timedOut=true;
   respond(408,{error:'request-timeout',code:'RL_REQUEST_TIMEOUT'});
   req.destroy();
  },requestTimeoutMs);
  res.once('close',()=>clearTimeout(timer));

  const expectedHosts=new Set([`127.0.0.1:${server.address().port}`,`[::1]:${server.address().port}`,`localhost:${server.address().port}`,...allowedHosts]);
  if(!expectedHosts.has(req.headers.host)){respond(403,{error:'host-rejected',code:'RL_HOST_REJECTED'});return;}
  const localOrigins=[`http://127.0.0.1:${server.address().port}`,`http://[::1]:${server.address().port}`,`http://localhost:${server.address().port}`];
  const allowedOrigin=exactOriginAllowed(req.headers.origin,localOrigins,allowedOrigins);
  if(!allowedOrigin){respond(403,{error:'origin-rejected',code:'RL_ORIGIN_REJECTED'});return;}

  let clientKey;try{clientKey=proxyClientIdentity(req.socket?.remoteAddress,req.headers['x-forwarded-for'],trustedProxyPeers);}catch{respond(400,{error:'invalid-proxy-identity',code:'RL_INVALID_PROXY_IDENTITY'});return;}
  const rate=checkRateLimit(clientKey);
  if(!rate.allowed){
   respond(429,{error:'rate-limit-exceeded',code:'RL_RATE_LIMIT',retryAfterSeconds:rate.retryAfterSeconds},{'Retry-After':String(rate.retryAfterSeconds)});
   return;
  }
  if(activeRequests>=maxConcurrent){
   respond(429,{error:'concurrency-limit-exceeded',code:'RL_CONCURRENCY_LIMIT'});
   return;
  }

  const urlPath=(req.url||'').split('?')[0];
  if(publicGatewayOnly&&!['/v1/mcp','/health'].includes(urlPath)){respond(404,{error:'not-found',code:'RL_NOT_FOUND'});req.resume();return;}
  if(getEndpoints.has(urlPath)){
   if(req.method!=='GET'){res.setHeader('Allow','GET');respond(405,{error:'method-not-allowed',code:'RL_METHOD_NOT_ALLOWED'});return;}
   if(urlPath==='/health'){respond(200,{name:'reproleaf',mode:publicGatewayOnly?'public-gateway':'local',version,readOnly:true,...(publicGatewayOnly?{aiEnabled:false}:{}),limits:{maxBytes,maxConcurrent,rateLimitPerMinute,requestTimeoutMs,maxRateBuckets,publicMcp:publicGatewayLimits},timeoutScope:'Request I/O deadline; synchronous analysis is bounded by input quotas, not hard-interrupted.'});return;}
   if(urlPath==='/v1/schemas'){respond(200,precomputedSchemas);return;}
   if(urlPath==='/v1/cases'){respond(200,{schemaVersion:catalog.schemaVersion,status:catalog.status,provenance:catalog.provenance,total:catalog.cases.length,cases:catalog.cases,unverifiedHeuristics:catalog.unverifiedHeuristics||[]});return;}
   if(urlPath==='/v1/clients'){respond(200,{schemaVersion:1,clients:clientSetups});return;}
   if(urlPath==='/v1/ai-status'){
    const budget=aiBudgetTracker.statusSnapshot();
    respond(200,{enabled:aiConfig.enabled&&budget.available!==false&&!budget.paused,model:aiConfig.model,budget,policy:{keysOnServerOnly:true,requiresExplicitAction:true,draftOptInOnly:true,urlsRestrictedToInventory:true,outputStatus:'ai-hypothesis-unverified'}});
    return;
   }
  }

  if(!postEndpoints.has(urlPath)){respond(404,{error:'not-found',code:'RL_NOT_FOUND'});return;}
  if(req.method!=='POST'){res.setHeader('Allow','POST');respond(405,{error:'post-required',code:'RL_POST_REQUIRED'});return;}
  if(urlPath==='/v1/mcp'){
   if(!acceptsPublicMcp(req.headers.accept)){respond(406,rpcError(null,-32600,'Accept must include application/json and text/event-stream'));return;}
   if(req.headers['mcp-protocol-version']&&req.headers['mcp-protocol-version']!=='2025-03-26'){respond(400,rpcError(null,-32600,'Unsupported MCP protocol version'));return;}
  }
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){respond(415,{error:'application-json-required',code:'RL_JSON_REQUIRED'});return;}
  if(Number(req.headers['content-length'])>maxBytes){respond(413,{error:'body-too-large',code:'RL_BODY_TOO_LARGE'});req.resume();return;}

  activeRequests++;
  let length=0;
  const chunks=[];
  try{
   if(beforeProcess)await beforeProcess(urlPath);
   for await(const chunk of req){
    if(timedOut)return;
    length+=chunk.length;
    if(length>maxBytes){respond(413,{error:'body-too-large',code:'RL_BODY_TOO_LARGE'});req.resume();return;}
    chunks.push(chunk);
   }
   if(timedOut)return;
   const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(urlPath==='/v1/mcp'){
    const outcome=handlePublicMcpHttp(input);if(outcome.status===202){res.writeHead(202,{'Cache-Control':'no-store'});res.end();}else respond(outcome.status,outcome.body);
    return;
   }
   if(urlPath==='/v1/ai-review'){
    try{
     const aiRes=await runAiReview(input,{...aiOptions,...aiConfig,timeoutMs:Math.min(aiOptions.timeoutMs||20000,requestTimeoutMs),budgetTracker:aiBudgetTracker,clientId:clientKey});
     respond(200,aiRes);
    }catch(aiErr){
     respond(aiErr.status||400,{error:aiErr.code||'RL_INVALID_INPUT',code:aiErr.code||'RL_INVALID_INPUT',message:aiErr.message,issues:aiErr.issues});
    }
    return;
   }
   let result;
   if(urlPath==='/v1/editorial')result=reviewEditorial(input);
   else if(urlPath==='/v1/blog')result=auditBlog(input);
   else if(urlPath==='/v1/diagnose')result=diagnoseProject(input);
   else if(urlPath==='/v1/sanitize-report')result=sanitizeReportForSharing(input);
   else if(urlPath==='/v1/contribution-preview')result=prepareContributionPacket(input);
   else{
    const parsed=compareInputSchema.parse(input);
    result=compareReports(parsed.before,parsed.after);
   }
   respond(200,result);
  }catch(error){
   if(urlPath==='/v1/mcp'&&error instanceof SyntaxError){if(!timedOut&&!res.headersSent)respond(400,rpcError(null,-32700,'Parse error'));return;}
   const errCode=error.code||'RL_INVALID_INPUT';
   if(!timedOut&&!res.headersSent)respond(error.status||400,{error:errCode==='RL_INVALID_INPUT'?'invalid-input':errCode,code:errCode,message:error.message,issues:error.issues?.slice(0,30).map(i=>({path:Array.isArray(i.path)?i.path.join('.'):String(i.path||''),code:i.code,message:i.message}))});
  }finally{
   activeRequests=Math.max(0,activeRequests-1);
  }
 });
 server.requestTimeout=requestTimeoutMs;
 server.headersTimeout=requestTimeoutMs;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,listenHost,resolve);});
 return {server,url:`http://${listenHost==='::1'?'[::1]':'127.0.0.1'}:${server.address().port}`,close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const api=await startApi();console.log(`Reproleaf local API: ${api.url}`);}
