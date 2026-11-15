import {z} from 'zod';

const crawledPageProfileSchema=z.object({
 url:z.string().min(1),
 finalUrl:z.string().min(1).optional(),
 status:z.number().int().min(0).max(599),
 ttfbMs:z.number().nonnegative().default(0),
 contentType:z.string().default(''),
 redirectChain:z.array(z.object({
  url:z.string(),
  status:z.number().int(),
  location:z.string().optional()
 })).default([]),
 xRobotsTag:z.string().default(''),
 cacheControl:z.string().default(''),
 strictTransportSecurity:z.string().default(''),
 canonical:z.string().default(''),
 internalLinks:z.array(z.object({
  url:z.string(),
  anchor:z.string().default(''),
  rel:z.string().default('')
 })).default([]),
 externalLinks:z.array(z.object({
  url:z.string(),
  anchor:z.string().default(''),
  rel:z.string().default('')
 })).default([])
}).passthrough();

export const crawlProfilerInputSchema=z.object({
 summary:z.object({
  origin:z.string().url()
 }).passthrough().optional(),
 pages:z.array(crawledPageProfileSchema),
 failedUrls:z.array(z.object({
  url:z.string(),
  code:z.string().optional(),
  error:z.string().optional()
 })).default([])
}).passthrough();

function percentile(sorted,p){
 if(!sorted.length)return 0;
 const idx=Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*p)-1));
 return sorted[idx];
}

