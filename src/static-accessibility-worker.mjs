import {execFile} from 'node:child_process';
let browserPid=null,completed=false;
process.once('disconnect',()=>{
 if(completed)return;
 if(!browserPid)process.exit(1);
 if(process.platform==='win32')execFile('taskkill.exe',['/PID',String(browserPid),'/T','/F'],{windowsHide:true,timeout:5000},()=>process.exit(1));
 else{try{process.kill(-browserPid,'SIGKILL');}catch{}process.exit(1);}
});
// Only the local opt-in controller starts this bounded worker. Never a URL fetcher.
process.once('message',async input=>{
 let packet;
 try{
  const {inspectOfflineHtml}=await import('./static-accessibility-engine.mjs');
  const result=await inspectOfflineHtml({html:input.html,locale:input.locale,onBrowserProcess:pid=>{browserPid=pid;if(process.connected)process.send?.({type:'owned-browser',pid},()=>{});}});
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>2097152)throw Error('AXE_OUTPUT_LIMIT');
  packet={result};
 }catch(error){packet={error:typeof error?.message==='string'&&/^AXE_[A-Z_]+$/.test(error.message)?error.message:'AXE_EXECUTION_FAILED'};}
 if(process.connected)process.send?.(packet,()=>{completed=true;if(process.connected)process.disconnect();});
});
