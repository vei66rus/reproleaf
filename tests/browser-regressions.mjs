import {chromium} from 'playwright';
import {access,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root} from '../src/catalog.mjs';
import {inspectPage} from '../src/inspect-page.mjs';
let executablePath=process.env.MWC_BROWSER_PATH||chromium.executablePath();try{await access(executablePath);}catch{executablePath='C:/Program Files/Google/Chrome/Application/chrome.exe';}
const browser=await chromium.launch({headless:true,executablePath}),observations=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.setContent('<style>body{margin:0;overflow:hidden}.host{position:fixed;inset:0}button{margin:20px;width:100px;height:44px}</style><div class="host"><button id="control">Action</button></div>');
 const propagated=await inspectPage(page,{type:'control',selector:'#control'});assert.equal(propagated.status,'pass');observations.push({case:'body-overflow-propagates-to-viewport',...propagated});
 await page.setContent('<style>.clip{height:0;overflow:hidden}button{width:100px;height:44px}</style><div class="clip"><button id="control">Action</button></div>');
 const clipped=await inspectPage(page,{type:'control',selector:'#control'});assert.equal(clipped.status,'fail');observations.push({case:'ordinary-ancestor-still-clips',...clipped});
 await page.setContent('<div id="scroll" style="height:180px;overflow:auto"><p id="tail">Short readable content.</p></div><button id="close">Close</button>');
 const short=await inspectPage(page,{type:'readable-tail',selector:'#scroll',tail:'#tail',close:'#close'});assert.equal(short.status,'pass');observations.push({case:'short-content-needs-no-scroll',...short});
 await page.setContent('<div id="scroll" style="height:180px;overflow:hidden"><div style="height:900px"></div><p id="tail">Last line</p></div><button id="close">Close</button>');
 await page.locator('#scroll').evaluate(el=>el.scrollTop=el.scrollHeight);
 const hidden=await inspectPage(page,{type:'readable-tail',selector:'#scroll',tail:'#tail',close:'#close'});assert.equal(hidden.status,'fail');observations.push({case:'programmatic-scroll-not-user-reachability',...hidden});
 await page.setContent('<div id="host"><canvas id="canvas"></canvas></div>');
 const tautology=await inspectPage(page,{type:'canvas-coverage',selector:'#canvas',host:'#canvas'});assert.equal(tautology.status,'setup-error');observations.push({case:'canvas-cannot-be-its-own-coverage-host',...tautology});
 await page.setContent('<style>body{margin:0}.spacer{height:900px}.bar{position:fixed;left:0;right:0;bottom:0;height:96px;z-index:10;background:#ccc}</style><div class="spacer"></div><input id="field" style="display:block;width:200px;height:44px"><div style="height:120px"></div><div class="bar"></div>');
 const occludedFocus=await inspectPage(page,{type:'focus-occlusion',selector:'#field'});assert.equal(occludedFocus.status,'fail');observations.push({case:'sticky-bar-occludes-focused-input',...occludedFocus});
 await page.evaluate(()=>{document.documentElement.style.scrollPaddingBottom='120px';window.scrollTo(0,0);});
 const clearFocus=await inspectPage(page,{type:'focus-occlusion',selector:'#field'});assert.equal(clearFocus.status,'pass');observations.push({case:'scroll-padding-clears-sticky-bar-on-focus',...clearFocus});
 const output=path.join(root,'artifacts/browser-regressions');await mkdir(output,{recursive:true});await writeFile(path.join(output,'report.json'),JSON.stringify({at:new Date().toISOString(),observations},null,2));console.log(JSON.stringify({passed:observations.length,output}));
}finally{await browser.close();}
