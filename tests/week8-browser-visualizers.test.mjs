import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBrowser} from '../src/build-browser.mjs';
import {supportedTools,loadToolModule} from '../src/browser/tool-loader.js';

test('Week 8 browser modules register cocoon-visualizer and hreflang-sitemap inside toolLoader and build clean chunks',async()=>{
 assert.ok(supportedTools.includes('cocoon-visualizer'));
 assert.ok(supportedTools.includes('hreflang-sitemap'));

 const cocoonMod=await loadToolModule('cocoon-visualizer');
 const hrefMod=await loadToolModule('hreflang-sitemap');
 assert.equal(typeof cocoonMod.mount,'function');
 assert.equal(typeof hrefMod.mount,'function');

 const manifest=await buildBrowser();
 assert.ok(manifest.bytes[manifest.toolLoader]<4096);
 assert.ok(manifest.toolChunks.length>=supportedTools.length);
});
