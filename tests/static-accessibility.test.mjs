import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {promisify} from 'node:util';
import {createServer} from 'node:http';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {auditStaticAccessibility,runAccessibilityWorker,accessibilitySchema} from '../src/static-accessibility.mjs';
import {prepareOfflineHtml} from '../src/static-accessibility-engine.mjs';
import {startApi} from '../src/api.mjs';
import {version} from '../src/version.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),exec=promisify(execFile);
let executable=process.env.REPROLEAF_BROWSER_EXECUTABLE;
if(!executable&&process.platform==='win32'&&existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe'))executable='C:/Program Files/Google/Chrome/Application/chrome.exe';
if(!executable)try{executable=(await import('playwright')).chromium.executablePath();}catch{}
const available=Boolean(executable&&existsSync(executable));if(available)process.env.REPROLEAF_BROWSER_EXECUTABLE=executable;
const doc=(body,locale='en',style='')=>`<!doctype html><html lang="${locale}"><head><title>Fixture</title><style>${style}</style></head><body><main><h1>Fixture</h1>${body}</main></body></html>`;
const run=(html,locale='en')=>auditStaticAccessibility({html,locale,allowBrowser:true});
const has=(report,id)=>report.violations.some(item=>item.id===id);

test('the pinned MPL dependency retains exact unmodified upstream license files',async()=>{
 const pkg=JSON.parse(await readFile(new URL('../node_modules/axe-core/package.json',import.meta.url),'utf8'));assert.equal(pkg.version,'4.14.0');assert.equal(pkg.license,'MPL-2.0');
 for(const name of ['LICENSE','LICENSE-3RD-PARTY.txt'])assert.deepEqual(await readFile(new URL('../src/vendor/axe-core/'+name,import.meta.url)),await readFile(new URL('../node_modules/axe-core/'+name,import.meta.url)));
});

test('browser execution requires literal opt-in and rejects extra path/URL/runtime fields before fork',async()=>{
 for(const allowBrowser of [undefined,false,'true',1])await assert.rejects(()=>auditStaticAccessibility({html:doc('<p>Test</p>'),allowBrowser}));
 for(const key of ['url','file','executablePath','timeoutMs'])assert.equal(accessibilitySchema.safeParse({html:'x',allowBrowser:true,[key]:'private'}).success,false);
 await assert.rejects(()=>run('Ж'.repeat(270000)),/AXE_HTML_BYTES/);await assert.rejects(()=>run(' '),/AXE_HTML_EMPTY/);
});
test('bounded sanitizer rejects nested active documents, refresh and overly complex HTML',()=>{
 for(const html of ['<iframe>','<object>','<embed>','<base href="https://private.example">','<meta http-equiv=refresh content=0>','<template shadowrootmode=open>'])assert.throws(()=>prepareOfflineHtml(html),/AXE_EMBEDDED_DOCUMENT_UNSUPPORTED|AXE_REFRESH_UNSUPPORTED/);
 assert.throws(()=>prepareOfflineHtml('<i>'.repeat(70)+'x'+'</i>'.repeat(70)),/AXE_HTML_COMPLEX/);
});
for(const locale of ['en','ru'])test('actual isolated DOM '+locale+' form, ARIA and contrast before/after',{skip:!available},async()=>{
 const bad=await run(doc('<input id="secret-owner@example.org"><button aria-expanded="PRIVATE_VALUE">Go</button><p>Contrast text</p>',locale,'p{color:#ccc;background:#fff;font-size:16px}'),locale);
 for(const id of ['label','aria-valid-attr-value','color-contrast'])assert(has(bad,id),id);
 assert.equal(bad.status,'completed-transformed-static-dom');assert.equal(bad.scope.originalSiteConformanceEstablished,false);assert.equal(bad.scope.osNetworkIsolationEstablished,false);assert.equal(bad.scope.javascriptEnabled,true);
 assert.deepEqual(bad.runner,{name:'Reproleaf',version,policy:'sanitized-static-dom-v1',documentationUrl:'https://evolkov.tech/tools/reproleaf-methodology'});
 const encoded=JSON.stringify(bad);assert(!encoded.includes('secret-owner@example.org'));assert(!encoded.includes('PRIVATE_VALUE'));
 const fixed=await run(doc('<label for=x>Label</label><input id=x><button aria-expanded=false>Go</button><p>Contrast text</p>',locale,'p{color:#000;background:#fff;font-size:16px}'),locale);
 for(const id of ['label','aria-valid-attr-value','color-contrast'])assert.equal(has(fixed,id),false,id);
 for(const rule of [...bad.violations,...bad.incomplete]){assert.equal(Object.hasOwn(rule,'html'),false);assert.equal(Object.hasOwn(rule,'failureSummary'),false);for(const p of rule.paths)assert(p===null||/^html(?: > \*:nth-child\(\d+\))*$/.test(p));}
 assert(!bad.passes.some(item=>['document-title','image-alt'].includes(item.id)));assert.equal(bad.scope.delegatedChecks.length,2);
});
test('isolated child rejects source execution and network resources without leaking source canaries',{skip:!available},async()=>{
 let hits=0;const server=createServer((req,res)=>{hits++;res.end('unexpected');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
 try{const result=await run(doc(`<script>window.__untrustedExecuted=1;fetch('${url}/script')</script><svg onload="window.__untrustedExecuted=2"><script>window.__untrustedExecuted=3</script></svg><p onclick="window.__untrustedExecuted=4">PRIVATE_BODY_CANARY</p><img src="${url}/image" onerror="window.__untrustedExecuted=5"><input id=private-name autofocus onfocus="window.__untrustedExecuted=6"><a href="javascript:window.__untrustedExecuted=7">Link</a>`,'en',`@import url('${url}/css');body{background-image:url('${url}/bg')}`));assert.equal(hits,0);assert.equal(result.isolationSignals.attackExecuted,null);assert.equal(result.isolationSignals.handlerAttributes,0);assert.equal(result.isolationSignals.scriptElements,0);assert(!JSON.stringify(result).includes(url));assert(!JSON.stringify(result).includes('PRIVATE_BODY_CANARY'));}finally{await new Promise(resolve=>server.close(resolve));}
});
test('one active browser worker per local process; timeout clears owned worker and next run works',{skip:!available},async()=>{
 const first=run(doc('<input>'));await assert.rejects(()=>run(doc('<input>')),/AXE_BROWSER_BUSY/);await first;
 const started=Date.now();await assert.rejects(()=>runAccessibilityWorker({html:doc('<input>'),locale:'en',allowBrowser:true},{wallTimeoutMs:1}),/AXE_WALL_TIMEOUT/);assert(Date.now()-started<8000);assert.equal((await run(doc('<p>After timeout</p>'))).status,'completed-transformed-static-dom');
});
test('missing browser fails unavailable, never returns an empty successful report',async()=>{
 const previous=process.env.REPROLEAF_BROWSER_EXECUTABLE;process.env.REPROLEAF_BROWSER_EXECUTABLE=path.join(tmpdir(),'reproleaf-browser-not-installed-20261116');
 try{await assert.rejects(()=>run(doc('<input>')),/AXE_BROWSER_UNAVAILABLE/);}finally{if(previous===undefined)delete process.env.REPROLEAF_BROWSER_EXECUTABLE;else process.env.REPROLEAF_BROWSER_EXECUTABLE=previous;}
});
test('hard parent deadline after actual browser start confirms the owned Chrome process is gone',{skip:!available},async()=>{
 const original=childProcess.fork;let browserPid=null;
 childProcess.fork=(...args)=>{const child=original(...args);child.on('message',message=>{if(message?.type==='owned-browser'&&message.pid)browserPid=message.pid;});return child;};syncBuiltinESMExports();
 try{
  const started=Date.now();await assert.rejects(()=>runAccessibilityWorker({html:doc('<input>'.repeat(1800)),locale:'en',allowBrowser:true},{wallTimeoutMs:1200}),/AXE_WALL_TIMEOUT/);
  assert(Number.isSafeInteger(browserPid)&&browserPid>0,'test must reach the real browser stage');assert(Date.now()-started<8000);
  assert.throws(()=>process.kill(browserPid,0),error=>error.code==='ESRCH');
 }finally{childProcess.fork=original;syncBuiltinESMExports();}
});
test('an abruptly lost local parent triggers owned worker browser cleanup',{skip:!available},async()=>{
 const program=`import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';const original=cp.fork;cp.fork=(...args)=>{const child=original(...args);console.log(JSON.stringify({worker:child.pid}));child.on('message',message=>{if(message?.type==='owned-browser'&&message.pid)console.log(JSON.stringify({browser:message.pid}));});return child;};syncBuiltinESMExports();const {auditStaticAccessibility}=await import('./src/static-accessibility.mjs');await auditStaticAccessibility({html:${JSON.stringify(doc('<input>'.repeat(1800)))},locale:'en',allowBrowser:true}).catch(()=>{});`;
 const parent=childProcess.spawn(process.execPath,['--input-type=module','-e',program],{cwd:root,env:process.env,stdio:['ignore','pipe','ignore'],windowsHide:true});let workerPid,browserPid,text='';
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('fixture did not start its browser')),8000);parent.stdout.on('data',chunk=>{text+=chunk;for(const line of text.split('\n'))try{const item=JSON.parse(line);if(item.worker)workerPid=item.worker;if(item.browser){browserPid=item.browser;clearTimeout(timer);resolve();}}catch{}});});
  parent.kill('SIGKILL');
  const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
  for(let i=0;i<60&&(alive(workerPid)||alive(browserPid));i++)await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(alive(workerPid),false);assert.equal(alive(browserPid),false);
 }finally{
  parent.kill('SIGKILL');
  for(const pid of [browserPid,workerPid].filter(Number.isSafeInteger))try{if(process.platform==='win32')await exec('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,timeout:2000});else process.kill(pid,'SIGKILL');}catch{}
 }
});
test('CLI requires opt-in, bounds file input and writes actual sanitized JSON report',{skip:!available},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'reproleaf-a11y-'));try{
  const file=path.join(dir,'private-input.html'),output=path.join(dir,'report.json');await writeFile(file,doc('<input id="CLI_PRIVATE_CANARY">'));
  await assert.rejects(()=>exec(process.execPath,['src/cli.mjs','accessibility-audit','--file',file],{cwd:root}));
  const result=await exec(process.execPath,['src/cli.mjs','accessibility-audit','--file',file,'--allow-browser','--locale','ru','--output',output],{cwd:root,env:process.env,maxBuffer:2097152});const report=JSON.parse(await readFile(output,'utf8'));assert.equal(report.locale,'ru');assert(has(report,'label'));assert(!result.stdout.includes('CLI_PRIVATE_CANARY'));assert(!JSON.stringify(report).includes(file));
  await writeFile(file,'x'.repeat(524289));await assert.rejects(()=>exec(process.execPath,['src/cli.mjs','accessibility-audit','--file',file,'--allow-browser'],{cwd:root}),error=>error.stderr.includes('AXE_HTML_BYTES'));
  await writeFile(file,Buffer.from([0xff,0xfe,0x41]));await assert.rejects(()=>exec(process.execPath,['src/cli.mjs','accessibility-audit','--file',file,'--allow-browser'],{cwd:root}),error=>error.stderr.includes('AXE_UTF8_REQUIRED'));
 }finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(tmpdir()));assert.match(path.basename(dir),/^reproleaf-a11y-/);await rm(dir,{recursive:true,force:true});}
});
for(const publicMode of [true,false])test('actual stdio '+(publicMode?'restricted denies':'local executes opt-in'),{skip:!available},async()=>{
 const client=new Client({name:'static-accessibility-test',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'src/mcp.mjs')],cwd:root,env:{PATH:process.env.PATH,REPROLEAF_PUBLIC_MCP:publicMode?'1':'0',REPROLEAF_BROWSER_EXECUTABLE:executable},stderr:'pipe'});
 try{await client.connect(transport);const tools=(await client.listTools()).tools;assert.equal(tools.length,publicMode?44:51);assert.equal(tools.some(x=>x.name==='audit_static_accessibility'),!publicMode);
  const args={html:doc('<input id="STDIO_PRIVATE_CANARY">'),allowBrowser:true,locale:'en'};
  if(publicMode)await assert.rejects(()=>client.callTool({name:'audit_static_accessibility',arguments:args}));else{const denied=await client.callTool({name:'audit_static_accessibility',arguments:{html:args.html}});assert.equal(denied.isError,true);const result=await client.callTool({name:'audit_static_accessibility',arguments:args});assert(!result.isError);const report=JSON.parse(result.content[0].text);assert(has(report,'label'));assert(!JSON.stringify(report).includes('STDIO_PRIVATE_CANARY'));}
 }finally{await client.close();}
});
test('public HTTP list and calls never expose or execute the browser tool',async()=>{
 const api=await startApi({port:0,aiOptions:{envPath:'missing-static-accessibility.env',enabled:false,apiKey:'',model:'',dailyBudgetUsd:0,inputPricePerMillion:0,outputPricePerMillion:0}}),client=new Client({name:'static-accessibility-public-test',version:'1'});
 try{await client.connect(new StreamableHTTPClientTransport(new URL(api.url+'/v1/mcp')));const tools=(await client.listTools()).tools;assert.equal(tools.length,46);assert.equal(tools.some(x=>x.name==='audit_static_accessibility'),false);await assert.rejects(()=>client.callTool({name:'audit_static_accessibility',arguments:{html:doc('<input>'),allowBrowser:true}}),/Unknown or restricted tool/);}finally{await client.close();await api.close();}
});
