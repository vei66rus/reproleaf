import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditBlog,countPhrase} from '../src/blog-graph.mjs';
const inventory=()=>({schemaVersion:1,siteUrl:'https://example.org',coverage:'Synthetic stored article links only',pages:[{url:'https://example.org/a/',title:'Cache guide',h1:'Cache guide',cluster:'cache',text:'Cache invalidation patterns',links:[{href:'/b#intro',anchor:'read B'},{href:'/b/',anchor:'same target'},{href:'https://external.example/x'},{href:'/missing'}]},{url:'https://example.org/b',title:'Cache invalidation',cluster:'cache',text:'Cache invalidation patterns',links:[]},{url:'https://example.org/c',title:'Unlinked rendering guide',text:'Rendering patterns',links:[]}]});
test('counts distinct incoming sources separately from link occurrences and does not call unresolved targets broken',()=>{
 const r=auditBlog(inventory());assert.equal(r.summary.internalLinkOccurrences,3);assert.equal(r.summary.resolvedInternalLinkOccurrences,2);assert.equal(r.summary.distinctInternalEdges,1);assert.equal(r.pages[1].incomingPages,1);assert.equal(r.summary.noObservedIncoming,2);assert.equal(r.summary.unresolvedTargets,1);assert.equal(r.summary.externalDomains,1);assert.ok(!r.findings.some(f=>/broken/i.test(f.code)));assert.equal(r.pages[0].titleMatchesH1,true);assert.ok(!r.findings.some(f=>/h1|title/.test(f.code)));
 assert.equal(r.edges.length,1);
 assert.deepEqual(r.edges[0].anchors,['read B','same target']);
});
test('recommendations exclude existing links, stay within supplied pages and remain lexical candidates',()=>{
 const r=auditBlog(inventory());assert.ok(r.recommendations.some(x=>x.source==='https://example.org/b'&&x.target==='https://example.org/a'));assert.ok(!r.recommendations.some(x=>x.source==='https://example.org/a'&&x.target==='https://example.org/b'));assert.match(r.recommendations[0].reason,/Lexical/);
});
test('duplicate URLs and cross-site inventories fail rather than silently merge',()=>{
 const p=inventory();p.pages.push({...p.pages[0],url:'https://example.org/a'});assert.throws(()=>auditBlog(p),/Duplicate/);p.pages.pop();p.pages[0].url='https://another.example/a';assert.throws(()=>auditBlog(p),/origin/);
});
test('query counts honor Unicode boundaries without making a density recommendation',()=>{assert.equal(countPhrase('Кэш. КЭШ, перекэшировать','кэш'),2);assert.equal(countPhrase('paid AI aids','AI'),1);assert.equal(countPhrase('text',''),null);});
test('relative links resolve against the original document URL before graph normalization',()=>{const r=auditBlog({schemaVersion:1,siteUrl:'https://example.org',coverage:'Synthetic',pages:[{url:'https://example.org/blog/',title:'Blog',links:[{href:'child/'}]},{url:'https://example.org/blog/child/',title:'Child',links:[]}]});assert.equal(r.pages[1].incomingPages,1);assert.equal(r.summary.unresolvedTargets,0);});

test('known H1 prevents author branding in title from manufacturing a topic match',()=>{
 const data={schemaVersion:1,siteUrl:'https://example.org',coverage:'Synthetic title-branding regression',pages:[{url:'https://example.org/donor',title:'Canvas rendering',text:'Evgenii Volkov maintains this project.',links:[]},{url:'https://example.org/target',title:'Technical audit — Evgenii Volkov',h1:'Technical audit',text:'Audit notes.',links:[]}]};
 const result=auditBlog(data);assert.equal(result.recommendations.some(item=>item.source==='https://example.org/donor'&&item.target==='https://example.org/target'),false);
 data.pages[1].primaryQuery='Evgenii Volkov';assert.equal(auditBlog(data).recommendations.some(item=>item.source==='https://example.org/donor'&&item.target==='https://example.org/target'),true);
 delete data.pages[1].primaryQuery;delete data.pages[1].h1;assert.equal(auditBlog(data).recommendations.some(item=>item.source==='https://example.org/donor'&&item.target==='https://example.org/target'),true);
});
test('blog audit provides donor excerpt, suggested anchor, symmetric mutual flag, cluster hub diagnostics and unresolved target provenance',()=>{
 const r=auditBlog({
  schemaVersion:1,
  siteUrl:'https://example.org',
  coverage:'Synthetic cluster inventory',
  pages:[
   {url:'https://example.org/hub/cache/',title:'Caching Architecture Hub — Example',h1:'Caching Architecture Hub',kind:'hub',cluster:'cache',primaryQuery:'caching architecture',text:'Overview of distributed caching architecture and Redis TTL strategies.',links:[{href:'/missing-guide',anchor:'missing guide'}]},
   {url:'https://example.org/blog/redis-ttl/',title:'Redis TTL strategies',h1:'Redis TTL strategies',kind:'article',cluster:'cache',text:'First intro sentence. When designing a caching architecture, set explicit TTL bounds to prevent stale reads.',links:[]}
  ]
 });
 assert.equal(r.unresolvedTargets.length,1);
 assert.equal(r.unresolvedTargets[0].url,'https://example.org/missing-guide');
 assert.deepEqual(r.unresolvedTargets[0].referencedFrom,['https://example.org/hub/cache']);
 assert.equal(r.clusters.length,1);
 assert.equal(r.clusters[0].name,'cache');
 assert.deepEqual(r.clusters[0].hubUrls,['https://example.org/hub/cache']);
 assert.equal(r.clusters[0].missingHubLinks.includes('https://example.org/blog/redis-ttl'),true);
 const rec=r.recommendations.find(x=>x.source==='https://example.org/blog/redis-ttl'&&x.target==='https://example.org/hub/cache');
 assert.ok(rec);
 assert.equal(rec.hubConnection,'spoke-to-hub');
 assert.equal(rec.reciprocalSuggested,true);
 const reverseRec=r.recommendations.find(x=>x.source==='https://example.org/hub/cache'&&x.target==='https://example.org/blog/redis-ttl');
 assert.ok(reverseRec);
 assert.equal(reverseRec.hubConnection,'hub-to-spoke');
 assert.equal(reverseRec.reciprocalSuggested,true);
 assert.match(rec.excerpt,/designing a caching architecture/);
 assert.equal(rec.suggestedAnchor,'caching architecture');
 const incomingFinding=r.findings.find(f=>f.code==='no-observed-incoming');
 assert.ok(incomingFinding.observation);
 assert.ok(incomingFinding.why);
 assert.ok(incomingFinding.suggestion);
 assert.ok(incomingFinding.verifyHint);
});
