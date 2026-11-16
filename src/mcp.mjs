#!/usr/bin/env node
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
import {rewriteGuardSchema,checkRewritePreservation} from './rewrite-guard.mjs';
import {htmlAuditSchema,auditHtmlDocument} from './html-audit.mjs';
import {schemaAuditSchema,auditJsonLd} from './schema-audit.mjs';
import {socialAuditSchema,auditSocialMeta} from './social-audit.mjs';
import {crawlPolicyAuditSchema,auditCrawlPolicy} from './crawl-policy-audit.mjs';
import {redirectAuditSchema,auditRedirectTraces} from './redirect-audit.mjs';
import {cocoonAuditSchema,auditCocoonGraph} from './cocoon-audit.mjs';
import {hreflangAuditSchema,auditHreflangMatrix} from './hreflang-audit.mjs';
import {llmsTxtAuditSchema,llmsTxtGenerateSchema,auditLlmsTxt,generateLlmsTxt} from './llms-txt.mjs';
import {aiCrawlerAuditSchema,auditAiCrawlerAccess} from './ai-crawler-audit.mjs';
import {ragChunkAuditSchema,auditRagChunks} from './rag-chunk-audit.mjs';
import {groundingAuditSchema,auditClaimGrounding} from './grounding-audit.mjs';
import {terminologyAuditSchema,auditTerminologyConsistency} from './terminology-audit.mjs';
import {hydrationDiffSchema,auditRawVsRenderedHtml} from './hydration-diff-audit.mjs';
import {promptInjectionAuditSchema,auditPromptInjectionAndHiddenText} from './prompt-injection-audit.mjs';
import {serpSnippetSchema,auditSerpSnippet} from './serp-snippet-audit.mjs';
import {domPerfAuditSchema,auditDomPerfHints} from './dom-perf-audit.mjs';
import {cannibalizationAuditSchema,auditCannibalizationMatrix} from './cannibalization-audit.mjs';
import {indexationHygieneSchema,auditIndexationHygiene} from './indexation-hygiene-audit.mjs';
import {editorialClaritySchema,auditEditorialClarity} from './editorial-clarity-audit.mjs';
import {answerFirstSchema,auditAnswerFirst} from './answer-first-audit.mjs';
import {fixGeneratorSchema,suggestSeoFixes} from './fix-generator.mjs';
import {llmsBundleSchema,buildLlmsBundle} from './llms-bundle.mjs';
import {llmsBudgetSchema,auditLlmsBudget} from './llms-budget-audit.mjs';
import {geoReadinessSchema,auditGeoReadiness} from './geo-readiness-audit.mjs';
import {listMethodologies,buildMethodologyPacketSchema,buildMethodologyPacket} from './methodology-packets.mjs';
import {serpClusterSchema,clusterSerpKeywords} from './serp-clusterer.mjs';
import {serpGapSchema,analyzeSerpGap} from './serp-gap-analyzer.mjs';
import {cocoonPlanSchema,planCocoonAndAnchors} from './cocoon-planner.mjs';
import {contentBriefSchema,generateContentBrief} from './content-brief-generator.mjs';
import {eeatAuditSchema,auditEeatSignals} from './eeat-audit.mjs';
import {liveCrawlHreflangSchema,auditLiveCrawlHreflang,segmentedSitemapSchema,buildSegmentedSitemaps} from './sitemap-indexnow.mjs';
import {accessibilitySchema,auditStaticAccessibility} from './static-accessibility.mjs';
import {getServerInstructions} from './server-instructions.mjs';
export function createServer({publicMode=process.env.REPROLEAF_PUBLIC_MCP==='1',siteProjectOptions={}}={}){
const server=new McpServer({name:'reproleaf',version},{maxToolInputElements:400000,instructions:getServerInstructions({publicMode})});
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
 server.registerTool('audit_static_accessibility',{description:'Explicit local browser opt-in only: require allowBrowser:true to inspect supplied HTML using axe-core on a sanitized static DOM. Runs a bounded isolated child; active documents rejected, source scripts and external resources removed, all browser requests aborted. No URL fetching, public gateway, OS-network-sandbox claim or WCAG-conformance score. Missing browser runtime is unavailable. Incomplete checks and dynamic/external styles require review.',inputSchema:accessibilitySchema,annotations},async input=>response(await auditStaticAccessibility(input)));
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
server.registerTool('check_rewrite_preservation',{description:'Check before/after text blocks for preserved numbers, URLs, formulas, code spans and negation/condition markers. Deterministic token checks do not prove semantic preservation.',inputSchema:rewriteGuardSchema,annotations},async input=>response(checkRewritePreservation(input)));
server.registerTool('audit_html_document',{description:'Audit supplied static HTML for multiple canonicals, hreflang validity, encoding/mojibake, H1-H6 outline and robots meta without fetching URLs.',inputSchema:htmlAuditSchema,annotations},async input=>response(auditHtmlDocument(input)));
server.registerTool('audit_jsonld_schema',{description:'Validate Schema.org JSON-LD structured data blocks inside supplied static HTML without fetching URLs.',inputSchema:schemaAuditSchema,annotations},async input=>response(auditJsonLd(input)));
server.registerTool('audit_social_meta',{description:'Audit OpenGraph and Twitter Card meta tags and build a social share preview from supplied static HTML without fetching URLs.',inputSchema:socialAuditSchema,annotations},async input=>response(auditSocialMeta(input)));
server.registerTool('audit_crawl_policy',{description:'Cross-check supplied robots.txt, sitemap.xml and optional page canonical/noindex metadata without fetching URLs.',inputSchema:crawlPolicyAuditSchema,annotations},async input=>response(auditCrawlPolicy(input)));
server.registerTool('audit_redirect_chains',{description:'Audit supplied HTTP redirect hop traces for loops, multi-hop chains, temporary 302/307 redirects and 4xx/5xx targets without network requests.',inputSchema:redirectAuditSchema,annotations},async input=>response(auditRedirectTraces(input)));
server.registerTool('audit_semantic_cocoon',{description:'Audit internal link anchors, click depth, orphan pages and semantic cocoon hub/supporting structure without crawling URLs.',inputSchema:cocoonAuditSchema,annotations},async input=>response(auditCocoonGraph(input)));
server.registerTool('audit_hreflang_matrix',{description:'Validate reciprocal hreflang return links, self-references, x-default, canonical alignment and html[lang] across a page matrix without fetching URLs.',inputSchema:hreflangAuditSchema,annotations},async input=>response(auditHreflangMatrix(input)));
server.registerTool('audit_llms_txt',{description:'Validate an llms.txt markdown file for H1, blockquote summary, ## sections, absolute links and safe schemes without fetching URLs.',inputSchema:llmsTxtAuditSchema,annotations},async input=>response(auditLlmsTxt(input)));
server.registerTool('generate_llms_txt',{description:'Generate and validate a spec-compliant llms.txt markdown document from structured sections and links.',inputSchema:llmsTxtGenerateSchema,annotations},async input=>response(generateLlmsTxt(input)));
server.registerTool('audit_ai_crawler_access',{description:'Check AI search/training crawler rules in robots.txt and non-JS HTML citation readiness without network requests.',inputSchema:aiCrawlerAuditSchema,annotations},async input=>response(auditAiCrawlerAccess(input)));
server.registerTool('audit_rag_chunks',{description:'Evaluate passage extractability, chunk word lengths and pronoun-dependent openers for RAG/AI answer engines.',inputSchema:ragChunkAuditSchema,annotations},async input=>response(auditRagChunks(input)));
server.registerTool('audit_claim_grounding',{description:'Check quantitative claims in Markdown for nearby source links, citations or methodology cues without fetching external URLs.',inputSchema:groundingAuditSchema,annotations},async input=>response(auditClaimGrounding(input)));
server.registerTool('audit_terminology_consistency',{description:'Check entity and terminology consistency across one or more documents against a canonical glossary, aliases and forbidden variants.',inputSchema:terminologyAuditSchema,annotations},async input=>response(auditTerminologyConsistency(input)));
server.registerTool('audit_hydration_diff',{description:'Compare raw server HTML against client-rendered DOM HTML for CSR-only content, missing H1, canonical/robots mutations and client-only JSON-LD without fetching URLs.',inputSchema:hydrationDiffSchema,annotations},async input=>response(auditRawVsRenderedHtml(input)));
server.registerTool('audit_prompt_injection',{description:'Detect hidden CSS/HTML text cloaking and prompt-injection override phrases in HTML or Markdown without network requests.',inputSchema:promptInjectionAuditSchema,annotations},async input=>response(auditPromptInjectionAndHiddenText(input)));
server.registerTool('audit_serp_snippet',{description:'Measure title and meta description pixel widths, detect SERP truncation, H1 duplication and primary query alignment without network requests.',inputSchema:serpSnippetSchema,annotations},async input=>response(auditSerpSnippet(input)));
server.registerTool('audit_dom_perf_hints',{description:'Check static HTML for Core Web Vitals DOM risks (missing image dimensions, lazy hero images, blocking head scripts, viewport, DOM size/depth) without network requests.',inputSchema:domPerfAuditSchema,annotations},async input=>response(auditDomPerfHints(input)));
server.registerTool('audit_cannibalization',{description:'Detect keyword cannibalization and high topic/intent token overlap across a matrix of page titles, H1s, headings and primary queries.',inputSchema:cannibalizationAuditSchema,annotations},async input=>response(auditCannibalizationMatrix(input)));
server.registerTool('audit_indexation_hygiene',{description:'Audit pagination canonicals, tracking/facet query parameters, noindex-canonical conflicts and archive routes across supplied page metadata.',inputSchema:indexationHygieneSchema,annotations},async input=>response(auditIndexationHygiene(input)));
server.registerTool('audit_editorial_clarity',{description:'Audit Markdown drafts for walls of text, overlong sentences, generic AI/filler cliches and list/table scannability.',inputSchema:editorialClaritySchema,annotations},async input=>response(auditEditorialClarity(input)));
server.registerTool('audit_answer_first',{description:'Audit H2/H3 headings in Markdown or HTML to verify whether the first paragraph delivers a direct answer within word limits without filler preambles.',inputSchema:answerFirstSchema,annotations},async input=>response(auditAnswerFirst(input)));
server.registerTool('suggest_seo_fixes',{description:'Generate ready-to-paste HTML title, meta description, canonical, OpenGraph/Twitter tags and JSON-LD snippets from supplied page metadata without inventing facts.',inputSchema:fixGeneratorSchema,annotations},async input=>response(suggestSeoFixes(input)));
server.registerTool('build_llms_bundle',{description:'Build curated llms.txt index and token-capped llms-full.txt bundle from supplied page metadata and markdown.',inputSchema:llmsBundleSchema,annotations},async input=>response(buildLlmsBundle(input)));
server.registerTool('audit_llms_budget',{description:'Audit llms.txt structure and linked page token footprint against a target context window, detecting duplicate URLs, missing targets and oversized core sections.',inputSchema:llmsBudgetSchema,annotations},async input=>response(auditLlmsBudget(input)));
server.registerTool('audit_geo_readiness',{description:'Run a composite GEO and AI citation readiness scorecard across AI crawler access, llms.txt, JSON-LD, answer-first structure, RAG chunks and prompt-injection safety.',inputSchema:geoReadinessSchema,annotations},async input=>response(auditGeoReadiness(input)));
server.registerTool('list_methodologies',{description:'List deterministic SEO/GEO review methodologies, sections and scope limits.',inputSchema:z.object({}),annotations},async()=>response(listMethodologies()));
server.registerTool('prepare_methodology_packet',{description:'Build a SHA-256 bound methodology review packet with prompt and JSON output contract for BYO-model or local Ollama execution.',inputSchema:buildMethodologyPacketSchema,annotations},async input=>response(buildMethodologyPacket(input)));
server.registerTool('cluster_serp_keywords',{description:'Cluster keyword SERP Top-10 URLs using Hard or Soft overlap and bind clusters to existing site pages.',inputSchema:serpClusterSchema,annotations},async input=>response(clusterSerpKeywords(input)));
server.registerTool('analyze_serp_gap',{description:'Compare target HTML/profile against Top-10 SERP competitor benchmarks for word count, headings, tables, FAQ, Schema types and recurring terms.',inputSchema:serpGapSchema,annotations},async input=>response(analyzeSerpGap(input)));
server.registerTool('plan_cocoon_anchors',{description:'Plan Pillar->Cluster->Supporting internal links, check anchor distribution balance and match donor draft paragraphs without network requests.',inputSchema:cocoonPlanSchema,annotations},async input=>response(planCocoonAndAnchors(input)));
server.registerTool('generate_content_brief',{description:'Compile a structured Markdown and JSON SEO/GEO content brief with Answer-First limits, RAG chunk targets, glossary rules and explicit [FACT_GAP] placeholders.',inputSchema:contentBriefSchema,annotations},async input=>response(generateContentBrief(input)));
server.registerTool('audit_eeat_signals',{description:'Audit HTML and JSON-LD for E-E-A-T trust signals (author byline, Person/Organization schema, publication/modified dates, primary sources and trust links).',inputSchema:eeatAuditSchema,annotations},async input=>response(auditEeatSignals(input)));
server.registerTool('audit_live_crawl_hreflang',{description:'Audit hreflang reciprocity, self-links and non-200 targets across exported crawl pages or static HTML captures without network requests.',inputSchema:liveCrawlHreflangSchema,annotations},async input=>response(auditLiveCrawlHreflang(input)));
server.registerTool('build_segmented_sitemaps',{description:'Generate origin-validated segmented XML urlsets and sitemapindex without network requests.',inputSchema:segmentedSitemapSchema,annotations},async input=>response(buildSegmentedSitemaps(input)));
return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 serveStdio(createServer,{onerror:error=>console.error(error.message)});
}
