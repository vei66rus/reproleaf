import {z} from 'zod';
import {auditAnswerFirst} from './answer-first-audit.mjs';
import {auditRagChunks} from './rag-chunk-audit.mjs';
import {auditTerminologyConsistency} from './terminology-audit.mjs';

const serpGapCompactSchema=z.object({
 targetWordCount:z.number().int().min(100).max(50000).optional(),
 minWordCount:z.number().int().min(50).max(50000).optional(),
 medianH2Count:z.number().int().min(1).max(100).optional(),
 requiredTerms:z.array(z.string().max(120)).max(50).default([]),
 recommendedSchemaTypes:z.array(z.string().max(120)).max(20).default([]),
 needsTable:z.boolean().default(false),
 needsFaq:z.boolean().default(false),
 needsPricing:z.boolean().default(false),
 competitorHeadings:z.array(z.string().max(300)).max(30).default([])
}).strict();

const glossaryItemSchema=z.object({
 canonical:z.string().min(1).max(120),
 aliases:z.array(z.string().max(120)).max(30).default([]),
 forbidden:z.array(z.string().max(120)).max(30).default([]),
 caseSensitive:z.boolean().default(true)
}).strict();

export const contentBriefSchema=z.object({
 primaryQuery:z.string().min(2).max(300),
 targetUrl:z.string().max(2048).optional(),
 locale:z.enum(['en','ru']).default('en'),
 secondaryQueries:z.array(z.string().max(300)).max(30).default([]),
 serpGap:serpGapCompactSchema.optional(),
 glossary:z.array(glossaryItemSchema).max(100).default([]),
 cocoonLinks:z.array(z.object({
  url:z.string().max(2048),
  anchor:z.string().max(200),
  reason:z.string().max(300).optional()
 }).strict()).max(30).default([]),
 answerFirstMaxWords:z.number().int().min(20).max(120).default(55),
 ragTargetWordsPerChunk:z.number().int().min(40).max(200).default(90),
 verifiedFacts:z.array(z.string().max(500)).max(50).default([]),
 draftMarkdown:z.string().max(200000).optional()
}).strict();

function normalizeSerpGap(gap){
 if(!gap)return {minWords:600,targetWords:1200,h2Count:5,requiredTerms:[],schemaTypes:['Article'],needsTable:false,needsFaq:true,needsPricing:false,headings:[]};
 return {
  minWords:gap.minWordCount??Math.round((gap.targetWordCount??1200)*0.75),
  targetWords:gap.targetWordCount??1200,
  h2Count:gap.medianH2Count??5,
  requiredTerms:gap.requiredTerms,
  schemaTypes:gap.recommendedSchemaTypes.length?gap.recommendedSchemaTypes:['Article'],
  needsTable:gap.needsTable,
  needsFaq:gap.needsFaq,
  needsPricing:gap.needsPricing,
  headings:gap.competitorHeadings
 };
}

