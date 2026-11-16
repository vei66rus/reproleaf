import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.join(root,'private/policy-trace-browser');await mkdir(output,{recursive:true});
const bundle=(await build({entryPoints:[path.join(root,'src/browser/tools/policy-trace.js')],bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].text,css=await readFile(path.join(root,'src/browser/playground.css'),'utf8');
const server=createServer((req,res)=>{const url=new URL(req.url,'http://fixture.invalid'),mode=url.searchParams.get('mode')||'robots-policy',language=url.searchParams.get('language')||'en';if(url.pathname==='/tool.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(bundle);return;}res.writeHead(200,{'Content-Type':'text/html'});res.end(`<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;font:16px/1.5 system-ui;color:#121212}*{box-sizing:border-box}${css}</style><section data-reproleaf-tool="${mode}" data-language="${language}"></section><script type="module">import {mount} from '/tool.js';mount(document.querySelector('section'));</script></html>`);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'}),results=[];
try{
 for(const mode of ['robots-policy','redirect-chain'])for(const language of ['ru','en'])for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:844},acceptDownloads:true}),page=await context.newPage(),errors=[],external=[];
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();external.push(route.request().url());return route.abort();});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/?mode=${mode}&language=${language}`);
  const input=page.locator('textarea').first(),run=page.locator('button[type=submit]'),example=page.getByRole('button',{name:language==='ru'?'Заполнить пример':'Load example',exact:true}),clear=page.getByRole('button',{name:language==='ru'?'Очистить':'Clear',exact:true}),json=page.getByRole('button',{name:language==='ru'?'Скачать JSON':'Download JSON',exact:true}),csv=page.getByRole('button',{name:language==='ru'?'Скачать CSV':'Download CSV',exact:true});
  await example.click();await run.click();assert(await page.locator('.reproleaf-metrics').isVisible());
  let pending=page.waitForEvent('download');await json.click();let download=await pending;let target=path.join(output,`${mode}-${language}-${width}.json`);await download.saveAs(target);let report=JSON.parse(await readFile(target,'utf8'));assert.equal(report.tool,mode);assert.equal(report.scope.networkUsed,false);
  if(mode==='robots-policy'){
   assert.equal(report.page.crawlStatus,'blocked-by-supplied-rule');assert.equal(report.page.metaRobots.noindex,null);assert.equal(report.page.indexStatus,'incomplete-observations');
   await page.locator('input[type=checkbox]').first().check();assert(await json.isDisabled());await page.locator('textarea').nth(1).fill('noindex');await run.click();
   pending=page.waitForEvent('download');await json.click();download=await pending;target=path.join(output,`${mode}-${language}-${width}-known.json`);await download.saveAs(target);report=JSON.parse(await readFile(target,'utf8'));assert.equal(report.page.indexStatus,'noindex-observed');
   await input.fill('User-agent: *\nDisallow: /private/\nSitemap: =1+1\n# <img src=https://private.example/x onerror=window.injected=1>');
  }else{
   assert.equal(report.traces[0].completion,'terminal-observed');
   const url='https://example.com/a?token=secret#part';await input.fill(JSON.stringify({traces:[{startUrl:url,hops:[{url,status:301,location:'/b'}]}]}));
  }
  assert(await json.isDisabled());await run.click();assert(await page.locator('.reproleaf-metrics').isVisible());assert.equal(await page.evaluate(()=>window.injected),undefined);assert.equal(await page.locator('.reproleaf-report img').count(),0);
  pending=page.waitForEvent('download');await csv.click();download=await pending;target=path.join(output,`${mode}-${language}-${width}.csv`);await download.saveAs(target);const bytes=await readFile(target);assert.equal(bytes.subarray(0,3).toString('hex'),'efbbbf');assert(bytes.toString('utf8').includes('\r\n'));if(mode==='robots-policy')assert(bytes.toString('utf8').includes('"\'=1+1"'));
  pending=page.waitForEvent('download');await json.click();download=await pending;target=path.join(output,`${mode}-${language}-${width}-observed.json`);await download.saveAs(target);report=JSON.parse(await readFile(target,'utf8'));if(mode==='redirect-chain'){assert.equal(report.ok,false);assert.equal(report.traces[0].completion,'partial');assert.equal(report.traces[0].finalStatus,null);assert(!JSON.stringify(report).includes('token=secret'));}
  const size=(mode==='robots-policy'?524288:1048576)+1;await input.fill('x'.repeat(size));assert.equal((await input.inputValue()).length,size);await run.click();assert(await json.isDisabled());assert(!(await page.locator('.reproleaf-metrics').isVisible()));
  await page.evaluate(()=>{File.prototype.text=function(){window.slowFileStarted=true;return new Promise(resolve=>{window.finishSlowFile=()=>resolve('stale content');});};});await page.locator('input[type=file]').setInputFiles({name:'slow.txt',mimeType:'text/plain',buffer:Buffer.from('stale content')});await page.waitForFunction(()=>window.slowFileStarted===true);await clear.click();await page.evaluate(()=>window.finishSlowFile());assert.equal(await input.inputValue(),'');assert(await json.isDisabled());
  await example.click();await run.click();assert(await page.locator('.reproleaf-metrics').isVisible());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.screenshot({path:path.join(output,`${mode}-${language}-${width}.png`),fullPage:true});results.push({mode,language,width,example:true,actualJson:true,actualCsv:true,unknownNotFalse:true,partialNotSuccess:true,noNetwork:true,noExecution:true,pasteNotTruncated:true,lateFileIgnored:true,noOverflow:true});await context.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(path.join(output,'receipt.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));}
console.log(JSON.stringify({passed:results.length,results}));
