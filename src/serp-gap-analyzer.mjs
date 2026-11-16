import {parse} from 'parse5';
import {z} from 'zod';

const pageProfileSchema=z.object({
 url:z.string().url().max(2048).refine(value=>{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;},'Use a public HTTP(S) page label without credentials').optional(),
 position:z.number().int().min(1).max(100).optional(),
 html:z.string().min(1).max(1048576).optional(),
 title:z.string().max(400).optional(),
 wordCount:z.number().int().min(0).max(500000).optional(),
 headings:z.array(z.object({level:z.number().int().min(1).max(6),text:z.string().max(400)}).strict()).max(200).optional(),
 schemaTypes:z.array(z.string().max(120)).max(50).optional(),
 hasTable:z.boolean().optional(),
 hasFaq:z.boolean().optional(),
 hasPricing:z.boolean().optional(),
 terms:z.array(z.string().max(120)).max(200).optional()
}).strict();

export const serpGapSchema=z.object({
 target:pageProfileSchema.optional(),
 competitors:z.array(pageProfileSchema).min(1).max(20),
 locale:z.enum(['en','ru']).default('en'),
 topTermsLimit:z.number().int().min(5).max(50).default(20)
}).strict();

const stopWords=new Set([
 'the','and','for','with','how','to','of','in','on','a','an','is','are','by','from','or','vs','this','that','your','you','can','will','have','has','not','more','about','into','what','when','which','best','top','free','use','using',
 'и','в','во','на','по','для','как','что','из','от','до','при','без','под','над','или','а','но','не','то','это','все','вы','мы','они','как','так','уже','еще','его','ее','их','при','про','через','если','либо','чем','где'
]);

const pricingPattern=/(?:[$€£₽]\s?\d|\d+\s?(?:usd|eur|rub|руб|₽|\$)|\/mo\b|\/month\b|pricing|plans?|tariff|тариф|стоимость|цена)/iu;

function getAttr(node,name){
 const attr=(node.attrs||[]).find(a=>a.name.toLowerCase()===name.toLowerCase());
 return attr?attr.value:'';
}

function collectVisibleText(node,skipTags=new Set(['script','style','noscript','template','svg'])){
 const parts=[],stack=node?[node]:[];let visited=0;
 while(stack.length){
  const current=stack.pop();if(++visited>100000)throw Error('HTML exceeds the 100000-node analysis limit');
  if(skipTags.has(current.tagName)||isExplicitlyHidden(current))continue;
  if(current.nodeName==='#text')parts.push(current.value||'');
  else stack.push(...(current.childNodes||[]).slice().reverse());
 }
 return parts.join(' ');
}

function walkNodes(node,visitor){
 const stack=[node];let visited=0;
 while(stack.length){const current=stack.pop();if(++visited>100000)throw Error('HTML exceeds the 100000-node analysis limit');if(isExplicitlyHidden(current))continue;visitor(current);stack.push(...(current.childNodes||[]).slice().reverse());}
}

function isExplicitlyHidden(node){return (node.attrs||[]).some(a=>a.name==='hidden'||(a.name==='aria-hidden'&&a.value.trim().toLowerCase()==='true'))||/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(getAttr(node,'style'));}
function exportUrl(value){if(!value)return null;const url=new URL(value);url.search='';url.hash='';return url.href;}

function collectJsonLdTypes(rawJson,typesSet){
 try{
  const parsed=JSON.parse(rawJson);
  const stack=Array.isArray(parsed)?[...parsed]:[parsed];
  const seen=new Set();
  while(stack.length>0){
   const item=stack.pop();
   if(!item||typeof item!=='object')continue;
   if(seen.has(item))continue;seen.add(item);if(seen.size>100000)throw Error('JSON-LD exceeds analysis limits');
   if(Array.isArray(item['@graph']))stack.push(...item['@graph']);
   const t=item['@type'];
   if(typeof t==='string'&&t.trim())typesSet.add(t.trim());
   else if(Array.isArray(t))for(const x of t)if(typeof x==='string'&&x.trim())typesSet.add(x.trim());
   for(const val of Object.values(item)){
    if(val&&typeof val==='object')stack.push(val);
   }
  }
 }catch{}
}

