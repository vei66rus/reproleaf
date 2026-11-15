import {createHash} from 'node:crypto';
import {z} from 'zod';
import {assertSafePublicUrl,safeFetchPage} from './network-guard.mjs';
import {parseRobotsTxt,isBlockedByRules} from './crawl-policy-audit.mjs';
import {auditAiCrawlerAccess} from './ai-crawler-audit.mjs';
import {auditJsonLd} from './schema-audit.mjs';
import {auditLlmsTxt} from './llms-txt.mjs';

export const benchmarkRunnerSchema=z.object({
 origins:z.array(z.string().url().max(512)).min(1).max(500),
 allowNetwork:z.boolean().default(false),
 minDelayMsPerDomain:z.number().int().min(0).max(60000).default(2000),
 concurrency:z.number().int().min(1).max(10).default(4),
 userAgent:z.string().min(3).max(200).default('ReproleafBenchmarkBot/2.0 (+https://evolkov.tech/tools/geo-benchmark-leaderboard)')
}).strict();

function sleep(ms){
 return ms>0?new Promise(resolve=>setTimeout(resolve,ms)):Promise.resolve();
}

function isPathAllowedByRobots(robotsTxt,agent,path){
 if(!robotsTxt)return true;
 const {groups,wildcardRules}=parseRobotsTxt(robotsTxt);
 const agentToken=String(agent||'').split(/[\/\s(]/)[0].toLowerCase();
 const exactRules=groups
  .filter(g=>agentToken&&g.agents.some(a=>a===agentToken||agentToken.includes(a)&&a!=='*'))
  .flatMap(g=>g.rules);
 const selectedRules=exactRules.length?exactRules:wildcardRules;
 if(!selectedRules.length)return true;
 return isBlockedByRules(path,selectedRules)===null;
}

function summarizeBots(botsList){
 const out={};
 for(const bot of botsList||[]){
  if(['OAI-SearchBot','PerplexityBot','GPTBot','ClaudeBot'].includes(bot.agent)){
   out[bot.agent]=bot.status||'blocked';
  }
 }
 return out;
}

function looksLikeHtmlDocument(text){
 return /^\s*(?:<!doctype\s+html|<html\b)/i.test(String(text||''));
}

async function auditSingleOrigin(origin,parsed,runtime){
 const fetchOpts={
  fetchImpl:runtime.fetchImpl,
  lookupAll:runtime.lookupAll,
  timeoutMs:10000,
  maxBytes:2097152,
  maxRedirects:3,
  headers:{'user-agent':parsed.userAgent}
 };

 await assertSafePublicUrl(origin,{lookupAll:runtime.lookupAll});

 let robotsStatus=null;
 let robotsTxt='';
 try{
  const robRes=await safeFetchPage(`${origin}/robots.txt`,fetchOpts);
  robotsStatus=robRes.status;
  if(robRes.status>=200&&robRes.status<300&&!looksLikeHtmlDocument(robRes.text)){
   robotsTxt=robRes.text;
  }
 }catch{
  robotsStatus=null;
 }

 const allowedHome=isPathAllowedByRobots(robotsTxt,parsed.userAgent,'/');
 const allowedLlms=isPathAllowedByRobots(robotsTxt,parsed.userAgent,'/llms.txt');
 const permissionLog={
  robotsUrl:`${origin}/robots.txt`,
  robotsStatus,
  allowedHome,
  allowedLlmsTxt:allowedLlms,
  userAgent:parsed.userAgent
 };

 if(!allowedHome){
  return {
   origin,
   retrievedAt:new Date().toISOString(),
   status:'skipped_by_robots',
   permissionLog,
   homeStatus:null,
   wordCount:0,
   jsonLdTypes:[],
   llmsTxtStatus:null,
   llmsTxtValid:false,
   aiBots:{},
   score:0
  };
 }

 await sleep(parsed.minDelayMsPerDomain);
 let homeStatus=null;
 let homeHtml='';
 let ttfbMs=null;
 try{
  const homeRes=await safeFetchPage(`${origin}/`,fetchOpts);
  homeStatus=homeRes.status;
  homeHtml=homeRes.text||'';
  ttfbMs=homeRes.ttfbMs??null;
 }catch{
  homeStatus=null;
 }

 let llmsTxtStatus=null;
 let llmsTxtValid=false;
 if(allowedLlms){
  await sleep(parsed.minDelayMsPerDomain);
  try{
   const llmsRes=await safeFetchPage(`${origin}/llms.txt`,fetchOpts);
   llmsTxtStatus=llmsRes.status;
   if(llmsRes.status>=200&&llmsRes.status<300&&llmsRes.text&&!looksLikeHtmlDocument(llmsRes.text)){
    const checked=auditLlmsTxt({content:llmsRes.text.slice(0,500000)});
    llmsTxtValid=Boolean(checked.ok);
   }
  }catch{
   llmsTxtStatus=null;
  }
 }

 let wordCount=0;
 let jsonLdTypes=[];
 let aiAudit=null;
 if(homeStatus&&homeStatus>=200&&homeStatus<400&&homeHtml){
  try{
   const schema=auditJsonLd({html:homeHtml.slice(0,1048576),url:origin});
   jsonLdTypes=schema.summary?.types||[];
  }catch{}
  try{
   aiAudit=auditAiCrawlerAccess({
    url:`${origin}/`,
    robotsTxt,
    html:homeHtml.slice(0,1048576)
   });
   wordCount=aiAudit.summary?.visibleWordsNoJs??0;
  }catch{}
 }

 const aiBots=summarizeBots(aiAudit?.bots);
 const checks=[
  homeStatus!==null&&homeStatus>=200&&homeStatus<400,
  wordCount>=80,
  aiBots['OAI-SearchBot']!=='blocked'&&aiBots['PerplexityBot']!=='blocked',
  jsonLdTypes.length>0,
  llmsTxtValid
 ];
 const score=Math.round((checks.filter(Boolean).length/checks.length)*100);

 return {
  origin,
  retrievedAt:new Date().toISOString(),
  status:homeStatus&&homeStatus>=200&&homeStatus<400?'ok':homeStatus?`http_${homeStatus}`:'unreachable',
  permissionLog,
  homeStatus,
  ttfbMs,
  wordCount,
  jsonLdTypes,
  llmsTxtStatus,
  llmsTxtValid,
  aiBots,
  score
 };
}

export async function runEthicalBenchmark(rawInput,runtime={}){
 const parsed=benchmarkRunnerSchema.parse(rawInput);
 if(!parsed.allowNetwork){
  throw Error('Benchmark runner requires explicit allowNetwork: true (--allow-network).');
 }
 const effectiveDelay=(!runtime.fetchImpl&&parsed.minDelayMsPerDomain<2000)?2000:parsed.minDelayMsPerDomain;
 const effectiveCfg={...parsed,minDelayMsPerDomain:effectiveDelay};

 const uniqueOrigins=[...new Set(parsed.origins.map(u=>new URL(u).origin))];
 const results=new Array(uniqueOrigins.length);
 let cursor=0;

 async function worker(){
  while(true){
   const idx=cursor;
   cursor+=1;
   if(idx>=uniqueOrigins.length)return;
   try{
    results[idx]=await auditSingleOrigin(uniqueOrigins[idx],effectiveCfg,runtime);
   }catch(error){
    results[idx]={
     origin:uniqueOrigins[idx],
     retrievedAt:new Date().toISOString(),
     status:'rejected_or_error',
     error:error.message,
     permissionLog:{allowedHome:false,userAgent:parsed.userAgent},
     homeStatus:null,
     wordCount:0,
     jsonLdTypes:[],
     llmsTxtStatus:null,
     llmsTxtValid:false,
     aiBots:{},
     score:0
    };
   }
  }
 }

 const workers=Array.from({length:Math.min(effectiveCfg.concurrency,uniqueOrigins.length)},()=>worker());
 await Promise.all(workers);

 const reachable=results.filter(r=>r.status==='ok');
 const summary={
  methodology:'Ethical public landing probe (/robots.txt, /, /llms.txt), <=1 req/2s per domain, SSRF guarded.',
  userAgent:parsed.userAgent,
  totalOrigins:results.length,
  reachableCount:reachable.length,
  skippedByRobotsCount:results.filter(r=>r.status==='skipped_by_robots').length,
  validLlmsTxtCount:reachable.filter(r=>r.llmsTxtValid).length,
  jsonLdAdoptedCount:reachable.filter(r=>r.jsonLdTypes.length>0).length,
  oaiSearchAllowedCount:reachable.filter(r=>r.aiBots['OAI-SearchBot']==='allowed').length,
  perplexityAllowedCount:reachable.filter(r=>r.aiBots['PerplexityBot']==='allowed').length,
  gptBotBlockedCount:reachable.filter(r=>r.aiBots['GPTBot']==='blocked').length
 };

 const payload={generatedAt:new Date().toISOString(),summary,results};
 const sha256=createHash('sha256').update(JSON.stringify({summary,results})).digest('hex');

 return {
  ok:true,
  sha256,
  ...payload
 };
}
