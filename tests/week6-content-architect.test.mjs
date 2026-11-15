import test from 'node:test';
import assert from 'node:assert/strict';
import {clusterSerpKeywords} from '../src/serp-clusterer.mjs';
import {analyzeSerpGap} from '../src/serp-gap-analyzer.mjs';
import {planCocoonAndAnchors} from '../src/cocoon-planner.mjs';
import {generateContentBrief} from '../src/content-brief-generator.mjs';
import {auditEeatSignals} from '../src/eeat-audit.mjs';
import {auditLiveCrawlHreflang,buildSegmentedSitemaps,pushIndexNow} from '../src/sitemap-indexnow.mjs';
import {startApi} from '../src/api.mjs';

test('clusterSerpKeywords groups Hard vs Soft SERP overlaps and binds existing site pages',()=>{
 const entries=[
  {query:'llms txt validator',volume:400,urls:['https://a.example/1','https://b.example/2','https://c.example/3','https://site.example/llms-txt']},
  {query:'llms txt checker',volume:200,urls:['https://a.example/1','https://b.example/2','https://c.example/3','https://d.example/4']},
  {query:'llms txt syntax guide',volume:150,urls:['https://d.example/4','https://e.example/5','https://f.example/6','https://c.example/3','https://b.example/2']},
  {query:'standalone technical audit',volume:100,urls:['https://z.example/9']}
 ];

 const soft=clusterSerpKeywords({
  entries,
  mode:'soft',
  minOverlap:3,
  existingPages:[{url:'https://site.example/llms-txt',title:'LLMs.txt Studio'}]
 });
 assert.equal(soft.summary.clusterCount,2);
 const mainSoft=soft.clusters.find(c=>c.primaryQuery==='llms txt validator');
 assert.equal(mainSoft.queryCount,3);
 assert.equal(mainSoft.action,'OPTIMIZE_EXISTING');
 assert.equal(mainSoft.matchedSitePages[0].url,'https://site.example/llms-txt');

 const hard=clusterSerpKeywords({entries,mode:'hard',minOverlap:3});
 assert.equal(hard.summary.clusterCount,3);
 const paired=hard.clusters.find(c=>c.primaryQuery==='llms txt validator');
 assert.equal(paired.queryCount,2);
});

test('analyzeSerpGap extracts competitor HTML benchmarks and flags target gaps',()=>{
 const compHtmlA=`<html><head><title>GEO Audit Guide</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage"}</script></head><body><main><h1>GEO Audit</h1><h2>Crawler Access Checks</h2><p>${'structured citation readiness crawler robots canonical '.repeat(25)}</p><h2>Comparison Table</h2><table><tr><th>Bot</th><th>Rule</th></tr></table><h2>FAQ</h2><details><summary>Why check llms.txt?</summary></details></main></body></html>`;
 const compHtmlB=`<html><head><title>AI Search Checklist</title><script type="application/ld+json">{"@type":["Article","FAQPage"]}</script></head><body><main><h1>AI Search</h1><h2>Crawler Access Checks</h2><p>${'structured citation readiness crawler robots canonical '.repeat(25)}</p><h2>Pricing Plans</h2><p>Free tier at $0/mo or Pro pricing.</p><table><tr><th>Tier</th><th>Cost</th></tr></table></main></body></html>`;
 const targetHtml=`<html><head><title>Short</title></head><body><main><h1>Intro</h1><p>Short stub page without details.</p></main></body></html>`;

 const res=analyzeSerpGap({
  target:{url:'https://mysite.example/geo',html:targetHtml},
  competitors:[
   {url:'https://c1.example/a',position:1,html:compHtmlA},
   {url:'https://c2.example/b',position:2,html:compHtmlB}
  ]
 });
 assert.ok(res.benchmarks.words.median>=120);
 assert.ok(res.benchmarks.adoption.tableRatio===1);
 assert.ok(res.findings.some(f=>f.code==='GAP_THIN_WORD_COUNT'));
 assert.ok(res.findings.some(f=>f.code==='GAP_MISSING_TABLE'));
 assert.ok(res.findings.some(f=>f.code==='GAP_MISSING_SCHEMA_TYPES'&&f.missingSchemaTypes.includes('FAQPage')));
 assert.ok(res.findings.some(f=>f.code==='GAP_MISSING_TERMS'));
});

