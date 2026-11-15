import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runBatchAudit,formatBatchCsv} from '../src/batch-audit.mjs';

test('runBatchAudit scans HTML files recursively and aggregates errors and warnings',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'reproleaf-batch-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 await mkdir(path.join(dir,'blog'),{recursive:true});
 await mkdir(path.join(dir,'node_modules','ignored'),{recursive:true});

const richBody=Array.from({length:60},(_,i)=>`word${i}`).join(' ');
 await writeFile(path.join(dir,'index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Home</title><link rel="canonical" href="https://evolkov.tech/"><meta property="og:title" content="Home"><meta property="og:description" content="Desc"><meta property="og:image" content="https://evolkov.tech/og.png"><meta property="og:url" content="https://evolkov.tech/"><meta name="twitter:card" content="summary_large_image"></head><body><h1>Home</h1><p>${richBody}</p></body></html>`);
 await writeFile(path.join(dir,'blog','post.html'),'<!doctype html><html><head><title>Post</title><script type="application/ld+json">{bad json</script></head><body><p>No H1 here.</p></body></html>');
 await writeFile(path.join(dir,'node_modules','ignored','skip.html'),'<html><body>skip</body></html>');

 const report=await runBatchAudit({dir});
 assert.equal(report.summary.pagesAudited,2);
 assert.equal(report.ok,false);
 assert.equal(report.summary.failingPages,1);
 assert.ok(report.pages.some(p=>p.file==='index.html'&&p.aiWords>=60));
 assert.ok(report.pages.some(p=>p.file==='blog/post.html'&&p.errors>0));
 assert.ok(!report.pages.some(p=>p.file.includes('node_modules')));
});

test('formatBatchCsv neutralizes spreadsheet formula injection',()=>{
 const csv=formatBatchCsv({
  pages:[
   {file:'=CMD("calc")',ok:true,errors:0,warnings:1,htmlFindings:0,schemaBlocks:1,socialWarnings:1,aiWords:40}
  ]
 });
 const lines=csv.split('\n');
 assert.equal(lines.length,2);
 assert.ok(lines[1].startsWith('"\'=CMD'));
});
