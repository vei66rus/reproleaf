import http from 'node:http';
import {version} from './version.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {editorialSchema,reviewEditorial} from './editorial-core.mjs';
import {blogSchema,auditBlog} from './blog-graph.mjs';
import {adapterSchema} from './adapter.mjs';
import {diagnoseSchema,diagnoseProject} from './diagnose-project.mjs';
import {compareReports} from './history.mjs';
import {catalog,getCase} from './catalog.mjs';
import {findingCodeCatalog,errorCodeCatalog,clientSetups} from './client-setups.mjs';
import {aiReviewRequestSchema,resolveAiConfig,createAiBudgetTracker,runAiReview} from './ai-review.mjs';
import {sanitizeReportSchema,contributionSchema,sanitizeReportForSharing,prepareContributionPacket} from './public-share.mjs';
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
import {listMethodologies,buildMethodologyPacketSchema,buildMethodologyPacket,validateMethodologyResultSchema,validateMethodologyResult} from './methodology-packets.mjs';
import {serpClusterSchema,clusterSerpKeywords} from './serp-clusterer.mjs';
import {serpGapSchema,analyzeSerpGap} from './serp-gap-analyzer.mjs';
import {cocoonPlanSchema,planCocoonAndAnchors} from './cocoon-planner.mjs';
import {contentBriefSchema,generateContentBrief} from './content-brief-generator.mjs';
import {eeatAuditSchema,auditEeatSignals} from './eeat-audit.mjs';
import {liveCrawlHreflangSchema,auditLiveCrawlHreflang,segmentedSitemapSchema,buildSegmentedSitemaps} from './sitemap-indexnow.mjs';
import {caseCitationUrl,listCheckRules,getCheckRule,listCheckRulesSchema,getCheckRuleSchema} from './check-rules.mjs';
import {publicGatewayLimits,parsePublicRpc,rpcError,assertPublicRequestBudget,proxyClientIdentity,exactOriginAllowed,normalizePeer,acceptsPublicMcp} from './public-gateway-policy.mjs';
import {getServerInstructions} from './server-instructions.mjs';

const compareInputSchema=z.object({
 before:z.record(z.string(),z.unknown()),
 after:z.record(z.string(),z.unknown())
}).strict();

const listCasesInputSchema=z.object({
 query:z.string().max(120).optional(),
 limit:z.number().int().min(1).max(20).default(10),
 offset:z.number().int().min(0).max(10000).default(0)
}).strict();

const caseIdSchema=z.object({id:z.enum(catalog.cases.map(c=>c.id))}).strict();

