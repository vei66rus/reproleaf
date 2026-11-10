import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRecommendationEvidence,readRecommendationEvidence} from '../src/recommendation-evidence.mjs';
import {auditBlog} from '../src/blog-graph.mjs';

function assertContract(evidence){
 assert.equal(evidence.schemaVersion,1);assert.equal(evidence.reviewRequired,true);assert.equal(evidence.scope,'supplied-excerpt');assert.equal(evidence.basis,'lexical-candidate-not-semantic');assert.equal(evidence.matchType,'exact-substring');assert.equal(evidence.offsetUnit,'unicode-code-points');assert(!Object.hasOwn(evidence,'confidence'));
 if(evidence.status!=='literal-span')assert.equal(evidence.literalSpan,null);
}
function assertLiteral(candidate,start,end,text){
 const evidence=buildRecommendationEvidence(candidate);assertContract(evidence);assert.equal(evidence.status,'literal-span');assert.equal(evidence.reason,'exact-literal-match');assert.deepEqual(evidence.literalSpan,{start,end,text});assert.equal([...candidate[evidence.excerptField]].slice(start,end).join(''),text);return evidence;
}

test('literal evidence identifies the first exact substring without changing supplied text',()=>{
 const candidate=Object.freeze({excerpt:'Intro. cache guide and cache guide.',suggestedAnchor:'cache guide',confidence:1,basis:'semantic'}),before=JSON.stringify(candidate);
 assertLiteral(candidate,7,18,'cache guide');assert.equal(JSON.stringify(candidate),before);
 const substring=assertLiteral({excerpt:'Solo-fullstack work',suggestedAnchor:'fullstack'},5,14,'fullstack');assert.equal(substring.matchType,'exact-substring');assert.equal(substring.reviewRequired,true);
});

test('span offsets count Unicode codepoints rather than UTF-16 units or glyphs',()=>{
 assertLiteral({excerpt:'\u{10400} \u{1d11e} кэш.',suggestedAnchor:'кэш'},4,7,'кэш');
 assertLiteral({excerpt:'e\u0301 cache guide',suggestedAnchor:'cache guide'},3,14,'cache guide');
 assertLiteral({excerpt:'Cache \u{10400} text',suggestedAnchor:'\u{10400}'},6,7,'\u{10400}');
});

test('case, whitespace, entities and Unicode normalization never manufacture a literal span',()=>{
 for(const candidate of [{excerpt:'Cache Guide',suggestedAnchor:'cache guide'},{excerpt:'cache  guide',suggestedAnchor:'cache guide'},{excerpt:'cache\nguide',suggestedAnchor:'cache guide'},{excerpt:'cache &amp; TTL',suggestedAnchor:'cache & TTL'},{excerpt:'Café cache',suggestedAnchor:'Cafe\u0301'},{excerpt:'e\u0301 cache',suggestedAnchor:'é'}]){
  const result=buildRecommendationEvidence(candidate);assertContract(result);assert.equal(result.status,'text-edit-required');assert.equal(result.reason,'anchor-not-in-excerpt');assert.equal(result.literalSpan,null);
 }
});

test('proposed anchor requires an edit only within the supplied excerpt, not an assertion about the whole page',()=>{
 const result=buildRecommendationEvidence({excerpt:'Cache expiration prevents stale reads.',suggestedAnchor:'cache architecture',sourceText:'Elsewhere the cache architecture phrase already exists.'});
 assertContract(result);assert.equal(result.status,'text-edit-required');assert.equal(result.excerptField,'excerpt');assert.equal(result.reason,'anchor-not-in-excerpt');
});

test('raw markup remains text data and is never executed, decoded or treated as semantic approval',()=>{
 const payload='<img src=x onerror="globalThis.__recommendationExecuted=true">',candidate={excerpt:'Raw '+payload+' only.',suggestedAnchor:payload};
 const result=assertLiteral(candidate,4,4+[...payload].length,payload);assert.equal(result.literalSpan.text,payload);assert.equal(globalThis.__recommendationExecuted,undefined);assert.equal(result.reviewRequired,true);
});

