import assert from 'node:assert/strict';
import {readFile,mkdir,access,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {root} from '../src/catalog.mjs';

const origin=process.env.REPROLEAF_INSTALL_TEST_ORIGIN||'http://localhost:8088';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Use an explicitly local WordPress fixture.');
const install=(await readFile(path.join(root,'src/browser/install.js'),'utf8')).replace("import './selects.js';",'');
const selects=await readFile(path.join(root,'src/browser/selects.js'),'utf8');
const directory=path.join(root,'private/remote-install',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(directory,{recursive:true});
let executablePath=process.env.MWC_BROWSER_PATH||chromium.executablePath();try{await access(executablePath);}catch{if(process.platform==='win32')executablePath='C:/Program Files/Google/Chrome/Application/chrome.exe';}
const browser=await chromium.launch({headless:true,executablePath});const outcomes=[];let moduleLoads=0;
try{
 for(const language of ['ru','en'])for(const width of [320,390]){
  const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  try{
   await context.route('**/*',route=>{const url=new URL(route.request().url()),local=['127.0.0.1','localhost'].includes(url.hostname)&&url.port===new URL(origin).port;return local?route.continue():route.abort();});
   await context.route('**/install-*.js',route=>{moduleLoads++;return route.fulfill({contentType:'application/javascript',body:selects+'\n'+install});});
   await context.addInitScript(()=>{window.copiedInstallValues=[];window.rejectInstallCopy=false;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(window.rejectInstallCopy)throw Error('Synthetic clipboard rejection');window.copiedInstallValues.push(text);}}});});
   const page=await context.newPage();await page.goto(origin+(language==='en'?'/en/tools/reproleaf':'/tools/reproleaf'),{waitUntil:'networkidle'});
   const panel=page.locator('[data-reproleaf-install]');await panel.waitFor();const endpoint=panel.locator('[data-install-remote-url]');assert.equal(await endpoint.textContent(),'https://evolkov.tech/mcp/reproleaf');
   assert.equal(await page.evaluate(()=>window.copiedInstallValues.length),0);
   try{await panel.locator('[data-install-remote-copy]').click({timeout:5000});}catch(error){await page.screenshot({path:path.join(directory,'failed-pointer.png')});await writeFile(path.join(directory,'failed-pointer.json'),JSON.stringify(await page.evaluate(()=>{const e=document.querySelector('[data-install-remote-copy]'),r=e.getBoundingClientRect(),s=getComputedStyle(e),root=e.closest('[data-reproleaf-install]');return {button:{x:r.x,y:r.y,width:r.width,height:r.height,position:s.position,transform:s.transform},root:{height:root.getBoundingClientRect().height,overflow:getComputedStyle(root).overflow},hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,400)};}),null,2));throw error;}await page.waitForFunction(()=>window.copiedInstallValues.length===1);assert.equal(await page.evaluate(()=>window.copiedInstallValues[0]),'https://evolkov.tech/mcp/reproleaf');
   assert.match(await panel.locator('[data-install-status]').textContent(),language==='ru'?/MCP URL скопирован/:/MCP URL copied/);assert.doesNotMatch(await panel.locator('[data-install-status]').textContent(),/directory|путь/);
   await page.evaluate(()=>window.rejectInstallCopy=true);await panel.locator('[data-install-remote-copy]').click();await page.waitForFunction(()=>document.querySelector('[data-install-status]').textContent.includes('manually')||document.querySelector('[data-install-status]').textContent.includes('вручную'));assert.equal(await page.evaluate(()=>getSelection().toString()),'https://evolkov.tech/mcp/reproleaf');
   await page.evaluate(()=>window.rejectInstallCopy=false);await panel.locator('[data-install-client=codex]').click();await panel.locator('[data-install-panel=codex] [data-install-copy]').click();assert.match(await page.evaluate(()=>window.copiedInstallValues.at(-1)),/codex mcp add/);assert.match(await panel.locator('[data-install-status]').textContent(),language==='ru'?/Проверьте путь/:/Check the directory path/);
   await panel.locator('[data-install-client=chatgpt]').click();assert.match(await panel.locator('[data-install-panel=chatgpt]').textContent(),language==='ru'?/не устанавливает плагин/:/does not install a plugin/);
   await panel.locator('[data-install-client=grok]').click();assert.match(await panel.locator('[data-install-panel=grok]').textContent(),language==='ru'?/ещё не проверено/:/has not been verified/);
   assert.doesNotMatch(await panel.textContent(),/not (?:available|published) yet|пока не предоставлен|ещё не опубликован/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),true);
   await panel.screenshot({path:path.join(directory,`${language}-${width}.png`)});outcomes.push({language,width,endpointCopy:true,clipboardFallback:true,localCommandsPreserved:true,clientLimits:true,noHorizontalOverflow:true});
  }finally{await context.close();}
 }
 assert.equal(moduleLoads,4);
}finally{await browser.close();}
await writeFile(path.join(directory,'summary.json'),JSON.stringify({outcomes,scope:'Actual local WordPress render and existing styles, with the new source install/select modules supplied by a local request interception. No distribution build, production deploy or physical-device claim.'},null,2));
console.log(JSON.stringify({views:outcomes.length,moduleLoads,directory}));
