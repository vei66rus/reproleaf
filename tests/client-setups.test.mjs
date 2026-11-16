import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {clientSetups} from '../src/client-setups.mjs';
import {startApi} from '../src/api.mjs';

const entry=new URL('../src/mcp.mjs',import.meta.url);
const {fileURLToPath}=await import('node:url');
const entryPath=fileURLToPath(entry),root=fileURLToPath(new URL('..',import.meta.url));

test('client recipes separate proposed configuration from actual application verification',()=>{
 assert.equal(new Set(clientSetups.map(c=>c.id)).size,clientSetups.length);
 for(const c of clientSetups){
  assert.equal(c.verifiedLocalStdio,false,c.id);
  assert.ok(c.transportNote,c.id);
  assert.equal(c.clientVerification,c.connectionKind==='prompt-handoff'?'manual-handoff-only':'not-tested-in-client');
  assert.doesNotMatch(JSON.stringify(c),/\b(?:15|27|29|33)\s+(?:local\s+|read-only\s+)?tools|npx/);
 }
 const remote=clientSetups.find(c=>c.id==='windsurf');
 assert.equal(remote.connectionKind,'streamable-http-mcp');
 assert.equal(remote.name,'Windsurf');
 const config=JSON.parse(remote.configSnippet).mcpServers.reproleaf;
 assert.equal(config.serverUrl,'https://evolkov.tech/mcp/reproleaf');
 assert.equal(config.command,undefined);
});

for(const c of clientSetups.filter(c=>c.connectionKind==='stdio-mcp'))test(`${c.id} local node recipe discovers and calls a tool through the real stdio transport`,async()=>{
 let command,args;
 if(c.configSnippet.startsWith('{'))({command,args}=JSON.parse(c.configSnippet).mcpServers.reproleaf);
 else if(c.id==='codex'){
  command=/command = "([^"]+)"/.exec(c.configSnippet)?.[1];
  args=JSON.parse(/args = (\[[^\n]+\])/.exec(c.configSnippet)?.[1]);
 }else{
  assert.match(c.configSnippet,/^claude mcp add reproleaf -- node /);
  command='node';args=[c.configSnippet.split(' -- node ')[1]];
 }
 assert.equal(command,'node');assert.deepEqual(args,['/absolute/path/to/reproleaf/src/mcp.mjs']);
 const client=new Client({name:'configuration-recipe-check',version:'1.0'});
 try{
  await client.connect(new StdioClientTransport({command:process.execPath,args:[entryPath],cwd:root,env:{PATH:process.env.PATH,REPROLEAF_PUBLIC_MCP:'1'},stderr:'pipe'}));
  assert.ok((await client.listTools()).tools.some(t=>t.name==='list_workflows'));
  const result=await client.callTool({name:'list_workflows',arguments:{}});
  assert.notEqual(result.isError,true);assert.ok(JSON.parse(result.content.find(b=>b.type==='text').text));
 }finally{await client.close();}
});

test('public clients endpoint and MCP expose the same honest recipes',async()=>{
 const api=await startApi({port:0,aiOptions:{enabled:false,apiKey:'',envPath:'missing-client-recipes.env'}});
 const client=new Client({name:'configuration-http-check',version:'1.0'});
 try{
  const response=await(await fetch(api.url+'/v1/clients')).json();assert.deepEqual(response.clients,clientSetups);
  await client.connect(new StreamableHTTPClientTransport(new URL(api.url+'/v1/mcp')));
  const descriptor=(await client.listTools()).tools.find(t=>t.name==='get_client_setups');assert.doesNotMatch(descriptor.description,/Return verified/i);
  const result=await client.callTool({name:'get_client_setups',arguments:{}});
  assert.deepEqual(JSON.parse(result.content.find(b=>b.type==='text').text).clients,clientSetups);
 }finally{await client.close();await api.close();}
});

test('Smithery recipe requires the unpacked server path rather than an unpublished npm package',async()=>{
 const yaml=await readFile(new URL('../smithery.yaml',import.meta.url),'utf8');
 assert.match(yaml,/required: \[serverPath\]/);assert.doesNotMatch(yaml,/npx|reproleaf-mcp/);
 const body=/commandFunction: \|-\r?\n([\s\S]*?)\r?\nexampleConfig:/.exec(yaml)[1].split(/\r?\n/).map(l=>l.replace(/^    /,'')).join('\n');
 const build=Function(`return (${body})`)();
 assert.deepEqual(build({serverPath:entryPath}),{command:'node',args:[entryPath]});
});
