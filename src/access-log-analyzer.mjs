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
 try{
  if(/^https?:\/\//i.test(rawUrl)){
   const u=new URL(rawUrl);
   const p=u.pathname.length>1&&u.pathname.endsWith('/')?u.pathname.slice(0,-1):u.pathname;
   return `${p}${u.search}`;
  }
 }catch{}
 const noHash=String(rawUrl||'').split('#')[0].trim()||'/';
 const qIdx=noHash.indexOf('?');
 const pathname=qIdx===-1?noHash:noHash.slice(0,qIdx);
 const search=qIdx===-1?'':noHash.slice(qIdx);
 const cleanPath=pathname.length>1&&pathname.endsWith('/')?pathname.slice(0,-1):pathname;
 return `${cleanPath}${search}`;
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
   if(!rawUrl||!Number.isInteger(status))return null;
   return {path:normalizePath(rawUrl),status,userAgent:ua};
  }catch{
   return null;
  }
 }
 const m=trimmed.match(combinedLogRe);
 if(!m)return null;
 return {
  path:normalizePath(m[1]),
  status:Number(m[2]),
  userAgent:m[3]||''
 };
}

export function analyzeAccessLogs(rawInput){
 const input=accessLogInputSchema.parse(rawInput);
 const lines=input.rawLog.split(/\r?\n/);

 let totalHits=0;
 let unparsedLines=0;
 let botHits=0;
 const botStatusDistribution={'2xx':0,'3xx':0,'4xx':0,'5xx':0};
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
  const isParamWaste=wasteParamRe.test(rec.path);

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
 const invisiblePages=normalizedCrawledPaths
  .filter(item=>!hitsByPath.has(item.path)&&!hitsByPath.has(item.path.split('?')[0]))
  .map(item=>item.raw);

 const wasteRate=botHits>0?Number((wastedHits/botHits).toFixed(4)):0;
 const topCrawledPaths=[...hitsByPath.entries()]
  .sort((a,b)=>b[1]-a[1])
  .slice(0,25)
  .map(([path,hits])=>({path,hits}));
 const topWastedTargets=[...wasteByPath.entries()]
  .sort((a,b)=>b[1]-a[1])
  .slice(0,25)
  .map(([target,hits])=>({target,hits}));

 const findings=[];
 if(wasteRate>=0.25&&botHits>=4){
  findings.push({
   code:'LOGS_HIGH_CRAWL_BUDGET_WASTE',
   severity:'warning',
   message:`${Math.round(wasteRate*100)}% of bot hits went to 3xx/4xx/5xx or parameterized URLs.`
  });
 }
 if(wasteOn5xx>0){
  findings.push({
   code:'LOGS_BOT_5XX_ERRORS',
   severity:'error',
   count:wasteOn5xx,
   message:`Search/AI crawlers hit ${wasteOn5xx} 5xx server error response(s).`
  });
 }
 if(invisiblePages.length>0){
  findings.push({
   code:'LOGS_INVISIBLE_CRAWLED_PAGES',
   severity:'info',
   count:invisiblePages.length,
   message:`${invisiblePages.length} site URL(s) received zero crawler hits in this log window.`
  });
 }

 return {
  ok:wasteOn5xx===0,
  summary:{
   totalHits,
   unparsedLines,
   botHits,
   wastedHits,
   crawlBudgetWasteRatio:wasteRate,
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
