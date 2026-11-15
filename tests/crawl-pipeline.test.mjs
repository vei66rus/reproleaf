import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {profileCrawlResult} from '../src/crawl-profiler.mjs';
import {classifyCrawlAnomalies} from '../src/crawl-anomalies.mjs';
import {renderAndDiffCrawlPages} from '../src/live-render-audit.mjs';
import {exportCrawlReport} from '../src/crawl-report.mjs';
import {crawlSite} from '../src/live-crawler.mjs';

const execFileAsync=promisify(execFile);
const cliPath=fileURLToPath(new URL('../src/cli.mjs',import.meta.url));

test('profileCrawlResult detects 4xx, redirect chains, slow TTFB, X-Robots-Tag, broken internal links and canonical loops',()=>{
 const sample={
  summary:{origin:'https://shop.test'},
  pages:[
   {
    url:'https://shop.test/',
    status:200,
    ttfbMs:1400,
    redirectChain:[],
    xRobotsTag:'',
    cacheControl:'public, max-age=300',
    strictTransportSecurity:'max-age=31536000',
    canonical:'https://shop.test/',
    internalLinks:[{url:'https://shop.test/broken',anchor:'Broken',rel:''}],
    externalLinks:[{url:'https://external.test/ref',anchor:'Ref',rel:''}]
   },
   {
    url:'https://shop.test/broken',
    status:404,
    ttfbMs:120,
    redirectChain:[{url:'https://shop.test/broken',status:302,location:'https://shop.test/broken-v2'},{url:'https://shop.test/broken-v2',status:302,location:'https://shop.test/broken-v3'}],
    xRobotsTag:'noindex',
    cacheControl:'no-store',
    strictTransportSecurity:'',
    canonical:'',
    internalLinks:[],
    externalLinks:[]
   },
   {
    url:'https://shop.test/a',
    status:200,
    ttfbMs:80,
    canonical:'https://shop.test/b',
    internalLinks:[],
    externalLinks:[]
   },
   {
    url:'https://shop.test/b',
    status:200,
    ttfbMs:90,
    canonical:'https://shop.test/a',
    internalLinks:[],
    externalLinks:[]
   }
  ],
  failedUrls:[]
 };

 const profile=profileCrawlResult(sample);
 assert.equal(profile.ok,false);
 assert.equal(profile.summary.brokenInternalLinkCount,1);
 assert.equal(profile.brokenInternalLinks[0].donors[0],'https://shop.test/');
 assert.equal(profile.summary.redirectChainCount,1);
 assert.equal(profile.summary.slowPageCount,1);
 assert.equal(profile.xRobotsNoindex.length,1);
 assert.ok(profile.findings.some(f=>f.code==='CANONICAL_LOOP'));
 assert.ok(profile.findings.some(f=>f.code==='HTTP_CLIENT_ERROR_4XX'));
 assert.ok(profile.findings.some(f=>f.code==='HTTP_REDIRECT_CHAIN'));
});

test('classifyCrawlAnomalies detects Soft-404, thin content, duplicate titles/H1 and parameter pagination bloat',()=>{
 const prose=Array.from({length:170},()=>'benchmark').join(' ');
 const crawl={
  pages:[
   {url:'https://docs.test/',status:200,title:'Docs Home',description:'Unique description one',h1:['Docs Home'],canonical:'https://docs.test/',wordCount:200},
   {url:'https://docs.test/missing',status:200,title:'404 Page Not Found',description:'Unique desc two',h1:['Not Found'],canonical:'',wordCount:25},
   {url:'https://docs.test/a',status:200,title:'Shared Title',description:'Shared Desc',h1:['Shared H1'],canonical:'',wordCount:80},
   {url:'https://docs.test/b?sort=price&page=2',status:200,title:'Shared Title',description:'Shared Desc',h1:['Shared H1'],canonical:'https://docs.test/b?sort=price&page=2',wordCount:190}
  ]
 };

 const res=classifyCrawlAnomalies(crawl);
 assert.equal(res.ok,false);
 assert.equal(res.summary.soft404Count,1);
 assert.equal(res.summary.thinContentCount,1);
 assert.equal(res.summary.duplicateTitleGroups,1);
 assert.equal(res.summary.duplicateDescriptionGroups,1);
 assert.equal(res.summary.duplicateH1Groups,1);
 assert.equal(res.summary.paramBloatCount,1);
 assert.ok(prose.length>100);
});

