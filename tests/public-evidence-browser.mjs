import {chromium} from 'playwright';
import {readFile,mkdir,access} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,escapeHtml as e} from '../src/catalog.mjs';

const pagesFile=process.argv[2],cssFile=process.argv[3],assetDirectory=process.argv[4];
if(!pagesFile||!cssFile||!assetDirectory)throw Error('Provide generated pages JSON, the site commercial CSS and reviewed evidence asset directory.');
const pages=JSON.parse(await readFile(pagesFile,'utf8')),commercialCss=await readFile(cssFile,'utf8'),documentationCss=await readFile(path.join(assetDirectory,'documentation.css'),'utf8');
let executablePath=process.env.MWC_BROWSER_PATH||chromium.executablePath();try{await access(executablePath);}catch{executablePath='C:/Program Files/Google/Chrome/Application/chrome.exe';}
const browser=await chromium.launch({headless:true,executablePath}),output=path.join(root,'artifacts/public-evidence-browser');await mkdir(output,{recursive:true});let checks=0;
try{
 for(const [key,record]of Object.entries(pages))for(const width of [320,390,1440]){
  const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage(),errors=[],requests=[];
  await page.route('**/*',route=>{requests.push(route.request().url());if(route.request().url().endsWith('/documentation.css'))return route.fulfill({body:documentationCss,contentType:'text/css'});return route.abort();});
  page.on('pageerror',error=>errors.push(error.message));
  await page.setContent(`<!doctype html><html lang="${record.language}"><base href="http://reproleaf-preview.test/"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px/1.6 Arial,sans-serif}${commercialCss}</style><main class="evolkov-commercial"><article><header class="commercial-hero"><p class="commercial-eyebrow">Reproleaf</p><h1>${e(record.title)}</h1><p class="commercial-lead">${e(record.lead)}</p></header><div class="commercial-content">${record.content}</div></article></main></html>`,{waitUntil:'load'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${key} horizontal overflow at${width}`);
  assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('script,iframe,form').count(),0);
  const missing=await page.locator('a[href^="#"]').evaluateAll(links=>links.filter(link=>!document.getElementById(link.hash.slice(1))).map(link=>link.hash));assert.deepEqual(missing,[]);
  const clippedTables=await page.locator('table').evaluateAll(tables=>tables.filter(table=>table.getBoundingClientRect().right>innerWidth).length);assert.equal(clippedTables,0);
  assert.deepEqual(errors,[]);assert.equal(requests.length,1);assert.equal(requests.some(url=>!url.endsWith('/documentation.css')),false);
  await page.screenshot({path:path.join(output,`${key}-${width}.png`)});
  if(record.group==='cases'&&width===320){await page.locator('table').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`${key}-${width}-outcomes.png`)});}
  checks++;await context.close();
 }
 console.log(JSON.stringify({checks,network:'All stylesheet requests fulfilled locally; no public requests.',scope:'Generated static content in the current commercial CSS at three viewport widths; not full WordPress navigation or physical-device certification.',output}));
}finally{await browser.close();}
