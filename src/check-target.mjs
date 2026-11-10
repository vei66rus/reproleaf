import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {adapterSchema} from './adapter.mjs';
import {inspectPage} from './inspect-page.mjs';
import {root} from './catalog.mjs';
import {sha256} from './evidence.mjs';
export async function checkTarget({adapter:adapterPath,allowNetwork=false,output}={}){
 const bytes=await readFile(adapterPath);if(bytes.length>65536)throw Error('Adapter exceeds 64 KiB');
 const adapter=adapterSchema.parse(JSON.parse(bytes)),url=new URL(adapter.url);
 const loopback=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Use an HTTP(S) URL without embedded credentials');
 if(!loopback&&!allowNetwork)throw Error('Remote target needs explicit --allow-network. Private projects remain local.');
 const directory=path.resolve(output||path.join(root,'artifacts/targets',new Date().toISOString().replace(/[:.]/g,'-')));await mkdir(directory,{recursive:true});
 let executablePath=process.env.MWC_BROWSER_PATH||chromium.executablePath();try{await access(executablePath);}catch{if(process.platform==='win32')executablePath='C:/Program Files/Google/Chrome/Application/chrome.exe';}
 const executionProfile={schemaVersion:2,allowNetwork,methods:['GET','HEAD'],analyticsPolicy:'known-analytics-blocked-v1',isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',webSockets:'blocked'};
 const checkerSources=await Promise.all(['inspect-page.mjs','adapter.mjs','check-target.mjs'].map(file=>readFile(path.join(root,'src',file))));
 const report={schemaVersion:1,at:new Date().toISOString(),checkerSha256:sha256(Buffer.concat(checkerSources)),adapterSha256:sha256(bytes),browser:null,node:process.version,target:url.origin+url.pathname,targetStateSha256:sha256(url.href),requestedTarget:url.origin+url.pathname,requestedTargetStateSha256:sha256(url.href),viewport:adapter.viewport,initialViewport:adapter.viewport,executionProfile,networkMode:'HTTP GET/HEAD only; known analytics and WebSockets blocked. This routing policy is not a security sandbox; GET may mutate state and WebRTC is not covered.',results:[],runtimeErrors:[],blockedMethods:[],blockedTransports:[],excludedAnalyticsRequests:0,scope:'Adapter-driven observations on this page and environment, not universal bug detection or physical-device certification.'};
 const browser=await chromium.launch({headless:true,executablePath});
 try{
  report.browser=browser.version();const context=await browser.newContext({viewport:adapter.viewport,isMobile:executionProfile.isMobile,hasTouch:executionProfile.hasTouch,deviceScaleFactor:executionProfile.deviceScaleFactor,serviceWorkers:executionProfile.serviceWorkers});
  await context.route('**/*',route=>{const request=route.request(),target=new URL(request.url());
   if(/mc\.yandex\.|analytics\.ahrefs\.|google-analytics\.|googletagmanager\.|clarity\.ms/.test(target.hostname)){report.excludedAnalyticsRequests++;return route.abort();}
   if(!allowNetwork&&!['127.0.0.1','localhost','[::1]'].includes(target.hostname))return route.abort();
   if(!['GET','HEAD'].includes(request.method())){report.blockedMethods.push(request.method());return route.abort();}
   return route.continue();
  });
  await context.routeWebSocket('**/*',socket=>{
   if(!report.blockedTransports.includes('websocket'))report.blockedTransports.push('websocket');
   socket.close({code:1008,reason:'Adapter policy blocks WebSocket connections.'});
  });
  const page=await context.newPage();page.on('pageerror',error=>report.runtimeErrors.push(error.message));
  try{
   const response=await page.goto(url.href,{waitUntil:'load',timeout:45000});
   if(!response||response.status()>=400)throw Error('Target failed to load');
   for(const step of adapter.steps){
    if(step.action==='resize'){await page.setViewportSize({width:step.width,height:step.height});await page.waitForTimeout(150);continue;}
    if(step.action==='waitFor'){
     await page.locator(step.selector).waitFor({state:'visible',timeout:15000});
     if(await page.locator(step.selector).count()!==1)throw Error('Step selector is missing or ambiguous');
     continue;
    }
    if(await page.locator(step.selector).count()!==1)throw Error('Step selector is missing or ambiguous');
    if(step.action==='click')await page.locator(step.selector).click({timeout:10000});
    if(step.action==='focus')await page.locator(step.selector).evaluate(el=>{el.scrollIntoView({block:'nearest'});el.focus();});
    if(step.action==='scroll')await page.locator(step.selector).evaluate((el,edge)=>el.scrollTop=edge==='end'?el.scrollHeight:0,step.edge);
   }
   for(const check of adapter.checks)report.results.push({id:check.id,type:check.type,...await inspectPage(page,check)});
   const screenshot=await page.screenshot({path:path.join(directory,'page.png')});report.screenshot={file:'page.png',sha256:sha256(screenshot)};
  }catch(error){report.setupError=error.message;}
  finally{
   const effective=new URL(page.url());
   if(['http:','https:'].includes(effective.protocol)){report.target=effective.origin+effective.pathname;report.targetStateSha256=sha256(effective.href);}
   report.viewport=page.viewportSize()||adapter.viewport;
  }
  await context.close();
 }finally{await browser.close();}
 report.summary=Object.fromEntries(['pass','fail','unsupported','setup-error'].map(status=>[status,report.results.filter(r=>r.status===status).length]));
 report.executionComplete=!report.setupError&&report.runtimeErrors.length===0&&report.blockedMethods.length===0&&report.blockedTransports.length===0;
 report.success=report.results.length>0&&report.results.every(r=>r.status==='pass')&&report.executionComplete;
 await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');return {directory,...report};
}