const precomputedSchemas={
 schemaVersion:1,
 publicGatewayLimits,
 schemas:{
  editorial:z.toJSONSchema(editorialSchema),
  blog:z.toJSONSchema(blogSchema),
  adapter:z.toJSONSchema(adapterSchema),
  diagnose:z.toJSONSchema(diagnoseSchema),
  aiReview:z.toJSONSchema(aiReviewRequestSchema),
  sanitizeReport:z.toJSONSchema(sanitizeReportSchema),
  contribution:z.toJSONSchema(contributionSchema),
  rewriteGuard:z.toJSONSchema(rewriteGuardSchema),
  htmlAudit:z.toJSONSchema(htmlAuditSchema),
  schemaAudit:z.toJSONSchema(schemaAuditSchema),
  socialAudit:z.toJSONSchema(socialAuditSchema),
  crawlPolicyAudit:z.toJSONSchema(crawlPolicyAuditSchema),
  redirectAudit:z.toJSONSchema(redirectAuditSchema),
  cocoonAudit:z.toJSONSchema(cocoonAuditSchema),
  hreflangAudit:z.toJSONSchema(hreflangAuditSchema),
  llmsTxtAudit:z.toJSONSchema(llmsTxtAuditSchema),
  llmsTxtGenerate:z.toJSONSchema(llmsTxtGenerateSchema),
  aiCrawlerAudit:z.toJSONSchema(aiCrawlerAuditSchema),
  ragChunkAudit:z.toJSONSchema(ragChunkAuditSchema),
  groundingAudit:z.toJSONSchema(groundingAuditSchema),
  terminologyAudit:z.toJSONSchema(terminologyAuditSchema),
  hydrationDiffAudit:z.toJSONSchema(hydrationDiffSchema),
  promptInjectionAudit:z.toJSONSchema(promptInjectionAuditSchema),
  serpSnippetAudit:z.toJSONSchema(serpSnippetSchema),
  domPerfAudit:z.toJSONSchema(domPerfAuditSchema),
  cannibalizationAudit:z.toJSONSchema(cannibalizationAuditSchema),
  indexationHygieneAudit:z.toJSONSchema(indexationHygieneSchema),
  editorialClarityAudit:z.toJSONSchema(editorialClaritySchema),
  answerFirstAudit:z.toJSONSchema(answerFirstSchema),
  fixGenerator:z.toJSONSchema(fixGeneratorSchema),
  llmsBundle:z.toJSONSchema(llmsBundleSchema),
  llmsBudgetAudit:z.toJSONSchema(llmsBudgetSchema),
  geoReadinessAudit:z.toJSONSchema(geoReadinessSchema),
  methodologyPacket:z.toJSONSchema(buildMethodologyPacketSchema),
  validateMethodologyResult:z.toJSONSchema(validateMethodologyResultSchema),
  serpCluster:z.toJSONSchema(serpClusterSchema),
  serpGap:z.toJSONSchema(serpGapSchema),
  cocoonPlan:z.toJSONSchema(cocoonPlanSchema),
  contentBrief:z.toJSONSchema(contentBriefSchema),
  eeatAudit:z.toJSONSchema(eeatAuditSchema),
  liveCrawlHreflang:z.toJSONSchema(liveCrawlHreflangSchema),
  segmentedSitemap:z.toJSONSchema(segmentedSitemapSchema)
 },
 findingCodes:findingCodeCatalog,
 errorCodes:errorCodeCatalog,
 examples:{
  editorial:{endpoint:'POST /v1/editorial',payload:{schemaVersion:1,locale:'en',market:'',primaryQuery:'cache invalidation',readerTask:'Choose a TTL strategy',article:{title:'Cache invalidation guide',description:'Overview of TTL and event-based invalidation.',h1Mode:'renderer',markdown:'Cache invalidation keeps responses fresh.\n\n## TTL strategy\n\nSet explicit bounds.'},sources:[],claims:[],glossary:[],reviewedSections:[]}},
  blog:{endpoint:'POST /v1/blog',payload:{schemaVersion:1,siteUrl:'https://example.org',coverage:'Stored article links',pages:[{url:'https://example.org/a/',title:'Guide A',text:'Cache invalidation guide',links:[]}]}},
  diagnose:{endpoint:'POST /v1/diagnose',payload:{stack:'react',renderMode:'ssr',category:'focus',symptom:'Fixed bottom bar covers focused input after scrollIntoView'}},
  compare:{endpoint:'POST /v1/compare',payload:{before:{findings:[]},after:{findings:[]}}},
  aiReview:{endpoint:'POST /v1/ai-review',payload:{language:'en',focus:'priorities',projectId:'default',includeDraft:false,report:{kind:'editorial-review',findings:[{code:'description-not-provided',severity:'warning',message:'Meta description was not supplied.'}],allowedUrls:['/guide/caching']}}},
  sanitizeReport:{endpoint:'POST /v1/sanitize-report',payload:{report:{kind:'editorial-review',findings:[{code:'description-not-provided',severity:'warning',message:'Meta description was not supplied.'}]},stripOrigin:true,includeSnippets:false,language:'en'}},
  contribution:{endpoint:'POST /v1/contribution-preview',payload:{id:'drawer-scroll-lock-escape',title:'Body scroll lock remains active after drawer unmounts',stack:'Vue',category:'scroll',symptom:'Document remains non-scrollable after closing a mobile navigation drawer.',applicability:'Vue 3 SPA drawers toggling overflow hidden on documentElement.',versions:'Vue 3.5+, Chromium mobile',preconditions:['Mobile viewport 390x844'],steps:['Open navigation drawer','Close drawer','Swipe up on main content'],expected:'Main document scrolls vertically after drawer closes.',acceptance:'window.scrollY increases by at least 60px after touch-scroll gesture.',fixSummary:'Restore documentElement overflow in onUnmounted cleanup.',limitations:['Chromium viewport emulation only'],syntheticSource:'export function mountDrawer(root){root.innerHTML="<div class=drawer>Synthetic</div>";}',publicationConsent:true,noPrivateDataConfirmed:true}}
 }
};

