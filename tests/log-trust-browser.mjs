import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import path from 'node:path';
import {chromium} from 'playwright';
import {root} from '../src/catalog.mjs';

const bundle=await build({absWorkingDir:root,stdin:{contents:"import{mount as log}from'./src/browser/tools/log-bot.js';import{mount as eeat}from'./src/browser/tools/eeat.js';const root=document.querySelector('#tool');(root.dataset.tool==='log-bot'?log:eeat)(root);",resolveDir:root,sourcefile:'log-trust-browser-fixture.js'},bundle:true,write:false,format:'esm',platform:'browser'});
const css=await readFile(path.join(root,'src/browser/playground.css'),'utf8');
const server=createServer((req,res)=>{
 if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
 const url=new URL(req.url,'http://127.0.0.1'),lang=url.searchParams.get('lang')==='ru'?'ru':'en',tool=url.searchParams.get('tool')==='log-bot'?'log-bot':'eeat';
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:20px;font:16px/1.6 system-ui}main{max-width:1180px;margin:auto}${css}</style><main><section id="tool" class="reproleaf-workbench" data-tool="${tool}" data-language="${lang}"></section></main><script type="module" src="/app.js"></script></html>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,observations=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.MWC_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 for(const tool of ['log-bot','eeat'])for(const language of ['ru','en'])for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[],network=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();network.push(route.request().url());return route.abort();});
  await page.goto(`${origin}/?tool=${tool}&lang=${language}`);
  const prefix=tool==='log-bot'?'log':'eeat';
  await page.locator(`[data-${prefix}-example]`).click();
  await page.locator('button[type=submit]').click();
  await page.locator(`[data-${prefix}-json]:enabled`).waitFor();
  const jsonDownload=await Promise.all([page.waitForEvent('download'),page.locator(`[data-${prefix}-json]`).click()]);
  const result=JSON.parse(await readFile(await jsonDownload[0].path(),'utf8'));
  if(tool==='log-bot'){
   assert.equal(result.summary.totalHits,3);assert.equal(result.summary.botHits,3);assert.equal(result.scope.botIdentity,'claimed-user-agent-only');
  }else{
   assert.equal(result.signals.author.visible,true);assert.equal(result.signals.schema.hasPerson,true);assert.equal(result.score,undefined);assert.equal(result.rating,undefined);assert.equal(result.coverage.htmlExecuted,false);
  }
  const csvDownload=await Promise.all([page.waitForEvent('download'),page.locator(`[data-${prefix}-csv]`).click()]);
  const csv=await readFile(await csvDownload[0].path(),'utf8');assert.match(csv,/^\uFEFF/);assert.match(csv,/\r\n/);
  await page.locator(`[data-${prefix}-input]`).fill(tool==='log-bot'?'not a log':'<main><p>No author</p><script>window.EXECUTED=true</script></main>');
  assert.equal(await page.locator(`[data-${prefix}-json]`).isDisabled(),true);assert.equal(await page.locator('.reproleaf-metrics').isVisible(),false);
  await page.locator('button[type=submit]').click();
  if(tool==='log-bot')assert.equal(await page.locator(`[data-${prefix}-json]`).isDisabled(),true);
  else{assert.equal(await page.evaluate(()=>window.EXECUTED),undefined);assert.equal(await page.locator(`[data-${prefix}-json]`).isEnabled(),true);}
  await page.locator(`[data-${prefix}-clear]`).click();
  assert.equal(await page.locator(`[data-${prefix}-input]`).inputValue(),'');assert.equal(await page.locator(`[data-${prefix}-json]`).isDisabled(),true);
  await page.locator(`[data-${prefix}-file]`).setInputFiles({name:tool==='log-bot'?'sample.log':'sample.html',mimeType:'text/plain',buffer:Buffer.from(tool==='log-bot'?'192.0.2.1 - - [15/Nov/2026:12:00:00 +0000] "GET /private?token=SECRET HTTP/1.1" 200 1 "-" "Googlebot"':'<main><p class="byline">File Author</p></main>')});
  await page.waitForFunction(prefix=>document.querySelector(`[data-${prefix}-input]`).value.length>0,prefix);
  await page.locator('button[type=submit]').click();await page.locator(`[data-${prefix}-json]:enabled`).waitFor();
  const fileDownload=await Promise.all([page.waitForEvent('download'),page.locator(`[data-${prefix}-json]`).click()]);
  const fileResult=await readFile(await fileDownload[0].path(),'utf8');assert.equal(fileResult.includes('SECRET'),false);
  if(width===390){
   await page.evaluate(()=>{window.originalFileText=File.prototype.text;File.prototype.text=function(){return new Promise(resolve=>{window.releaseStaleFile=()=>resolve('STALE FILE CONTENT');});};});
   await page.locator(`[data-${prefix}-file]`).setInputFiles({name:'delayed.txt',mimeType:'text/plain',buffer:Buffer.from('delayed')});
   await page.locator(`[data-${prefix}-clear]`).click();await page.locator(`[data-${prefix}-input]`).fill('NEW INPUT');
   await page.evaluate(()=>{window.releaseStaleFile();File.prototype.text=window.originalFileText;});
   await page.waitForTimeout(20);assert.equal(await page.locator(`[data-${prefix}-input]`).inputValue(),'NEW INPUT');assert.equal(await page.locator(`[data-${prefix}-json]`).isDisabled(),true);
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  observations.push({tool,language,width,example:true,json:true,csv:true,staleResultReset:true,file:true,noExternalRequests:true,...(width===390?{asyncFileRace:true}:{})});
  await context.close();
 }
 const output=path.join(root,'private/log-trust-panels-20261116');await mkdir(output,{recursive:true});await writeFile(path.join(output,'browser-receipt.json'),JSON.stringify({at:new Date().toISOString(),observations},null,2)+'\n');
 console.log(JSON.stringify({scenarios:observations.length,passed:true}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
