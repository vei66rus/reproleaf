import {z} from 'zod';
import {auditAiCrawlerAccess} from './ai-crawler-audit.mjs';
import {auditLlmsTxt} from './llms-txt.mjs';
import {auditJsonLd} from './schema-audit.mjs';
import {auditAnswerFirst} from './answer-first-audit.mjs';
import {auditRagChunks} from './rag-chunk-audit.mjs';
import {auditPromptInjectionAndHiddenText} from './prompt-injection-audit.mjs';

const httpUrlSchema=z.string().url().max(2048).refine(u=>{
 const protocol=new URL(u).protocol;
 return protocol==='http:'||protocol==='https:';
},{message:'URL must use http or https'});

export const geoReadinessSchema=z.object({
 url:httpUrlSchema.optional(),
 html:z.string().min(1).max(1000000).optional(),
 markdown:z.string().min(1).max(200000).optional(),
 robotsTxt:z.string().max(524288).optional(),
 llmsTxt:z.string().min(1).max(524288).optional(),
 locale:z.enum(['ru','en']).default('en')
}).strict().superRefine((val,ctx)=>{
 if(!val.html&&!val.markdown&&!val.robotsTxt&&!val.llmsTxt){
  ctx.addIssue({code:z.ZodIssueCode.custom,message:'Provide at least one of html, markdown, robotsTxt, or llmsTxt'});
 }
});

function classifyFindings(findings,okFlag){
 if(okFlag===false||findings.some(f=>f.severity==='error'||f.severity==='critical'))return 'fail';
 if(findings.some(f=>f.severity==='warn'||f.severity==='warning'))return 'warn';
 return 'pass';
}

export function auditGeoReadiness(rawInput){
 const input=geoReadinessSchema.parse(rawInput);
 const signals={};
 const findings=[];

 function recordSignal(key,report){
  const list=Array.isArray(report.findings)?report.findings:[];
  const status=classifyFindings(list,report.ok);
  signals[key]={
   status,
   findingCount:list.length
  };
  for(const f of list){
   findings.push({...f,pillar:key});
  }
 }

 if(input.robotsTxt!==undefined||input.html!==undefined){
  recordSignal('aiCrawlerAccess',auditAiCrawlerAccess({
   ...(input.url?{url:input.url}:{}),
   ...(input.robotsTxt!==undefined?{robotsTxt:input.robotsTxt}:{}),
   ...(input.html!==undefined?{html:input.html}:{})
  }));
 }else{
  signals.aiCrawlerAccess={status:'unknown',findingCount:0};
 }

 if(input.llmsTxt!==undefined){
  recordSignal('llmsTxt',auditLlmsTxt({
   content:input.llmsTxt,
   ...(input.url?{siteUrl:input.url}:{})
  }));
 }else{
  signals.llmsTxt={status:'unknown',findingCount:0};
 }

 if(input.html!==undefined){
  recordSignal('structuredData',auditJsonLd({
   html:input.html,
   ...(input.url?{url:input.url}:{})
  }));
 }else{
  signals.structuredData={status:'unknown',findingCount:0};
 }

 if(input.markdown!==undefined||input.html!==undefined){
  recordSignal('answerFirst',auditAnswerFirst(
   input.markdown!==undefined?{markdown:input.markdown}:{html:input.html}
  ));
 }else{
  signals.answerFirst={status:'unknown',findingCount:0};
 }

 if(input.markdown!==undefined){
  recordSignal('ragChunks',auditRagChunks({
   text:input.markdown,
   locale:input.locale
  }));
 }else{
  signals.ragChunks={status:'unknown',findingCount:0};
 }

 if(input.html!==undefined||input.markdown!==undefined){
  recordSignal('promptInjectionSafety',auditPromptInjectionAndHiddenText({
   ...(input.html!==undefined?{html:input.html}:{}),
   ...(input.markdown!==undefined?{markdown:input.markdown}:{})
  }));
 }else{
  signals.promptInjectionSafety={status:'unknown',findingCount:0};
 }

 const statuses=Object.values(signals).map(s=>s.status);
 const passCount=statuses.filter(s=>s==='pass').length;
 const warnCount=statuses.filter(s=>s==='warn').length;
 const failCount=statuses.filter(s=>s==='fail').length;
 const unknownCount=statuses.filter(s=>s==='unknown').length;
 const evaluatedCount=statuses.length-unknownCount;

 return {
  ok:failCount===0,
  summary:{
   passCount,
   warnCount,
   failCount,
   unknownCount,
   evaluatedCount,
   totalSignals:statuses.length,
   readinessPercent:evaluatedCount>0?Math.round((passCount/evaluatedCount)*100):0
  },
  signals,
  findings
 };
}
