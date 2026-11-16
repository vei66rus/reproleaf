import {z} from 'zod';
import {parse} from 'parse5';
import {assertSafePublicUrl,NetworkGuardError,safeFetchPage} from './network-guard.mjs';
import {profileCrawlResult} from './crawl-profiler.mjs';
import {classifyCrawlAnomalies} from './crawl-anomalies.mjs';
import {renderAndDiffCrawlPages} from './live-render-audit.mjs';

export const crawlSiteSchema=z.object({
 startUrl:z.string().url().max(2048),
 allowNetwork:z.literal(true),
 maxPages:z.number().int().min(1).max(500).default(50),
 maxDepth:z.number().int().min(0).max(10).default(3),
 maxBytesPerPage:z.number().int().min(1024).max(8388608).default(2097152),
 concurrency:z.number().int().min(1).max(5).default(3),
 crawlDelayMs:z.number().int().min(0).max(10000).default(100),
 respectRobots:z.boolean().default(true),
 followSitemaps:z.boolean().default(true),
 renderJs:z.boolean().default(false),
 maxRenderPages:z.number().int().min(1).max(50).default(25),
 timeoutMs:z.number().int().min(500).max(30000).default(15000),
 userAgent:z.string().min(1).max(120).default('ReproleafBot/1.0 (+https://github.com/vei66rus/reproleaf)')
}).strict();

export function parseRobotsTxtForCrawler(raw,userAgent='ReproleafBot'){
 const groups=[];
 let current={agents:[],rules:[],crawlDelay:null};
 const sitemaps=[];
 let sawRule=false;
 const uaToken=userAgent.split('/')[0].toLowerCase();

 for(const rawLine of String(raw||'').split(/\r?\n/)){
  const hash=rawLine.indexOf('#');
  const line=(hash===-1?rawLine:rawLine.slice(0,hash)).trim();
  if(!line)continue;
  const colon=line.indexOf(':');
  if(colon===-1)continue;
  const field=line.slice(0,colon).trim().toLowerCase();
  const value=line.slice(colon+1).trim();
  if(field==='user-agent'){
   if(sawRule&&current.agents.length){
    groups.push(current);
    current={agents:[],rules:[],crawlDelay:null};
   }
   if(value)current.agents.push(value.toLowerCase());
   sawRule=false;
  }else if(field==='allow'||field==='disallow'){
   sawRule=true;
   if(value!==''){
    current.rules.push({allow:field==='allow',pattern:value});
   }
  }else if(field==='crawl-delay'){
   sawRule=true;
   const sec=Number(value);
   if(Number.isFinite(sec)&&sec>=0){
    current.crawlDelay=Math.min(10000,Math.round(sec*1000));
   }
  }else if(field==='sitemap'&&value){
   sitemaps.push(value);
  }
 }
 if(current.agents.length)groups.push(current);

 const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&uaToken.includes(a)));
 const selected=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
 const rules=selected.flatMap(g=>g.rules);
 const crawlDelays=selected.map(g=>g.crawlDelay).filter(v=>v!==null);
 const crawlDelayMs=crawlDelays.length?Math.max(...crawlDelays):null;

 return {rules,sitemaps:[...new Set(sitemaps)],crawlDelayMs};
}

export function isPathAllowedByRobots(pathWithQuery,rules){
 if(!Array.isArray(rules)||rules.length===0)return true;
 let best=null;
 for(const rule of rules){
  const anchored=rule.pattern.endsWith('$');
  const core=anchored?rule.pattern.slice(0,-1):rule.pattern;
  const escaped=core.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');
  const re=new RegExp(`^${escaped}${anchored?'$':''}`);
  if(re.test(pathWithQuery)){
   const len=rule.pattern.length;
   if(!best||len>best.len||(len===best.len&&rule.allow)){
    best={allow:rule.allow,len};
   }
  }
 }
 return best?best.allow:true;
}

