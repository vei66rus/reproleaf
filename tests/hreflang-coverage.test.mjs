import test from 'node:test';
import assert from 'node:assert/strict';
import {auditHreflangMatrix} from '../src/hreflang-audit.mjs';
import {sitemapReportCsv} from '../src/browser/tools/hreflang-sitemap.js';

test('missing supplied target is partial coverage, not a verified return-link pass',()=>{
 const report=auditHreflangMatrix({pages:[{url:'https://example.com/en',alternates:[{hreflang:'en',href:'https://example.com/en'},{hreflang:'ru',href:'https://example.com/ru'}]}]});
 assert.equal(report.ok,false);assert.equal(report.status,'partial');assert.equal(report.summary.uncheckedReturnLinks,1);assert.equal(report.coverage.reciprocityComplete,false);assert.equal(report.summary.missingReturnLinks,0);assert.ok(report.findings.some(f=>f.code==='HREFLANG_TARGET_NOT_SUPPLIED'));
});

test('no alternates supplied is not processed and x-default remains optional',()=>{
 const empty=auditHreflangMatrix({pages:[{url:'https://example.com/en',alternates:[]}]});
 assert.equal(empty.status,'not-processed');assert.equal(empty.ok,false);
 const pages=[{url:'https://example.com/en',alternates:[{hreflang:'en',href:'https://example.com/en'},{hreflang:'ru',href:'https://example.com/ru'}]},{url:'https://example.com/ru',alternates:[{hreflang:'en',href:'https://example.com/en'},{hreflang:'ru',href:'https://example.com/ru'}]}];
 const valid=auditHreflangMatrix({pages});assert.equal(valid.ok,true);assert.equal(valid.summary.warnings,0);assert.ok(valid.findings.filter(f=>f.code==='HREFLANG_MISSING_X_DEFAULT').every(f=>f.severity==='info'));
});

test('a return path with the wrong language is not accepted as reciprocity',()=>{
 const report=auditHreflangMatrix({pages:[{url:'https://example.com/en',alternates:[{hreflang:'en',href:'https://example.com/en'},{hreflang:'ru',href:'https://example.com/ru'}]},{url:'https://example.com/ru',alternates:[{hreflang:'de',href:'https://example.com/en'},{hreflang:'ru',href:'https://example.com/ru'}]}]});
 assert.equal(report.ok,false);assert.ok(report.findings.some(f=>f.code==='HREFLANG_MISSING_RETURN_LINK'&&f.url==='https://example.com/en'));
});

test('matrix URL references require HTTP(S), explicit authority, no credentials and no fragments',()=>{
 for(const url of ['https:example.com/a','ftp://example.com/a','https://user:pass@example.com/a','https://example.com/a#fragment','not a url','https://example.com/a\nb','https://example.com/a\tb','https://example.com/a\u0000b'])assert.throws(()=>auditHreflangMatrix({pages:[{url,alternates:[]}]}));
 assert.throws(()=>auditHreflangMatrix({pages:[{url:'https://example.com/a',alternates:[{hreflang:'en',href:'javascript:alert(1)'}]}]}));
});

test('CSV quotes URL queries and neutralizes spreadsheet formula prefixes',()=>{
 const csv=sitemapReportCsv({difference:{added:['https://example.com/a?x=1&y=2','=HYPERLINK("x")'],removed:[],unchanged:[]},matrix:{matrix:[]},findings:[]});
 assert.match(csv,/^\uFEFF/);assert.ok(csv.includes('https://example.com/a?x=1&y=2'));assert.ok(csv.includes("'=HYPERLINK"));assert.match(csv,/\r\n/);
});
