export const projectLimits=Object.freeze({projects:20,runs:15,recordBytes:8*1048576,totalBytes:32*1048576});
const size=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
const forbiddenKeys=new Set(['__proto__','constructor','prototype','toString','valueOf','hasOwnProperty']);
const safeName=name=>{if(typeof name!=='string'||!name.trim()||name.length>100)throw Error('project-name');return name.trim();};
const safeObjectKey=value=>{if(value===undefined||value===null||value==='')return 'default';if(typeof value!=='string'||value.length>120)throw Error('invalid-object');const trimmed=value.trim()||'default';if(forbiddenKeys.has(trimmed))throw Error('invalid-object');return trimmed;};
const safeDecisionKey=value=>{if(typeof value!=='string'||!value.trim()||value.length>300)throw Error('invalid-decision');const trimmed=value.trim();if(forbiddenKeys.has(trimmed))throw Error('invalid-decision');return trimmed;};
const safeObjectKind=value=>{if(value===undefined||value===null||value==='')return 'article';if(!['site','article','scenario'].includes(value))throw Error('invalid-object');return value;};
const safeNote=value=>{if(value===undefined||value===null)return '';if(typeof value!=='string'||value.length>500)throw Error('invalid-note');return value.trim();};
function copyName(base,existingNames,language='ru'){
 const trimmed=safeName(base).slice(0,85),names=new Set(existingNames.map(n=>n.toLocaleLowerCase()));
 if(!names.has(trimmed.toLocaleLowerCase()))return trimmed;
 const suffix=language==='en'?' (copy)':' (копия)';
 if(!names.has((trimmed+suffix).toLocaleLowerCase()))return trimmed+suffix;
 for(let index=2;index<=99;index++){const candidate=`${trimmed} (${index})`;if(!names.has(candidate.toLocaleLowerCase()))return candidate;}
 return `${trimmed.slice(0,70)} (${crypto.randomUUID().slice(0,8)})`;
}
export function validateProjectArchive(payload){
 if(!payload||typeof payload!=='object'||payload.format!=='reproleaf-project'||payload.schemaVersion!==1)throw Error('invalid-archive');
 if(size(payload)>projectLimits.recordBytes)throw Error('record-too-large');
 const rawProject=payload.project,rawRuns=payload.runs;
 if(!rawProject||typeof rawProject!=='object'||!Array.isArray(rawRuns)||rawRuns.length>projectLimits.runs)throw Error('invalid-archive');
 const name=safeName(rawProject.name);
 const drafts={};
 if(rawProject.drafts&&typeof rawProject.drafts==='object'){
  for(const key of ['seo','web'])if(Object.hasOwn(rawProject.drafts,key)&&rawProject.drafts[key]!==undefined&&rawProject.drafts[key]!==null){
   if(typeof rawProject.drafts[key]!=='object')throw Error('invalid-archive');
   drafts[key]=structuredClone(rawProject.drafts[key]);
  }
 }
 const objects={};
 if(rawProject.objects&&typeof rawProject.objects==='object'){
  for(const [key,item]of Object.entries(rawProject.objects).slice(0,100)){
   const normalizedKey=safeObjectKey(key);
   if(item&&typeof item==='object')objects[normalizedKey]={key:normalizedKey,kind:safeObjectKind(item.kind),label:typeof item.label==='string'?item.label.slice(0,120):normalizedKey,updatedAt:typeof item.updatedAt==='string'?item.updatedAt:new Date().toISOString()};
  }
 }
 const decisions={};
 if(rawProject.decisions&&typeof rawProject.decisions==='object'){
  for(const [key,item]of Object.entries(rawProject.decisions).slice(0,500)){
   const cleanKey=safeDecisionKey(key);
   if(item&&typeof item==='object'&&['accepted','deferred','dismissed'].includes(item.status)){
    decisions[cleanKey]={status:item.status,reason:typeof item.reason==='string'?item.reason.slice(0,300):'',updatedAt:typeof item.updatedAt==='string'?item.updatedAt:new Date().toISOString()};
   }
  }
 }
 const baselines={};
 if(rawProject.baselines&&typeof rawProject.baselines==='object'){
  for(const [key,runId]of Object.entries(rawProject.baselines).slice(0,100)){
   const normalizedKey=safeObjectKey(key);
   if(typeof runId==='string'&&runId.length<=100)baselines[normalizedKey]=runId;
  }
 }
 const seenSequences=new Set(),normalizedRuns=[];
 for(const item of rawRuns){
  if(!item||typeof item!=='object'||!['seo','web'].includes(item.workspace)||!Array.isArray(item.report?.findings))throw Error('invalid-archive');
  if(!Number.isInteger(item.sequence)||item.sequence<1||seenSequences.has(item.sequence))throw Error('invalid-archive');
  if(typeof item.createdAt!=='string'||!Number.isFinite(Date.parse(item.createdAt)))throw Error('invalid-archive');
  seenSequences.add(item.sequence);
  normalizedRuns.push({
   oldId:typeof item.id==='string'?item.id:'',
   createdAt:new Date(Date.parse(item.createdAt)).toISOString(),
   sequence:item.sequence,
   workspace:item.workspace,
   objectKey:safeObjectKey(item.objectKey),
   objectKind:safeObjectKind(item.objectKind),
   note:safeNote(item.note),
   state:item.state&&typeof item.state==='object'?structuredClone(item.state):null,
   report:structuredClone(item.report),
   engine:typeof item.engine==='string'?item.engine.slice(0,200):'imported',
   context:item.context&&typeof item.context==='object'?structuredClone(item.context):null
  });
 }
 normalizedRuns.sort((a,b)=>a.sequence-b.sequence);
 return {name,originalId:typeof rawProject.id==='string'?rawProject.id.slice(0,100):null,drafts,objects,decisions,baselineRunId:typeof rawProject.baselineRunId==='string'&&rawProject.baselineRunId.length<=100?rawProject.baselineRunId:null,baselines,runs:normalizedRuns};
}
export function createProjectStore({database='reproleaf-projects-v1',indexedDB}={}){
 let opening;
 const open=()=>opening??=new Promise((resolve,reject)=>{
  let factory;try{factory=indexedDB??globalThis.indexedDB;}catch{reject(Error('storage-unavailable'));return;}
  if(!factory){reject(Error('storage-unavailable'));return;}
  const req=factory.open(database,1);
  req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('projects',{keyPath:'id'});const runs=db.createObjectStore('runs',{keyPath:'id'});runs.createIndex('projectId','projectId');db.createObjectStore('meta');};
  req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};req.onerror=()=>{opening=null;reject(req.error);};req.onblocked=()=>{opening=null;reject(Error('storage-blocked'));};
 });
 async function transaction(mode,action){
  const db=await open(),tx=db.transaction(['projects','runs','meta'],mode);
  const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('transaction-aborted'));tx.onerror=()=>{};});
  done.catch(()=>{});
  try{const result=await action(tx);await done;return result;}catch(error){try{tx.abort();}catch{}await done.catch(()=>{});throw error;}
 }
 const projectById=async(tx,id)=>{const p=await request(tx.objectStore('projects').get(id));if(!p)throw Error('project-missing');return p;};
 function checkRevision(project,expected){if(expected!==undefined&&project.revision!==expected)throw Error('project-conflict');}
 async function reserve(tx,delta){const store=tx.objectStore('meta'),bytes=(await request(store.get('bytes')))||0;if(bytes+delta>projectLimits.totalBytes)throw Error('storage-budget');store.put(Math.max(0,bytes+delta),'bytes');}
 function checkSize(value){const bytes=size(value);if(bytes>projectLimits.recordBytes)throw Error('record-too-large');return bytes;}
 return {
  async list({includeArchived=true}={}){
   return transaction('readonly',async tx=>(await request(tx.objectStore('projects').getAll())).filter(p=>includeArchived||!p.archived).map(({id,name,createdAt,updatedAt,revision,runCount,archived,baselineRunId,objects,bytes})=>({id,name,createdAt,updatedAt,revision,runCount,archived:!!archived,baselineRunId:baselineRunId||null,objects:objects||{},bytes:bytes||0})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));
  },
  async usage(){
   return transaction('readonly',async tx=>{
    const projects=await request(tx.objectStore('projects').getAll()),bytes=(await request(tx.objectStore('meta').get('bytes')))||0;
    return {projectCount:projects.length,archivedCount:projects.filter(p=>p.archived).length,totalBytes:bytes,maxProjects:projectLimits.projects,maxBytes:projectLimits.totalBytes,maxRecordBytes:projectLimits.recordBytes};
   });
  },
  async get(id){return transaction('readonly',async tx=>{const project=await projectById(tx,id),runs=await request(tx.objectStore('runs').index('projectId').getAll(id));return {project:{archived:false,objects:{},decisions:{},baselines:{},baselineRunId:null,...project},runs:runs.sort((a,b)=>b.sequence-a.sequence)};});},
  async save({id,name,workspace,state,objectKey,objectKind,expectedRevision}){
   if(!['seo','web'].includes(workspace))throw Error('invalid-workspace');
   const normalizedKey=safeObjectKey(objectKey),normalizedKind=safeObjectKind(objectKind||(workspace==='web'?'scenario':'article'));
   return transaction('readwrite',async tx=>{
    const store=tx.objectStore('projects'),old=id?await projectById(tx,id):null;if(old)checkRevision(old,expectedRevision);else if(await request(store.count())>=projectLimits.projects)throw Error('project-limit');
    const now=new Date().toISOString();
    const objects={...(old?.objects||{})};
    if(normalizedKey!=='default'||Object.hasOwn(objects,normalizedKey))objects[normalizedKey]={key:normalizedKey,kind:normalizedKind,label:normalizedKey,updatedAt:now};
    const objectDrafts={...(old?.objectDrafts||{}),[`${workspace}:${normalizedKey}`]:state};
    const project={id:old?.id||crypto.randomUUID(),name:safeName(name),createdAt:old?.createdAt||now,updatedAt:now,revision:(old?.revision||0)+1,runCount:old?.runCount||0,nextSequence:old?.nextSequence||1,archived:!!old?.archived,baselineRunId:old?.baselineRunId||null,baselines:{...(old?.baselines||{})},decisions:{...(old?.decisions||{})},objects,activeObject:{...(old?.activeObject||{}),[workspace]:{key:normalizedKey,kind:normalizedKind}},objectDrafts,drafts:{...old?.drafts,[workspace]:state}};
    project.bytes=checkSize(project);await reserve(tx,project.bytes-(old?.bytes||0));store.put(project);return project;
   });
  },
  async append({projectId,workspace,state,report,engine,context,objectKey,objectKind,note,expectedRevision}){
   if(!['seo','web'].includes(workspace)||!Array.isArray(report?.findings))throw Error('invalid-run');
   const normalizedKey=safeObjectKey(objectKey),normalizedKind=safeObjectKind(objectKind||(workspace==='web'?'scenario':report?.kind==='blog-graph'?'site':'article')),normalizedNote=safeNote(note);
   return transaction('readwrite',async tx=>{
    const old=await projectById(tx,projectId);checkRevision(old,expectedRevision);const createdAt=new Date().toISOString();
    const run={id:crypto.randomUUID(),projectId,createdAt,sequence:old.nextSequence,workspace,objectKey:normalizedKey,objectKind:normalizedKind,note:normalizedNote,state,report,engine,context};run.bytes=checkSize(run);
    const runs=tx.objectStore('runs'),history=(await request(runs.index('projectId').getAll(projectId))).sort((a,b)=>a.sequence-b.sequence);
    const pinnedIds=new Set([old.baselineRunId,...Object.values(old.baselines||{})].filter(Boolean));
    const removable=history.filter(r=>!pinnedIds.has(r.id));
    const excess=Math.max(0,history.length+1-projectLimits.runs);
    const removed=(removable.length>=excess?removable:history).slice(0,excess);
    const removedIds=new Set(removed.map(r=>r.id));
    const objects={...(old.objects||{})};
    objects[normalizedKey]={key:normalizedKey,kind:normalizedKind,label:normalizedKey,updatedAt:createdAt};
    const baselines=Object.fromEntries(Object.entries(old.baselines||{}).filter(([,runId])=>!removedIds.has(runId)));
    const baselineRunId=removedIds.has(old.baselineRunId)?null:(old.baselineRunId||null);
    const objectDrafts={...(old.objectDrafts||{}),[`${workspace}:${normalizedKey}`]:state};
    const project={...old,updatedAt:createdAt,revision:old.revision+1,runCount:history.length+1-removed.length,nextSequence:old.nextSequence+1,archived:!!old.archived,baselineRunId,baselines,decisions:{...(old.decisions||{})},objects,activeObject:{...(old.activeObject||{}),[workspace]:{key:normalizedKey,kind:normalizedKind}},objectDrafts,drafts:{...old.drafts,[workspace]:state}};project.bytes=checkSize(project);
    await reserve(tx,run.bytes+project.bytes-old.bytes-removed.reduce((n,r)=>n+r.bytes,0));
    for(const item of removed)runs.delete(item.id);runs.put(run);tx.objectStore('projects').put(project);return {project,run,pruned:removed.length};
   });
  },
  async updateRunNote({projectId,runId,note,expectedRevision}){
   const normalizedNote=safeNote(note);
   return transaction('readwrite',async tx=>{
    const old=await projectById(tx,projectId);checkRevision(old,expectedRevision);
    const runs=tx.objectStore('runs'),run=await request(runs.get(runId));
    if(!run||run.projectId!==projectId)throw Error('run-missing');
    const updatedRun={...run,note:normalizedNote};updatedRun.bytes=checkSize(updatedRun);
    const now=new Date().toISOString(),project={...old,updatedAt:now,revision:old.revision+1};project.bytes=checkSize(project);
    await reserve(tx,updatedRun.bytes-run.bytes+project.bytes-old.bytes);
    runs.put(updatedRun);tx.objectStore('projects').put(project);
    return {project,run:updatedRun};
   });
  },
  async setBaseline({projectId,runId,objectKey,expectedRevision}){
   return transaction('readwrite',async tx=>{
    const old=await projectById(tx,projectId);checkRevision(old,expectedRevision);
    let targetObject=objectKey?safeObjectKey(objectKey):null;
    if(runId){
     const run=await request(tx.objectStore('runs').get(runId));
     if(!run||run.projectId!==projectId)throw Error('run-missing');
     if(!targetObject)targetObject=safeObjectKey(run.objectKey);
    }
    const baselines={...(old.baselines||{})};
    if(targetObject){if(runId)baselines[targetObject]=runId;else delete baselines[targetObject];}
    const now=new Date().toISOString(),project={...old,updatedAt:now,revision:old.revision+1,baselineRunId:runId||null,baselines};project.bytes=checkSize(project);
    await reserve(tx,project.bytes-old.bytes);tx.objectStore('projects').put(project);return project;
   });
  },
  async setDecision({projectId,key,status,reason='',expectedRevision}){
   const cleanKey=safeDecisionKey(key);
   if(status!==null&&!['accepted','deferred','dismissed'].includes(status))throw Error('invalid-decision');
   const cleanReason=typeof reason==='string'?reason.trim().slice(0,300):'';
   return transaction('readwrite',async tx=>{
    const old=await projectById(tx,projectId);checkRevision(old,expectedRevision);
    const decisions={...(old.decisions||{})};
    if(status===null)delete decisions[cleanKey];
    else{
     if(!Object.hasOwn(decisions,cleanKey)&&Object.keys(decisions).length>=500)throw Error('decision-limit');
     decisions[cleanKey]={status,reason:cleanReason,updatedAt:new Date().toISOString()};
    }
    const now=new Date().toISOString(),project={...old,updatedAt:now,revision:old.revision+1,decisions};project.bytes=checkSize(project);
    await reserve(tx,project.bytes-old.bytes);tx.objectStore('projects').put(project);return project;
   });
  },
  async setArchived({id,archived,expectedRevision}){
   return transaction('readwrite',async tx=>{
    const old=await projectById(tx,id);checkRevision(old,expectedRevision);
    const now=new Date().toISOString(),project={...old,archived:!!archived,updatedAt:now,revision:old.revision+1};project.bytes=checkSize(project);
    await reserve(tx,project.bytes-old.bytes);tx.objectStore('projects').put(project);return project;
   });
  },
  async importArchive(payload,{language='ru'}={}){
   const parsed=validateProjectArchive(payload);
   return transaction('readwrite',async tx=>{
    const store=tx.objectStore('projects'),existing=await request(store.getAll());
    if(existing.length>=projectLimits.projects)throw Error('project-limit');
    const now=new Date().toISOString(),projectId=crypto.randomUUID(),idMap=new Map();
    const runsStore=tx.objectStore('runs'),storedRuns=[];
    let runsBytes=0;
    for(const [index,item]of parsed.runs.entries()){
     const id=crypto.randomUUID();
     if(item.oldId)idMap.set(item.oldId,id);
     const run={id,projectId,createdAt:item.createdAt,sequence:index+1,workspace:item.workspace,objectKey:item.objectKey,objectKind:item.objectKind,note:item.note,state:item.state,report:item.report,engine:item.engine,context:item.context};
     run.bytes=checkSize(run);runsBytes+=run.bytes;storedRuns.push(run);
    }
    const baselines={};
    for(const [objKey,oldRunId]of Object.entries(parsed.baselines||{})){if(idMap.has(oldRunId))baselines[safeObjectKey(objKey)]=idMap.get(oldRunId);}
    const baselineRunId=parsed.baselineRunId&&idMap.has(parsed.baselineRunId)?idMap.get(parsed.baselineRunId):null;
    const project={
     id:projectId,
     name:copyName(parsed.name,existing.map(p=>p.name),language),
     createdAt:now,
     updatedAt:now,
     revision:1,
     runCount:storedRuns.length,
     nextSequence:storedRuns.length+1,
     archived:false,
     importedFromId:parsed.originalId,
     importedAt:now,
     baselineRunId,
     baselines,
     decisions:parsed.decisions,
     objects:parsed.objects,
     activeObject:{},
     objectDrafts:{},
     drafts:parsed.drafts
    };
    project.bytes=checkSize(project);
    await reserve(tx,project.bytes+runsBytes);
    store.put(project);
    for(const run of storedRuns)runsStore.put(run);
    return {project,runs:storedRuns.slice().sort((a,b)=>b.sequence-a.sequence)};
   });
  },
  async remove(id,expectedRevision){return transaction('readwrite',async tx=>{const project=await projectById(tx,id);checkRevision(project,expectedRevision);const runs=tx.objectStore('runs'),history=await request(runs.index('projectId').getAll(id));for(const run of history)runs.delete(run.id);tx.objectStore('projects').delete(id);await reserve(tx,-project.bytes-history.reduce((n,r)=>n+r.bytes,0));});},
  async close(){if(opening){const db=await opening;db.close();opening=null;}}
 };
}