function decodeXml(value){
 return value.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
}

export function extractSitemapEntries(xmlText){
 const urls=[];
 const childSitemaps=[];
 const locRe=/<(url|sitemap)\b[^>]*>[\s\S]*?<loc>\s*([\s\S]*?)\s*<\/loc>[\s\S]*?<\/\1>/gi;
 for(const m of String(xmlText||'').matchAll(locRe)){
  const kind=m[1].toLowerCase();
  const loc=decodeXml(m[2].trim());
  if(!loc)continue;
  if(kind==='sitemap')childSitemaps.push(loc);
  else urls.push(loc);
 }
 return {urls,childSitemaps};
}

function normalizeCrawlUrl(rawUrl,baseOrigin){
 try{
  const u=new URL(rawUrl,baseOrigin);
  if(u.protocol!=='http:'&&u.protocol!=='https:')return null;
  u.hash='';
  if(u.pathname.length>1&&u.pathname.endsWith('/'))u.pathname=u.pathname.slice(0,-1);
  return u.href;
 }catch{
  return null;
 }
}

function countWords(text){
 const matches=String(text||'').match(/[\p{L}\p{N}-]+/gu);
 return matches?matches.length:0;
}

function attrMap(node){
 const map={};
 for(const attr of node.attrs||[])map[attr.name.toLowerCase()]=attr.value;
 return map;
}

function collectText(node,skipTags=new Set(['script','style','noscript','template'])){
 if(!node)return '';
 if(node.nodeName==='#text')return node.value||'';
 if(skipTags.has(node.tagName))return '';
 return (node.childNodes||[]).map(child=>collectText(child,skipTags)).join(' ');
}

function walkTree(node,visitor){
 visitor(node);
 for(const child of node.childNodes||[])walkTree(child,visitor);
}

export function inspectCrawledHtml(html,pageUrl,origin){
 const doc=parse(html||'');
 let title='';
 let description='';
 let robotsMeta='';
 let canonicalHref='';
 let bodyNode=null;
 const h1=[];
 const internalLinks=[];
 const externalLinks=[];
 const seenInt=new Set();
 const seenExt=new Set();

 walkTree(doc,node=>{
  const tag=node.tagName;
  if(!tag)return;
  const attrs=attrMap(node);
  if(tag==='body'&&!bodyNode)bodyNode=node;
  if(tag==='title'&&!title)title=collectText(node).replace(/\s+/g,' ').trim();
  if(tag==='meta'){
   const name=(attrs.name||'').toLowerCase().trim();
   if(name==='description'&&!description)description=(attrs.content||'').trim();
   if(name==='robots'&&!robotsMeta)robotsMeta=(attrs.content||'').trim();
  }
  if(tag==='link'){
   const rels=(attrs.rel||'').toLowerCase().split(/\s+/);
   if(rels.includes('canonical')&&!canonicalHref&&attrs.href)canonicalHref=attrs.href;
  }
  if(tag==='h1'){
   const text=collectText(node).replace(/\s+/g,' ').trim();
   if(text)h1.push(text);
  }
  if(tag==='a'&&attrs.href){
   const trimmed=attrs.href.trim();
   if(!trimmed||trimmed.startsWith('#')||/^(?:mailto|tel|javascript|data|blob):/i.test(trimmed))return;
   const resolved=normalizeCrawlUrl(trimmed,pageUrl);
   if(!resolved)return;
   const targetOrigin=new URL(resolved).origin;
   const anchor=collectText(node).replace(/\s+/g,' ').trim();
   const rel=(attrs.rel||'').trim();
   if(targetOrigin===origin){
    if(!seenInt.has(resolved)){
     seenInt.add(resolved);
     internalLinks.push({url:resolved,anchor,rel});
    }
   }else if(!seenExt.has(resolved)){
    seenExt.add(resolved);
    externalLinks.push({url:resolved,anchor,rel});
   }
  }
 });

 const canonical=canonicalHref?(normalizeCrawlUrl(canonicalHref,pageUrl)||canonicalHref.trim()):'';
 const bodyText=collectText(bodyNode||doc).replace(/\s+/g,' ').trim();

 return {
  title,
  description,
  robotsMeta,
  canonical,
  h1,
  wordCount:countWords(bodyText),
  internalLinks,
  externalLinks
 };
}

