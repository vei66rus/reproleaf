import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {getProjectTasks,updateProjectTask} from '../src/site-project.mjs';
import {createServer} from '../src/mcp.mjs';
import {startApi} from '../src/api.mjs';

const jobId='54fc8de9-5cb7-4d7f-8bed-201d5b061410',token='a'.repeat(64),key='a'.repeat(64);
const env={REPROLEAF_SITE_ENDPOINT:'https://evolkov.tech/wp-json/evolkov/v1/reproleaf-crawl',REPROLEAF_SITE_PROJECT_TOKEN:token,REPROLEAF_SITE_JOB_ID:jobId};
const task=()=>({key,url:'https://example.org/a?private=1',code:'html-title',severity:'attention',observedState:'observed',decision:'todo',note:`Review ${token}`,message:'Missing title',suggestion:'Supply a descriptive title',firstSeen:'2026-11-09 10:00:00 UTC',lastSeen:'2026-11-09 11:00:00 UTC',firstJobId:jobId,lastJobId:jobId,lastEvidence:{jobId,scanRecordId:null,checkStatus:'attention'},private:token});
const list=tasks=>({ok:true,scope:'private-project-history',tasks,total:tasks.length,limit:500,truncated:false});
const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const code=expected=>error=>error.code===expected&&!error.message.includes(token);
test('task reads use header authentication and GET only, preserve observed state and redact notes',async()=>{
 const requests=[];
 const result=await getProjectTasks({},{env,fetchImpl:async(url,options)=>{requests.push({url,...options});return json(list([task()]));}});
 assert.equal(requests.length,1);assert.equal(requests[0].method,'GET');assert.equal(requests[0].url,`${env.REPROLEAF_SITE_ENDPOINT}/${jobId}/tasks`);assert.equal(requests[0].headers['X-Reproleaf-Project-Token'],token);assert.equal(requests[0].redirect,'manual');assert.equal(requests[0].body,undefined);
 assert.equal(result.tasks[0].observedState,'observed');assert.equal(result.tasks[0].decision,'todo');assert.equal(result.total,1);assert.equal(result.tasks[0].url,'https://example.org/a');assert.doesNotMatch(JSON.stringify(result),new RegExp(token));assert.equal(result.tasks[0].private,undefined);assert.equal(result.tasks[0].noteRedacted,true);
});

test('full1000-codepoint astral notes and multiline whitespace survive reads and intentional replacements',async()=>{
 const astral='\u{1D11E}'.repeat(1000);
 assert.equal([...astral].length,1000);assert.equal(astral.length,2000);
 const read=await getProjectTasks({jobId},{env,fetchImpl:async()=>json(list([{...task(),note:astral}]))});assert.equal(read.tasks[0].note,astral);assert.equal(read.tasks[0].noteRedacted,false);
 const replaced=await updateProjectTask({jobId,key,decision:'doing',note:astral},{env,fetchImpl:async(_,options)=>{assert.equal(JSON.parse(options.body).note,astral);return json({ok:true,task:{...task(),decision:'doing',note:astral}});}});assert.equal(replaced.task.note,astral);
 const multiline='First line\nSecond line\r\n\tIndented line';
 const preserved=await getProjectTasks({jobId},{env,fetchImpl:async()=>json(list([{...task(),note:multiline}]))});assert.equal(preserved.tasks[0].note,multiline);
 await assert.rejects(updateProjectTask({jobId,key,decision:'todo',note:astral+'\u{1D11E}'},{env,fetchImpl:async()=>{throw Error('Must not fetch an oversized note');}}));
});

test('decision-only updates omit note and preserve a full stored note without round-tripping redacted text',async()=>{
 const stored=`Private ${token}\nRetain this note\tand tab`,requests=[];
 const displayed=await getProjectTasks({jobId},{env,fetchImpl:async()=>json(list([{...task(),note:stored}]))});assert.equal(displayed.tasks[0].noteRedacted,true);assert.notEqual(displayed.tasks[0].note,stored);
 const updated=await updateProjectTask({jobId,key,decision:'deferred'},{env,fetchImpl:async(_,options)=>{requests.push(JSON.parse(options.body));return json({ok:true,task:{...task(),decision:'deferred',note:stored}});}});
 assert.deepEqual(requests,[{key,decision:'deferred'}]);assert.equal(Object.hasOwn(requests[0],'note'),false);assert.equal(JSON.stringify(requests).includes('[redacted]'),false);assert.equal(updated.task.noteRedacted,true);assert.equal(updated.task.note,displayed.tasks[0].note);
});

