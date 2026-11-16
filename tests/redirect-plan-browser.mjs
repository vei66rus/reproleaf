import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('..',import.meta.url)),output=path.join(root,'private/redirect-plan-browser-20261116');await mkdir(output,{recursive:true});
const bundle=(await build({entryPoints:[path.join(root,'src/browser/tools/policy-trace.js')],bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].text;
const css=await readFile(path.join(root,'src/browser/playground.css'),'utf8');
const server=createServer((req,res)=>{if(req.url==='/tool.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(bundle);return;}const language=req.url.includes('ru')?'ru':'en';res.writeHead(200,{'Content-Type':'text/html'});res.end(`<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;font:16px/1.5 system-ui}*{box-sizing:border-box}${css}</style><section data-reproleaf-tool="redirect-chain" data-language="${language}"></section><script type="module">import{mount}from'/tool.js';mount(document.querySelector('section'));</script>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),receipts=[];
try{
 for(const language of ['ru','en'])for(const width of [390,1440]){
  const ru=language==='ru',context=await browser.newContext({viewport:{width,height:844},acceptDownloads:true}),page=await context.newPage(),errors=[],external=[];
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();external.push(route.request().url());return route.abort();});page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/'+language);
  const source=page.locator('form textarea').first(),generate=page.getByRole('button',{name:ru?'Подготовить черновик правил':'Prepare rule draft',exact:true}),download=page.getByRole('button',{name:ru?'Скачать черновик правил':'Download rule draft',exact:true}),status=page.getByRole('combobox',{name:ru?'Код постоянного редиректа':'Permanent redirect status',exact:true}),format=page.getByRole('combobox',{name:ru?'Формат правил':'Rule format',exact:true}),preview=page.locator('[data-redirect-plan] textarea'),example=page.getByRole('button',{name:ru?'Заполнить пример':'Load example',exact:true}),clear=page.getByRole('button',{name:ru?'Очистить':'Clear',exact:true});
  assert.equal(await status.inputValue(),'');assert(await download.isDisabled());await example.click();const original=await source.inputValue();await generate.click();assert.equal(await preview.count(),0);assert(await download.isDisabled());
  await status.selectOption('308');await generate.click();const nginx=await preview.inputValue();assert.ok(nginx.includes('if ($request_uri = "/old")'));assert.ok(nginx.includes('return 308 https://example.com/final;'));
  let pending=page.waitForEvent('download');await download.click();let artifact=await pending;assert.equal(artifact.suggestedFilename(),'reproleaf-redirect-plan.nginx.conf');let target=path.join(output,`${language}-${width}.nginx.conf`);await artifact.saveAs(target);assert.equal(await readFile(target,'utf8'),nginx);
  await preview.fill(nginx+'# Manual edit\n');pending=page.waitForEvent('download');await download.click();artifact=await pending;target=path.join(output,`${language}-${width}-edited.conf`);await artifact.saveAs(target);assert.ok((await readFile(target,'utf8')).endsWith('# Manual edit\n'));
  await format.selectOption('apache-root');assert.equal(await preview.count(),0);assert(await download.isDisabled());await generate.click();const apache=await preview.inputValue();assert.ok(apache.includes('RewriteCond %{QUERY_STRING} ^$'));assert.ok(apache.includes('[R=308,END,NE]'));
  pending=page.waitForEvent('download');await download.click();artifact=await pending;assert.equal(artifact.suggestedFilename(),'reproleaf-redirect-plan.htaccess');target=path.join(output,`${language}-${width}.htaccess`);await artifact.saveAs(target);assert.equal(await readFile(target,'utf8'),apache);
  const unsafe=JSON.parse(original);unsafe.traces[0].startUrl='https://user:PRIVATE_SECRET@example.com/old';unsafe.traces[0].hops[0].url=unsafe.traces[0].startUrl;await source.fill(JSON.stringify(unsafe));assert(await download.isDisabled());await generate.click();assert.equal(await preview.count(),0);assert(await download.isDisabled());assert.ok(!(await page.locator('[data-redirect-plan]').innerText()).includes('PRIVATE_SECRET'));
  await source.fill('{');await generate.click();assert(await download.isDisabled());assert.equal(await preview.count(),0);
  await page.evaluate(()=>{File.prototype.text=function(){window.slowReadStarted=true;return new Promise(resolve=>window.finishSlowRead=()=>resolve('{"traces":[]}'));};});await page.locator('input[type=file]').setInputFiles({name:'slow.json',mimeType:'application/json',buffer:Buffer.from('pending')});await page.waitForFunction(()=>window.slowReadStarted===true);await clear.click();await page.evaluate(()=>window.finishSlowRead());assert.equal(await source.inputValue(),'');assert.equal(await status.inputValue(),'');assert(await download.isDisabled());
  await example.click();await status.selectOption('301');await generate.click();assert.ok((await preview.inputValue()).includes('R=')||(await preview.inputValue()).includes('return 301'));await preview.fill('');assert(await download.isDisabled());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.screenshot({path:path.join(output,`${language}-${width}.png`),fullPage:true});receipts.push({language,width,explicitStatus:true,nginxDownload:true,apacheDownload:true,editedExport:true,sourceInvalidation:true,blockedCredentialsNoLeak:true,lateFileIgnored:true,clearResetsStatus:true,noOverflow:true,noExternalRequests:true});await context.close();
 }
 await writeFile(path.join(output,'receipt.json'),JSON.stringify({at:new Date().toISOString(),receipts},null,2));console.log(JSON.stringify({passed:receipts.length,output}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
