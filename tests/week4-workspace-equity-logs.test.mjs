import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {openWorkspaceDb,saveCrawlSnapshot,listSnapshots,getSnapshot,updateFindingStatus} from '../src/workspace-store.mjs';
import {analyzeInternalLinkEquity} from '../src/link-equity.mjs';
import {diffCrawlSnapshots,watchSiteTemplates} from '../src/crawl-diff.mjs';
import {analyzeAccessLogs} from '../src/access-log-analyzer.mjs';

const execFileAsync=promisify(execFile);
const cliPath=fileURLToPath(new URL('../src/cli.mjs',import.meta.url));

test('analyzeInternalLinkEquity computes PageRank, CheiRank, Click Depth, orphans and dead ends',()=>{
 const pages=[
  {url:'https://ex.test/',depth:0,status:200,internalLinks:[{url:'https://ex.test/hub'},{url:'https://ex.test/dead'}]},
  {url:'https://ex.test/hub',depth:1,status:200,internalLinks:[{url:'https://ex.test/'},{url:'https://ex.test/leaf'}]},
  {url:'https://ex.test/leaf',depth:2,status:200,internalLinks:[{url:'https://ex.test/'}]},
  {url:'https://ex.test/dead',depth:1,status:200,internalLinks:[]},
  {url:'https://ex.test/orphan',depth:3,status:200,internalLinks:[]}
 ];

 const eq=analyzeInternalLinkEquity({startUrl:'https://ex.test/',pages});
 assert.equal(eq.ok,false);
 assert.equal(eq.summary.totalNodes,5);
 assert.equal(eq.summary.reachableCount,4);
 assert.equal(eq.summary.orphanCount,1);
 assert.equal(eq.orphanPages[0].url,'https://ex.test/orphan');
 assert.equal(eq.orphanPages[0].clickDepth,null);
 assert.equal(eq.deadEndPages.length,2);

 const rankSum=eq.nodes.reduce((s,n)=>s+n.pageRank,0);
 assert.ok(Math.abs(rankSum-1)<0.02,`Expected PageRank sum ~ 1.0, got ${rankSum}`);
 const homeNode=eq.nodes.find(n=>n.url==='https://ex.test/');
 const leafNode=eq.nodes.find(n=>n.url==='https://ex.test/leaf');
 assert.ok(homeNode.pageRank>leafNode.pageRank);
});

test('workspace sqlite store saves snapshots, persists nodes/edges/findings and diffs regressions',async()=>{
 const tmp=await mkdtemp(path.join(os.tmpdir(),'reproleaf-ws-'));
 try{
  const {db,dbPath}=await openWorkspaceDb(tmp);
  assert.ok(dbPath.endsWith('workspace.sqlite'));

  const baseCrawl={
   summary:{origin:'https://ws.test',startUrl:'https://ws.test/'},
   pages:[
    {url:'https://ws.test/',finalUrl:'https://ws.test/',depth:0,status:200,ttfbMs:50,wordCount:300,title:'Home',h1:['Home'],canonical:'https://ws.test/',internalLinks:[{url:'https://ws.test/a',anchor:'A',rel:''}],externalLinks:[]},
    {url:'https://ws.test/a',finalUrl:'https://ws.test/a',depth:1,status:200,ttfbMs:40,wordCount:250,title:'Page A',h1:['Page A'],canonical:'https://ws.test/a',internalLinks:[],externalLinks:[]}
   ],
   profile:{findings:[{code:'HTTP_CACHE_CONTROL',severity:'info',url:'https://ws.test/',message:'No cache-control'}]},
   anomalies:{findings:[]}
  };
  const eq1=analyzeInternalLinkEquity({startUrl:'https://ws.test/',pages:baseCrawl.pages});
  const saved1=saveCrawlSnapshot(db,baseCrawl,eq1,{createdAt:'2026-11-15T10:00:00Z'});
  assert.equal(saved1.snapshotId,1);

  const nextCrawl={
   summary:{origin:'https://ws.test',startUrl:'https://ws.test/'},
   pages:[
    {url:'https://ws.test/',finalUrl:'https://ws.test/',depth:0,status:200,ttfbMs:55,wordCount:300,title:'Home',h1:['Home'],canonical:'https://ws.test/',internalLinks:[{url:'https://ws.test/a',anchor:'A',rel:''}],externalLinks:[]},
    {url:'https://ws.test/a',finalUrl:'https://ws.test/a',depth:1,status:404,ttfbMs:30,wordCount:20,title:'Not Found',h1:['404'],canonical:'',internalLinks:[],externalLinks:[]},
    {url:'https://ws.test/new',finalUrl:'https://ws.test/new',depth:1,status:200,ttfbMs:45,wordCount:220,title:'New Page',h1:['New'],canonical:'https://ws.test/new',internalLinks:[],externalLinks:[]}
   ],
   profile:{findings:[{code:'HTTP_CLIENT_ERROR_4XX',severity:'error',url:'https://ws.test/a',message:'HTTP 404'}]},
   anomalies:{findings:[]}
  };
  const saved2=saveCrawlSnapshot(db,nextCrawl,null,{createdAt:'2026-11-15T11:00:00Z'});
  assert.equal(saved2.snapshotId,2);

  const list=listSnapshots(db);
  assert.equal(list.length,2);
  const snap1=getSnapshot(db,1);
  const snap2=getSnapshot(db,2);
  assert.equal(snap1.pages.length,2);
  assert.equal(snap1.edges.length,1);

  const diff=diffCrawlSnapshots(snap1,snap2);
  assert.equal(diff.ok,false);
  assert.equal(diff.summary.addedUrlCount,1);
  assert.equal(diff.summary.statusRegressionCount,1);
  assert.equal(diff.summary.resolvedFindingCount,0);
  assert.equal(diff.summary.unconfirmedFindingCount,1);
  assert.equal(diff.summary.newFindingCount,1);

  const upd=updateFindingStatus(db,snap2.findings[0].id,'fixed');
  assert.equal(upd.updated,true);
  db.close();

  const listCli=await execFileAsync(process.execPath,[cliPath,'workspace','list','--dir',tmp]);
  assert.equal(JSON.parse(listCli.stdout).snapshots.length,2);

  const diffCli=await execFileAsync(process.execPath,[cliPath,'crawl-diff','--before','1','--after','2','--dir',tmp],{env:process.env}).catch(err=>err);
  const diffOut=JSON.parse(diffCli.stdout);
  assert.equal(diffOut.summary.statusRegressionCount,1);
 }finally{
  await rm(tmp,{recursive:true,force:true});
 }
});

