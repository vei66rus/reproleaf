import test from 'node:test';
import assert from 'node:assert/strict';
import {auditWebmasterCsv,parseStrictGscCsv as parseCore} from '../src/webmaster-csv-audit.mjs';
import {buildGscReview,formatGscReviewCsv,parseStrictGscCsv,safeGscCsvCell} from '../src/browser/tools/gsc-quick-wins.js';
import {cleanKeywordList,formatKeywordCsv,keywordCsvCell} from '../src/browser/tools/keyword-cleaner.js';

const valid='Query,Page,Clicks,Impressions,CTR,Position\nseo,https://example.com/a,2,500,0.4%,6\nseo,https://example.com/b,1,200,0.5%,8';
test('GSC core and browser share validated observations, scopes and derived CTR',()=>{
 const core=auditWebmasterCsv({csvText:valid});
 const browser=buildGscReview(valid);
 assert.equal(core.summary.rowCount,2);
 assert.equal(browser.summary.rowCount,2);
 assert.equal(browser.overlaps.length,1);
 assert.equal(browser.quickWins[0].ctr,0.004);
 assert(!('upsideClicks' in browser.quickWins[0]));
 assert.match(browser.scope.ctr,/illustrative curve/);
 assert.match(core.scope.ctrModel,/not a traffic forecast/);
 assert.equal(browser.scope.networkUsed,false);
});
for(const [name,csv] of [
 ['unknown headers','name,other\nhello,world'],
 ['missing position','Query,Clicks,Impressions\na,1,100'],
 ['missing impressions','Query,Clicks,Position\na,1,5'],
 ['missing identity','Clicks,Impressions,Position\n1,100,5'],
 ['duplicate header','Query,Clicks,Clicks,Impressions,Position\na,1,1,100,5'],
 ['duplicate alias','Query,Keyword,Clicks,Impressions,Position\na,b,1,100,5'],
 ['unclosed quotes','Query,Clicks,Impressions,Position\n"unfinished,1,100,5'],
 ['junk after quote','Query,Clicks,Impressions,Position\n"a"junk,1,100,5'],
 ['missing cell','Query,Clicks,Impressions,Position\na,1,100'],
 ['extra cell','Query,Clicks,Impressions,Position\na,1,100,5,extra'],
 ['invalid click','Query,Clicks,Impressions,Position\na,abc,100,5'],
 ['blank impression','Query,Clicks,Impressions,Position\na,1,,5'],
 ['negative click','Query,Clicks,Impressions,Position\na,-1,100,5'],
 ['fractional click','Query,Clicks,Impressions,Position\na,1.2,100,5'],
 ['fractional count with three decimals','Query,Clicks,Impressions,Position\na,0.123,100,5'],
 ['infinite impression','Query,Clicks,Impressions,Position\na,1,Infinity,5'],
 ['unsafe integer','Query,Clicks,Impressions,Position\na,1,9007199254740992,5'],
 ['invalid grouped number','Query,Clicks,Impressions,Position\na,1,1 2,5'],
 ['clicks over impressions','Query,Clicks,Impressions,Position\na,101,100,5'],
 ['zero position with impressions','Query,Clicks,Impressions,Position\na,1,100,0'],
 ['invalid CTR','Query,Clicks,Impressions,Position,CTR\na,1,100,5,nope'],
 ['credentialed page','Page,Clicks,Impressions,Position\nhttps://secret:pass@example.com/,1,100,5'],
 ['executable page','Page,Clicks,Impressions,Position\njavascript:alert(1),1,100,5']
])test(`GSC rejects ${name} through both public core and browser`,()=>{
 assert.throws(()=>auditWebmasterCsv({csvText:csv}));assert.throws(()=>buildGscReview(csv));
});
test('GSC supports RU semicolon headers, decimal commas, whitespace groups and BOM',()=>{
 const input='\uFEFFЗапрос;Страница;Клики;Показы;CTR;Средняя позиция\n"как проверить SEO";https://example.com/ru;2;1 234;0,16%;5,5';
 const parsed=parseStrictGscCsv(input);assert.equal(parsed.rows[0].impressions,1234);assert.equal(parsed.rows[0].position,5.5);
 assert.equal(buildGscReview(input).summary.rowCount,1);
});
test('GSC supports TSV, multiline quoted values and escaped quotes',()=>{
 const parsed=parseStrictGscCsv('Query\tClicks\tImpressions\tPosition\n"first\nsecond ""quoted"""\t2\t100\t5');
 assert.equal(parsed.rows[0].query,'first\nsecond "quoted"');
});
test('GSC query-only and page-only exports disclose unobserved overlaps',()=>{
 for(const key of ['Query','Page']){
  const value=key==='Query'?'seo':'https://example.com/';
  const csv=`${key},Clicks,Impressions,Position\n${value},1,100,5`;
  const core=auditWebmasterCsv({csvText:csv}),browser=buildGscReview(csv);
  assert.equal(core.scope.overlapStatus,'not-checked');assert.match(browser.scope.overlap,/Not checked/);assert.deepEqual(browser.overlaps,[]);
 }
});
test('GSC category caps preserve total counts rather than silently reducing source scope',()=>{
 const csv='Query,Clicks,Impressions,Position\n'+Array.from({length:105},(_,i)=>`query${i},1,100,5`).join('\n');
 const report=buildGscReview(csv);assert.equal(report.summary.rowCount,105);assert.equal(report.summary.quickWinCount,105);assert.equal(report.quickWins.length,100);assert.equal(report.scope.categoryLimit,100);
});
test('GSC input bytes, row count and thresholds are bounded before analysis',()=>{
 assert.throws(()=>buildGscReview('a'.repeat(1048577)),/GSC_FILE_LIMIT/);
 assert.throws(()=>buildGscReview('Query,Clicks,Impressions,Position\n'+'a,1,100,5\n'.repeat(5001)),/GSC_ROW_LIMIT/);
 assert.equal(parseCore('Query,Clicks,Impressions,Position\n'+'a,1,100,5\n'.repeat(5001)).rows.length,5001);
 for(const n of [0,-1,NaN,1.5,1000001])assert.throws(()=>buildGscReview(valid,n),/GSC_THRESHOLD/);
});
test('GSC rejects aggregate count overflow before returning rounded totals',()=>{
 const csv='Query,Clicks,Impressions,Position\na,1,9007199254740991,5\nb,1,9007199254740991,5';
 assert.throws(()=>auditWebmasterCsv({csvText:csv}),/GSC_NUMBERS/);assert.throws(()=>buildGscReview(csv),/GSC_NUMBERS/);
});
test('CSV exports quote fields, preserve newlines, and guard spreadsheet formulas',()=>{
 for(const prefix of ['=','+','-','@','\t=',' \n+','\uFEFF@']){
  assert(safeGscCsvCell(prefix+'1').startsWith('"\''));assert(keywordCsvCell(prefix+'1').startsWith('"\''));
 }
 assert.equal(safeGscCsvCell('a,"b"\nc'),'"a,""b""\nc"');
 const report=buildGscReview('Query,Clicks,Impressions,Position\n=HYPERLINK(),1,100,5');
 const csv=formatGscReviewCsv(report);assert(csv.startsWith('\uFEFF'));assert(csv.includes('"\'=HYPERLINK()"'));assert(csv.includes('\r\n'));
});
test('Keyword cleaning normalizes deterministically with source-line provenance',()=>{
 const report=cleanKeywordList('\uFEFFSEO audit\nseo   audit\nＳＥＯ audit\n\nseo checker\n');
 assert.equal(report.summary.inputQueries,4);assert.equal(report.summary.uniqueQueries,2);assert.equal(report.summary.duplicateOccurrences,2);assert.equal(report.summary.blankLines,2);assert.deepEqual(report.queries[0].lines,[1,2,3]);assert.equal(report.queries[0].occurrences,3);
 assert.equal(report.groups.length,1);assert.equal(report.scope.networkUsed,false);assert.match(report.scope.grouping,/not semantic or SERP/);
});
test('Keyword options preserve punctuation/case when requested and use explicit prefix groups',()=>{
 const report=cleanKeywordList('SEO audit\nseo audit\nseo-audit\nseo audit tools\nSEO audit',{caseFold:false,prefixWords:2});
 assert.equal(report.queries.length,4);assert.equal(report.queries.find(r=>r.query==='SEO audit').occurrences,2);assert.equal(report.queries.find(r=>r.query==='seo-audit').group,'seo-audit');
 assert.equal(cleanKeywordList('Ａ\nA',{normalizeUnicode:false}).summary.uniqueQueries,2);
 assert.equal(cleanKeywordList('I\ni').summary.uniqueQueries,1);
});
test('Keyword limits and invalid control characters fail explicitly',()=>{
 for(const [value,code] of [['',/KEYWORD_EMPTY/],['a'.repeat(501),/KEYWORD_LENGTH/],['a\u0000b',/KEYWORD_CONTROL/],['a\u000Bb',/KEYWORD_CONTROL/],['a\n'.repeat(5001),/KEYWORD_LINES/],['a'.repeat(1048577),/KEYWORD_SIZE/]])assert.throws(()=>cleanKeywordList(value),code);
 assert.throws(()=>cleanKeywordList('a',{prefixWords:4}),/KEYWORD_OPTIONS/);
});
test('Keyword exports contain all bounded entries rather than only preview',()=>{
 const report=cleanKeywordList(Array.from({length:150},(_,i)=>`keyword ${i}`).join('\n'));
 assert.equal(report.summary.uniqueQueries,150);assert.equal(report.queries.length,150);
 const csv=formatKeywordCsv(report);assert(csv.startsWith('\uFEFF'));assert.equal(csv.split('\r\n').length,151);assert(csv.includes('keyword 149'));
});
