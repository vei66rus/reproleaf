import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.join(root,'private/markup-inspector-browser');await mkdir(output,{recursive:true});
const bundle=(await build({entryPoints:[path.join(root,'src/browser/tools/markup-inspector.js')],bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].text;
const css=await readFile(path.join(root,'src/browser/playground.css'),'utf8');
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://fixture.invalid'),mode=url.searchParams.get('mode')||'jsonld-schema',language=url.searchParams.get('language')||'en';
 if(url.pathname==='/tool.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(bundle);return;}
 res.writeHead(200,{'Content-Type':'text/html'});res.end(`<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;font:16px/1.5 system-ui;color:#121212}*{box-sizing:border-box}${css}</style><section data-reproleaf-tool="${mode}" data-language="${language}"></section><script type="module">import {mount} from '/tool.js';mount(document.querySelector('section'));</script></html>`);
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'}),results=[];
try{
 for(const mode of ['jsonld-schema','social-meta'])for(const language of ['ru','en'])for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:844},acceptDownloads:true}),page=await context.newPage(),errors=[],external=[];
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();external.push(route.request().url());return route.abort();});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/?mode=${mode}&language=${language}`);
  const single=page.locator('[data-markup-view=single]'),input=single.locator('textarea'),run=single.locator('button[type=submit]'),example=single.getByRole('button',{name:language==='ru'?'Заполнить пример':'Load example',exact:true}),clear=single.getByRole('button',{name:language==='ru'?'Очистить':'Clear',exact:true}),json=single.getByRole('button',{name:language==='ru'?'Скачать JSON':'Download JSON',exact:true}),csv=single.getByRole('button',{name:language==='ru'?'Скачать CSV':'Download CSV',exact:true});
  await example.click();await run.click();assert(await single.locator('.reproleaf-metrics').isVisible());
  let pending=page.waitForEvent('download');await json.click();let download=await pending;const initial=path.join(output,`${mode}-${language}-${width}.json`);await download.saveAs(initial);let report=JSON.parse(await readFile(initial,'utf8'));assert.equal(report.tool,mode);assert.equal(report.scope.networkUsed,false);assert.equal(report.summary.errors,0);assert.equal(report.scope.sourceHtmlIncluded,false);
  if(mode==='jsonld-schema'){
   await single.locator('select').selectOption('json');assert(await json.isDisabled());await example.click();await run.click();assert(await single.locator('.reproleaf-metrics').isVisible());
   pending=page.waitForEvent('download');await json.click();download=await pending;const naked=path.join(output,`${mode}-${language}-${width}-json-input.json`);await download.saveAs(naked);report=JSON.parse(await readFile(naked,'utf8'));assert.equal(report.summary.entities,1);assert.equal(report.scope.inputFormat,'json');
   await input.fill(JSON.stringify({'@context':'https://schema.org','@type':'=1+1',url:'/relative',name:'</script><img src=https://private.example/image onerror=window.injected=1>'}));
  }else{
   await input.fill('<script>window.injected=1</script><meta property="og:title" content="<img src=https://private.example/image onerror=window.injected=1>"><meta property="og:image" content="https://private.example/card.png?token=secret"><meta property="og:url" content="javascript:alert(1)"><meta name="twitter:card" content="invalid">');
  }
  assert(await json.isDisabled());await run.click();assert(await single.locator('.reproleaf-metrics').isVisible());assert.equal(await page.evaluate(()=>window.injected),undefined);assert.equal(await page.locator('.reproleaf-report img').count(),0);
  pending=page.waitForEvent('download');await csv.click();download=await pending;const csvPath=path.join(output,`${mode}-${language}-${width}.csv`);await download.saveAs(csvPath);const csvBytes=await readFile(csvPath);assert.equal(csvBytes.subarray(0,3).toString('hex'),'efbbbf');assert(csvBytes.toString('utf8').includes('\r\n'));if(mode==='jsonld-schema')assert(csvBytes.toString('utf8').includes('"\'=1+1"'));
  pending=page.waitForEvent('download');await json.click();download=await pending;const observed=path.join(output,`${mode}-${language}-${width}-findings.json`);await download.saveAs(observed);report=JSON.parse(await readFile(observed,'utf8'));assert(report.findings.length>0);assert(!JSON.stringify(report).includes('token=secret'));
  await input.fill('x'.repeat(1048577));await run.click();assert(await json.isDisabled());assert(!(await single.locator('.reproleaf-metrics').isVisible()));
  await page.evaluate(()=>{File.prototype.arrayBuffer=function(){window.slowFileStarted=true;return new Promise(resolve=>{window.finishSlowFile=()=>resolve(new TextEncoder().encode('stale content').buffer);});};});
  await single.locator('input[type=file]').setInputFiles({name:'slow.html',mimeType:'text/html',buffer:Buffer.from('stale content')});await page.waitForFunction(()=>window.slowFileStarted===true);await clear.click();await page.evaluate(()=>window.finishSlowFile());assert.equal(await input.inputValue(),'');assert(await json.isDisabled());
  await example.click();await run.click();assert(await single.locator('.reproleaf-metrics').isVisible());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await page.screenshot({path:path.join(output,`${mode}-${language}-${width}.png`),fullPage:true});results.push({mode,language,width,json:true,csv:true,nakedJson:mode==='jsonld-schema',noNetwork:true,noImageFetch:true,noExecution:true,redaction:true,editInvalidation:true,lateFileIgnored:true,noOverflow:true});await context.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(path.join(output,'receipt.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));}
console.log(JSON.stringify({passed:results.length,results}));
