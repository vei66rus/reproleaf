import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {checkTarget} from '../src/check-target.mjs';
import {root} from '../src/catalog.mjs';
import {sha256} from '../src/evidence.mjs';
let server,origin,webSocketUpgrades=0,webSocketMessages=0;
const directory=path.join(root,'private/real-projects/critic/runner-tests',new Date().toISOString().replace(/[:.]/g,'-'));
const requests=[];
before(async()=>{
 await mkdir(directory,{recursive:true});
 server=createServer((req,res)=>{
  requests.push({url:req.url,method:req.method});
  if(req.url.startsWith('/redirect')){res.writeHead(302,{Location:'/actual?state=one#end'}).end();return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.url==='/delayed')res.end('<!doctype html><html><body><script>setTimeout(()=>{const b=document.createElement("button");b.id="ready";b.textContent="Continue";document.body.append(b)},350)</script></body></html>');
  else if(req.url==='/duplicate')res.end('<!doctype html><html><body><button class="ready">One</button><button class="ready">Two</button></body></html>');
  else if(req.url==='/post')res.end('<!doctype html><html><body><p>Network policy observation</p><script>fetch("/blocked-action",{method:"POST"}).catch(()=>{}).finally(()=>{document.body.dataset.ready="true"})</script></body></html>');
  else if(req.url==='/analytics')res.end('<!doctype html><html><body><p>Declared analytics exclusion</p><script>fetch("https://analytics.ahrefs.com/adapter-policy-probe",{method:"POST",body:"EXCLUDED_ANALYTICS_PROBE"}).catch(()=>{}).finally(()=>{document.body.dataset.ready="true"})</script></body></html>');
  else if(req.url==='/websocket')res.end(`<!doctype html><html><body><p>WebSocket policy observation</p><script>const ws=new WebSocket('ws://127.0.0.1:${server.address().port}/socket');const settled=()=>document.body.dataset.ready='true';ws.onopen=()=>ws.send('PROBE_FRAME');ws.onerror=settled;ws.onclose=settled;ws.onmessage=settled;</script></body></html>`);
  else res.end('<!doctype html><html><body><button id="ready">Continue</button></body></html>');
 });
 server.on('upgrade',(req,socket)=>{
  webSocketUpgrades++;socket.on('error',()=>{});const accept=createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  socket.on('data',bytes=>{if((bytes[0]&15)===1){webSocketMessages++;socket.write(Buffer.from([0x81,2,0x6f,0x6b]));}else if((bytes[0]&15)===8)socket.end(Buffer.from([0x88,0]));});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));});
