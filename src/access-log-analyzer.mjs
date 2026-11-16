import {z} from 'zod';

export const accessLogInputSchema=z.object({
 rawLog:z.string().min(1).max(10485760),
 format:z.enum(['auto','combined','cloudflare-jsonl']).default('auto'),
 crawledUrls:z.array(z.string().min(1)).max(5000).default([])
}).strict();

const botSignatures=[
 {name:'OAI-SearchBot',pattern:/\bOAI-SearchBot\b/i},
 {name:'GPTBot',pattern:/\bGPTBot\b/i},
 {name:'ChatGPT-User',pattern:/\bChatGPT-User\b/i},
 {name:'PerplexityBot',pattern:/\bPerplexityBot\b/i},
 {name:'ClaudeBot',pattern:/\bClaudeBot\b/i},
 {name:'Anthropic-AI',pattern:/\banthropic-ai\b/i},
 {name:'Googlebot',pattern:/\bGooglebot(?:-Image|-News|-Video)?\b/i},
 {name:'YandexBot',pattern:/\bYandex(?:Bot|MobileBot|Images)\b/i},
 {name:'Bingbot',pattern:/\bbingbot\b/i},
 {name:'Applebot',pattern:/\bApplebot\b/i}
];

const combinedLogRe=/^\S+\s+\S+\s+\S+\s+\[[^\]]+\]\s+"[A-Z]+\s+([^\s"]+)(?:\s+HTTP\/[0-9.]+)?"\s+(\d{3})\s+\S+(?:\s+"[^"]*"\s+"([^"]*)")?/;
const wasteParamRe=/[?&](?:sort|order|dir|filter|utm_[^=]+|fbclid|gclid|yclid|page|p|paged)=/i;

function detectBotFamily(ua){
 if(!ua)return null;
 for(const sig of botSignatures){
  if(sig.pattern.test(ua))return sig.name;
 }
 return null;
}

