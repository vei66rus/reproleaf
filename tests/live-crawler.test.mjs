import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {isPrivateOrReservedIp,assertSafePublicUrl,safeFetchPage,NetworkGuardError} from '../src/network-guard.mjs';
import {crawlSite,parseRobotsTxtForCrawler,isPathAllowedByRobots} from '../src/live-crawler.mjs';

const execFileAsync=promisify(execFile);
const cliPath=fileURLToPath(new URL('../src/cli.mjs',import.meta.url));

test('isPrivateOrReservedIp identifies IPv4, IPv6, ULA and IPv4-mapped private ranges',()=>{
 for(const ip of ['127.0.0.1','10.0.0.5','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','::1','::','fc00::1','fd12:3456::1','fe80::1','::ffff:127.0.0.1','::ffff:7f00:1']){
  assert.equal(isPrivateOrReservedIp(ip),true,`Expected private/reserved for ${ip}`);
 }
 for(const ip of ['93.184.216.34','1.1.1.1','8.8.8.8','2606:4700:4700::1111']){
  assert.equal(isPrivateOrReservedIp(ip),false,`Expected public IP for ${ip}`);
 }
});

test('assertSafePublicUrl blocks loopback, metadata endpoints, embedded creds and private DNS targets',async()=>{
 await assert.rejects(()=>assertSafePublicUrl('http://127.0.0.1:8080/'),/private or reserved/i);
 await assert.rejects(()=>assertSafePublicUrl('http://localhost/admin'),/private or reserved/i);
 await assert.rejects(()=>assertSafePublicUrl('http://[::1]/'),/private or reserved/i);
 await assert.rejects(()=>assertSafePublicUrl('http://user:pass@example.com/'),/credentials/i);
 await assert.rejects(()=>assertSafePublicUrl('ftp://example.com/'),/non-HTTP/i);
 await assert.rejects(()=>assertSafePublicUrl('https://internal.example/',{lookupAll:async()=>[{address:'10.20.0.4',family:4}]}),/resolving to private/i);
 const parsed=await assertSafePublicUrl('https://public.example/docs',{lookupAll:async()=>[{address:'93.184.216.34',family:4}]});
 assert.equal(parsed.origin,'https://public.example');
});

