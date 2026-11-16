import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {root} from '../src/catalog.mjs';

const bundle=await build({absWorkingDir:root,stdin:{contents:"import * as api from './src/browser/tools/hreflang-sitemap.js';window.sitemapApi=api;api.mount(document.querySelector('#tool'));",resolveDir:root},bundle:true,format:'esm',platform:'browser',write:false});
const css=await readFile(path.join(root,'src/browser/playground.css'),'utf8');
const server=createServer((req,res)=>{
 if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
 const language=new URL(req.url,'http://localhost').searchParams.get('lang')==='ru'?'ru':'en';
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px/1.6 system-ui;padding:20px;margin:0}main{max-width:1180px;margin:auto}${css}</style><main><section id="tool" class="reproleaf-workbench" data-language="${language}"></section></main><script type="module" src="/app.js"></script></html>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,observations=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.MWC_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
let parserCases=0;
try{
 for(const language of ['ru','en'])for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[],network=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();network.push(route.request().url());return route.abort();});
  await page.goto(`${origin}/?lang=${language}`);await page.locator('[data-hreflang-example]').waitFor();
  if(language==='ru'&&width===390){
   const cases=await page.evaluate(()=>{
    const {parseXmlSitemap:parse,inspectSitemapInputs:inspect}=window.sitemapApi,ns='http://www.sitemaps.org/schemas/sitemap/0.9';
    const xml=locations=>`<urlset xmlns="${ns}">${locations.map(loc=>`<url><loc>${loc}</loc></url>`).join('')}</urlset>`;
    const passed=[];function check(name,test){if(!test())throw Error(name);passed.push(name);}
    function rejects(name,input,code){check(name,()=>{try{parse(input);return false;}catch(error){return error.message===code;}});}
    rejects('malformed closing tag',`<urlset xmlns="${ns}"><url><loc>https://example.com/a</loc></urlset>`,'SITEMAP_INVALID_XML');
    rejects('unescaped entity',xml(['https://example.com/a?x=1&y=2']),'SITEMAP_INVALID_XML');
    rejects('empty urlset',`<urlset xmlns="${ns}"/>`,'SITEMAP_NO_ENTRIES');
    rejects('empty index',`<sitemapindex xmlns="${ns}"/>`,'SITEMAP_NO_ENTRIES');
    rejects('wrong namespace','<urlset xmlns="https://wrong.example"><url><loc>https://example.com</loc></url></urlset>','SITEMAP_INVALID_NAMESPACE');
    rejects('missing namespace','<urlset><url><loc>https://example.com</loc></url></urlset>','SITEMAP_INVALID_NAMESPACE');
    rejects('mixed entries',`<urlset xmlns="${ns}"><sitemap><loc>https://example.com</loc></sitemap></urlset>`,'SITEMAP_MIXED_ENTRIES');
    rejects('missing loc',`<urlset xmlns="${ns}"><url/></urlset>`,'SITEMAP_INVALID_LOC');
    rejects('duplicate loc field',`<urlset xmlns="${ns}"><url><loc>https://example.com/a</loc><loc>https://example.com/b</loc></url></urlset>`,'SITEMAP_INVALID_LOC');
    rejects('nested loc markup',`<urlset xmlns="${ns}"><url><loc><b>https://example.com</b></loc></url></urlset>`,'SITEMAP_INVALID_LOC');
    rejects('DTD',`<!DOCTYPE urlset [<!ENTITY x "https://example.com">]><urlset xmlns="${ns}"><url><loc>&x;</loc></url></urlset>`,'SITEMAP_DTD_NOT_SUPPORTED');
    rejects('credential loc',xml(['https://user:pass@example.com/a']),'SITEMAP_INVALID_URL');
    rejects('fragment loc',xml(['https://example.com/a#fragment']),'SITEMAP_INVALID_URL');
    rejects('protocol loc',xml(['javascript:alert(1)']),'SITEMAP_INVALID_URL');
    rejects('entry cap',xml(Array.from({length:5001},(_,i)=>`https://example.com/${i}`)),'SITEMAP_TOO_MANY_ENTRIES');
    rejects('UTF8 byte cap',`<urlset xmlns="${ns}">${'я'.repeat(3*1024*1024)}</urlset>`,'SITEMAP_TOO_LARGE');
    const prefixed=parse(`<sm:urlset xmlns:sm="${ns}"><sm:url><sm:loc>https://example.com/a</sm:loc></sm:url></sm:urlset>`);check('prefix supported',()=>prefixed.uniqueCount===1);
    const cdata=`<urlset xmlns="${ns}"><url><loc><![CDATA[https://example.com/a?x=1&y=2]]></loc></url></urlset>`;
    const numeric=xml(['https://example.com/a?x=1&#x26;y=2']);check('CDATA numeric entity exact equality',()=>inspect(cdata,numeric).difference.unchanged.length===1);
    const duplicate=inspect(xml(['https://example.com/a','https://example.com/a']),xml(['https://example.com/a']));check('unique diff duplicate counts',()=>duplicate.before.entryCount===2&&duplicate.before.uniqueCount===1&&duplicate.before.duplicateEntryCount===1&&duplicate.difference.unchanged.length===1);
    const single=inspect(xml(['https://example.com/a']));check('single inventory not fake comparison',()=>single.after===null&&single.difference===null&&single.matrix.status==='not-processed'&&single.before.locations.length===1);
    const index=`<sitemapindex xmlns="${ns}"><sitemap><loc>https://example.com/child.xml</loc></sitemap></sitemapindex>`;
    const idx=inspect(index);check('index child references not pages',()=>idx.scope.locations==='child-sitemap-references'&&idx.matrix.status==='not-processed'&&idx.scope.fetchedUrls===false);
    check('mixed index/page comparison rejected',()=>{try{inspect(index,xml(['https://example.com/a']));return false;}catch(error){return error.message==='SITEMAP_MIXED_KINDS';}});
    check('matrix cap explicit',()=>inspect(xml(Array.from({length:501},(_,i)=>`https://example.com/${i}`))).matrix.reason==='matrix-limit-500-pages');
    check('wrong alternate namespace rejected',()=>{try{parse(`<urlset xmlns="${ns}" xmlns:h="https://wrong.example"><url><loc>https://example.com/a</loc><h:link rel="alternate" hreflang="en" href="https://example.com/a"/></url></urlset>`);return false;}catch(error){return error.message==='SITEMAP_INVALID_ALTERNATE_NAMESPACE';}});
    check('UTF8 BOM JSON supported',()=>inspect('\uFEFF'+JSON.stringify({pages:[{url:'https://example.com/en',alternates:[{hreflang:'en',href:'https://example.com/en'}]}]})).matrix.ok===true);
    return passed;
   });
   parserCases=cases.length;
  }
  await page.locator('[data-hreflang-example]').click();await page.locator('button[type=submit]').click();await page.locator('[data-hreflang-json]:enabled').waitFor();
  const download=await Promise.all([page.waitForEvent('download'),page.locator('[data-hreflang-json]').click()]);
  const report=JSON.parse(await readFile(await download[0].path(),'utf8'));assert.equal(report.mode,'sitemap-comparison');assert.equal(report.difference.added.length,1);assert.equal(report.difference.removed.length,1);assert.equal(report.matrix.ok,true);
  const csvDownload=await Promise.all([page.waitForEvent('download'),page.locator('[data-hreflang-csv]').click()]);const csv=await readFile(await csvDownload[0].path(),'utf8');assert.match(csv,/^\uFEFF/);assert.ok(csv.includes('https://example.org/new-guide'));
  const beforeXml=await page.locator('[data-hreflang-before]').inputValue();
  await page.locator('[data-hreflang-after]').fill('');await page.locator('button[type=submit]').click();
  assert.deepEqual(await page.locator('.reproleaf-metrics strong').allTextContents(),['3',...Array(3).fill(language==='ru'?'Нет пары':'No pair'),'0'],'Missing second XML must not masquerade as zero differences');
  const contained=await page.locator('.reproleaf-metrics>div').evaluateAll(cards=>cards.every(card=>{const value=card.querySelector('strong'),range=document.createRange();range.selectNodeContents(value);const text=range.getBoundingClientRect(),box=card.getBoundingClientRect();return value.scrollWidth<=value.clientWidth+1&&text.left>=box.left-1&&text.right<=box.right+1;}));
  assert.equal(contained,true,'Localized single-inventory metric text must remain inside each existing card');
  await page.locator('[data-hreflang-after]').fill(beforeXml);await page.locator('button[type=submit]').click();
  assert.deepEqual(await page.locator('.reproleaf-metrics strong').allTextContents(),['3','3','0','0','0'],'Actual unchanged comparison must retain observed numeric zero');
  const identicalDownload=await Promise.all([page.waitForEvent('download'),page.locator('[data-hreflang-json]').click()]);const identicalReport=JSON.parse(await readFile(await identicalDownload[0].path(),'utf8'));assert.deepEqual(identicalReport.difference.added,[]);assert.deepEqual(identicalReport.difference.removed,[]);assert.equal(identicalReport.difference.unchanged.length,3);
  await page.locator('[data-hreflang-before]').fill('<broken>');assert.equal(await page.locator('[data-hreflang-json]').isDisabled(),true);assert.equal(await page.locator('.reproleaf-metrics').isVisible(),false);
  await page.locator('button[type=submit]').click();assert.equal(await page.locator('[data-hreflang-json]').isDisabled(),true);
  await page.locator('[data-hreflang-after]').fill('');
  const index='<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://example.com/child.xml</loc></sitemap></sitemapindex>';
  await page.locator('[data-hreflang-before-file]').setInputFiles({name:'index.xml',mimeType:'application/xml',buffer:Buffer.from(index)});
  await page.waitForFunction(()=>document.querySelector('[data-hreflang-before]').value.includes('sitemapindex'));
  await page.locator('button[type=submit]').click();await page.locator('[data-hreflang-json]:enabled').waitFor();assert.equal(await page.locator('.reproleaf-state--good').count(),0);
  assert.match(await page.locator('[role=status]').innerText(),language==='ru'?/не обрабатывалась/:/not processed/);
  await page.locator('[data-hreflang-clear]').click();
  assert.equal(await page.locator('[data-hreflang-before]').inputValue(),'');assert.equal(await page.locator('[data-hreflang-json]').isDisabled(),true);
  const matrix=JSON.stringify({pages:[{url:'https://example.com/en',htmlLang:'en',alternates:[{hreflang:'en',href:'https://example.com/en'}]}]});
  await page.locator('[data-hreflang-before]').fill(matrix);await page.locator('button[type=submit]').click();await page.locator('[data-hreflang-json]:enabled').waitFor();
  const matrixDownload=await Promise.all([page.waitForEvent('download'),page.locator('[data-hreflang-json]').click()]);const matrixReport=JSON.parse(await readFile(await matrixDownload[0].path(),'utf8'));assert.equal(matrixReport.mode,'hreflang-json');assert.equal(matrixReport.matrix.summary.pages,1);
  assert.deepEqual(await page.locator('.reproleaf-metrics strong').allTextContents(),['1','0','0'],'JSON matrix metrics remain independent of XML comparison labels');
  if(width===390){
   await page.evaluate(()=>{window.originalFileText=File.prototype.text;window.pendingXmlFiles={};File.prototype.text=function(){const name=this.name;return new Promise(resolve=>{window.pendingXmlFiles[name]=resolve;});};});
   await page.locator('[data-hreflang-before-file]').setInputFiles({name:'first.xml',mimeType:'application/xml',buffer:Buffer.from('first')});
   await page.locator('[data-hreflang-after-file]').setInputFiles({name:'second.xml',mimeType:'application/xml',buffer:Buffer.from('second')});
   await page.evaluate(()=>window.pendingXmlFiles['second.xml']('<second/>'));await page.waitForFunction(()=>document.querySelector('[data-hreflang-after]').value==='<second/>');assert.equal(await page.locator('button[type=submit]').isDisabled(),true);
   await page.evaluate(()=>window.pendingXmlFiles['first.xml']('<first/>'));await page.waitForFunction(()=>document.querySelector('[data-hreflang-before]').value==='<first/>');assert.equal(await page.locator('[data-hreflang-after]').inputValue(),'<second/>');assert.equal(await page.locator('button[type=submit]').isEnabled(),true);
   await page.evaluate(()=>{File.prototype.text=window.originalFileText;});
   await page.evaluate(()=>{window.originalFileText=File.prototype.text;File.prototype.text=function(){return new Promise(resolve=>{window.releaseStaleFile=()=>resolve('<STALE/>');});};});
   await page.locator('[data-hreflang-before-file]').setInputFiles({name:'delayed.xml',mimeType:'application/xml',buffer:Buffer.from('<delayed/>')});
   await page.locator('[data-hreflang-clear]').click();await page.locator('[data-hreflang-before]').fill('NEW INPUT');await page.evaluate(()=>{window.releaseStaleFile();File.prototype.text=window.originalFileText;});await page.waitForTimeout(20);
   assert.equal(await page.locator('[data-hreflang-before]').inputValue(),'NEW INPUT');assert.equal(await page.locator('[data-hreflang-json]').isDisabled(),true);
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  observations.push({language,width,examples:true,xml:true,jsonMatrix:true,jsonCsvDownloads:true,singleXmlNoPairNotZero:true,metricTextContained:true,observedZeroComparison:true,staleReset:true,indexNotPassed:true,networkRequests:0,...(width===390?{asyncFileRace:true}:{})});await context.close();
 }
 const output=path.join(root,'private/hreflang-panels-20261116');await mkdir(output,{recursive:true});await writeFile(path.join(output,'browser-receipt.json'),JSON.stringify({at:new Date().toISOString(),parserCases,observations},null,2)+'\n');
 console.log(JSON.stringify({parserCases,views:observations.length,passed:true}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
