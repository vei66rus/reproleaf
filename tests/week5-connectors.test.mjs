import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {openWorkspaceDb} from '../src/workspace-store.mjs';
import {collectKeywordSuggestTree,parseSuggestPayload} from '../src/keyword-suggest.mjs';
import {auditWebmasterCsv} from '../src/webmaster-csv-audit.mjs';
import {auditPageSpeedWithDom} from '../src/psi-connector.mjs';
import {analyzeArchiveHistory} from '../src/history-cdx.mjs';
import {runDataForSeoByok} from '../src/dataforseo-connector.mjs';

const execFileAsync=promisify(execFile);
const cliPath=fileURLToPath(new URL('../src/cli.mjs',import.meta.url));

test('collectKeywordSuggestTree deduplicates Google/Yandex suggests and caches in SQLite',async()=>{
 const tmp=await mkdtemp(path.join(os.tmpdir(),'reproleaf-kw-'));
 let fetches=0;
 try{
  const {db}=await openWorkspaceDb(tmp);
  const fetchMock=async(url)=>{
   fetches+=1;
   const q=new URL(url).searchParams.get('q')||new URL(url).searchParams.get('part')||'';
   return new Response(JSON.stringify([q,[`${q} tool`,'llms.txt checker']]),{status:200});
  };
  const first=await collectKeywordSuggestTree({
   seed:'llms.txt',
   provider:'google',
   locale:'en',
   mode:'questions',
   allowNetwork:true,
   maxRequests:3,
   delayMs:0
  },{fetchImpl:fetchMock,waitImpl:async()=>{},db});

  assert.equal(first.summary.networkRequests,3);
  assert.equal(first.summary.cacheHits,0);
  assert.ok(first.keywords.some(k=>k.keyword==='llms.txt checker'));

  const second=await collectKeywordSuggestTree({
   seed:'llms.txt',
   provider:'google',
   locale:'en',
   mode:'questions',
   allowNetwork:true,
   maxRequests:3,
   delayMs:0
  },{fetchImpl:fetchMock,waitImpl:async()=>{},db});

  assert.equal(second.summary.cacheHits,3);
  assert.equal(fetches,3);
  assert.deepEqual(parseSuggestPayload('yandex',['q',[['пример'],['тест']]]),['пример','тест']);
  db.close();
 }finally{
  await rm(tmp,{recursive:true,force:true});
 }
});

test('auditWebmasterCsv detects quick-wins, low CTR and multi-URL cannibalization in GSC and Yandex CSV',async()=>{
 const csv=[
  'Top queries;Page;Clicks;Impressions;CTR;Position',
  '"llms.txt generator";https://evolkov.tech/tools/llms-txt-studio;8;1000;0,8%;5.2',
  '"llms.txt generator";https://evolkov.tech/tools/geo-readiness-checker;4;400;1,0%;8.4',
  '"serp preview tool";https://evolkov.tech/tools/serp-pixel-preview;2;500;0,4%;6.0'
 ].join('\n');

 const report=auditWebmasterCsv({csvText:'\uFEFF'+csv,minImpressions:50});
 assert.equal(report.ok,false);
 assert.equal(report.summary.quickWinCount,3);
 assert.equal(report.summary.lowCtrCount,3);
 assert.equal(report.summary.cannibalizationCount,1);
 assert.equal(report.cannibalizationConflicts[0].query,'llms.txt generator');

 const tmp=await mkdtemp(path.join(os.tmpdir(),'reproleaf-gsc-'));
 try{
  const file=path.join(tmp,'gsc.csv');
  await writeFile(file,csv,'utf8');
  const {stdout}=await execFileAsync(process.execPath,[cliPath,'gsc-audit','--file',file]);
  assert.equal(JSON.parse(stdout).summary.cannibalizationCount,1);
 }finally{
  await rm(tmp,{recursive:true,force:true});
 }
});

