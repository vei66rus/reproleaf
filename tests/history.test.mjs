import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareRuns,normalizeFrontendEvidence,findingKey} from '../src/history.mjs';
import {validateProjectArchive,createProjectStore} from '../src/browser/project-store.mjs';
import {comparisonHtml} from '../src/report-html.mjs';
function createMemoryIndexedDB(){
 const dbs=new Map();
 return {
  open(name){
   const req={result:null,error:null,onsuccess:null,onerror:null,onupgradeneeded:null,onblocked:null};
   queueMicrotask(()=>{
    let state=dbs.get(name);
    const isNew=!state;
    if(!state){state={stores:new Map(),indexes:new Map()};dbs.set(name,state);}
    const db={
     onversionchange:null,
     close(){},
     createObjectStore(storeName,{keyPath}={}){
      const map=new Map();state.stores.set(storeName,{map,keyPath});
      return {createIndex(indexName,field){state.indexes.set(`${storeName}:${indexName}`,field);}};
     },
     transaction(names){
      const snapshot=new Map();
      for(const n of names)snapshot.set(n,new Map(state.stores.get(n).map));
      let aborted=false;
      const asyncReq=fn=>{const r={result:undefined,error:null,onsuccess:null,onerror:null};queueMicrotask(()=>{if(aborted)return;try{r.result=fn();r.onsuccess?.();}catch(e){r.error=e;r.onerror?.();}});return r;};
      const tx={
       error:null,oncomplete:null,onabort:null,onerror:null,
       abort(){aborted=true;for(const [n,m]of snapshot)state.stores.get(n).map=m;queueMicrotask(()=>tx.onabort?.());},
       objectStore(storeName){
        const entry=state.stores.get(storeName);
        return {
         get:key=>asyncReq(()=>structuredClone(entry.map.get(key))),
         getAll:()=>asyncReq(()=>[...entry.map.values()].map(v=>structuredClone(v))),
         count:()=>asyncReq(()=>entry.map.size),
         put:(val,key)=>asyncReq(()=>{const k=entry.keyPath?val[entry.keyPath]:key;entry.map.set(k,structuredClone(val));return k;}),
         delete:key=>asyncReq(()=>{entry.map.delete(key);}),
         index:indexName=>{
          const field=state.indexes.get(`${storeName}:${indexName}`);
          return {getAll:val=>asyncReq(()=>[...entry.map.values()].filter(item=>item[field]===val).map(v=>structuredClone(v)))};
         }
        };
       }
      };
      setTimeout(()=>{if(!aborted)tx.oncomplete?.();},5);
      return tx;
     }
    };
    req.result=db;
    if(isNew)req.onupgradeneeded?.();
    req.onsuccess?.();
   });
   return req;
  }
 };
}
const run=(id,report,extra={})=>({id,report,engine:'same-core',context:{primaryQuery:'query',h1Mode:'renderer',sitePaths:undefined,glossary:[],claimIds:['claim']},...extra});
const editorial=(findings,checks)=>({findings,diagnostics:{checks}});
test('repeat article checks distinguish added, persisting and resolved findings',()=>{
 const a=run('a',editorial([{code:'title-not-provided',severity:'warning'},{code:'unbound-fact',record:'claim',severity:'error'}],[]));
 const b=run('b',editorial([{code:'unbound-fact',record:'claim',severity:'error'},{code:'description-not-provided',severity:'warning'}],[{code:'title',status:'good'}]));
 const result=compareRuns(a,b);assert.equal(result.resolved.length,1);assert.equal(result.added.length,1);assert.equal(result.remaining.length,1);assert.equal(result.unverified.length,0);
});
test('missing coverage, removed claims and changed engine/config do not count as confirmed resolutions',()=>{
 const a=run('a',editorial([{code:'unbound-fact',record:'claim',severity:'error'}],[]));
 const b=run('b',editorial([],[{code:'sources',status:'unchecked'}]));assert.equal(compareRuns(a,b).unverified.length,1);
 b.report.diagnostics.checks[0].status='good';b.context.claimIds=[];assert.equal(compareRuns(a,b).unverified.length,1);
 b.context.claimIds=['claim'];b.engine='new-core';assert.equal(compareRuns(a,b).resolved.length,0);
 b.engine='same-core';b.context.primaryQuery='different';assert.equal(compareRuns(a,b).resolved.length,0);
});
test('comparing different target objects inside a project marks disappearing findings unverified',()=>{
 const a=run('a',editorial([{code:'title-not-provided',severity:'warning'}],[]),{objectKey:'/blog/first'});
 const b=run('b',editorial([],[{code:'title',status:'good'}]),{objectKey:'/blog/second'});
 const result=compareRuns(a,b);
 assert.equal(result.resolved.length,0);
 assert.equal(result.unverified.length,1);
 assert.equal(result.warnings.includes('different-object'),true);
});
test('smaller or URL-only blog inventories cannot pretend to resolve missing incoming links and graphDiff tracks edges',()=>{
 const report={kind:'blog-graph',scope:{siteOrigin:'https://example.org',evidenceScope:'stored-links'},pages:[{url:'https://example.org/a'},{url:'https://example.org/b'}],edges:[{source:'https://example.org/a',target:'https://example.org/b'}],findings:[{code:'no-observed-incoming',record:'https://example.org/b',severity:'warning'}],summary:{pages:2}};
 const a=run('a',{...report,edges:[]}),b=run('b',{...report,findings:[]});
 const diff=compareRuns(a,b);
 assert.equal(diff.resolved.length,1);
 assert.equal(diff.graphDiff.addedEdges.length,1);
 assert.equal(diff.graphDiff.removedEdges.length,0);
 b.report={...b.report,pages:[{url:'https://example.org/a'}],edges:[]};
 const shrunk=compareRuns(a,b);
 assert.equal(shrunk.unverified.length,1);
 assert.deepEqual(shrunk.graphDiff.removedPages,['https://example.org/b']);
 b.report={...report,scope:{...report.scope,evidenceScope:'urls-only'},findings:[]};assert.equal(compareRuns(a,b).unverified.length,1);
});
test('different record strings do not collide when IDs contain separator characters',()=>{
 const a=run('a',editorial([{code:'a|b',record:'c'}],[])),b=run('b',editorial([{code:'a',record:'b|c'}],[]));const diff=compareRuns(a,b);assert.equal(diff.added.length,1);assert.equal(diff.remaining.length,0);
 assert.notEqual(findingKey({code:'a|b',record:'c'}),findingKey({code:'a',record:'b|c'}));
});
const evidence=()=>({at:'2026-11-05T10:00:00.000Z',target:'https://example.org/page',viewport:{width:390,height:844},browser:'Chromium 1',executionProfile:{schemaVersion:2,allowNetwork:false,methods:['GET','HEAD'],analyticsPolicy:'known-analytics-blocked-v1',isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',webSockets:'blocked'},blockedMethods:[],blockedTransports:[],targetStateSha256:'d'.repeat(64),checkerSha256:'a'.repeat(64),adapterSha256:'b'.repeat(64),results:[{id:'close',type:'control',status:'fail'}],runtimeErrors:[]});

test('missing or invalid adapter identities keep legacy observations unconfirmed',()=>{
 for(const hash of [undefined,'','not-a-sha','a'.repeat(63),'A'.repeat(64)]){
  const before=evidence(),after=evidence();before.adapterSha256=hash;after.adapterSha256=hash;after.results[0].status='pass';const a=run('a',normalizeFrontendEvidence(before)),b=run('b',normalizeFrontendEvidence(after)),result=compareRuns(a,b);
  assert.equal(result.resolved.length,0);assert.equal(result.unverified.length,1);assert(result.warnings.includes('unversioned-adapter'));
  a.report.adapterSha256=hash;b.report.adapterSha256=hash;assert.equal(compareRuns(a,b).resolved.length,0,'Already normalized legacy archives must not bypass identity validation');
 }
});
test('actual checker digests must match even when saved engine labels match',()=>{
 const before=evidence(),after=evidence();after.results[0].status='pass';after.checkerSha256='c'.repeat(64);const result=compareRuns(run('a',normalizeFrontendEvidence(before)),run('b',normalizeFrontendEvidence(after)));assert.equal(result.resolved.length,0);assert(result.warnings.includes('engine-changed'));
});
test('unknown browser identities do not establish comparable execution conditions',()=>{
 for(const browser of [undefined,'','unknown',' UNKNOWN ','  ']){const before=evidence(),after=evidence();before.browser=browser;after.browser=browser;after.results[0].status='pass';const result=compareRuns(run('a',normalizeFrontendEvidence(before)),run('b',normalizeFrontendEvidence(after)));assert.equal(result.resolved.length,0);assert(result.warnings.includes('unversioned-browser'));}
});
test('an incomplete baseline or repeat cannot confirm a behavioral resolution',()=>{
 for(const side of ['before','after'])for(const error of ['setup','runtime']){const before=evidence(),after=evidence();after.results[0].status='pass';const raw=side==='before'?before:after;if(error==='setup')raw.setupError='Setup incomplete';else raw.runtimeErrors=['Render failed'];const result=compareRuns(run('a',normalizeFrontendEvidence(before)),run('b',normalizeFrontendEvidence(after)));assert.equal(result.resolved.length,0);assert(result.warnings.includes('run-incomplete'));}
});
test('execution policy and final route state are required comparable evidence',()=>{
 for(const change of ['missing-profile','unknown-profile','changed-policy','missing-target-state','changed-target-state','missing-blocked-methods','blocked-post','legacy-transport-policy','blocked-websocket','missing-transports']){
  const raw=evidence(),later=evidence();later.results[0].status='pass';
  if(change==='missing-profile')delete later.executionProfile;
  if(change==='unknown-profile')later.executionProfile={...later.executionProfile,analyticsPolicy:'other-policy'};
  if(change==='changed-policy')later.executionProfile={...later.executionProfile,allowNetwork:true};
  if(change==='missing-target-state')delete later.targetStateSha256;
  if(change==='changed-target-state')later.targetStateSha256='f'.repeat(64);
  if(change==='missing-blocked-methods')delete later.blockedMethods;
  if(change==='blocked-post')later.blockedMethods=['POST'];
  if(change==='legacy-transport-policy'){later.executionProfile.schemaVersion=1;delete later.executionProfile.webSockets;}
  if(change==='blocked-websocket')later.blockedTransports=['websocket'];
  if(change==='missing-transports')delete later.blockedTransports;
  const result=compareRuns(run('a',normalizeFrontendEvidence(raw)),run('b',normalizeFrontendEvidence(later)));assert.equal(result.resolved.length,0,change);assert.equal(result.unverified.length,1,change);assert(result.warnings.length>0,change);
 }
});
test('normalization preserves effective context without leaking redirect query values',()=>{
 const raw=evidence();raw.requestedTarget='https://example.org/start';raw.initialViewport={width:390,height:650};const normalized=normalizeFrontendEvidence(raw);assert.deepEqual(normalized.executionProfile,raw.executionProfile);assert.deepEqual(normalized.blockedMethods,[]);assert.equal(normalized.targetStateSha256,raw.targetStateSha256);assert.equal(normalized.requestedTarget,raw.requestedTarget);assert.deepEqual(normalized.initialViewport,raw.initialViewport);
});
test('pre-normalized archives cannot claim a repair without a matching baseline failure',()=>{
 const raw=evidence(),a=run('a',normalizeFrontendEvidence(raw));raw.results[0].status='pass';const b=run('b',normalizeFrontendEvidence(raw));a.report.checks[0].status='pass';const result=compareRuns(a,b);assert.equal(result.resolved.length,0);assert.equal(result.unverified.length,1);
 a.report.checks.push({...a.report.checks[0]});assert.throws(()=>compareRuns(a,b),/Invalid or duplicate check/);
 a.report.checks.pop();b.report.checks.push({...b.report.checks[0]});assert.throws(()=>compareRuns(a,b),/Invalid or duplicate check/);
});
test('pre-normalized report metadata is checked through the raw evidence contract',()=>{
 for(const extra of [{viewport:{width:0,height:-1}},{target:'javascript:bad'},{target:'https://user:secret@example.org/'},{at:'not-a-date'},{runtimeErrors:[{}]}]){const raw=evidence(),a=run('a',normalizeFrontendEvidence(raw));raw.results[0].status='pass';const b=run('b',normalizeFrontendEvidence(raw));Object.assign(a.report,extra);Object.assign(b.report,extra);assert.throws(()=>compareRuns(a,b));}
});
test('frontend imported fail/pass comparison requires a matching measured scope and reports environmentDiff',()=>{
 const raw=evidence(),a=run('a',normalizeFrontendEvidence(raw));raw.results[0].status='pass';const b=run('b',normalizeFrontendEvidence(raw));assert.equal(compareRuns(a,b).resolved.length,1);
 b.report.viewport.width=360;
 const changed=compareRuns(a,b);
 assert.equal(changed.resolved.length,0);assert.equal(changed.unverified.length,1);
 assert.equal(changed.environmentDiff.viewportChanged,true);
});
test('unsupported and error runs cannot count as successful frontend repairs',()=>{
 const raw=evidence(),a=run('a',normalizeFrontendEvidence(raw));raw.results[0].status='unsupported';const b=run('b',normalizeFrontendEvidence(raw));assert.equal(compareRuns(a,b).resolved.length,0);
 raw.results=[];raw.setupError='Navigation failed';b.report=normalizeFrontendEvidence(raw);assert.equal(compareRuns(a,b).resolved.length,0);
});
test('frontend input rejects non-adapter reports and duplicate IDs',()=>{
 assert.throws(()=>normalizeFrontendEvidence({runs:[],pilot:true}));const raw=evidence();raw.results.push({...raw.results[0]});assert.throws(()=>normalizeFrontendEvidence(raw));
});
test('same-run and cross-kind comparisons ask for another pair',()=>{
 const a=run('a',editorial([],[]));assert.equal(compareRuns(a,a).compatible,false);assert.equal(compareRuns(a,run('b',{kind:'frontend-evidence'})).compatible,false);
});
test('removing clusters or changing page kind cannot manufacture a blog resolution',()=>{
 const base={kind:'blog-graph',scope:{siteOrigin:'https://example.org',coverage:'Stored links',evidenceScope:'stored-links'},pages:[{url:'https://example.org/a',kind:'article',cluster:'topic'}],findings:[{code:'no-observed-topic-link',record:'https://example.org/a',severity:'warning'}],summary:{pages:1}};
 const a=run('a',base),b=run('b',{...base,findings:[],pages:[{url:'https://example.org/a',kind:'article'}]});assert.equal(compareRuns(a,b).resolved.length,0);assert.equal(compareRuns(a,b).unverified.length,1);
});
test('validateProjectArchive enforces format, schema version, run sequences and decision bounds',()=>{
 const valid=validateProjectArchive({
  schemaVersion:1,
  format:'reproleaf-project',
  project:{id:'orig-1',name:'Client SEO Audit',drafts:{seo:{mode:'text'}},decisions:{'["h1-count",""]':{status:'accepted',reason:'Fix in template'}},baselineRunId:'r1',baselines:{'/blog/post':'r1'}},
  runs:[{id:'r1',sequence:1,createdAt:'2026-11-05T12:00:00.000Z',workspace:'seo',objectKey:'/blog/post',objectKind:'article',note:'Initial check',state:{mode:'text'},report:{findings:[]},engine:'w1'}]
 });
 assert.equal(valid.name,'Client SEO Audit');
 assert.equal(valid.runs.length,1);
 assert.equal(valid.runs[0].objectKey,'/blog/post');
 assert.equal(valid.decisions['["h1-count",""]'].status,'accepted');
 assert.throws(()=>validateProjectArchive({schemaVersion:2,format:'reproleaf-project',project:{name:'x'},runs:[]}),/invalid-archive/);
 assert.throws(()=>validateProjectArchive({schemaVersion:1,format:'other',project:{name:'x'},runs:[]}),/invalid-archive/);
 assert.throws(()=>validateProjectArchive({schemaVersion:1,format:'reproleaf-project',project:{name:'x'},runs:[{sequence:1,createdAt:'2026-11-05T12:00:00Z',workspace:'seo',report:{findings:[]}},{sequence:1,createdAt:'2026-11-05T12:01:00Z',workspace:'seo',report:{findings:[]}}]}),/invalid-archive/);
});
test('comparisonHtml escapes untrusted strings and renders comparison summary',()=>{
 const a=run('a',editorial([{code:'title-not-provided',record:'<script>alert(1)</script>',severity:'warning'}],[]),{sequence:1,createdAt:'2026-11-05T10:00:00Z',note:'<b>before</b>',objectKey:'/blog/a'});
 const b=run('b',editorial([],[{code:'title',status:'good'}]),{sequence:2,createdAt:'2026-11-05T11:00:00Z',note:'after',objectKey:'/blog/a'});
 const diff=compareRuns(a,b);
 const html=comparisonHtml(diff,a,b,'ru',{projectName:'<img src=x onerror=alert(1)>'});
 assert.equal(html.includes('<script>'),false);
 assert.equal(html.includes('<img src=x'),false);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(html,/Больше не найдены при сопоставимой проверке/);
 const blogA=run('ba',{kind:'blog-graph',scope:{siteOrigin:'https://example.org',evidenceScope:'stored-links'},pages:[{url:'https://example.org/a'}],edges:[],findings:[],summary:{pages:1,distinctInternalEdges:0,noObservedIncoming:1,unresolvedTargets:0}});
 const blogB=run('bb',{kind:'blog-graph',scope:{siteOrigin:'https://example.org',evidenceScope:'stored-links'},pages:[{url:'https://example.org/a'},{url:'https://example.org/b'}],edges:[{source:'https://example.org/a',target:'https://example.org/b'}],findings:[],summary:{pages:2,distinctInternalEdges:1,noObservedIncoming:1,unresolvedTargets:0}});
 const blogHtml=comparisonHtml(compareRuns(blogA,blogB),blogA,blogB,'ru');
 assert.match(blogHtml,/Показатели покрытия/);
 assert.match(blogHtml,/Новая страница/);
});
test('project store supports objects, notes, pinned baseline preservation, decisions, archive toggle and non-overwriting import',async()=>{
 const store=createProjectStore({database:'mem-1',indexedDB:createMemoryIndexedDB()});
 let project=await store.save({name:'Portal SEO',workspace:'seo',objectKey:'/blog/intro',objectKind:'article',state:{markdown:'v1'}});
 const first=await store.append({projectId:project.id,workspace:'seo',objectKey:'/blog/intro',objectKind:'article',note:'Baseline run',state:{markdown:'v1'},report:{findings:[]},engine:'e1',context:null,expectedRevision:project.revision});
 project=first.project;
 project=await store.setBaseline({projectId:project.id,runId:first.run.id,objectKey:'/blog/intro',expectedRevision:project.revision});
 assert.equal(project.baselineRunId,first.run.id);
 assert.equal(project.baselines['/blog/intro'],first.run.id);
 for(let i=0;i<15;i++){
  const next=await store.append({projectId:project.id,workspace:'seo',objectKey:'/blog/intro',objectKind:'article',note:`Run ${i}`,state:{markdown:`v${i+2}`},report:{findings:[]},engine:'e1',context:null,expectedRevision:project.revision});
  project=next.project;
 }
 const loaded=await store.get(project.id);
 assert.equal(loaded.runs.length,15);
 assert.equal(loaded.runs.some(r=>r.id===first.run.id),true);
 const updatedNote=await store.updateRunNote({projectId:project.id,runId:first.run.id,note:'Updated baseline note',expectedRevision:project.revision});
 project=updatedNote.project;
 assert.equal(updatedNote.run.note,'Updated baseline note');
 project=await store.setDecision({projectId:project.id,key:'["h1-count",""]',status:'deferred',reason:'Template handles H1',expectedRevision:project.revision});
 assert.equal(project.decisions['["h1-count",""]'].status,'deferred');
 project=await store.setArchived({id:project.id,archived:true,expectedRevision:project.revision});
 assert.equal((await store.list({includeArchived:false})).length,0);
 assert.equal((await store.list({includeArchived:true})).length,1);
 const exported=await store.get(project.id);
 const imported=await store.importArchive({schemaVersion:1,format:'reproleaf-project',...exported},{language:'en'});
 assert.notEqual(imported.project.id,project.id);
 assert.equal(imported.project.name,'Portal SEO (copy)');
 assert.equal(imported.runs.length,15);
 assert.notEqual(imported.project.baselineRunId,first.run.id);
 assert.equal(imported.runs.some(r=>r.id===imported.project.baselineRunId),true);
 const usage=await store.usage();
 assert.equal(usage.projectCount,2);
 assert.equal(usage.archivedCount,1);
 assert.equal(usage.totalBytes>0,true);
 for(const badKey of ['__proto__','constructor','prototype']){
  await assert.rejects(()=>store.save({id:project.id,name:'Portal SEO',workspace:'seo',objectKey:badKey,state:{},expectedRevision:project.revision}),/invalid-object/);
  await assert.rejects(()=>store.setDecision({projectId:project.id,key:badKey,status:'accepted',expectedRevision:project.revision}),/invalid-decision/);
  assert.throws(()=>validateProjectArchive({schemaVersion:1,format:'reproleaf-project',project:{name:'x',objects:{[badKey]:{kind:'article'}}},runs:[]}),/invalid-object/);
  assert.throws(()=>validateProjectArchive({schemaVersion:1,format:'reproleaf-project',project:{name:'x',decisions:{[badKey]:{status:'accepted'}}},runs:[]}),/invalid-decision/);
 }
 const r1=run('r1',editorial([{code:'h1-count',severity:'error'}],[]));
 const r2=run('r2',editorial([{code:'h1-count',severity:'error'}],[]));
 assert.equal(compareRuns(r1,r2).resolved.length,0);
 assert.equal(compareRuns(r1,r2).remaining.length,1);
 await store.close();
});
