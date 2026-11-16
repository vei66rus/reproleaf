import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {root} from '../src/catalog.mjs';

const folder=await mkdtemp(path.join(os.tmpdir(),'reproleaf-serp-panel-'));
assert.equal(path.dirname(folder),path.resolve(os.tmpdir()));
const output=path.join(root,'artifacts/private/serp-gap-panel-browser');await mkdir(output,{recursive:true});
await build({entryPoints:[path.join(root,'src/browser/tools/serp-gap.js')],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:path.join(folder,'app.js')});
const app=await readFile(path.join(folder,'app.js'));
const css=await readFile(path.join(root,'src/browser/playground.css'),'utf8');
const server=createServer((request,response)=>{
 if(request.url==='/app.js'){response.writeHead(200,{'Content-Type':'text/javascript'});response.end(app);return;}
 const language=request.url==='/ru'?'ru':'en';
 response.writeHead(200,{'Content-Type':'text/html'});response.end(`<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0;padding:20px;font:16px/1.5 system-ui;color:#121212}main{max-width:1180px;margin:auto}table{width:100%;overflow-wrap:anywhere}input,textarea{box-sizing:border-box}${css}</style><main><section data-reproleaf-tool="serp-gap" data-language="${language}" class="reproleaf-workbench ym-hide-content"></section></main><script type="module">import{mount}from'/app.js';mount(document.querySelector('section'));window.events=[];document.addEventListener('reproleaf:tool-event',event=>events.push(event.detail));</script></html>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.MWC_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const receipts=[];
try{
 for(const language of ['ru','en'])for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:850}}),page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>{if(!route.request().url().startsWith(origin)){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(origin+'/'+language);
  const tool=page.locator('[data-reproleaf-tool]');
  await tool.getByRole('button',{name:language==='ru'?'Заполнить учебный пример':'Load a synthetic example',exact:true}).click();
  const run=tool.locator('button[type=submit]');await run.click();
  assert(await tool.locator('.reproleaf-metrics').isVisible());
  assert.equal(await tool.locator('tbody tr').count(),3);
  const json=tool.getByRole('button',{name:language==='ru'?'Скачать JSON':'Download JSON',exact:true});
  let downloadPromise=page.waitForEvent('download');await json.click();let download=await downloadPromise;
  const report=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(report.competitors.length,2);assert.equal(report.coverage.searchResultsFetched,false);assert(!JSON.stringify(report).includes('<main>'));
  await tool.locator('textarea').last().fill('invalid');assert(await json.isDisabled());assert(!await tool.locator('.reproleaf-metrics').isVisible());await run.click();assert(await json.isDisabled());
  await tool.getByRole('button',{name:language==='ru'?'Заполнить учебный пример':'Load a synthetic example',exact:true}).click();await run.click();
  const csv=tool.getByRole('button',{name:language==='ru'?'Скачать CSV сравнения':'Download comparison CSV',exact:true});downloadPromise=page.waitForEvent('download');await csv.click();download=await downloadPromise;
  const csvBytes=await readFile(await download.path());assert(csvBytes.subarray(0,3).equals(Buffer.from([239,187,191])));assert(csvBytes.toString('utf8').includes('comparison'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await page.screenshot({path:path.join(output,`${language}-${width}.png`),fullPage:true});
  await tool.getByRole('button',{name:language==='ru'?'Очистить':'Clear',exact:true}).click();assert(await json.isDisabled());assert.equal(await tool.locator('textarea').first().inputValue(),'');
  receipts.push({language,width,article:true,json:true,csv:true,invalidated:true,network:false});await context.close();
 }
 const page=await browser.newPage();await page.goto(origin+'/en');const tool=page.locator('[data-reproleaf-tool]');
 await page.addInitScript(()=>{const original=File.prototype.text;File.prototype.text=async function(){if(this.name==='slow.html')await new Promise(r=>setTimeout(r,300));return original.call(this);};});
 await page.reload();
 await tool.locator('input[type=file]').first().setInputFiles({name:'slow.html',mimeType:'text/html',buffer:Buffer.from('<main>OLD FILE</main>')});
 await tool.locator('textarea').first().fill('<main>NEW INPUT</main>');
 await page.waitForFunction(()=>!document.querySelector('button[type=submit]').disabled);
 assert.equal(await tool.locator('textarea').first().inputValue(),'<main>NEW INPUT</main>');
 receipts.push({lateFileDoesNotOverwriteTypedInput:true});
 await page.close();
 await writeFile(path.join(output,'receipt.json'),JSON.stringify(receipts,null,2)+'\n');
 console.log(JSON.stringify({views:4,lateFileGuard:true,status:'passed'}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));assert.equal(path.dirname(folder),path.resolve(os.tmpdir()));await rm(folder,{recursive:true,force:true});}
