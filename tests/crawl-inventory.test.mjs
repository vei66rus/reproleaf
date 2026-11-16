import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {crawlToBlogInventory} from '../src/crawl-inventory.mjs';
import {auditBlog} from '../src/blog-graph.mjs';
import {crawlSite} from '../src/live-crawler.mjs';

const page=(patch={})=>({url:'https://example.com/a',finalUrl:'https://example.com/a',status:200,contentType:'text/html; charset=utf-8',title:'Guide',h1:['Guide heading'],canonical:'/a',robotsMeta:'',internalLinks:[{url:'https://example.com/b',anchor:'Read the next guide'}],externalLinks:[],html:'private-original-markup',xRobotsTag:'private-header',...patch});
const crawl=pages=>({summary:{origin:'https://example.com'},pages,failedUrls:[{url:'https://example.com/failed',error:'private-fetch-error'}],blockedByRobots:[]});

test('saved crawl becomes usable graph inventory without HTML, headers or failed-request records',()=>{
 const result=crawlToBlogInventory(crawl([page(),page({url:'https://example.com/b',finalUrl:'https://example.com/b',canonical:'/b',internalLinks:[]})]));
 assert.equal(result.pages.length,2);assert.equal(auditBlog(result).summary.distinctInternalEdges,1);
 assert.equal(result.pages[0].metadata.httpStatus,200);assert.equal(result.pages[0].metadata.canonical,'/a');assert.equal(result.pages[0].h1,'Guide heading');
 assert.equal(result.pages[0].kind,'other');assert.equal(result.pages[0].textScope,'unknown');
 for(const secret of ['private-original-markup','private-header','private-fetch-error','https://example.com/failed'])assert(!JSON.stringify(result).includes(secret));
 assert(result.coverage.includes('failed requests: 1'));
});
test('non-success and non-HTML responses supply status without invented HTML observations',()=>{
 for(const patch of [{status:404},{contentType:'application/json'},{status:204,contentType:'text/plain'}]){
  const [row]=crawlToBlogInventory(crawl([page(patch)])).pages;
  assert.equal(row.title,'');assert.equal(row.h1,undefined);assert.equal(row.metadata.canonical,undefined);assert.equal(row.metadata.robotsMeta,undefined);assert.deepEqual(row.links,[]);assert.equal(row.metadata.httpStatus,patch.status??200);
 }
});
test('only a single supplied H1 is mapped and absent metadata remains unknown',()=>{
 const raw=page({h1:['One','Two']});delete raw.canonical;delete raw.robotsMeta;
 const [row]=crawlToBlogInventory(crawl([raw])).pages;assert.equal(row.h1,undefined);assert.equal(row.metadata.canonical,undefined);assert.equal(row.metadata.robotsMeta,undefined);
});
test('preserves scheme, query and final response identity, rejects duplicate aliases',()=>{
 const result=crawlToBlogInventory(crawl([page({url:'https://example.com/old',finalUrl:'https://example.com/new?lang=en'})]));
 assert.equal(result.pages[0].url,'https://example.com/new?lang=en');
 assert.throws(()=>crawlToBlogInventory(crawl([page(),page({url:'https://example.com/alias'})])),/same final URL/);
 assert.throws(()=>crawlToBlogInventory(crawl([page(),page({url:'https://example.com/a/',finalUrl:'https://example.com/a/'})])),/trailing-slash normalization/);
 for(const finalUrl of ['https://evil.example/a','https://user:password@example.com/a','javascript:alert(1)','https://example.com/a#fragment',' https://example.com/a'])assert.throws(()=>crawlToBlogInventory(crawl([page({finalUrl})])));
});
test('bounded source conversion rejects malformed and oversized records',()=>{
 assert.throws(()=>crawlToBlogInventory(crawl([])));
 assert.throws(()=>crawlToBlogInventory(crawl([page({status:'200'})])));
 assert.throws(()=>crawlToBlogInventory(crawl([page({internalLinks:Array(1001).fill({url:'https://example.com/b'})})])));
 assert.throws(()=>crawlToBlogInventory(crawl([page({internalLinks:Array(600).fill({url:'https://example.com/b'}),externalLinks:Array(401).fill({url:'https://external.example/b'})})])),/1000-link/);
 assert.throws(()=>crawlToBlogInventory({...crawl([page()]),summary:{origin:'https://example.com/path'}}),/exact HTTP/);
});
test('actual CLI report --format inventory writes importable JSON without crawling',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'reproleaf-inventory-'));
 try{
  const source=join(directory,'crawl.json'),output=join(directory,'inventory.json');await writeFile(source,JSON.stringify(crawl([page()])));
  const child=spawnSync(process.execPath,['src/cli.mjs','report','--file',source,'--format','inventory','--output',output],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:15000});
  assert.equal(child.status,0,child.stderr);const result=JSON.parse(await readFile(output,'utf8'));assert.equal(result.schemaVersion,1);assert.equal(auditBlog(result).summary.pages,1);assert(!child.stdout.includes('private-original-markup'));
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('actual bounded crawler output imports into the graph using injected HTTP observations',async()=>{
 const requests=[];
 const result=await crawlSite({startUrl:'https://example.com/a',allowNetwork:true,maxPages:2,maxDepth:1,respectRobots:false,followSitemaps:false,concurrency:1,crawlDelayMs:0},{lookupAll:async()=>[{address:'93.184.216.34',family:4}],waitImpl:async()=>{},fetchImpl:async raw=>{
  const url=new URL(raw);requests.push(url.pathname);
  const body=url.pathname==='/a'?'<html><head><title>Guide</title><link rel="canonical" href="/a"></head><body><h1>Guide</h1><a href="/b">Related guide</a></body></html>':'<html><head><title>Other guide</title><meta name="robots" content="noindex"></head><body><h1>Other guide</h1></body></html>';
  return new Response(body,{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
 }});
 assert.deepEqual(requests,['/a','/b']);
 const inventory=crawlToBlogInventory(result),report=auditBlog(inventory);
 assert.equal(report.summary.pages,2);assert.equal(report.summary.distinctInternalEdges,1);
 assert.equal(inventory.pages.find(p=>p.url.endsWith('/b')).metadata.robotsMeta,'noindex');
 assert.equal(inventory.pages.find(p=>p.url.endsWith('/a')).metadata.canonical,'https://example.com/a');
});