const publicBlogSchema=blogSchema.extend({pages:blogSchema.shape.pages.max(publicGatewayLimits.blogPages)});
const publicEditorialSchema=editorialSchema.extend({article:editorialSchema.shape.article.extend({markdown:z.string().min(1).max(publicGatewayLimits.markdown)})});
const publicMcpTools=[
 {name:'list_check_rules',description:'List deterministic check rules, inputs, limitations and methodology citations.',inputSchema:z.toJSONSchema(listCheckRulesSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'get_check_rule',description:'Read one bundled check rule by domain-qualified ID.',inputSchema:z.toJSONSchema(getCheckRuleSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'list_cases',description:'List synthetic mobile web reproductions (read-only public subset).',inputSchema:z.toJSONSchema(listCasesInputSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'get_case',description:'Get symptom, preconditions, acceptance condition and limitations for a known case.',inputSchema:z.toJSONSchema(caseIdSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'list_workflows',description:'List generalized Reproleaf workflows and their automation limits.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'diagnose_project',description:'Rank candidate checks from supplied application metadata. Select activeApplication when several applications exist. Rendering mode and preconditions remain unconfirmed unless supplied; no repository files are read and no bugs are verified.',inputSchema:precomputedSchemas.schemas.diagnose,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'review_editorial_packet',description:'Check supplied article evidence within public text/glossary work limits. No source fetching or semantic guarantee.',inputSchema:{type:'object',properties:{packet:z.toJSONSchema(publicEditorialSchema)},required:['packet'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_blog_links',description:'Audit inline inventory only: at most 100 pages, 10000 links and 200000 supplied text units. No server files or crawling.',inputSchema:{type:'object',properties:{inventory:z.toJSONSchema(publicBlogSchema)},required:['inventory'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'compare_check_runs',description:'Compare baseline and post-fix check reports.',inputSchema:z.toJSONSchema(compareInputSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'get_schemas',description:'Return versioned JSON schemas, finding codes and error codes.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'get_client_setups',description:'Return client configuration recipes, transport scope, application verification status and connection checks. Recipes are not proof of installation in an actual client.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'check_rewrite_preservation',description:'Check before/after text blocks for preserved numbers, URLs, formulas, code spans and negation/condition markers.',inputSchema:z.toJSONSchema(rewriteGuardSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_html_document',description:'Audit supplied static HTML for canonicals, hreflang, encoding/mojibake, H1-H6 outline and robots meta without fetching URLs.',inputSchema:z.toJSONSchema(htmlAuditSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_jsonld_schema',description:'Validate Schema.org JSON-LD structured data blocks inside supplied static HTML without fetching URLs.',inputSchema:z.toJSONSchema(schemaAuditSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_social_meta',description:'Audit OpenGraph and Twitter Card meta tags and build a social share preview from supplied static HTML without fetching URLs.',inputSchema:z.toJSONSchema(socialAuditSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_crawl_policy',description:'Cross-check supplied robots.txt, sitemap.xml and optional page canonical/noindex metadata without fetching URLs.',inputSchema:z.toJSONSchema(crawlPolicyAuditSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_redirect_chains',description:'Audit supplied HTTP redirect hop traces for loops, multi-hop chains, temporary 302/307 redirects and 4xx/5xx targets without network requests.',inputSchema:z.toJSONSchema(redirectAuditSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_semantic_cocoon',description:'Audit internal link anchors, click depth, orphan pages and semantic cocoon hub/supporting structure without crawling URLs.',inputSchema:z.toJSONSchema(cocoonAuditSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_hreflang_matrix',description:'Validate reciprocal hreflang return links, self-references, x-default, canonical alignment and html[lang] across a page matrix without fetching URLs.',inputSchema:z.toJSONSchema(hreflangAuditSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_llms_txt',description:'Validate an llms.txt markdown file for H1, blockquote summary, ## sections, absolute links and safe schemes without fetching URLs.',inputSchema:z.toJSONSchema(llmsTxtAuditSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'generate_llms_txt',description:'Generate and validate a spec-compliant llms.txt markdown document from structured sections and links.',inputSchema:z.toJSONSchema(llmsTxtGenerateSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_ai_crawler_access',description:'Check AI search/training crawler rules in robots.txt and non-JS HTML citation readiness without network requests.',inputSchema:z.toJSONSchema(aiCrawlerAuditSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_rag_chunks',description:'Evaluate passage extractability, chunk word lengths and pronoun-dependent openers for RAG/AI answer engines.',inputSchema:z.toJSONSchema(ragChunkAuditSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_claim_grounding',description:'Check quantitative claims in Markdown for nearby source links, citations or methodology cues without fetching external URLs.',inputSchema:z.toJSONSchema(groundingAuditSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_terminology_consistency',description:'Check entity and terminology consistency across one or more documents against a canonical glossary, aliases and forbidden variants.',inputSchema:z.toJSONSchema(terminologyAuditSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_hydration_diff',description:'Compare raw server HTML against client-rendered DOM HTML for CSR-only content, missing H1, canonical/robots mutations and client-only JSON-LD without fetching URLs.',inputSchema:z.toJSONSchema(hydrationDiffSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_prompt_injection',description:'Detect hidden CSS/HTML text cloaking and prompt-injection override phrases in HTML or Markdown without network requests.',inputSchema:z.toJSONSchema(promptInjectionAuditSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_serp_snippet',description:'Measure title and meta description pixel widths, detect SERP truncation, H1 duplication and primary query alignment without network requests.',inputSchema:z.toJSONSchema(serpSnippetSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_dom_perf_hints',description:'Check static HTML for Core Web Vitals DOM risks (missing image dimensions, lazy hero images, blocking head scripts, viewport, DOM size/depth) without network requests.',inputSchema:z.toJSONSchema(domPerfAuditSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_cannibalization',description:'Detect keyword cannibalization and high topic/intent token overlap across a matrix of page titles, H1s, headings and primary queries.',inputSchema:z.toJSONSchema(cannibalizationAuditSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_indexation_hygiene',description:'Audit pagination canonicals, tracking/facet query parameters, noindex-canonical conflicts and archive routes across supplied page metadata.',inputSchema:z.toJSONSchema(indexationHygieneSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_editorial_clarity',description:'Audit Markdown drafts for walls of text, overlong sentences, generic AI/filler cliches and list/table scannability.',inputSchema:z.toJSONSchema(editorialClaritySchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_answer_first',description:'Audit H2/H3 headings in Markdown or HTML to verify whether the first paragraph delivers a direct answer within word limits without filler preambles.',inputSchema:z.toJSONSchema(answerFirstSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'suggest_seo_fixes',description:'Generate ready-to-paste HTML title, meta description, canonical, OpenGraph/Twitter tags and JSON-LD snippets from supplied page metadata without inventing facts.',inputSchema:z.toJSONSchema(fixGeneratorSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'build_llms_bundle',description:'Build curated llms.txt index and token-capped llms-full.txt bundle from supplied page metadata and markdown.',inputSchema:z.toJSONSchema(llmsBundleSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_llms_budget',description:'Audit llms.txt structure and linked page token footprint against a target context window, detecting duplicate URLs, missing targets and oversized core sections.',inputSchema:z.toJSONSchema(llmsBudgetSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_geo_readiness',description:'Run a composite GEO and AI citation readiness scorecard across AI crawler access, llms.txt, JSON-LD, answer-first structure, RAG chunks and prompt-injection safety.',inputSchema:z.toJSONSchema(geoReadinessSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'list_methodologies',description:'List deterministic SEO/GEO review methodologies, sections and scope limits.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'prepare_methodology_packet',description:'Build a SHA-256 bound methodology review packet with prompt and JSON output contract for BYO-model or local Ollama execution.',inputSchema:z.toJSONSchema(buildMethodologyPacketSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'cluster_serp_keywords',description:'Cluster keyword SERP Top-10 URLs using Hard or Soft overlap and bind clusters to existing site pages.',inputSchema:z.toJSONSchema(serpClusterSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'analyze_serp_gap',description:'Compare target HTML/profile against Top-10 SERP competitor benchmarks for word count, headings, tables, FAQ, Schema types and recurring terms.',inputSchema:z.toJSONSchema(serpGapSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'plan_cocoon_anchors',description:'Plan Pillar->Cluster->Supporting internal links, check anchor distribution balance and match donor draft paragraphs without network requests.',inputSchema:z.toJSONSchema(cocoonPlanSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'generate_content_brief',description:'Compile a structured Markdown and JSON SEO/GEO content brief with Answer-First limits, RAG chunk targets, glossary rules and explicit [FACT_GAP] placeholders.',inputSchema:z.toJSONSchema(contentBriefSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_eeat_signals',description:'Audit HTML and JSON-LD for E-E-A-T trust signals (author byline, Person/Organization schema, publication/modified dates, primary sources and trust links).',inputSchema:z.toJSONSchema(eeatAuditSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'audit_live_crawl_hreflang',description:'Audit hreflang reciprocity, self-links and non-200 targets across exported crawl pages or static HTML captures without network requests.',inputSchema:z.toJSONSchema(liveCrawlHreflangSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'build_segmented_sitemaps',description:'Generate origin-validated segmented XML urlsets and sitemapindex without network requests.',inputSchema:z.toJSONSchema(segmentedSitemapSchema),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}}
];

function handlePublicMcpRpc(rpc){
 if(!rpc||typeof rpc!=='object'||rpc.jsonrpc!=='2.0'||typeof rpc.method!=='string'){
  return {jsonrpc:'2.0',id:rpc?.id??null,error:{code:-32600,message:'Invalid JSON-RPC 2.0 request'}};
 }
 const id=rpc.id??null;
 if(rpc.method==='initialize'){
  return {jsonrpc:'2.0',id,result:{protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'reproleaf-public',version},instructions:getServerInstructions({publicMode:true})}};
 }
 if(rpc.method==='notifications/initialized'||rpc.method==='ping'){
  return {jsonrpc:'2.0',id,result:{}};
 }
 if(rpc.method==='tools/list'){
  return {jsonrpc:'2.0',id,result:{tools:publicMcpTools}};
 }
 if(rpc.method==='tools/call'){
  const toolName=rpc.params?.name,args=rpc.params?.arguments||{};
  try{
   if(['list_workflows','get_schemas','get_client_setups','list_methodologies'].includes(toolName))z.object({}).strict().parse(args);
   if(['review_editorial_packet','audit_blog_links'].includes(toolName))z.object({[toolName==='audit_blog_links'?'inventory':'packet']:z.unknown()}).strict().parse(args);
   let data;
   if(toolName==='list_cases'){
    const {query,limit,offset}=listCasesInputSchema.parse(args);
    const q=(query||'').toLowerCase(),matches=catalog.cases.filter(c=>JSON.stringify(c).toLowerCase().includes(q));
    data={status:catalog.status,provenance:catalog.provenance,total:matches.length,nextOffset:offset+limit<matches.length?offset+limit:null,cases:matches.slice(offset,offset+limit).map(item=>({...item,citationUrl:caseCitationUrl(item.id)}))};
   }else if(toolName==='get_case'){
    const parsed=caseIdSchema.parse(args);
    data={...getCase(parsed.id),provenance:catalog.provenance,casePage:caseCitationUrl(parsed.id),citationUrl:caseCitationUrl(parsed.id)};
   }else if(toolName==='list_check_rules'){
    data=listCheckRules(args);
   }else if(toolName==='get_check_rule'){
    data=getCheckRule(args);
   }else if(toolName==='list_workflows'){
    data={workflows:[{id:'mobile-web-review',purpose:'Reproduce and verify a mobile UI failure with local acceptance evidence.'},{id:'editorial-evidence',purpose:'Prepare and review an article evidence packet; no ranking or factual-truth guarantee.'},{id:'blog-link-graph',purpose:'Audit supplied internal link coverage and editorial link candidates.'}]};
   }else if(toolName==='diagnose_project'){
    data=diagnoseProject(args);
   }else if(toolName==='review_editorial_packet'){
    data=reviewEditorial(args.packet);
   }else if(toolName==='audit_blog_links'){
    if(!args.inventory)throw Error('Inline inventory is required on the public MCP endpoint.');
    data=auditBlog(args.inventory);
   }else if(toolName==='compare_check_runs'){
    const parsed=compareInputSchema.parse(args);
    data=compareReports(parsed.before,parsed.after);
   }else if(toolName==='get_schemas'){
    data=precomputedSchemas;
   }else if(toolName==='get_client_setups'){
    data={schemaVersion:1,clients:clientSetups};
   }else if(toolName==='check_rewrite_preservation'){
    data=checkRewritePreservation(args);
   }else if(toolName==='audit_html_document'){
    data=auditHtmlDocument(args);
   }else if(toolName==='audit_jsonld_schema'){
    data=auditJsonLd(args);
   }else if(toolName==='audit_social_meta'){
    data=auditSocialMeta(args);
   }else if(toolName==='audit_crawl_policy'){
    data=auditCrawlPolicy(args);
   }else if(toolName==='audit_redirect_chains'){
    data=auditRedirectTraces(args);
   }else if(toolName==='audit_semantic_cocoon'){
    data=auditCocoonGraph(args);
   }else if(toolName==='audit_hreflang_matrix'){
    data=auditHreflangMatrix(args);
   }else if(toolName==='audit_llms_txt'){
    data=auditLlmsTxt(args);
   }else if(toolName==='generate_llms_txt'){
    data=generateLlmsTxt(args);
   }else if(toolName==='audit_ai_crawler_access'){
    data=auditAiCrawlerAccess(args);
   }else if(toolName==='audit_rag_chunks'){
    data=auditRagChunks(args);
   }else if(toolName==='audit_claim_grounding'){
    data=auditClaimGrounding(args);
   }else if(toolName==='audit_terminology_consistency'){
    data=auditTerminologyConsistency(args);
   }else if(toolName==='audit_hydration_diff'){
    data=auditRawVsRenderedHtml(args);
   }else if(toolName==='audit_prompt_injection'){
    data=auditPromptInjectionAndHiddenText(args);
   }else if(toolName==='audit_serp_snippet'){
    data=auditSerpSnippet(args);
   }else if(toolName==='audit_dom_perf_hints'){
    data=auditDomPerfHints(args);
   }else if(toolName==='audit_cannibalization'){
    data=auditCannibalizationMatrix(args);
   }else if(toolName==='audit_indexation_hygiene'){
    data=auditIndexationHygiene(args);
   }else if(toolName==='audit_editorial_clarity'){
    data=auditEditorialClarity(args);
   }else if(toolName==='audit_answer_first'){
    data=auditAnswerFirst(args);
   }else if(toolName==='suggest_seo_fixes'){
    data=suggestSeoFixes(args);
   }else if(toolName==='build_llms_bundle'){
    data=buildLlmsBundle(args);
   }else if(toolName==='audit_llms_budget'){
    data=auditLlmsBudget(args);
   }else if(toolName==='audit_geo_readiness'){
    data=auditGeoReadiness(args);
   }else if(toolName==='list_methodologies'){
    data=listMethodologies();
   }else if(toolName==='prepare_methodology_packet'){
    data=buildMethodologyPacket(args);
   }else if(toolName==='cluster_serp_keywords'){
    data=clusterSerpKeywords(args);
   }else if(toolName==='analyze_serp_gap'){
    data=analyzeSerpGap(args);
   }else if(toolName==='plan_cocoon_anchors'){
    data=planCocoonAndAnchors(args);
   }else if(toolName==='generate_content_brief'){
    data=generateContentBrief(args);
   }else if(toolName==='audit_eeat_signals'){
    data=auditEeatSignals(args);
   }else if(toolName==='audit_live_crawl_hreflang'){
    data=auditLiveCrawlHreflang(args);
   }else if(toolName==='build_segmented_sitemaps'){
    data=buildSegmentedSitemaps(args);
   }else{
    return {jsonrpc:'2.0',id,error:{code:-32601,message:`Unknown or restricted tool: ${String(toolName)}`}};
   }
   return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(data,null,2)}],isError:false}};
  }catch(error){
   return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify({error:'invalid-input',code:'RL_INVALID_INPUT',message:error.message})}],isError:true}};
  }
 }
 return {jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}};
}

function handlePublicMcpHttp(input){
 try{assertPublicRequestBudget(input);}catch(error){return {status:400,body:rpcError(input?.id,error.rpcCode||-32600,error.message)};}
 const batch=Array.isArray(input),responses=[];
 for(const item of batch?input:[input]){
  try{
   const parsed=parsePublicRpc(item);if(parsed.notification)continue;
   if(batch&&parsed.rpc.method==='initialize'){responses.push(rpcError(item.id,-32600,'Initialize cannot be batched'));continue;}
   if(parsed.rpc.method.startsWith('notifications/')){responses.push(rpcError(item.id,-32600,'Notifications must not have an id'));continue;}
   responses.push(handlePublicMcpRpc(parsed.rpc));
  }catch(error){responses.push(rpcError(item?.id,error.rpcCode||-32600,error.message));}
 }
 return responses.length?{status:200,body:batch?responses:responses[0]}:{status:202};
}

export async function startApi({port=4180,listenHost='127.0.0.1',publicGatewayOnly=false,maxBytes=1048576,maxConcurrent=8,rateLimitPerMinute=120,requestTimeoutMs=10000,allowedHosts=[],allowedOrigins=[],trustedProxyPeers=[],maxRateBuckets=1000,beforeProcess,aiOptions={}}={}){
 if(typeof publicGatewayOnly!=='boolean'||!['127.0.0.1','::1','0.0.0.0'].includes(listenHost))throw Error('Invalid API binding policy');
 if(listenHost==='0.0.0.0'&&!publicGatewayOnly)throw Error('Non-loopback binding requires publicGatewayOnly');
 if(!Number.isSafeInteger(maxRateBuckets)||maxRateBuckets<1||maxRateBuckets>100000)throw Error('Invalid rate bucket limit');
 if(!Array.isArray(trustedProxyPeers)||trustedProxyPeers.length>32||trustedProxyPeers.some(peer=>!normalizePeer(peer)))throw Error('Trusted proxy peers must be explicit IP literals');
 let activeRequests=0;
 const rateWindows=new Map();
 const aiConfig=publicGatewayOnly?{enabled:false,apiKey:'',model:'',dailyBudgetUsd:0,inputPricePerMillion:0,outputPricePerMillion:0}:resolveAiConfig(aiOptions);
 const aiBudgetTracker=publicGatewayOnly?null:aiOptions.budgetTracker||createAiBudgetTracker(aiConfig);
 const getEndpoints=new Set(['/health','/v1/schemas','/v1/cases','/v1/clients','/v1/ai-status','/v1/methodologies']);
 const postEndpoints=new Set(['/v1/editorial','/v1/blog','/v1/diagnose','/v1/compare','/v1/mcp','/v1/ai-review','/v1/sanitize-report','/v1/contribution-preview','/v1/rewrite-guard','/v1/html-audit','/v1/schema-audit','/v1/social-audit','/v1/crawl-policy-audit','/v1/redirect-audit','/v1/cocoon-audit','/v1/hreflang-audit','/v1/llms-txt-audit','/v1/llms-txt-generate','/v1/ai-crawler-audit','/v1/rag-chunk-audit','/v1/grounding-audit','/v1/terminology-audit','/v1/hydration-diff-audit','/v1/prompt-injection-audit','/v1/serp-snippet-audit','/v1/dom-perf-audit','/v1/cannibalization-audit','/v1/indexation-hygiene-audit','/v1/editorial-clarity-audit','/v1/answer-first-audit','/v1/suggest-seo-fixes','/v1/build-llms-bundle','/v1/audit-llms-budget','/v1/audit-geo-readiness','/v1/methodology-packet','/v1/validate-methodology-result','/v1/serp-cluster','/v1/serp-gap','/v1/cocoon-plan','/v1/content-brief','/v1/eeat-audit','/v1/hreflang-live','/v1/sitemap-split']);

 function checkRateLimit(clientKey){
  const now=Date.now();
  if(rateWindows.size>=maxRateBuckets){
   for(const [k,entry]of rateWindows)if(now>=entry.resetAt)rateWindows.delete(k);
  }
  let entry=rateWindows.get(clientKey);
  if(!entry||now>=entry.resetAt){
   if(!entry&&rateWindows.size>=maxRateBuckets)return {allowed:false,retryAfterSeconds:60};
   entry={count:0,resetAt:now+60000};
   rateWindows.set(clientKey,entry);
  }
  entry.count++;
  if(entry.count>rateLimitPerMinute){
   return {allowed:false,retryAfterSeconds:Math.max(1,Math.ceil((entry.resetAt-now)/1000))};
  }
  return {allowed:true,retryAfterSeconds:0};
 }

 const server=http.createServer(async(req,res)=>{
  let timedOut=false;
  const respond=(status,data,extraHeaders={})=>{
   if(res.headersSent)return;
   res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extraHeaders});
   res.end(JSON.stringify(data));
  };
  const timer=setTimeout(()=>{
   timedOut=true;
   respond(408,{error:'request-timeout',code:'RL_REQUEST_TIMEOUT'});
   req.destroy();
  },requestTimeoutMs);
  res.once('close',()=>clearTimeout(timer));

  const expectedHosts=new Set([`127.0.0.1:${server.address().port}`,`[::1]:${server.address().port}`,`localhost:${server.address().port}`,...allowedHosts]);
  if(!expectedHosts.has(req.headers.host)){respond(403,{error:'host-rejected',code:'RL_HOST_REJECTED'});return;}
  const localOrigins=[`http://127.0.0.1:${server.address().port}`,`http://[::1]:${server.address().port}`,`http://localhost:${server.address().port}`];
  const allowedOrigin=exactOriginAllowed(req.headers.origin,localOrigins,allowedOrigins);
  if(!allowedOrigin){respond(403,{error:'origin-rejected',code:'RL_ORIGIN_REJECTED'});return;}

  let clientKey;try{clientKey=proxyClientIdentity(req.socket?.remoteAddress,req.headers['x-forwarded-for'],trustedProxyPeers);}catch{respond(400,{error:'invalid-proxy-identity',code:'RL_INVALID_PROXY_IDENTITY'});return;}
  const rate=checkRateLimit(clientKey);
  if(!rate.allowed){
   respond(429,{error:'rate-limit-exceeded',code:'RL_RATE_LIMIT',retryAfterSeconds:rate.retryAfterSeconds},{'Retry-After':String(rate.retryAfterSeconds)});
   return;
  }
  if(activeRequests>=maxConcurrent){
   respond(429,{error:'concurrency-limit-exceeded',code:'RL_CONCURRENCY_LIMIT'});
   return;
  }

  const urlPath=(req.url||'').split('?')[0];
  if(publicGatewayOnly&&!['/v1/mcp','/health'].includes(urlPath)){respond(404,{error:'not-found',code:'RL_NOT_FOUND'});req.resume();return;}
  if(getEndpoints.has(urlPath)){
   if(req.method!=='GET'){res.setHeader('Allow','GET');respond(405,{error:'method-not-allowed',code:'RL_METHOD_NOT_ALLOWED'});return;}
   if(urlPath==='/health'){respond(200,{name:'reproleaf',mode:publicGatewayOnly?'public-gateway':'local',version,readOnly:true,...(publicGatewayOnly?{aiEnabled:false}:{}),limits:{maxBytes,maxConcurrent,rateLimitPerMinute,requestTimeoutMs,maxRateBuckets,publicMcp:publicGatewayLimits},timeoutScope:'Request I/O deadline; synchronous analysis is bounded by input quotas, not hard-interrupted.'});return;}
   if(urlPath==='/v1/schemas'){respond(200,precomputedSchemas);return;}
   if(urlPath==='/v1/cases'){respond(200,{schemaVersion:catalog.schemaVersion,status:catalog.status,provenance:catalog.provenance,total:catalog.cases.length,cases:catalog.cases,unverifiedHeuristics:catalog.unverifiedHeuristics||[]});return;}
   if(urlPath==='/v1/clients'){respond(200,{schemaVersion:1,clients:clientSetups});return;}
   if(urlPath==='/v1/methodologies'){respond(200,listMethodologies());return;}
   if(urlPath==='/v1/ai-status'){
    const budget=aiBudgetTracker.statusSnapshot();
    respond(200,{enabled:aiConfig.enabled&&budget.available!==false&&!budget.paused,model:aiConfig.model,budget,policy:{keysOnServerOnly:true,requiresExplicitAction:true,draftOptInOnly:true,urlsRestrictedToInventory:true,outputStatus:'ai-hypothesis-unverified'}});
    return;
   }
  }

  if(!postEndpoints.has(urlPath)){respond(404,{error:'not-found',code:'RL_NOT_FOUND'});return;}
  if(req.method!=='POST'){res.setHeader('Allow','POST');respond(405,{error:'post-required',code:'RL_POST_REQUIRED'});return;}
  if(urlPath==='/v1/mcp'){
   if(!acceptsPublicMcp(req.headers.accept)){respond(406,rpcError(null,-32600,'Accept must include application/json and text/event-stream'));return;}
   if(req.headers['mcp-protocol-version']&&req.headers['mcp-protocol-version']!=='2025-03-26'){respond(400,rpcError(null,-32600,'Unsupported MCP protocol version'));return;}
  }
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){respond(415,{error:'application-json-required',code:'RL_JSON_REQUIRED'});return;}
  if(Number(req.headers['content-length'])>maxBytes){respond(413,{error:'body-too-large',code:'RL_BODY_TOO_LARGE'});req.resume();return;}

  activeRequests++;
  let length=0;
  const chunks=[];
  try{
   if(beforeProcess)await beforeProcess(urlPath);
   for await(const chunk of req){
    if(timedOut)return;
    length+=chunk.length;
    if(length>maxBytes){respond(413,{error:'body-too-large',code:'RL_BODY_TOO_LARGE'});req.resume();return;}
    chunks.push(chunk);
   }
   if(timedOut)return;
   const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(urlPath==='/v1/mcp'){
    const outcome=handlePublicMcpHttp(input);if(outcome.status===202){res.writeHead(202,{'Cache-Control':'no-store'});res.end();}else respond(outcome.status,outcome.body);
    return;
   }
   if(urlPath==='/v1/ai-review'){
    try{
     const aiRes=await runAiReview(input,{...aiOptions,...aiConfig,timeoutMs:Math.min(aiOptions.timeoutMs||20000,requestTimeoutMs),budgetTracker:aiBudgetTracker,clientId:clientKey});
     respond(200,aiRes);
    }catch(aiErr){
     respond(aiErr.status||400,{error:aiErr.code||'RL_INVALID_INPUT',code:aiErr.code||'RL_INVALID_INPUT',message:aiErr.message,issues:aiErr.issues});
    }
    return;
   }
   let result;
   if(urlPath==='/v1/editorial')result=reviewEditorial(input);
   else if(urlPath==='/v1/blog')result=auditBlog(input);
   else if(urlPath==='/v1/diagnose')result=diagnoseProject(input);
   else if(urlPath==='/v1/sanitize-report')result=sanitizeReportForSharing(input);
   else if(urlPath==='/v1/contribution-preview')result=prepareContributionPacket(input);
   else if(urlPath==='/v1/rewrite-guard')result=checkRewritePreservation(input);
   else if(urlPath==='/v1/html-audit')result=auditHtmlDocument(input);
   else if(urlPath==='/v1/schema-audit')result=auditJsonLd(input);
   else if(urlPath==='/v1/social-audit')result=auditSocialMeta(input);
   else if(urlPath==='/v1/crawl-policy-audit')result=auditCrawlPolicy(input);
   else if(urlPath==='/v1/redirect-audit')result=auditRedirectTraces(input);
   else if(urlPath==='/v1/cocoon-audit')result=auditCocoonGraph(input);
   else if(urlPath==='/v1/hreflang-audit')result=auditHreflangMatrix(input);
   else if(urlPath==='/v1/llms-txt-audit')result=auditLlmsTxt(input);
   else if(urlPath==='/v1/llms-txt-generate')result=generateLlmsTxt(input);
   else if(urlPath==='/v1/ai-crawler-audit')result=auditAiCrawlerAccess(input);
   else if(urlPath==='/v1/rag-chunk-audit')result=auditRagChunks(input);
   else if(urlPath==='/v1/grounding-audit')result=auditClaimGrounding(input);
   else if(urlPath==='/v1/terminology-audit')result=auditTerminologyConsistency(input);
   else if(urlPath==='/v1/hydration-diff-audit')result=auditRawVsRenderedHtml(input);
   else if(urlPath==='/v1/prompt-injection-audit')result=auditPromptInjectionAndHiddenText(input);
   else if(urlPath==='/v1/serp-snippet-audit')result=auditSerpSnippet(input);
   else if(urlPath==='/v1/dom-perf-audit')result=auditDomPerfHints(input);
   else if(urlPath==='/v1/cannibalization-audit')result=auditCannibalizationMatrix(input);
   else if(urlPath==='/v1/indexation-hygiene-audit')result=auditIndexationHygiene(input);
   else if(urlPath==='/v1/editorial-clarity-audit')result=auditEditorialClarity(input);
   else if(urlPath==='/v1/answer-first-audit')result=auditAnswerFirst(input);
   else if(urlPath==='/v1/suggest-seo-fixes')result=suggestSeoFixes(input);
   else if(urlPath==='/v1/build-llms-bundle')result=buildLlmsBundle(input);
   else if(urlPath==='/v1/audit-llms-budget')result=auditLlmsBudget(input);
   else if(urlPath==='/v1/audit-geo-readiness')result=auditGeoReadiness(input);
   else if(urlPath==='/v1/methodology-packet')result=buildMethodologyPacket(input);
   else if(urlPath==='/v1/validate-methodology-result')result=validateMethodologyResult(input);
   else if(urlPath==='/v1/serp-cluster')result=clusterSerpKeywords(input);
   else if(urlPath==='/v1/serp-gap')result=analyzeSerpGap(input);
   else if(urlPath==='/v1/cocoon-plan')result=planCocoonAndAnchors(input);
   else if(urlPath==='/v1/content-brief')result=generateContentBrief(input);
   else if(urlPath==='/v1/eeat-audit')result=auditEeatSignals(input);
   else if(urlPath==='/v1/hreflang-live')result=auditLiveCrawlHreflang(input);
   else if(urlPath==='/v1/sitemap-split')result=buildSegmentedSitemaps(input);
   else{
    const parsed=compareInputSchema.parse(input);
    result=compareReports(parsed.before,parsed.after);
   }
   respond(200,result);
  }catch(error){
   if(urlPath==='/v1/mcp'&&error instanceof SyntaxError){if(!timedOut&&!res.headersSent)respond(400,rpcError(null,-32700,'Parse error'));return;}
   const errCode=error.code||'RL_INVALID_INPUT';
   if(!timedOut&&!res.headersSent)respond(error.status||400,{error:errCode==='RL_INVALID_INPUT'?'invalid-input':errCode,code:errCode,message:error.message,issues:error.issues?.slice(0,30).map(i=>({path:Array.isArray(i.path)?i.path.join('.'):String(i.path||''),code:i.code,message:i.message}))});
  }finally{
   activeRequests=Math.max(0,activeRequests-1);
  }
 });
 server.requestTimeout=requestTimeoutMs;
 server.headersTimeout=requestTimeoutMs;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,listenHost,resolve);});
 return {server,url:`http://${listenHost==='::1'?'[::1]':'127.0.0.1'}:${server.address().port}`,close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const api=await startApi();console.log(`Reproleaf local API: ${api.url}`);}
