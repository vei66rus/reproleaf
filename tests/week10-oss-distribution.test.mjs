import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {root} from '../src/catalog.mjs';
import {formatPrAuditMarkdown,postOrUpdatePrComment,shouldPostPrComment} from '../integrations/github-action/pr-comment.mjs';
import {buildBadgeMarkdownSnippet,generateBadgeSvg} from '../src/badge-generator.mjs';

test('PR audit formatter builds compact delta table with escaped pipes',()=>{
 const report={
  ok:false,
  summary:{pagesAudited:12,passingPages:10,totalErrors:2,totalWarnings:5},
  pages:[
   {
    file:'docs|intro.html',
    findings:[
     {severity:'warning',code:'META_DESC_SHORT',message:'Description is short'},
     {severity:'error',code:'MISSING_CANONICAL',message:'Missing canonical | head link'}
    ]
   }
  ]
 };
 const baseline={summary:{pagesAudited:10,passingPages:10,totalErrors:0,totalWarnings:3}};
 const md=formatPrAuditMarkdown(report,{baseline,preset:'docs'});
 assert.match(md,/^### Reproleaf SEO & GEO Audit Report/);
 assert.match(md,/\| Total errors \| 2 \(\+2\) \|/);
 assert.match(md,/\| Total warnings \| 5 \(\+2\) \|/);
 assert.match(md,/docs\\\|intro\.html/);
 assert.match(md,/Missing canonical \\\| head link/);
 assert.equal(/<!--/.test(md),false);
});

test('shouldPostPrComment blocks forks, missing tokens and non-PR events',()=>{
 assert.deepEqual(shouldPostPrComment({commentPr:false,token:'tok',eventName:'pull_request',isFork:false}),{allowed:false,reason:'comment_disabled'});
 assert.deepEqual(shouldPostPrComment({commentPr:true,token:'',eventName:'pull_request',isFork:false}),{allowed:false,reason:'missing_token'});
 assert.deepEqual(shouldPostPrComment({commentPr:true,token:'tok',eventName:'push',isFork:false}),{allowed:false,reason:'unsupported_event'});
 assert.deepEqual(shouldPostPrComment({commentPr:true,token:'tok',eventName:'pull_request',isFork:true}),{allowed:false,reason:'fork_pr_blocked'});
 assert.deepEqual(shouldPostPrComment({commentPr:true,token:'tok',eventName:'pull_request',isFork:false}),{allowed:true});
});

test('postOrUpdatePrComment updates matching report comment or creates new one',async()=>{
 const calls=[];
 const existingFetch=async(url,opts)=>{
  calls.push({method:opts.method,url});
  if(opts.method==='GET'){
   return new Response(JSON.stringify([{id:42,body:'### Reproleaf SEO & GEO Audit Report\nold'}]),{status:200});
  }
  return new Response(JSON.stringify({id:42}),{status:200});
 };
 const updated=await postOrUpdatePrComment({
  token:'secret',
  repository:'vei66rus/reproleaf',
  prNumber:7,
  body:'### Reproleaf SEO & GEO Audit Report\nnew',
  fetchImpl:existingFetch
 });
 assert.equal(updated.action,'updated');
 assert.equal(calls[1].method,'PATCH');
 assert.match(calls[1].url,/\/issues\/comments\/42$/);
});

test('SVG badge generator escapes XML, validates hex color and emits matching static files',async()=>{
 const svg=generateBadgeSvg({label:'GEO & SEO',status:'100% <ok>',color:'javascript:alert(1)'});
 assert.match(svg,/^<svg /);
 assert.match(svg,/GEO &amp; SEO: 100% &lt;ok&gt;/);
 assert.match(svg,/fill="#2e8b57"/);
 const md=buildBadgeMarkdownSnippet();
 assert.match(md,/https:\/\/evolkov\.tech\/en\/tools\/geo-readiness-checker\//);

 const staticBadge=await readFile(path.join(root,'badges/geo-seo-checked.svg'),'utf8');
 assert.equal(staticBadge,generateBadgeSvg({label:'GEO & SEO',status:'checked by Reproleaf',color:'#2e8b57'}));
});

test('CI workflow examples exist for all target stacks without comments',async()=>{
 const examplesDir=path.join(root,'examples');
 const files=(await readdir(examplesDir)).filter(f=>f.endsWith('.yml'));
 assert.equal(files.length>=6,true);
 for(const file of files){
  const content=await readFile(path.join(examplesDir,file),'utf8');
  assert.match(content,/reproleaf/);
 }
});
