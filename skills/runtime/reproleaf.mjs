import {readFile,realpath,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

try{
 let configuredRoot=process.env.REPROLEAF_ROOT;
 if(!configuredRoot){
  let binding;try{binding=JSON.parse(await readFile(new URL('../private/install.json',import.meta.url),'utf8'));}catch{throw Error('This skill has no readable toolkit binding. Install it with the Reproleaf CLI or set REPROLEAF_ROOT to a trusted absolute toolkit path.');}
  if(binding?.schemaVersion!==1)throw Error('Unsupported skill toolkit binding. Reinstall this skill or set REPROLEAF_ROOT.');
  configuredRoot=binding.root;
 }
 if(typeof configuredRoot!=='string'||!path.isAbsolute(configuredRoot))throw Error('REPROLEAF_ROOT and the installed toolkit binding must use an absolute path.');
 let root,cli;
 try{
  root=await realpath(configuredRoot);cli=path.join(root,'src/cli.mjs');
  const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  if(pkg.name!=='reproleaf'||!(await stat(cli)).isFile())throw Error();
 }catch{throw Error('The configured Reproleaf toolkit is unavailable. Restore its trusted checkout, reinstall the skill, or set REPROLEAF_ROOT to its new absolute location.');}
 const args=process.argv.slice(2);
 if(args[0]==='--toolkit-paths'){
  if(args.length!==1)throw Error('Use --toolkit-paths without additional arguments.');
  console.log(JSON.stringify({root,cli,adapterSchema:path.join(root,'src/adapter.mjs'),editorialSchema:path.join(root,'src/editorial.mjs'),editorialWorkflow:path.join(root,'packs/editorial-evidence/workflow.json')},null,2));
 }else{
  const result=spawnSync(process.execPath,[cli,...args],{cwd:process.cwd(),stdio:'inherit',shell:false});
  if(result.error)throw Error('Could not start the configured Reproleaf CLI.');
  process.exitCode=result.status??(result.signal==='SIGINT'?130:1);
 }
}catch(error){console.error(error.message);process.exitCode=1;}
