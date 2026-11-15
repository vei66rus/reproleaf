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
 const {values,positionals}=parseArgs({args,allowPositionals:true,options:{case:{type:'string'},all:{type:'boolean'},variant:{type:'string',default:'both'},output:{type:'string'},port:{type:'string',default:'4179'},adapter:{type:'string'},'allow-network':{type:'boolean'},packet:{type:'string'},report:{type:'string'},file:{type:'string'},url:{type:'string'},inventory:{type:'string'},skill:{type:'string'},dest:{type:'string'},stack:{type:'string'},'render-mode':{type:'string'},symptom:{type:'string'},category:{type:'string'},package:{type:'string'},context:{type:'string'},application:{type:'string'},'target-url':{type:'string'},before:{type:'string'},after:{type:'string'},method:{type:'string'},locale:{type:'string',default:'en'},queries:{type:'string'},result:{type:'string'},model:{type:'string'},endpoint:{type:'string',default:'http://127.0.0.1:11434'},'max-tokens':{type:'string',default:'2048'},robots:{type:'string'},sitemap:{type:'string'},'site-url':{type:'string'},pages:{type:'string'},glossary:{type:'string'},dir:{type:'string'},format:{type:'string',default:'json'},preset:{type:'string',default:'saas'}}});
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
 else if(command==='html-audit'){
  if(!values.file)throw Error('Use html-audit --file <local HTML file> [--url <page URL>]');
  const {readFile}=await import('node:fs/promises');
  const {auditHtmlDocument}=await import('./html-audit.mjs');
  const bytes=await readFile(values.file);if(bytes.length>1048576)throw Error('HTML file exceeds 1 MiB');
  const result=auditHtmlDocument({html:bytes.toString('utf8'),...(values.url?{url:values.url}:{})});
  console.log(JSON.stringify(result,null,2));
  if(result.summary.errors>0)process.exitCode=1;
 }
 else if(command==='schema-audit'){
  if(!values.file)throw Error('Use schema-audit --file <local HTML file> [--url <page URL>]');
  const {readFile}=await import('node:fs/promises');
  const {auditJsonLd}=await import('./schema-audit.mjs');
  const bytes=await readFile(values.file);if(bytes.length>1048576)throw Error('HTML file exceeds 1 MiB');
  const result=auditJsonLd({html:bytes.toString('utf8'),...(values.url?{url:values.url}:{})});
  console.log(JSON.stringify(result,null,2));
  if(result.summary.errors>0)process.exitCode=1;
 }
 else if(command==='social-audit'){
  if(!values.file)throw Error('Use social-audit --file <local HTML file> [--url <page URL>]');
  const {readFile}=await import('node:fs/promises');
  const {auditSocialMeta}=await import('./social-audit.mjs');
  const bytes=await readFile(values.file);if(bytes.length>1048576)throw Error('HTML file exceeds 1 MiB');
  const result=auditSocialMeta({html:bytes.toString('utf8'),...(values.url?{url:values.url}:{})});
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
 else if(command==='help'){console.log('Reproleaf\n  node src/cli.mjs list\n  node src/cli.mjs case <id>\n  node src/cli.mjs clients\n  node src/cli.mjs diagnose [--stack <name>] [--render-mode <csr|ssr|ssg|hybrid|islands>] [--symptom <text>] [--category <category>] [--package <package.json> | --context <metadata.json> [--application <id>]]\n  node src/cli.mjs compare --before <report.json> --after <report.json>\n  node src/cli.mjs sanitize --report <report.json>\n  node src/cli.mjs contribute --packet <contribution.json>\n  node src/cli.mjs rewrite-guard --before <file> --after <file> | --packet <json>\n  node src/cli.mjs html-audit --file <page.html> [--url <page URL>]\n  node src/cli.mjs schema-audit --file <page.html> [--url <page URL>]\n  node src/cli.mjs social-audit --file <page.html> [--url <page URL>]\n  node src/cli.mjs crawl-policy [--robots <robots.txt>] [--sitemap <sitemap.xml>] [--site-url <url>]\n  node src/cli.mjs redirect-audit --file <traces.json> | --url <url> --allow-network\n  node src/cli.mjs cocoon-audit --file <inventory.json>\n  node src/cli.mjs hreflang-audit --file <matrix.json>\n  node src/cli.mjs llms-txt audit --file <llms.txt> | generate --file <spec.json>\n  node src/cli.mjs ai-crawler-audit [--robots <robots.txt>] [--file <page.html>] [--url <url>]\n  node src/cli.mjs rag-audit --file <article.md|txt> [--locale <ru|en>]\n  node src/cli.mjs grounding-audit --file <article.md>\n  node src/cli.mjs terminology-audit --file <doc.md> --glossary <glossary.json>\n  node src/cli.mjs hydration-diff --before <raw.html> --after <rendered.html> [--url <url>]\n  node src/cli.mjs batch-audit --dir <directory> [--preset blog|docs|landing|saas] [--format json|csv|sarif] [--output <file>]\n  node src/cli.mjs snapshot --dir <directory> [--output <snapshot.json>]\n  node src/cli.mjs diff --before <baseline.json> --after <current.json>\n  node src/cli.mjs prompt-injection-audit --file <page.html|doc.md>\n  node src/cli.mjs methodology list | prepare | validate | run-local\n  node src/cli.mjs serve [--port 4179]\n  node src/cli.mjs verify --all|--case <id> [--variant both|broken|fixed] [--output <directory>]\n  node src/cli.mjs check --adapter <local JSON file> [--allow-network] [--output <directory>]\n  node src/cli.mjs editorial workflow\n  node src/cli.mjs editorial review --packet <local JSON file>\n  node src/cli.mjs skill install --skill <name> --dest <skills directory>\n  node src/mcp.mjs');}
 else throw Error('Unknown command');
}catch(error){console.error(error.message);process.exitCode=1;}
