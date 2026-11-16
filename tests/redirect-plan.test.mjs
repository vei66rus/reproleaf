import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateRedirectPlan} from '../src/redirect-audit.mjs';
import {buildRedirectPlanReview,policyTraceExample} from '../src/browser/tools/policy-trace.js';

const origin='https://example.com';
const chain=(start='/old',middle='/guide',final='/final')=>({startUrl:origin+start,hops:[{url:origin+start,status:301,location:middle},{url:origin+middle,status:308,location:final},{url:origin+final,status:200}]});
const plan=(trace=chain(),options={format:'nginx',status:308})=>generateRedirectPlan({traces:[trace]},options);

test('a supplied consistent permanent chain produces only the exact start-to-final draft',()=>{
 const r=plan();assert.equal(r.state,'ready');assert.equal(r.summary.generatedRules,1);assert.equal(r.rules[0].sourcePath,'/old');assert.equal(r.rules[0].targetUrl,origin+'/final');assert.equal(r.status,308);
 assert.match(r.text,/if \(\$request_uri = "\/old"\)/);assert.match(r.text,/return 308 https:\/\/example.com\/final;/);assert.doesNotMatch(r.text,/\/guide/);
 assert.equal(r.scope.applied,false);assert.equal(r.scope.networkUsed,false);assert.match(r.scope.queryPolicy,/query-free/);assert.match(r.scope.methodSemantics,/retains/);
});
test('Apache root context uses anchored escaped paths and original query-free request guards',()=>{
 const r=plan(chain('/old.html','/guide','/final'),{format:'apache-root',status:301});
 assert.match(r.text,/RewriteEngine On/);assert.match(r.text,/RewriteCond %\{QUERY_STRING\} \^\$/);assert.match(r.text,/THE_REQUEST/);assert.match(r.text,/\^old\\\.html\$/);assert.match(r.text,/\[R=301,END,NE\]/);assert.match(r.scope.methodSemantics,/POST to GET/);assert.match(r.context,/Root \.htaccess/);
});
test('redirect status has no implicit selection and only301/308 are accepted',()=>{
 for(const status of [undefined,0,302,303,307,'308'])assert.throws(()=>plan(chain(),{format:'nginx',status}),/REDIRECT_PLAN_STATUS/);
 for(const format of [undefined,'nextjs','shell','nginx;evil'])assert.throws(()=>plan(chain(),{format,status:308}),/REDIRECT_PLAN_FORMAT/);
});
const blocked=[
 ['temporary',trace=>{trace.hops[1].status=302;}],
 ['incomplete',trace=>{trace.hops.pop();}],
 ['failed-final',trace=>{trace.hops[2].status=503;}],
 ['missing-location',trace=>{delete trace.hops[0].location;}],
 ['disconnected',trace=>{trace.hops[1].url=origin+'/other';}],
 ['wrong-start',trace=>{trace.startUrl=origin+'/different';}],
 ['query',trace=>{trace.startUrl=origin+'/old?token=SECRET';trace.hops[0].url=trace.startUrl;}],
 ['empty-query',trace=>{trace.startUrl=origin+'/old?';trace.hops[0].url=trace.startUrl;}],
 ['fragment',trace=>{trace.hops[1].location='/final#private';}],
 ['credentials',trace=>{trace.startUrl='https://name:SECRET@example.com/old';trace.hops[0].url=trace.startUrl;}],
 ['credential-location',trace=>{trace.hops[0].location='https://name:SECRET@example.com/guide';}],
 ['cross-origin',trace=>{trace.hops[1].location='https://other.example.com/final';trace.hops[2].url=trace.hops[1].location;}],
 ['percent-path',trace=>{trace.startUrl=origin+'/%6fld';trace.hops[0].url=trace.startUrl;}],
 ['encoded-dot-location',trace=>{trace.hops[0].location='/%2e/guide';}],
 ['dot-segment',trace=>{trace.startUrl=origin+'/a/../old';trace.hops[0].url=trace.startUrl;}],
 ['relative-dot-location',trace=>{trace.hops[0].location='../guide';}],
 ['double-slash',trace=>{trace.startUrl=origin+'//old';trace.hops[0].url=trace.startUrl;}],
 ['whitespace',trace=>{trace.hops[1].location='/final\nSECRET';}],
 ['quote-injection',trace=>{trace.startUrl=origin+'/old";SECRET';trace.hops[0].url=trace.startUrl;}],
 ['variable-injection',trace=>{trace.startUrl=origin+'/$host';trace.hops[0].url=trace.startUrl;}],
 ['regex-metacharacter',trace=>{trace.startUrl=origin+'/old(.*)';trace.hops[0].url=trace.startUrl;}],
 ['terminal-location',trace=>{trace.hops[2].location='/other';}],
 ['return-visit',trace=>{trace.hops[1].location='/old';trace.hops[2].url=origin+'/old';}],
 ['single-redirect',trace=>{trace.hops.splice(1,1);trace.hops[0].location='/final';}],
];
for(const [name,mutate] of blocked)test(`unsafe or unconfirmed observations yield no template: ${name}`,()=>{
 const trace=chain();mutate(trace);const r=plan(trace);assert.equal(r.state,'blocked');assert.equal(r.text,'');assert.equal(r.rules.length,0);assert.equal(r.entries[0].status,'blocked');assert.ok(r.entries[0].reason);
 assert.deepEqual(Object.keys(r.entries[0]).sort(),['reason','status','traceIndex']);assert.doesNotMatch(JSON.stringify(r),/SECRET|name:/);
});
test('contradictory observations block every affected candidate and cannot create a new loop',()=>{
 const second={startUrl:origin+'/final',hops:[{url:origin+'/final',status:301,location:'/other'},{url:origin+'/other',status:308,location:'/old'},{url:origin+'/old',status:200}]};
 const r=generateRedirectPlan({traces:[chain(),second]},{format:'nginx',status:308});assert.equal(r.rules.length,0);assert.ok(r.entries.every(e=>e.reason==='conflicting-observations'));
});
test('an invalid Location observation cannot be ignored when detecting cross-trace contradictions',()=>{
 const unsafe=chain();unsafe.hops[0].location='https://name:SECRET@example.com/guide';
 const r=generateRedirectPlan({traces:[chain(),unsafe]},{format:'nginx',status:308});assert.equal(r.rules.length,0);assert.equal(r.entries[0].reason,'conflicting-observations');assert.doesNotMatch(JSON.stringify(r),/SECRET/);
});
test('equivalent relative and absolute Locations deduplicate exact rules',()=>{
 const absolute=chain();absolute.hops[0].location=origin+'/guide';absolute.hops[1].location=origin+'/final';
 const r=generateRedirectPlan({traces:[chain(),absolute]},{format:'nginx',status:301});assert.equal(r.rules.length,1);assert.equal(r.summary.duplicateTraces,1);assert.equal(r.entries[1].status,'duplicate');
});
test('independent origins cannot be merged into one deployment context',()=>{
 const other=JSON.parse(JSON.stringify(chain()).replaceAll(origin,'https://other.example.org'));
 const r=generateRedirectPlan({traces:[chain(),other]},{format:'apache-root',status:308});assert.equal(r.rules.length,0);assert.ok(r.entries.every(e=>e.reason==='multiple-origins'));
});
test('a partial plan exposes blocked traces separately without exporting their raw URLs',()=>{
 const query=chain();query.startUrl=origin+'/old?token=SECRET';query.hops[0].url=query.startUrl;
 const r=generateRedirectPlan({traces:[chain(),query]},{format:'nginx',status:308});assert.equal(r.state,'partial');assert.equal(r.ok,false);assert.equal(r.rules.length,1);assert.equal(r.summary.blockedTraces,1);assert.doesNotMatch(JSON.stringify(r),/SECRET/);
});
test('root paths, ASCII case and exact suffixes remain distinct',()=>{
 const r=plan(chain('/','/middle','/Final.html'),{format:'apache-root',status:308});assert.match(r.text,/RewriteRule "\^\$"/);assert.ok(r.text.includes('/Final.html'));assert.doesNotMatch(r.text,/\(\.\*\)/);
});
test('panel parser shares input budgets and the example supports a useful draft',()=>{
 const r=buildRedirectPlanReview(policyTraceExample('redirect-chain'),{format:'nginx',status:308});assert.equal(r.summary.generatedRules,1);
 assert.throws(()=>buildRedirectPlanReview('{',{format:'nginx',status:308}),/TRACE_JSON/);assert.throws(()=>buildRedirectPlanReview('x'.repeat(1048577),{format:'nginx',status:308}),/TRACE_SIZE/);
 const input={traces:Array.from({length:101},()=>chain())};assert.throws(()=>generateRedirectPlan(input,{format:'nginx',status:308}));
});
