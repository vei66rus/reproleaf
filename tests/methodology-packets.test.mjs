import test from 'node:test';
import assert from 'node:assert/strict';
import {listMethodologies,buildMethodologyPacket,validateMethodologyResult} from '../src/methodology-packets.mjs';
import {validateLocalModel,runLocalMethodologyReview} from '../src/ollama-runner.mjs';
import {startApi} from '../src/api.mjs';

const sampleText='Cache invalidation sets an explicit 300s TTL on API responses. Without bounds, stale reads persist across deployments.';

test('listMethodologies exposes all nine ported SEO/GEO methodologies',()=>{
 const res=listMethodologies();
 assert.equal(res.ok,true);
 assert.equal(res.count,9);
 const ids=res.methodologies.map(m=>m.id);
 for(const expected of ['mc','gist','spam','tga','lia','rga','eeat','editorial','geo-structure']){
  assert.ok(ids.includes(expected));
 }
});

test('buildMethodologyPacket binds SHA-256 sourceHash and enforces queries for lia',()=>{
 assert.throws(()=>buildMethodologyPacket({methodId:'lia',locale:'en',text:sampleText}),/requires a non-empty queries array/);
 const packet=buildMethodologyPacket({
  methodId:'lia',
  locale:'en',
  url:'https://evolkov.tech/tools/reproleaf-methodology',
  text:sampleText,
  queries:['cache invalidation ttl']
 });
 assert.equal(packet.ok,true);
 assert.match(packet.packetId,/^[a-f0-9]{64}$/);
 assert.match(packet.sourceHash,/^[a-f0-9]{64}$/);
 assert.ok(packet.estimatedTokens>0);
 assert.match(packet.prompt,/cache invalidation ttl/);
});

test('validateMethodologyResult verifies verbatim quotes, sections and sourceHash',()=>{
 const packet=buildMethodologyPacket({methodId:'rga',locale:'en',text:sampleText});
 const validResult={
  packetId:packet.packetId,
  methodId:packet.methodId,
  methodVersion:packet.methodVersion,
  sourceHash:packet.sourceHash,
  summary:'One extractability improvement found.',
  findings:[
   {
    section:'extractable-answers',
    severity:'low',
    quote:'Cache invalidation sets an explicit 300s TTL on API responses.',
    offset:0,
    diagnosis:'Lead sentence states the rule directly.',
    recommendation:'Keep this self-contained definition at the top.'
   }
  ]
 };
 const okReport=validateMethodologyResult({packet,text:sampleText,result:validResult});
 assert.equal(okReport.ok,true);
 assert.equal(okReport.verifiedQuotesCount,1);
 assert.equal(okReport.errors.length,0);

 const staleReport=validateMethodologyResult({packet,text:sampleText+' Extra.',result:validResult});
 assert.equal(staleReport.ok,false);
 assert.ok(staleReport.errors.some(e=>e.code==='SOURCE_HASH_MISMATCH_TEXT'));

 const badQuoteResult={
  ...validResult,
  findings:[{...validResult.findings[0],offset:undefined,quote:'This sentence does not exist in source.'}]
 };
 const badQuoteReport=validateMethodologyResult({packet,text:sampleText,result:badQuoteResult});
 assert.equal(badQuoteReport.ok,false);
 assert.ok(badQuoteReport.errors.some(e=>e.code==='UNVERIFIED_QUOTE'));

 const badSectionResult={
  ...validResult,
  findings:[{...validResult.findings[0],section:'invented-section'}]
 };
 const badSectionReport=validateMethodologyResult({packet,text:sampleText,result:badSectionResult});
 assert.equal(badSectionReport.ok,false);
 assert.ok(badSectionReport.errors.some(e=>e.code==='INVALID_SECTION'));
});

test('validateLocalModel restricts Ollama to loopback HTTP and rejects cloud models',()=>{
 assert.equal(validateLocalModel({model:'qwen2.5:7b'}).endpoint,'http://127.0.0.1:11434');
 assert.equal(validateLocalModel({endpoint:'http://[::1]:11434',model:'llama3.2'}).endpoint,'http://[::1]:11434');
 assert.throws(()=>validateLocalModel({endpoint:'https://127.0.0.1:11434',model:'qwen2.5:7b'}),/http:\/\//);
 assert.throws(()=>validateLocalModel({endpoint:'http://example.com:11434',model:'qwen2.5:7b'}),/not allowed/);
 assert.throws(()=>validateLocalModel({endpoint:'http://user:pass@127.0.0.1:11434',model:'qwen2.5:7b'}),/credentials/);
 assert.throws(()=>validateLocalModel({model:'qwen3:cloud'}),/Cloud model/);
});

test('runLocalMethodologyReview posts to local Ollama and validates structured output',async()=>{
 const packet=buildMethodologyPacket({methodId:'mc',locale:'en',text:sampleText});
 let capturedInit=null;
 const mockFetch=async(url,init)=>{
  capturedInit={url,init};
  return new Response(JSON.stringify({
   done_reason:'stop',
   message:{
    content:JSON.stringify({
     packetId:packet.packetId,
     methodId:packet.methodId,
     methodVersion:packet.methodVersion,
     sourceHash:packet.sourceHash,
     summary:'Micro-context check complete.',
     findings:[
      {
       section:'constraints',
       severity:'medium',
       quote:'Without bounds, stale reads persist across deployments.',
       diagnosis:'Constraint is clear but lacks rollback note.',
       recommendation:'Add invalidation fallback behavior.'
      }
     ]
    })
   }
  }),{status:200,headers:{'content-type':'application/json'}});
 };
 const run=await runLocalMethodologyReview({packet,text:sampleText,model:'qwen2.5:7b',fetchImpl:mockFetch});
 assert.equal(run.ok,true);
 assert.equal(capturedInit.url,'http://127.0.0.1:11434/api/chat');
 assert.equal(capturedInit.init.redirect,'error');
 const body=JSON.parse(capturedInit.init.body);
 assert.equal(body.format,'json');
 assert.equal(body.stream,false);
 assert.equal(body.options.temperature,0);

 const truncatedFetch=async()=>new Response(JSON.stringify({done_reason:'length',message:{content:'{}'}}),{status:200});
 await assert.rejects(()=>runLocalMethodologyReview({packet,text:sampleText,model:'qwen2.5:7b',fetchImpl:truncatedFetch}),/done_reason=length/);
});

test('HTTP API and public MCP expose methodology endpoints while publicGatewayOnly scopes REST',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-method.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const listRes=await fetch(`${api.url}/v1/methodologies`);
 assert.equal(listRes.status,200);
 const listBody=await listRes.json();
 assert.equal(listBody.count,9);

 const packetRes=await fetch(`${api.url}/v1/methodology-packet`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({methodId:'eeat',locale:'en',text:sampleText})
 });
 assert.equal(packetRes.status,200);
 const packet=await packetRes.json();

 const mcpRes=await fetch(`${api.url}/v1/mcp`,{
  method:'POST',
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({
   jsonrpc:'2.0',
   id:1,
   method:'tools/call',
   params:{name:'prepare_methodology_packet',arguments:{methodId:'eeat',locale:'en',text:sampleText}}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const mcpPacket=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(mcpPacket.packetId,packet.packetId);

 const gateway=await startApi({port:0,publicGatewayOnly:true});
 t.after(()=>gateway.close());
 assert.equal((await fetch(`${gateway.url}/v1/methodologies`)).status,404);
});
