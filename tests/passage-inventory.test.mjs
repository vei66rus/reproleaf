import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passageInventorySchema} from '../src/passage-inventory.mjs';
import {blogSchema,auditBlog} from '../src/blog-graph.mjs';
import {startApi} from '../src/api.mjs';

function passage(text='Cache invalidation uses explicit boundaries.'){const length=[...text].length;return {schemaVersion:1,method:'filtered-dom-paragraphs-v1',offsetUnit:'unicode-code-points',offsetBase:0,endExclusive:true,ordinalBase:1,offsetReference:'filtered-body-dom-text-content',documentCharacters:length,documentTextSha256:'a'.repeat(64),contentLandmarkDetected:true,eligibleParagraphs:1,passages:[{ordinal:1,start:0,end:length,text,originalCharacters:length,truncated:false}],limits:{passages:24,charactersPerPassage:400,textCharacters:9600,serializedBytes:70000},coverage:{scope:'eligible-content-paragraphs-only',eligibleCharacters:length,paragraphsCaptured:1,paragraphsOmitted:0,charactersCaptured:length,charactersOmitted:0,complete:true,truncated:false,reasons:[]},visibilityScope:'Supplied stored markup only',collectionScope:'Synthetic validator control'};}
function inventory(){return {schemaVersion:1,siteUrl:'https://example.org',coverage:'Synthetic legacy behavior control',pages:[{url:'https://example.org/a',title:'Cache guide',text:'Cache invalidation patterns',links:[]},{url:'https://example.org/b',title:'Cache invalidation',text:'Cache invalidation patterns',links:[]}]};}

test('optional passage storage accepts exact Unicode coordinates without changing supplied text',()=>{
 const input=passage('\u{1D11E} Cache\tboundaries');assert.deepEqual(passageInventorySchema.parse(input),input);
});
test('passage validator rejects inconsistent coverage, false ordinals, invalid Unicode and excess rows',()=>{
 for(const mutate of [p=>{p.passages[0].ordinal=999;},p=>{p.passages[0].end++;},p=>{p.coverage.complete=false;},p=>{p.passages[0].text='\ud800';},p=>{p.passages=Array(25).fill(p.passages[0]);},p=>{p.limits.serializedBytes=1;}]){const input=passage();mutate(input);assert.equal(passageInventorySchema.safeParse(input).success,false);}
});
test('supplementary paragraphs and optional regions preserve the legacy graph result',()=>{
 const input=inventory(),expected=auditBlog(input);input.recommendationMode='legacy';input.pages[0].passageInventory=passage();input.pages[0].links.push({href:'/outside-inventory',region:'navigation'});const withRegion=auditBlog(input);delete input.pages[0].passageInventory;delete input.pages[0].links[0].region;assert.deepEqual(withRegion,auditBlog(input));input.pages[0].links=[];assert.deepEqual(auditBlog(input),expected);
});
test('public shared inventory schema rejects quarantined research modes',()=>{
 for(const mode of ['paragraph-v1','paragraph-v2','paragraph-context-v3']){const input={...inventory(),recommendationMode:mode};assert.equal(blogSchema.safeParse(input).success,false);assert.throws(()=>auditBlog(input));}
 assert.equal(blogSchema.safeParse({...inventory(),recommendationMode:'legacy'}).success,true);
});
test('HTTP blog and MCP ingress reject research modes',async()=>{
 const api=await startApi({port:0});try{
  for(const mode of ['paragraph-v1','paragraph-v2','paragraph-context-v3']){
   const input={...inventory(),recommendationMode:mode},response=await fetch(`${api.url}/v1/blog`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});assert.equal(response.status,400);
   const rpc=await fetch(`${api.url}/v1/mcp`,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'audit_blog_links',arguments:{inventory:input}}})});const packet=await rpc.json();assert.ok(packet.error||packet.result?.isError,'MCP must reject research mode');
  }
 }finally{await api.close();}
});
