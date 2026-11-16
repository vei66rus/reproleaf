#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {catalog,getCase} from './catalog.mjs';
const [command='help',...args]=process.argv.slice(2);
async function readMetadata(file){
 const {open}=await import('node:fs/promises');const handle=await open(file,'r');
 try{
  if(!(await handle.stat()).isFile())throw Error('Metadata input must be a regular file.');
  const buffer=Buffer.alloc(262145);let offset=0;
  while(offset<buffer.length){const {bytesRead}=await handle.read(buffer,offset,buffer.length-offset,offset);if(!bytesRead)break;offset+=bytesRead;}
  if(offset>262144)throw Error('Metadata input exceeds 256 KiB');
  return new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,offset));
 }finally{await handle.close();}
}
try{
 const {values,positionals}=parseArgs({args,allowPositionals:true,options:{case:{type:'string'},all:{type:'boolean'},variant:{type:'string',default:'both'},output:{type:'string'},port:{type:'string',default:'4179'},adapter:{type:'string'},'allow-network':{type:'boolean'},'allow-browser':{type:'boolean'},packet:{type:'string'},report:{type:'string'},file:{type:'string'},url:{type:'string'},inventory:{type:'string'},skill:{type:'string'},dest:{type:'string'},stack:{type:'string'},'render-mode':{type:'string'},symptom:{type:'string'},category:{type:'string'},package:{type:'string'},context:{type:'string'},application:{type:'string'},'target-url':{type:'string'},before:{type:'string'},after:{type:'string'},method:{type:'string'},locale:{type:'string',default:'en'},queries:{type:'string'},result:{type:'string'},model:{type:'string'},endpoint:{type:'string',default:'http://127.0.0.1:11434'},'max-tokens':{type:'string',default:'2048'},robots:{type:'string'},sitemap:{type:'string'},'site-url':{type:'string'},pages:{type:'string'},glossary:{type:'string'},dir:{type:'string'},format:{type:'string',default:'json'},preset:{type:'string',default:'saas'},'max-pages':{type:'string',default:'50'},'max-depth':{type:'string',default:'3'},'max-bytes':{type:'string',default:'2097152'},'crawl-delay':{type:'string',default:'100'},concurrency:{type:'string',default:'3'},'no-robots':{type:'boolean'},'no-sitemap':{type:'boolean'},'render-js':{type:'boolean'},'max-render-pages':{type:'string',default:'25'},save:{type:'boolean'},id:{type:'string'},status:{type:'string'},origin:{type:'string'},routes:{type:'string'},crawled:{type:'string'},provider:{type:'string',default:'google'},mode:{type:'string',default:'questions'},seed:{type:'string'},strategy:{type:'string',default:'mobile'},domain:{type:'string'},location:{type:'string',default:'2840'},action:{type:'string',default:'volumes'},'api-key':{type:'string'},'dom-file':{type:'string'},'min-overlap':{type:'string',default:'3'},'max-urls':{type:'string',default:'50000'}}});
 if(command==='list'){console.log(JSON.stringify(catalog,null,2));}
 else if(command==='case'){console.log(JSON.stringify(getCase(positionals[0]),null,2));}
 else if(command==='clients'){
  const {clientSetups}=await import('./client-setups.mjs');
  console.log(JSON.stringify({schemaVersion:1,clients:clientSetups},null,2));
 }
 else if(command==='serve'){
  const {buildSite}=await import('./build.mjs');await buildSite();
  const {startServer}=await import('./server.mjs');const port=Number(values.port);if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid port');
  const server=await startServer({port});console.log(`Local pilot: ${server.origin} (noindex, loopback only)`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();process.exit(0);});
 }
 else if(command==='verify'){
  if(!values.all&&!values.case)throw Error('Choose --all or --case <id>');
  if(values.all&&values.case)throw Error('Choose --all or --case, not both');
  const {verify}=await import('./verify.mjs');const result=await verify({id:values.case,variant:values.variant,output:values.output});
  console.log(JSON.stringify({success:result.success,summary:result.summary,report:result.directory+'/report.json'},null,2));
  if(!result.success)process.exitCode=1;
 }
 else if(command==='check'){
  if(!values.adapter)throw Error('Use --adapter <local JSON file>');
  const {checkTarget}=await import('./check-target.mjs');const result=await checkTarget({adapter:values.adapter,allowNetwork:values['allow-network'],output:values.output});
  console.log(JSON.stringify({success:result.success,summary:result.summary,setupError:result.setupError,report:result.directory+'/report.json'},null,2));if(!result.success)process.exitCode=1;
 }
 else if(command==='diagnose'){
  const {diagnoseProject,diagnoseFromPackageJson}=await import('./diagnose-project.mjs');
  const options={stack:values.stack,renderMode:values['render-mode'],symptom:values.symptom,category:values.category,targetUrl:values['target-url'],activeApplication:values.application};
  for(const k of Object.keys(options))if(options[k]===undefined)delete options[k];
  if(values.package&&values.context)throw Error('Choose --package or --context, not both.');
  if(values.context){
   const context=JSON.parse(await readMetadata(values.context));
   if(!context||typeof context!=='object'||Array.isArray(context))throw Error('Context must be a metadata object.');
   console.log(JSON.stringify(diagnoseProject({...context,...options}),null,2));
  }else if(values.package){
   console.log(JSON.stringify(diagnoseFromPackageJson(await readMetadata(values.package),options),null,2));
  }else{
   console.log(JSON.stringify(diagnoseProject(options),null,2));
  }
 }
 else if(command==='compare'){
  if(!values.before||!values.after)throw Error('Use compare --before <local JSON file> --after <local JSON file>');
  const {readFile}=await import('node:fs/promises');
  const {compareReports}=await import('./history.mjs');
  const [aBytes,bBytes]=await Promise.all([readFile(values.before),readFile(values.after)]);
  if(aBytes.length>5242880||bBytes.length>5242880)throw Error('Report exceeds 5 MiB');
  console.log(JSON.stringify(compareReports(JSON.parse(aBytes),JSON.parse(bBytes)),null,2));
 }
 else if(command==='editorial'){
  const {getWorkflow,reviewEditorial}=await import('./editorial.mjs');
  if(positionals[0]==='workflow')console.log(JSON.stringify(await getWorkflow(),null,2));
  else if(positionals[0]==='review'&&values.packet){const {readFile}=await import('node:fs/promises');const bytes=await readFile(values.packet);if(bytes.length>1048576)throw Error('Packet exceeds 1 MiB');const result=reviewEditorial(JSON.parse(bytes));console.log(JSON.stringify(result,null,2));if(!result.structuralPass)process.exitCode=1;}
  else throw Error('Use editorial workflow or editorial review --packet <local JSON file>');
 }
 else if(command==='skill'){
  const {skillNames,installSkill}=await import('./skills.mjs');
  if(positionals[0]==='list')console.log(JSON.stringify(skillNames));
  else if(positionals[0]==='install')console.log(JSON.stringify(await installSkill({name:values.skill,destination:values.dest}),null,2));
  else throw Error('Use skill list or skill install --skill <name> --dest <skills directory>');
 }
 else if(command==='blog'){
  if(positionals[0]!=='audit'||!values.inventory)throw Error('Use blog audit --inventory <local JSON file>');
  const {auditBlogFile}=await import('./blog.mjs');console.log(JSON.stringify(await auditBlogFile(values.inventory),null,2));
 }
 else if(command==='sanitize'){
  if(!values.report)throw Error('Use sanitize --report <local JSON file>');
  const {readFile}=await import('node:fs/promises');
  const {sanitizeReportForSharing}=await import('./public-share.mjs');
  const bytes=await readFile(values.report);if(bytes.length>5242880)throw Error('Report exceeds 5 MiB');
  const parsed=JSON.parse(bytes);
  console.log(JSON.stringify(sanitizeReportForSharing(parsed.report?parsed:{report:parsed}),null,2));
 }
 else if(command==='contribute'){
  if(!values.packet)throw Error('Use contribute --packet <local JSON file>');
  const {readFile}=await import('node:fs/promises');
  const {prepareContributionPacket}=await import('./public-share.mjs');
  const bytes=await readFile(values.packet);if(bytes.length>524288)throw Error('Packet exceeds 512 KiB');
  console.log(JSON.stringify(prepareContributionPacket(JSON.parse(bytes)),null,2));
 }
 else if(command==='rewrite-guard'){
  const {readFile}=await import('node:fs/promises');
  const {checkRewritePreservation}=await import('./rewrite-guard.mjs');
  if(values.packet){
   const bytes=await readFile(values.packet);if(bytes.length>524288)throw Error('Packet exceeds 512 KiB');
   const result=checkRewritePreservation(JSON.parse(bytes));
   console.log(JSON.stringify(result,null,2));
   if(result.status==='blocked_by_preservation_checks')process.exitCode=1;
  }else if(values.before&&values.after){
   const [beforeBytes,afterBytes]=await Promise.all([readFile(values.before),readFile(values.after)]);
   if(beforeBytes.length>204800||afterBytes.length>204800)throw Error('Text input exceeds 200 KiB');
   const result=checkRewritePreservation({before:beforeBytes.toString('utf8'),after:afterBytes.toString('utf8')});
   console.log(JSON.stringify(result,null,2));
   if(result.status==='blocked_by_preservation_checks')process.exitCode=1;
  }else throw Error('Use rewrite-guard --before <file> --after <file> or --packet <json>');
 }
 else if(command==='accessibility-audit'){
  if(!values.file||!values['allow-browser'])throw Error('Use accessibility-audit --file <local HTML file> --allow-browser [--locale ru|en] [--output report.json]');
  const {open,writeFile}=await import('node:fs/promises');const handle=await open(values.file,'r');let html;
  try{if(!(await handle.stat()).isFile())throw Error('AXE_INPUT_FILE');const buffer=Buffer.alloc(524289);let offset=0;while(offset<buffer.length){const {bytesRead}=await handle.read(buffer,offset,buffer.length-offset,offset);if(!bytesRead)break;offset+=bytesRead;}if(offset>524288)throw Error('AXE_HTML_BYTES');try{html=new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,offset));}catch{throw Error('AXE_UTF8_REQUIRED');}}finally{await handle.close();}
  const {auditStaticAccessibility}=await import('./static-accessibility.mjs');const result=await auditStaticAccessibility({html,locale:values.locale,allowBrowser:true});const json=JSON.stringify(result,null,2);if(values.output)await writeFile(values.output,json+'\n');console.log(json);
 }
 else if(command==='html-audit'){
  if(!values.file)throw Error('Use html-audit --file <local HTML file> [--url <page URL>]');
  const {readHtmlFile}=await import('./html-file-input.mjs');
  const {auditHtmlDocument}=await import('./html-audit.mjs');
  const {html,inputEncoding}=await readHtmlFile(values.file);
  const result={...auditHtmlDocument({html,...(values.url?{url:values.url}:{})}),inputEncoding};
  console.log(JSON.stringify(result,null,2));
  if(result.summary.errors>0)process.exitCode=1;
 }
 else if(command==='schema-audit'){
  if(!values.file)throw Error('Use schema-audit --file <local HTML file> [--url <page URL>]');
  const {readHtmlFile}=await import('./html-file-input.mjs');
  const {auditJsonLd}=await import('./schema-audit.mjs');
  const {html,inputEncoding}=await readHtmlFile(values.file);
  const result={...auditJsonLd({html,...(values.url?{url:values.url}:{})}),inputEncoding};
  console.log(JSON.stringify(result,null,2));
  if(result.summary.errors>0)process.exitCode=1;
 }
 else if(command==='social-audit'){
  if(!values.file)throw Error('Use social-audit --file <local HTML file> [--url <page URL>]');
  const {readHtmlFile}=await import('./html-file-input.mjs');
  const {auditSocialMeta}=await import('./social-audit.mjs');
  const {html,inputEncoding}=await readHtmlFile(values.file);
  const result={...auditSocialMeta({html,...(values.url?{url:values.url}:{})}),inputEncoding};
  console.log(JSON.stringify(result,null,2));
  if(result.summary.errors>0)process.exitCode=1;
 }
 else if(command==='crawl-policy'){
  if(!values.robots&&!values.sitemap)throw Error('Use crawl-policy [--robots <robots.txt>] [--sitemap <sitemap.xml>] [--site-url <url>] [--pages <pages.json>]');
  const {readFile}=await import('node:fs/promises');
  const {auditCrawlPolicy}=await import('./crawl-policy-audit.mjs');
  const payload={};
  if(values['site-url'])payload.siteUrl=values['site-url'];
  if(values.robots){const b=await readFile(values.robots);if(b.length>524288)throw Error('robots.txt exceeds 512 KiB');payload.robotsTxt=b.toString('utf8');}
  if(values.sitemap){const b=await readFile(values.sitemap);if(b.length>2097152)throw Error('sitemap.xml exceeds 2 MiB');payload.sitemapXml=b.toString('utf8');}
  if(values.pages){const b=await readFile(values.pages);if(b.length>1048576)throw Error('pages.json exceeds 1 MiB');payload.pages=JSON.parse(b);}
  const result=auditCrawlPolicy(payload);
  console.log(JSON.stringify(result,null,2));
  if(result.summary.errors>0)process.exitCode=1;
 }
 else if(command==='redirect-audit'){
  const {auditRedirectTraces,traceRedirects}=await import('./redirect-audit.mjs');
  if(values.file){
   const {readFile}=await import('node:fs/promises');
   const bytes=await readFile(values.file);if(bytes.length>1048576)throw Error('Trace file exceeds 1 MiB');
   const result=auditRedirectTraces(JSON.parse(bytes));
   console.log(JSON.stringify(result,null,2));
   if(result.summary.errors>0)process.exitCode=1;
  }else if(values.url&&values['allow-network']){
   const result=await traceRedirects({urls:[values.url]});
   console.log(JSON.stringify(result,null,2));
   if(result.summary.errors>0)process.exitCode=1;
  }else throw Error('Use redirect-audit --file <traces.json> or --url <url> --allow-network');
 }
 else if(command==='cocoon-audit'){
  if(!values.file)throw Error('Use cocoon-audit --file <inventory.json>');
  const {readFile}=await import('node:fs/promises');
  const {auditCocoonGraph}=await import('./cocoon-audit.mjs');
  const bytes=await readFile(values.file);if(bytes.length>5242880)throw Error('Inventory exceeds 5 MiB');
  const result=auditCocoonGraph(JSON.parse(bytes));
  console.log(JSON.stringify(result,null,2));
  if(result.summary.errors>0)process.exitCode=1;
 }
 else if(command==='hreflang-audit'){
  if(!values.file)throw Error('Use hreflang-audit --file <matrix.json>');
  const {readFile}=await import('node:fs/promises');
  const {auditHreflangMatrix}=await import('./hreflang-audit.mjs');
  const bytes=await readFile(values.file);if(bytes.length>5242880)throw Error('Matrix file exceeds 5 MiB');
  const result=auditHreflangMatrix(JSON.parse(bytes));
  console.log(JSON.stringify(result,null,2));
  if(result.summary.errors>0)process.exitCode=1;
 }
 else if(command==='llms-txt'){
  const sub=positionals[0];
  if(!values.file)throw Error('Use llms-txt audit --file <llms.txt> | generate --file <spec.json>');
  const {readFile}=await import('node:fs/promises');
  const {auditLlmsTxt,generateLlmsTxt}=await import('./llms-txt.mjs');
  const bytes=await readFile(values.file);if(bytes.length>524288)throw Error('Input exceeds 512 KiB');
  if(sub==='audit'){
   const result=auditLlmsTxt({content:bytes.toString('utf8'),...(values['site-url']?{siteUrl:values['site-url']}:{})});
   console.log(JSON.stringify(result,null,2));
   if(!result.ok)process.exitCode=1;
  }else if(sub==='generate'){
   const result=generateLlmsTxt(JSON.parse(bytes));
   console.log(JSON.stringify(result,null,2));
   if(!result.ok)process.exitCode=1;
  }else throw Error('Use llms-txt audit --file <llms.txt> | generate --file <spec.json>');
 }
 else if(command==='ai-crawler-audit'){
  if(!values.robots&&!values.file)throw Error('Use ai-crawler-audit [--robots <robots.txt>] [--file <page.html>] [--url <url>]');
  const {readFile}=await import('node:fs/promises');
  const {auditAiCrawlerAccess}=await import('./ai-crawler-audit.mjs');
  const payload={};
  if(values.url)payload.url=values.url;
  if(values.robots){const b=await readFile(values.robots);if(b.length>524288)throw Error('robots.txt exceeds 512 KiB');payload.robotsTxt=b.toString('utf8');}
  if(values.file){const b=await readFile(values.file);if(b.length>1048576)throw Error('HTML file exceeds 1 MiB');payload.html=b.toString('utf8');}
  const result=auditAiCrawlerAccess(payload);
  console.log(JSON.stringify(result,null,2));
  if(result.summary.errors>0)process.exitCode=1;
 }
 else if(command==='rag-audit'){
  if(!values.file)throw Error('Use rag-audit --file <article.md|txt> [--locale <ru|en>]');
  const {readFile}=await import('node:fs/promises');
  const {auditRagChunks}=await import('./rag-chunk-audit.mjs');
  const bytes=await readFile(values.file);if(bytes.length>204800)throw Error('Text file exceeds 200 KiB');
  const result=auditRagChunks({text:bytes.toString('utf8'),locale:values.locale});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='grounding-audit'){
  if(!values.file)throw Error('Use grounding-audit --file <article.md>');
  const {readFile}=await import('node:fs/promises');
  const {auditClaimGrounding}=await import('./grounding-audit.mjs');
  const bytes=await readFile(values.file);if(bytes.length>204800)throw Error('Markdown file exceeds 200 KiB');
  const result=auditClaimGrounding({markdown:bytes.toString('utf8')});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='terminology-audit'){
  if(!values.file||!values.glossary)throw Error('Use terminology-audit --file <doc.md> --glossary <glossary.json>');
  const {readFile}=await import('node:fs/promises');
  const {auditTerminologyConsistency}=await import('./terminology-audit.mjs');
  const [docBytes,glossaryBytes]=await Promise.all([readFile(values.file),readFile(values.glossary)]);
  if(docBytes.length>204800||glossaryBytes.length>262144)throw Error('Input file exceeds size limit');
  const result=auditTerminologyConsistency({text:docBytes.toString('utf8'),glossary:JSON.parse(glossaryBytes.toString('utf8'))});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='hydration-diff'){
  if(!values.before||!values.after)throw Error('Use hydration-diff --before <raw.html> --after <rendered.html> [--url <url>]');
  const {readFile}=await import('node:fs/promises');
  const {auditRawVsRenderedHtml}=await import('./hydration-diff-audit.mjs');
  const [rawBytes,renderedBytes]=await Promise.all([readFile(values.before),readFile(values.after)]);
  if(rawBytes.length>1048576||renderedBytes.length>1048576)throw Error('HTML input exceeds 1 MiB');
  const result=auditRawVsRenderedHtml({rawHtml:rawBytes.toString('utf8'),renderedHtml:renderedBytes.toString('utf8'),...(values.url?{url:values.url}:{})});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='batch-audit'){
  if(!values.dir)throw Error('Use batch-audit --dir <directory> [--preset blog|docs|landing|saas] [--format json|csv|sarif] [--output <file>]');
  const {writeFile}=await import('node:fs/promises');
  const {runBatchAudit,formatBatchCsv}=await import('./batch-audit.mjs');
  const {toSarifReport}=await import('./sarif-export.mjs');
  const result=await runBatchAudit({dir:values.dir,preset:values.preset});
  const text=values.format==='csv'?formatBatchCsv(result):values.format==='sarif'?JSON.stringify(toSarifReport(result),null,2):JSON.stringify(result,null,2);
  if(values.output)await writeFile(values.output,text,'utf8');
  else console.log(text);
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='snapshot'){
  if(!values.dir)throw Error('Use snapshot --dir <directory> [--output <snapshot.json>]');
  const {writeFile}=await import('node:fs/promises');
  const {runBatchAudit}=await import('./batch-audit.mjs');
  const {createBaselineSnapshot}=await import('./snapshot-diff.mjs');
  const snap=createBaselineSnapshot(await runBatchAudit({dir:values.dir}));
  const text=JSON.stringify(snap,null,2);
  if(values.output)await writeFile(values.output,text,'utf8');
  else console.log(text);
 }
 else if(command==='diff'){
  if(!values.before||!values.after)throw Error('Use diff --before <baseline.json> --after <current.json>');
  const {readFile}=await import('node:fs/promises');
  const {diffBaselineSnapshots}=await import('./snapshot-diff.mjs');
  const [bBytes,aBytes]=await Promise.all([readFile(values.before),readFile(values.after)]);
  if(bBytes.length>5242880||aBytes.length>5242880)throw Error('Snapshot file exceeds 5 MiB');
  const report=diffBaselineSnapshots({baseline:JSON.parse(bBytes.toString('utf8')),current:JSON.parse(aBytes.toString('utf8'))});
  console.log(JSON.stringify(report,null,2));
  if(!report.ok)process.exitCode=1;
 }
 else if(command==='prompt-injection-audit'){
  if(!values.file)throw Error('Use prompt-injection-audit --file <page.html|doc.md>');
  const {readFile}=await import('node:fs/promises');
  const {auditPromptInjectionAndHiddenText}=await import('./prompt-injection-audit.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>1048576)throw Error('Input file exceeds 1 MiB');
  const text=bytes.toString('utf8');
  const isHtml=/\.html?$/i.test(values.file);
  const result=auditPromptInjectionAndHiddenText(isHtml?{html:text}:{markdown:text.slice(0,200000)});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='serp-audit'){
  if(!values.file)throw Error('Use serp-audit --file <page.html> [--queries <primaryQuery>] [--url <url>]');
  const {readFile}=await import('node:fs/promises');
  const {auditSerpSnippet}=await import('./serp-snippet-audit.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>1048576)throw Error('HTML file exceeds 1 MiB');
  const result=auditSerpSnippet({html:bytes.toString('utf8'),...(values.queries?{primaryQuery:values.queries}:{}),...(values.url?{url:values.url}:{})});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='dom-perf-audit'){
  if(!values.file)throw Error('Use dom-perf-audit --file <page.html>');
  const {readFile}=await import('node:fs/promises');
  const {auditDomPerfHints}=await import('./dom-perf-audit.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>1048576)throw Error('HTML file exceeds 1 MiB');
  const result=auditDomPerfHints({html:bytes.toString('utf8')});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='cannibalization-audit'){
  if(!values.file)throw Error('Use cannibalization-audit --file <pages.json>');
  const {readFile}=await import('node:fs/promises');
  const {auditCannibalizationMatrix}=await import('./cannibalization-audit.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>1048576)throw Error('Pages JSON file exceeds 1 MiB');
  const result=auditCannibalizationMatrix(JSON.parse(bytes.toString('utf8')));
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='indexation-audit'){
  if(!values.file)throw Error('Use indexation-audit --file <pages.json>');
  const {readFile}=await import('node:fs/promises');
  const {auditIndexationHygiene}=await import('./indexation-hygiene-audit.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>1048576)throw Error('Pages JSON file exceeds 1 MiB');
  const result=auditIndexationHygiene(JSON.parse(bytes.toString('utf8')));
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='clarity-audit'){
  if(!values.file)throw Error('Use clarity-audit --file <article.md> [--locale ru|en]');
  const {readFile}=await import('node:fs/promises');
  const {auditEditorialClarity}=await import('./editorial-clarity-audit.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>204800)throw Error('Markdown file exceeds 200 KiB');
  const result=auditEditorialClarity({markdown:bytes.toString('utf8'),locale:values.locale});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='answer-first-audit'){
  if(!values.file)throw Error('Use answer-first-audit --file <article.md|page.html>');
  const {readFile}=await import('node:fs/promises');
  const {auditAnswerFirst}=await import('./answer-first-audit.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>204800)throw Error('Input file exceeds 200 KiB');
  const text=bytes.toString('utf8');
  const isHtml=/\.html?$/i.test(values.file);
  const result=auditAnswerFirst(isHtml?{html:text}:{markdown:text});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='suggest-fixes'){
  if(!values.file)throw Error('Use suggest-fixes --file <meta.json>');
  const {readFile}=await import('node:fs/promises');
  const {suggestSeoFixes}=await import('./fix-generator.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>204800)throw Error('Metadata JSON file exceeds 200 KiB');
  const result=suggestSeoFixes(JSON.parse(bytes.toString('utf8')));
  console.log(JSON.stringify(result,null,2));
 }
 else if(command==='llms-bundle'){
  if(!values.file)throw Error('Use llms-bundle --file <bundle-spec.json>');
  const {readFile}=await import('node:fs/promises');
  const {buildLlmsBundle}=await import('./llms-bundle.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>2097152)throw Error('Bundle spec JSON file exceeds 2 MiB');
  const result=buildLlmsBundle(JSON.parse(bytes.toString('utf8')));
  console.log(JSON.stringify(result,null,2));
 }
 else if(command==='llms-budget-audit'){
  if(!values.file)throw Error('Use llms-budget-audit --file <budget-input.json>');
  const {readFile}=await import('node:fs/promises');
  const {auditLlmsBudget}=await import('./llms-budget-audit.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>2097152)throw Error('Budget input JSON file exceeds 2 MiB');
  const result=auditLlmsBudget(JSON.parse(bytes.toString('utf8')));
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='geo-audit'){
  if(!values.file)throw Error('Use geo-audit --file <geo-input.json>');
  const {readFile}=await import('node:fs/promises');
  const {auditGeoReadiness}=await import('./geo-readiness-audit.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>2097152)throw Error('GEO input JSON file exceeds 2 MiB');
  const result=auditGeoReadiness(JSON.parse(bytes.toString('utf8')));
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='methodology'){
  const sub=positionals[0];
  const {readFile}=await import('node:fs/promises');
  const {listMethodologies,buildMethodologyPacket,validateMethodologyResult}=await import('./methodology-packets.mjs');
  if(sub==='list'){
   console.log(JSON.stringify(listMethodologies(),null,2));
  }else if(sub==='prepare'){
   if(!values.method||!values.file)throw Error('Use methodology prepare --method <id> --file <txt|md> [--url <url>] [--locale <ru|en>] [--queries <q1,q2>]');
   const bytes=await readFile(values.file);if(bytes.length>204800)throw Error('Text input exceeds 200 KiB');
   const queries=values.queries?values.queries.split(',').map(s=>s.trim()).filter(Boolean):undefined;
   const packet=buildMethodologyPacket({methodId:values.method,locale:values.locale,text:bytes.toString('utf8'),...(values.url?{url:values.url}:{}),...(queries?{queries}:{})});
   console.log(JSON.stringify(packet,null,2));
  }else if(sub==='validate'){
   if(!values.packet||!values.result||!values.file)throw Error('Use methodology validate --packet <json> --result <json> --file <txt|md>');
   const [packetBytes,resultBytes,textBytes]=await Promise.all([readFile(values.packet),readFile(values.result),readFile(values.file)]);
   if(packetBytes.length>1048576||resultBytes.length>1048576||textBytes.length>204800)throw Error('Input file exceeds size limit');
   const report=validateMethodologyResult({packet:JSON.parse(packetBytes),result:JSON.parse(resultBytes),text:textBytes.toString('utf8')});
   console.log(JSON.stringify(report,null,2));
   if(!report.ok)process.exitCode=1;
  }else if(sub==='run-local'){
   if(!values.packet||!values.file||!values.model)throw Error('Use methodology run-local --packet <json> --file <txt|md> --model <name> [--endpoint http://127.0.0.1:11434] [--max-tokens 2048]');
   const [packetBytes,textBytes]=await Promise.all([readFile(values.packet),readFile(values.file)]);
   if(packetBytes.length>1048576||textBytes.length>204800)throw Error('Input file exceeds size limit');
   const {runLocalMethodologyReview}=await import('./ollama-runner.mjs');
   const maxOutputTokens=Number(values['max-tokens']);
   const runReport=await runLocalMethodologyReview({packet:JSON.parse(packetBytes),text:textBytes.toString('utf8'),endpoint:values.endpoint,model:values.model,maxOutputTokens});
   console.log(JSON.stringify(runReport,null,2));
   if(!runReport.ok)process.exitCode=1;
  }else throw Error('Use methodology list | prepare | validate | run-local');
 }
 else if(command==='crawl'){
  const targetUrl=positionals[0]||values.url;
  if(!targetUrl)throw Error('Use crawl <url> --allow-network [--max-pages 50] [--max-depth 3] [--concurrency 3] [--render-js] [--format json|html|csv|jsonl|sarif|inventory] [--output <file>]');
  if(!values['allow-network'])throw Error('Live crawl requires explicit --allow-network flag.');
  const {crawlSite}=await import('./live-crawler.mjs');
  const result=await crawlSite({
   startUrl:targetUrl,
   allowNetwork:true,
   maxPages:Number(values['max-pages']),
   maxDepth:Number(values['max-depth']),
   maxBytesPerPage:Number(values['max-bytes']),
   concurrency:Number(values.concurrency),
   crawlDelayMs:Number(values['crawl-delay']),
   respectRobots:!values['no-robots'],
   followSitemaps:!values['no-sitemap'],
   renderJs:Boolean(values['render-js']),
   maxRenderPages:Number(values['max-render-pages'])
  });
  if(values.save&&Array.isArray(result.pages)&&result.pages.length>0){
   const {analyzeInternalLinkEquity}=await import('./link-equity.mjs');
   const {openWorkspaceDb,saveCrawlSnapshot}=await import('./workspace-store.mjs');
   const equity=analyzeInternalLinkEquity({startUrl:result.summary.startUrl,pages:result.pages});
   result.linkEquity=equity;
   const {db,dbPath}=await openWorkspaceDb(values.dir||process.cwd());
   try{
    result.savedSnapshot={...saveCrawlSnapshot(db,result,equity),dbPath};
   }finally{db.close();}
  }
  let payload;
  if(values.format==='inventory'){
   const {crawlToBlogInventory}=await import('./crawl-inventory.mjs');
   payload=JSON.stringify(crawlToBlogInventory(result),null,2);
  }else if(['html','csv','jsonl','sarif'].includes(values.format)){
   const {exportCrawlReport}=await import('./crawl-report.mjs');
   payload=exportCrawlReport(result,{format:values.format}).body;
  }else{
   payload=JSON.stringify(result,null,2);
  }
  if(values.output){
   const {writeFile}=await import('node:fs/promises');
   await writeFile(values.output,payload,'utf8');
  }
  console.log(payload);
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='report'){
  if(!values.file)throw Error('Use report --file <crawl.json> [--format html|csv|jsonl|sarif|inventory] [--output <file>]');
  const {readFile,writeFile}=await import('node:fs/promises');
  const {exportCrawlReport}=await import('./crawl-report.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>15728640)throw Error('Crawl JSON exceeds 15 MiB');
  const crawlData=JSON.parse(bytes.toString('utf8'));
  const fmt=values.format==='json'?'html':values.format;
  const out=fmt==='inventory'?{body:JSON.stringify((await import('./crawl-inventory.mjs')).crawlToBlogInventory(crawlData),null,2)}:exportCrawlReport(crawlData,{format:fmt});
  if(values.output)await writeFile(values.output,out.body,'utf8');
  console.log(out.body);
 }
 else if(command==='workspace'){
  const sub=positionals[0];
  const {openWorkspaceDb,saveCrawlSnapshot,listSnapshots,getSnapshot,updateFindingStatus}=await import('./workspace-store.mjs');
  const {db,dbPath}=await openWorkspaceDb(values.dir||process.cwd());
  try{
   if(sub==='list'){
    console.log(JSON.stringify({dbPath,snapshots:listSnapshots(db)},null,2));
   }else if(sub==='show'){
    if(!values.id)throw Error('Use workspace show --id <snapshotId> [--dir <projectDir>]');
    const snap=getSnapshot(db,values.id);
    if(!snap)throw Error(`Snapshot #${values.id} not found.`);
    console.log(JSON.stringify(snap,null,2));
   }else if(sub==='save'){
    if(!values.file)throw Error('Use workspace save --file <crawl.json> [--dir <projectDir>]');
    const {readFile}=await import('node:fs/promises');
    const {analyzeInternalLinkEquity}=await import('./link-equity.mjs');
    const bytes=await readFile(values.file);
    if(bytes.length>15728640)throw Error('Crawl JSON exceeds 15 MiB');
    const crawlData=JSON.parse(bytes.toString('utf8'));
    const equity=crawlData.pages?.length?analyzeInternalLinkEquity({startUrl:crawlData.summary?.startUrl,pages:crawlData.pages}):null;
    console.log(JSON.stringify({...saveCrawlSnapshot(db,crawlData,equity),dbPath},null,2));
   }else if(sub==='task'){
    if(!values.id||!values.status)throw Error('Use workspace task --id <findingId> --status <open|in_progress|fixed|ignored> [--dir <projectDir>]');
    console.log(JSON.stringify(updateFindingStatus(db,values.id,values.status),null,2));
   }else throw Error('Use workspace list | show | save | task');
  }finally{db.close();}
 }
 else if(command==='pagerank'){
  if(!values.file)throw Error('Use pagerank --file <crawl.json>');
  const {readFile}=await import('node:fs/promises');
  const {analyzeInternalLinkEquity}=await import('./link-equity.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>15728640)throw Error('Crawl JSON exceeds 15 MiB');
  const crawlData=JSON.parse(bytes.toString('utf8'));
  const result=analyzeInternalLinkEquity({startUrl:crawlData.summary?.startUrl,pages:crawlData.pages||[]});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='crawl-diff'){
  if(!values.before||!values.after)throw Error('Use crawl-diff --before <base.json|id> --after <curr.json|id> [--dir <projectDir>]');
  const {diffCrawlSnapshots}=await import('./crawl-diff.mjs');
  const loadTarget=async val=>{
   if(/^\d+$/.test(val)){
    const {openWorkspaceDb,getSnapshot}=await import('./workspace-store.mjs');
    const {db}=await openWorkspaceDb(values.dir||process.cwd());
    try{
     const snap=getSnapshot(db,val);
     if(!snap)throw Error(`Snapshot #${val} not found.`);
     return snap;
    }finally{db.close();}
   }
   const {readFile}=await import('node:fs/promises');
   const bytes=await readFile(val);
   if(bytes.length>15728640)throw Error('Snapshot JSON exceeds 15 MiB');
   return JSON.parse(bytes.toString('utf8'));
  };
  const [baseSnap,currSnap]=await Promise.all([loadTarget(values.before),loadTarget(values.after)]);
  const result=diffCrawlSnapshots(baseSnap,currSnap);
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='watch'){
  if(!values['allow-network'])throw Error('Watch requires explicit --allow-network flag.');
  const {watchSiteTemplates}=await import('./crawl-diff.mjs');
  let config;
  if(values.file){
   const {readFile}=await import('node:fs/promises');
   const bytes=await readFile(values.file);
   if(bytes.length>524288)throw Error('Watch config exceeds 512 KiB');
   config={...JSON.parse(bytes.toString('utf8')),allowNetwork:true};
  }else if(values.origin&&values.routes){
   config={origin:values.origin,allowNetwork:true,routes:values.routes.split(',').map(s=>s.trim()).filter(Boolean)};
  }else throw Error('Use watch --origin <url> --routes <r1,r2> --allow-network or watch --file <watch.json> --allow-network');
  const result=await watchSiteTemplates(config);
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='logs'){
  if(!values.file)throw Error('Use logs --file <access.log|cf.jsonl> [--crawled <crawl.json>] [--format auto|combined|cloudflare-jsonl]');
  const {readFile}=await import('node:fs/promises');
  const {analyzeAccessLogs}=await import('./access-log-analyzer.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>10485760)throw Error('Log file exceeds 10 MiB');
  let crawledUrls=[];
  if(values.crawled){
   const cBytes=await readFile(values.crawled);
   const crawlObj=JSON.parse(cBytes.toString('utf8'));
   crawledUrls=(crawlObj.pages||[]).map(p=>p.url).filter(Boolean);
  }
  const fmt=['combined','cloudflare-jsonl'].includes(values.format)?values.format:'auto';
  const result=analyzeAccessLogs({rawLog:bytes.toString('utf8'),format:fmt,crawledUrls});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='keywords'){
  const seed=positionals[0]||values.seed;
  if(!seed)throw Error('Use keywords <seed> --allow-network [--provider google|yandex] [--locale en|ru] [--mode questions|alphabet|both]');
  if(!values['allow-network'])throw Error('Keywords suggest collection requires explicit --allow-network flag.');
  const {collectKeywordSuggestTree}=await import('./keyword-suggest.mjs');
  let db=null;
  if(values.save||values.dir){
   const {openWorkspaceDb}=await import('./workspace-store.mjs');
   ({db}=await openWorkspaceDb(values.dir||process.cwd()));
  }
  try{
   const result=await collectKeywordSuggestTree({
    seed,
    provider:values.provider,
    locale:values.locale==='ru'?'ru':'en',
    mode:values.mode,
    allowNetwork:true
   },{db});
   console.log(JSON.stringify(result,null,2));
  }finally{db?.close();}
 }
 else if(command==='gsc-audit'){
  if(!values.file)throw Error('Use gsc-audit --file <queries.csv>');
  const {readFile}=await import('node:fs/promises');
  const {auditWebmasterCsv}=await import('./webmaster-csv-audit.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>10485760)throw Error('CSV file exceeds 10 MiB');
  const result=auditWebmasterCsv({csvText:bytes.toString('utf8')});
  console.log(JSON.stringify(result,null,2));
 }
 else if(command==='psi-audit'){
  const targetUrl=values.url||positionals[0];
  if(!values.file&&(!targetUrl||!values['allow-network']))throw Error('Use psi-audit --url <url> --allow-network [--strategy mobile|desktop] [--dom-file <page.html>] | --file <psi.json>');
  const {readFile}=await import('node:fs/promises');
  const {auditPageSpeedWithDom}=await import('./psi-connector.mjs');
  let psiResponse;
  if(values.file){
   const pBytes=await readFile(values.file);
   if(pBytes.length>10485760)throw Error('PSI JSON exceeds 10 MiB');
   psiResponse=JSON.parse(pBytes.toString('utf8'));
  }
  let domPerfReport;
  if(values['dom-file']){
   const {auditDomPerf}=await import('./dom-perf-audit.mjs');
   const hBytes=await readFile(values['dom-file']);
   if(hBytes.length>1048576)throw Error('HTML exceeds 1 MiB');
   domPerfReport=auditDomPerf({html:hBytes.toString('utf8')});
  }
  const result=await auditPageSpeedWithDom({
   url:targetUrl||'https://example.com/',
   strategy:values.strategy==='desktop'?'desktop':'mobile',
   allowNetwork:Boolean(values['allow-network']),
   ...(values['api-key']?{apiKey:values['api-key']}:{}),
   ...(psiResponse?{psiResponse}:{}),
   ...(domPerfReport?{domPerfReport}:{})
  });
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='history'){
  const domain=positionals[0]||values.domain;
  if(!domain)throw Error('Use history <domain> --allow-network | history <domain> --file <cdx.json>');
  const {analyzeArchiveHistory}=await import('./history-cdx.mjs');
  let cdxRows;
  if(values.file){
   const {readFile}=await import('node:fs/promises');
   const bytes=await readFile(values.file);
   if(bytes.length>10485760)throw Error('CDX JSON exceeds 10 MiB');
   cdxRows=JSON.parse(bytes.toString('utf8'));
  }else if(!values['allow-network']){
   throw Error('Archive history fetch requires --allow-network or offline --file <cdx.json>.');
  }
  const result=await analyzeArchiveHistory({
   domain,
   allowNetwork:Boolean(values['allow-network']),
   ...(cdxRows?{cdxRows}:{})
  });
  console.log(JSON.stringify(result,null,2));
 }
 else if(command==='dataforseo'){
  if(!values['allow-network'])throw Error('DataForSEO BYOK pipeline requires --allow-network.');
  if(!values.queries)throw Error('Use dataforseo --action volumes|serp --queries <k1,k2> --allow-network [--location 2840] [--locale en]');
  const {runDataForSeoByok}=await import('./dataforseo-connector.mjs');
  const keywords=values.queries.split(',').map(s=>s.trim()).filter(Boolean);
  let db=null;
  if(values.save||values.dir){
   const {openWorkspaceDb}=await import('./workspace-store.mjs');
   ({db}=await openWorkspaceDb(values.dir||process.cwd()));
  }
  try{
   const result=await runDataForSeoByok({
    action:values.action==='serp'?'serp':'volumes',
    keywords,
    locationCode:Number(values.location),
    languageCode:values.locale,
    allowNetwork:true
   },{db});
   console.log(JSON.stringify(result,null,2));
  }finally{db?.close();}
 }
 else if(command==='serp-cluster'){
  if(!values.file)throw Error('Use serp-cluster --file <serp-entries.json> [--mode hard|soft] [--min-overlap 3] [--inventory <pages.json>]');
  const {readFile}=await import('node:fs/promises');
  const {clusterSerpKeywords}=await import('./serp-clusterer.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>15728640)throw Error('Input exceeds 15 MiB');
  const payload=JSON.parse(bytes.toString('utf8'));
  const entries=Array.isArray(payload)?payload:(payload.entries||[]);
  let existingPages=Array.isArray(payload)?[]:(payload.existingPages||[]);
  if(values.inventory){
   const iBytes=await readFile(values.inventory);
   if(iBytes.length>15728640)throw Error('Inventory exceeds 15 MiB');
   const inv=JSON.parse(iBytes.toString('utf8'));
   existingPages=(inv.pages||[]).map(p=>({url:p.url,title:p.title||'',h1:p.h1||'',primaryQuery:p.primaryQuery}));
  }
  const mode=values.mode==='hard'?'hard':'soft';
  const minOverlap=Number(values['min-overlap'])||3;
  const result=clusterSerpKeywords({entries,mode,minOverlap,existingPages});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='serp-gap'){
  if(!values.file)throw Error('Use serp-gap --file <gap-input.json> [--locale en|ru]');
  const {readFile}=await import('node:fs/promises');
  const {analyzeSerpGap}=await import('./serp-gap-analyzer.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>15728640)throw Error('Gap input exceeds 15 MiB');
  const input=JSON.parse(bytes.toString('utf8'));
  if(!input.locale)input.locale=values.locale==='ru'?'ru':'en';
  const result=analyzeSerpGap(input);
  console.log(JSON.stringify(result,null,2));
 }
 else if(command==='cocoon-plan'){
  if(!values.file)throw Error('Use cocoon-plan --file <cocoon-plan.json>');
  const {readFile}=await import('node:fs/promises');
  const {planCocoonAndAnchors}=await import('./cocoon-planner.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>15728640)throw Error('Plan input exceeds 15 MiB');
  const result=planCocoonAndAnchors(JSON.parse(bytes.toString('utf8')));
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='content-brief'){
  if(!values.file)throw Error('Use content-brief --file <brief-input.json> [--format md|json] [--output <file>]');
  const {readFile,writeFile}=await import('node:fs/promises');
  const {generateContentBrief}=await import('./content-brief-generator.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>10485760)throw Error('Brief input exceeds 10 MiB');
  const result=generateContentBrief(JSON.parse(bytes.toString('utf8')));
  const outText=values.format==='md'||values.format==='markdown'?result.markdown:JSON.stringify(result,null,2);
  if(values.output){await writeFile(values.output,outText,'utf8');console.log(JSON.stringify({written:values.output,ok:result.ok},null,2));}
  else console.log(outText);
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='eeat-audit'){
  if(!values.file)throw Error('Use eeat-audit --file <page.html> [--url <page URL>]');
  const {readFile}=await import('node:fs/promises');
  const {auditEeatSignals}=await import('./eeat-audit.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>1048576)throw Error('HTML exceeds 1 MiB');
  const result=auditEeatSignals({html:bytes.toString('utf8'),...(values.url?{url:values.url}:{})});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='hreflang-live'){
  if(!values.file)throw Error('Use hreflang-live --file <crawl.json>');
  const {readFile}=await import('node:fs/promises');
  const {auditLiveCrawlHreflang}=await import('./sitemap-indexnow.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>15728640)throw Error('Crawl JSON exceeds 15 MiB');
  const data=JSON.parse(bytes.toString('utf8'));
  const result=auditLiveCrawlHreflang({pages:data.pages||data});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='sitemap-split'){
  if(!values.file&&(!values['site-url']||!values.crawled))throw Error('Use sitemap-split --file <urls.json> | --site-url <url> --crawled <crawl.json> [--max-urls 50000]');
  const {readFile}=await import('node:fs/promises');
  const {buildSegmentedSitemaps}=await import('./sitemap-indexnow.mjs');
  let input;
  if(values.file){
   const bytes=await readFile(values.file);
   if(bytes.length>15728640)throw Error('Sitemap input exceeds 15 MiB');
   input=JSON.parse(bytes.toString('utf8'));
  }else{
   const cBytes=await readFile(values.crawled);
   const crawlObj=JSON.parse(cBytes.toString('utf8'));
   const urls=(crawlObj.pages||[]).filter(p=>(p.statusCode??200)===200).map(p=>({loc:p.url}));
   input={siteUrl:values['site-url'],urls,maxUrlsPerFile:Number(values['max-urls'])||50000};
  }
  const result=buildSegmentedSitemaps(input);
  console.log(JSON.stringify(result,null,2));
 }
 else if(command==='indexnow'){
  if(!values.file||!values['allow-network'])throw Error('Use indexnow --file <indexnow.json> --allow-network');
  const {readFile}=await import('node:fs/promises');
  const {pushIndexNow}=await import('./sitemap-indexnow.mjs');
  const bytes=await readFile(values.file);
  if(bytes.length>2097152)throw Error('IndexNow JSON exceeds 2 MiB');
  const input=JSON.parse(bytes.toString('utf8'));
  const result=await pushIndexNow({...input,allowNetwork:true});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
 }
 else if(command==='benchmark'){
  if(!values['allow-network'])throw Error('Benchmark runner requires explicit --allow-network flag.');
  const {readFile,writeFile}=await import('node:fs/promises');
  const {runEthicalBenchmark}=await import('./benchmark-runner.mjs');
  let origins=[];
  if(values.file){
   const raw=await readFile(values.file,'utf8');
   origins=raw.trim().startsWith('[')?JSON.parse(raw):raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  }else if(values.url){
   origins=values.url.split(',').map(s=>s.trim()).filter(Boolean);
  }else if(positionals.length>0){
   origins=positionals;
  }else{
   throw Error('Use benchmark --file <origins.txt|json> --allow-network | benchmark <url> --allow-network [--output <report.json>]');
  }
  const result=await runEthicalBenchmark({origins,allowNetwork:true,concurrency:Number(values.concurrency)||4});
  if(values.output){await writeFile(values.output,JSON.stringify(result,null,2),'utf8');console.log(JSON.stringify({written:values.output,sha256:result.sha256,summary:result.summary},null,2));}
  else console.log(JSON.stringify(result,null,2));
 }
 else if(command==='help'){console.log('Reproleaf\n  node src/cli.mjs list\n  node src/cli.mjs case <id>\n  node src/cli.mjs clients\n  node src/cli.mjs diagnose [--stack <name>] [--render-mode <csr|ssr|ssg|hybrid|islands>] [--symptom <text>] [--category <category>] [--package <package.json> | --context <metadata.json> [--application <id>]]\n  node src/cli.mjs compare --before <report.json> --after <report.json>\n  node src/cli.mjs sanitize --report <report.json>\n  node src/cli.mjs contribute --packet <contribution.json>\n  node src/cli.mjs rewrite-guard --before <file> --after <file> | --packet <json>\n  node src/cli.mjs accessibility-audit --file <page.html> --allow-browser [--locale ru|en] [--output report.json]\n  node src/cli.mjs html-audit --file <page.html> [--url <page URL>]\n  node src/cli.mjs schema-audit --file <page.html> [--url <page URL>]\n  node src/cli.mjs social-audit --file <page.html> [--url <page URL>]\n  node src/cli.mjs crawl-policy [--robots <robots.txt>] [--sitemap <sitemap.xml>] [--site-url <url>]\n  node src/cli.mjs redirect-audit --file <traces.json> | --url <url> --allow-network\n  node src/cli.mjs cocoon-audit --file <inventory.json>\n  node src/cli.mjs hreflang-audit --file <matrix.json>\n  node src/cli.mjs llms-txt audit --file <llms.txt> | generate --file <spec.json>\n  node src/cli.mjs ai-crawler-audit [--robots <robots.txt>] [--file <page.html>] [--url <url>]\n  node src/cli.mjs rag-audit --file <article.md|txt> [--locale <ru|en>]\n  node src/cli.mjs grounding-audit --file <article.md>\n  node src/cli.mjs terminology-audit --file <doc.md> --glossary <glossary.json>\n  node src/cli.mjs hydration-diff --before <raw.html> --after <rendered.html> [--url <url>]\n  node src/cli.mjs batch-audit --dir <directory> [--preset blog|docs|landing|saas] [--format json|csv|sarif] [--output <file>]\n  node src/cli.mjs snapshot --dir <directory> [--output <snapshot.json>]\n  node src/cli.mjs diff --before <baseline.json> --after <current.json>\n  node src/cli.mjs prompt-injection-audit --file <page.html|doc.md>\n  node src/cli.mjs serp-audit --file <page.html> [--queries <primaryQuery>] [--url <url>]\n  node src/cli.mjs dom-perf-audit --file <page.html>\n  node src/cli.mjs cannibalization-audit --file <pages.json>\n  node src/cli.mjs indexation-audit --file <pages.json>\n  node src/cli.mjs clarity-audit --file <article.md> [--locale ru|en]\n  node src/cli.mjs answer-first-audit --file <article.md|page.html>\n  node src/cli.mjs suggest-fixes --file <meta.json>\n  node src/cli.mjs llms-bundle --file <bundle-spec.json>\n  node src/cli.mjs llms-budget-audit --file <budget-input.json>\n  node src/cli.mjs geo-audit --file <geo-input.json>\n  node src/cli.mjs crawl <url> --allow-network [--max-pages 50] [--max-depth 3] [--concurrency 3] [--render-js] [--save] [--format json|html|csv|jsonl|sarif|inventory] [--output <file>]\n  node src/cli.mjs report --file <crawl.json> [--format html|csv|jsonl|sarif|inventory] [--output <file>]\n  node src/cli.mjs workspace list | show --id <id> | save --file <crawl.json> | task --id <id> --status <status>\n  node src/cli.mjs pagerank --file <crawl.json>\n  node src/cli.mjs crawl-diff --before <base.json|id> --after <curr.json|id>\n  node src/cli.mjs watch --origin <url> --routes <r1,r2> --allow-network\n  node src/cli.mjs logs --file <access.log|cf.jsonl> [--crawled <crawl.json>]\n  node src/cli.mjs keywords <seed> --allow-network [--provider google|yandex] [--locale en|ru]\n  node src/cli.mjs gsc-audit --file <queries.csv>\n  node src/cli.mjs psi-audit --url <url> --allow-network | --file <psi.json>\n  node src/cli.mjs history <domain> --allow-network | --file <cdx.json>\n  node src/cli.mjs dataforseo --action volumes|serp --queries <k1,k2> --allow-network\n  node src/cli.mjs serp-cluster --file <serp-entries.json> [--mode hard|soft] [--min-overlap 3] [--inventory <pages.json>]\n  node src/cli.mjs serp-gap --file <gap-input.json> [--locale en|ru]\n  node src/cli.mjs cocoon-plan --file <cocoon-plan.json>\n  node src/cli.mjs content-brief --file <brief-input.json> [--format md|json] [--output <file>]\n  node src/cli.mjs eeat-audit --file <page.html> [--url <page URL>]\n  node src/cli.mjs hreflang-live --file <crawl.json>\n  node src/cli.mjs sitemap-split --file <urls.json> | --site-url <url> --crawled <crawl.json>\n  node src/cli.mjs indexnow --file <indexnow.json> --allow-network\n  node src/cli.mjs benchmark --file <origins.txt|json> --allow-network [--output <report.json>]\n  node src/cli.mjs methodology list | prepare | validate | run-local\n  node src/cli.mjs serve [--port 4179]\n  node src/cli.mjs verify --all|--case <id> [--variant both|broken|fixed] [--output <directory>]\n  node src/cli.mjs check --adapter <local JSON file> [--allow-network] [--output <directory>]\n  node src/cli.mjs editorial workflow\n  node src/cli.mjs editorial review --packet <local JSON file>\n  node src/cli.mjs skill install --skill <name> --dest <skills directory>\n  node src/mcp.mjs');}
 else throw Error('Unknown command');
}catch(error){console.error(error.message);process.exitCode=1;}
