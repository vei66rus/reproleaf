import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCrawlPolicy,isBlockedByRules,parseRobotsTxt} from '../src/crawl-policy-audit.mjs';
import {auditRedirectTraces} from '../src/redirect-audit.mjs';
import {buildRobotsPolicyReview,buildRedirectTraceReview,formatPolicyTraceCsv,policyTraceExample} from '../src/browser/tools/policy-trace.js';

const a='https://example.com/a',b='https://example.com/b',trace=hops=>({traces:[{startUrl:a,hops}]}),robots='User-agent: *\nDisallow: /private/\nAllow: /private/public/\nSitemap: https://example.com/sitemap.xml';
test('Robots panel separates an observed path block from unknown index directives',()=>{
 const report=buildRobotsPolicyReview({robotsTxt:robots,pageUrl:'https://example.com/private/doc'});
 assert.equal(report.page.crawlStatus,'blocked-by-supplied-rule');assert.equal(report.page.metaRobots.noindex,null);assert.equal(report.page.xRobotsTag.noindex,null);assert.equal(report.page.indexStatus,'incomplete-observations');assert.equal(report.scope.networkUsed,false);assert.equal(report.scope.sourceRobotsIncluded,false);
});
test('Observed absent meta/header values do not establish actual indexing',()=>{
 const report=buildRobotsPolicyReview({robotsTxt:robots,pageUrl:'https://example.com/private/public/doc',metaKnown:true,headerKnown:true});
 assert.equal(report.page.crawlStatus,'no-matching-block-in-supplied-rules');assert.equal(report.page.indexStatus,'no-noindex-in-supplied-values');
 assert.match(report.scope.rules,/no live status/);
});
test('Noindex is reported only from explicitly known observations',()=>{
 const hidden=buildRobotsPolicyReview({robotsTxt:robots,metaRobots:'noindex'});assert.equal(hidden.page.metaRobots.noindex,null);
 const report=buildRobotsPolicyReview({robotsTxt:robots,metaKnown:true,metaRobots:'nofollow, noindex'});assert.equal(report.page.indexStatus,'noindex-observed');
 const none=buildRobotsPolicyReview({robotsTxt:robots,headerKnown:true,xRobotsTag:'none'});assert.equal(none.page.indexStatus,'noindex-observed');
});
test('Exact product-token groups merge and take precedence over wildcard fallback',()=>{
 const source='User-agent: *\nDisallow: /\nUser-agent: Googlebot\nAllow: /a\nUser-agent: googlebot\nDisallow: /b';
 const report=buildRobotsPolicyReview({robotsTxt:source,pageUrl:a,userAgent:'GoogleBot'});
 assert.equal(report.summary.selectedGroups,2);assert.equal(report.summary.selectedRules,2);assert.equal(report.scope.groupSelection,'exact-product-token');assert.equal(report.page.crawlStatus,'no-matching-block-in-supplied-rules');assert.equal(report.scope.globalFindingsUserAgent,'*');
 const other=buildRobotsPolicyReview({robotsTxt:source,pageUrl:a,userAgent:'OtherBot'});assert.equal(other.page.crawlStatus,'blocked-by-supplied-rule');
});
test('X-Robots-Tag agent qualifiers do not leak directives to unrelated bots',()=>{
 const x='googlebot: noindex, nofollow';
 assert.equal(buildRobotsPolicyReview({robotsTxt:robots,userAgent:'Googlebot',headerKnown:true,xRobotsTag:x}).page.indexStatus,'noindex-observed');
 assert.equal(buildRobotsPolicyReview({robotsTxt:robots,userAgent:'OtherBot',headerKnown:true,xRobotsTag:x}).page.xRobotsTag.noindex,false);
 const multiline='X-Robots-Tag: googlebot: nofollow\nX-Robots-Tag: noindex';
 assert.equal(buildRobotsPolicyReview({robotsTxt:robots,userAgent:'OtherBot',headerKnown:true,xRobotsTag:multiline}).page.indexStatus,'noindex-observed');
});
test('Robots forms reject empty/unsupported/oversized data instead of returning an empty success',()=>{
 for(const source of ['', '# comment only','something else'])assert.throws(()=>buildRobotsPolicyReview({robotsTxt:source}));
 assert.throws(()=>buildRobotsPolicyReview({robotsTxt:robots,userAgent:'Googlebot/2.1'}),/POLICY_AGENT/);
 assert.throws(()=>buildRobotsPolicyReview({robotsTxt:robots,pageUrl:'javascript:alert(1)'}),/POLICY_URL/);
 assert.throws(()=>buildRobotsPolicyReview({robotsTxt:'x'.repeat(524289)}),/POLICY_SIZE/);
 assert.throws(()=>buildRobotsPolicyReview({robotsTxt:robots,metaKnown:true,metaRobots:'x'.repeat(16385)}),/POLICY_HEADER/);
});
test('Core robots glob matching supports end anchors, encoded octets and literal special input',()=>{
 const rules=[{type:'disallow',pattern:'/*/x$'}];assert.equal(isBlockedByRules('/*a/x',rules),'/*/x$');assert.equal(isBlockedByRules('/foo/x/more',rules),null);
 assert.equal(isBlockedByRules('/a%62',[{type:'disallow',pattern:'/ab'}]),'/ab');
 assert.equal(isBlockedByRules('/a%2fb',[{type:'disallow',pattern:'/a%2Fb'}]),'/a%2Fb');
 assert.equal(isBlockedByRules('/a/b',[{type:'disallow',pattern:'/a%2Fb'}]),null);
 assert.equal(isBlockedByRules('/%D0%BF%D1%83%D1%82%D1%8C',[{type:'disallow',pattern:'/путь'}]),'/путь');
 assert.equal(isBlockedByRules('/robots.txt',[{type:'disallow',pattern:'/'}]),null);
});
test('Literal specificity and allow ties are not inflated by repeated stars',()=>{
 assert.equal(isBlockedByRules('/abc',[{type:'disallow',pattern:'/a*******'},{type:'allow',pattern:'/ab'}]),null);
 assert.equal(isBlockedByRules('/a',[{type:'disallow',pattern:'/a'},{type:'allow',pattern:'/a'}]),null);
});
test('Robots matching has an explicit work budget instead of regex backtracking',()=>{
 assert.throws(()=>isBlockedByRules('/'+'a'.repeat(300)+'c',[{type:'disallow',pattern:'/'+'*a'.repeat(100)+'b'}],{remaining:100}),/ROBOTS_MATCH_BUDGET/);
 assert.throws(()=>parseRobotsTxt('User-agent: *\nDisallow: /'+'x'.repeat(2048)),/ROBOTS_INPUT_BUDGET/);
});
test('Core crawl policy rejects executable sitemap loc and credentialed site URLs',()=>{
 const report=auditCrawlPolicy({sitemapXml:'<urlset><url><loc>javascript:alert(1)</loc></url></urlset>'});assert.equal(report.ok,false);assert(report.findings.some(f=>f.code==='SITEMAP_INVALID_URL'));
 assert.throws(()=>auditCrawlPolicy({robotsTxt:''}));assert.throws(()=>auditCrawlPolicy({siteUrl:'https://user:pass@example.com/',robotsTxt:robots}));
});
test('Redirect panel resolves only complete contiguous supplied traces, including relative Location',()=>{
 const report=buildRedirectTraceReview(JSON.stringify(trace([{url:a,status:301,location:'/b'},{url:b,status:200}])));
 assert.equal(report.ok,true);assert.equal(report.summary.terminalTraces,1);assert.equal(report.traces[0].completion,'terminal-observed');assert.equal(report.traces[0].finalUrl,b);assert.equal(report.scope.networkUsed,false);
});
test('Final redirect status is partial, not a successfully observed final page',()=>{
 const core=auditRedirectTraces(trace([{url:a,status:301,location:'/b'}]));
 assert.equal(core.ok,false);assert.equal(core.summary.incompleteTraces,1);assert.equal(core.traces[0].finalStatus,null);assert.equal(core.traces[0].lastObservedStatus,301);assert(core.findings.some(f=>f.code==='REDIRECT_TRACE_INCOMPLETE'));
});
test('Disconnected trace hops and start mismatches cannot masquerade as resolution',()=>{
 const disconnected=auditRedirectTraces(trace([{url:a,status:301,location:'/b'},{url:'https://example.com/other',status:200}]));assert.equal(disconnected.ok,false);assert.equal(disconnected.traces[0].completion,'inconsistent');assert.equal(disconnected.traces[0].finalUrl,null);
 const start=auditRedirectTraces(trace([{url:b,status:200}]));assert(start.findings.some(f=>f.code==='REDIRECT_START_MISMATCH'));
});
test('Relative and fragment redirects reveal observed cycles while unrelated repeated records are not loops',()=>{
 const loop=auditRedirectTraces(trace([{url:a,status:301,location:'/b'},{url:b,status:301,location:'/a'}]));assert.equal(loop.summary.loops,1);assert.equal(loop.traces[0].completion,'loop');
 const fragment=auditRedirectTraces(trace([{url:a,status:301,location:'#section'}]));assert.equal(fragment.summary.loops,1);
 const repeated=auditRedirectTraces(trace([{url:a,status:200},{url:a,status:200}]));assert.equal(repeated.summary.loops,0);assert.equal(repeated.traces[0].completion,'inconsistent');
});
test('A cyclic return that later escapes preserves the supplied terminal response',()=>{
 const report=auditRedirectTraces(trace([{url:a,status:301,location:'/b'},{url:b,status:301,location:'/a'},{url:a,status:302,location:'/final'},{url:'https://example.com/final',status:200}]));
 assert.equal(report.traces[0].completion,'terminal-observed');assert.equal(report.traces[0].finalStatus,200);assert.equal(report.summary.terminalTraces,1);assert.equal(report.summary.loops,0);assert(report.findings.some(f=>f.code==='REDIRECT_RETURN_VISIT'&&f.severity==='warning'));assert(!report.findings.some(f=>f.code==='REDIRECT_LOOP'));assert(report.limits.some(line=>line.includes('methods, cookies and state')));
});
test('Unsupported terminal statuses remain partial and missing/invalid Location remains visible',()=>{
 for(const status of [100,103,300,304])assert.equal(auditRedirectTraces(trace([{url:a,status}])).traces[0].completion,'partial');
 const missing=auditRedirectTraces(trace([{url:a,status:301}]));assert(missing.findings.some(f=>f.code==='REDIRECT_MISSING_LOCATION'));
 const invalid=auditRedirectTraces(trace([{url:a,status:301,location:'javascript:alert(1)'}]));assert(invalid.findings.some(f=>f.code==='REDIRECT_INVALID_LOCATION'));
});
test('Bad trace statuses, fields, JSON and oversized scope fail explicitly',()=>{
 for(const status of [0,99,600,'301',NaN])assert.throws(()=>buildRedirectTraceReview(JSON.stringify(trace([{url:a,status}]))),/TRACE_VALUES/);
 assert.throws(()=>buildRedirectTraceReview('[]'),/TRACE_SHAPE/);assert.throws(()=>buildRedirectTraceReview('bad'),/TRACE_JSON/);assert.throws(()=>buildRedirectTraceReview('x'.repeat(1048577)),/TRACE_SIZE/);
 assert.throws(()=>buildRedirectTraceReview(JSON.stringify({traces:Array.from({length:101},()=>({startUrl:a,hops:[{url:a,status:200}]}))})),/TRACE_SHAPE/);
 assert.throws(()=>buildRedirectTraceReview(JSON.stringify(trace([{url:a,status:200,unknown:'value'}]))),/TRACE_VALUES/);
});
test('Report exports omit raw inputs and strip query secrets from URL labels',()=>{
 const privateUrl=a+'?access_token=private#part',report=buildRedirectTraceReview(JSON.stringify({traces:[{startUrl:privateUrl,hops:[{url:privateUrl,status:200}]}]}));
 assert(!JSON.stringify(report).includes('access_token=private'));assert.equal(report.traces[0].startUrl,a);assert.equal(report.scope.sourceTraceIncluded,false);
 const csv=formatPolicyTraceCsv({tool:'robots-policy',page:{url:'=1+1',crawlStatus:'blocked',indexStatus:'unknown'},findings:[]});assert(csv.startsWith('\uFEFF'));assert(csv.includes('"\'=1+1"'));assert(csv.includes('\r\n'));
});
test('Synthetic examples are executable local supplied-data examples',()=>{
 assert.equal(buildRobotsPolicyReview({robotsTxt:policyTraceExample('robots-policy')}).tool,'robots-policy');assert.equal(buildRedirectTraceReview(policyTraceExample('redirect-chain')).summary.terminalTraces,1);
});