async function run(name,changes={},options={}){
 const adapter={schemaVersion:1,url:origin+'/',viewport:{width:390,height:650},steps:[],checks:[{id:'overflow',type:'document-overflow'}],...changes};
 const file=path.join(directory,name+'.json');await writeFile(file,JSON.stringify(adapter,null,2));return checkTarget({adapter:file,output:path.join(directory,name),...options});
}
test('waitFor accepts a control inserted after initial document load',async()=>{
 const report=await run('delayed',{url:origin+'/delayed',steps:[{action:'waitFor',selector:'#ready'}],checks:[{id:'ready',type:'control',selector:'#ready'}]});
 assert.equal(report.setupError,undefined);assert.equal(report.results[0].status,'pass');assert.equal(report.success,true);
});
test('waitFor keeps duplicate selectors as a setup error',async()=>{
 const report=await run('duplicate',{url:origin+'/duplicate',steps:[{action:'waitFor',selector:'.ready'}]});
 assert.match(report.setupError,/strict mode|ambiguous/);assert.deepEqual(report.results,[]);assert.equal(report.success,false);
});
test('report retains requested scope but measures final redirect and resized viewport privately',async()=>{
 const report=await run('effective-environment',{url:origin+'/redirect?private-query=example#start',steps:[{action:'resize',width:390,height:900}]});
 assert.equal(report.requestedTarget,origin+'/redirect');assert.equal(report.target,origin+'/actual');assert.deepEqual(report.initialViewport,{width:390,height:650});assert.deepEqual(report.viewport,{width:390,height:900});
 assert.equal(report.targetStateSha256,sha256(origin+'/actual?state=one#end'));assert.equal(report.requestedTargetStateSha256,sha256(origin+'/redirect?private-query=example#start'));assert(!JSON.stringify(report).includes('private-query'));
 const screenshot=await readFile(path.join(report.directory,'page.png'));assert.equal(screenshot.readUInt32BE(16),390);assert.equal(screenshot.readUInt32BE(20),900);assert.equal(report.success,true);
});
test('execution profile describes network policy and retains blocked methods without sending POST',async()=>{
 const report=await run('network-policy',{url:origin+'/post',steps:[{action:'waitFor',selector:'body[data-ready]'}]});
 assert.deepEqual(report.executionProfile,{schemaVersion:2,allowNetwork:false,methods:['GET','HEAD'],analyticsPolicy:'known-analytics-blocked-v1',isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',webSockets:'blocked'});assert.deepEqual(report.blockedMethods,['POST']);assert.deepEqual(report.blockedTransports,[]);assert(!requests.some(r=>r.method==='POST'));assert.equal(report.setupError,undefined);assert.equal(report.results[0].status,'pass');assert.equal(report.executionComplete,false);assert.equal(report.success,false);
 const networkEnabled=await run('network-enabled',{}, {allowNetwork:true});assert.equal(networkEnabled.executionProfile.allowNetwork,true);assert.deepEqual(networkEnabled.blockedMethods,[]);
});
test('WebSocket connections are blocked before any upstream upgrade or data frame',async()=>{
 for(const allowNetwork of [false,true]){
  const report=await run('websocket-'+allowNetwork,{url:origin+'/websocket',steps:[{action:'waitFor',selector:'body[data-ready]'}]}, {allowNetwork});
  assert.equal(report.setupError,undefined);assert.deepEqual(report.blockedMethods,[]);assert.deepEqual(report.blockedTransports,['websocket']);assert.equal(report.executionProfile.webSockets,'blocked');assert.equal(webSocketUpgrades,0);assert.equal(webSocketMessages,0);assert(!JSON.stringify(report).includes('/socket'));assert(!JSON.stringify(report).includes('PROBE_FRAME'));assert.equal(report.results[0].status,'pass');assert.equal(report.executionComplete,false);assert.equal(report.success,false);
 }
});
test('declared analytics exclusion does not count as blocked functional execution',async()=>{
 for(const allowNetwork of [false,true]){
  const report=await run('analytics-'+allowNetwork,{url:origin+'/analytics',steps:[{action:'waitFor',selector:'body[data-ready]'}]}, {allowNetwork});
  assert.equal(report.setupError,undefined);assert.deepEqual(report.blockedMethods,[]);assert.deepEqual(report.blockedTransports,[]);assert.equal(report.excludedAnalyticsRequests,1);assert.equal(report.executionProfile.analyticsPolicy,'known-analytics-blocked-v1');assert.equal(report.executionComplete,true);assert.equal(report.success,true);assert(!JSON.stringify(report).includes('adapter-policy-probe'));assert(!JSON.stringify(report).includes('EXCLUDED_ANALYTICS_PROBE'));
 }
});
test('checker identity includes orchestration source as well as DOM inspector and adapter contract',async()=>{
 const report=await run('checker-identity'),sources=await Promise.all(['inspect-page.mjs','adapter.mjs','check-target.mjs'].map(file=>readFile(path.join(root,'src',file))));assert.equal(report.checkerSha256,sha256(Buffer.concat(sources)));
 assert.notEqual(report.checkerSha256,sha256(Buffer.concat(sources.slice(0,2))));
});