export async function crawlSite(rawInput,{fetchImpl=fetch,lookupAll,waitImpl=ms=>new Promise(r=>setTimeout(r,ms)),renderer=null}={}){
 const input=crawlSiteSchema.parse(rawInput);
 const startParsed=await assertSafePublicUrl(input.startUrl,{lookupAll});
 const origin=startParsed.origin;
 const startNormalized=normalizeCrawlUrl(startParsed.href,origin);
 const headers={'user-agent':input.userAgent,accept:'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8'};

 let robots={rules:[],sitemaps:[],crawlDelayMs:null,status:null,error:null};
 if(input.respectRobots){
  try{
   const robRes=await safeFetchPage(`${origin}/robots.txt`,{fetchImpl,lookupAll,requireOrigin:origin,maxBytes:524288,timeoutMs:input.timeoutMs,headers});
   robots.status=robRes.status;
   if(robRes.status>=200&&robRes.status<300){
    const parsed=parseRobotsTxtForCrawler(robRes.text,input.userAgent);
    robots={...robots,...parsed};
   }
  }catch(err){
   robots.error=err.message;
  }
 }

 const effectiveDelayMs=robots.crawlDelayMs!==null?Math.max(input.crawlDelayMs,robots.crawlDelayMs):input.crawlDelayMs;

 const queue=[];
 const queuedOrVisited=new Set();
 const enqueue=(url,depth,source)=>{
  const norm=normalizeCrawlUrl(url,origin);
  if(!norm||queuedOrVisited.has(norm))return false;
  if(new URL(norm).origin!==origin)return false;
  if(depth>input.maxDepth)return false;
  if(queuedOrVisited.size>=input.maxPages*4)return false;
  queuedOrVisited.add(norm);
  queue.push({url:norm,depth,source});
  return true;
 };

 enqueue(startNormalized,0,'seed');

 const discoveredSitemaps=[];
 if(input.followSitemaps){
  const smQueue=[...(robots.sitemaps.length?robots.sitemaps:[`${origin}/sitemap.xml`])];
  const seenSitemaps=new Set();
  while(smQueue.length&&seenSitemaps.size<5){
   const smUrl=smQueue.shift();
   if(!smUrl||seenSitemaps.has(smUrl))continue;
   seenSitemaps.add(smUrl);
   try{
    const parsedSm=new URL(smUrl,origin);
    if(parsedSm.origin!==origin)continue;
    const smRes=await safeFetchPage(parsedSm.href,{fetchImpl,lookupAll,requireOrigin:origin,maxBytes:input.maxBytesPerPage,timeoutMs:input.timeoutMs,headers});
    discoveredSitemaps.push({url:parsedSm.href,status:smRes.status});
    if(smRes.status>=200&&smRes.status<300){
     const entries=extractSitemapEntries(smRes.text);
     for(const child of entries.childSitemaps)smQueue.push(child);
     for(const u of entries.urls){
      enqueue(u,1,'sitemap');
      if(queue.length>=input.maxPages)break;
     }
    }
   }catch(err){
    discoveredSitemaps.push({url:smUrl,status:0,error:err.message});
   }
  }
 }

 const pages=[];
 const blockedByRobots=[];
 const failedUrls=[];
 let active=0;
 let queueIdx=0;
 let lastRequestAt=0;

 async function processItem(item){
  const urlObj=new URL(item.url);
  if(input.respectRobots&&!isPathAllowedByRobots(`${urlObj.pathname}${urlObj.search}`,robots.rules)){
   blockedByRobots.push({url:item.url,depth:item.depth,source:item.source});
   return;
  }
  if(effectiveDelayMs>0){
   const elapsed=Date.now()-lastRequestAt;
   if(elapsed<effectiveDelayMs)await waitImpl(effectiveDelayMs-elapsed);
   lastRequestAt=Date.now();
  }
  try{
   const res=await safeFetchPage(item.url,{
    fetchImpl,
    lookupAll,
    requireOrigin:origin,
    maxBytes:input.maxBytesPerPage,
    timeoutMs:input.timeoutMs,
    headers,
    acceptContentTypes:['text/html','application/xhtml+xml']
   });
   const inspected=res.skippedNonHtml||!res.text?{
    title:'',description:'',robotsMeta:'',canonical:'',h1:[],wordCount:0,internalLinks:[],externalLinks:[]
   }:inspectCrawledHtml(res.text,res.finalUrl,origin);

   pages.push({
    url:item.url,
    finalUrl:res.finalUrl,
    depth:item.depth,
    source:item.source,
    status:res.status,
    ttfbMs:res.ttfbMs,
    contentType:res.contentType,
    byteLength:res.byteLength||0,
    encoding:res.encoding??null,
    redirectChain:res.redirectChain,
    xRobotsTag:res.headers['x-robots-tag']||'',
    cacheControl:res.headers['cache-control']||'',
    strictTransportSecurity:res.headers['strict-transport-security']||'',
    ...inspected,
    html:res.text||''
   });

   if(res.status>=200&&res.status<300&&item.depth<input.maxDepth){
    for(const link of inspected.internalLinks){
     enqueue(link.url,item.depth+1,item.url);
    }
   }
  }catch(err){
   failedUrls.push({
    url:item.url,
    depth:item.depth,
    code:err instanceof NetworkGuardError?err.code:'fetch_failed',
    error:err.message
   });
  }
 }

 while(queueIdx<queue.length&&pages.length<input.maxPages){
  const batch=[];
  while(batch.length<input.concurrency&&queueIdx<queue.length&&(pages.length+batch.length)<input.maxPages){
   batch.push(queue[queueIdx++]);
  }
  if(!batch.length)break;
  active+=batch.length;
  await Promise.all(batch.map(item=>processItem(item)));
  active-=batch.length;
 }

 const statusCounts={};
 for(const p of pages){
  const bucket=`${Math.floor(p.status/100)}xx`;
  statusCounts[bucket]=(statusCounts[bucket]||0)+1;
 }

 const baseReport={
  ok:failedUrls.every(f=>f.code!=='blocked_private_ip'),
  summary:{
   origin,
   startUrl:startNormalized,
   crawledPages:pages.length,
   blockedByRobotsCount:blockedByRobots.length,
   failedCount:failedUrls.length,
   discoveredCount:queuedOrVisited.size,
   maxPages:input.maxPages,
   maxDepth:input.maxDepth,
   crawlDelayMs:effectiveDelayMs,
   statusCounts
  },
  robots:{status:robots.status,crawlDelayMs:robots.crawlDelayMs,sitemaps:robots.sitemaps,error:robots.error},
  sitemaps:discoveredSitemaps,
  pages,
  blockedByRobots,
  failedUrls
 };

 baseReport.profile=profileCrawlResult(baseReport);
 baseReport.anomalies=classifyCrawlAnomalies(baseReport);
 if(input.renderJs){
  baseReport.renderDiff=await renderAndDiffCrawlPages(pages,{
   maxRenderPages:input.maxRenderPages,
   timeoutMs:input.timeoutMs,
   lookupAll,
   requireOrigin:origin,
   renderer
  });
 }
 baseReport.ok=baseReport.ok&&baseReport.profile.ok&&baseReport.anomalies.ok&&(!baseReport.renderDiff||baseReport.renderDiff.ok);
 return baseReport;
}
