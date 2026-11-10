import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {startApi} from '../src/api.mjs';
import {auditBlog} from '../src/blog-graph.mjs';
import {publicGatewayLimits,proxyClientIdentity,assertPublicRequestBudget} from '../src/public-gateway-policy.mjs';

const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
const disabled={envPath:'missing-gateway-test.env',enabled:false,apiKey:'',model:'',dailyBudgetUsd:0,inputPricePerMillion:0,outputPricePerMillion:0};
async function gateway(t,options={}){const api=await startApi({port:0,aiOptions:disabled,...options});t.after(()=>api.close());return api;}
const post=(api,input,extra={})=>fetch(api.url+'/v1/mcp',{method:'POST',headers:{...headers,...extra},body:typeof input==='string'?input:JSON.stringify(input)});
const rpc=(method,params,id=1)=>({jsonrpc:'2.0',id,method,...(params===undefined?{}:{params})});
const call=(name,args)=>rpc('tools/call',{name,arguments:args});
const inventory=n=>({schemaVersion:1,siteUrl:'https://example.org',coverage:'Synthetic public work bound',pages:Array.from({length:n},(_,i)=>({url:`https://example.org/${i}`,title:'Cache architecture',kind:'hub',cluster:'cache',text:'Cache invalidation boundaries.',links:[]}))});

