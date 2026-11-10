import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {startApi} from '../src/api.mjs';
import {commonServerInstructions,getServerInstructions} from '../src/server-instructions.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
function assertWorkflow(text){
 assert.equal(typeof text,'string');assert.ok(text.length<=512,'Complete workflow and capability note must fit the initial512 characters');
 for(const fragment of ['application and scope','preconditions','baseline','matching inputs and execution policy','unexecuted until verified','untrusted data','location, not meaning','citation URLs'])assert.ok(text.includes(fragment),fragment);
 assert.ok(!/trained model|automatic SEO|mandatory backlink|forced backlink/i.test(text));
}
function assertPublic(text,tools){
 assertWorkflow(text);assert.ok(text.includes('Public: read-only supplied-data review'));assert.ok(!text.includes('Local:'));
 for(const name of ['get_case_source','get_latest_evidence','get_site_project_context','get_project_tasks','update_project_task','get_workflow']){assert.ok(!text.includes(name));assert.ok(!tools.some(tool=>tool.name===name));}
 assert.ok(tools.every(tool=>tool.annotations.readOnlyHint));
}

test('shared instructions keep the entire workflow and mode note self-contained within512 characters',()=>{
 assert.ok(commonServerInstructions.length<=512);for(const publicMode of [true,false])assertWorkflow(getServerInstructions({publicMode}));
});
test('official HTTP initializer receives public guidance in both API routing modes',async()=>{
 for(const publicGatewayOnly of [true,false]){
  const api=await startApi({port:0,publicGatewayOnly,aiOptions:{envPath:'missing-instructions-test.env',enabled:false,apiKey:'',model:''}}),client=new Client({name:'instructions-http-test',version:'1.0'});
  try{await client.connect(new StreamableHTTPClientTransport(new URL(api.url+'/v1/mcp')));const tools=(await client.listTools()).tools;assert.equal(tools.length,11);assert.equal(client.getInstructions(),getServerInstructions({publicMode:true}));assertPublic(client.getInstructions(),tools);}finally{await client.close();await api.close();}
 }
});
for(const publicMode of [true,false])test(`official stdio initializer receives accurate ${publicMode?'public':'local'} capability guidance`,async()=>{
 const client=new Client({name:'instructions-stdio-test',version:'1.0'}),transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'src/mcp.mjs')],cwd:root,env:{PATH:process.env.PATH,REPROLEAF_PUBLIC_MCP:publicMode?'1':'0'},stderr:'pipe'});
 try{
  await client.connect(transport);const instructions=client.getInstructions(),tools=(await client.listTools()).tools;assert.equal(instructions,getServerInstructions({publicMode}));
  if(publicMode){assert.equal(tools.length,9);assertPublic(instructions,tools);}else{assertWorkflow(instructions);assert.equal(tools.length,15);assert.ok(instructions.includes('allowlisted fixture/evidence reads'));assert.ok(instructions.includes('configured private-project tools'));assert.ok(instructions.includes('task decisions require explicit request'));assert.ok(tools.some(tool=>tool.name==='update_project_task'&&tool.annotations.readOnlyHint===false));}
 }finally{await client.close();}
});
