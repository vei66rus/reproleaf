import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSerpGap} from '../src/serp-gap-analyzer.mjs';

test('SERP gap preserves unknown observations instead of inventing empty content',()=>{
 const report=analyzeSerpGap({target:{url:'https://target.example/'},competitors:[{url:'https://one.example/'},{url:'https://two.example/',wordCount:100,hasFaq:true,terms:['audit']}]});
 assert.equal(report.targetComparison.wordCount,null);
 assert.equal(report.targetComparison.hasFaq,null);
 assert.equal(report.targetComparison.schemaTypes,null);
 assert.equal(report.competitors[0].h2Count,null);
 assert.deepEqual(report.benchmarks.words,{min:100,median:100,max:100,target:null});
 assert.equal(report.benchmarks.adoption.faqRatio,1);
 assert.equal(report.coverage.observed.faq,1);
 assert.equal(report.benchmarks.topSharedTerms[0].coverageRatio,1);
 assert.equal(report.benchmarks.topSharedTerms[0].observedCompetitorCount,1);
 assert.deepEqual(report.findings,[]);
 assert.equal(report.coverage.rankingVerified,false);
});

test('SERP gap per-page adoption cannot count duplicate headings or schema twice',()=>{
 const report=analyzeSerpGap({competitors:[{url:'https://one.example/',headings:[{level:2,text:'Audit'},{level:2,text:' audit '},{level:3,text:'AUDIT'}],schemaTypes:['Article','Article']}]});
 assert.equal(report.benchmarks.recurringHeadings[0].competitorCount,1);
 assert.equal(report.benchmarks.recommendedSchemaTypes[0].competitorCount,1);
});

test('SERP gap rejects duplicate source URLs and credentials and strips export query/hash',()=>{
 assert.throws(()=>analyzeSerpGap({competitors:[{url:'https://one.example/#a'},{url:'https://one.example/#b'}]}),/Duplicate/);
 assert.throws(()=>analyzeSerpGap({competitors:[{url:'https://user:pass@one.example/'}]}));
 const report=analyzeSerpGap({target:{url:'https://target.example/path?token=SECRET#hidden'},competitors:[{url:'https://one.example/?key=SECRET'}]});
 assert(!JSON.stringify(report).includes('SECRET'));
 assert.equal(report.targetComparison.url,'https://target.example/path');
});

test('SERP gap observations do not prescribe copying length, FAQ or schema',()=>{
 const report=analyzeSerpGap({target:{url:'https://target.example/',html:'<main><h1>Target</h1><p>Audit.</p></main>'},competitors:[{url:'https://one.example/',html:'<main><h1>Audit</h1><h2>Audit</h2><p>'+('detailed observations '.repeat(50))+'</p><table><tr><td>Inputs</td></tr></table><script type="application/ld+json">{"@type":"FAQPage"}</script></main>'}]});
 assert.equal(report.benchmarks.words.target,null);
 assert(report.findings.length>0);
 assert(report.findings.every(f=>f.comparisonOnly));
 assert(!JSON.stringify(report).includes('recommendedWords'));
});

test('SERP static HTML excludes explicit hidden text and handles deep trees iteratively',()=>{
 const profile={url:'https://one.example/',html:'<main><h1>Audit</h1><p>Visible words.</p><div hidden><h2>Secret heading</h2>secretterm</div><p style="display:none">anothersecret</p></main>'};
 const report=analyzeSerpGap({competitors:[profile]});
 assert.equal(report.competitors[0].h2Count,0);
 assert(!report.benchmarks.topSharedTerms.some(t=>t.term.includes('secret')));
 const deep=analyzeSerpGap({competitors:[{html:'<div>'.repeat(1500)+'<p>Observed</p>'+'</div>'.repeat(1500)}]});
 assert.equal(deep.competitors[0].wordCount,1);
});
