import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {root} from '../src/catalog.mjs';
import {installSkill,skillNames} from '../src/skills.mjs';

const cleanEnv=(extra={})=>{const env={...process.env};delete env.REPROLEAF_ROOT;return {...env,...extra};};
const run=(launcher,args,options={})=>JSON.parse(execFileSync(process.execPath,[launcher,...args],{encoding:'utf8',env:cleanEnv(),...options}));
async function temporary(check){
 const temporaryRoot=await realpath(os.tmpdir()),directory=await mkdtemp(path.join(temporaryRoot,'reproleaf-skill-'));
 try{await check(directory);}finally{
  const resolved=path.resolve(directory);
  if(path.dirname(resolved)!==temporaryRoot||!/^reproleaf-skill-[a-zA-Z0-9]+$/.test(path.basename(resolved)))throw Error('Unsafe temporary cleanup path');
  await rm(resolved,{recursive:true,force:true});
 }
}

test('skill installer retains its allowlist and never overwrites an existing skill',async()=>temporary(async directory=>{
 const destination=path.join(directory,'global skills'),installed=await installSkill({name:'seo-evidence-review',destination});
 const before=await readFile(installed.path,'utf8');assert.match(before,/name: seo-evidence-review/);
 assert.match(before,/scripts\/reproleaf\.mjs/);assert(!before.includes('node src/cli.mjs'));
 await assert.rejects(installSkill({name:'seo-evidence-review',destination}),/not overwriting/);
 assert.equal(await readFile(installed.path,'utf8'),before);
 await assert.rejects(installSkill({name:'../../.env',destination}),/Unknown/);
 await assert.rejects(installSkill({name:'seo-evidence-review'}),/explicit skills destination/);
}));

test('installed launcher reads target metadata from an unrelated cwd without executing its src/cli.mjs',async()=>temporary(async directory=>{
 const cwd=path.join(directory,"target project's directory"),destination=path.join(directory,"global skills' directory");await mkdir(path.join(cwd,'src'),{recursive:true});
 await writeFile(path.join(cwd,'package.json'),JSON.stringify({name:'target-project',dependencies:{react:'19.2.0'}}));
 await writeFile(path.join(cwd,'src/cli.mjs'),'console.log("WRONG_PROJECT_CLI");');
 const installed=await installSkill({name:'mobile-web-review',destination});
 const result=run(installed.launcher,['diagnose','--package','package.json','--symptom','fixed bar covers focused input'],{cwd});
 assert.equal(result.kind,'project-diagnosis');assert.equal(result.environment.notableVersions.react,'19.2.0');assert.equal(result.environment.renderMode,'unknown');
 assert(result.matchedRules.every(rule=>rule.verificationStatus==='not-run'));
 assert.equal(await readFile(path.join(cwd,'src/cli.mjs'),'utf8'),'console.log("WRONG_PROJECT_CLI");');
 const binding=JSON.parse(await readFile(installed.binding,'utf8'));assert.equal(binding.root,await realpath(root));assert.equal(binding.schemaVersion,1);assert.equal(path.basename(path.dirname(installed.binding)),'private');
}));

test('all bundled skills include a launcher and return absolute readable toolkit resources',async()=>temporary(async directory=>{
 const cwd=path.join(directory,'another project');await mkdir(cwd);
 for(const name of skillNames){
  const installed=await installSkill({name,destination:path.join(directory,'skills')}),paths=run(installed.launcher,['--toolkit-paths'],{cwd});
  for(const field of ['root','cli','adapterSchema','editorialSchema','editorialWorkflow'])assert(path.isAbsolute(paths[field]));
  assert.equal(paths.root,await realpath(root));assert.equal(JSON.parse(await readFile(paths.editorialWorkflow,'utf8')).id,'editorial-evidence');
  assert((await readFile(paths.adapterSchema,'utf8')).includes('adapterSchema'));assert((await readFile(installed.path,'utf8')).includes('--toolkit-paths'));
  assert.equal(await readFile(installed.launcher,'utf8'),await readFile(path.join(root,'skills/runtime/reproleaf.mjs'),'utf8'));
 }
}));

