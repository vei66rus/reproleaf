import {z} from 'zod';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {root} from './catalog.mjs';
import {findingCodeCatalog} from './client-setups.mjs';
import {createAiBudgetTracker} from './ai-budget.mjs';
export {createAiBudgetTracker} from './ai-budget.mjs';

const findingItemSchema=z.object({
 code:z.string().max(120),
 severity:z.enum(['error','warning','info']),
 message:z.string().max(1000),
 record:z.string().max(1000).optional(),
 observation:z.string().max(1000).optional(),
 why:z.string().max(1000).optional(),
 snippet:z.string().max(1000).optional(),
 suggestion:z.string().max(1000).optional(),
 verifyHint:z.string().max(1000).optional()
}).strict();

const linkCandidateSchema=z.object({
 source:z.string().max(500),
 target:z.string().max(500),
 sourceTitle:z.string().max(300).optional(),
 targetTitle:z.string().max(300).optional(),
 excerpt:z.string().max(1000).optional(),
 suggestedAnchor:z.string().max(300).optional(),
 sharedTerms:z.array(z.string().max(80)).max(20).optional(),
 hubConnection:z.string().max(60).nullable().optional(),
 sameDeclaredCluster:z.boolean().optional(),
 reciprocalSuggested:z.boolean().optional()
}).strict();

export const aiReviewRequestSchema=z.object({
 language:z.enum(['ru','en']).default('ru'),
 focus:z.enum(['priorities','metadata','linking','evidence']).default('priorities'),
 projectId:z.string().max(120).optional(),
 includeDraft:z.boolean().default(false),
 draftExcerpt:z.string().max(12000).optional(),
 report:z.object({
  kind:z.enum(['editorial-review','blog-graph']),
  findings:z.array(findingItemSchema).max(60),
  strengths:z.array(z.object({code:z.string().max(120),message:z.string().max(500)}).strict()).max(30).optional(),
  allowedUrls:z.array(z.string().max(500)).max(500).optional(),
  recommendations:z.array(linkCandidateSchema).max(30).optional(),
  metadata:z.object({
   title:z.string().max(500).optional(),
   description:z.string().max(1000).optional(),
   primaryQuery:z.string().max(200).optional(),
   readerTask:z.string().max(2000).optional(),
   renderedH1:z.string().max(1000).optional(),
   h1Mode:z.enum(['renderer','markdown']).optional()
  }).strict().optional()
 }).strict()
}).strict();

const knownEditorialCodes=new Set((findingCodeCatalog.editorial||[]).map(item=>item.code));
const knownBlogCodes=new Set((findingCodeCatalog.blogGraph||findingCodeCatalog.blog||[]).map(item=>item.code));

