import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {generateRedirectPlan} from '../src/redirect-audit.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),output=path.join(root,'private/redirect-plan-server-20261116');await mkdir(output,{recursive:true});
function docker(args,input,includeStderr=false){const result=spawnSync('docker',args,{encoding:'utf8',input,timeout:30000});if(result.status!==0)throw Error(`Docker fixture failed: ${args.slice(0,3).join(' ')}: ${result.stderr||result.error}`);return result.stdout+(includeStderr?result.stderr:'');}
const origin='http://example.com',trace={startUrl:origin+'/old.html',hops:[{url:origin+'/old.html',status:301,location:'/middle'},{url:origin+'/middle',status:308,location:'/new.html'},{url:origin+'/new.html',status:200}]};
const receipts=[];
for(const format of ['nginx','apache-root'])for(const status of [301,308]){
 const name='reproleaf-redirect-qa-'+randomUUID().slice(0,12),directory=path.join(output,`${format}-${status}`);await mkdir(directory,{recursive:true});
 const plan=generateRedirectPlan({traces:[trace]},{format,status});
 let started=false;
 try{
  if(format==='nginx'){
   const config=`events {}\nhttp { server { listen 8080; server_name example.com;\n${plan.text}\nlocation / { return 200 "fallback"; } } }\n`;await writeFile(path.join(directory,'nginx.conf'),config);
   docker(['run','--rm','--network','none','-v',`${path.join(directory,'nginx.conf')}:/etc/nginx/nginx.conf:ro`,'nginx:1.28-alpine','nginx','-t']);
   docker(['run','-d','--network','none','--name',name,'-v',`${path.join(directory,'nginx.conf')}:/etc/nginx/nginx.conf:ro`,'nginx:1.28-alpine']);started=true;
  }else{
   await writeFile(path.join(directory,'.htaccess'),plan.text);await writeFile(path.join(directory,'old.html'),'Old fixture file');await writeFile(path.join(directory,'new.html'),'New fixture file');
   docker(['run','-d','--network','none','--name',name,'-v',`${directory}:/var/www/html:ro`,'--entrypoint','apache2-foreground','wordpress:7.1.4-php8.3-apache']);started=true;
   docker(['exec',name,'apache2ctl','-t']);
  }
  const request=(target,method='GET')=>{
   const raw=`${method} ${target} HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`;
   const response=format==='nginx'?docker(['exec','-i',name,'/bin/busybox','nc','127.0.0.1','8080'],raw):docker(['exec','-i',name,'php','-r','$s=stream_socket_client("tcp://127.0.0.1:80",$errno,$errstr,3);if(!$s)exit(2);fwrite($s,stream_get_contents(STDIN));echo stream_get_contents($s);fclose($s);'],raw);
   const code=Number(/^HTTP\/1\.[01] (\d{3})/m.exec(response)?.[1]);return {code,location:/^Location:\s*([^\r\n]+)/mi.exec(response)?.[1]??null};
  };
  let ready=false;
  for(let attempt=0;attempt<20&&!ready;attempt++){try{ready=request('/new.html').code===200;}catch{}if(!ready)await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(ready,true,'Fixture server did not become ready');
  const tests=[];
  for(const method of ['GET','POST']){const response=request('/old.html',method);assert.equal(response.code,status);assert.equal(response.location,origin+'/new.html');tests.push({target:'/old.html',method,...response});}
  for(const target of ['/old.html?x=1','/old.html?','/old.html/extra','/OLD.html','/%6fld.html','/nested/../old.html','//old.html']){
   const response=request(target);assert.ok(response.code>=200&&response.code<600,`No HTTP response for ${target}`);assert.notEqual(response.code,301,`Unexpected widening to ${target}`);assert.notEqual(response.code,308,`Unexpected widening to ${target}`);assert.equal(response.location,null);tests.push({target,method:'GET',...response});
  }
  const version=docker(['exec',name,...(format==='nginx'?['nginx','-v']:['apache2ctl','-v'])],undefined,true);
  receipts.push({format,status,network:'none',ports:'none',syntax:'passed',version:version.trim(),tests});
 }finally{if(started)docker(['rm','-f',name]);}
}
await writeFile(path.join(output,'receipt.json'),JSON.stringify({at:new Date().toISOString(),scope:'Exact generated configuration in isolated local servers; no public-origin requests or client redirect-follow semantics tested.',receipts},null,2));console.log(JSON.stringify({passed:receipts.length,requests:receipts.reduce((sum,r)=>sum+r.tests.length,0),output}));
