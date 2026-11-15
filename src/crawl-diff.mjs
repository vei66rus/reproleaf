import {z} from 'zod';
import {safeFetchPage} from './network-guard.mjs';
import {inspectCrawledHtml,parseRobotsTxtForCrawler,isPathAllowedByRobots} from './live-crawler.mjs';

function extractFindingsList(snapshot){
 if(Array.isArray(snapshot.findings))return snapshot.findings;
 const list=[];
 for(const f of snapshot.profile?.findings||[])list.push(f);
 for(const f of snapshot.anomalies?.findings||[])list.push(f);
 for(const f of snapshot.renderDiff?.findings||[])list.push(f);
 return list;
}

function findingKey(f){
 const target=f.url||(Array.isArray(f.urls)?f.urls.join(','):'');
 return `${f.code}::${target}`;
}

export function diffCrawlSnapshots(baseline,current){
 const basePages=new Map((baseline.pages||[]).map(p=>[p.url,p]));
 const currPages=new Map((current.pages||[]).map(p=>[p.url,p]));

 const addedUrls=[];
 const removedUrls=[];
 const statusChanges=[];
 const canonicalChanges=[];
 const titleChanges=[];
 const wordCountDrops=[];

 for(const [url,curr] of currPages.entries()){
  const prev=basePages.get(url);
  if(!prev){
   addedUrls.push(url);
   continue;
  }
  if(prev.status!==curr.status){
   statusChanges.push({
    url,
    from:prev.status,
    to:curr.status,
    regression:prev.status>=200&&prev.status<300&&curr.status>=400
   });
  }
  if((prev.canonical||'')!==(curr.canonical||'')){
   canonicalChanges.push({url,from:prev.canonical||'',to:curr.canonical||''});
  }
  if((prev.title||'')!==(curr.title||'')){
   titleChanges.push({url,from:prev.title||'',to:curr.title||''});
  }
  if(prev.wordCount>=120&&curr.wordCount<Math.round(prev.wordCount*0.65)){
   wordCountDrops.push({url,fromWords:prev.wordCount,toWords:curr.wordCount});
  }
 }

 for(const url of basePages.keys()){
  if(!currPages.has(url))removedUrls.push(url);
 }

 const baseFindings=new Map();
 for(const f of extractFindingsList(baseline)){
  const k=findingKey(f);
  if(!baseFindings.has(k))baseFindings.set(k,f);
 }

 const currFindings=new Map();
 for(const f of extractFindingsList(current)){
  const k=findingKey(f);
  if(!currFindings.has(k))currFindings.set(k,f);
 }

 const newFindings=[];
 const resolvedFindings=[];
 const persistingFindings=[];

 for(const [k,f] of currFindings.entries()){
  if(baseFindings.has(k))persistingFindings.push(f);
  else newFindings.push(f);
 }
 for(const [k,f] of baseFindings.entries()){
  if(!currFindings.has(k))resolvedFindings.push(f);
 }

 const newErrors=newFindings.filter(f=>f.severity==='error').length;
 const statusRegressions=statusChanges.filter(s=>s.regression).length;

 return {
  ok:newErrors===0&&statusRegressions===0&&wordCountDrops.length===0,
  summary:{
   baselinePages:basePages.size,
   currentPages:currPages.size,
   addedUrlCount:addedUrls.length,
   removedUrlCount:removedUrls.length,
   newFindingCount:newFindings.length,
   resolvedFindingCount:resolvedFindings.length,
   persistingFindingCount:persistingFindings.length,
   statusChangeCount:statusChanges.length,
   statusRegressionCount:statusRegressions,
   canonicalChangeCount:canonicalChanges.length,
   titleChangeCount:titleChanges.length,
   wordCountDropCount:wordCountDrops.length
  },
  addedUrls,
  removedUrls,
  statusChanges,
  canonicalChanges,
  titleChanges,
  wordCountDrops,
  newFindings,
  resolvedFindings
 };
}

export const watchTemplatesSchema=z.object({
 origin:z.string().url().max(2048),
 allowNetwork:z.literal(true),
 routes:z.array(z.string().min(1).max(2048)).min(1).max(30),
 checkRobots:z.boolean().default(true),
 expectIndexable:z.boolean().default(true),
 requireCanonical:z.boolean().default(true),
 requireH1:z.boolean().default(true),
 timeoutMs:z.number().int().min(500).max(30000).default(15000),
 userAgent:z.string().min(1).max(120).default('ReproleafWatch/1.0')
}).strict();

