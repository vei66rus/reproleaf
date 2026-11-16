import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSuppliedPages,comparisonCsv} from '../src/browser/tools/serp-gap.js';

const input={targetHtml:'<main><h1>Target</h1><p>Read the source.</p></main>',targetUrl:'https://target.example/?token=PRIVATE#note',competitorsText:JSON.stringify([{url:'https://one.example/?secret=PRIVATE',html:'<main><h1>Source</h1><h2>Inspect</h2><p>Read the source and record observations.</p></main>'}])};
test('page comparison has true supplied data, no raw HTML or URL secrets in exports',()=>{
 const report=compareSuppliedPages(input);
 assert.equal(report.kind,'supplied-page-comparison');
 assert.equal(report.competitors.length,1);
 assert.equal(report.coverage.searchResultsFetched,false);
 assert(!JSON.stringify(report).includes('PRIVATE'));
 assert(!JSON.stringify(report).includes('<main>'));
 assert(comparisonCsv(report).startsWith('\uFEFF"role"'));
 assert(!comparisonCsv(report).includes('PRIVATE'));
});
test('page comparison rejects empty, oversized or malformed data before reporting',()=>{
 for(const competitorsText of ['', 'bad', '[]', '[{"url":"https://one.example"}]'])assert.throws(()=>compareSuppliedPages({...input,competitorsText}));
 assert.throws(()=>compareSuppliedPages({...input,targetHtml:'a'.repeat(1048577)}),/limit/i);
 assert.throws(()=>compareSuppliedPages({...input,competitorsText:JSON.stringify(Array.from({length:21},(_,i)=>({url:`https://one.example/${i}`,wordCount:1})))}));
});
test('CSV guards formulas and keeps explicit unknown empty, not zero',()=>{
 const report=compareSuppliedPages({targetHtml:'',competitorsText:JSON.stringify({target:{title:'Target',wordCount:0},competitors:[{url:'https://one.example/',headings:[{level:2,text:'=HYPERLINK("bad")'}],schemaTypes:[' \t=FORMULA()']}]})});
 const csv=comparisonCsv(report);
 assert(csv.includes("' \t=FORMULA()"));
 assert.equal(report.competitors[0].wordCount,null);
 assert.equal(report.targetComparison.wordCount,0);
});
test('query variants retain distinct ordinal source identity without leaking queries',()=>{
 const report=compareSuppliedPages({...input,competitorsText:JSON.stringify([{url:'https://one.example/?mode=PRIVATE',wordCount:1},{url:'https://one.example/?mode=OTHER',wordCount:2}])});
 assert.deepEqual(report.competitors.map(p=>p.sourceIndex),[1,2]);
 assert.deepEqual(report.competitors.map(p=>p.url),['https://one.example/','https://one.example/']);
 assert(!JSON.stringify(report).includes('PRIVATE'));
});
