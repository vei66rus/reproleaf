import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseProject,diagnoseFromPackageJson} from '../src/diagnose-project.mjs';
import {startApi} from '../src/api.mjs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {root} from '../src/catalog.mjs';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import os from 'node:os';

test('dependencies and symptom words do not establish a route rendering mode',()=>{
 for(const input of [{dependencies:{react:'19',three:'0.18'}},{dependencies:{nuxt:'4'}},{dependencies:{next:'15'}},{dependencies:{astro:'7',nuxt:'4'}},{stack:'WordPress Astro',dependencies:{astro:'7'}},{stack:'React WordPress Three.js',dependencies:{react:'19'}},{symptom:'SSR hydration reset'}]){
  const d=diagnoseProject(input);assert.equal(d.environment.renderMode,'unknown');assert.equal(d.environment.renderModeSource,'insufficient-metadata');assert(d.environment.warnings.length);
 }
});
test('explicit rendering configuration wins while Astro inference remains qualified',()=>{
 const declared=diagnoseProject({dependencies:{nuxt:'4'},renderMode:'ssg'});assert.equal(declared.environment.renderMode,'ssg');assert.equal(declared.environment.renderModeSource,'declared');
 const astro=diagnoseFromPackageJson({dependencies:{astro:'7',vue:'3'}});assert.equal(astro.environment.renderMode,'islands');assert.equal(astro.environment.renderModeSource,'framework-architecture');assert(astro.environment.possibleRenderModes.includes('ssr'));assert(astro.environment.warnings.length);
});
const applications=[{id:'legacy',label:'Legacy site',dependencies:{nuxt:'4'}},{id:'active',label:'Active site',dependencies:{astro:'7',vue:'3'}}];
test('multiple applications require selection and produce no premature adapter',()=>{
 const d=diagnoseProject({applications});assert.equal(d.status,'needs-application-selection');assert.deepEqual(d.matchedRules,[]);assert.equal(d.adapterTemplate,null);assert.equal(d.environment,null);assert.equal(d.applications.length,2);
});
test('selection uses only the chosen application metadata',()=>{
 const d=diagnoseProject({applications,activeApplication:'active',symptom:'hydration resets disclosure'});assert.equal(d.selectedApplication,'active');assert.equal(d.environment.renderMode,'islands');assert.equal(d.environment.notableVersions.nuxt,undefined);assert.equal(d.environment.notableVersions.astro,'7');
});
test('a single supplied application is selected without merging root data',()=>{
 const d=diagnoseProject({applications:[applications[1]]});assert.equal(d.selectedApplication,'active');assert.equal(d.selectionStatus,'selected');
 for(const extra of [{dependencies:{react:'19'}},{stack:'React'},{renderMode:'csr'}])assert.throws(()=>diagnoseProject({applications,...extra}),/do not merge/);
});
test('application selection rejects unknown, duplicate and path-like IDs',()=>{
 assert.throws(()=>diagnoseProject({activeApplication:'active'}),/requires application/);
 assert.throws(()=>diagnoseProject({applications,activeApplication:'missing'}),/Unknown activeApplication/);
 assert.throws(()=>diagnoseProject({applications:[applications[0],applications[0]]}));
 assert.throws(()=>diagnoseProject({applications:[{id:'../client'}]}));
 assert.throws(()=>diagnoseProject({applications:Array.from({length:21},(_,i)=>({id:'app'+i}))}));
});
test('combined application metadata is bounded before diagnosis',()=>{
 const dependencies=Object.fromEntries(Array.from({length:101},(_,i)=>['package'+i,'1']));assert.throws(()=>diagnoseProject({applications:[0,1,2].map(i=>({id:'app'+i,dependencies})),activeApplication:'app0'}),/combined dependency limit/);
});
test('an embedded canvas cannot qualify as owning page navigation',()=>{
 const symptom='canvas touch drag traps page scroll';const ordinary=diagnoseProject({dependencies:{phaser:'3'},symptom});assert(ordinary.matchedRules.some(r=>r.id==='canvas-touch-trap'));
 const embedded=diagnoseProject({dependencies:{phaser:'3'},symptom,interaction:{canvasOwnsPageNavigation:false}});assert(!embedded.matchedRules.some(r=>r.id==='canvas-touch-trap'));assert(!embedded.adapterTemplate.checks.some(c=>c.id.startsWith('canvas-touch-trap')));
});
test('explicitly absent hydration excludes hydration candidates',()=>{
 const d=diagnoseProject({dependencies:{astro:'7'},symptom:'hydration disclosure aria state reset',interaction:{hydratesServerHtml:false}});assert(d.matchedRules.every(r=>r.category!=='hydration'));assert(d.adapterTemplate.checks.every(c=>!c.id.startsWith('ssr-disclosure-hydration-reset')));
});
test('positive metadata still cannot claim a verified bug',()=>{
 const d=diagnoseProject({stack:'Phaser',symptom:'canvas touch trap',interaction:{canvasOwnsPageNavigation:true}});assert(d.matchedRules.length);assert(d.matchedRules.every(r=>r.applicabilityStatus==='requires-precondition-check'&&r.verificationStatus==='not-run'));
});

test('HTTP API and public MCP share application selection and exclusions',async()=>{
 const api=await startApi({port:0});try{
  const post=async(route,input)=>(await(await fetch(api.url+route,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify(input)})).json());
  const pending=await post('/v1/diagnose',{applications});assert.equal(pending.status,'needs-application-selection');assert.equal(pending.adapterTemplate,null);
  const result=await post('/v1/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'diagnose_project',arguments:{applications,activeApplication:'active',interaction:{hydratesServerHtml:false}}}});const selected=JSON.parse(result.result.content[0].text);assert.equal(selected.selectedApplication,'active');assert(selected.matchedRules.every(r=>r.category!=='hydration'));
 }finally{await api.close();}
});

test('CLI accepts a bounded metadata context with explicit application selection',()=>{
 const run=args=>JSON.parse(execFileSync(process.execPath,[path.join(root,'src/cli.mjs'),'diagnose','--context',path.join(root,'examples/project-context.json'),...args],{encoding:'utf8'}));
 assert.equal(run([]).status,'needs-application-selection');const selected=run(['--application','site']);assert.equal(selected.selectedApplication,'site');assert.equal(selected.environment.notableVersions.nuxt,undefined);
 assert.throws(()=>execFileSync(process.execPath,[path.join(root,'src/cli.mjs'),'diagnose','--context',path.join(root,'examples/project-context.json'),'--package',path.join(root,'package.json')],{stdio:'pipe'}));
});

test('CLI accepts Windows UTF-8 BOM metadata and rejects oversized inputs',async()=>{
 const temporary=await mkdtemp(path.join(os.tmpdir(),'reproleaf-context-')),file=path.join(temporary,'context.json');
 try{
  await writeFile(file,'\uFEFF'+JSON.stringify({applications:[applications[1]]}));const args=[path.join(root,'src/cli.mjs'),'diagnose','--context',file];assert.equal(JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8'})).selectedApplication,'active');
  for(const invalid of [null,[],1,'']){await writeFile(file,JSON.stringify(invalid));assert.throws(()=>execFileSync(process.execPath,args,{stdio:'pipe'}),error=>error.status===1&&error.stderr.toString().includes('metadata object'));}
  await writeFile(file,' '.repeat(262145));assert.throws(()=>execFileSync(process.execPath,args,{stdio:'pipe'}),error=>error.status===1&&error.stderr.toString().includes('exceeds 256 KiB'));
 }finally{await unlink(file);await rmdir(temporary);}
});
