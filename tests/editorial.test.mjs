import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewEditorial} from '../src/editorial.mjs';
const packet=()=>({schemaVersion:1,locale:'en',market:'US',primaryQuery:'grid cells',readerTask:'Count a two-by-two grid.',article:{title:'Count grid cells',description:'Count rows multiplied by columns.',h1Mode:'markdown',markdown:'# Count grid cells\n\nA two-by-two grid has four cells.\n\n## Calculation\n\nRead the [calculation](/guide/a(b)).'},sources:[],claims:[{id:'count',text:'A two-by-two grid has four cells.',kind:'calculation',sourceIds:[],calculation:{artifactSha256:'a'.repeat(64),assumptions:'Two rows and two columns.',reproduction:'Multiply 2 by 2.'}}],sitePaths:['/guide/a(b)'],glossary:[],reviewedSections:['Calculation']});
test('CMS-rendered H1 and balanced-parenthesis/reference links do not produce false errors',()=>{
 const p=packet();assert.equal(reviewEditorial(p).structuralPass,true);
 p.article.h1Mode='renderer';p.article.markdown=p.article.markdown.replace('# Count grid cells\n\n','');assert.equal(reviewEditorial(p).structuralPass,true);
 p.article.markdown+='\n[See it][calculation]\n\n[calculation]: /guide/a(b)';const result=reviewEditorial(p);assert.equal(result.structuralPass,true);assert.equal(result.coverage.markdownLinks,2);
});
test('unbound declared facts, unknown link targets and missing calculation evidence fail',()=>{
 const p=packet();p.claims[0].kind='fact';assert.ok(reviewEditorial(p).findings.some(f=>f.code==='unbound-fact'));
 p.claims[0].kind='calculation';delete p.claims[0].calculation;assert.ok(reviewEditorial(p).findings.some(f=>f.code==='missing-calculation-evidence'));
 p.sitePaths=[];assert.ok(reviewEditorial(p).findings.some(f=>f.code==='unknown-internal-target'));
});
test('terminology warnings use configured Unicode word boundaries and raw HTML stays explicitly unreviewed',()=>{
 const p=packet();p.glossary=[{canonical:'ячейка',prohibitedVariants:['клетка']}];p.article.markdown+='\nКлетка: термин.\n<a href="/hidden">raw</a>';const result=reviewEditorial(p);assert.ok(result.findings.some(f=>f.code==='glossary-variant'));assert.ok(result.findings.some(f=>f.code==='raw-html-not-audited'));assert.equal(result.requiresEditorialReview,true);
});
test('a pasted draft with unknown metadata stays unknown and does not acquire a fake perfect score',()=>{
 const p=packet();p.article.title='';p.article.description='';p.primaryQuery='';p.readerTask='';delete p.sitePaths;
 const r=reviewEditorial(p);assert.equal(r.structuralPass,true);assert.equal(r.observations.queryOccurrences.title,null);assert.equal(r.observations.queryOccurrences.body,null);assert.ok(r.findings.some(f=>f.code==='title-not-provided'));assert.ok(r.findings.some(f=>f.code==='internal-inventory-not-provided'));assert.equal(r.requiresEditorialReview,true);
});
test('phrase counts use visible Markdown text rather than URL strings or fenced code',()=>{
 const p=packet();p.primaryQuery='needle';p.article.markdown='# Heading\n\n[Read it](/needle)\n\n```\nneedle\n```\n\nThe needle is here.';p.sitePaths=['/needle'];const r=reviewEditorial(p);assert.equal(r.observations.queryOccurrences.body,1);
});
test('editorial findings include observation, why, snippet, suggestion and verifyHint',()=>{
 const p=packet();
 p.article.h1Mode='renderer';
 p.article.markdown='# Duplicate H1\n\n#### Skipped heading\n\nSee [missing](/absent-page) and запретное слово клетка.';
 p.glossary=[{canonical:'ячейка',prohibitedVariants:['клетка']}];
 const r=reviewEditorial(p);
 const h1Finding=r.findings.find(f=>f.code==='h1-count');
 assert.ok(h1Finding.observation);
 assert.ok(h1Finding.why);
 assert.match(h1Finding.snippet,/# Duplicate H1/);
 assert.ok(h1Finding.suggestion);
 assert.ok(h1Finding.verifyHint);
 const gapFinding=r.findings.find(f=>f.code==='heading-level-gap');
 assert.match(gapFinding.snippet,/Skipped heading/);
 const targetFinding=r.findings.find(f=>f.code==='unknown-internal-target');
 assert.match(targetFinding.snippet,/\/absent-page/);
 const glossaryFinding=r.findings.find(f=>f.code==='glossary-variant');
 assert.match(glossaryFinding.snippet,/клетка/i);
});
