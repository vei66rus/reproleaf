import test from 'node:test';
import assert from 'node:assert/strict';
import {auditSocialMeta} from '../src/social-audit.mjs';
import {startApi} from '../src/api.mjs';

test('auditSocialMeta passes complete OpenGraph and Twitter Card metadata',()=>{
 const html=`<!doctype html><html><head>
 <title>Reproleaf SEO Workspace</title>
 <link rel="canonical" href="https://evolkov.tech/en/tools/reproleaf">
 <meta property="og:title" content="Reproleaf SEO Workspace">
 <meta property="og:description" content="Deterministic SEO checks, rewrite guard, and MCP tools.">
 <meta property="og:type" content="website">
 <meta property="og:url" content="https://evolkov.tech/en/tools/reproleaf">
 <meta property="og:image" content="https://evolkov.tech/assets/reproleaf-card.png">
 <meta property="og:site_name" content="evolkov.tech">
 <meta name="twitter:card" content="summary_large_image">
 <meta name="twitter:site" content="@vei66rus">
 </head><body></body></html>`;
 const report=auditSocialMeta({html,url:'https://evolkov.tech/en/tools/reproleaf'});
 assert.equal(report.ok,true);
 assert.equal(report.summary.errors,0);
 assert.equal(report.summary.warnings,0);
 assert.equal(report.preview.title,'Reproleaf SEO Workspace');
 assert.equal(report.preview.card,'summary_large_image');
 assert.equal(report.preview.image,'https://evolkov.tech/assets/reproleaf-card.png');
});

test('auditSocialMeta flags relative images, invalid twitter:card, duplicates and canonical mismatch',()=>{
 const html=`<!doctype html><html><head>
 <link rel="canonical" href="https://evolkov.tech/a">
 <meta property="og:title" content="First title">
 <meta property="og:title" content="Duplicate title">
 <meta property="og:url" content="https://evolkov.tech/b">
 <meta property="og:image" content="/images/card.png">
 <meta name="twitter:card" content="banner_invalid">
 </head><body></body></html>`;
 const report=auditSocialMeta({html});
 assert.equal(report.ok,false);
 assert.ok(report.findings.some(f=>f.code==='SOCIAL_RELATIVE_IMAGE_URL'));
 assert.ok(report.findings.some(f=>f.code==='SOCIAL_INVALID_TWITTER_CARD'));
 assert.ok(report.findings.some(f=>f.code==='SOCIAL_DUPLICATE_META'));
 assert.ok(report.findings.some(f=>f.code==='SOCIAL_OG_URL_CANONICAL_MISMATCH'));
});

test('auditSocialMeta flags summary_large_image without image and serves REST + MCP',async t=>{
 const missingImg=auditSocialMeta({html:'<html><head><meta property="og:title" content="Title"><meta name="twitter:card" content="summary_large_image"></head><body></body></html>'});
 assert.equal(missingImg.ok,false);
 assert.ok(missingImg.findings.some(f=>f.code==='SOCIAL_SUMMARY_LARGE_IMAGE_NO_IMAGE'));

 const api=await startApi({port:0,aiOptions:{envPath:'missing-social.env',enabled:false,apiKey:'',model:''}});
 t.after(()=>api.close());
 const html='<html><head><meta property="og:title" content="Card"><meta property="og:image" content="https://evolkov.tech/card.png"><meta name="twitter:card" content="summary_large_image"></head><body></body></html>';
 const restRes=await fetch(`${api.url}/v1/social-audit`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({html})
 });
 assert.equal(restRes.status,200);
 const restBody=await restRes.json();
 assert.equal(restBody.ok,true);
 assert.equal(restBody.preview.card,'summary_large_image');

 const mcpRes=await fetch(`${api.url}/v1/mcp`,{
  method:'POST',
  headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
  body:JSON.stringify({
   jsonrpc:'2.0',
   id:1,
   method:'tools/call',
   params:{name:'audit_social_meta',arguments:{html}}
  })
 });
 assert.equal(mcpRes.status,200);
 const mcpBody=await mcpRes.json();
 const toolData=JSON.parse(mcpBody.result.content[0].text);
 assert.equal(toolData.ok,true);
});