test('auditPageSpeedWithDom parses CrUX + Lighthouse, correlates DOM issues and blocks private URLs',async()=>{
 await assert.rejects(
  ()=>auditPageSpeedWithDom({url:'http://127.0.0.1:8080/',allowNetwork:true}),
  /private or reserved/i
 );

 const psiResponse={
  loadingExperience:{
   overall_category:'SLOW',
   metrics:{
    LARGEST_CONTENTFUL_PAINT_MS:{percentile:4100,category:'POOR'},
    CUMULATIVE_LAYOUT_SHIFT_SCORE:{percentile:25,category:'POOR'}
   }
  },
  lighthouseResult:{
   categories:{performance:{score:0.42}},
   audits:{
    'largest-contentful-paint':{numericValue:4300},
    'cumulative-layout-shift':{numericValue:0.25},
    'total-blocking-time':{numericValue:450}
   }
  }
 };
 const domPerfReport={
  findings:[
   {code:'DOM_IMAGE_MISSING_DIMENSIONS',message:'2 img tags lack width/height'},
   {code:'DOM_RENDER_BLOCKING_SCRIPT',message:'Blocking head script'}
  ]
 };

 const res=await auditPageSpeedWithDom({
  url:'https://evolkov.tech/',
  psiResponse,
  domPerfReport
 });
 assert.equal(res.ok,false);
 assert.equal(res.metrics.performanceScore,42);
 assert.equal(res.domCorrelations.length,2);
});

test('analyzeArchiveHistory tracks vanished sections and topic pivots from Wayback CDX rows',async()=>{
 const cdxRows=[
  ['timestamp','original','mimetype','statuscode'],
  ['20210115000000','https://oldsite.test/blog/post-1','text/html','200'],
  ['20210501000000','https://oldsite.test/shop/item-1','text/html','200'],
  ['20251010000000','https://oldsite.test/casino/slots','text/html','200']
 ];
 const hist=await analyzeArchiveHistory({domain:'oldsite.test',cdxRows},{lookupAll:async()=>[{address:'93.184.216.34',family:4}]});
 assert.equal(hist.summary.vanishedSectionCount,2);
 assert.ok(hist.findings.some(f=>f.code==='HISTORY_REMOVED_SECTIONS'));
 assert.ok(hist.findings.some(f=>f.code==='HISTORY_POSSIBLE_TOPIC_PIVOT'));
});

test('runDataForSeoByok parses volumes and SERP AI Overview while caching to SQLite and enforcing credentials',async()=>{
 await assert.rejects(
  ()=>runDataForSeoByok({action:'volumes',keywords:['seo audit'],allowNetwork:true}),
  /credentials required/i
 );

 const tmp=await mkdtemp(path.join(os.tmpdir(),'reproleaf-dfs-'));
 try{
  const {db}=await openWorkspaceDb(tmp);
  const fetchMock=async(url)=>{
   if(url.includes('search_volume')){
    return new Response(JSON.stringify({
     cost:0.01,
     tasks:[{result:[{keyword:'geo audit tool',search_volume:70,cpc:12.5,competition:'LOW'}]}]
    }),{status:200});
   }
   return new Response(JSON.stringify({
    cost:0.02,
    tasks:[{
     result:[{
      keyword:'geo audit tool',
      location_code:2840,
      language_code:'en',
      se_results_count:500000,
      item_types:['ai_overview','organic'],
      items:[
       {type:'ai_overview',rank_absolute:1},
       {type:'organic',rank_absolute:2,domain:'evolkov.tech',url:'https://evolkov.tech/en/tools/geo-readiness-checker',title:'GEO Tool'}
      ]
     }]
    }]
   }),{status:200});
  };

  const vol=await runDataForSeoByok({action:'volumes',keywords:['geo audit tool'],login:'demo',password:'secret',allowNetwork:true},{fetchImpl:fetchMock,db});
  assert.equal(vol.results[0].searchVolume,70);

  const serp=await runDataForSeoByok({action:'serp',keywords:['geo audit tool'],login:'demo',password:'secret',allowNetwork:true},{fetchImpl:fetchMock,db});
  assert.equal(serp.results[0].hasAiOverview,true);
  assert.equal(serp.results[0].top10[0].domain,'evolkov.tech');

  const cached=db.prepare('SELECT COUNT(*) AS cnt FROM byok_serp_cache').get();
  assert.equal(cached.cnt,2);
  db.close();
 }finally{
  await rm(tmp,{recursive:true,force:true});
 }
});