export function profileCrawlResult(rawCrawl,{slowTtfbMs=1000}={}){
 const parsed=crawlProfilerInputSchema.parse(rawCrawl);
 const origin=parsed.summary?.origin||(()=>{
  try{return new URL(parsed.pages[0]?.url||'').origin;}catch{return '';}
 })();

 const statusByUrl=new Map();
 const pageByUrl=new Map();
 for(const p of parsed.pages){
  statusByUrl.set(p.url,p.status);
  if(p.finalUrl)statusByUrl.set(p.finalUrl,p.status);
  pageByUrl.set(p.url,p);
 }

 const failedMap=new Map();
 for(const f of parsed.failedUrls)failedMap.set(f.url,f);

 const statusDistribution={'2xx':0,'3xx':0,'4xx':0,'5xx':0,other:0};
 const ttfbs=[];
 const slowPages=[];
 const xRobotsNoindex=[];
 const missingHsts=[];
 const noStoreCache=[];
 const redirectChains=[];
 const findings=[];

 for(const page of parsed.pages){
  const bucket=`${Math.floor(page.status/100)}xx`;
  if(Object.hasOwn(statusDistribution,bucket))statusDistribution[bucket]+=1;
  else statusDistribution.other+=1;

  ttfbs.push(page.ttfbMs);
  if(page.ttfbMs>=slowTtfbMs){
   slowPages.push({url:page.url,ttfbMs:page.ttfbMs,status:page.status});
   findings.push({
    code:'HTTP_SLOW_TTFB',
    severity:'warning',
    url:page.url,
    message:`Page TTFB was ${page.ttfbMs} ms (threshold ${slowTtfbMs} ms).`
   });
  }

  if(page.status>=400){
   findings.push({
    code:page.status>=500?'HTTP_SERVER_ERROR_5XX':'HTTP_CLIENT_ERROR_4XX',
    severity:'error',
    url:page.url,
    status:page.status,
    message:`Crawled URL returned HTTP ${page.status}.`
   });
  }

  if(page.redirectChain.length>0){
   const temporary=page.redirectChain.some(h=>h.status===302||h.status===303||h.status===307);
   redirectChains.push({
    url:page.url,
    finalUrl:page.finalUrl||page.url,
    hops:page.redirectChain.length,
    temporary,
    chain:page.redirectChain
   });
   if(page.redirectChain.length>1){
    findings.push({
     code:'HTTP_REDIRECT_CHAIN',
     severity:'warning',
     url:page.url,
     hops:page.redirectChain.length,
     message:`URL took ${page.redirectChain.length} redirect hops to resolve.`
    });
   }
   if(temporary){
    findings.push({
     code:'HTTP_TEMPORARY_REDIRECT',
     severity:'warning',
     url:page.url,
     message:'Temporary 302/303/307 redirect encountered in chain.'
    });
   }
  }

  if(/\b(?:noindex|none)\b/i.test(page.xRobotsTag)){
   xRobotsNoindex.push({url:page.url,xRobotsTag:page.xRobotsTag});
   findings.push({
    code:'HTTP_X_ROBOTS_NOINDEX',
    severity:'info',
    url:page.url,
    message:`X-Robots-Tag disables indexing (${page.xRobotsTag}).`
   });
  }

  if(page.url.startsWith('https://')&&!page.strictTransportSecurity){
   missingHsts.push(page.url);
  }
  if(page.status>=200&&page.status<300&&/\bno-store\b/i.test(page.cacheControl)){
   noStoreCache.push(page.url);
  }
 }

 const brokenDonors=new Map();
 const externalRefs=new Map();
 for(const page of parsed.pages){
  for(const link of page.internalLinks){
   const targetStatus=statusByUrl.get(link.url);
   const failed=failedMap.get(link.url);
   if((targetStatus!==undefined&&targetStatus>=400)||failed){
    if(!brokenDonors.has(link.url)){
     brokenDonors.set(link.url,{targetUrl:link.url,status:targetStatus??0,error:failed?.error||null,donors:[]});
    }
    const rec=brokenDonors.get(link.url);
    if(!rec.donors.includes(page.url))rec.donors.push(page.url);
   }
  }
  for(const ext of page.externalLinks){
   if(!externalRefs.has(ext.url))externalRefs.set(ext.url,[]);
   const donors=externalRefs.get(ext.url);
   if(!donors.includes(page.url))donors.push(page.url);
  }
 }

 const brokenInternalLinks=[...brokenDonors.values()];
 for(const broken of brokenInternalLinks){
  findings.push({
   code:'BROKEN_INTERNAL_LINK',
   severity:'error',
   url:broken.targetUrl,
   status:broken.status,
   donors:broken.donors,
   message:`Broken internal target HTTP ${broken.status} linked from ${broken.donors.length} page(s).`
  });
 }

 const canonicalIssues=[];
 for(const page of parsed.pages){
  if(!page.canonical||page.status>=400)continue;
  let canonicalUrl=page.canonical;
  try{
   canonicalUrl=new URL(page.canonical,page.url).href;
  }catch{
   canonicalIssues.push({code:'CANONICAL_INVALID_URL',url:page.url,canonical:page.canonical});
   findings.push({code:'CANONICAL_INVALID_URL',severity:'error',url:page.url,message:`Invalid canonical URL: ${page.canonical}`});
   continue;
  }
  if(origin&&new URL(canonicalUrl).origin!==origin){
   canonicalIssues.push({code:'CANONICAL_CROSS_ORIGIN',url:page.url,canonical:canonicalUrl});
   findings.push({code:'CANONICAL_CROSS_ORIGIN',severity:'warning',url:page.url,message:`Cross-origin canonical points to ${canonicalUrl}`});
   continue;
  }

  const normalizedCanonical=canonicalUrl.length>origin.length+1&&canonicalUrl.endsWith('/')?canonicalUrl.slice(0,-1):canonicalUrl;
  const targetStatus=statusByUrl.get(normalizedCanonical);
  if(targetStatus!==undefined&&targetStatus>=400){
   canonicalIssues.push({code:'CANONICAL_TO_ERROR_PAGE',url:page.url,canonical:normalizedCanonical,targetStatus});
   findings.push({code:'CANONICAL_TO_ERROR_PAGE',severity:'error',url:page.url,message:`Canonical points to HTTP ${targetStatus}: ${normalizedCanonical}`});
   continue;
  }

  const visited=new Set([page.url]);
  let curr=normalizedCanonical;
  let hops=0;
  let looped=false;
  while(curr&&pageByUrl.has(curr)){
   const nextPage=pageByUrl.get(curr);
   if(!nextPage.canonical)break;
   let nextCanon=nextPage.canonical;
   try{nextCanon=new URL(nextCanon,curr).href;}catch{break;}
   const normNext=nextCanon.length>origin.length+1&&nextCanon.endsWith('/')?nextCanon.slice(0,-1):nextCanon;
   if(normNext===curr)break;
   hops+=1;
   if(visited.has(normNext)){
    looped=true;
    break;
   }
   visited.add(normNext);
   curr=normNext;
   if(hops>10){looped=true;break;}
  }

  if(looped){
   canonicalIssues.push({code:'CANONICAL_LOOP',url:page.url,canonical:normalizedCanonical});
   findings.push({code:'CANONICAL_LOOP',severity:'error',url:page.url,message:`Canonical loop detected starting from ${page.url}`});
  }else if(hops>=1&&normalizedCanonical!==page.url){
   canonicalIssues.push({code:'CANONICAL_CHAIN',url:page.url,canonical:normalizedCanonical,hops:hops+1});
   findings.push({code:'CANONICAL_CHAIN',severity:'warning',url:page.url,message:`Canonical chain (${hops+1} hops) starting from ${page.url}`});
  }
 }

 const sortedTtfb=[...ttfbs].sort((a,b)=>a-b);
 const avgTtfbMs=sortedTtfb.length?Math.round(sortedTtfb.reduce((s,v)=>s+v,0)/sortedTtfb.length):0;
 const p95TtfbMs=percentile(sortedTtfb,0.95);
 const maxTtfbMs=sortedTtfb.length?sortedTtfb[sortedTtfb.length-1]:0;
 const errors=findings.filter(f=>f.severity==='error').length;
 const warnings=findings.filter(f=>f.severity==='warning').length;

 return {
  ok:errors===0,
  summary:{
   totalPages:parsed.pages.length,
   errors,
   warnings,
   statusDistribution,
   avgTtfbMs,
   p95TtfbMs,
   maxTtfbMs,
   slowPageCount:slowPages.length,
   redirectChainCount:redirectChains.length,
   brokenInternalLinkCount:brokenInternalLinks.length,
   canonicalIssueCount:canonicalIssues.length,
   externalLinkCount:externalRefs.size,
   missingHstsCount:missingHsts.length,
   noStoreCacheCount:noStoreCache.length
  },
  slowPages,
  redirectChains,
  xRobotsNoindex,
  brokenInternalLinks,
  canonicalIssues,
  externalLinkTargets:[...externalRefs.entries()].slice(0,200).map(([url,donors])=>({url,donorsCount:donors.length,donors})),
  missingHsts:missingHsts.slice(0,200),
  findings
 };
}