test('safeFetchPage blocks redirect hops pointing to loopback or metadata IPs before fetching hop 2',async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/bounce-local'){
   res.writeHead(302,{Location:'http://127.0.0.1:65530/internal'});
   res.end();
   return;
  }
  if(req.url==='/bounce-metadata'){
   res.writeHead(301,{Location:'http://169.254.169.254/latest/meta-data/'});
   res.end();
   return;
  }
  if(req.url==='/oversize'){
   res.writeHead(200,{'Content-Type':'text/html'});
   res.end('x'.repeat(4096));
   return;
  }
  res.writeHead(200,{'Content-Type':'text/html'});
  res.end('<html><body>ok</body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {port}=server.address();
 try{
  const realLocalFetch=async(targetUrl,init)=>{
   const u=new URL(targetUrl);
   return fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`,init);
  };
  const publicLookup=async host=>host==='public.example'?[{address:'93.184.216.34',family:4}]:[{address:'127.0.0.1',family:4}];

  await assert.rejects(
   ()=>safeFetchPage('https://public.example/bounce-local',{fetchImpl:realLocalFetch,lookupAll:publicLookup,requireOrigin:'https://public.example'}),
   err=>err instanceof NetworkGuardError&&(err.code==='cross_origin_blocked'||err.code==='blocked_private_ip')
  );
  await assert.rejects(
   ()=>safeFetchPage('https://public.example/bounce-metadata',{fetchImpl:realLocalFetch,lookupAll:publicLookup}),
   err=>err instanceof NetworkGuardError&&(err.code==='blocked_private_ip'||err.code==='blocked_hostname')
  );
  await assert.rejects(
   ()=>safeFetchPage('https://public.example/oversize',{fetchImpl:realLocalFetch,lookupAll:publicLookup,maxBytes:1024}),
   err=>err instanceof NetworkGuardError&&err.code==='body_too_large'
  );
 }finally{
  await new Promise(resolve=>server.close(resolve));
 }
});

test('parseRobotsTxtForCrawler and isPathAllowedByRobots apply longest match and Crawl-delay',()=>{
 const parsed=parseRobotsTxtForCrawler('User-agent: *\nDisallow: /private/\nAllow: /private/public.html\nCrawl-delay: 1.5\nSitemap: https://example.com/sitemap.xml\n');
 assert.equal(parsed.crawlDelayMs,1500);
 assert.deepEqual(parsed.sitemaps,['https://example.com/sitemap.xml']);
 assert.equal(isPathAllowedByRobots('/private/secret',parsed.rules),false);
 assert.equal(isPathAllowedByRobots('/private/public.html',parsed.rules),true);
 assert.equal(isPathAllowedByRobots('/blog/post',parsed.rules),true);
});

test('crawlSite crawls sitemaps + internal BFS links, respects robots.txt and obeys maxPages/maxDepth',async()=>{
 const routes=new Map([
  ['/robots.txt',{status:200,type:'text/plain',body:'User-agent: *\nDisallow: /admin\nCrawl-delay: 0.01\nSitemap: https://site.test/sitemap.xml\n'}],
  ['/sitemap.xml',{status:200,type:'application/xml',body:'<?xml version="1.0"?><urlset><url><loc>https://site.test/guide</loc></url><url><loc>https://site.test/admin/panel</loc></url></urlset>'}],
  ['/',{status:200,type:'text/html',body:'<html><head><title>Home</title><meta name="description" content="Home desc"></head><body><h1>Main</h1><a href="/about">About</a><a href="/admin">Admin</a><a href="https://ext.example/doc">Ext</a></body></html>'}],
  ['/about',{status:200,type:'text/html',body:'<html><head><title>About</title></head><body><h1>About Us</h1><a href="/team">Team</a></body></html>'}],
  ['/guide',{status:200,type:'text/html',body:'<html><head><title>Guide</title></head><body><h1>SEO Guide</h1></body></html>'}],
  ['/team',{status:200,type:'text/html',body:'<html><head><title>Team</title></head><body><h1>Team</h1></body></html>'}]
 ]);

 const fetchMock=async(url)=>{
  const path=new URL(url).pathname||'/';
  const entry=routes.get(path);
  if(!entry)return new Response('Not found',{status:404,headers:{'content-type':'text/html'}});
  return new Response(entry.body,{status:entry.status,headers:{'content-type':entry.type,'cache-control':'max-age=60'}});
 };
 const lookupMock=async()=>[{address:'93.184.216.34',family:4}];

 const result=await crawlSite({
  startUrl:'https://site.test/',
  allowNetwork:true,
  maxPages:10,
  maxDepth:2,
  crawlDelayMs:0
 },{fetchImpl:fetchMock,lookupAll:lookupMock,waitImpl:async()=>{}});

 assert.equal(result.ok,true);
 assert.equal(result.summary.crawledPages,4);
 assert.equal(result.summary.blockedByRobotsCount,2);
 const teamPage=result.pages.find(p=>p.url==='https://site.test/team');
 assert.ok(teamPage);
 assert.equal(teamPage.depth,2);
 const homePage=result.pages.find(p=>p.url==='https://site.test/');
 assert.equal(homePage.externalLinks.length,1);
 assert.equal(homePage.title,'Home');
});

test('CLI crawl refuses missing --allow-network and refuses private IP even with --allow-network',async()=>{
 await assert.rejects(
  ()=>execFileAsync(process.execPath,[cliPath,'crawl','https://example.com']),
  err=>/requires explicit --allow-network/i.test(err.stderr+err.message)
 );
 await assert.rejects(
  ()=>execFileAsync(process.execPath,[cliPath,'crawl','http://127.0.0.1:8080','--allow-network']),
  err=>/private or reserved/i.test(err.stderr+err.message)
 );
});