function tokenizeTerms(text){
 const tokens=(text||'').toLowerCase().match(/[\p{L}\p{N}-]{3,}/gu)||[];
 const freq=new Map();
 for(const tok of tokens){
  if(/^\d+$/.test(tok)||stopWords.has(tok))continue;
  freq.set(tok,(freq.get(tok)||0)+1);
 }
 return freq;
}

function extractProfile(input){
 if(!input.html){
  const termSet=new Set((input.terms||[]).map(t=>t.toLowerCase().trim()).filter(Boolean));
  return {
   url:exportUrl(input.url),
   position:input.position??null,
   title:input.title||'',
   wordCount:input.wordCount??null,
   headings:input.headings??null,
   schemaTypes:input.schemaTypes??null,
   hasTable:input.hasTable??null,
   hasFaq:input.hasFaq??null,
   hasPricing:input.hasPricing??null,
   termSet:input.terms?termSet:null
  };
 }

 const doc=parse(input.html);
 let title=input.title||'';
 const headings=[];
 const schemaSet=new Set(input.schemaTypes||[]);
 let tableCount=0;
 let hasDetails=false;
 let mainNode=null;

 walkNodes(doc,node=>{
  const tag=node.tagName;
  if(!tag)return;
  if(tag==='title'&&!title)title=collectVisibleText(node).replace(/\s+/g,' ').trim();
  if(tag==='main'&&!mainNode)mainNode=node;
  if(/^h[1-6]$/.test(tag)){
   const txt=collectVisibleText(node).replace(/\s+/g,' ').trim();
   if(txt)headings.push({level:Number(tag[1]),text:txt});
  }
  if(tag==='table')tableCount+=1;
  if(tag==='details')hasDetails=true;
  if(tag==='script'){
   const tp=(getAttr(node,'type')||'').split(';')[0].trim().toLowerCase();
   if(tp==='application/ld+json'){
    collectJsonLdTypes(collectVisibleText(node,new Set()),schemaSet);
   }
  }
 });

 const bodyText=collectVisibleText(mainNode||doc).replace(/\s+/g,' ').trim();
 const words=bodyText?bodyText.split(/\s+/).filter(Boolean):[];
 const termFreq=tokenizeTerms(bodyText);
 const sortedTerms=[...termFreq.entries()].sort((a,b)=>b[1]-a[1]).slice(0,80).map(([t])=>t);
 const headingText=headings.map(h=>h.text).join(' ');
 const hasFaq=input.hasFaq??(schemaSet.has('FAQPage')||hasDetails||/\b(?:faq|questions?|ответы|вопросы)\b/i.test(headingText));
 const hasPricing=input.hasPricing??(schemaSet.has('Offer')||schemaSet.has('Product')||pricingPattern.test(bodyText));

 return {
  url:exportUrl(input.url),
  position:input.position??null,
  title,
  wordCount:input.wordCount??words.length,
  headings:input.headings??headings,
  schemaTypes:[...schemaSet],
  hasTable:input.hasTable??(tableCount>0),
  hasFaq,
  hasPricing,
  termSet:new Set([...sortedTerms,...(input.terms||[]).map(t=>t.toLowerCase())])
 };
}

function median(values){
 if(values.length===0)return null;
 const sorted=[...values].sort((a,b)=>a-b);
 const mid=Math.floor(sorted.length/2);
 return sorted.length%2===0?Math.round((sorted[mid-1]+sorted[mid])/2):sorted[mid];
}

