import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {root} from '../src/catalog.mjs';
import {version} from '../src/version.mjs';
import {toSarifReport} from '../src/sarif-export.mjs';
import {analyzeInternalLinkEquity} from '../src/link-equity.mjs';
import {openWorkspaceDb,saveCrawlSnapshot} from '../src/workspace-store.mjs';
import {auditRedirectTraces} from '../src/redirect-audit.mjs';
import {auditLlmsTxt} from '../src/llms-txt.mjs';
import {auditLlmsBudget} from '../src/llms-budget-audit.mjs';
import {auditEditorialClarity} from '../src/editorial-clarity-audit.mjs';
import {auditAnswerFirst} from '../src/answer-first-audit.mjs';

test('Sprint 96 dogfooding: WordPress tools-llms.txt and docs/articles pass offline audits',async()=>{
 const llmsPath=path.resolve(root,'../portfolio/wordpress/seo/tools-llms.txt');
 const llmsText=await readFile(llmsPath,'utf8');
 const txtRes=auditLlmsTxt({content:llmsText});
 assert.equal(txtRes.ok,true);
 const budgetRes=auditLlmsBudget({llmsTxt:llmsText});
 assert.equal(budgetRes.ok,true);

 const articlesDir=path.join(root,'docs/articles');
 const mdFiles=(await readdir(articlesDir)).filter(f=>f.endsWith('.md')).sort();
 assert.equal(mdFiles.length>=4,true);
 for(const file of mdFiles){
  const body=(await readFile(path.join(articlesDir,file),'utf8')).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'');
  const locale=file.endsWith('-ru.md')?'ru':'en';
  const clarity=auditEditorialClarity({markdown:body,locale});
  const af=auditAnswerFirst({markdown:body});
  assert.equal(clarity.ok,true,`Clarity errors in ${file}`);
  assert.equal(af.ok,true,`Answer-first errors in ${file}`);
 }
});

test('Sprint 97 stress test: 5000 nodes + 15000 edges compute PageRank and persist in SQLite under 10s',async t=>{
 const tmp=await mkdtemp(path.join(os.tmpdir(),'reproleaf-stress-5k-'));
 t.after(()=>rm(tmp,{recursive:true,force:true}));

 const totalNodes=5000;
 const pages=[];
 for(let i=0;i<totalNodes;i+=1){
  const url=`https://stress.example/p-${i}`;
  const links=[];
  if(i<totalNodes-50){
   links.push({url:`https://stress.example/p-${(i+1)%totalNodes}`});
   links.push({url:`https://stress.example/p-${(i+7)%totalNodes}`});
   links.push({url:'https://stress.example/p-0'});
  }
  pages.push({
   url,
   depth:Math.min(4,i%5),
   status:200,
   ttfbMs:120,
   wordCount:300,
   title:`Page ${i}`,
   h1:`Heading ${i}`,
   canonical:url,
   internalLinks:links
  });
 }

 const t0=performance.now();
 const equity=analyzeInternalLinkEquity({
  startUrl:'https://stress.example/p-0',
  damping:0.85,
  iterations:30,
  pages
 });
 const graphMs=performance.now()-t0;
 assert.equal(equity.nodes.length,totalNodes);
 assert.equal(graphMs<10000,true,`PageRank 5k graph took ${graphMs.toFixed(1)}ms`);
 const sumPr=equity.nodes.reduce((acc,n)=>acc+n.pageRank,0);
 assert.equal(Math.abs(sumPr-1)<0.05,true,`Expected PageRank sum ~1, got ${sumPr}`);

 const {db}=await openWorkspaceDb(tmp);
 const crawlReport={
  summary:{origin:'https://stress.example',startUrl:'https://stress.example/p-0'},
  pages
 };
 const t1=performance.now();
 const snap=saveCrawlSnapshot(db,crawlReport,equity);
 const dbMs=performance.now()-t1;
 db.close();
 assert.equal(dbMs<10000,true,`SQLite 5k snapshot insert took ${dbMs.toFixed(1)}ms`);
 assert.equal(snap.crawledPages,totalNodes);

 const hops=Array.from({length:20},(_,idx)=>({
  url:`https://stress.example/loop-${idx%5}`,
  status:302,
  location:`https://stress.example/loop-${(idx+1)%5}`
 }));
 const redirectAudit=auditRedirectTraces({traces:[{startUrl:'https://stress.example/loop-0',hops}]});
 assert.equal(redirectAudit.ok,false);
 assert.equal(redirectAudit.summary.loops>=1,true);
});

test('Sprint 99-100 release 2.0.0 alignment across manifests, SARIF, browser dist and README',async()=>{
 assert.equal(version,'2.0.0');
 const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
 const srv=JSON.parse(await readFile(path.join(root,'server.json'),'utf8'));
 const browserManifest=JSON.parse(await readFile(path.join(root,'dist/browser/manifest.json'),'utf8'));
 const readme=await readFile(path.join(root,'README.md'),'utf8');

 assert.equal(pkg.version,'2.0.0');
 assert.equal(srv.version,'2.0.0');
 assert.equal(srv.packages[0].version,'2.0.0');
 assert.equal(browserManifest.version,'2.0.0');
 assert.equal(toSarifReport({pages:[]}).runs[0].tool.driver.version,'2.0.0');
 assert.match(readme,/^## Version 2\.0\.0/m);
});