test('planCocoonAndAnchors detects exact-anchor over-optimization and finds unlinked donor excerpts',()=>{
 const plan=planCocoonAndAnchors({
  siteUrl:'https://site.example',
  brandTerms:['Reproleaf'],
  pillar:{
   url:'https://site.example/geo-guide/',
   title:'Complete GEO Audit Guide',
   targetKeyword:'geo audit',
   draftText:'Modern docs must verify AI search citations before publishing releases.',
   existingLinks:[]
  },
  clusters:[
   {
    url:'https://site.example/geo-guide/llms-txt/',
    title:'LLMs.txt Generator',
    targetKeyword:'llms txt validator',
    kind:'cluster',
    draftText:'First verify your markdown budget.\n\nA deterministic geo audit verifies crawler access and schema grounding cleanly.',
    existingLinks:[]
   },
   {
    url:'https://site.example/geo-guide/s1/',
    title:'S1',
    targetKeyword:'rag chunking',
    kind:'supporting',
    existingLinks:[
     {href:'https://site.example/geo-guide/llms-txt/',anchor:'llms txt validator'}
    ]
   },
   {
    url:'https://site.example/geo-guide/s2/',
    title:'S2',
    targetKeyword:'rag score',
    kind:'supporting',
    existingLinks:[
     {href:'https://site.example/geo-guide/llms-txt/',anchor:'llms txt validator'}
    ]
   },
   {
    url:'https://site.example/geo-guide/s3/',
    title:'S3',
    targetKeyword:'ai bots',
    kind:'supporting',
    existingLinks:[
     {href:'https://site.example/geo-guide/llms-txt/',anchor:'llms txt validator'}
    ]
   }
  ]
 });

 assert.ok(plan.findings.some(f=>f.code==='ANCHOR_EXACT_OVER_OPTIMIZED'));
 assert.ok(plan.findings.some(f=>f.code==='PLANNER_PILLAR_MISSING_CLUSTER_LINK'));
 const donorHit=plan.linkOpportunities.find(o=>o.toUrl==='https://site.example/geo-guide/');
 assert.ok(donorHit);
 assert.ok(donorHit.donorExcerpt.includes('geo audit'));
});

test('generateContentBrief compiles markdown and JSON brief with explicit FACT_GAP placeholders and zero hallucinated stats',()=>{
 const brief=generateContentBrief({
  primaryQuery:'llms.txt validator',
  targetUrl:'https://evolkov.tech/en/tools/llms-txt-studio/',
  locale:'en',
  serpGap:{
   targetWordCount:1400,
   requiredTerms:['robots.txt','rag','markdown'],
   recommendedSchemaTypes:['SoftwareApplication','FAQPage'],
   needsTable:true,
   needsFaq:true,
   competitorHeadings:['What llms.txt validates','Token budget limits']
  },
  glossary:[{canonical:'llms.txt',aliases:['llms text'],forbidden:['ai.txt']}],
  verifiedFacts:['Token budget checked locally with deterministic UTF-8 heuristics.'],
  draftMarkdown:'## Overview\n\nIt depends on ai.txt instead of llms.txt in practice.\n'
 });
 assert.equal(brief.ok,false);
 assert.ok(brief.markdown.includes('[FACT_GAP:'));
 assert.ok(brief.markdown.includes('SoftwareApplication'));
 assert.ok(brief.brief.factGaps.length>=1);
 assert.ok(brief.draftDiagnostics.ragChunks.findings.some(f=>f.code==='RAG_PRONOUN_DEPENDENT_OPENING'));
 assert.ok(brief.draftDiagnostics.terminology.findings.some(f=>f.code==='TERMINOLOGY_FORBIDDEN_VARIANT'));
});