export function analyzeSerpGap(rawInput){
 const parsed=serpGapSchema.parse(rawInput);
 const competitors=parsed.competitors.map(extractProfile);
 const target=parsed.target?extractProfile(parsed.target):null;
 const n=competitors.length;

 const seenUrls=new Set();
 for(const input of parsed.competitors){if(!input.url)continue;const identity=new URL(input.url);identity.hash='';if(seenUrls.has(identity.href))throw Error('Duplicate competitor page URL');seenUrls.add(identity.href);}
 const wordCounts=competitors.map(c=>c.wordCount).filter(value=>value!==null);
 const minWords=wordCounts.length?Math.min(...wordCounts):null;
 const maxWords=wordCounts.length?Math.max(...wordCounts):null;
 const medianWords=median(wordCounts);
 const targetWords=null;

 const h2Counts=competitors.filter(c=>c.headings!==null).map(c=>c.headings.filter(h=>h.level===2).length);
 const medianH2=median(h2Counts);

 const termCoverage=new Map();
 const schemaCoverage=new Map();
 const headingPatternFreq=new Map();
 let tableAdopt=0;
 let faqAdopt=0;
 let pricingAdopt=0;

 for(const comp of competitors){
  if(comp.hasTable)tableAdopt+=1;
  if(comp.hasFaq)faqAdopt+=1;
  if(comp.hasPricing)pricingAdopt+=1;
  for(const term of comp.termSet||[])termCoverage.set(term,(termCoverage.get(term)||0)+1);
  for(const st of new Set(comp.schemaTypes||[]))schemaCoverage.set(st,(schemaCoverage.get(st)||0)+1);
  for(const norm of new Set((comp.headings||[]).filter(x=>x.level===2||x.level===3).map(h=>h.text.toLowerCase().trim()).filter(Boolean)))headingPatternFreq.set(norm,(headingPatternFreq.get(norm)||0)+1);
 }

 const observed={wordCount:wordCounts.length,headings:h2Counts.length,schemaTypes:competitors.filter(c=>c.schemaTypes!==null).length,terms:competitors.filter(c=>c.termSet!==null).length,table:competitors.filter(c=>c.hasTable!==null).length,faq:competitors.filter(c=>c.hasFaq!==null).length,pricing:competitors.filter(c=>c.hasPricing!==null).length};
 const sharedThreshold=total=>total>=3?Math.max(2,Math.ceil(total*0.4)):1;
 const topSharedTerms=[...termCoverage.entries()]
  .filter(([,cnt])=>cnt>=sharedThreshold(observed.terms))
  .sort((a,b)=>b[1]-a[1])
  .slice(0,parsed.topTermsLimit)
  .map(([term,competitorCount])=>({term,competitorCount,observedCompetitorCount:observed.terms,coverageRatio:Number((competitorCount/observed.terms).toFixed(4))}));

 const recommendedSchemaTypes=[...schemaCoverage.entries()]
  .filter(([,cnt])=>cnt>=sharedThreshold(observed.schemaTypes))
  .sort((a,b)=>b[1]-a[1])
  .map(([type,competitorCount])=>({type,competitorCount}));

 const recurringHeadings=[...headingPatternFreq.entries()]
  .sort((a,b)=>b[1]-a[1])
  .slice(0,12)
  .map(([heading,competitorCount])=>({heading,competitorCount}));

 const ratio=(count,total)=>total?Number((count/total).toFixed(4)):null;
 const tableRatio=ratio(tableAdopt,observed.table);
 const faqRatio=ratio(faqAdopt,observed.faq);
 const pricingRatio=ratio(pricingAdopt,observed.pricing);

 const findings=[];
 const missingTerms=[];
 const missingSchemaTypes=[];

 if(target){
  if(target.wordCount!==null&&medianWords!==null&&target.wordCount<Math.round(medianWords*0.75)){
   findings.push({
    code:'GAP_THIN_WORD_COUNT',
    severity:'warning',
    targetWordCount:target.wordCount,
    medianCompetitorWords:medianWords,
    comparisonOnly:true,
    message:`Supplied target word count (${target.wordCount}) is below the supplied-page median (${medianWords}).`,
    recommendation:'Review whether the reader task is answered. Length alone is not an error or a requirement to add words.'
   });
  }
  const targetH2=target.headings===null?null:target.headings.filter(h=>h.level===2).length;
  if(targetH2!==null&&medianH2!==null&&medianH2>=3&&targetH2<Math.max(2,Math.floor(medianH2*0.6))){
   findings.push({
    code:'GAP_HEADING_SKELETON_THIN',
    severity:'warning',
    targetH2Count:targetH2,
    medianCompetitorH2:medianH2,
    comparisonOnly:true,
    message:`Supplied target has ${targetH2} H2 sections; the supplied-page median is ${medianH2}.`,
    recommendation:'Review task coverage and reading order; do not copy the number of headings as a quota.'
   });
  }
  if(tableRatio!==null&&tableRatio>=0.5&&target.hasTable===false){
   findings.push({
    code:'GAP_MISSING_TABLE',
    severity:'warning',
    competitorAdoption:tableRatio,
    comparisonOnly:true,
    message:`${tableAdopt}/${observed.table} supplied pages with known table observations contain a table; the target does not.`,
    recommendation:'Consider a table only when it makes the actual comparison easier to use.'
   });
  }
  if(faqRatio!==null&&faqRatio>=0.5&&target.hasFaq===false){
   findings.push({
    code:'GAP_MISSING_FAQ',
    severity:'warning',
    competitorAdoption:faqRatio,
    comparisonOnly:true,
    message:`${faqAdopt}/${observed.faq} supplied pages with known observations have FAQ-like markup; the target does not.`,
    recommendation:'Check whether real remaining questions need answers; an FAQ block is not required.'
   });
  }
  if(pricingRatio!==null&&pricingRatio>=0.5&&target.hasPricing===false){
   findings.push({
    code:'GAP_MISSING_PRICING',
    severity:'info',
    competitorAdoption:pricingRatio,
    comparisonOnly:true,
    message:`${pricingAdopt}/${observed.pricing} supplied pages with known observations have price-like text or markup.`,
    recommendation:'Disclose transparent pricing, free tier limits, or exact cost model if commercial.'
   });
  }
  const targetSchemaSet=target.schemaTypes===null?null:new Set(target.schemaTypes);
  for(const rec of recommendedSchemaTypes){
   if(targetSchemaSet&&!targetSchemaSet.has(rec.type))missingSchemaTypes.push(rec.type);
  }
  if(missingSchemaTypes.length>0){
   findings.push({
    code:'GAP_MISSING_SCHEMA_TYPES',
    severity:'warning',
    missingSchemaTypes,
    comparisonOnly:true,
    message:`Schema.org types observed on supplied pages but not in target markup: ${missingSchemaTypes.join(', ')}.`,
    recommendation:'Use a type only if it describes the actual visible content. Other pages using it does not establish eligibility.'
   });
  }
  for(const st of topSharedTerms){
   if(target.termSet&&!target.termSet.has(st.term))missingTerms.push(st.term);
  }
  if(missingTerms.length>0){
   findings.push({
    code:'GAP_MISSING_TERMS',
    severity:missingTerms.length>=5?'warning':'info',
    missingTerms:missingTerms.slice(0,15),
    comparisonOnly:true,
    message:`${missingTerms.length} observed terms are absent from the supplied target (${missingTerms.slice(0,8).join(', ')}).`,
    recommendation:'Review meaning and task relevance before adding anything; lexical absence does not prove a content gap.'
   });
  }
 }

 return {
  ok:findings.every(f=>f.severity!=='error'),
  kind:'supplied-page-comparison',
  coverage:{suppliedCompetitors:n,observed,searchResultsFetched:false,rankingVerified:false,renderedVisibilityVerified:false,urlsInReport:'query-and-fragment-removed'},
  limits:['Compares supplied profiles or static HTML only; no URLs are fetched.','Unknown observations remain null and are excluded from metric denominators.','No ranking, word-count quota, fact verification or mandatory FAQ/schema recommendation.','HTML hidden attributes and inline hiding are excluded; external CSS and JavaScript visibility are not executed.'],
  benchmarks:{
   competitorCount:n,
   words:{min:minWords,median:medianWords,max:maxWords,target:targetWords},
   medianH2Count:medianH2,
   adoption:{tableRatio,faqRatio,pricingRatio},
   recommendedSchemaTypes,
   recurringHeadings,
   topSharedTerms
  },
  targetComparison:target?{
   sourceIndex:0,
   url:target.url,
   wordCount:target.wordCount,
   h2Count:target.headings===null?null:target.headings.filter(h=>h.level===2).length,
   hasTable:target.hasTable,
   hasFaq:target.hasFaq,
   hasPricing:target.hasPricing,
   schemaTypes:target.schemaTypes,
   missingSchemaTypes,
   missingTerms:missingTerms.slice(0,20)
  }:null,
  competitors:competitors.map((c,index)=>({
   sourceIndex:index+1,
   url:c.url,
   position:c.position,
   wordCount:c.wordCount,
   h2Count:c.headings===null?null:c.headings.filter(h=>h.level===2).length,
   hasTable:c.hasTable,
   hasFaq:c.hasFaq,
   hasPricing:c.hasPricing,
   schemaTypes:c.schemaTypes
  })),
  findings
 };
}
