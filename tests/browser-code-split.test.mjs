import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {buildBrowser} from '../src/build-browser.mjs';

test('buildBrowser emits a tiny code-split toolLoader and lazy tool chunks without bloating initial loader',async t=>{
 const outDir=await mkdtemp(path.join(os.tmpdir(),'reproleaf-split-'));
 t.after(()=>rm(outDir,{recursive:true,force:true}));

 const manifest=await buildBrowser(outDir);
 assert.ok(manifest.toolLoader,'expected manifest.toolLoader');
 assert.ok(Array.isArray(manifest.toolChunks)&&manifest.toolChunks.length>=5,'expected at least five split tool chunks');
 assert.ok(manifest.bytes[manifest.toolLoader]<4096,`expected toolLoader under 4 KiB, got ${manifest.bytes[manifest.toolLoader]}`);

 const loaderSource=await readFile(path.join(outDir,manifest.toolLoader),'utf8');
 assert.ok(!loaderSource.includes('OAI-SearchBot'),'toolLoader initial entry must not eagerly inline tool logic');
 assert.ok(!loaderSource.includes('SERP_TITLE_EQUALS_H1_EXACT'),'toolLoader initial entry must not eagerly inline serp-preview logic');
 assert.ok(!loaderSource.includes('oversized-core-budget'),'toolLoader initial entry must not eagerly inline llms-studio logic');
 assert.ok(!loaderSource.includes('EDITORIAL_WALL_OF_TEXT'),'toolLoader initial entry must not eagerly inline geo-clarity logic');
 assert.ok(!loaderSource.includes('COCOON_CLUSTER_MISSING_HUB'),'toolLoader initial entry must not eagerly inline cocoon-matrix logic');

 for(const chunk of manifest.toolChunks){
  const chunkSource=await readFile(path.join(outDir,chunk),'utf8');
  assert.ok(!chunkSource.includes('node:sqlite')&&!chunkSource.includes('node:fs'),`browser chunk ${chunk} must not reference Node-only APIs`);
 }

 const noticeText=await readFile(path.join(outDir,'THIRD-PARTY-DEPENDENCIES-LICENSE.txt'),'utf8');
 assert.ok(noticeText.includes('parse5'),'expected parse5 notice in browser bundle licenses');
});
