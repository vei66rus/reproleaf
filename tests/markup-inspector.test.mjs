import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMarkupReview,inspectMarkupInput,formatMarkupReviewCsv,markupExample} from '../src/browser/tools/markup-inspector.js';

test('JSON-LD inspector accepts HTML and standalone JSON with explicit local scope',()=>{
 for(const format of ['html','json']){
  const report=buildMarkupReview({text:markupExample('jsonld-schema',format),format});
  assert.equal(report.summary.blocks,1);assert.equal(report.summary.entities,1);assert.deepEqual(report.summary.types,['Article']);assert.equal(report.summary.errors,0);assert.equal(report.scope.networkUsed,false);assert.equal(report.scope.sourceHtmlIncluded,false);assert.match(report.scope.coverage,/not full Schema.org/);
 }
});
test('Schema syntax, missing fields and empty input observations remain distinct',()=>{
 assert.throws(()=>buildMarkupReview({text:''}),/MARKUP_EMPTY/);
 const syntax=buildMarkupReview({text:'{"@type":',format:'json'});
 assert.equal(syntax.summary.errors,1);assert(syntax.findings.some(f=>f.code==='SCHEMA_INVALID_JSON'));
 const noSchema=buildMarkupReview({text:'<h1>No structured data</h1>'});
 assert.equal(noSchema.summary.blocks,0);assert(noSchema.findings.some(f=>f.code==='SCHEMA_MISSING'));
 const missing=buildMarkupReview({text:'{"@context":"https://schema.org","@type":"Article"}',format:'json'});
 assert(missing.findings.some(f=>f.code==='SCHEMA_ARTICLE_MISSING_FIELD'));
});
test('Standalone JSON containing a closing script string is never interpreted as HTML',()=>{
 const text=JSON.stringify({'@context':'https://schema.org','@type':'SoftwareApplication',name:'</script><img src=x onerror=alert(1)>',applicationCategory:'DeveloperApplication'});
 const inspected=inspectMarkupInput(text,{format:'json'});
 assert(!inspected.html.includes('<img'));
 assert.equal(buildMarkupReview({text,format:'json'}).summary.entities,1);
});
test('Schema profile flags deceptive context and impossible calendar date without claiming JSON-LD expansion',()=>{
 const report=buildMarkupReview({text:JSON.stringify({'@context':'https://evil.example/schema.org','@type':'Article',headline:'Test',author:'Author',datePublished:'2026-02-31'}),format:'json'});
 assert(report.findings.some(f=>f.code==='SCHEMA_CONTEXT_UNUSUAL'));
 assert(report.findings.some(f=>f.code==='SCHEMA_INVALID_DATE'));
 assert.equal(report.summary.warnings,2);
});
test('Calendar checking handles leap years and legitimate time prefixes',()=>{
 for(const [date,valid] of [['2024-02-29',true],['2026-02-29',false],['2026-04-31',false],['2026-11-16T10:30:00Z',true],['0001-01-01',true]]){
  const report=buildMarkupReview({text:JSON.stringify({'@context':'https://schema.org','@type':'Article',headline:'Test',author:'Author',datePublished:date}),format:'json'});
  assert.equal(report.findings.some(f=>f.code==='SCHEMA_INVALID_DATE'),!valid,date);
 }
});
test('Complex contexts are identified as unsupported rather than remotely expanded',()=>{
 const report=buildMarkupReview({text:'{"@context":{"@vocab":"https://schema.org/"},"@type":"Person","name":"Example"}',format:'json'});
 assert(!report.findings.some(f=>f.code==='SCHEMA_CONTEXT_UNUSUAL'));
 const custom=buildMarkupReview({text:'{"@context":"https://example.com/custom","@type":"Example"}',format:'json'});
 assert(custom.findings.some(f=>f.code==='SCHEMA_CONTEXT_UNUSUAL'));
});
test('JSON strings containing bracket characters do not create a false depth rejection',()=>{
 const report=buildMarkupReview({text:JSON.stringify({'@context':'https://schema.org','@type':'Person',name:'['.repeat(500)}),format:'json'});
 assert.equal(report.summary.entities,1);
});
test('Markup bytes, deep trees, large arrays and excessive script blocks are bounded',()=>{
 assert.throws(()=>buildMarkupReview({text:'a'.repeat(1048577)}),/MARKUP_SIZE/);
 assert.throws(()=>buildMarkupReview({text:'['.repeat(40)+'0'+']'.repeat(40),format:'json'}),/MARKUP_COMPLEX/);
 assert.throws(()=>buildMarkupReview({text:'['+'0,'.repeat(11000)+'0]',format:'json'}),/MARKUP_COMPLEX/);
 assert.throws(()=>buildMarkupReview({text:'<div>'.repeat(140)+'x'+'</div>'.repeat(140)}),/MARKUP_COMPLEX/);
 assert.throws(()=>buildMarkupReview({text:'<script type="application/ld+json">{}</script>'.repeat(101)}),/MARKUP_COMPLEX/);
});
test('Optional page URLs are labels only and reject credentials or executable schemes',()=>{
 for(const url of ['javascript:alert(1)','https://user:pass@example.com/','not a URL'])assert.throws(()=>buildMarkupReview({text:markupExample('social-meta'),mode:'social-meta',url}),/MARKUP_URL/);
 const report=buildMarkupReview({text:markupExample('social-meta'),mode:'social-meta',url:'https://example.com/path?access_token=private#part'});
 assert.equal(report.url,'https://example.com/path');
});
test('Social mode reports extracted values without certifying network availability or card rendering',()=>{
 const report=buildMarkupReview({text:markupExample('social-meta'),mode:'social-meta'});
 assert.equal(report.summary.errors,0);assert.equal(report.preview.title,'A reproducible cache check');assert.equal(report.preview.image,'https://example.com/card.png');assert.equal(report.scope.networkUsed,false);assert.match(report.scope.coverage,/No image download/);
});
test('Invalid social URLs cannot be accepted merely because they start with https',()=>{
 const report=buildMarkupReview({mode:'social-meta',text:'<meta property="og:title" content="Example"><meta property="og:url" content="javascript:alert(1)"><meta property="og:image" content="https://[invalid"><meta name="twitter:image" content="https://user:password@example.com/card.png">'});
 assert.equal(report.ok,false);assert.equal(report.findings.filter(f=>['SOCIAL_INVALID_PAGE_URL','SOCIAL_INVALID_IMAGE_URL'].includes(f.code)).length,3);
});
test('Duplicate meta tags and canonical mismatches remain reported',()=>{
 const report=buildMarkupReview({mode:'social-meta',text:'<link rel="canonical" href="https://example.com/a"><meta property="og:title" content="A"><meta property="og:title" content="B"><meta property="og:url" content="https://example.com/b">'});
 assert(report.findings.some(f=>f.code==='SOCIAL_DUPLICATE_META'));
 assert(report.findings.some(f=>f.code==='SOCIAL_OG_URL_CANONICAL_MISMATCH'));
});
test('Exports exclude raw source and redact known secrets and URL query fragments',()=>{
 const report=buildMarkupReview({mode:'social-meta',text:'<meta property="og:title" content="email qa@example.com"><meta property="og:url" content="https://example.com/?access_token=secret#part"><meta property="og:image" content="https://example.com/card.png?token=hidden">'});
 const json=JSON.stringify(report);
 assert(!json.includes('qa@example.com'));assert(!json.includes('access_token=secret'));assert(!json.includes('token=hidden'));assert.equal(report.html,undefined);assert(!json.includes('<meta property="og:title" content='));
 assert(json.includes('[redacted-email]'));
});
test('Finding CSV output is bounded by the report, quoted and spreadsheet-safe',()=>{
 const csv=formatMarkupReviewCsv({findings:[{code:'=bad',severity:'warning',blockIndex:0,target:'@type',message:'line,"quoted"\nnext',recommendation:'+review'}]});
 assert(csv.startsWith('\uFEFF'));assert(csv.includes('"\'=bad"'));assert(csv.includes('"\'@type"'));assert(csv.includes('"\'+review"'));assert(csv.includes('line,""quoted""\nnext'));assert(csv.includes('\r\n'));
});
test('Unsupported modes fail before parsing rather than mounting another tool',()=>{
 assert.throws(()=>buildMarkupReview({mode:'unknown',text:'x'}),/MARKUP_MODE/);
 assert.throws(()=>buildMarkupReview({mode:'social-meta',format:'json',text:'{}'}),/MARKUP_MODE/);
});
