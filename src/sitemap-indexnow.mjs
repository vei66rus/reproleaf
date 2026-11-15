import {parse} from 'parse5';
import {z} from 'zod';
import {auditHreflangMatrix} from './hreflang-audit.mjs';
import {assertSafePublicUrl} from './network-guard.mjs';

const crawlHreflangPageSchema=z.object({
 url:z.string().url().max(2048),
 statusCode:z.number().int().min(100).max(599).optional(),
 html:z.string().max(1048576).optional(),
 htmlLang:z.string().max(32).optional(),
 canonical:z.string().max(2048).optional(),
 alternates:z.array(z.object({
  hreflang:z.string().min(1).max(32),
  href:z.string().url().max(2048)
 }).strict()).max(100).optional()
}).strict();

export const liveCrawlHreflangSchema=z.object({
 pages:z.array(crawlHreflangPageSchema).min(1).max(500)
}).strict();

export const segmentedSitemapSchema=z.object({
 siteUrl:z.string().url().max(2048),
 urls:z.array(z.object({
  loc:z.string().url().max(2048),
  lastmod:z.string().max(64).optional(),
  changefreq:z.enum(['always','hourly','daily','weekly','monthly','yearly','never']).optional(),
  priority:z.number().min(0).max(1).optional()
 }).strict()).min(1).max(200000),
 maxUrlsPerFile:z.number().int().min(1).max(50000).default(50000),
 sitemapBasePath:z.string().max(200).default('/')
}).strict();

export const indexNowSchema=z.object({
 host:z.string().min(1).max(253),
 key:z.string().regex(/^[A-Za-z0-9-]{8,128}$/),
 keyLocation:z.string().url().max(2048).optional(),
 urls:z.array(z.string().url().max(2048)).min(1).max(10000),
 endpoint:z.string().url().max(512).default('https://api.indexnow.org/indexnow'),
 allowNetwork:z.boolean().default(false)
}).strict();

function getAttr(node,name){
 const attr=(node.attrs||[]).find(a=>a.name.toLowerCase()===name.toLowerCase());
 return attr?attr.value:'';
}

function walkNodes(node,visitor){
 visitor(node);
 for(const child of node.childNodes||[])walkNodes(child,visitor);
}

function extractAlternatesFromHtml(html,baseUrl){
 const doc=parse(html);
 let htmlLang;
 let canonical;
 const alternates=[];

 walkNodes(doc,node=>{
  if(node.tagName==='html'){
   const lang=getAttr(node,'lang').trim();
   if(lang)htmlLang=lang;
  }
  if(node.tagName==='link'){
   const rels=(getAttr(node,'rel')||'').toLowerCase().trim().split(/\s+/);
   const href=getAttr(node,'href').trim();
   if(!href)return;
   if(rels.includes('canonical')&&!canonical){
    try{canonical=new URL(href,baseUrl).href;}catch{}
   }
   if(rels.includes('alternate')){
    const hl=getAttr(node,'hreflang').trim();
    if(hl){
     try{alternates.push({hreflang:hl,href:new URL(href,baseUrl).href});}catch{}
    }
   }
  }
 });
 return {htmlLang,canonical,alternates};
}

export function auditLiveCrawlHreflang(rawInput){
 const parsed=liveCrawlHreflangSchema.parse(rawInput);
 const statusByUrl=new Map();
 const normalizedPages=[];

 for(const page of parsed.pages){
  if(typeof page.statusCode==='number')statusByUrl.set(page.url,page.statusCode);
  let htmlLang=page.htmlLang;
  let canonical=page.canonical;
  let alternates=page.alternates;
  if(page.html&&!alternates){
   const ext=extractAlternatesFromHtml(page.html,page.url);
   htmlLang=htmlLang||ext.htmlLang;
   canonical=canonical||ext.canonical;
   alternates=ext.alternates;
  }
  normalizedPages.push({
   url:page.url,
   ...(htmlLang?{htmlLang}:{}),
   ...(canonical?{canonical}:{}),
   alternates:alternates||[]
  });
 }

 const matrixResult=auditHreflangMatrix({pages:normalizedPages});
 const extraFindings=[];
 for(const p of normalizedPages){
  for(const alt of p.alternates){
   const st=statusByUrl.get(alt.href);
   if(typeof st==='number'&&st>=400){
    extraFindings.push({
     code:'HREFLANG_TARGET_NON_200',
     severity:'error',
     url:p.url,
     target:alt.href,
     statusCode:st,
     message:`Hreflang alternate "${alt.href}" returned HTTP ${st} during live crawl.`,
     recommendation:'Point hreflang alternates exclusively to indexable HTTP 200 canonical pages.'
    });
   }
  }
 }

 const findings=[...matrixResult.findings,...extraFindings];
 return {
  ok:findings.every(f=>f.severity!=='error'),
  summary:{
   ...matrixResult.summary,
   liveNon200Alternates:extraFindings.length
  },
  matrix:matrixResult.matrix,
  findings
 };
}

