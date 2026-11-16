import {z} from 'zod';
import {blogSchema} from './blog-graph.mjs';
import {captureHtmlMetadata} from './html-metadata-facts.mjs';

const pageSchema=z.object({url:z.string().max(2048),finalUrl:z.string().max(2048).optional(),status:z.number().int().min(100).max(599),contentType:z.string().max(200).nullable().optional(),html:z.string().max(8388608).nullable().optional(),title:z.string().max(1000).optional(),h1:z.array(z.string().max(1000)).max(100).optional(),canonical:z.string().max(2048).optional(),robotsMeta:z.string().max(2000).optional(),internalLinks:z.array(z.object({url:z.string().max(2048),anchor:z.string().max(1000).optional()})).max(1000).nullable().optional(),externalLinks:z.array(z.object({url:z.string().max(2048),anchor:z.string().max(1000).optional()})).max(1000).nullable().optional()});
const crawlSchema=z.object({summary:z.object({origin:z.string().max(2048)}),pages:z.array(pageSchema).min(1).max(1000),failedUrls:z.array(z.unknown()).max(1000).optional(),blockedByRobots:z.array(z.unknown()).max(1000).optional()});

function httpUrl(raw){
 if(/[\s\u0000-\u001f\u007f]/u.test(raw))throw Error('Inventory URL contains whitespace or control characters.');
 const url=new URL(raw);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash)throw Error('Inventory requires HTTP(S) URLs without credentials or fragments.');
 return url;
}

/** Convert saved static-HTML crawl observations; no fetch or source HTML export. */
export function crawlToBlogInventory(input){
 const crawl=crawlSchema.parse(input),origin=httpUrl(crawl.summary.origin).origin;
 if(crawl.summary.origin!==origin)throw Error('The saved crawl origin must be an exact HTTP(S) origin.');
 const seen=new Set(),consumerKeys=new Set();
 const pages=crawl.pages.map(page=>{
  if(httpUrl(page.url).origin!==origin)throw Error('Every requested URL must belong to the saved crawl origin.');
  const url=httpUrl(page.finalUrl||page.url);
  if(url.origin!==origin)throw Error('Every observed final URL must belong to the saved crawl origin.');
  if(seen.has(url.href))throw Error('Multiple crawl records resolve to the same final URL. Review aliases before importing.');
  seen.add(url.href);
  const consumerUrl=new URL(url.href);consumerUrl.pathname=consumerUrl.pathname.replace(/\/+$/,'')||'/';
  if(consumerKeys.has(consumerUrl.href))throw Error('Distinct final URLs collide under the link inventory trailing-slash normalization. Review these URLs before importing; they were not merged.');
  consumerKeys.add(consumerUrl.href);
  const html=/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(page.contentType),bodyIncomplete=[204,205,206].includes(page.status),contentObserved=html&&page.status>=200&&page.status<300&&!bodyIncomplete;
  const metadata={httpStatus:page.status,source:'supplied',internalLinksObserved:contentObserved&&Array.isArray(page.internalLinks),externalLinksObserved:contentObserved&&Array.isArray(page.externalLinks)};
  let capturedTitle;
  if(!contentObserved)metadata.htmlFacts={status:'not-processed',reason:html&&bodyIncomplete?'incomplete-response':'body-not-observed'};
  else if(contentObserved&&/^application\/xhtml\+xml(?:\s*;|$)/i.test(page.contentType))metadata.htmlFacts={status:'not-processed',reason:'unsupported-document-type'};
  if(contentObserved&&!metadata.htmlFacts&&typeof page.html==='string'){const captured=captureHtmlMetadata(page.html);metadata.htmlFacts=captured.facts;if(captured.facts.status==='observed')capturedTitle=captured.title??'';}
  if(contentObserved&&typeof page.canonical==='string')metadata.canonical=page.canonical;
  if(metadata.htmlFacts?.status==='observed'&&metadata.htmlFacts.canonicalCount>1)metadata.canonical=null;
  if(contentObserved&&typeof page.robotsMeta==='string')metadata.robotsMeta=page.robotsMeta;
  const links=contentObserved?[...(page.internalLinks||[]),...(page.externalLinks||[])].map(link=>({href:httpUrl(link.url).href,anchor:link.anchor||'',region:'unknown'})):[];
  if(links.length>1000)throw Error('A page exceeds the 1000-link inventory limit.');
  return {url:url.href,title:contentObserved?(capturedTitle!==undefined?capturedTitle:page.title||''):'',kind:'other',textScope:'unknown',text:'',...(contentObserved&&page.h1?.length===1?{h1:page.h1[0]}:{}),metadata,links};
 });
 const result=blogSchema.parse({schemaVersion:1,siteUrl:origin+'/',coverage:`Saved static-HTML crawl observations: ${pages.length} final URLs; failed requests: ${crawl.failedUrls?.length??'unknown'}; robots-blocked requests: ${crawl.blockedByRobots?.length??'unknown'}. No new requests. Failed requests are not page records. Redirect aliases must be reviewed before import. No article classification, locale, main-content text or link-region inference. Raw HTML and response headers are excluded. Optional HTML facts are extracted only from supplied bounded successful complete-representation HTML bodies; HTTP204/205/206 body fields, omitted and oversized bodies remain unknown. XHTML keeps explicit supplied metadata, but its DOM facts are not processed by the HTML parser. Empty links arrays for such rows satisfy the inventory format and do not establish observed absence. Internal/external link availability is declared separately from HTML facts; omitted arrays remain unknown even when source HTML is present. Review URL paths and queries before sharing.`,evidenceScope:'stored-links',pages});
 if(Buffer.byteLength(JSON.stringify(result,null,2),'utf8')>5*1048576)throw Error('Converted inventory exceeds 5 MiB. Use a smaller saved crawl.');
 return result;
}
