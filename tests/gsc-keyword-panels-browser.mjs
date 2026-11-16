import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.join(root,'private/gsc-keyword-browser');
await mkdir(output,{recursive:true});
const bundles={};
for(const tool of ['gsc-quick-wins','keyword-cleaner']){
 const result=await build({entryPoints:[path.join(root,'src/browser/tools',tool+'.js')],bundle:true,format:'esm',platform:'browser',write:false});
 bundles[tool]=result.outputFiles[0].text;
}
const css=await readFile(path.join(root,'src/browser/playground.css'),'utf8');
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://fixture.invalid'),tool=url.searchParams.get('tool')||'gsc-quick-wins',language=url.searchParams.get('language')||'en';
 if(url.pathname==='/tool.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(bundles[tool]);return;}
 res.writeHead(200,{'Content-Type':'text/html'});
 res.end(`<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;font:16px/1.5 system-ui;color:#121212}*{box-sizing:border-box}${css}</style><section data-reproleaf-tool="${tool}" data-language="${language}"></section><script type="module">import {mount} from '/tool.js?tool=${tool}';mount(document.querySelector('section'));</script></html>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'}),results=[];
try{
 for(const tool of ['gsc-quick-wins','keyword-cleaner'])for(const language of ['ru','en'])for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:844},acceptDownloads:true}),page=await context.newPage(),errors=[],external=[];
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();external.push(route.request().url());return route.abort();});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/?tool=${tool}&language=${language}`);
  const textarea=page.locator('textarea'),submit=page.locator('button[type=submit]'),status=page.locator('[role=status]'),json=page.getByRole('button',{name:language==='ru'?'Скачать JSON':'Download JSON',exact:true}),csv=page.getByRole('button',{name:language==='ru'?'Скачать CSV':'Download CSV',exact:true}),clear=page.getByRole('button',{name:language==='ru'?'Очистить':'Clear',exact:true});
  await page.getByRole('button',{name:language==='ru'?'Заполнить пример':'Load example',exact:true}).click();
  await submit.click();assert(await page.locator('.reproleaf-metrics').isVisible());
  let downloadPromise=page.waitForEvent('download');await json.click();let download=await downloadPromise;
  const jsonPath=path.join(output,`${tool}-${language}-${width}.json`);await download.saveAs(jsonPath);let data=JSON.parse(await readFile(jsonPath,'utf8'));
  assert.equal(data.tool,tool);assert.equal(data.scope.networkUsed,false);
  assert.equal(tool==='gsc-quick-wins'?data.summary.rowCount:data.summary.inputQueries,tool==='gsc-quick-wins'?3:5);
  const malicious=tool==='gsc-quick-wins'?'Query,Clicks,Impressions,Position\n=1+1,1,100,5\n<img src=x onerror=alert(1)>,1,100,5':'=1+1\n<img src=x onerror=alert(1)>\n<img src=x onerror=alert(1)>';
  await textarea.fill(malicious);assert(await json.isDisabled());assert(!(await page.locator('.reproleaf-metrics').isVisible()));
  await submit.click();assert(await page.locator('.reproleaf-metrics').isVisible());assert.equal(await page.locator('.reproleaf-report img').count(),0);
  downloadPromise=page.waitForEvent('download');await csv.click();download=await downloadPromise;const csvPath=path.join(output,`${tool}-${language}-${width}.csv`);await download.saveAs(csvPath);const bytes=await readFile(csvPath);assert.equal(bytes.subarray(0,3).toString('hex'),'efbbbf');assert(bytes.toString('utf8').includes('"\'=1+1"'));
  await textarea.fill('x'.repeat(1048577));assert.equal((await textarea.inputValue()).length,1048577,'Pasted source must not be silently truncated');await submit.click();assert(await json.isDisabled());assert(!(await page.locator('.reproleaf-metrics').isVisible()));
  await textarea.fill(tool==='gsc-quick-wins'?'Query,Clicks,Impressions,Position\na,abc,100,5':'\u0000');await submit.click();assert(await json.isDisabled());assert(!(await page.locator('.reproleaf-metrics').isVisible()));assert((await status.innerText()).length>10);
  await page.evaluate(()=>{File.prototype.text=function(){window.slowFileStarted=true;return new Promise(resolve=>{window.finishSlowFile=()=>resolve('delayed content');});};});
  await page.locator('input[type=file]').setInputFiles({name:'slow.txt',mimeType:'text/plain',buffer:Buffer.from('delayed content')});
  await page.waitForFunction(()=>window.slowFileStarted===true);await clear.click();await page.evaluate(()=>window.finishSlowFile());assert.equal(await textarea.inputValue(),'');assert(await json.isDisabled());
  await page.getByRole('button',{name:language==='ru'?'Заполнить пример':'Load example',exact:true}).click();await submit.click();assert(await page.locator('.reproleaf-metrics').isVisible());
  if(tool==='keyword-cleaner'){const txt=page.getByRole('button',{name:language==='ru'?'Скачать чистый TXT':'Download clean TXT',exact:true});downloadPromise=page.waitForEvent('download');await txt.click();download=await downloadPromise;const txtPath=path.join(output,`${tool}-${language}-${width}.txt`);await download.saveAs(txtPath);const values=(await readFile(txtPath,'utf8')).trim().split('\n');assert.equal(values.length,language==='ru'?4:4);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await page.screenshot({path:path.join(output,`${tool}-${language}-${width}.png`),fullPage:true});
  results.push({tool,language,width,example:true,json:true,csv:true,formulaGuard:true,xssSafe:true,invalidates:true,staleFileIgnored:true,noNetwork:true,noOverflow:true});await context.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(path.join(output,'receipt.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));}
console.log(JSON.stringify({passed:results.length,results}));
