import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const results=[];await mkdir('private/design',{recursive:true});
try{
 for(const width of [320,390,1440])for(const locale of ['ru','en']){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='localhost'?route.continue():route.abort());
  await page.goto('http://localhost:8088/'+(locale==='en'?'en/':'')+'tools/reproleaf',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('[data-reproleaf-playground]').dataset.mounted==='true');
  await page.evaluate(()=>{window.__copied=[];window.__opened=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.__copied.push(text)}});window.open=url=>{window.__opened.push(url);return null;};});
  const preview=page.locator('[data-ai-preview]');assert.match(await preview.inputValue(),/evolkov.tech/);
  await page.locator('[data-load-example]').click();
  await page.locator('textarea[name=markdown]').fill('PRIVATE_CANARY\n\n## Test\n\nA short draft.');
  assert.doesNotMatch(await preview.inputValue(),/PRIVATE_CANARY/);
  await page.locator('[data-reproleaf-form] [type=submit]').click();await page.locator('[data-download-report]').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('[data-download-report]').disabled);
  assert.match(await preview.inputValue(),/findings/);
  await page.locator('[data-ai-draft]').check();assert.match(await preview.inputValue(),/PRIVATE_CANARY/);
  await page.locator('[data-ai-intent]').selectOption('advice',{force:true});
  for(const provider of ['chatgpt','perplexity','gemini'])await page.locator(`[data-ai-provider=${provider}]`).click();
  await page.locator('[data-ai-copy]').click();const state=await page.evaluate(()=>({copied:window.__copied,opened:window.__opened,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}));
  assert.equal(state.copied.length,4);assert.equal(state.opened.length,3);assert.ok(state.opened.every(url=>!url.includes('?')));assert.equal(state.overflow,false);assert.deepEqual(errors,[]);
  if(width<950)await page.locator('[data-workspace-view=editor]').click();
  await page.locator('textarea[name=markdown]').fill('UPDATED_DRAFT');
  if(width<950)await page.locator('[data-workspace-view=report]').click();
  assert.doesNotMatch(await preview.inputValue(),/"findings"/);assert.match(await preview.inputValue(),/UPDATED_DRAFT/);
  // Clipboard permission failure must retain a usable selected prompt.
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('blocked');}}}));
  await page.locator('[data-ai-copy]').click();assert.match(await page.locator('[data-ai-status]').innerText(),locale==='ru'?/вручную/:/manually/);
  if(width===390&&locale==='ru')await page.locator('[data-ai-handoff]').screenshot({path:'private/design/ai-handoff-390.png'});
  if(width<950)await page.locator('[data-workspace-view=editor]').click();
  await page.locator('label:has(input[name=mode][value=packet])').click();
  await page.locator('textarea[name=packet]').fill(JSON.stringify({article:{markdown:{unexpected:'object'}}}));
  assert.doesNotMatch(await preview.inputValue(),/UPDATED_DRAFT/);assert.deepEqual(errors,[]);
  results.push({width,locale,malformedPacketSafe:true,reportAndDraftSelection:true,staleReportCleared:true,providerCopies:4,externalPromptInUrl:false,clipboardFallback:true,overflow:false});await context.close();
 }
 console.log(JSON.stringify(results));await writeFile('private/design/ai-handoff-checks.json',JSON.stringify({at:new Date().toISOString(),results},null,2));
}finally{await browser.close();}