function buildOutline(parsed,gap){
 const isRu=parsed.locale==='ru';
 const sections=[];
 const seen=new Set();

 for(const h of gap.headings){
  const clean=h.trim();
  const norm=clean.toLowerCase();
  if(!clean||seen.has(norm))continue;
  seen.add(norm);
  sections.push({
   heading:clean,
   answerFirstRule:isRu
    ?`Первый абзац <= ${parsed.answerFirstMaxWords} слов: прямой ответ сразу без вводной воды и без зависимых местоимений («Это», «Он»).`
    :`First paragraph <= ${parsed.answerFirstMaxWords} words: direct answer immediately, zero filler preamble and zero pronoun-dependent openings ("It", "This").`,
   targetChunkWords:parsed.ragTargetWordsPerChunk,
   requiredFactSlot:`[FACT_GAP: Verify concrete proof, metric or step for "${clean}"]`
  });
  if(sections.length>=Math.max(4,gap.h2Count))break;
 }

 const fallbackTopics=isRu
  ?[
   `Что такое ${parsed.primaryQuery} и какую задачу решает`,
   `Пошаговая методика и критерии проверки ${parsed.primaryQuery}`,
   `Сравнение подходов и ограничения`,
   `Частые ошибки и как их диагностировать`
  ]
  :[
   `What ${parsed.primaryQuery} is and how it works`,
   `Step-by-step workflow and diagnostic criteria`,
   `Approach comparison and technical limits`,
   `Common mistakes and verification checklist`
  ];

 for(const fb of fallbackTopics){
  if(sections.length>=Math.max(4,gap.h2Count))break;
  if(!seen.has(fb.toLowerCase())){
   seen.add(fb.toLowerCase());
   sections.push({
    heading:fb,
    answerFirstRule:isRu
     ?`Первый абзац <= ${parsed.answerFirstMaxWords} слов с прямым ответом.`
     :`First paragraph <= ${parsed.answerFirstMaxWords} words with direct answer first.`,
    targetChunkWords:parsed.ragTargetWordsPerChunk,
    requiredFactSlot:`[FACT_GAP: Supply verified data or observation for "${fb}"]`
   });
  }
 }

 return sections;
}