test('renderAndDiffCrawlPages compares raw HTTP HTML with rendered DOM using injected renderer',async()=>{
 const pages=[
  {
   url:'https://spa.test/',
   finalUrl:'https://spa.test/',
   status:200,
   html:'<html><head><title>App</title></head><body><div id="root"></div></body></html>'
  }
 ];
 const renderedHtml=`<html><head><title>App Rendered</title><meta name="description" content="Client injected desc"><link rel="canonical" href="https://spa.test/"></head><body><h1>Hydrated Hero</h1><p>${Array.from({length:170},()=>'rendered').join(' ')}</p><a href="/pricing">Pricing</a><a href="/docs">Docs</a><a href="/blog">Blog</a><a href="/about">About</a><a href="/faq">FAQ</a></body></html>`;

 const diff=await renderAndDiffCrawlPages(pages,{
  renderer:{render:async()=>renderedHtml}
 });
 assert.equal(diff.summary.renderedCount,1);
 assert.equal(diff.ok,false);
 assert.ok(diff.pages[0].summary.wordRatio<0.1);
 assert.ok(diff.findings.some(f=>f.code==='HYDRATION_CSR_SHELL_EMPTY'));
 assert.ok(diff.findings.some(f=>f.code==='HYDRATION_LINKS_CLIENT_ONLY'));
});

test('exportCrawlReport produces offline HTML, formula-safe CSV, JSONL, SARIF 2.1.0 and works via CLI report',async()=>{
 const longBody=Array.from({length:180},(_,i)=>`token${i}`).join(' ');
 const routes=new Map([
  ['/robots.txt',{status:200,type:'text/plain',body:'User-agent: *\nAllow: /\n'}],
  ['/sitemap.xml',{status:404,type:'text/plain',body:''}],
  ['/',{status:200,type:'text/html',body:`<html><head><title>=cmd|' /C calc'!A0</title><meta name="description" content="Home description"></head><body><h1>Main &lt;script&gt;Heading</h1><p>${longBody}</p><a href="/ok">OK</a></body></html>`}],
  ['/ok',{status:200,type:'text/html',body:`<html><head><title>Second Page</title><meta name="description" content="Second description"></head><body><h1>Second</h1><p>${longBody}</p></body></html>`}]
 ]);

 const crawlResult=await crawlSite({
  startUrl:'https://report.test/',
  allowNetwork:true,
  crawlDelayMs:0
 },{
  fetchImpl:async url=>{
   const p=new URL(url).pathname||'/';
   const entry=routes.get(p);
   if(!entry)return new Response('Missing',{status:404,headers:{'content-type':'text/html'}});
   return new Response(entry.body,{status:entry.status,headers:{'content-type':entry.type}});
  },
  lookupAll:async()=>[{address:'93.184.216.34',family:4}],
  waitImpl:async()=>{}
 });

 const htmlOut=exportCrawlReport(crawlResult,{format:'html'});
 assert.match(htmlOut.body,/<!doctype html>/i);
 assert.match(htmlOut.body,/&lt;script&gt;Heading/);
 assert.doesNotMatch(htmlOut.body,/https:\/\/cdn\./i);

 const xssHtml=exportCrawlReport({summary:{origin:'https://report.test'},pages:[{url:'javascript:alert(1)',status:200,depth:0,ttfbMs:10,wordCount:50,title:'t',h1:[]}]});
 assert.doesNotMatch(xssHtml.body,/href="javascript:/i);

 const csvOut=exportCrawlReport(crawlResult,{format:'csv'});
 assert.match(csvOut.body,/"'=cmd\|/);

 const jsonlOut=exportCrawlReport(crawlResult,{format:'jsonl'});
 const lines=jsonlOut.body.trim().split('\n').map(l=>JSON.parse(l));
 assert.equal(lines[0].type,'summary');
 assert.ok(lines.some(l=>l.type==='page'));

 const sarifOut=exportCrawlReport(crawlResult,{format:'sarif'});
 assert.equal(sarifOut.report.version,'2.1.0');
 assert.equal(sarifOut.report.runs[0].tool.driver.name,'Reproleaf');

 const tmp=await mkdtemp(path.join(os.tmpdir(),'reproleaf-report-'));
 try{
  const crawlFile=path.join(tmp,'crawl.json');
  const htmlFile=path.join(tmp,'out.html');
  await writeFile(crawlFile,JSON.stringify(crawlResult),'utf8');
  await execFileAsync(process.execPath,[cliPath,'report','--file',crawlFile,'--format','html','--output',htmlFile]);
 }finally{
  await rm(tmp,{recursive:true,force:true});
 }
});
