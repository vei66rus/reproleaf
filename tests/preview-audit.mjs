import {chromium} from 'playwright';
import {mkdir,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {root,catalog} from '../src/catalog.mjs';
import {buildSite} from '../src/build.mjs';
import {startServer} from '../src/server.mjs';
await buildSite();
let executablePath=process.env.MWC_BROWSER_PATH||chromium.executablePath();
try{await access(executablePath);}catch{executablePath='C:/Program Files/Google/Chrome/Application/chrome.exe';}
const output=path.join(root,'artifacts/preview');await mkdir(output,{recursive:true});
const server=await startServer();let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,executablePath});
 for(const width of [320,390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  for(const route of ['/',...catalog.cases.map(c=>`/cases/${c.id}/`),'/methodology/']){
   await page.goto(server.origin+route);
   const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,h1:document.querySelectorAll('h1').length,robots:document.querySelector('meta[name=robots]')?.content}));
   if(state.scrollWidth>width+1||state.h1!==1||!state.robots?.includes('noindex'))throw Error(JSON.stringify({width,route,state}));
   results.push({width,route,...state});
   if(route==='/')await page.screenshot({path:path.join(output,`landing-${width}.png`),fullPage:true});
  }
  await page.close();
 }
 await writeFile(path.join(output,'audit.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));
 console.log(JSON.stringify({pagesChecked:results.length,output}));
}finally{await browser?.close();await server.close();}