test('official SDK reads eleven tools from an explicitly public-only nonloopback server',async t=>{
 const api=await gateway(t,{publicGatewayOnly:true,listenHost:'0.0.0.0'}),trace=[];assert.equal(api.server.address().address,'0.0.0.0');const client=new Client({name:'gateway-conformance-test',version:'1.0'});
 const transport=new StreamableHTTPClientTransport(new URL(api.url+'/v1/mcp'),{fetch:async(url,init)=>{const response=await fetch(url,init);trace.push({method:JSON.parse(init?.body||'{}').method,status:response.status,body:await response.clone().text()});return response;}});
 try{await client.connect(transport);assert.equal(client.getServerVersion().version,'0.7.1');const tools=(await client.listTools()).tools;assert.equal(tools.length,11);assert.ok(tools.every(tool=>tool.annotations.readOnlyHint));assert.equal((await client.callTool({name:'get_check_rule',arguments:{id:'editorial:h1-count'}})).isError,false);for(const name of ['update_project_task','get_case_source'])await assert.rejects(client.callTool({name,arguments:{}}),/Unknown or restricted tool/);const initialized=trace.find(item=>item.method==='notifications/initialized');assert.deepEqual(initialized,{method:'notifications/initialized',status:202,body:''});}finally{await client.close();}
});
test('notification-only messages and batches return202 without a body',async t=>{
 const api=await gateway(t);for(const value of [{jsonrpc:'2.0',method:'notifications/initialized'},[{jsonrpc:'2.0',method:'notifications/initialized'},{jsonrpc:'2.0',method:'ping'}],{jsonrpc:'2.0',id:1,result:{}}]){const response=await post(api,value);assert.equal(response.status,202);assert.equal(await response.text(),'');}
 const mixed=await post(api,[rpc('ping'),{jsonrpc:'2.0',method:'notifications/initialized'}]);const body=await mixed.json();assert.equal(body.length,1);assert.equal(body[0].id,1);
});
test('invalid IDs, initialize fields, JSON and batches fail without successful dispatch',async t=>{
 const api=await gateway(t);for(const input of [rpc('ping',{},{}),rpc('ping',{},null),rpc('ping',{},1.5),rpc('initialize',{}),rpc('initialize',{protocolVersion:'nonsense',capabilities:{},clientInfo:{name:'x',version:'1'}})]){const body=await(await post(api,input)).json();assert.ok(body.error);assert.equal(body.result,undefined);}
 const parse=await post(api,'{');assert.equal(parse.status,400);assert.equal((await parse.json()).error.code,-32700);
 for(const input of [[],Array.from({length:9},(_,i)=>rpc('ping',{},i))])assert.equal((await post(api,input)).status,400);
 const initBatch=await(await post(api,[rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'x',version:'1'}})])).json();assert.equal(initBatch[0].error.code,-32600);
});
test('transport checks Accept/version and permits the optional non-streaming GET405',async t=>{
 const api=await gateway(t);for(const Accept of ['text/html','application/json-fake, text/event-stream','application/json, text/event-stream;q=0'])assert.equal((await post(api,rpc('ping'),{Accept})).status,406);assert.equal((await post(api,rpc('ping'),{Accept:'Application/JSON, Text/Event-Stream'})).status,200);assert.equal((await post(api,rpc('ping'),{'MCP-Protocol-Version':'9999-01-01'})).status,400);assert.equal((await post(api,rpc('ping'),{'MCP-Protocol-Version':'2025-03-26'})).status,200);const get=await fetch(api.url+'/v1/mcp',{headers:{Accept:'text/event-stream'}});assert.equal(get.status,405);
});
test('exact HTTPS origins do not inherit permission from Host, scheme or path',async t=>{
 const api=await gateway(t,{allowedHosts:['gateway.example.org'],allowedOrigins:['https://gateway.example.org']});
 for(const Origin of ['http://gateway.example.org','https://gateway.example.org/path','https://gateway.example.org/','null','https://evil.example'])assert.equal((await post(api,rpc('ping'),{Origin})).status,403);
 assert.equal((await post(api,rpc('ping'),{Origin:'https://gateway.example.org'})).status,200);
 const badHost=await new Promise(resolve=>{const url=new URL(api.url),request=http.request({hostname:url.hostname,port:url.port,path:'/health',headers:{Host:'evil.example'}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});request.end();});assert.equal(badHost,403);
});
test('untrusted XFF cannot rotate quotas; explicit trusted peers select the nearest untrusted hop',async t=>{
 assert.equal(proxyClientIdentity('127.0.0.1','192.0.2.1',[]),'127.0.0.1');assert.equal(proxyClientIdentity('::ffff:127.0.0.1','198.51.100.1, 192.0.2.2',['127.0.0.1']),'192.0.2.2');assert.throws(()=>proxyClientIdentity('127.0.0.1','invalid',['127.0.0.1']));
 const api=await gateway(t,{rateLimitPerMinute:1});assert.equal((await post(api,rpc('ping'),{'X-Forwarded-For':'192.0.2.1'})).status,200);assert.equal((await post(api,rpc('ping'),{'X-Forwarded-For':'192.0.2.2'})).status,429);
});
test('trusted client buckets are distinct and capped without evicting active quotas',async t=>{
 const api=await gateway(t,{trustedProxyPeers:['127.0.0.1'],rateLimitPerMinute:1,maxRateBuckets:2});
 for(const client of ['192.0.2.1','192.0.2.2'])assert.equal((await post(api,rpc('ping'),{'X-Forwarded-For':client})).status,200);
 assert.equal((await post(api,rpc('ping'),{'X-Forwarded-For':'192.0.2.3'})).status,429);assert.equal((await post(api,rpc('ping'),{'X-Forwarded-For':'192.0.2.1'})).status,429);assert.equal((await post(api,rpc('ping'),{'X-Forwarded-For':'not-an-ip'})).status,400);
});
test('public structural work limits reject expensive inventories before graph analysis',async t=>{
 const api=await gateway(t);const large=inventory(101);assert.equal(auditBlog(large).summary.pages,101);const response=await(await post(api,call('audit_blog_links',{inventory:large}))).json();assert.equal(response.error.code,-32602);assert.match(response.error.message,/100 pages/);
 const okay=await(await post(api,call('audit_blog_links',{inventory:inventory(100)}))).json();assert.equal(okay.result.isError,false);
 const text=inventory(1);text.pages[0].text='x'.repeat(publicGatewayLimits.suppliedText+1);assert.throws(()=>assertPublicRequestBudget(call('audit_blog_links',{inventory:text})),/budget/);
 assert.throws(()=>assertPublicRequestBudget(call('review_editorial_packet',{packet:{article:{markdown:'x'.repeat(50000)},glossary:[{prohibitedVariants:Array(100).fill('word')}]}})),/work budget/);
});
test('JSON nesting and report row caps bound otherwise generic comparison input',()=>{
 let deep={};for(let i=0;i<40;i++)deep={child:deep};assert.throws(()=>assertPublicRequestBudget(call('compare_check_runs',{before:deep,after:{}})),/complexity/);assert.throws(()=>assertPublicRequestBudget(Array(50001).fill(0)),/complexity/);assert.throws(()=>assertPublicRequestBudget(call('compare_check_runs',{before:{findings:Array(2001).fill({})},after:{}})),/row budget/);
});
test('all private/source/mutation tools remain denied and no-argument schemas stay strict',async t=>{
 const api=await gateway(t);for(const name of ['get_case_source','get_latest_evidence','get_site_project_context','get_project_tasks','update_project_task','get_workflow']){const body=await(await post(api,call(name,{}))).json();assert.equal(body.error.code,-32601);}
 const path=await(await post(api,call('audit_blog_links',{path:'/not-a-real-file'}))).json();assert.equal(path.result.isError,true);const extra=await(await post(api,call('get_schemas',{unexpected:true}))).json();assert.equal(extra.result.isError,true);
 const health=await(await fetch(api.url+'/health')).json();assert.match(health.timeoutScope,/not hard-interrupted/);assert.equal(health.limits.publicMcp.blogPages,100);
});

