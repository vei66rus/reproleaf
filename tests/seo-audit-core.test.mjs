import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startApi} from '../src/api.mjs';
import {checkRewritePreservation} from '../src/rewrite-guard.mjs';
import {auditHtmlDocument} from '../src/html-audit.mjs';
import {exportReportCsv} from '../src/csv-export.mjs';

test('checkRewritePreservation preserves valid rewrites and blocks dropped numbers, URLs, formulas, code, and conditions',async()=>{
 const ok=checkRewritePreservation({
  before:'Run `npm test` only if latency <= 42% on https://example.org/docs with $x + y = 10$.',
  after:'Please execute `npm test` only if latency <= 42% using https://example.org/docs ($x + y = 10$).'
 });
 assert.equal(ok.status,'needs_independent_review');
 assert.equal(ok.summary.blocked,0);

 const unchanged=checkRewritePreservation({before:'Same text 10',after:'Same text 10'});
 assert.equal(unchanged.status,'no_changes_proposed');

 const blocked=checkRewritePreservation({
  before:'Run `npm test` only if latency <= 42% on https://example.org/docs with $x + y = 10$.',
  after:'Run tests when latency is 50% on https://other.invalid/docs.'
 });
 assert.equal(blocked.status,'blocked_by_preservation_checks');
 const failedKinds=new Set(blocked.guards.filter(g=>!g.passed).map(g=>g.kind));
 assert.ok(failedKinds.has('numbers'));
 assert.ok(failedKinds.has('urls'));
 assert.ok(failedKinds.has('formulas'));
 assert.ok(failedKinds.has('code'));
 assert.ok(failedKinds.has('negations_and_conditions'));

 const api=await startApi({port:0});
 try{
  const res=await fetch(api.url+'/v1/rewrite-guard',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({edits:[{id:'p1',before:'Limit is 100 ms.',after:'Limit is 200 ms.'}]})
  });
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.status,'blocked_by_preservation_checks');

  const mcpRes=await fetch(api.url+'/v1/mcp',{
   method:'POST',
   headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'check_rewrite_preservation',arguments:{before:'Limit 5',after:'Limit 5'}}})
  });
  assert.equal(mcpRes.status,200);
  const mcpJson=await mcpRes.json();
  assert.equal(mcpJson.result.isError,false);
 }finally{await api.close();}
});

test('auditHtmlDocument detects canonical, hreflang, mojibake, H1-H6, nested article, and robots issues',async()=>{
 const badHtml=`<!doctype html><html><head>
  <title>Broken \uFFFD Page</title>
  <meta name="robots" content="noindex">
  <link rel="canonical" href="https://example.org/a">
  <link rel="canonical" href="https://example.org/b">
  <link rel="alternate" hreflang="en" href="https://example.org/en">
  <link rel="alternate" hreflang="en" href="https://example.org/en-us">
 </head><body><main><article><h1>One</h1><h3>Skipped H2</h3><p>ÐŸÑ€Ð¸Ð²ÐµÑ‚</p></article></main></body></html>`;
 const report=auditHtmlDocument({html:badHtml,url:'https://example.org/a'});
 const codes=new Set(report.findings.map(f=>f.code));
 assert.ok(codes.has('multiple-canonicals'));
 assert.ok(codes.has('duplicate-hreflang'));
 assert.ok(codes.has('missing-self-hreflang'));
 assert.ok(codes.has('replacement-character-detected'));
 assert.ok(codes.has('mojibake-candidate'));
 assert.ok(codes.has('heading-level-gap'));
 assert.ok(codes.has('nested-article-in-main'));
 assert.ok(codes.has('robots-noindex'));
 assert.ok(codes.has('description-not-provided'));

 const cleanHtml=`<!doctype html><html><head>
  <title>Clean Page</title>
  <meta name="description" content="Clean summary.">
  <link rel="canonical" href="https://example.org/clean">
 </head><body><main><h1>Main Heading</h1><h2>Subheading</h2></main></body></html>`;
 const cleanReport=auditHtmlDocument({html:cleanHtml,url:'https://example.org/clean'});
 assert.equal(cleanReport.summary.errors,0);
 assert.equal(cleanReport.summary.warnings,0);

 const api=await startApi({port:0});
 try{
  const res=await fetch(api.url+'/v1/html-audit',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({html:cleanHtml,url:'https://example.org/clean'})
  });
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.kind,'html-audit');
  assert.equal(body.summary.errors,0);
 }finally{await api.close();}
});

test('exportReportCsv emits UTF-8 BOM, semicolon delimiter, and neutralizes formula injection',()=>{
 const out=exportReportCsv({
  kind:'findings',
  projectName:'audit-demo',
  report:{
   kind:'editorial-review',
   findings:[
    {code:'unsafe-cell',severity:'warning',record:'=CMD("calc")',observation:'+1+1',why:'@SUM(A1:A2)',suggestion:'-10',verifyHint:'ok',message:'Check'}
   ]
  }
 });
 assert.ok(out.csv.startsWith('\uFEFF'));
 assert.equal(out.rowCount,1);
 assert.ok(out.csv.includes('"\'=CMD(""calc"")"'));
 assert.ok(out.csv.includes('"\'+1+1"'));
 assert.ok(out.csv.includes('"\'@SUM(A1:A2)"'));
 assert.ok(out.csv.includes('"\'-10"'));
});