test('explicit trusted root override handles spaces and apostrophes without shell interpolation',async()=>temporary(async directory=>{
 const cwd=path.join(directory,'target'),override=path.join(directory,"trusted toolkit's moved copy");await mkdir(cwd);await mkdir(path.join(override,'src'),{recursive:true});
 await writeFile(path.join(override,'package.json'),JSON.stringify({name:'reproleaf'}));
 await writeFile(path.join(override,'src/cli.mjs'),'console.log(JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}));');
 const installed=await installSkill({name:'blog-link-review',destination:path.join(directory,'skills')});await writeFile(installed.binding,JSON.stringify({schemaVersion:1,root:path.join(directory,'old-checkout-missing')}));
 const args=['diagnose','literal;not-a-command','$(not-a-command)',"quoted ' argument"];
 const result=run(installed.launcher,args,{cwd,env:cleanEnv({REPROLEAF_ROOT:override})});assert.equal(result.cwd,cwd);assert.deepEqual(result.args,args);
 const paths=run(installed.launcher,['--toolkit-paths'],{cwd,env:cleanEnv({REPROLEAF_ROOT:override})});assert.equal(paths.root,await realpath(override));
}));

test('missing or invalid bindings fail explicitly instead of searching the target project',async()=>temporary(async directory=>{
 const cwd=path.join(directory,'target');await mkdir(path.join(cwd,'src'),{recursive:true});await writeFile(path.join(cwd,'package.json'),JSON.stringify({name:'reproleaf'}));await writeFile(path.join(cwd,'src/cli.mjs'),'console.log("WRONG_PROJECT_CLI");');
 const installed=await installSkill({name:'mobile-web-review',destination:path.join(directory,'skills')});
 await writeFile(installed.binding,JSON.stringify({schemaVersion:1,root:path.join(directory,'missing')}));
 assert.throws(()=>run(installed.launcher,['diagnose'],{cwd}),error=>error.status===1&&/configured Reproleaf toolkit is unavailable/.test(error.stderr)&&!error.stdout.includes('WRONG_PROJECT_CLI'));
 assert.throws(()=>run(installed.launcher,['diagnose'],{cwd,env:cleanEnv({REPROLEAF_ROOT:'relative-root'})}),error=>error.status===1&&/absolute path/.test(error.stderr));
 await rm(installed.binding);
 assert.throws(()=>run(installed.launcher,['diagnose'],{cwd}),error=>error.status===1&&/no readable toolkit binding/.test(error.stderr));
}));

test('installer refuses an existing skill directory even when it has no SKILL.md',async()=>temporary(async directory=>{
 const destination=path.join(directory,'skills'),target=path.join(destination,'mobile-web-review');await mkdir(target,{recursive:true});await writeFile(path.join(target,'owner.txt'),'Existing local instructions.');
 await assert.rejects(installSkill({name:'mobile-web-review',destination}),/not overwriting/);assert.equal(await readFile(path.join(target,'owner.txt'),'utf8'),'Existing local instructions.');
}));

test('launcher preserves a failing CLI exit status',async()=>temporary(async directory=>{
 const override=path.join(directory,'trusted'),cwd=path.join(directory,'target');await mkdir(path.join(override,'src'),{recursive:true});await mkdir(cwd);
 await writeFile(path.join(override,'package.json'),JSON.stringify({name:'reproleaf'}));await writeFile(path.join(override,'src/cli.mjs'),'process.exitCode=23;');
 const installed=await installSkill({name:'blog-link-review',destination:path.join(directory,'skills')});
 assert.throws(()=>run(installed.launcher,['diagnose'],{cwd,env:cleanEnv({REPROLEAF_ROOT:override})}),error=>error.status===23);
}));
