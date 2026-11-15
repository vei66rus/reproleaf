import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readdir,readFile,rm,symlink} from 'node:fs/promises';
import {root} from '../src/catalog.mjs';

test('package.json is publish-ready with optional playwright peer and bounded files whitelist',async()=>{
 const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
 assert.notEqual(pkg.private,true,'package.json must not stay private');
 assert.equal(pkg.publishConfig?.access,'public');
 assert.equal(pkg.mcpName,'io.github.vei66rus/reproleaf');
 assert.equal(pkg.dependencies.playwright,undefined,'playwright must not be a mandatory runtime dependency');
 assert.equal(pkg.peerDependenciesMeta?.playwright?.optional,true,'playwright must be an optional peer dependency');
 for(const requiredEntry of ['src/','cases/','fixtures/','packs/','skills/','server.json','LICENSE','README.md']){
  assert.ok(pkg.files.includes(requiredEntry),`expected files allowlist to include ${requiredEntry}`);
 }
});

test('npm pack produces a clean tarball and CLI/MCP work without playwright installed',async t=>{
 const tmp=await mkdtemp(path.join(os.tmpdir(),'reproleaf-pack-'));
 t.after(()=>rm(tmp,{recursive:true,force:true}));

 const npmCmd=process.platform==='win32'?'npm.cmd':'npm';
 const packStdout=execFileSync(npmCmd,['pack','--json','--pack-destination',tmp],{cwd:root,encoding:'utf8',shell:process.platform==='win32'});
 const packInfo=JSON.parse(packStdout);
 assert.equal(packInfo.length,1);
 const tarballPath=path.join(tmp,packInfo[0].filename);
 const filePaths=packInfo[0].files.map(f=>f.path);

 assert.ok(filePaths.includes('src/cli.mjs'));
 assert.ok(filePaths.includes('src/mcp.mjs'));
 assert.ok(filePaths.includes('server.json'));
 assert.ok(filePaths.some(p=>p.startsWith('skills/')));
 assert.ok(!filePaths.some(p=>p.startsWith('private/')||p.startsWith('dist/')||p.startsWith('tests/')),'tarball must exclude private, dist and tests directories');
 assert.ok(packInfo[0].size<1500000,`expected lean tarball under 1.5 MB, got ${packInfo[0].size}`);

 const unpackRoot=path.join(tmp,'unpacked');
 await mkdir(unpackRoot,{recursive:true});
 execFileSync('tar',['-xf',tarballPath,'-C',unpackRoot],{encoding:'utf8'});
 const pkgDir=path.join(unpackRoot,'package');
 const isolatedModules=path.join(pkgDir,'node_modules');
 await mkdir(isolatedModules,{recursive:true});
 for(const entry of await readdir(path.join(root,'node_modules'))){
  if(entry.startsWith('.')||entry==='playwright'||entry==='playwright-core'||entry==='@playwright')continue;
  await symlink(path.join(root,'node_modules',entry),path.join(isolatedModules,entry),'junction');
 }

 const listOut=execFileSync(process.execPath,[path.join(pkgDir,'src/cli.mjs'),'list'],{cwd:pkgDir,encoding:'utf8'});
 const listJson=JSON.parse(listOut);
 assert.ok(Array.isArray(listJson.cases)&&listJson.cases.length>0);

 const mcpHelp=execFileSync(process.execPath,[path.join(pkgDir,'src/cli.mjs'),'clients'],{cwd:pkgDir,encoding:'utf8'});
 assert.ok(JSON.parse(mcpHelp).clients.length>0);

 assert.throws(
  ()=>execFileSync(process.execPath,[path.join(pkgDir,'src/cli.mjs'),'verify','--all'],{cwd:pkgDir,encoding:'utf8',stdio:'pipe'}),
  err=>{
   const combined=`${err.stdout||''}${err.stderr||''}`;
   return combined.includes('Playwright is optional and not installed');
  },
  'expected clear optional Playwright guidance when running verify without Playwright'
 );
});