function escapeXml(value){
 return String(value)
  .replace(/&/g,'&amp;')
  .replace(/</g,'&lt;')
  .replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;')
  .replace(/'/g,'&apos;');
}

export function buildSegmentedSitemaps(rawInput){
 const parsed=segmentedSitemapSchema.parse(rawInput);
 const siteOrigin=new URL(parsed.siteUrl).origin;
 const deduped=[];
 const seen=new Set();

 for(const entry of parsed.urls){
  const u=new URL(entry.loc);
  if(u.origin!==siteOrigin){
   throw Error(`Sitemap entry "${entry.loc}" does not match siteUrl origin "${siteOrigin}".`);
  }
  if(!seen.has(u.href)){
   seen.add(u.href);
   deduped.push({...entry,loc:u.href});
  }
 }

 const files=[];
 const basePath=parsed.sitemapBasePath.endsWith('/')?parsed.sitemapBasePath:`${parsed.sitemapBasePath}/`;
 for(let i=0;i<deduped.length;i+=parsed.maxUrlsPerFile){
  const chunk=deduped.slice(i,i+parsed.maxUrlsPerFile);
  const idx=Math.floor(i/parsed.maxUrlsPerFile)+1;
  const filename=`sitemap-${idx}.xml`;
  const itemsXml=chunk.map(item=>{
   const parts=[`<loc>${escapeXml(item.loc)}</loc>`];
   if(item.lastmod)parts.push(`<lastmod>${escapeXml(item.lastmod)}</lastmod>`);
   if(item.changefreq)parts.push(`<changefreq>${item.changefreq}</changefreq>`);
   if(typeof item.priority==='number')parts.push(`<priority>${item.priority.toFixed(1)}</priority>`);
   return `  <url>${parts.join('')}</url>`;
  }).join('\n');
  const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${itemsXml}\n</urlset>\n`;
  files.push({
   filename,
   loc:`${siteOrigin}${basePath}${filename}`,
   urlCount:chunk.length,
   xml
  });
 }

 const indexItems=files.map(f=>`  <sitemap><loc>${escapeXml(f.loc)}</loc></sitemap>`).join('\n');
 const indexXml=`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexItems}\n</sitemapindex>\n`;

 return {
  ok:true,
  summary:{
   siteOrigin,
   totalUrls:deduped.length,
   maxUrlsPerFile:parsed.maxUrlsPerFile,
   shardCount:files.length
  },
  indexFilename:'sitemap.xml',
  indexXml,
  files
 };
}

export async function pushIndexNow(rawInput,runtime={}){
 const parsed=indexNowSchema.parse(rawInput);
 if(!parsed.allowNetwork){
  throw Error('IndexNow submission requires explicit allowNetwork: true (--allow-network).');
 }
 const endpointUrl=new URL(parsed.endpoint);
 if(endpointUrl.protocol!=='https:')throw Error('IndexNow endpoint must use HTTPS.');
 await assertSafePublicUrl(parsed.endpoint,{lookupAll:runtime.lookupAll,requireOrigin:false});

 const hostLower=parsed.host.toLowerCase();
 for(const rawUrl of parsed.urls){
  const parsedUrl=new URL(rawUrl);
  if(parsedUrl.hostname.toLowerCase()!==hostLower){
   throw Error(`IndexNow URL "${rawUrl}" hostname does not match declared host "${parsed.host}".`);
  }
  await assertSafePublicUrl(rawUrl,{lookupAll:runtime.lookupAll,requireOrigin:false});
 }

 const keyLocation=parsed.keyLocation||`https://${parsed.host}/${parsed.key}.txt`;
 await assertSafePublicUrl(keyLocation,{lookupAll:runtime.lookupAll,requireOrigin:false});

 const payload={
  host:parsed.host,
  key:parsed.key,
  keyLocation,
  urlList:parsed.urls
 };

 const fetchFn=runtime.fetchImpl||fetch;
 const response=await fetchFn(parsed.endpoint,{
  method:'POST',
  redirect:'manual',
  headers:{'content-type':'application/json; charset=utf-8'},
  body:JSON.stringify(payload),
  signal:AbortSignal.timeout(10000)
 });

 const accepted=response.status===200||response.status===202;
 return {
  ok:accepted,
  endpoint:parsed.endpoint,
  host:parsed.host,
  submittedUrls:parsed.urls.length,
  status:response.status,
  message:accepted?'IndexNow submission accepted.':`IndexNow endpoint returned HTTP ${response.status}.`
 };
}
