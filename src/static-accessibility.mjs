import {fork} from 'node:child_process';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {version} from './version.mjs';

export const accessibilitySchema=z.object({html:z.string().min(1).max(524288),locale:z.enum(['en','ru']).default('en'),allowBrowser:z.literal(true)}).strict();
const MAX_BYTES=524288,MAX_OUTPUT=2097152;
let active=false,cleanupFailed=false;
const allowedErrors=new Set(['AXE_HTML_EMPTY','AXE_HTML_BYTES','AXE_HTML_COMPLEX','AXE_EMBEDDED_DOCUMENT_UNSUPPORTED','AXE_REFRESH_UNSUPPORTED','AXE_HTML_STRUCTURE','AXE_BROWSER_UNAVAILABLE','AXE_WALL_TIMEOUT','AXE_INJECTION_FAILED','AXE_RUN_FAILED','AXE_ISOLATION_FAILED','AXE_EXECUTION_FAILED','AXE_CLEANUP_FAILED','AXE_DEPENDENCY_DRIFT','AXE_SOURCE_HASH_DRIFT']);

function workerEnvironment(){
 const env={};for(const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','DISPLAY','XDG_RUNTIME_DIR','PLAYWRIGHT_BROWSERS_PATH','REPROLEAF_BROWSER_EXECUTABLE'])if(process.env[key]!==undefined)env[key]=process.env[key];return env;
}

async function terminateOwnedWorker(child,browserPid){
 if(!Number.isSafeInteger(child.pid)||child.pid<1)return;
 if(process.platform==='win32'){
  if(browserPid)await new Promise(resolve=>execFile('taskkill.exe',['/PID',String(browserPid),'/T','/F'],{windowsHide:true,timeout:5000},()=>resolve()));
  if(child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>execFile('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:5000},()=>resolve()));
 }
 else{if(browserPid)try{process.kill(-browserPid,'SIGKILL');}catch{}try{process.kill(-child.pid,'SIGKILL');}catch{}try{child.kill('SIGKILL');}catch{}}
 if(child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{const timer=setTimeout(resolve,500);child.once('exit',()=>{clearTimeout(timer);resolve();});});
 if(child.exitCode===null&&child.signalCode===null)throw Error('AXE_CLEANUP_FAILED');
 if(browserPid){
  const alive=()=>{try{process.kill(browserPid,0);return true;}catch(error){return error.code!=='ESRCH';}};
  for(let attempt=0;attempt<10&&alive();attempt++)await new Promise(resolve=>setTimeout(resolve,50));
  if(alive())throw Error('AXE_CLEANUP_FAILED');
 }
}

// Internal worker boundary; the public local tool always uses the fixed deadline.
export async function runAccessibilityWorker(input,{wallTimeoutMs=20000}={}){
 input=accessibilitySchema.parse(input);
 if(!input.html.trim())throw Error('AXE_HTML_EMPTY');
 if(Buffer.byteLength(input.html,'utf8')>MAX_BYTES)throw Error('AXE_HTML_BYTES');
 if(!Number.isSafeInteger(wallTimeoutMs)||wallTimeoutMs<1||wallTimeoutMs>20000)throw Error('AXE_TIMEOUT_OPTION');
 if(cleanupFailed)throw Error('AXE_CLEANUP_FAILED');
 if(active)throw Error('AXE_BROWSER_BUSY');active=true;
 try{return await new Promise((resolve,reject)=>{
  let packet=null,settled=false,timedOut=false,browserPid=null;const started=Date.now();
  const child=fork(fileURLToPath(new URL('./static-accessibility-worker.mjs',import.meta.url)),[],{execArgv:['--max-old-space-size=128'],env:workerEnvironment(),stdio:['ignore','ignore','ignore','ipc'],detached:process.platform!=='win32',windowsHide:true,serialization:'json'});
  const finish=(error,result)=>{if(settled)return;settled=true;if(error?.message==='AXE_CLEANUP_FAILED')cleanupFailed=true;clearTimeout(timer);for(const [signal,handler] of signalHandlers)process.removeListener(signal,handler);error?reject(error):resolve(result);};
  const signalHandlers=['SIGINT','SIGTERM'].map(signal=>{const handler=async()=>{timedOut=true;let error=Error('AXE_CANCELLED');try{await terminateOwnedWorker(child,browserPid);}catch{error=Error('AXE_CLEANUP_FAILED');}finish(error);process.kill(process.pid,signal);};process.once(signal,handler);return [signal,handler];});
  const timer=setTimeout(async()=>{timedOut=true;try{await terminateOwnedWorker(child,browserPid);finish(Error('AXE_WALL_TIMEOUT'));}catch{finish(Error('AXE_CLEANUP_FAILED'));}},wallTimeoutMs);
  child.once('error',()=>{void terminateOwnedWorker(child,browserPid).then(()=>finish(Error('AXE_WORKER_UNAVAILABLE')),()=>finish(Error('AXE_CLEANUP_FAILED')));});
  child.on('message',message=>{
   if(message?.type==='owned-browser'){if(message.pid===null||Number.isSafeInteger(message.pid)&&message.pid>0)browserPid=message.pid;return;}
   if(packet!==null)return;
   try{if(Buffer.byteLength(JSON.stringify(message),'utf8')>MAX_OUTPUT)throw Error();packet=message;}catch{void terminateOwnedWorker(child,browserPid).then(()=>finish(Error('AXE_OUTPUT_LIMIT')),()=>finish(Error('AXE_CLEANUP_FAILED')));}
  });
  child.once('exit',async(code)=>{if(timedOut)return;try{if(browserPid)await terminateOwnedWorker(child,browserPid);}catch{return finish(Error('AXE_CLEANUP_FAILED'));}if(code!==0||!packet)return finish(Error('AXE_WORKER_FAILED'));if(packet.error)return finish(Error(allowedErrors.has(packet.error)?packet.error:'AXE_EXECUTION_FAILED'));if(!packet.result||packet.result.status!=='completed-transformed-static-dom')return finish(Error('AXE_WORKER_FAILED'));packet.result.runner={name:'Reproleaf',version,policy:'sanitized-static-dom-v1',documentationUrl:'https://evolkov.tech/tools/reproleaf-methodology'};packet.result.executionBoundary={parentWorkDeadlineMs:wallTimeoutMs,maxCleanupBudgetMs:11000,workerHeapMiB:128,maxOutputBytes:MAX_OUTPUT,localProcessConcurrency:1,totalElapsedMs:Date.now()-started,cleanupCompleted:true};packet.result.observedAt=new Date().toISOString();if(Buffer.byteLength(JSON.stringify(packet.result),'utf8')>MAX_OUTPUT)return finish(Error('AXE_OUTPUT_LIMIT'));finish(null,packet.result);});
  child.send(input,error=>{if(error)void terminateOwnedWorker(child,browserPid).then(()=>finish(Error('AXE_WORKER_UNAVAILABLE')),()=>finish(Error('AXE_CLEANUP_FAILED')));});
 });}finally{active=false;}
}

export async function auditStaticAccessibility(input){
 return runAccessibilityWorker(input);
}
