import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {buildBrowser} from '../src/build-browser.mjs';
import {root} from '../src/catalog.mjs';
await buildBrowser();const directory=path.join(root,'dist/browser');
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname,filename=pathname==='/ru'?'dev-ru.html':pathname==='/'?'dev.html':pathname.slice(1);if(!/^[a-zA-Z0-9.-]+$/.test(filename))throw Error();const bytes=await readFile(path.join(directory,filename));res.setHeader('Content-Type',filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(bytes);}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`,installedChrome='C:/Program Files/Google/Chrome/Application/chrome.exe',executablePath=process.env.CHROME_PATH||(process.platform==='win32'&&existsSync(installedChrome)?installedChrome:undefined),browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})}),results=[];
const profile={schemaVersion:2,allowNetwork:false,methods:['GET','HEAD'],analyticsPolicy:'known-analytics-blocked-v1',isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',webSockets:'blocked'};
const raw=()=>({at:'2026-11-10T10:00:00.000Z',target:'http://127.0.0.1:3000/page',viewport:{width:390,height:844},browser:'157.0.8103.50',checkerSha256:'a'.repeat(64),adapterSha256:'b'.repeat(64),targetStateSha256:'c'.repeat(64),executionProfile:{...profile},blockedMethods:[],blockedTransports:[],runtimeErrors:[],results:[{id:'close',type:'control',status:'fail'}]});
await mkdir(path.join(root,'private/real-projects/comparison-ui'),{recursive:true});
try{
 for(const language of ['ru','en'])for(const mode of ['valid','legacy','network-change','route-change']){
  const context=await browser.newContext({viewport:{width:390,height:900},acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+(language==='ru'?'/ru':'/'));await page.locator('[data-application-context]').waitFor();
  const before=raw(),after=raw();after.results[0].status='pass';if(mode==='legacy'){delete before.executionProfile;delete after.executionProfile;delete before.targetStateSha256;delete after.targetStateSha256;}if(mode==='network-change')after.executionProfile.allowNetwork=true;if(mode==='route-change')after.targetStateSha256='d'.repeat(64);
  await page.locator('[data-project-name]').fill('Synthetic comparison regression');await page.locator('[data-project-save]').click();await page.waitForFunction(()=>document.querySelector('[data-project-picker]').value!=='');
  for(const [index,report]of [before,after].entries()){await page.locator('[data-dev-report-text]').fill(JSON.stringify(report));await page.locator('[data-dev-report-import]').click();await page.waitForFunction(count=>document.querySelectorAll('[data-project-runs]>li').length===count,index+1);}
  await page.locator('.reproleaf-project-history>summary').click();await page.locator('[data-run-compare]').click();const comparison=page.locator('[data-run-comparison]');await comparison.locator('.reproleaf-diff-count').first().waitFor();assert.equal(await comparison.locator('.reproleaf-diff-count--resolved strong').textContent(),mode==='valid'?'1':'0');assert.equal(await comparison.locator('.reproleaf-diff-count--unverified strong').textContent(),mode==='valid'?'0':'1');
  const summary=comparison.locator('summary').filter({hasText:language==='ru'?'Условия проверки интерфейса':'Frontend check environment'});assert((await summary.textContent()).includes(mode==='legacy'?(language==='ru'?'не подтверждены':'unconfirmed'):mode==='valid'?(language==='ru'?'совпадают':'matched'):(language==='ru'?'есть изменения':'changed')));
  if(mode==='network-change')assert((await comparison.textContent()).includes(language==='ru'?'Внешние GET/HEAD разрешены':'External GET/HEAD allowed'));
  const downloadPromise=page.waitForEvent('download');await comparison.locator('[data-comparison-html]').click();const download=await downloadPromise,html=await readFile(await download.path(),'utf8');assert(html.includes(language==='ru'?'Политика выполнения':'Execution policy'));if(mode==='legacy')assert(html.includes(language==='ru'?'Повторите проверку текущей CLI':'Repeat with the current CLI'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await comparison.screenshot({path:path.join(root,`private/real-projects/comparison-ui/${language}-${mode}.png`)});results.push({language,mode,correctCounts:true,correctScopeSummary:true,htmlExport:true,overflow:false});await context.close();
 }
 await writeFile(path.join(root,'private/real-projects/comparison-ui/report.json'),JSON.stringify({results},null,2));console.log(JSON.stringify({results},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