test('watchSiteTemplates detects noindex, robots Disallow and non-200 template regressions',async()=>{
 const fetchMock=async(url)=>{
  const u=new URL(url);
  if(u.pathname==='/robots.txt')return new Response('User-agent: *\nDisallow: /checkout\nAllow: /\n',{status:200,headers:{'content-type':'text/plain'}});
  if(u.pathname==='/')return new Response('<html><head><link rel="canonical" href="https://watch.test/"></head><body><h1>Hero</h1></body></html>',{status:200,headers:{'content-type':'text/html'}});
  if(u.pathname==='/pricing')return new Response('<html><head><meta name="robots" content="noindex"></head><body><h1>Pricing</h1></body></html>',{status:200,headers:{'content-type':'text/html','x-robots-tag':'noindex'}});
  return new Response('Gone',{status:404,headers:{'content-type':'text/html'}});
 };
 const lookupMock=async()=>[{address:'93.184.216.34',family:4}];

 const res=await watchSiteTemplates({
  origin:'https://watch.test',
  allowNetwork:true,
  routes:['/','/pricing','/missing']
 },{fetchImpl:fetchMock,lookupAll:lookupMock});

 assert.equal(res.ok,false);
 assert.ok(res.findings.some(f=>f.code==='WATCH_UNEXPECTED_NOINDEX'));
 assert.ok(res.findings.some(f=>f.code==='WATCH_NON_200_STATUS'));
});

test('analyzeAccessLogs parses Nginx combined and Cloudflare JSONL, measures waste and invisible pages',async()=>{
 const combinedLog=[
  '66.249.66.1 - - [15/Nov/2026:12:00:00 +0000] "GET /tools/reproleaf HTTP/1.1" 200 4500 "-" "Mozilla/5.0 (compatible; Googlebot/2.1)"',
  '66.249.66.2 - - [15/Nov/2026:12:00:05 +0000] "GET /search?sort=price HTTP/1.1" 404 512 "-" "Mozilla/5.0 (compatible; Googlebot/2.1)"',
  '20.10.0.1 - - [15/Nov/2026:12:01:00 +0000] "GET /tools/llms-txt-studio HTTP/1.1" 200 3200 "-" "OAI-SearchBot/1.0"',
  '5.255.250.1 - - [15/Nov/2026:12:02:00 +0000] "GET /old-url HTTP/1.1" 301 128 "-" "Mozilla/5.0 (compatible; YandexBot/3.0)"',
  '198.51.100.9 - - [15/Nov/2026:12:03:00 +0000] "GET /tools/reproleaf HTTP/1.1" 200 4500 "-" "Mozilla/5.0 HumanBrowser"'
 ].join('\n');

 const res=analyzeAccessLogs({
  rawLog:combinedLog,
  crawledUrls:['https://evolkov.tech/tools/reproleaf','https://evolkov.tech/tools/llms-txt-studio','https://evolkov.tech/tools/serp-pixel-preview']
 });
 assert.equal(res.summary.totalHits,5);
 assert.equal(res.summary.botHits,4);
 assert.equal(res.summary.wastedHits,2);
 assert.equal(res.summary.wasteOn4xx,1);
 assert.equal(res.summary.wasteOn3xx,1);
 assert.equal(res.hitsByBot.Googlebot,2);
 assert.equal(res.hitsByBot['OAI-SearchBot'],1);
 assert.equal(res.hitsByBot.YandexBot,1);
 assert.deepEqual(res.invisiblePages,['https://evolkov.tech/tools/serp-pixel-preview']);

 const cfLog='{"ClientRequestURI":"/en/tools/reproleaf","EdgeResponseStatus":200,"ClientRequestUserAgent":"PerplexityBot/1.0"}\n{"ClientRequestURI":"/broken","EdgeResponseStatus":500,"ClientRequestUserAgent":"GPTBot/1.0"}\n';
 const cfRes=analyzeAccessLogs({rawLog:cfLog,format:'cloudflare-jsonl'});
 assert.equal(cfRes.ok,false);
 assert.equal(cfRes.summary.wasteOn5xx,1);
 assert.equal(cfRes.hitsByBot.PerplexityBot,1);

 const tmp=await mkdtemp(path.join(os.tmpdir(),'reproleaf-logs-'));
 try{
  const logFile=path.join(tmp,'access.log');
  await writeFile(logFile,combinedLog,'utf8');
  const {stdout}=await execFileAsync(process.execPath,[cliPath,'logs','--file',logFile]);
  assert.equal(JSON.parse(stdout).summary.botHits,4);
 }finally{
  await rm(tmp,{recursive:true,force:true});
 }
});