test('excerpt aliases have deterministic missing, matching and conflicting behavior',()=>{
 const anchor='cache guide';assert.equal(buildRecommendationEvidence({donorExcerpt:anchor,suggestedAnchor:anchor}).excerptField,'donorExcerpt');
 assert.equal(buildRecommendationEvidence({excerpt:anchor,donorExcerpt:anchor,suggestedAnchor:anchor}).excerptField,'excerpt');
 assert.equal(buildRecommendationEvidence({excerpt:null,donorExcerpt:anchor,suggestedAnchor:anchor}).excerptField,'donorExcerpt');
 assert.equal(buildRecommendationEvidence({excerpt:'  ',donorExcerpt:anchor,suggestedAnchor:anchor}).excerptField,'donorExcerpt');
 const conflict=buildRecommendationEvidence({excerpt:anchor,donorExcerpt:'cache change',suggestedAnchor:'cache'});assertContract(conflict);assert.equal(conflict.status,'unconfirmed');assert.equal(conflict.reason,'conflicting-excerpts');
 const invalid=buildRecommendationEvidence({excerpt:anchor,donorExcerpt:[],suggestedAnchor:'cache'});assert.equal(invalid.status,'unconfirmed');assert.equal(invalid.reason,'invalid-excerpt');
});

test('malformed or legacy candidates remain unconfirmed without string coercion or invented spans',()=>{
 for(const candidate of [null,undefined,[],false,2,'text',new Date()]){const result=buildRecommendationEvidence(candidate);assertContract(result);assert.equal(result.reason,'invalid-candidate');}
 for(const candidate of [{},{suggestedAnchor:'cache'},{excerpt:null,suggestedAnchor:'cache'},{excerpt:' ',suggestedAnchor:'cache'}])assert.equal(buildRecommendationEvidence(candidate).reason,'missing-excerpt');
 for(const anchor of [undefined,null,'','  '])assert.equal(buildRecommendationEvidence({excerpt:'cache',suggestedAnchor:anchor}).reason,'missing-anchor');
 for(const anchor of [[],{},false,2])assert.equal(buildRecommendationEvidence({excerpt:'cache',suggestedAnchor:anchor}).reason,'invalid-anchor');
 const candidate=Object.assign(Object.create(null),{excerpt:'cache',suggestedAnchor:'cache'});assertLiteral(candidate,0,5,'cache');
});

test('bounds are codepoint-based and over-limit inputs are not silently truncated',()=>{
 assertLiteral({excerpt:'x'.repeat(800)+'a'.repeat(200),suggestedAnchor:'a'.repeat(200)},800,1000,'a'.repeat(200));
 assertLiteral({excerpt:'\u{10400}'.repeat(1000),suggestedAnchor:'\u{10400}'.repeat(200)},0,200,'\u{10400}'.repeat(200));
 for(const candidate of [{excerpt:'x'.repeat(1001),suggestedAnchor:'x'},{excerpt:'x'.repeat(1000),suggestedAnchor:'x'.repeat(201)},{excerpt:'\u{10400}'.repeat(1001),suggestedAnchor:'\u{10400}'},{excerpt:'cache',suggestedAnchor:' '.repeat(201)}]){const result=buildRecommendationEvidence(candidate);assertContract(result);assert.equal(result.status,'unconfirmed');assert.equal(result.reason,'input-too-large');}
});

test('unpaired UTF-16 surrogates are unconfirmed in either string field',()=>{
 for(const invalid of ['\ud800','\udfff','prefix\ud800tail','\ud800\ud800'])for(const field of ['excerpt','suggestedAnchor']){
  const result=buildRecommendationEvidence({excerpt:'cache guide',suggestedAnchor:'cache', [field]:invalid});assertContract(result);assert.equal(result.status,'unconfirmed');assert.equal(result.reason,'invalid-unicode');
 }
});

test('relevant accessors are rejected without invoking them',()=>{
 let calls=0;const candidate={excerpt:'cache',get suggestedAnchor(){calls++;return 'cache';}};
 const result=buildRecommendationEvidence(candidate);assert.equal(result.reason,'invalid-candidate');assert.equal(calls,0);
 const stored={excerpt:'cache',suggestedAnchor:'cache',get anchorEvidence(){calls++;return {};}};assert.equal(readRecommendationEvidence(stored).reason,'invalid-evidence');assert.equal(calls,0);
});

