import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCrawlPolicy} from '../src/crawl-policy-audit.mjs';
import {startApi} from '../src/api.mjs';

test('auditCrawlPolicy passes clean robots.txt and urlset sitemap without conflicts',()=>{
 const robotsTxt=`User-agent: *\nAllow: /tools/\nDisallow: /wp-admin/\nSitemap: https://evolkov.tech/sitemap.xml\n`;
 const sitemapXml=`<?xml version="1.0" encoding="UTF-8"?>
 <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://evolkov.tech/tools/reproleaf</loc></url>
  <url><loc>https://evolkov.tech/en/tools/reproleaf</loc></url>
 </urlset>`;
 const report=auditCrawlPolicy({siteUrl:'https://evolkov.tech',robotsTxt,sitemapXml});
 assert.equal(report.ok,true);
 assert.equal(report.summary.errors,0);
 assert.equal(report.summary.warnings,0);
 assert.equal(report.summary.uniqueSitemapUrls,2);
 assert.equal(report.summary.blockedInSitemap,0);
});

test('auditCrawlPolicy detects sitemap URLs blocked by robots, noindex, non-canonical and cross-origin',()=>{
 const robotsTxt=`User-agent: *\nDisallow: /private/\nAllow: /private/public-doc\nSitemap: /sitemap.xml\n`;
 const sitemapXml=`<?xml version="1.0" encoding="UTF-8"?>
 <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://evolkov.tech/private/secret</loc></url>
  <url><loc>https://evolkov.tech/private/public-doc</loc></url>
  <url><loc>https://evolkov.tech/draft</loc></url>
  <url><loc>https://evolkov.tech/draft</loc></url>
  <url><loc>https://other.example/page</loc></url>
 </urlset>`;
 const pages=[
  {url:'https://evolkov.tech/draft',noindex:true,canonical:'https://evolkov.tech/canonical-target'}
 ];
 const report=auditCrawlPolicy({siteUrl:'https://evolkov.tech',robotsTxt,sitemapXml,pages});
 assert.equal(report.ok,false);
 assert.equal(report.summary.blockedInSitemap,1);
 assert.equal(report.summary.duplicateSitemapUrls,1);
 assert.ok(report.findings.some(f=>f.code==='ROBOTS_RELATIVE_SITEMAP'));
 assert.ok(report.findings.some(f=>f.code==='SITEMAP_URL_BLOCKED_BY_ROBOTS'&&f.target==='https://evolkov.tech/private/secret'));
 assert.ok(!report.findings.some(f=>f.code==='SITEMAP_URL_BLOCKED_BY_ROBOTS'&&f.target==='https://evolkov.tech/private/public-doc'));
 assert.ok(report.findings.some(f=>f.code==='SITEMAP_CROSS_ORIGIN_URL'));
 assert.ok(report.findings.some(f=>f.code==='SITEMAP_DUPLICATE_URL'));
 assert.ok(report.findings.some(f=>f.code==='SITEMAP_URL_NOINDEX'));
 assert.ok(report.findings.some(f=>f.code==='SITEMAP_URL_NON_CANONICAL'));
});

test('auditCrawlPolicy exposes REST and MCP endpoints and flags sitemapindex',async t=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-crawl-policy.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const sitemapIndex=`<?xml version="1.0"?><sitemapindex><sitemap><loc>https://evolkov.tech/post-sitemap.xml</loc></sitemap></sitemapindex>`;
 const restRes=await fetch(`${api.url}/v1/crawl-policy-audit`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({sitemapXml:sitemapIndex})
 });
 assert.equal(restRes.status,200);
 const restBody=await restRes.json();
 assert.equal(restBody.summary.isSitemapIndex,true);
 assert.ok(restBody.findings.some(f=>f.code==='SITEMAP_IS_INDEX'));

 const mcpRes=await fetch(`${api.url}/v1/mcp`,{
  method:'POST',
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({
   jsonrpc:'2.0',
   id:1,
   method:'tools/call',
   params:{name:'audit_crawl_policy',arguments:{robotsTxt:'User-agent: *\nDisallow: /\n'}}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const toolData=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(toolData.ok,false);
 assert.ok(toolData.findings.some(f=>f.code==='ROBOTS_DISALLOW_ALL'));
});