test('an explicitly empty replacement clears a note while an omitted note stays absent in MCP input requirements',async()=>{
 const cleared=await updateProjectTask({key,decision:'todo',note:''},{env,fetchImpl:async(_,options)=>{assert.deepEqual(JSON.parse(options.body),{key,decision:'todo',note:''});return json({ok:true,task:{...task(),note:''}});}});assert.equal(cleared.task.note,'');assert.equal(cleared.task.noteRedacted,false);
 const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair(),server=createServer({publicMode:false,siteProjectOptions:{env}}),client=new Client({name:'optional-note-contract',version:'1.0.0'});
 try{await server.connect(serverTransport);await client.connect(clientTransport);const tool=(await client.listTools()).tools.find(item=>item.name==='update_project_task');assert.equal(tool.inputSchema.required.includes('note'),false);}finally{await client.close();await server.close();}
});
test('task list caps output at100 without losing total or truncation',async()=>{
 const tasks=Array.from({length:105},(_,index)=>({...task(),key:index.toString(16).padStart(64,'0')}));
 const result=await getProjectTasks({jobId},{env,fetchImpl:async()=>json(list(tasks))});assert.equal(result.tasks.length,100);assert.equal(result.total,105);assert.equal(result.truncated,true);
});
test('explicit decisions send exactly the requested JSON fields and cannot resolve observed evidence',async()=>{
 const note='Отложить до следующего запуска.\nПроверить title.',decision='deferred',requests=[];
 const result=await updateProjectTask({jobId,key,decision,note},{env,fetchImpl:async(url,options)=>{requests.push({url,...options});return json({ok:true,task:{...task(),decision,note}});}});
 assert.equal(requests.length,1);assert.equal(requests[0].method,'POST');assert.equal(requests[0].headers['Content-Type'],'application/json');assert.equal(requests[0].headers['X-Reproleaf-Project-Token'],token);assert.deepEqual(JSON.parse(requests[0].body),{key,decision,note});assert.equal(result.task.decision,'deferred');assert.equal(result.task.observedState,'observed');assert.match(result.limits.join(' '),/do not change observed evidence/);
});
test('unknown fields, resolution requests, oversized notes and unsafe targets fail before any request',async()=>{
 let calls=0;const options={env,fetchImpl:async()=>{calls++;return json(list([]));}};
 for(const input of [{jobId,key,decision:'resolved',note:''},{jobId,key:'x',decision:'todo',note:''},{jobId,key,decision:'todo',note:'x'.repeat(1001)},{jobId,key,decision:'todo',note:'bad\0note'},{jobId,key,decision:'todo',note:'',url:'https://attacker.org/'},{jobId,key,decision:'todo',note:'',observedState:'not-observed'}])await assert.rejects(updateProjectTask(input,options));
 await assert.rejects(getProjectTasks({jobId,url:'https://attacker.org/'},options));assert.equal(calls,0);
});
test('task mutations never follow redirects or retry uncertain timeouts and sanitize upstream errors',async()=>{
 let calls=0;
 await assert.rejects(updateProjectTask({key,decision:'doing',note:''},{env,fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://attacker.org/steal'}});}}),code('RL_SITE_REDIRECT_REJECTED'));assert.equal(calls,1);
 calls=0;await assert.rejects(updateProjectTask({key,decision:'doing',note:''},{env,timeoutMs:10,fetchImpl:async()=>{calls++;return new Promise(()=>{});}}),code('RL_SITE_TIMEOUT'));assert.equal(calls,1);
 await assert.rejects(getProjectTasks({jobId},{env,fetchImpl:async()=>{throw Error(`Upstream secret ${token}`);}}),code('RL_SITE_REQUEST_FAILED'));
 await assert.rejects(getProjectTasks({jobId},{env,maxBytes:32,fetchImpl:async()=>json(list([task()]))}),code('RL_SITE_BODY_TOO_LARGE'));
});
test('invalid task responses and mismatched decision receipts are not accepted',async()=>{
 await assert.rejects(getProjectTasks({jobId},{env,fetchImpl:async()=>json({ok:true,tasks:[task()]})}),code('RL_SITE_SCHEMA_INVALID'));
 await assert.rejects(updateProjectTask({jobId,key,decision:'doing',note:'requested'},{env,fetchImpl:async()=>json({ok:true,task:{...task(),decision:'doing',note:'different'}})}),code('RL_SITE_SCHEMA_INVALID'));
});
test('public mode and gateway cannot access operator task credentials',async()=>{
 let calls=0;const options={env,publicMode:true,fetchImpl:async()=>{calls++;return json(list([]));}};
 await assert.rejects(getProjectTasks({jobId},options),code('RL_SITE_PRIVATE_TOOL'));await assert.rejects(updateProjectTask({key,decision:'todo',note:''},options),code('RL_SITE_PRIVATE_TOOL'));assert.equal(calls,0);
 const api=await startApi({port:0});try{
  const rpc=async(method,params)=>(await(await fetch(api.url+'/v1/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})).json());
  const names=(await rpc('tools/list',{})).result.tools.map(tool=>tool.name);assert.equal(names.includes('get_project_tasks'),false);assert.equal(names.includes('update_project_task'),false);assert.equal((await rpc('tools/call',{name:'update_project_task',arguments:{jobId,key,decision:'todo',note:''}})).error.code,-32601);
 }finally{await api.close();}
});
test('private MCP task tools declare mutation accurately and reads never invoke a write',async()=>{
 const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair(),methods=[];
 const server=createServer({publicMode:false,siteProjectOptions:{env,fetchImpl:async(_,options)=>{methods.push(options.method);if(options.method==='GET')return json(list([task()]));return json({ok:true,task:{...task(),...JSON.parse(options.body)}});}}}),client=new Client({name:'private-task-contract',version:'1.0.0'});
 try{
  await server.connect(serverTransport);await client.connect(clientTransport);const tools=(await client.listTools()).tools;
  assert.equal(tools.find(tool=>tool.name==='get_project_tasks').annotations.readOnlyHint,true);const mutation=tools.find(tool=>tool.name==='update_project_task');assert.equal(mutation.annotations.readOnlyHint,false);assert.equal(mutation.annotations.destructiveHint,false);
  const read=await client.callTool({name:'get_project_tasks',arguments:{}});assert.equal(JSON.parse(read.content[0].text).tasks.length,1);assert.deepEqual(methods,['GET']);
  const written=await client.callTool({name:'update_project_task',arguments:{key,decision:'dismissed',note:'Explicit operator choice'}});assert.equal(JSON.parse(written.content[0].text).task.observedState,'observed');assert.deepEqual(methods,['GET','POST']);
 }finally{await client.close();await server.close();}
});
