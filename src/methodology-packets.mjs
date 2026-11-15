import {createHash} from 'node:crypto';
import {z} from 'zod';

const methodologies=[
 {
  id:'mc',
  name:'Micro-Contexts',
  category:'semantic',
  version:'1.0.0',
  sourceVersion:'0.5.1',
  requiresQueries:false,
  sections:['definition','constraints','mechanism','examples','boundaries'],
  instructions:'Audit atomic self-contained paragraphs and micro-contexts. Verify each core claim has an explicit definition, boundary, or mechanism without relying on vague pronoun references.',
  limits:['Does not fetch external pages or verify factual truth outside the supplied text.','Does not predict search engine rankings.']
 },
 {
  id:'gist',
  name:'GIST',
  category:'semantic',
  version:'1.0.0',
  sourceVersion:'0.5.1',
  requiresQueries:false,
  sections:['goal','intent','structure','takeaway'],
  instructions:'Evaluate Goal, Intent, Structure, and Takeaway alignment. Identify sections where page structure drifts from user intent or buries the primary takeaway.',
  limits:['Evaluates supplied text structure only; does not inspect live SERP competitors.']
 },
 {
  id:'spam',
  name:'Anti-Spam',
  category:'quality',
  version:'1.0.0',
  sourceVersion:'0.5.1',
  requiresQueries:false,
  sections:['keyword-stuffing','boilerplate','doorway-signals','synthetic-padding'],
  instructions:'Detect unnatural keyword repetition, templated boilerplate, doorway-style city/modifier swaps, and synthetic filler paragraphs that add zero operational detail.',
  limits:['Flags textual patterns only; does not compute domain-level spam or backlink scores.']
 },
 {
  id:'tga',
  name:'Topical Graph Analysis',
  category:'semantic',
  version:'1.0.0',
  sourceVersion:'0.5.1',
  requiresQueries:false,
  sections:['core-entities','missing-edges','orphan-subtopics','hub-links'],
  instructions:'Map core entities and subtopic relationships in the supplied text. Highlight missing conceptual bridges and orphan subtopics that lack supporting context.',
  limits:['Scoped to entities present in the supplied document; does not crawl the full site graph.']
 },
 {
  id:'lia',
  name:'Lexical Intent Alignment',
  category:'semantic',
  version:'1.0.0',
  sourceVersion:'0.5.1',
  requiresQueries:true,
  sections:['query-coverage','intent-mismatch','terminology-gaps','anchor-clarity'],
  instructions:'Compare supplied target queries against the document vocabulary and section headings. Identify uncovered query intents and ambiguous terminology.',
  limits:['Requires explicit target queries; does not pull live search volume or autocomplete data.']
 },
 {
  id:'rga',
  name:'Retrieval Gap Analysis',
  category:'geo',
  version:'1.0.0',
  sourceVersion:'0.5.1',
  requiresQueries:false,
  sections:['extractable-answers','chunk-independence','citation-hooks','ambiguity'],
  instructions:'Assess how cleanly retrieval-augmented systems can chunk and quote passages from the text. Flag context-dependent openings, ungrounded assertions, and buried answers.',
  limits:['Evaluates passage extractability only; does not simulate proprietary LLM retrieval indices.']
 },
 {
  id:'eeat',
  name:'E-E-A-T Evidence',
  category:'trust',
  version:'1.0.0',
  sourceVersion:'0.5.1',
  requiresQueries:false,
  sections:['first-hand-experience','methodology-disclosure','source-attribution','author-accountability'],
  instructions:'Check for concrete first-hand evidence, reproducible steps, primary source citations, dates, and clear accountability signals within the supplied text.',
  limits:['Audits textual evidence only; does not verify author identity or external domain authority.']
 },
 {
  id:'editorial',
  name:'Editorial Review',
  category:'editorial',
  version:'1.0.0',
  sourceVersion:'0.5.1',
  requiresQueries:false,
  sections:['clarity','claim-support','redundancy','terminology-consistency'],
  instructions:'Perform a strict editorial pass for clarity, unsupported claims, redundant phrasing, and inconsistent terminology across sections.',
  limits:['Advisory editorial review only; never alters protected numbers, URLs, formulas, or code.']
 },
 {
  id:'geo-structure',
  name:'GEO Structure',
  category:'geo',
  version:'1.0.0',
  sourceVersion:'0.5.1',
  requiresQueries:false,
  sections:['direct-answers','structured-tables','entity-disambiguation','faq-readiness'],
  instructions:'Audit structural readiness for generative answer engines: direct lead definitions, scannable lists/tables, explicit entity names, and query-aligned headings.',
  limits:['Structural audit only; does not guarantee inclusion in any generative search engine.']
 }
];

const methodMap=new Map(methodologies.map(item=>[item.id,item]));
const methodIds=methodologies.map(item=>item.id);

function sha256Hex(value){
 return createHash('sha256').update(String(value),'utf8').digest('hex');
}

export const buildMethodologyPacketSchema=z.object({
 methodId:z.enum(methodIds),
 url:z.string().url().max(2048).optional(),
 locale:z.enum(['ru','en']).default('en'),
 text:z.string().min(1).max(200000),
 queries:z.array(z.string().min(1).max(300)).max(50).optional()
}).strict();