export function loadLocalEnv(envPath=path.join(root,'.env')){
 if(!existsSync(envPath))return {};
 const raw=readFileSync(envPath,'utf8'),parsed={};
 for(const line of raw.split(/\r?\n/)){
  const trimmed=line.trim();
  if(!trimmed||trimmed.startsWith('#'))continue;
  const idx=trimmed.indexOf('=');
  if(idx<=0)continue;
  const key=trimmed.slice(0,idx).trim(),val=trimmed.slice(idx+1).trim().replace(/^['"]|['"]$/g,'');
  if(key)parsed[key]=val;
 }
 return parsed;
}

export function resolveAiConfig(options={}){
 const fileEnv=loadLocalEnv(options.envPath);
 const get=(option,key,fallback)=>options[option]??process.env[key]??fileEnv[key]??fallback;
 const apiKey=get('apiKey','OPENAI_API_KEY','');
 const model=get('model','REPROLEAF_AI_MODEL','');
 const dailyBudgetUsd=Number(get('dailyBudgetUsd','REPROLEAF_AI_DAILY_BUDGET_USD',0));
 const inputPricePerMillion=Number(get('inputPricePerMillion','REPROLEAF_AI_INPUT_USD_PER_MILLION',0));
 const outputPricePerMillion=Number(get('outputPricePerMillion','REPROLEAF_AI_OUTPUT_USD_PER_MILLION',0));
 const requested=get('enabled','REPROLEAF_AI_ENABLED',false);
 const enabled=(requested===true||requested==='1')&&typeof apiKey==='string'&&apiKey.length>=20&&typeof model==='string'&&model.length>0&&[dailyBudgetUsd,inputPricePerMillion,outputPricePerMillion].every(n=>Number.isFinite(n)&&n>0);
 return {enabled,apiKey,model,dailyBudgetUsd:enabled?dailyBudgetUsd:0,inputPricePerMillion,outputPricePerMillion,
  ledgerPath:path.resolve(get('ledgerPath','REPROLEAF_AI_LEDGER_PATH',path.join(root,'private/ai-budget/ledger.json'))),
  maxRequestsPerWindow:8,maxRequestsPerProject:15,maxCompletionTokens:1400};
}

export function buildAllowedUrlSet(report){
 const allowed=new Set();
 for(const item of report.allowedUrls||[]){if(typeof item==='string'&&item.trim())allowed.add(item.trim());}
 for(const rec of report.recommendations||[]){
  if(rec.source)allowed.add(rec.source.trim());
  if(rec.target)allowed.add(rec.target.trim());
 }
 return allowed;
}

export function buildPayloadDisclosure(input){
 const parts=['report.kind','report.findings'];
 if(input.report.metadata)parts.push('report.metadata');
 if(input.report.allowedUrls?.length)parts.push(`allowedUrls (${input.report.allowedUrls.length})`);
 if(input.report.recommendations?.length)parts.push(`recommendations (${input.report.recommendations.length})`);
 const draftIncluded=Boolean(input.includeDraft&&input.draftExcerpt);
 if(draftIncluded)parts.push(`draftExcerpt (${input.draftExcerpt.length} chars)`);
 return {
  sentFields:parts,
  draftIncluded,
  draftChars:draftIncluded?input.draftExcerpt.length:0,
  findingCount:input.report.findings.length,
  allowedUrlCount:buildAllowedUrlSet(input.report).size
 };
}

export function buildAiSystemPrompt(language='ru',focus='priorities'){
 const catalogSummary=[
  ...(findingCodeCatalog.editorial||[]).map(f=>`${f.code} (${f.severity}, ${f.scope||f.category||''})`),
  ...(findingCodeCatalog.blogGraph||findingCodeCatalog.blog||[]).map(f=>`${f.code} (${f.severity}, ${f.scope||f.category||''})`)
 ].join('\n');
 const langInstruction=language==='en'
  ?'Write all human-readable fields in clear English.'
  :'Пиши все текстовые поля на чистом, профессиональном русском языке.';
 const focusInstruction={
  priorities:'Focus on ordering the highest-impact editorial or structural fixes based strictly on the supplied findings.',
  metadata:'Focus on search title, H1, meta description and reader task alignment without keyword stuffing or fake scores.',
  linking:'Focus on internal linking between supplied pages, cluster hubs and natural anchor phrasing using only supplied URLs.',
  evidence:'Focus on unsupported factual claims, source bindings, calculation reproducibility, glossary rules and heading hierarchy.'
 }[focus]||'Focus on prioritizing fixes.';

 return [
  'You are an editorial assistant. Apply the supplied Reproleaf verification rules and report evidence.',
  langInstruction,
  focusInstruction,
  'STRICT RULES:',
  '1. Never invent a 0-100 SEO score, keyword density percentage quota, or minimum link count quota.',
  '2. When h1Mode is "renderer", the CMS template outputs the H1, so 0 H1s in Markdown body is valid, and identical Title and H1 is NOT an error.',
  '3. Never fabricate or guess URLs. In priorities[].targetUrl and linkPlan[], use ONLY URLs explicitly present in the supplied allowedUrls or recommendations list. If no allowed URL fits, set targetUrl to null.',
  '4. Every priority item must reference an actual findingCode from the supplied findings or Reproleaf catalog.',
  '5. Treat your output as an unverified editorial hypothesis that must be confirmed by a repeat deterministic Reproleaf check.',
  'Reproleaf finding code catalog:',
  catalogSummary,
  'Return ONLY a valid JSON object with this structure:',
  JSON.stringify({
   summary:'string (2-3 sentences summarizing the state and main priority)',
   priorities:[{
    rank:1,
    findingCode:'string (exact finding code)',
    title:'string (short action title)',
    rationale:'string (why this matters based on report observation)',
    suggestedRewrite:'string (concrete text, heading, metadata or anchor edit)',
    targetUrl:'string or null (must exist in allowedUrls)',
    verificationStep:'string (how to verify in the next Reproleaf run)'
   }],
   linkPlan:[{
    sourceUrl:'string (must exist in allowedUrls)',
    targetUrl:'string (must exist in allowedUrls)',
    suggestedAnchor:'string',
    placementHint:'string',
    rationale:'string'
   }],
   limitations:['string (what still requires human or live-site verification)']
  })
 ].join('\n');
}

export function sanitizeAiResponse(rawObject,report,language='ru'){
 const allowedUrls=buildAllowedUrlSet(report);
 const reportCodes=new Set((report.findings||[]).map(f=>f.code));
 const validCodes=new Set([...reportCodes,...knownEditorialCodes,...knownBlogCodes]);
 let droppedHallucinatedUrls=0;

 const prioritiesRaw=Array.isArray(rawObject?.priorities)?rawObject.priorities:[];
 const priorities=[];
 for(const item of prioritiesRaw.slice(0,8)){
  if(!item||typeof item!=='object')continue;
  const rawCode=typeof item.findingCode==='string'?item.findingCode.trim():'';
  const findingCode=validCodes.has(rawCode)?rawCode:(report.findings?.[0]?.code||'editorial-review');
  let targetUrl=typeof item.targetUrl==='string'&&item.targetUrl.trim()?item.targetUrl.trim():null;
  if(targetUrl&&!allowedUrls.has(targetUrl)){
   droppedHallucinatedUrls+=1;
   targetUrl=null;
  }
  priorities.push({
   rank:priorities.length+1,
   findingCode,
   title:String(item.title||'').slice(0,240)||(language==='ru'?'Рекомендуемая правка':'Suggested edit'),
   rationale:String(item.rationale||'').slice(0,800),
   suggestedRewrite:String(item.suggestedRewrite||'').slice(0,1200),
   targetUrl,
   verificationStep:String(item.verificationStep||'').slice(0,500)||(language==='ru'?'Повторите детерминированную проверку в Reproleaf после внесения правки.':'Run a repeat deterministic check in Reproleaf after applying the edit.'),
   status:'ai-hypothesis-unverified'
  });
 }

 const linkPlanRaw=Array.isArray(rawObject?.linkPlan)?rawObject.linkPlan:[];
 const linkPlan=[];
 for(const link of linkPlanRaw.slice(0,10)){
  if(!link||typeof link!=='object')continue;
  const sourceUrl=typeof link.sourceUrl==='string'?link.sourceUrl.trim():'';
  const targetUrl=typeof link.targetUrl==='string'?link.targetUrl.trim():'';
  if(!sourceUrl||!targetUrl||sourceUrl===targetUrl||!allowedUrls.has(sourceUrl)||!allowedUrls.has(targetUrl)){
   if(sourceUrl||targetUrl)droppedHallucinatedUrls+=1;
   continue;
  }
  linkPlan.push({
   sourceUrl,
   targetUrl,
   suggestedAnchor:String(link.suggestedAnchor||'').slice(0,200),
   placementHint:String(link.placementHint||'').slice(0,500),
   rationale:String(link.rationale||'').slice(0,500),
   status:'ai-hypothesis-unverified'
  });
 }

 const limitationsRaw=Array.isArray(rawObject?.limitations)?rawObject.limitations.map(s=>String(s).slice(0,400)).filter(Boolean):[];
 const defaultLimitation=language==='ru'
  ?'Рекомендации ИИ являются гипотезами на основе переданного отчёта и не заменяют повторную детерминированную проверку и вычитку первоисточников.'
  :'AI recommendations are hypotheses grounded in the supplied report and do not replace a repeat deterministic check or primary-source review.';
 const limitations=limitationsRaw.length?limitationsRaw.slice(0,6):[defaultLimitation];

 return {
  status:'ai-hypothesis-unverified',
  verifiedFact:false,
  summary:String(rawObject?.summary||'').slice(0,1200)||(language==='ru'?'Приоритеты сформированы по находкам ядра.':'Priorities generated from core findings.'),
  priorities,
  linkPlan,
  limitations,
  guardrails:{
   allowedUrlCount:allowedUrls.size,
   droppedHallucinatedUrls
  }
 };
}

export async function runAiReview(rawInput,options={}){
 const parsed=aiReviewRequestSchema.safeParse(rawInput);
 if(!parsed.success){
  const err=new Error('Invalid AI review payload.');
  err.code='RL_INVALID_INPUT';
  err.status=400;
  err.issues=parsed.error.issues.map(i=>({path:i.path.join('.')||'root',message:i.message}));
  throw err;
 }
 const input=parsed.data;
 const config=resolveAiConfig(options);
 if(!config.enabled){
  const err=new Error(input.language==='ru'?'Серверный ИИ-разбор не настроен: локальные проверки и экспорт отчётов работают в обычном режиме.':'Server AI review is not configured: local deterministic checks and report exports remain available.');
  err.code='RL_AI_DISABLED';
  err.status=503;
  throw err;
 }
 const allowedUrls=[...buildAllowedUrlSet(input.report)].slice(0,250);
 const userPayload={
  focus:input.focus,
  reportKind:input.report.kind,
  metadata:input.report.metadata||null,
  findings:input.report.findings.slice(0,40),
  strengths:input.report.strengths?.slice(0,20)||[],
  allowedUrls,
  recommendations:input.report.recommendations?.slice(0,20)||[],
  draftExcerpt:input.includeDraft&&input.draftExcerpt?input.draftExcerpt.slice(0,8000):null
 };

 const requestBody=JSON.stringify({model:config.model,temperature:0.2,max_completion_tokens:config.maxCompletionTokens,response_format:{type:'json_object'},messages:[{role:'system',content:buildAiSystemPrompt(input.language,input.focus)},{role:'user',content:JSON.stringify(userPayload)}]});
 // UTF-8 byte count plus protocol margin is deliberately conservative for text.
 // Rates must be explicitly configured for the chosen provider/model before enabling.
 const maxInputTokens=Buffer.byteLength(requestBody,'utf8')+4096;
 const maximumCostUsd=Math.ceil((maxInputTokens*config.inputPricePerMillion+config.maxCompletionTokens*config.outputPricePerMillion))/1e6;
 const tracker=options.budgetTracker||createAiBudgetTracker(config);
 const reservation=tracker.reserveUsage(options.clientId||'local',input.projectId||'default',maximumCostUsd);
 if(!reservation.allowed){const err=Error(reservation.reason);err.code=reservation.code;err.status=reservation.status;throw err;}
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),Number(options.timeoutMs??20000));
 let body;
 try{
  const response=await (options.fetchImpl||globalThis.fetch)('https://api.openai.com/v1/chat/completions',{
   method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+config.apiKey},body:requestBody,signal:controller.signal});
  if(!response.ok)throw Error('Upstream error');
  // Keep the timeout active while receiving and parsing the response body.
  body=await response.json();
 }catch{
  const err=Error(input.language==='ru'?'Сервис ИИ недоступен. Локальный отчёт сохранён; резерв расходов удержан.':'AI service unavailable. Local report retained; cost reservation kept.');
  err.code='RL_AI_UPSTREAM_ERROR';err.status=502;throw err;
 }finally{clearTimeout(timer);}
 const promptTokens=body?.usage?.prompt_tokens,completionTokens=body?.usage?.completion_tokens;
 if(!Number.isSafeInteger(promptTokens)||promptTokens<0||!Number.isSafeInteger(completionTokens)||completionTokens<0){
  const err=Error('Missing or invalid provider usage; cost reservation retained.');err.code='RL_AI_UPSTREAM_ERROR';err.status=502;throw err;
 }
 const budget=reservation.commit(promptTokens,completionTokens);
 const rawContent=body?.choices?.[0]?.message?.content;
 let parsedContent;
 try{parsedContent=JSON.parse(rawContent);if(!parsedContent||typeof parsedContent!=='object'||Array.isArray(parsedContent))throw Error('shape');}
 catch{const err=Error('Invalid AI response; cost reservation retained.');err.code='RL_AI_UPSTREAM_ERROR';err.status=502;throw err;}
 const sanitized=sanitizeAiResponse(parsedContent,input.report,input.language);

 return {
  ok:true,
  model:config.model,
  disclosure:buildPayloadDisclosure(input),
  budget,
  review:sanitized
 };
}