function normalizePath(rawUrl){
 let pathname;
 try{pathname=new URL(String(rawUrl||'/'),'https://reproleaf.invalid').pathname;}catch{return '/[invalid-path]';}
 try{pathname=decodeURIComponent(pathname);}catch{}
 pathname=pathname.split(/[?#]/)[0];
 let redactNext=false;
 const parts=pathname.split('/').map(segment=>{
  const secretKey=/^(?:api[-_]?key|token|access[-_]?token|secret|password|session|authorization)$/i.test(segment);
  const redact=redactNext||/@/.test(segment)||/^(?:\d{1,3}\.){3}\d{1,3}$/.test(segment)||/(?:[a-f\d]{0,4}:){2}/i.test(segment)||/^[a-f\d-]{24,}$/i.test(segment)||segment.length>80;
  redactNext=secretKey;
  return redact?'[redacted]':segment.replace(/[\u0000-\u001f\u007f]/g,'');
 });
 const clean=parts.join('/')||'/';
 return clean.length>1&&clean.endsWith('/')?clean.slice(0,-1):clean;
}

function safePageReference(raw){
 const clean=normalizePath(raw);
 try{const url=new URL(raw);if(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname)||url.hostname.includes(':'))return clean;return ['http:','https:'].includes(url.protocol)?url.origin+clean:clean;}catch{return clean;}
}

function parseLogRecord(line,format){
 const trimmed=line.trim();
 if(!trimmed)return null;
 if(format==='cloudflare-jsonl'||(format==='auto'&&trimmed.startsWith('{'))){
  try{
   const obj=JSON.parse(trimmed);
   const rawUrl=obj.ClientRequestURI||obj.ClientRequestPath||obj.requestUri||obj.uri||obj.path;
   const status=Number(obj.EdgeResponseStatus??obj.OriginResponseStatus??obj.status);
   const ua=String(obj.ClientRequestUserAgent||obj.userAgent||obj.ua||'');
   if(typeof rawUrl!=='string'||!rawUrl||!Number.isInteger(status)||status<100||status>599)return null;
   return {path:normalizePath(rawUrl),status,userAgent:ua,parameterCandidate:wasteParamRe.test(rawUrl)};
  }catch{
   return null;
  }
 }
 const m=trimmed.match(combinedLogRe);
 if(!m||Number(m[2])<100||Number(m[2])>599)return null;
 return {
  path:normalizePath(m[1]),
  status:Number(m[2]),
  userAgent:m[3]||'',
  parameterCandidate:wasteParamRe.test(m[1])
 };
}

export function analyzeAccessLogs(rawInput){
 const input=accessLogInputSchema.parse(rawInput);
 const lines=input.rawLog.split(/\r?\n/);

 let totalHits=0;
 let unparsedLines=0;
 let botHits=0;
 const botStatusDistribution={'1xx':0,'2xx':0,'3xx':0,'4xx':0,'5xx':0};
 const hitsByBot=new Map();
 const hitsByPath=new Map();
 const wasteByPath=new Map();
 let wastedHits=0;
 let wasteOn4xx=0;
 let wasteOn3xx=0;
 let wasteOn5xx=0;
 let wasteOnParams=0;

 for(const line of lines){
  if(!line.trim())continue;
  const rec=parseLogRecord(line,input.format);
  if(!rec){
   unparsedLines+=1;
   continue;
  }
  totalHits+=1;
  const bot=detectBotFamily(rec.userAgent);
  if(!bot)continue;

  botHits+=1;
  hitsByBot.set(bot,(hitsByBot.get(bot)||0)+1);
  hitsByPath.set(rec.path,(hitsByPath.get(rec.path)||0)+1);

  const bucket=`${Math.floor(rec.status/100)}xx`;
  if(Object.hasOwn(botStatusDistribution,bucket))botStatusDistribution[bucket]+=1;

  const is4xx=rec.status>=400&&rec.status<500;
  const is5xx=rec.status>=500;
  const is3xx=rec.status>=300&&rec.status<400;
  const isParamWaste=rec.parameterCandidate;

  if(is4xx)wasteOn4xx+=1;
  if(is5xx)wasteOn5xx+=1;
  if(is3xx)wasteOn3xx+=1;
  if(isParamWaste)wasteOnParams+=1;

  if(is4xx||is5xx||is3xx||isParamWaste){
   wastedHits+=1;
   const key=`${rec.status} ${rec.path}`;
   wasteByPath.set(key,(wasteByPath.get(key)||0)+1);
  }
 }

 const normalizedCrawledPaths=input.crawledUrls.map(u=>({raw:u,path:normalizePath(u)}));
 const invisiblePages=totalHits===0?[]:normalizedCrawledPaths
  .filter(item=>!hitsByPath.has(item.path)&&!hitsByPath.has(item.path.split('?')[0]))
  .map(item=>safePageReference(item.raw));

 const wasteRate=botHits>0?Number((wastedHits/botHits).toFixed(4)):null;
 const topCrawledPaths=[...hitsByPath.entries()]
  .sort((a,b)=>b[1]-a[1])
  .slice(0,25)
  .map(([path,hits])=>({path,hits}));
 const topWastedTargets=[...wasteByPath.entries()]
  .sort((a,b)=>b[1]-a[1])
  .slice(0,25)
  .map(([target,hits])=>({target,hits}));

 const findings=[];
 if(totalHits===0)findings.push({code:'LOGS_NO_PARSED_RECORDS',severity:'error',message:'No valid records were parsed. No conclusion about bot activity can be drawn.'});
 else if(botHits===0)findings.push({code:'LOGS_NO_KNOWN_BOT_UA',severity:'info',message:'No recognized bot user-agent signatures were observed in the supplied records. This does not prove that bots never visited.'});
 if(wasteRate>=0.25&&botHits>=4){
  findings.push({
   code:'LOGS_HIGH_CRAWL_BUDGET_WASTE',
   severity:'warning',
   message:`${Math.round(wasteRate*100)}% of requests claiming a known bot user agent received 3xx/4xx/5xx or used selected URL parameters. These are review candidates, not measured wasted crawl budget.`
  });
 }
 if(wasteOn5xx>0){
  findings.push({
   code:'LOGS_BOT_5XX_ERRORS',
   severity:'error',
   count:wasteOn5xx,
   message:`Requests claiming a known crawler user agent received ${wasteOn5xx} 5xx server error response(s). Bot identity was not verified.`
  });
 }
 if(invisiblePages.length>0){
  findings.push({
   code:'LOGS_INVISIBLE_CRAWLED_PAGES',
   severity:'info',
   count:invisiblePages.length,
   message:`${invisiblePages.length} supplied URL(s) had no matching known-bot user-agent path in these supplied records. This does not establish indexing or bot identity.`
  });
 }

 return {
  ok:totalHits>0&&wasteOn5xx===0,
  scope:{botIdentity:'claimed-user-agent-only',networkVerification:false,pathMatching:'Query and fragment removed; known sensitive path segments redacted. Review paths before sharing.',crawlBudget:'3xx/4xx/5xx and selected parameters are review candidates, not measured wasted crawl budget.'},
  summary:{
   totalHits,
   unparsedLines,
   botHits,
   wastedHits,
   crawlBudgetWasteRatio:wasteRate,
   reviewCandidateHits:wastedHits,
   reviewCandidateRatio:wasteRate,
   wasteOn4xx,
   wasteOn3xx,
   wasteOn5xx,
   wasteOnParams,
   invisiblePageCount:invisiblePages.length
  },
  hitsByBot:Object.fromEntries([...hitsByBot.entries()].sort((a,b)=>b[1]-a[1])),
  botStatusDistribution,
  topCrawledPaths,
  topWastedTargets,
  invisiblePages:invisiblePages.slice(0,200),
  findings
 };
}
