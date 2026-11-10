import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {chromium} from 'playwright';
import {catalog,root,getCase} from './catalog.mjs';
import {buildSite} from './build.mjs';
import {startServer} from './server.mjs';
import {checks} from './checks.mjs';
import {sha256,currentEvidenceInputs} from './evidence.mjs';
async function browserOptions(){
 const paths=[process.env.MWC_BROWSER_PATH,chromium.executablePath(),process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':null,process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':null].filter(Boolean);
 for(const executablePath of paths)try{await access(executablePath);return {headless:true,executablePath};}catch{}
 throw Error('Browser missing. Run npx playwright install chromium, or set MWC_BROWSER_PATH to a Chromium executable.');
}
export async function verify({id,variant='both',output}={}){
 if(!['broken','fixed','both'].includes(variant))throw Error('Invalid variant');
 const cases=id?[getCase(id)]:catalog.cases;
 await buildSite();
 let browser;
 const at=new Date().toISOString(),directory=path.resolve(output||path.join(root,'artifacts/runs',at.replace(/[:.]/g,'-')));
 await mkdir(directory,{recursive:true});
 const report={schemaVersion:'0.1',at,pilot:true,provenance:catalog.provenance,environment:{os:os.platform(),osRelease:os.release(),architecture:os.arch(),node:process.version,browser:null,emulation:'Chromium viewport and CDP touch input; no physical iOS/Android claim'},packages:{},sourceHashes:{},runs:[],summary:{checks:0,expectedOutcomes:0,unexpectedOutcomes:0,errors:0}};
 Object.assign(report,await currentEvidenceInputs());
 const server=await startServer();
 try{
  browser=await chromium.launch(await browserOptions());report.environment.browser=browser.version();
  for(const item of cases)for(const viewport of [{width:360,height:640},{width:390,height:844}])for(const mode of variant==='both'?['broken','fixed']:[variant]){
   const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1});
   const record={caseId:item.id,stack:item.stack,variant:mode,viewport,behaviorPassed:null,expectedBehaviorPass:mode==='fixed',matchesExpected:false,status:'error',observations:null,pageErrors:[],blockedRequests:[]};
   try{
    await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===server.origin)return route.continue();record.blockedRequests.push(url.origin);return route.abort();});
    const page=await context.newPage();page.on('pageerror',error=>record.pageErrors.push(error.message));
    await page.goto(`${server.origin}/fixtures/${item.id}/?variant=${mode}`,{waitUntil:'load'});
    await page.waitForFunction(()=>document.documentElement.dataset.fixtureReady==='true',null,{timeout:15000});
    const result=await checks[item.id](page);
    record.observations=result.observations;
    if(record.pageErrors.length||record.blockedRequests.length)throw Error('Fixture runtime or unexpected network error');
    record.behaviorPassed=result.passed;
    record.matchesExpected=result.passed===record.expectedBehaviorPass;
    record.status=record.matchesExpected?'expected':'unexpected';
    const file=`${item.id}-${mode}-${viewport.width}x${viewport.height}.png`;
    const screenshot=await page.screenshot({path:path.join(directory,file)});
    record.screenshot={file,sha256:sha256(screenshot)};
   }catch(error){record.error=error.message;record.status='error';}
   finally{await context.close();}
   report.runs.push(record);
  }
 }finally{await browser?.close();await server.close();}
 report.summary={checks:report.runs.length,expectedOutcomes:report.runs.filter(r=>r.status==='expected').length,unexpectedOutcomes:report.runs.filter(r=>r.status==='unexpected').length,errors:report.runs.filter(r=>r.status==='error').length};
 report.success=report.summary.checks>0&&report.summary.unexpectedOutcomes===0&&report.summary.errors===0;
 await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
 return {directory,...report};
}
