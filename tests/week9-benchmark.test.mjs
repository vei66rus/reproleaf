import test from 'node:test';
import assert from 'node:assert/strict';
import {runEthicalBenchmark} from '../src/benchmark-runner.mjs';
import {supportedTools,loadToolModule} from '../src/browser/tool-loader.js';
import {filterBenchmarkRows,formatBenchmarkCsv} from '../src/browser/tools/benchmark-leaderboard.js';

test('runEthicalBenchmark rejects execution without allowNetwork',async()=>{
 await assert.rejects(
  ()=>runEthicalBenchmark({origins:['https://example.com'],allowNetwork:false}),
  /allowNetwork/i
 );
});

test('runEthicalBenchmark blocks private SSRF origins and respects robots.txt Disallow',async()=>{
 const fetchedUrls=[];
 const fetchImpl=async(url)=>{
  fetchedUrls.push(String(url));
  if(String(url)==='https://blocked.example/robots.txt'){
   return new Response('User-agent: *\nDisallow: /\n',{status:200,headers:{'content-type':'text/plain'}});
  }
  if(String(url)==='https://ready.example/robots.txt'){
   return new Response('User-agent: OAI-SearchBot\nAllow: /\nUser-agent: GPTBot\nDisallow: /\n',{status:200,headers:{'content-type':'text/plain'}});
  }
  if(String(url)==='https://ready.example/'){
   const body='<!doctype html><html><head><title>Ready Docs</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Ready"}</script></head><body><main><h1>Ready Docs</h1><p>'+Array(90).fill('documentation').join(' ')+'</p></main></body></html>';
   return new Response(body,{status:200,headers:{'content-type':'text/html'}});
  }
  if(String(url)==='https://ready.example/llms.txt'){
   return new Response('# Ready Docs\n\n> Concise documentation entry point.\n\n## Core\n- [Guide](https://ready.example/guide): Core guide\n',{status:200,headers:{'content-type':'text/plain'}});
  }
  if(String(url)==='https://soft404.example/robots.txt'){
   return new Response('<!doctype html><html><body>Not found</body></html>',{status:404,headers:{'content-type':'text/html'}});
  }
  if(String(url)==='https://soft404.example/'){
   return new Response('<!doctype html><html><body><h1>Minimal</h1></body></html>',{status:200,headers:{'content-type':'text/html'}});
  }
  if(String(url)==='https://soft404.example/llms.txt'){
   return new Response('<!doctype html><html><body>SPA Fallback</body></html>',{status:200,headers:{'content-type':'text/html'}});
  }
  throw Error(`Unexpected URL ${url}`);
 };

 const report=await runEthicalBenchmark(
  {
   origins:[
    'https://127.0.0.1',
    'https://blocked.example',
    'https://ready.example',
    'https://soft404.example'
   ],
   allowNetwork:true,
   minDelayMsPerDomain:0,
   concurrency:2
  },
  {
   fetchImpl,
   lookupAll:async(hostname)=>{
    if(hostname==='127.0.0.1')return [{address:'127.0.0.1',family:4}];
    return [{address:'93.184.216.34',family:4}];
   }
  }
 );

 assert.equal(report.ok,true);
 assert.match(report.sha256,/^[0-9a-f]{64}$/);
 assert.equal(report.summary.totalOrigins,4);
 assert.equal(report.summary.reachableCount,2);
 assert.equal(report.summary.skippedByRobotsCount,1);
 assert.equal(report.summary.validLlmsTxtCount,1);
 assert.equal(report.summary.jsonLdAdoptedCount,1);
 assert.equal(report.summary.oaiSearchAllowedCount,2);
 assert.equal(report.summary.gptBotBlockedCount,1);

 const ssrfRow=report.results.find(r=>r.origin==='https://127.0.0.1');
 assert.equal(ssrfRow.status,'rejected_or_error');

 const blockedRow=report.results.find(r=>r.origin==='https://blocked.example');
 assert.equal(blockedRow.status,'skipped_by_robots');
 assert.equal(fetchedUrls.includes('https://blocked.example/'),false);

 const readyRow=report.results.find(r=>r.origin==='https://ready.example');
 assert.equal(readyRow.status,'ok');
 assert.equal(readyRow.llmsTxtValid,true);
 assert.equal(readyRow.score,100);
 assert.deepEqual(readyRow.jsonLdTypes,['WebSite']);

 const softRow=report.results.find(r=>r.origin==='https://soft404.example');
 assert.equal(softRow.llmsTxtValid,false);
});

test('benchmark-leaderboard browser module registers and filters verified dataset rows',async()=>{
 assert.equal(supportedTools.includes('benchmark-leaderboard'),true);
 const mod=await loadToolModule('benchmark-leaderboard');
 assert.equal(typeof mod.mount,'function');

 const sample=[
  {origin:'https://nextjs.org',status:'ok',score:100,llmsTxtValid:true,llmsTxtStatus:200,jsonLdTypes:['WebSite'],wordCount:653,aiBots:{'OAI-SearchBot':'allowed','PerplexityBot':'allowed'},ttfbMs:372},
  {origin:'=cmd|calc',status:'ok',score:60,llmsTxtValid:false,llmsTxtStatus:404,jsonLdTypes:[],wordCount:986,aiBots:{'OAI-SearchBot':'allowed','PerplexityBot':'allowed'},ttfbMs:529}
 ];
 assert.equal(filterBenchmarkRows(sample,'perfect','').length,1);
 assert.equal(filterBenchmarkRows(sample,'missing_llms','cmd').length,1);
 assert.equal(filterBenchmarkRows(sample,'schema','').length,1);
 const csv=formatBenchmarkCsv(sample);
 assert.match(csv,/nextjs\.org/);
 assert.match(csv,/100,true,200/);
 assert.match(csv,/"'=cmd\|calc"/);
});
