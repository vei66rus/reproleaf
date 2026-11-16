import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeAccessLogs} from '../src/access-log-analyzer.mjs';
import {auditEeatSignals} from '../src/eeat-audit.mjs';
import {reviewLogText,logReportCsv} from '../src/browser/tools/log-bot.js';
import {inspectTrustHtml,trustSignalRows,trustReportCsv} from '../src/browser/tools/eeat.js';

const line=(url,status=200,ua='Googlebot')=>`192.0.2.123 - - [15/Nov/2026:12:00:00 +0000] "GET ${url} HTTP/1.1" ${status} 1 "-" "${ua}"`;

test('logs reject invalid HTTP status records and distinguish absent observations',()=>{
 const report=analyzeAccessLogs({rawLog:[line('/a',999),line('/b',0),JSON.stringify({path:'/c',status:700,userAgent:'GPTBot'})].join('\n'),crawledUrls:['https://example.com/a']});
 assert.equal(report.ok,false);assert.equal(report.summary.totalHits,0);assert.equal(report.summary.unparsedLines,3);assert.equal(report.summary.reviewCandidateRatio,null);assert.deepEqual(report.invisiblePages,[]);
 const human=analyzeAccessLogs({rawLog:line('/a',200,'Human Browser')});assert.equal(human.summary.botHits,0);assert.equal(human.summary.reviewCandidateRatio,null);assert.equal(human.scope.networkVerification,false);
 const informational=analyzeAccessLogs({rawLog:line('/a',100)});assert.equal(informational.botStatusDistribution['1xx'],1);
});

test('logs redact queries, credentials, fragments and known sensitive path segments without losing parameter counts',()=>{
 const report=analyzeAccessLogs({rawLog:[line('/private?token=TOPSECRET&sort=price',404),line('https://user:SECRET@example.com/token/PRIVATEVALUE#fragment',500),line('/person/alice%40example.com'),line('/network/192.0.2.123')].join('\n'),crawledUrls:['https://user:SECRET@example.com/unseen?token=TOPSECRET#fragment']});
 const output=JSON.stringify(report);
 for(const secret of ['TOPSECRET','PRIVATEVALUE','alice@','alice%40','192.0.2.123','user:SECRET','?token=','#fragment'])assert.equal(output.includes(secret),false,secret);
 assert.equal(report.summary.wasteOnParams,1);assert.equal(report.summary.botHits,4);assert.match(output,/redacted/);
 assert.equal(report.scope.botIdentity,'claimed-user-agent-only');
 const csv=logReportCsv(report);assert.equal(csv.includes('TOPSECRET'),false);assert.match(csv,/^\uFEFF/);
});

test('log panel pure boundary rejects oversized and overlong inputs rather than truncating silently',()=>{
 assert.throws(()=>reviewLogText({rawLog:'x'.repeat(2*1024*1024+1)}),/TOO_LARGE/);
 assert.throws(()=>reviewLogText({rawLog:Array(10001).fill('x').join('\n')}),/TOO_MANY_LINES/);
 assert.throws(()=>reviewLogText({rawLog:' '}),/EMPTY/);
 assert.throws(()=>reviewLogText({rawLog:line('/'),crawledUrls:Array(501).fill('/a')}),/PATH_LIMIT/);
});

test('trust audit does not treat metadata, hidden nodes or hidden descendants as visible authors',()=>{
 const report=auditEeatSignals({html:'<meta name="author" content="Meta Name"><div aria-hidden="true " class="byline">Hidden One</div><span class="byline"><b hidden>Hidden Two</b></span><p style="display: none !important" class="author">Hidden Three</p><a href="/about">About</a>',url:'https://example.com/'});
 assert.equal(report.signals.author.visible,false);assert.deepEqual(report.signals.author.mentions,[]);assert.equal(report.signals.author.metaAuthor,'Meta Name');
 assert.equal(report.scope.computedVisibilityChecked,false);assert.equal(report.scope.authorIdentityVerified,false);
});

test('trust dates require valid ISO dates and entities do not universally require both Person and Organization',()=>{
 const report=auditEeatSignals({html:'<a rel="author" href="/authors/example">Example</a><time datetime="banana">banana</time><meta property="article:published_time" content="2026-02-30"><script type="application/ld+json">{"@type":"Person","name":"Example","dateModified":"2026-11-15T25:00:00Z"}</script>',url:'https://example.com/'});
 assert.equal(report.signals.author.visible,true);assert.equal(report.signals.dates.published,null);assert.deepEqual(report.signals.dates.timeTags,[]);assert.equal(report.signals.schema.hasDateModified,false);
 assert.equal(report.findings.some(f=>f.code==='EEAT_INCOMPLETE_ENTITY_SCHEMA'),false);
 const leap=auditEeatSignals({html:'<time datetime="2024-02-29">Leap</time>'});assert.deepEqual(leap.signals.dates.timeTags,['2024-02-29']);
});

test('external links are not classified as primary sources and missing origin remains unknown',()=>{
 const report=auditEeatSignals({html:'<a href="https://user:PASS@affiliate.example/path?token=SECRET#fragment">Buy</a>',url:'https://example.com/guide'});
 assert.equal(report.signals.externalLinksCount,1);assert.equal(report.signals.externalPrimarySources,undefined);assert.equal(report.scope.primarySourceStatusVerified,false);
 assert.equal(JSON.stringify(report).includes('SECRET'),false);assert.equal(JSON.stringify(report).includes('PASS'),false);
 const unknown=inspectTrustHtml({html:'<a href="https://example.com/a">A</a>'});assert.equal(unknown.signals.externalLinksCount,null);assert.deepEqual(trustSignalRows(unknown).find(row=>row[0]==='external'),['external',null]);
});

test('trust panels omit source HTML and deprecated trust score from exports',()=>{
 const html='<main><p class="byline">Example Author</p><script>window.PRIVATE_EXECUTION=true</script></main>';
 const report=inspectTrustHtml({html,url:'https://example.com/?token=PRIVATE'});
 const output=JSON.stringify(report);assert.equal(report.score,undefined);assert.equal(report.rating,undefined);assert.equal(report.legacyMetrics,undefined);assert.equal(output.includes('PRIVATE_EXECUTION'),false);assert.equal(output.includes('?token=PRIVATE'),false);assert.equal(report.coverage.htmlExecuted,false);
 assert.match(trustReportCsv(report),/^\uFEFF/);assert.throws(()=>inspectTrustHtml({html,url:'javascript:alert(1)'}),/INVALID_URL/);assert.throws(()=>inspectTrustHtml({html,url:'https://user:pass@example.com'}),/INVALID_URL/);
});

test('trust structural depth is bounded without recursion overflow',()=>{
 assert.throws(()=>auditEeatSignals({html:'<div>'.repeat(10000)+'x'+'</div>'.repeat(10000)}),/structure exceeds.*limits/);
});
