import {normalizeExecutionProfile} from './execution-profile.mjs';
const validDigest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const knownBrowser=value=>typeof value==='string'&&value.trim()!==''&&value.trim().toLowerCase()!=='unknown';
const statuses=new Set(['pass','fail','unsupported','setup-error']);
const norm=value=>String(value??'').normalize('NFKC').trim();
export const findingKey=f=>JSON.stringify([f.code,f.code==='sections-need-editorial-review'?'':norm(f.record)]);
const diagnosticFor={
 'title-not-provided':'title','description-not-provided':'description','h1-count':'h1','heading-level-gap':'hierarchy',
 'unknown-internal-target':'inventory','unsafe-link-scheme':'link-safety','glossary-variant':'terminology',
 'unbound-fact':'sources','unknown-source':'sources','unreviewed-source':'sources','duplicate-source-id':'sources','duplicate-claim-id':'sources','claim-not-in-draft':'sources','missing-calculation-evidence':'sources','observation-needs-review':'sources'
};
export function reportKind(report){return report?.kind==='blog-graph'?'blog':report?.kind==='frontend-evidence'?'frontend':'editorial';}
export function normalizeFrontendEvidence(input){
 if(!input||typeof input!=='object'||!Array.isArray(input.results)||!input.target||!input.viewport||typeof input.at!=='string')throw Error('Use a Reproleaf check --adapter report with target, viewport and results.');
 const target=new URL(input.target);if(!['http:','https:'].includes(target.protocol)||target.username||target.password)throw Error('HTTP(S) target required.');
 if(!Number.isFinite(Date.parse(input.at))||!Number.isInteger(input.viewport.width)||!Number.isInteger(input.viewport.height)||input.viewport.width<1||input.viewport.height<1||input.viewport.width>10000||input.viewport.height>10000||input.results.length>100)throw Error('Invalid report metadata.');
 const ids=new Set(),checks=input.results.map(item=>{
  if(typeof item.id!=='string'||!item.id||item.id.length>200||ids.has(item.id)||typeof item.type!=='string'||!statuses.has(item.status))throw Error('Invalid or duplicate check ID/status.');ids.add(item.id);
  return {id:item.id,type:item.type,status:item.status,reason:typeof item.reason==='string'?item.reason.slice(0,4000):''};
 });
 const findings=checks.filter(c=>c.status!=='pass').map(c=>({code:c.status==='fail'?'behavior-failed':'check-not-completed',record:c.id,severity:c.status==='fail'?'error':'warning',message:c.reason||`${c.type}: ${c.status}`}));
 if(input.runtimeErrors!==undefined&&(!Array.isArray(input.runtimeErrors)||input.runtimeErrors.some(value=>typeof value!=='string')))throw Error('Invalid runtime errors.');
 const runtimeErrors=Array.isArray(input.runtimeErrors)?input.runtimeErrors.filter(v=>typeof v==='string').slice(0,100):[];
 if(input.setupError)findings.push({code:'setup-error',severity:'warning',message:String(input.setupError).slice(0,4000)});
 for(const error of runtimeErrors)findings.push({code:'runtime-error',severity:'warning',message:error.slice(0,4000),record:error.slice(0,4000)});
 return {schemaVersion:1,kind:'frontend-evidence',at:input.at,target:target.href,viewport:{width:input.viewport.width,height:input.viewport.height},checkerSha256:typeof input.checkerSha256==='string'&&/^[a-f0-9]{64}$/.test(input.checkerSha256)?input.checkerSha256:'',adapterSha256:validDigest(input.adapterSha256)?input.adapterSha256:'',browser:typeof input.browser==='string'?input.browser:'unknown',executionProfile:normalizeExecutionProfile(input.executionProfile),blockedMethods:Array.isArray(input.blockedMethods)&&input.blockedMethods.length<=1000&&input.blockedMethods.every(method=>typeof method==='string'&&/^[A-Z]{1,16}$/.test(method))?[...input.blockedMethods]:null,blockedTransports:Array.isArray(input.blockedTransports)&&input.blockedTransports.length<=1000&&input.blockedTransports.every(value=>typeof value==='string'&&/^[a-z-]{1,32}$/.test(value))?[...input.blockedTransports]:null,targetStateSha256:validDigest(input.targetStateSha256)?input.targetStateSha256:'',requestedTarget:typeof input.requestedTarget==='string'?input.requestedTarget:'',initialViewport:input.initialViewport&&Number.isInteger(input.initialViewport.width)&&Number.isInteger(input.initialViewport.height)?{width:input.initialViewport.width,height:input.initialViewport.height}:null,checks,findings,setupError:!!input.setupError,runtimeErrors,executionComplete:input.executionComplete===false?false:!input.setupError&&Array.isArray(input.runtimeErrors)&&input.runtimeErrors.length===0&&Array.isArray(input.blockedMethods)&&input.blockedMethods.length===0&&Array.isArray(input.blockedTransports)&&input.blockedTransports.length===0&&!!normalizeExecutionProfile(input.executionProfile),limits:['Imported CLI observations, not a fresh browser run or physical-device certification.','Only checks present in both reports with matching IDs and types can be compared.','A changed adapter, target, viewport, browser or check scope prevents a confirmed resolution.']};
}
export function compareRuns(before,after){
 if(!before?.report||!after?.report)throw Error('Two saved runs are required.');
 const kind=reportKind(before.report),other=reportKind(after.report),warnings=[];
 if(kind!==other)return {compatible:false,reason:'different-kind',added:[],remaining:[],resolved:[],unverified:[],warnings:['different-kind']};
 if(before.id===after.id)return {compatible:false,reason:'same-run',added:[],remaining:[],resolved:[],unverified:[],warnings:['same-run']};
 const a=before.report,b=after.report;
 if(!Array.isArray(a.findings)||!Array.isArray(b.findings))throw Error('Two saved runs with findings arrays are required.');
 if(kind==='frontend'&&(!Array.isArray(a.checks)||!Array.isArray(b.checks)||!a.viewport||!b.viewport||!Array.isArray(a.runtimeErrors)||!Array.isArray(b.runtimeErrors)))throw Error('Frontend comparison requires normalized frontend-evidence reports.');
 if(kind==='frontend')for(const report of [a,b])normalizeFrontendEvidence({...report,results:report.checks});
 let scopeChanged=false;
 if(before.objectKey&&after.objectKey&&before.objectKey!==after.objectKey){warnings.push('different-object');scopeChanged=true;}
 if(before.engine!==after.engine){warnings.push('engine-changed');scopeChanged=true;}
 let graphDiff=null,environmentDiff=null;
 if(kind==='blog'){
  const scope=r=>JSON.stringify([r.scope?.siteOrigin,r.scope?.evidenceScope||'stored-links',r.scope?.coverage,(r.pages||[]).map(p=>[p.url,p.kind||'article',p.cluster||null,p.locale||null,p.textScope||'unknown']).sort((x,y)=>x[0].localeCompare(y[0]))]);
  if(scope(a)!==scope(b)){scopeChanged=true;warnings.push('inventory-scope-changed');}
  const edgeKey=e=>`${e.source} -> ${e.target}`;
  const edgesA=new Map((a.edges||[]).map(e=>[edgeKey(e),e])),edgesB=new Map((b.edges||[]).map(e=>[edgeKey(e),e]));
  const pagesA=new Set((a.pages||[]).map(p=>p.url)),pagesB=new Set((b.pages||[]).map(p=>p.url));
  graphDiff={
   addedEdges:[...edgesB.entries()].filter(([k])=>!edgesA.has(k)).map(([,e])=>e),
   removedEdges:[...edgesA.entries()].filter(([k])=>!edgesB.has(k)).map(([,e])=>e),
   addedPages:[...pagesB].filter(u=>!pagesA.has(u)),
   removedPages:[...pagesA].filter(u=>!pagesB.has(u))
  };
 }
 if(kind==='frontend'){
  if(!validDigest(a.checkerSha256)||!validDigest(b.checkerSha256)){scopeChanged=true;warnings.push('unversioned-checker');}
  if(!validDigest(a.adapterSha256)||!validDigest(b.adapterSha256)){scopeChanged=true;warnings.push('unversioned-adapter');}
  if(!knownBrowser(a.browser)||!knownBrowser(b.browser)){scopeChanged=true;warnings.push('unversioned-browser');}
  if(a.checkerSha256!==b.checkerSha256){scopeChanged=true;if(!warnings.includes('engine-changed'))warnings.push('engine-changed');}
  const profileA=normalizeExecutionProfile(a.executionProfile),profileB=normalizeExecutionProfile(b.executionProfile);
  if(!profileA||!profileB||!Array.isArray(a.blockedMethods)||!Array.isArray(b.blockedMethods)||!Array.isArray(a.blockedTransports)||!Array.isArray(b.blockedTransports)){scopeChanged=true;warnings.push('execution-profile-unknown');}
  else if(JSON.stringify(profileA)!==JSON.stringify(profileB)){scopeChanged=true;warnings.push('execution-profile-changed');}
  if(!validDigest(a.targetStateSha256)||!validDigest(b.targetStateSha256)){scopeChanged=true;warnings.push('unversioned-target-state');}
  const scope=r=>JSON.stringify([r.target,r.targetStateSha256,r.viewport,r.adapterSha256,r.browser,r.checks.map(c=>[c.id,c.type]).sort()]);
  if(scope(a)!==scope(b)){scopeChanged=true;warnings.push('frontend-scope-changed');}
  if(a.executionComplete===false||b.executionComplete===false||a.setupError||a.runtimeErrors.length||b.setupError||b.runtimeErrors.length||a.blockedMethods?.length||b.blockedMethods?.length||a.blockedTransports?.length||b.blockedTransports?.length){scopeChanged=true;warnings.push('run-incomplete');}
  environmentDiff={
   targetChanged:a.target!==b.target,
   viewportChanged:JSON.stringify(a.viewport)!==JSON.stringify(b.viewport),
   browserChanged:a.browser!==b.browser,
   adapterChanged:a.adapterSha256!==b.adapterSha256,
   checkerChanged:a.checkerSha256!==b.checkerSha256,
   executionProfileChanged:JSON.stringify(profileA)!==JSON.stringify(profileB),
   targetStateChanged:a.targetStateSha256!==b.targetStateSha256,
   before:{target:a.target,viewport:`${a.viewport.width}×${a.viewport.height}`,browser:a.browser,adapterSha256:a.adapterSha256||'',checkerSha256:a.checkerSha256||'',executionProfile:profileA,targetStateSha256:a.targetStateSha256||''},
   after:{target:b.target,viewport:`${b.viewport.width}×${b.viewport.height}`,browser:b.browser,adapterSha256:b.adapterSha256||'',checkerSha256:b.checkerSha256||'',executionProfile:profileB,targetStateSha256:b.targetStateSha256||''}
  };
 }
 const current=new Map(b.findings.map(f=>[findingKey(f),f])),old=new Map(a.findings.map(f=>[findingKey(f),f]));
 const added=[],remaining=[],resolved=[],unverified=[];
 for(const [id,finding]of current){if(old.has(id))remaining.push({...finding,previousSeverity:old.get(id).severity});else added.push(finding);}
 for(const [id,finding]of old){
  if(current.has(id))continue;
  let confirmed=!scopeChanged;
  if(kind==='editorial'){
   const code=diagnosticFor[finding.code],check=b.diagnostics?.checks?.find(c=>c.code===code);
   if(!code||!check||check.status!=='good')confirmed=false;
   const beforeCtx=before.context||a.context||null,afterCtx=after.context||b.context||null;
   if(['primaryQuery','h1Mode','glossary','sitePaths'].some(k=>JSON.stringify(beforeCtx?.[k]??null)!==JSON.stringify(afterCtx?.[k]??null))){confirmed=false;if(!warnings.includes('configuration-changed'))warnings.push('configuration-changed');}
   if(finding.record&&['unbound-fact','unknown-source','unreviewed-source','claim-not-in-draft','missing-calculation-evidence','observation-needs-review'].includes(finding.code)&&!afterCtx?.claimIds?.includes(finding.record))confirmed=false;
  }
  if(kind==='frontend'){const baseline=a.checks.find(c=>c.id===finding.record),repeat=b.checks.find(c=>c.id===finding.record);confirmed=confirmed&&finding.code==='behavior-failed'&&baseline?.status==='fail'&&repeat?.status==='pass'&&baseline.type===repeat.type;}
  (confirmed?resolved:unverified).push(finding);
 }
 const metrics=kind==='blog'?['pages','distinctInternalEdges','noObservedIncoming','unresolvedTargets'].map(name=>({name,before:a.summary?.[name]??null,after:b.summary?.[name]??null})):[];
 return {compatible:true,kind,added,remaining,resolved,unverified,warnings,metrics,graphDiff,environmentDiff,scopeChanged};
}
export function editorialContext(packet){return {primaryQuery:packet.primaryQuery,h1Mode:packet.article?.h1Mode,sitePaths:packet.sitePaths,glossary:packet.glossary,claimIds:packet.claims?.map(c=>c.id)||[]};}
function toRunEnvelope(item,fallbackId){
 if(item&&typeof item==='object'&&item.report&&typeof item.report==='object'){
  const rep=item.report.kind==='frontend-evidence'||!Array.isArray(item.report.results)?item.report:normalizeFrontendEvidence(item.report);
  if(!Array.isArray(rep?.findings))throw Error('Invalid report for comparison.');
  return {...item,id:item.id||fallbackId,report:rep,engine:item.engine||rep.checkerSha256||'same-core',context:item.context??rep.context??null};
 }
 const rep=item?.kind==='frontend-evidence'||!Array.isArray(item?.results)?item:normalizeFrontendEvidence(item);
 if(!Array.isArray(rep?.findings))throw Error('Invalid report for comparison.');
 return {id:fallbackId,report:rep,engine:rep?.checkerSha256||'same-core',context:rep?.context??null};
}
export function compareReports(beforeInput,afterInput){
 return compareRuns(toRunEnvelope(beforeInput,'before'),toRunEnvelope(afterInput,'after'));
}