test('auditEeatSignals, live hreflang matrix, segmented sitemaps and IndexNow SSRF/network guard work end-to-end',async()=>{
 const strongHtml=`<html lang="en"><head><meta name="author" content="Evgenii Volkov"><script type="application/ld+json">{"@graph":[{"@type":"Person","name":"Evgenii Volkov","sameAs":["https://github.com/example"]},{"@type":"Organization","name":"Evolkov Tech"},{"@type":"TechArticle","datePublished":"2026-11-10","dateModified":"2026-11-15","author":{"@type":"Person","name":"Evgenii Volkov"}}]}</script></head><body><a rel="author" href="/about">Evgenii Volkov</a><time datetime="2026-11-15">Nov 15, 2026</time><a href="/contact">Contact</a><a href="https://llmstxt.org/">llmstxt.org spec</a></body></html>`;
 const eeat=auditEeatSignals({html:strongHtml,url:'https://evolkov.tech/en/tools/llms-txt-studio/'});
 assert.equal(eeat.ok,true);
 assert.equal(eeat.rating,'strong');

 const weakEeat=auditEeatSignals({html:'<html><body><p>Unsigned text</p></body></html>'});
 assert.equal(weakEeat.ok,false);
 assert.ok(weakEeat.findings.some(f=>f.code==='EEAT_MISSING_VISIBLE_AUTHOR'));

 const hrefRes=auditLiveCrawlHreflang({
  pages:[
   {url:'https://site.example/en/',statusCode:200,htmlLang:'en',canonical:'https://site.example/en/',alternates:[{hreflang:'en',href:'https://site.example/en/'},{hreflang:'ru',href:'https://site.example/ru/'}]},
   {url:'https://site.example/ru/',statusCode:404,htmlLang:'ru',canonical:'https://site.example/ru/',alternates:[{hreflang:'ru',href:'https://site.example/ru/'},{hreflang:'en',href:'https://site.example/en/'}]}
  ]
 });
 assert.equal(hrefRes.ok,false);
 assert.ok(hrefRes.findings.some(f=>f.code==='HREFLANG_TARGET_NON_200'));

 const sm=buildSegmentedSitemaps({
  siteUrl:'https://site.example',
  maxUrlsPerFile:2,
  urls:[
   {loc:'https://site.example/a?x=1&y=2'},
   {loc:'https://site.example/b'},
   {loc:'https://site.example/c'}
  ]
 });
 assert.equal(sm.files.length,2);
 assert.ok(sm.files[0].xml.includes('https://site.example/a?x=1&amp;y=2'));
 assert.ok(sm.indexXml.includes('sitemap-2.xml'));

 await assert.rejects(()=>pushIndexNow({
  host:'site.example',
  key:'abcd1234efgh',
  urls:['https://site.example/a'],
  allowNetwork:false
 }),/allowNetwork/);

 await assert.rejects(()=>pushIndexNow({
  host:'127.0.0.1',
  key:'abcd1234efgh',
  urls:['https://127.0.0.1/a'],
  allowNetwork:true
 },{lookupAll:async()=>[{address:'127.0.0.1',family:4}]}),/reserved|private|loopback/i);

 const pushed=await pushIndexNow({
  host:'site.example',
  key:'abcd1234efgh',
  urls:['https://site.example/a'],
  allowNetwork:true
 },{
  lookupAll:async()=>[{address:'93.184.216.34',family:4}],
  fetchImpl:async()=>({status:202})
 });
 assert.equal(pushed.ok,true);
 assert.equal(pushed.status,202);
});

test('Week 6 offline analyzers expose read-only public MCP and REST endpoints',async()=>{
 const api=await startApi({port:0,publicGatewayOnly:true});
 try{
  const mcpRes=await fetch(`${api.url}/v1/mcp`,{
   method:'POST',
   headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream','mcp-protocol-version':'2025-03-26'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})
  });
  const listed=await mcpRes.json();
  const names=listed.result.tools.map(t=>t.name);
  assert.ok(names.includes('cluster_serp_keywords'));
  assert.ok(names.includes('analyze_serp_gap'));
  assert.ok(names.includes('plan_cocoon_anchors'));
  assert.ok(names.includes('generate_content_brief'));
  assert.ok(names.includes('audit_eeat_signals'));
  assert.ok(names.includes('audit_live_crawl_hreflang'));
  assert.ok(names.includes('build_segmented_sitemaps'));
  const callRes=await fetch(`${api.url}/v1/mcp`,{
   method:'POST',
   headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream','mcp-protocol-version':'2025-03-26'},
   body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'audit_eeat_signals',arguments:{html:'<html><body><p>Minimal page</p></body></html>'}}})
  });
  const callData=await callRes.json();
  const parsed=JSON.parse(callData.result.content[0].text);
  assert.equal(parsed.rating,'weak');
 }finally{
  await api.close();
 }
});