export const validateMethodologyResultSchema=z.object({
 packet:z.object({
  packetId:z.string().regex(/^[a-f0-9]{64}$/),
  methodId:z.enum(methodIds),
  methodVersion:z.string().min(1),
  sourceHash:z.string().regex(/^[a-f0-9]{64}$/),
  sections:z.array(z.string().min(1)).min(1)
 }),
 text:z.string().min(1).max(200000),
 result:z.object({
  packetId:z.string().min(1),
  methodId:z.string().min(1),
  methodVersion:z.string().min(1),
  sourceHash:z.string().min(1),
  summary:z.string().min(1).max(4000),
  findings:z.array(z.object({
   section:z.string().min(1),
   severity:z.enum(['high','medium','low']),
   quote:z.string().min(1).max(2000),
   offset:z.number().int().nonnegative().optional(),
   diagnosis:z.string().min(1).max(2000),
   recommendation:z.string().min(1).max(2000)
  }))
 })
}).strict();

export function listMethodologies(){
 return {
  ok:true,
  count:methodologies.length,
  methodologies:methodologies.map(item=>({
   id:item.id,
   name:item.name,
   category:item.category,
   version:item.version,
   sourceVersion:item.sourceVersion,
   requiresQueries:item.requiresQueries,
   sections:item.sections,
   limits:item.limits
  }))
 };
}

export function buildMethodologyPacket(rawInput){
 const parsed=buildMethodologyPacketSchema.parse(rawInput);
 const method=methodMap.get(parsed.methodId);
 if(method.requiresQueries&&(!parsed.queries||parsed.queries.length===0)){
  throw Error(`Method "${method.id}" requires a non-empty queries array.`);
 }
 const sourceHash=sha256Hex(parsed.text);
 const queries=parsed.queries||[];
 const packetId=sha256Hex(JSON.stringify({
  methodId:method.id,
  methodVersion:method.version,
  sourceHash,
  url:parsed.url||null,
  locale:parsed.locale,
  queries
 }));
 const estimatedTokens=Math.ceil(parsed.text.length/4);
 const outputContract={
  type:'object',
  required:['packetId','methodId','methodVersion','sourceHash','summary','findings'],
  properties:{
   packetId:{const:packetId},
   methodId:{const:method.id},
   methodVersion:{const:method.version},
   sourceHash:{const:sourceHash},
   summary:{type:'string'},
   findings:{
    type:'array',
    items:{
     required:['section','severity','quote','diagnosis','recommendation'],
     allowedSections:method.sections,
     severities:['high','medium','low']
    }
   }
  }
 };
 const promptLines=[
  `Methodology: ${method.name} (${method.id} v${method.version})`,
  `Locale: ${parsed.locale}`,
  `Packet ID: ${packetId}`,
  `Source Hash: ${sourceHash}`,
  parsed.url?`URL: ${parsed.url}`:null,
  queries.length?`Target Queries:\n${queries.map(q=>`- ${q}`).join('\n')}`:null,
  `Allowed Sections: ${method.sections.join(', ')}`,
  `Instructions: ${method.instructions}`,
  'Every finding MUST include an exact verbatim quote from the source text and use only the allowed sections.',
  'Return strict JSON matching the outputContract with exact packetId, methodId, methodVersion, and sourceHash.',
  `Source Text:\n${parsed.text}`
 ].filter(Boolean);
 return {
  ok:true,
  packetId,
  methodId:method.id,
  methodName:method.name,
  methodVersion:method.version,
  sourceVersion:method.sourceVersion,
  category:method.category,
  locale:parsed.locale,
  url:parsed.url||null,
  queries,
  sourceHash,
  estimatedTokens,
  sections:method.sections,
  limits:method.limits,
  outputContract,
  prompt:promptLines.join('\n\n')
 };
}

export function validateMethodologyResult(rawInput){
 const parsed=validateMethodologyResultSchema.parse(rawInput);
 const {packet,text,result}=parsed;
 const actualSourceHash=sha256Hex(text);
 const errors=[];
 if(actualSourceHash!==packet.sourceHash){
  errors.push({code:'SOURCE_HASH_MISMATCH_TEXT',message:'Supplied text SHA-256 does not match packet.sourceHash.'});
 }
 if(result.packetId!==packet.packetId){
  errors.push({code:'PACKET_ID_MISMATCH',message:'result.packetId does not match packet.packetId.'});
 }
 if(result.methodId!==packet.methodId){
  errors.push({code:'METHOD_ID_MISMATCH',message:'result.methodId does not match packet.methodId.'});
 }
 if(result.methodVersion!==packet.methodVersion){
  errors.push({code:'METHOD_VERSION_MISMATCH',message:'result.methodVersion does not match packet.methodVersion.'});
 }
 if(result.sourceHash!==packet.sourceHash){
  errors.push({code:'SOURCE_HASH_MISMATCH_RESULT',message:'result.sourceHash does not match packet.sourceHash.'});
 }
 const allowedSections=new Set(packet.sections);
 let verifiedQuotesCount=0;
 for(const [index,finding] of result.findings.entries()){
  if(!allowedSections.has(finding.section)){
   errors.push({code:'INVALID_SECTION',findingIndex:index,message:`Section "${finding.section}" is not allowed for method "${packet.methodId}".`});
  }
  const quoteMatches=typeof finding.offset==='number'
   ?text.slice(finding.offset,finding.offset+finding.quote.length)===finding.quote
   :text.includes(finding.quote);
  if(!quoteMatches){
   errors.push({code:'UNVERIFIED_QUOTE',findingIndex:index,message:`Finding ${index} quote was not found verbatim in source text.`});
  }
  else{
   verifiedQuotesCount+=1;
  }
 }
 return {
  ok:errors.length===0,
  packetId:packet.packetId,
  methodId:packet.methodId,
  methodVersion:packet.methodVersion,
  sourceHash:actualSourceHash,
  findingsCount:result.findings.length,
  verifiedQuotesCount,
  errors
 };
}