export async function watchSiteTemplates(rawConfig,{fetchImpl=fetch,lookupAll}={}){
 const cfg=watchTemplatesSchema.parse(rawConfig);
 const origin=new URL(cfg.origin).origin;
 const headers={'user-agent':cfg.userAgent,accept:'text/html,text/plain;q=0.8'};
 const findings=[];
 const results=[];

 let robotsRules=[];
 let robotsStatus=null;
 if(cfg.checkRobots){
  try{
   const rob=await safeFetchPage(`${origin}/robots.txt`,{fetchImpl,lookupAll,requireOrigin:origin,maxBytes:524288,timeoutMs:cfg.timeoutMs,headers});
   robotsStatus=rob.status;
   if(rob.status>=200&&rob.status<300){
    robotsRules=parseRobotsTxtForCrawler(rob.text,cfg.userAgent).rules;
    if(cfg.expectIndexable&&!isPathAllowedByRobots('/',robotsRules)){
     findings.push({code:'WATCH_ROBOTS_DISALLOWED_ROOT',severity:'error',url:`${origin}/robots.txt`,message:'robots.txt currently blocks root path "/".'});
    }
   }
  }catch(err){
   findings.push({code:'WATCH_ROBOTS_FETCH_FAILED',severity:'warning',url:`${origin}/robots.txt`,message:err.message});
  }
 }

 for(const rawRoute of cfg.routes){
  let targetUrl;
  try{
   const resolved=new URL(rawRoute,origin);
   if(resolved.origin!==origin){
    findings.push({code:'WATCH_CROSS_ORIGIN_ROUTE',severity:'error',url:rawRoute,message:`Route ${rawRoute} is outside origin ${origin}.`});
    continue;
   }
   targetUrl=resolved.href;
  }catch{
   findings.push({code:'WATCH_INVALID_ROUTE',severity:'error',url:rawRoute,message:`Invalid route: ${rawRoute}`});
   continue;
  }

  if(cfg.checkRobots&&!isPathAllowedByRobots(`${new URL(targetUrl).pathname}${new URL(targetUrl).search}`,robotsRules)){
   findings.push({code:'WATCH_ROUTE_BLOCKED_BY_ROBOTS',severity:'error',url:targetUrl,message:`Route ${targetUrl} is disallowed by robots.txt.`});
  }

  try{
   const res=await safeFetchPage(targetUrl,{fetchImpl,lookupAll,requireOrigin:origin,maxBytes:2097152,timeoutMs:cfg.timeoutMs,headers});
   const inspected=inspectCrawledHtml(res.text,res.finalUrl,origin);
   const xRobots=res.headers['x-robots-tag']||'';
   const noindexDetected=/\b(?:noindex|none)\b/i.test(xRobots)||/\b(?:noindex|none)\b/i.test(inspected.robotsMeta);

   if(res.status!==200){
    findings.push({code:'WATCH_NON_200_STATUS',severity:'error',url:targetUrl,status:res.status,message:`Watched route returned HTTP ${res.status}.`});
   }
   if(cfg.expectIndexable&&noindexDetected){
    findings.push({code:'WATCH_UNEXPECTED_NOINDEX',severity:'error',url:targetUrl,message:`Noindex directive detected on watched route (${xRobots||inspected.robotsMeta}).`});
   }
   if(cfg.requireCanonical&&res.status===200&&!inspected.canonical){
    findings.push({code:'WATCH_MISSING_CANONICAL',severity:'warning',url:targetUrl,message:`Canonical link missing on ${targetUrl}.`});
   }
   if(cfg.requireH1&&res.status===200&&inspected.h1.length===0){
    findings.push({code:'WATCH_MISSING_H1',severity:'warning',url:targetUrl,message:`H1 heading missing on ${targetUrl}.`});
   }

   results.push({
    url:targetUrl,
    finalUrl:res.finalUrl,
    status:res.status,
    ttfbMs:res.ttfbMs,
    title:inspected.title,
    h1:inspected.h1[0]||'',
    canonical:inspected.canonical,
    noindex:noindexDetected
   });
  }catch(err){
   findings.push({code:'WATCH_FETCH_FAILED',severity:'error',url:targetUrl,message:err.message});
  }
 }

 const errors=findings.filter(f=>f.severity==='error').length;
 const warnings=findings.filter(f=>f.severity==='warning').length;

 return {
  ok:errors===0,
  checkedAt:new Date().toISOString(),
  origin,
  robotsStatus,
  summary:{
   totalRoutes:cfg.routes.length,
   checkedRoutes:results.length,
   errors,
   warnings
  },
  results,
  findings
 };
}
