import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {
 evaluateTabAudit,
 buildCompetitorOrSerpExport,
 formatAiEditorPrompt,
 resolveWebPanelUrl
} from '../integrations/chrome-extension/handoff-core.mjs';
import {
 lintDocumentText,
 locateFindingLine,
 buildQuickFixSuggestions
} from '../integrations/vscode/extension.mjs';
import {analyzeSerpGap} from '../src/serp-gap-analyzer.mjs';
import {clusterSerpKeywords} from '../src/serp-clusterer.mjs';

const extRoot=fileURLToPath(new URL('../integrations/chrome-extension/',import.meta.url));

test('Chrome MV3 extension manifest enforces activeTab-only permissions, strict CSP and PNG icons',async()=>{
 const manifest=JSON.parse(await readFile(path.join(extRoot,'manifest.json'),'utf8'));
 assert.equal(manifest.manifest_version,3);
 assert.deepEqual(manifest.permissions,['activeTab','scripting']);
 assert.equal(manifest.host_permissions,undefined);
 assert.equal(manifest.background,undefined);
 assert.match(manifest.content_security_policy.extension_pages,/script-src 'self'/);
 for(const iconRel of Object.values(manifest.icons)){
  const st=await stat(path.join(extRoot,iconRel));
  assert.ok(st.size>60);
 }
});

test('Chrome extension handoff core evaluates tab audit, extracts SERP/Competitor JSON and formats Cursor/Claude prompts without URL leaks',()=>{
 const snapshot={
  url:'https://competitor.example/geo-guide/',
  title:'Very Long Competitor Guide Title Explaining AI Search Optimization Beyond Pixel Width Limits',
  description:'',
  canonical:'',
  robots:'nosnippet',
  hasViewport:false,
  headings:[{level:1,text:'GEO Guide'},{level:3,text:'Skipped H2'}],
  imagesCount:2,
  missingAltCount:1,
  missingDimensionsCount:2,
  firstImageLazy:true,
  blockingHeadScripts:1,
  jsonLdTypes:[],
  jsonLdErrors:0,
  wordCount:80,
  hasTable:true,
  hasFaq:false,
  hasPricing:false,
  topTerms:['crawler','schema','citations']
 };

 const evalEn=evaluateTabAudit(snapshot,'en');
 assert.equal(evalEn.ok,false);
 assert.ok(evalEn.findings.some(f=>f.code==='ai-visibility-blocked'));
 assert.ok(evalEn.findings.some(f=>f.code==='dom-lazy-hero-image'));

 const compExport=buildCompetitorOrSerpExport(snapshot);
 assert.equal(compExport.mode,'serp-gap-competitor');
 const gapRes=analyzeSerpGap(compExport.payload);
 assert.equal(gapRes.benchmarks.competitorCount,1);

 const serpExport=buildCompetitorOrSerpExport({
  url:'https://www.google.com/search?q=llms+txt',
  serp:{isSerp:true,engine:'google',query:'llms txt',urls:['https://a.example/1','https://b.example/2']}
 });
 assert.equal(serpExport.mode,'serp-cluster');
 const clusterRes=clusterSerpKeywords({
  entries:[...serpExport.payload.entries,{query:'llms txt guide',urls:['https://a.example/1','https://b.example/2']}],
  mode:'soft',
  minOverlap:2
 });
 assert.equal(clusterRes.summary.clusterCount,1);

 const prompt=formatAiEditorPrompt(snapshot,evalEn,'en');
 assert.ok(prompt.includes('ai-visibility-blocked'));
 const webUrl=resolveWebPanelUrl('en','geo-readiness-checker');
 assert.equal(webUrl,'https://evolkov.tech/en/tools/geo-readiness-checker/');
 assert.ok(!webUrl.includes('nosnippet'));
});

test('VS Code extension lints HTML, Markdown, llms.txt, maps finding lines and builds deterministic Quick Fixes',()=>{
 const htmlSample='<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n</head>\n<body>\n  <p>Missing H1 and head tags</p>\n</body>\n</html>';
 const htmlFindings=lintDocumentText({languageId:'html',text:htmlSample,fileName:'index.html'});
 assert.ok(htmlFindings.some(f=>f.code==='h1-count'));
 const headMissing=htmlFindings.find(f=>f.code==='EEAT_INCOMPLETE_ENTITY_SCHEMA'||f.code==='SCHEMA_MISSING_JSONLD');
 assert.ok(headMissing);

 const actions=buildQuickFixSuggestions({languageId:'html',text:htmlSample,findings:htmlFindings});
 assert.ok(actions.some(a=>a.id==='reproleaf-insert-head-meta'));
 assert.ok(actions.some(a=>a.id==='reproleaf-insert-jsonld'));
 const metaAction=actions.find(a=>a.id==='reproleaf-insert-head-meta');
 assert.equal(metaAction.line,4);

 const mdFindings=lintDocumentText({languageId:'markdown',text:'## Rules\n\nIt climbed by 35% in March.',fileName:'guide.md'});
 assert.ok(mdFindings.some(f=>f.code==='GROUNDING_UNSUPPORTED_METRIC_CLAIM'));
 assert.ok(mdFindings.some(f=>f.code==='RAG_PRONOUN_DEPENDENT_OPENING'));
 const lineIdx=locateFindingLine('line 0\n## Rules\n\nIt climbed by 35%.',{heading:'Rules'});
 assert.equal(lineIdx,1);

 const llmsFindings=lintDocumentText({languageId:'plaintext',text:'Not valid llms without H1\n[relative](/docs)',fileName:'/repo/llms.txt'});
 assert.ok(llmsFindings.some(f=>f.severity==='error'));
});