export function generateContentBrief(rawInput){
 const parsed=contentBriefSchema.parse(rawInput);
 const gap=normalizeSerpGap(parsed.serpGap);
 const isRu=parsed.locale==='ru';

 const factGaps=[];
 if(parsed.verifiedFacts.length===0){
  factGaps.push(`[FACT_GAP: Provide verified primary observation, date, or reproducible command output for "${parsed.primaryQuery}" — never invent statistics.]`);
 }
 if(gap.needsPricing&&!parsed.verifiedFacts.some(f=>/price|cost|\$|€|₽|тариф|цена/i.test(f))){
  factGaps.push('[FACT_GAP: Provide confirmed current pricing tiers or explicitly state free/open-source limits.]');
 }
 if(gap.needsTable){
  factGaps.push('[FACT_GAP: Supply verified column values for the comparison <table> before publishing.]');
 }

 const outline=buildOutline(parsed,gap);
 const requiredBlocks=[];
 if(gap.needsTable)requiredBlocks.push(isRu?'Структурированная таблица сравнения параметров':'Structured comparison <table>');
 if(gap.needsFaq)requiredBlocks.push(isRu?'Блок FAQ с прямыми ответами (3-5 вопросов)':'Answer-First FAQ block (3-5 concise questions)');

 const titleGuidance={
  primaryQuery:parsed.primaryQuery,
  maxPixels:580,
  maxCharsRecommended:60,
  rule:isRu
   ?`Включить «${parsed.primaryQuery}» ближе к началу Title и H1 без переспама.`
   :`Place "${parsed.primaryQuery}" near the start of <title> and <h1> without keyword stuffing.`
 };

 const draftDiagnostics=parsed.draftMarkdown
  ?{
   answerFirst:auditAnswerFirst({markdown:parsed.draftMarkdown,maxFirstParagraphWords:parsed.answerFirstMaxWords}),
   ragChunks:auditRagChunks({text:parsed.draftMarkdown,locale:parsed.locale,targetWordsPerChunk:parsed.ragTargetWordsPerChunk}),
   ...(parsed.glossary.length>0?{terminology:auditTerminologyConsistency({text:parsed.draftMarkdown,glossary:parsed.glossary})}:{})
  }
  :null;

 const mdLines=[
  `# ${isRu?'SEO & GEO ТЗ':'SEO & GEO Content Brief'}: ${parsed.primaryQuery}`,
  '',
  `- **${isRu?'Целевой URL':'Target URL'}:** ${parsed.targetUrl||'[NEW_URL_TBD]'}`,
  `- **${isRu?'Язык':'Locale'}:** ${parsed.locale}`,
  `- **${isRu?'Основной запрос':'Primary Query'}:** ${parsed.primaryQuery}`,
  `- **${isRu?'Доп. запросы':'Secondary Queries'}:** ${parsed.secondaryQueries.length?parsed.secondaryQueries.join(', '):'-'}`,
  `- **${isRu?'Объём слов':'Word Count Target'}:** ${gap.minWords}-${gap.targetWords}`,
  `- **Schema.org:** ${gap.schemaTypes.join(', ')}`,
  `- **Answer-First / RAG:** ${isRu?`1-й абзац секции <= ${parsed.answerFirstMaxWords} слов; чанк ~${parsed.ragTargetWordsPerChunk} слов без местоименного старта`:`Lead paragraph <= ${parsed.answerFirstMaxWords} words; chunk ~${parsed.ragTargetWordsPerChunk} words with autonomous openings`}`,
  '',
  `## ${isRu?'Каркас H2':'Recommended H2 Outline'}`,
  ...outline.map((s,i)=>`${i+1}. **H2: ${s.heading}**\n   - ${s.answerFirstRule}\n   - ${s.requiredFactSlot}`),
  ''
 ];

 if(gap.requiredTerms.length>0){
  mdLines.push(`## ${isRu?'Обязательные термины из SERP':'Required SERP Terms'}`,gap.requiredTerms.join(', '),'');
 }
 if(parsed.glossary.length>0){
  mdLines.push(`## ${isRu?'Канонический глоссарий':'Canonical Terminology'}`);
  for(const g of parsed.glossary){
   const bad=[...g.aliases,...g.forbidden].filter(Boolean);
   mdLines.push(`- **${g.canonical}**${bad.length?` (${isRu?'избегать':'avoid'}: ${bad.join(', ')})`:''}`);
  }
  mdLines.push('');
 }
 if(requiredBlocks.length>0){
  mdLines.push(`## ${isRu?'Обязательные блоки':'Required Page Elements'}`,...requiredBlocks.map(b=>`- ${b}`),'');
 }
 if(parsed.cocoonLinks.length>0){
  mdLines.push(`## ${isRu?'План перелинковки':'Internal Link Plan'}`);
  for(const l of parsed.cocoonLinks){
   mdLines.push(`- [${l.anchor}](${l.url})${l.reason?` — ${l.reason}`:''}`);
  }
  mdLines.push('');
 }
 mdLines.push(`## ${isRu?'Подтверждённые факты и пробелы (не выдумывать)':'Verified Facts & Explicit Fact Gaps (Do Not Fabricate)'}`);
 for(const vf of parsed.verifiedFacts)mdLines.push(`- Verified: ${vf}`);
 for(const fg of factGaps)mdLines.push(`- ${fg}`);

 return {
  ok:draftDiagnostics
   ?(draftDiagnostics.answerFirst.ok&&draftDiagnostics.ragChunks.ok&&(!draftDiagnostics.terminology||draftDiagnostics.terminology.ok))
   :true,
  brief:{
   primaryQuery:parsed.primaryQuery,
   targetUrl:parsed.targetUrl||null,
   locale:parsed.locale,
   secondaryQueries:parsed.secondaryQueries,
   titleGuidance,
   wordCount:{min:gap.minWords,target:gap.targetWords},
   recommendedSchemaTypes:gap.schemaTypes,
   requiredBlocks,
   requiredTerms:gap.requiredTerms,
   glossary:parsed.glossary,
   cocoonLinks:parsed.cocoonLinks,
   outline,
   geoConstraints:{
    answerFirstMaxWords:parsed.answerFirstMaxWords,
    ragTargetWordsPerChunk:parsed.ragTargetWordsPerChunk,
    requireAutonomousOpenings:true,
    forbidFabricatedStats:true
   },
   verifiedFacts:parsed.verifiedFacts,
   factGaps
  },
  markdown:mdLines.join('\n'),
  draftDiagnostics
 };
}
