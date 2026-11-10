import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {parse} from 'parse5';
import {catalog,root} from '../src/catalog.mjs';
import {checkRules,listCheckRules,getCheckRule,caseCitationUrl} from '../src/check-rules.mjs';
import {sanitizeSyntheticEvidence,createPublicCaseCatalog,createEvidencePages,buildPublicEvidence} from '../src/public-evidence.mjs';
import {evidenceFiles,evidencePackages} from '../src/evidence.mjs';
import {editorialSchema} from '../src/editorial-core.mjs';
import {adapterSchema} from '../src/adapter.mjs';
import {startApi} from '../src/api.mjs';

function report(){return {at:'2026-11-09T12:00:00.000Z',environment:{os:'win32',architecture:'x64',node:process.version,browser:'142.0.0.0',hostname:'PRIVATE_HOST'},packages:Object.fromEntries(evidencePackages.map(name=>[name,'1.2.3'])),sourceHashes:Object.fromEntries(evidenceFiles.map(file=>[file,'a'.repeat(64)])),runs:catalog.cases.flatMap(item=>[360,390].flatMap(width=>['broken','fixed'].map(variant=>({caseId:item.id,variant,viewport:{width,height:width===360?640:844},status:'expected',behaviorPassed:variant==='fixed',expectedBehaviorPass:variant==='fixed',matchesExpected:true,pageErrors:[],blockedRequests:[],observations:{width,success:true,privateText:'PRIVATE_TEXT',nested:{absolutePath:'C:/private/client',delta:56}},screenshot:{file:'C:/private/screen.png'}}))))};}
test('published editorial and graph rule IDs match actual checker finding codes',async()=>{
 for(const [domain,file,pattern]of [['editorial','src/editorial-core.mjs',/add\('[^']+','([^']+)'/g],['site-graph','src/blog-graph.mjs',/add\([^,]+,'([^']+)'/g]]){
  const source=await readFile(path.join(root,file),'utf8'),codes=[...new Set([...source.matchAll(pattern)].map(match=>match[1]))].sort();
  assert.deepEqual(checkRules.filter(rule=>rule.domain===domain).map(rule=>rule.code).sort(),codes);
 }
 assert.equal(checkRules.filter(rule=>rule.domain==='public-html').length,11);
 assert.equal(checkRules.filter(rule=>rule.domain==='browser').length,catalog.cases.length);
 assert.equal(new Set(checkRules.map(rule=>rule.id)).size,checkRules.length);
});
test('rule catalog is bounded, bilingual and linked to stable case and methodology anchors',()=>{
 const listing=listCheckRules({domain:'browser',language:'ru',limit:2});assert.equal(listing.total,9);assert.equal(listing.rules.length,2);assert.equal(listing.nextOffset,2);assert.match(listing.rules[0].title,/[А-Яа-я]/);
 const h1=getCheckRule({id:'editorial:h1-count',language:'en'});assert.match(h1.doesNotEstablish,/differ from title/);assert.equal(new URL(h1.citationUrl).pathname,'/en/tools/reproleaf-methodology');
 assert.equal(caseCitationUrl('modal-close-unreachable','ru'),'https://evolkov.tech/tools/web-dev-cases#modal-close-unreachable');
 assert.throws(()=>getCheckRule({id:'../../.env'}));assert.throws(()=>listCheckRules({limit:1000}));
});
test('published36outcomes distinguish expected broken failure from fixed success and exclude private fields',()=>{
 const publicReport=sanitizeSyntheticEvidence(report(),{stale:false});assert.equal(publicReport.summary.checks,36);assert.equal(publicReport.summary.expectedOutcomes,36);assert.equal(publicReport.outcomes.filter(item=>item.behaviorPassed===false).length,18);assert.equal(publicReport.outcomes.filter(item=>item.behaviorPassed===true).length,18);
 const serialized=JSON.stringify(publicReport);assert.doesNotMatch(serialized,/PRIVATE_HOST|PRIVATE_TEXT|C:\/private|screenshot|hostname/);assert.equal(publicReport.outcomes[0].observations.nested.delta,56);assert.equal(publicReport.physicalDevicesVerified,false);assert.equal(publicReport.independentUserValidation,false);
});
test('stale, duplicate, missing and contradictory observations cannot manufacture public passes',()=>{
 assert.equal(sanitizeSyntheticEvidence(report(),{stale:true}).status,'not-current');assert.equal(sanitizeSyntheticEvidence(null,null).status,'not-run');
 const duplicate=report();duplicate.runs[0]=duplicate.runs[1];assert.throws(()=>sanitizeSyntheticEvidence(duplicate,{stale:false}),/Duplicate/);
 const contradictory=report();contradictory.runs[0].behaviorPassed=true;assert.throws(()=>sanitizeSyntheticEvidence(contradictory,{stale:false}),/Inconsistent/);
 const incomplete=report();incomplete.runs.pop();assert.throws(()=>sanitizeSyntheticEvidence(incomplete,{stale:false}),/complete/);
 const blocked=report();blocked.runs[0].blockedRequests=['https://external.invalid'];assert.throws(()=>sanitizeSyntheticEvidence(blocked,{stale:false}),/network/);
});
test('four bilingual static page records contain allcaseanchors andscopewithout tool bundles',()=>{
 const evidence=sanitizeSyntheticEvidence(report(),{stale:false}),pages=createEvidencePages(evidence,createPublicCaseCatalog(evidence));assert.equal(Object.keys(pages).length,4);
 for(const page of Object.values(pages)){
  assert.equal(new Set([page.path]).size,1);assert.doesNotMatch(page.content,/<h1\b|<script\b|<iframe\b|<form\b|\[reproleaf_/i);
  const tree=parse(page.content),ids=[];const walk=node=>{const id=node.attrs?.find(attr=>attr.name==='id')?.value;if(id)ids.push(id);for(const child of node.childNodes||[])walk(child);};walk(tree);assert.equal(ids.length,new Set(ids).size);
  if(page.group==='cases')for(const item of catalog.cases)assert.ok(ids.includes(item.id));
  assert.ok(page.description.length>50);assert.ok(page.commercialKey.startsWith('tool:evidence:'));
 }
 assert.match(pages['methodology-en'].content,/does not guarantee citations or rankings/);assert.match(pages['cases-en'].content,/not.*physical|physical.*not/i);
});
test('generated public example packets validate and same-version assets reject changed content',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'reproleaf-public-evidence-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const result=await buildPublicEvidence({output:directory});assert.equal(result.status,'not-run');
 const packet=JSON.parse(await readFile(path.join(directory,'editorial-packet.example.json'),'utf8'));assert.ok(editorialSchema.parse(packet));
 const adapter=JSON.parse(await readFile(path.join(directory,'frontend-adapter.example.json'),'utf8'));assert.ok(adapterSchema.parse(adapter));
 await buildPublicEvidence({output:directory});
 const {writeFile}=await import('node:fs/promises');await writeFile(path.join(directory,'catalog.json'),'changed');await assert.rejects(buildPublicEvidence({output:directory}),/already exists/);
});
test('public MCP gateway serves the same bundled rule catalog without operator credentials',async()=>{
 const api=await startApi({port:0});try{
  const rpc=async(method,params)=>(await(await fetch(api.url+'/v1/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})).json());
  const names=(await rpc('tools/list',{})).result.tools.map(tool=>tool.name);assert.ok(names.includes('list_check_rules')&&names.includes('get_check_rule'));assert.ok(!names.includes('get_site_project_context'));
  const rule=JSON.parse((await rpc('tools/call',{name:'get_check_rule',arguments:{id:'public-html:canonical',language:'en'}})).result.content[0].text);assert.equal(rule.id,'public-html:canonical');assert.match(rule.doesNotEstablish,/Google/);
 }finally{await api.close();}
});
