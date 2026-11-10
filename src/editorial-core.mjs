import {articleDiagnostics} from './diagnostics.mjs';
import {z} from 'zod';
import {marked} from 'marked';
import {countPhrase} from './blog-graph.mjs';
const text=z.string().max(2000),id=z.string().min(1).max(80);
const httpUrl=z.string().max(2048).url().refine(v=>['http:','https:'].includes(new URL(v).protocol),'HTTP(S) source URL required');
export const editorialSchema=z.object({
 schemaVersion:z.literal(1),locale:z.string().max(20),market:text,primaryQuery:z.string().max(200),readerTask:z.string().max(2000),
 article:z.object({title:z.string().max(500),description:z.string().max(1000),renderedH1:z.string().max(1000).optional(),h1Mode:z.enum(['markdown','renderer']),markdown:z.string().min(1).max(150000)}).strict(),
 sources:z.array(z.object({id,url:httpUrl,checkedAt:z.string().datetime(),excerpt:z.string().min(1).max(4000),humanReviewed:z.boolean()}).strict()).max(100),
 claims:z.array(z.object({id,text:z.string().min(1).max(2000),sourceIds:z.array(id).max(10),kind:z.enum(['fact','calculation','observation']),calculation:z.object({artifactSha256:z.string().regex(/^[a-f0-9]{64}$/),assumptions:z.string().min(1).max(4000),reproduction:z.string().min(1).max(2000)}).strict().optional()}).strict()).max(100),
 sitePaths:z.array(z.string().startsWith('/').max(600)).max(1000).optional(),
 glossary:z.array(z.object({canonical:z.string().min(1).max(200),prohibitedVariants:z.array(z.string().min(1).max(200)).max(20)}).strict()).max(200),
 reviewedSections:z.array(z.string().max(300)).max(100).default([])
}).strict();
function extractContextSnippet(sourceText,needle,windowChars=80){
 if(!sourceText||!needle)return '';
 const index=sourceText.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
 if(index<0)return needle.slice(0,200);
 const start=Math.max(0,index-windowChars),end=Math.min(sourceText.length,index+needle.length+windowChars);
 return ((start>0?'…':'')+sourceText.slice(start,end).replace(/\s+/g,' ').trim()+(end<sourceText.length?'…':'')).slice(0,240);
}
export function reviewEditorial(input,onPhase=()=>{}){
 onPhase('validate');
 const packet=editorialSchema.parse(input),findings=[];
 const add=(severity,code,message,record,extra={})=>findings.push({
  severity,
  priority:severity==='error'?1:['no-declared-claims','sections-need-editorial-review','internal-inventory-not-provided'].includes(code)?3:2,
  code,
  message,
  ...(record?{record}:{}),
  observation:extra.observation||message,
  why:extra.why||'',
  ...(extra.snippet?{snippet:String(extra.snippet).slice(0,240)}:{}),
  suggestion:extra.suggestion||'',
  verifyHint:extra.verifyHint||''
 });
 if(!packet.article.title.trim())add('warning','title-not-provided','Search title was not supplied; title relevance was not evaluated.',undefined,{
  observation:'Search title field is empty.',
  why:'Without the search title, phrase presence and title length cannot be inspected.',
  suggestion:'Add the page title from your CMS or frontmatter before running the final pre-publish check.',
  verifyHint:'Supply article.title and re-run to confirm the title diagnostic turns good.'
 });
 if(!packet.article.description.trim())add('warning','description-not-provided','Meta description was not supplied; it was not evaluated.',undefined,{
  observation:'Meta description field is empty.',
  why:'The snippet summary shown in search results or previews was not provided for inspection.',
  suggestion:'Provide the meta description summarizing the article answer and scope.',
  verifyHint:'Supply article.description and re-run to confirm the description diagnostic turns good.'
 });
 if(!packet.primaryQuery.trim())add('warning','primary-query-not-provided','No primary query supplied; phrase occurrences are unknown.',undefined,{
  observation:'Primary query is empty.',
  why:'Exact phrase counts in title, H1 and body require a target query phrase.',
  suggestion:'Enter the main search phrase if this page targets a specific query.',
  verifyHint:'Supply primaryQuery and re-run to inspect query-title, query-h1 and query-body counts.'
 });
 if(!packet.readerTask.trim())add('warning','reader-task-not-provided','The reader task was not supplied; intent coverage needs editorial review.',undefined,{
  observation:'Reader task is empty.',
  why:'Defining what the reader must accomplish helps verify that sections answer the real task rather than padding keywords.',
  suggestion:'State the concrete task the reader wants to complete after reading.',
  verifyHint:'Supply readerTask and re-run to record the reader task check.'
 });
 const plain=packet.article.markdown.replace(/```[\s\S]*?```/g,'');
 onPhase('structure');
 const tokens=marked.lexer(packet.article.markdown),headings=[],links=[],linkTokens=[],images=[],htmlSnippets=[],visibleParts=[];let rawHtml=false;
 marked.walkTokens(tokens,token=>{
  if(token.type==='heading')headings.push([token.raw,'#'.repeat(token.depth),token.text]);
  if(token.type==='link'){links.push(token.href);linkTokens.push({href:token.href,text:token.text||'',raw:token.raw||token.href});}
  if(token.type==='image')images.push(token);
  if(token.type==='html'){rawHtml=true;if(token.raw)htmlSnippets.push(token.raw.trim());}
  if((token.type==='text'&&!token.tokens)||token.type==='codespan')visibleParts.push(token.text);
 });
 const h1=headings.filter(h=>h[1].length===1),expectedH1=packet.article.h1Mode==='renderer'?0:1;
 if(h1.length!==expectedH1)add('error','h1-count',packet.article.h1Mode==='renderer'?'Renderer supplies H1; avoid adding a duplicate H1 inside this Markdown body.':'This configured Markdown document supplies its own H1.',undefined,{
  observation:`Found ${h1.length} Markdown H1 heading(s); expected ${expectedH1} for h1Mode="${packet.article.h1Mode}".`,
  why:packet.article.h1Mode==='renderer'?'The CMS template already outputs the H1; an extra # in the body creates duplicate H1 headings.':'In markdown H1 mode, the document body must provide exactly one top-level # heading.',
  snippet:h1[0]?.[0]?.trim()||(headings[0]?.[0]?.trim()||''),
  suggestion:packet.article.h1Mode==='renderer'?'Demote # headings inside the Markdown body to ## or switch h1Mode to "markdown".':'Add a single # heading at the top of the Markdown document or switch h1Mode to "renderer".',
  verifyHint:'Re-run with the same h1Mode and confirm the h1 check status is good.'
 });
 if(headings.length&&headings[0][1].length>(packet.article.h1Mode==='renderer'?2:1))add('warning','heading-level-gap','Heading hierarchy starts below the expected first section level.',headings[0][2],{
  observation:`First heading is ${headings[0][1]} ("${headings[0][2]}"), skipping expected level H${packet.article.h1Mode==='renderer'?2:1}.`,
  why:'Starting with a deeper heading level breaks the document outline for assistive tools and readers.',
  snippet:headings[0][0].trim(),
  suggestion:`Change "${headings[0][1]} ${headings[0][2]}" to "${'#'.repeat(packet.article.h1Mode==='renderer'?2:1)} ${headings[0][2]}".`,
  verifyHint:'Re-run the check and confirm the hierarchy diagnostic turns good.'
 });
 for(let i=1;i<headings.length;i++)if(headings[i][1].length>headings[i-1][1].length+1)add('warning','heading-level-gap','Heading hierarchy skips a level.',headings[i][2],{
  observation:`Heading "${headings[i][2]}" (${headings[i][1]}) follows "${headings[i-1][2]}" (${headings[i-1][1]}).`,
  why:'Skipping heading levels (such as H2 directly to H4) makes section nesting ambiguous.',
  snippet:`${headings[i-1][1]} ${headings[i-1][2]} → ${headings[i][1]} ${headings[i][2]}`,
  suggestion:`Use ${'#'.repeat(headings[i-1][1].length+1)} for "${headings[i][2]}" or add the missing parent section heading.`,
  verifyHint:'Re-run the check and confirm heading-level-gap is resolved.'
 });
 onPhase('evidence');
 const sourceMap=new Map();
 for(const source of packet.sources){
  if(sourceMap.has(source.id))add('error','duplicate-source-id','Source IDs must be unique.',source.id,{
   observation:`Source ID "${source.id}" appears more than once in sources[].`,
   why:'Duplicate source identifiers make claim-to-source provenance ambiguous.',
   snippet:`source.id = "${source.id}" (${source.url})`,
   suggestion:`Assign a distinct id to each entry in sources[].`,
   verifyHint:'Re-run with unique source IDs and confirm duplicate-source-id disappears.'
  });
  sourceMap.set(source.id,source);
 }
 const claimIds=new Set();
 for(const claim of packet.claims){
  if(claimIds.has(claim.id))add('error','duplicate-claim-id','Claim IDs must be unique.',claim.id,{
   observation:`Claim ID "${claim.id}" is declared multiple times.`,
   why:'Each material claim needs a distinct identifier so review status can be tracked across revisions.',
   snippet:claim.text,
   suggestion:`Rename the duplicate "${claim.id}" entry in claims[].`,
   verifyHint:'Re-run with unique claim IDs.'
  });
  claimIds.add(claim.id);
  if(!plain.includes(claim.text))add('warning','claim-not-in-draft','Declared claim text is absent from the supplied draft.',claim.id,{
   observation:`Claim "${claim.id}" text was not found verbatim in the Markdown body.`,
   why:'When the draft text diverges from the declared claim record, the evidence binding may no longer match what the article states.',
   snippet:claim.text,
   suggestion:'Update claims[].text to match the current sentence in the draft, or restore the exact statement in the Markdown.',
   verifyHint:'Keep the claim ID in claims[] with matching draft text and re-run.'
  });
  if(claim.kind==='fact'&&!claim.sourceIds.length)add('error','unbound-fact','Declared factual claim has no source binding.',claim.id,{
   observation:`Factual claim "${claim.id}" has an empty sourceIds array.`,
   why:'Every declared factual claim requires at least one supporting source record.',
   snippet:claim.text,
   suggestion:`Add a verified source record to sources[] and reference its id in claim "${claim.id}" sourceIds.`,
   verifyHint:'Keep claim ID in claims[] with a valid reviewed sourceId and re-run.'
  });
  for(const sourceId of claim.sourceIds){
   const source=sourceMap.get(sourceId);
   if(!source)add('error','unknown-source','Claim references an unknown source ID.',claim.id,{
    observation:`Claim "${claim.id}" references sourceId "${sourceId}", which is not in sources[].`,
    why:'A claim cannot be verified against a missing source record.',
    snippet:`${claim.id} → ${sourceId}: "${claim.text}"`,
    suggestion:`Add source "${sourceId}" to sources[] or fix the typo in sourceIds.`,
    verifyHint:'Re-run with the matching source record present.'
   });
   else if(!source.humanReviewed)add('warning','unreviewed-source','Source record exists, but its support has not been editorially checked.',claim.id,{
    observation:`Source "${sourceId}" (${source.url}) has humanReviewed=false for claim "${claim.id}".`,
    why:'A recorded URL or excerpt does not prove the source actually supports the claim until a human editor checks it.',
    snippet:`${source.url} — "${source.excerpt.slice(0,140)}"`,
    suggestion:'Read the cited source excerpt against the draft sentence, then set humanReviewed: true.',
    verifyHint:'Set humanReviewed: true on the source record after editorial verification and re-run.'
   });
  }
  if(claim.kind==='calculation'&&!claim.calculation)add('error','missing-calculation-evidence','Calculation claim needs an artifact hash, assumptions and reproduction instructions.',claim.id,{
   observation:`Calculation claim "${claim.id}" omits the calculation metadata object.`,
   why:'Numbers and formulas need explicit assumptions and reproduction steps so another person can verify the result.',
   snippet:claim.text,
   suggestion:'Provide calculation.artifactSha256, calculation.assumptions and calculation.reproduction for this claim.',
   verifyHint:'Keep the claim ID and include the calculation object on the next run.'
  });
  if(claim.kind==='observation')add('warning','observation-needs-review','Confirm observation provenance and limitations separately.',claim.id,{
   observation:`Claim "${claim.id}" is marked as an observation.`,
   why:'Empirical observations depend on measurement scope, date and sample constraints.',
   snippet:claim.text,
   suggestion:'State the measurement date, sample scope and limitations directly in the section text.',
   verifyHint:'Review the observation context in the draft alongside its source binding.'
  });
 }
 if(rawHtml)add('warning','raw-html-not-audited','Embedded HTML headings and links require separate rendered-page review.',undefined,{
  observation:'Raw HTML blocks or inline tags were detected inside the Markdown draft.',
  why:'The Markdown parser does not audit links, headings or scripts hidden inside raw HTML fragments.',
  snippet:htmlSnippets[0]||'',
  suggestion:'Replace raw HTML with standard Markdown syntax where possible, or inspect the rendered HTML page separately.',
  verifyHint:'Remove unnecessary raw HTML or verify the rendered DOM with the page exporter.'
 });
 if(packet.sitePaths===undefined)add('warning','internal-inventory-not-provided','Internal targets were not checked because no site inventory was supplied.',undefined,{
  observation:'sitePaths inventory was not provided.',
  why:'Without a list of known site paths, internal links in the draft cannot be checked against existing destinations.',
  suggestion:'Enable the page inventory check and paste known site paths (one path per line).',
  verifyHint:'Supply sitePaths and re-run to verify all internal links.'
 });
 for(const token of linkTokens){
  const href=token.href;
  if(href.startsWith('/')&&!href.startsWith('//')&&packet.sitePaths!==undefined){
   const p=href.split(/[?#]/)[0].replace(/\/$/,'')||'/';
   if(!packet.sitePaths.some(v=>(v.replace(/\/$/,'')||'/')===p))add('error','unknown-internal-target','Internal link target is absent from the supplied site inventory.',href,{
    observation:`Internal link "${href}" does not match any path in sitePaths (${packet.sitePaths.length} known paths).`,
    why:'Linking to an unverified or mistyped internal slug creates broken reader journeys or points to unpublished pages.',
    snippet:token.raw||`[${token.text}](${href})`,
    suggestion:`Replace "${href}" with an existing path from your inventory, or add "${p}" to sitePaths if the page is published.`,
    verifyHint:'Update the link target or sitePaths and re-run to confirm inventory turns good.'
   });
  }else if(/^(?:javascript|data):/i.test(href))add('error','unsafe-link-scheme','Unsafe link scheme.',href,{
   observation:`Link uses disallowed scheme: "${href.slice(0,60)}".`,
   why:'javascript: and data: URIs in content links are unsafe and unusable as editorial references.',
   snippet:token.raw||href,
   suggestion:'Replace the link destination with a valid https:// URL or internal /path.',
   verifyHint:'Remove the unsafe scheme and re-run to confirm link-safety turns good.'
  });
 }
 onPhase('links');
 const allText=[packet.article.title,packet.article.description,plain].join('\n');
 for(const term of packet.glossary)for(const variant of term.prohibitedVariants){
  const escaped=variant.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,'iu');
  if(re.test(allText))add('warning','glossary-variant',`Use the configured canonical form: ${term.canonical}`,variant,{
   observation:`Found prohibited terminology variant "${variant}" instead of canonical "${term.canonical}".`,
   why:'Inconsistent terminology confuses readers and splits entity naming across the site.',
   snippet:extractContextSnippet(allText,variant),
   suggestion:`Replace "${variant}" with "${term.canonical}".`,
   verifyHint:'Keep the glossary rule enabled and re-run after replacing the variant.'
  });
 }
 if(!packet.claims.length)add('warning','no-declared-claims','No factual coverage can be assessed until material claims are declared.',undefined,{
  observation:'No claims[] were supplied in the packet.',
  why:'Structural checks inspect headings and links, but cannot verify factual provenance when claims are undeclared.',
  suggestion:'Verify facts, numbers and sources manually, or switch to Evidence packet mode to declare material claims.',
  verifyHint:'Supply claims[] and sources[] in packet mode to audit source bindings.'
 });
 const unreviewed=headings.filter(h=>h[1].length===2&&!packet.reviewedSections.includes(h[2])).map(h=>h[2]);
 if(unreviewed.length)add('warning','sections-need-editorial-review','Review each section for a direct answer and supporting evidence or action.',unreviewed.join('; '),{
  observation:`${unreviewed.length} H2 section(s) are not marked as editorially reviewed.`,
  why:'Automated checks verify structure, not whether each section directly answers the reader task.',
  snippet:unreviewed.slice(0,5).map(s=>`## ${s}`).join(' · '),
  suggestion:'Check that each listed H2 section opens with a clear answer and concrete example.',
  verifyHint:'Add reviewed H2 titles to reviewedSections[] in packet mode once checked.'
 });
 const has=code=>findings.some(f=>f.code===code),strengths=[];
 if(!has('h1-count'))strengths.push({code:'heading-contract',message:'The H1 matches the selected CMS/Markdown renderer contract.'});
 if(headings.length>1&&!has('heading-level-gap'))strengths.push({code:'heading-hierarchy',message:'The parsed heading hierarchy has no skipped levels.'});
 const internalLinks=links.filter(h=>h.startsWith('/')&&!h.startsWith('//'));
 if(packet.sitePaths!==undefined&&internalLinks.length&&!has('unknown-internal-target'))strengths.push({code:'known-internal-targets',message:'All parsed internal links exist in the supplied site inventory.'});
 if(packet.glossary.length&&!has('glossary-variant'))strengths.push({code:'configured-terminology',message:'No prohibited variants from the supplied glossary were found.'});
 if(packet.claims.length&&!['unbound-fact','unknown-source','duplicate-claim-id','claim-not-in-draft','missing-calculation-evidence'].some(has))strengths.push({code:'declared-evidence-records',message:'The declared claim records have the required bindings and calculation fields; factual truth is not established.'});
 const observedH1=packet.article.h1Mode==='markdown'?h1[0]?.[2]:packet.article.renderedH1;
 const query={title:packet.article.title.trim()?countPhrase(packet.article.title,packet.primaryQuery):null,h1:observedH1?countPhrase(observedH1,packet.primaryQuery):null,body:countPhrase(visibleParts.join(' '),packet.primaryQuery)};
 onPhase('report');
 const diagnostics=articleDiagnostics(packet,{headings,links,images,query,findings,visibleText:visibleParts.join(' ')});
 const context={primaryQuery:packet.primaryQuery,h1Mode:packet.article?.h1Mode,sitePaths:packet.sitePaths??null,glossary:packet.glossary,claimIds:packet.claims?.map(c=>c.id)||[]};
 return {schemaVersion:1,context,diagnostics,structuralPass:!findings.some(f=>f.severity==='error'),strengths,findings:findings.sort((a,b)=>a.priority-b.priority),observations:{titleCharacters:[...packet.article.title].length,descriptionCharacters:[...packet.article.description].length,titleMatchesH1:observedH1?packet.article.title.trim().toLocaleLowerCase()===observedH1.trim().toLocaleLowerCase():null,queryOccurrences:{title:packet.article.title.trim()?countPhrase(packet.article.title,packet.primaryQuery):null,description:packet.article.description.trim()?countPhrase(packet.article.description,packet.primaryQuery):null,h1:observedH1?countPhrase(observedH1,packet.primaryQuery):null,body:countPhrase(visibleParts.join(' '),packet.primaryQuery),method:'Literal Unicode phrase counts in parsed text only; no stemming, raw HTML or required density.'}},coverage:{declaredClaims:packet.claims.length,sourceRecords:packet.sources.length,markdownLinks:links.length,internalLinks:internalLinks.length,internalTargetsChecked:packet.sitePaths!==undefined,h2Sections:headings.filter(h=>h[1].length===2).length},requiresEditorialReview:true,limits:['Supplied records and Marked-parsed Markdown links/headings are checked; raw HTML needs separate review.', 'No source fetching, claim truth verification, full-prose claim extraction or ranking prediction.', 'A structurally passing packet is not approval to publish.']};
}