test('comparison quotas inspect the effective direct or wrapped report on both sides',async t=>{
 const api=await gateway(t),fields=['findings','results','checks','pages','edges','recommendations'];
 for(const wrapped of [false,true])for(const side of ['before','after'])for(const field of fields){
  const report={findings:[],[field]:Array(2001).fill({})},args={before:{findings:[]},after:{findings:[]}};args[side]=wrapped?{report}:report;
  assert.throws(()=>assertPublicRequestBudget(call('compare_check_runs',args)),/row budget/);
  const result=await(await post(api,call('compare_check_runs',args))).json();assert.equal(result.error?.code,-32602,`${wrapped}/${side}/${field}`);assert.match(result.error.message,/row budget/);
 }
 for(const wrapped of [false,true]){const report={findings:[]},args={before:wrapped?{report}:report,after:wrapped?{report}:report};const result=await(await post(api,call('compare_check_runs',args))).json();assert.equal(result.result.isError,false);}
});

test('comparison total quotas and ambiguous nested envelopes fail before normalization',async t=>{
 const api=await gateway(t),report={findings:Array(1001).fill({}),pages:Array(1001).fill({})};
 for(const args of [{before:{report},after:{report}},{before:{report:{report:{findings:[]}}},after:{findings:[]}},{before:{report:{findings:[]},findings:[]},after:{findings:[]}},{before:{report:{findings:'invalid'}},after:{findings:[]}}]){
  assert.throws(()=>assertPublicRequestBudget(call('compare_check_runs',args)));
  const result=await(await post(api,call('compare_check_runs',args))).json();assert.equal(result.error?.code,-32602);
 }
});

test('nonloopback binding requires explicit public-only mode and a fixed supported address',async()=>{
 for(const options of [{listenHost:'0.0.0.0'},{listenHost:'0.0.0.0',publicGatewayOnly:false},{listenHost:'192.0.2.1',publicGatewayOnly:true},{listenHost:'::',publicGatewayOnly:true},{listenHost:'localhost',publicGatewayOnly:true},{publicGatewayOnly:'true'}])await assert.rejects(startApi({port:0,aiOptions:disabled,...options}),/binding|publicGatewayOnly/);
});

test('public-only routing blocks every other local API before handler dispatch',async t=>{
 let dispatched=0;const api=await gateway(t,{publicGatewayOnly:true,beforeProcess:()=>{dispatched++;}});
 for(const path of ['/v1/schemas','/v1/cases','/v1/clients','/v1/ai-status','/v1/editorial','/v1/blog','/v1/diagnose','/v1/compare','/v1/ai-review','/v1/sanitize-report','/v1/contribution-preview','/private'])for(const method of ['GET','POST']){
  const response=await fetch(api.url+path,{method,headers,...(method==='POST'?{body:'{}'}:{})});assert.equal(response.status,404,`${method} ${path}`);
 }
 assert.equal(dispatched,0);const health=await(await fetch(api.url+'/health')).json();assert.equal(health.mode,'public-gateway');assert.equal(health.aiEnabled,false);
});

test('public-only mode ignores ambient AI configuration and never reads AI options or a ledger',async t=>{
 const names=['REPROLEAF_AI_ENABLED','OPENAI_API_KEY','REPROLEAF_AI_MODEL','REPROLEAF_AI_DAILY_BUDGET_USD','REPROLEAF_AI_INPUT_USD_PER_MILLION','REPROLEAF_AI_OUTPUT_USD_PER_MILLION'];const previous=new Map(names.map(name=>[name,process.env[name]]));let reads=0;
 const poisoned={get envPath(){reads++;throw Error('AI env file must not be read');},get budgetTracker(){reads++;throw Error('AI ledger must not initialize');},enabled:true,apiKey:'synthetic-key-not-a-real-credential',model:'synthetic-model',dailyBudgetUsd:1,inputPricePerMillion:1,outputPricePerMillion:1};
 try{
  for(const name of names)process.env[name]=name==='OPENAI_API_KEY'?'synthetic-key-not-a-real-credential':name==='REPROLEAF_AI_MODEL'?'synthetic-model':'1';
  const api=await gateway(t,{publicGatewayOnly:true,aiOptions:poisoned});assert.equal((await(await fetch(api.url+'/health')).json()).aiEnabled,false);assert.equal((await post(api,rpc('tools/list'))).status,200);assert.equal((await fetch(api.url+'/v1/ai-review',{method:'POST',headers,body:'{}'})).status,404);assert.equal(reads,0);
 }finally{for(const [name,value] of previous)if(value===undefined)delete process.env[name];else process.env[name]=value;}
});

test('default binding retains the loopback full local API',async t=>{
 const api=await gateway(t);assert.equal(api.server.address().address,'127.0.0.1');assert.equal((await(await fetch(api.url+'/health')).json()).mode,'local');assert.equal((await fetch(api.url+'/v1/schemas')).status,200);assert.equal((await fetch(api.url+'/v1/blog',{method:'POST',headers,body:JSON.stringify(inventory(1))})).status,200);
});
