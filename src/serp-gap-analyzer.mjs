import {parse} from 'parse5';
import {z} from 'zod';

const pageProfileSchema=z.object({
 url:z.string().min(1).max(2048).default('https://example.com/'),
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
 if(!node)return '';
 if(node.nodeName==='#text')return node.value||'';
 if(skipTags.has(node.tagName))return '';
 return (node.childNodes||[]).map(c=>collectVisibleText(c,skipTags)).join(' ');
}

function walkNodes(node,visitor){
 visitor(node);
 for(const child of node.childNodes||[])walkNodes(child,visitor);
}

function collectJsonLdTypes(rawJson,typesSet){
 try{
  const parsed=JSON.parse(rawJson);
  const stack=Array.isArray(parsed)?[...parsed]:[parsed];
  while(stack.length>0){
   const item=stack.pop();
   if(!item||typeof item!=='object')continue;
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
   url:input.url,
   position:input.position??null,
   title:input.title||'',
   wordCount:input.wordCount??0,
   headings:input.headings||[],
   schemaTypes:input.schemaTypes||[],
   hasTable:Boolean(input.hasTable),
   hasFaq:Boolean(input.hasFaq),
   hasPricing:Boolean(input.hasPricing),
   termSet
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
  url:input.url,
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
 if(values.length===0)return 0;
 const sorted=[...values].sort((a,b)=>a-b);
 const mid=Math.floor(sorted.length/2);
 return sorted.length%2===0?Math.round((sorted[mid-1]+sorted[mid])/2):sorted[mid];
}

export function analyzeSerpGap(rawInput){
 const parsed=serpGapSchema.parse(rawInput);
 const competitors=parsed.competitors.map(extractProfile);
 const target=parsed.target?extractProfile(parsed.target):null;
 const n=competitors.length;

 const wordCounts=competitors.map(c=>c.wordCount);
 const minWords=Math.min(...wordCounts);
 const maxWords=Math.max(...wordCounts);
 const medianWords=median(wordCounts);
 const targetWords=Math.max(medianWords,Math.round(medianWords*1.1));

 const h2Counts=competitors.map(c=>c.headings.filter(h=>h.level===2).length);
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
  for(const term of comp.termSet)termCoverage.set(term,(termCoverage.get(term)||0)+1);
  for(const st of comp.schemaTypes)schemaCoverage.set(st,(schemaCoverage.get(st)||0)+1);
  for(const h of comp.headings.filter(x=>x.level===2||x.level===3)){
   const norm=h.text.toLowerCase().trim();
   headingPatternFreq.set(norm,(headingPatternFreq.get(norm)||0)+1);
  }
 }

 const minShared=n>=3?Math.max(2,Math.ceil(n*0.4)):1;
 const topSharedTerms=[...termCoverage.entries()]
  .filter(([,cnt])=>cnt>=minShared)
  .sort((a,b)=>b[1]-a[1])
  .slice(0,parsed.topTermsLimit)
  .map(([term,competitorCount])=>({term,competitorCount,coverageRatio:Number((competitorCount/n).toFixed(2))}));

 const recommendedSchemaTypes=[...schemaCoverage.entries()]
  .filter(([,cnt])=>cnt>=minShared)
  .sort((a,b)=>b[1]-a[1])
  .map(([type,competitorCount])=>({type,competitorCount}));

 const recurringHeadings=[...headingPatternFreq.entries()]
  .sort((a,b)=>b[1]-a[1])
  .slice(0,12)
  .map(([heading,competitorCount])=>({heading,competitorCount}));

 const tableRatio=Number((tableAdopt/n).toFixed(2));
 const faqRatio=Number((faqAdopt/n).toFixed(2));
 const pricingRatio=Number((pricingAdopt/n).toFixed(2));

 const findings=[];
 const missingTerms=[];
 const missingSchemaTypes=[];

 if(target){
  if(target.wordCount<Math.round(medianWords*0.75)){
   findings.push({
    code:'GAP_THIN_WORD_COUNT',
    severity:'warning',
    targetWordCount:target.wordCount,
    medianCompetitorWords:medianWords,
    recommendedWords:targetWords,
    message:`Target word count (${target.wordCount}) is significantly below Top competitor median (${medianWords}).`,
    recommendation:`Expand depth cleanly toward ${medianWords}-${targetWords} words with factual sections instead of filler.`
   });
  }
  const targetH2=target.headings.filter(h=>h.level===2).length;
  if(medianH2>=3&&targetH2<Math.max(2,Math.floor(medianH2*0.6))){
   findings.push({
    code:'GAP_HEADING_SKELETON_THIN',
    severity:'warning',
    targetH2Count:targetH2,
    medianCompetitorH2:medianH2,
    message:`Target page has ${targetH2} H2 sections while competitors average ${medianH2} H2 blocks.`,
    recommendation:'Structure content into scannable H2 sections answering core subtopics.'
   });
  }
  if(tableRatio>=0.5&&!target.hasTable){
   findings.push({
    code:'GAP_MISSING_TABLE',
    severity:'warning',
    competitorAdoption:tableRatio,
    message:`${Math.round(tableRatio*100)}% of competitors include a comparison/spec table, missing on target page.`,
    recommendation:'Add a structured HTML <table> summarizing key options, limits, or metrics.'
   });
  }
  if(faqRatio>=0.5&&!target.hasFaq){
   findings.push({
    code:'GAP_MISSING_FAQ',
    severity:'warning',
    competitorAdoption:faqRatio,
    message:`${Math.round(faqRatio*100)}% of competitors include an FAQ block, missing on target page.`,
    recommendation:'Add concise Answer-First FAQ items matching real user questions.'
   });
  }
  if(pricingRatio>=0.5&&!target.hasPricing){
   findings.push({
    code:'GAP_MISSING_PRICING',
    severity:'info',
    competitorAdoption:pricingRatio,
    message:`${Math.round(pricingRatio*100)}% of ranking pages explicitly mention pricing or plans.`,
    recommendation:'Disclose transparent pricing, free tier limits, or exact cost model if commercial.'
   });
  }
  const targetSchemaSet=new Set(target.schemaTypes);
  for(const rec of recommendedSchemaTypes){
   if(!targetSchemaSet.has(rec.type))missingSchemaTypes.push(rec.type);
  }
  if(missingSchemaTypes.length>0){
   findings.push({
    code:'GAP_MISSING_SCHEMA_TYPES',
    severity:'warning',
    missingSchemaTypes,
    message:`Missing Schema.org types common in SERP Top-10: ${missingSchemaTypes.join(', ')}.`,
    recommendation:`Evaluate adding valid JSON-LD for: ${missingSchemaTypes.join(', ')}.`
   });
  }
  for(const st of topSharedTerms){
   if(!target.termSet.has(st.term))missingTerms.push(st.term);
  }
  if(missingTerms.length>0){
   findings.push({
    code:'GAP_MISSING_TERMS',
    severity:missingTerms.length>=5?'warning':'info',
    missingTerms:missingTerms.slice(0,15),
    message:`Target is missing ${missingTerms.length} recurring SERP terms (${missingTerms.slice(0,8).join(', ')}).`,
    recommendation:'Cover missing domain concepts naturally in dedicated subheadings or examples.'
   });
  }
 }

 return {
  ok:findings.every(f=>f.severity!=='error'),
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
   url:target.url,
   wordCount:target.wordCount,
   h2Count:target.headings.filter(h=>h.level===2).length,
   hasTable:target.hasTable,
   hasFaq:target.hasFaq,
   hasPricing:target.hasPricing,
   schemaTypes:target.schemaTypes,
   missingSchemaTypes,
   missingTerms:missingTerms.slice(0,20)
  }:null,
  competitors:competitors.map(c=>({
   url:c.url,
   position:c.position,
   wordCount:c.wordCount,
   h2Count:c.headings.filter(h=>h.level===2).length,
   hasTable:c.hasTable,
   hasFaq:c.hasFaq,
   hasPricing:c.hasPricing,
   schemaTypes:c.schemaTypes
  })),
  findings
 };
}