test('stored evidence is validated against current text and legacy reports are not silently upgraded',()=>{
 const candidate={excerpt:'Read cache guide.',suggestedAnchor:'cache guide'},metadata=buildRecommendationEvidence(candidate);
 const legacy=readRecommendationEvidence(candidate);assertContract(legacy);assert.equal(legacy.status,'unconfirmed');assert.equal(legacy.reason,'missing-evidence');
 const read=readRecommendationEvidence({...candidate,anchorEvidence:metadata});assert.deepEqual(read,metadata);assert.notEqual(read,metadata);
 const proposed={excerpt:'Other text.',suggestedAnchor:'cache guide'};assert.equal(readRecommendationEvidence({...proposed,anchorEvidence:buildRecommendationEvidence(proposed)}).status,'text-edit-required');
 const changed=readRecommendationEvidence({...candidate,excerpt:'Changed. '+candidate.excerpt,anchorEvidence:metadata});assert.equal(changed.status,'unconfirmed');assert.equal(changed.reason,'evidence-mismatch');assert.equal(changed.literalSpan,null);
 const redacted={excerpt:'private_prefix cache guide',suggestedAnchor:'cache guide'};redacted.anchorEvidence=buildRecommendationEvidence(redacted);assert.equal(readRecommendationEvidence({...redacted,excerpt:'[redacted] cache guide'}).status,'unconfirmed');
});

test('forged, incomplete or unsupported evidence never becomes a literal renderer instruction',()=>{
 const candidate={excerpt:'Read cache guide.',suggestedAnchor:'cache guide'},metadata=buildRecommendationEvidence(candidate);
 for(const patch of [{schemaVersion:2},{reviewRequired:false},{basis:'semantic'},{offsetUnit:'utf16'},{literalSpan:{...metadata.literalSpan,start:999}},{literalSpan:{...metadata.literalSpan,text:'fabricated'}}]){
  const result=readRecommendationEvidence({...candidate,anchorEvidence:{...metadata,...patch}});assertContract(result);assert.equal(result.status,'unconfirmed');assert.equal(result.reason,'evidence-mismatch');
 }
 for(const value of [{},[],{...metadata,confidence:1},Object.fromEntries(Object.entries(metadata).filter(([key])=>key!=='matchType'))])assert.equal(readRecommendationEvidence({...candidate,anchorEvidence:value}).reason,'invalid-evidence');
 assert.equal(readRecommendationEvidence({anchorEvidence:metadata}).status,'unconfirmed');
});

test('graph enrichment preserves frozen baseline candidate order, excerpt, anchor and lexical basis',()=>{
 const inventory={schemaVersion:1,siteUrl:'https://example.org',coverage:'Synthetic scoped inventory',pages:[{url:'https://example.org/hub',title:'Cache architecture hub',h1:'Cache architecture',kind:'hub',cluster:'cache',text:'Cache invalidation needs a cache architecture.',links:[]},{url:'https://example.org/invalidation',title:'Cache invalidation',h1:'Cache invalidation',kind:'article',cluster:'cache',text:'Read cache architecture before setting cache invalidation.',links:[]},{url:'https://example.org/ttl',title:'Cache TTL',h1:'Cache TTL',kind:'article',cluster:'cache',text:'Cache TTL defines cache expiration.',links:[]}]};
 const result=auditBlog(inventory),pairs=result.recommendations.map(r=>[r.source.split('/').at(-1),r.target.split('/').at(-1),r.suggestedAnchor]);
 assert.deepEqual(pairs,[['hub','invalidation','Cache invalidation'],['invalidation','hub','Cache architecture'],['hub','ttl','Cache TTL'],['ttl','hub','Cache architecture'],['invalidation','ttl','Cache TTL'],['ttl','invalidation','Cache invalidation']]);
 for(const item of result.recommendations){assert.equal(item.excerpt,inventory.pages.find(page=>page.url===item.source).text);assert.equal(item.basis,'lexical-and-cluster');assertContract(item.anchorEvidence);assert.deepEqual(readRecommendationEvidence(item),item.anchorEvidence);}
 assert.equal(result.requiresEditorialReview,true);assert.equal(result.recommendations.filter(item=>item.anchorEvidence.status==='literal-span').length,1);assert.equal(result.recommendations.filter(item=>item.anchorEvidence.status==='text-edit-required').length,5);
});
