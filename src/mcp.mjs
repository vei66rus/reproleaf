import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {McpServer} from '@modelcontextprotocol/server';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {version} from './version.mjs';
import {z} from 'zod';
import {catalog,getCase,root} from './catalog.mjs';
import {inspectFreshness} from './evidence.mjs';
import {editorialSchema,getWorkflow,reviewEditorial} from './editorial.mjs';
import {adapterSchema} from './adapter.mjs';
import {blogSchema,auditBlog} from './blog-graph.mjs';
import {auditBlogFile} from './blog.mjs';
import {diagnoseSchema,diagnoseProject} from './diagnose-project.mjs';
import {compareReports} from './history.mjs';
import {getSiteProjectContext,siteProjectInputSchema,getProjectTasks,updateProjectTask,projectTaskUpdateSchema} from './site-project.mjs';
import {caseCitationUrl,listCheckRules,getCheckRule,listCheckRulesSchema,getCheckRuleSchema} from './check-rules.mjs';
export function createServer({publicMode=process.env.REPROLEAF_PUBLIC_MCP==='1',siteProjectOptions={}}={}){
const server=new McpServer({name:'reproleaf',version},{maxToolInputElements:400000});
const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
const id=z.enum(catalog.cases.map(c=>c.id));
const response=data=>({content:[{type:'text',text:JSON.stringify(data,null,2)}]});
server.registerTool('list_cases',{description:'List synthetic mobile web reproductions. This is a local pilot, not certified real-device results or a scanner for arbitrary sites.',inputSchema:z.object({query:z.string().max(120).optional(),limit:z.number().int().min(1).max(20).default(10),offset:z.number().int().min(0).max(10000).default(0)}),annotations},async({query,limit,offset})=>{
 const q=(query||'').toLowerCase();const matches=catalog.cases.filter(c=>JSON.stringify(c).toLowerCase().includes(q));return response({status:catalog.status,provenance:catalog.provenance,total:matches.length,nextOffset:offset+limit<matches.length?offset+limit:null,cases:matches.slice(offset,offset+limit).map(item=>({...item,citationUrl:caseCitationUrl(item.id)}))});
});
server.registerTool('get_case',{description:'Get the symptom, acceptance condition, limitations, stable documentation citation and local run command for a known synthetic case.',inputSchema:z.object({id}),annotations},async({id})=>response({...getCase(id),provenance:catalog.provenance,runCommand:`node src/cli.mjs verify --case ${id}`,casePage:caseCitationUrl(id),citationUrl:caseCitationUrl(id),measurementScope:'Synthetic fixture; independent behavioral check implementation, not independent third-party or physical-device certification.'}));
server.registerTool('list_check_rules',{description:'List versioned deterministic check rules with required inputs, observed conditions, limitations and stable methodology citations. No source fetching, scoring or ranking prediction.',inputSchema:listCheckRulesSchema,annotations},async input=>response(listCheckRules(input)));
server.registerTool('get_check_rule',{description:'Get one bundled check rule by domain-qualified ID, including what its observation does and does not establish.',inputSchema:getCheckRuleSchema,annotations},async input=>response(getCheckRule(input)));
if(!publicMode){
 server.registerTool('get_site_project_context',{description:'Read compact saved private site crawl observations using the operator-configured HTTPS endpoint and project token. Input is a job UUID, optionally defaulted from REPROLEAF_SITE_JOB_ID. Returns readiness, observed scope, prioritized checks, lexical link candidates and cautious run comparison; does not crawl, execute source text, read files or publish.',inputSchema:siteProjectInputSchema,annotations:{...annotations,openWorldHint:true}},async input=>response(await getSiteProjectContext(input,{...siteProjectOptions,publicMode:false})));
 server.registerTool('get_project_tasks',{description:'Read saved private project tasks and separate observed evidence from operator decisions. Uses only the configured project endpoint and token; no automatic mutation or crawl.',inputSchema:siteProjectInputSchema,annotations:{...annotations,openWorldHint:true}},async input=>response(await getProjectTasks(input,{...siteProjectOptions,publicMode:false})));
 server.registerTool('update_project_task',{description:'Save an explicit operator task decision in the configured private project. Omit note unless intentionally replacing the complete saved note; do not copy a redacted display back. Changes only todo/doing/deferred/dismissed and an explicitly supplied note; does not resolve observed findings, alter site content or start a crawl. Call only for a requested task change.',inputSchema:projectTaskUpdateSchema,annotations:{...annotations,readOnlyHint:false,openWorldHint:true}},async input=>response(await updateProjectTask(input,{...siteProjectOptions,publicMode:false})));
 server.registerTool('get_case_source',{description:'Read freshly written example or independent check source from an explicit allowlist. Cannot access owner projects, arbitrary paths, environment files or git history.',inputSchema:z.object({id,asset:z.enum(['fixture','shared','styles','checks'])}),annotations},async({id,asset})=>{
  const item=getCase(id),relative={fixture:item.source,shared:'fixtures/shared.js',styles:'fixtures/fixture.css',checks:'src/checks.mjs'}[asset];
  return response({caseId:id,relative,provenance:catalog.provenance,source:await readFile(path.join(root,relative),'utf8')});
 });
 server.registerTool('get_latest_evidence',{description:'Read the most recent local verifier evidence for a case. Returns no result until an actual run exists. Never invents a pass from fixture metadata.',inputSchema:z.object({id}),annotations},async({id})=>{
  getCase(id);const directory=path.join(root,'artifacts/runs');let entries;
  try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return response({caseId:id,status:'not-run'});throw error;}
  const reports=[];
  for(const entry of entries.filter(e=>e.isDirectory()))try{const report=JSON.parse(await readFile(path.join(directory,entry.name,'report.json'),'utf8'));if(report.runs.some(r=>r.caseId===id))reports.push(report);}catch{}
  reports.sort((a,b)=>b.at.localeCompare(a.at));const report=reports[0];
  return response(report?{caseId:id,at:report.at,freshness:await inspectFreshness(report),environment:report.environment,packages:report.packages,sourceHashes:report.sourceHashes,runs:report.runs.filter(r=>r.caseId===id),limitations:'Locally generated synthetic evidence; not an independently audited benchmark or physical device result. Stale results are historical, not current verification.'}:{caseId:id,status:'not-run'});
 });
}
for(const item of catalog.cases)server.registerResource(item.id,`mwc://cases/${item.id}`,{mimeType:'application/json',description:item.title},async uri=>({contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify({...item,provenance:catalog.provenance,citationUrl:caseCitationUrl(item.id)},null,2)}]}));
server.registerTool('list_workflows',{description:'List newly generalized workflows and their automation limits. Does not read private project documents.',inputSchema:z.object({}),annotations},async()=>response({workflows:[{id:'mobile-web-review',purpose:'Reproduce and verify a mobile UI failure with local acceptance evidence.'},{id:'editorial-evidence',purpose:'Prepare and review an article evidence packet; no ranking or factual-truth guarantee.'},{id:'blog-link-graph',purpose:'Audit supplied internal link coverage and editorial link candidates.'}]}));
if(!publicMode){
 server.registerTool('get_workflow',{description:'Retrieve a bundled workflow with its declarative input schema. These are abstractions, not original client/project documents.',inputSchema:z.object({id:z.enum(['mobile-web-review','editorial-evidence','blog-link-graph'])}),annotations},async({id})=>response(id==='editorial-evidence'?{...await getWorkflow(),packetSchema:z.toJSONSchema(editorialSchema)}:id==='blog-link-graph'?{...JSON.parse(await readFile(path.join(root,'packs/blog-link-graph/workflow.json'),'utf8')),inventorySchema:z.toJSONSchema(blogSchema)}:{id,skill:await readFile(path.join(root,'skills/mobile-web-review/SKILL.md'),'utf8'),adapterSchema:z.toJSONSchema(adapterSchema)}));
}
server.registerTool('review_editorial_packet',{description:'Check supplied article metadata, declared claim/source bindings, calculations, glossary variants and internal link inventory. Does not fetch sources, infer all unsupported prose, validate factual truth, publish or predict rankings.',inputSchema:z.object({packet:editorialSchema}),annotations},async({packet})=>response(reviewEditorial(packet)));
server.registerTool('audit_blog_links',{description:'Audit a supplied blog inventory, or the single local file explicitly configured by the operator in REPROLEAF_INVENTORY_FILE. No arbitrary path argument or crawling. Distinguishes internal incoming from backlinks, unresolved from broken, and lexical candidates from semantic judgments.',inputSchema:z.object({inventory:publicMode?blogSchema:blogSchema.optional()}),annotations},async({inventory})=>response(inventory?auditBlog(inventory):publicMode?(()=>{throw Error('Public MCP mode requires an inline inventory object.');})():await auditBlogFile(process.env.REPROLEAF_INVENTORY_FILE)));
server.registerTool('diagnose_project',{description:'Rank candidate UI checks from supplied metadata. For multiple applications, supply applications and select activeApplication; without selection no adapter is generated. Dependencies do not establish route rendering mode. Supply interaction facts to exclude inapplicable canvas or hydration cases. Candidates require precondition checks and are not observed bugs. No repository files are read.',inputSchema:diagnoseSchema,annotations},async input=>response(diagnoseProject(input)));
server.registerTool('compare_check_runs',{description:'Compare a baseline and post-fix check report (frontend adapter, editorial or blog graph). Reports resolved, remaining, added and unverified findings and highlights any change in viewport, browser, adapterSha256 or checkerSha256.',inputSchema:z.object({before:z.record(z.string(),z.unknown()),after:z.record(z.string(),z.unknown())}),annotations},async({before,after})=>response(compareReports(before,after)));
return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 serveStdio(createServer,{onerror:error=>console.error(error.message)});
}
