import {parse} from 'parse5';
import {blogSchema} from './blog-graph.mjs';
import {extractHtmlMetadataFacts} from './html-metadata-facts.mjs';
const attr=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;
export function inventoryFromHtml(documents,siteUrl){
 const origin=new URL(siteUrl).origin;
 const pages=documents.map(({html,url})=>{
  if(typeof html!=='string'||Buffer.byteLength(html)>2*1048576)throw Error('Each HTML document must be at most 2 MiB.');
  const parsed=parse(html),links=[],canonicals=[],robots=[];let title='',titleSeen=false,h1='',locale='',main=null,article=null,baseHref=null;
  function text(node){if(['script','style','noscript','template','form'].includes(node.tagName))return '';if(node.nodeName==='#text')return node.value;return(node.childNodes||[]).map(text).join(' ');}
  function visit(node){
   const html=node.namespaceURI==='http://www.w3.org/1999/xhtml';
   if(html&&node.tagName==='base'&&baseHref===null&&attr(node,'href')!==undefined)baseHref=attr(node,'href');
   if(html&&node.tagName==='title'&&!titleSeen){titleSeen=true;title=text(node).trim();}
   if(html&&node.tagName==='h1'&&!h1)h1=text(node).trim();
   if(html&&node.tagName==='html')locale=attr(node,'lang')||'';
   if(html&&node.tagName==='link'&&(attr(node,'rel')||'').toLowerCase().split(/\s+/).includes('canonical')&&attr(node,'href')!==undefined)canonicals.push(attr(node,'href'));
   if(html&&node.tagName==='meta'&&(attr(node,'name')||'').toLowerCase()==='robots')robots.push(attr(node,'content')||'');
   if(html&&node.tagName==='main'&&!main)main=node;if(html&&node.tagName==='article'&&!article)article=node;
   if(['script','style','noscript','template','form'].includes(node.tagName))return;
   if(node.tagName==='a'&&attr(node,'href')!==undefined)links.push({href:attr(node,'href'),anchor:text(node).trim().slice(0,1000)});
   for(const child of node.childNodes||[])visit(child);
  }
  visit(parsed);let effectiveBase=url;if(baseHref!==null){const base=new URL(baseHref,url);effectiveBase=base.href;for(const link of links){try{link.href=new URL(link.href,base).href;}catch{}}}const body=text(article||main||parsed).replace(/\s+/g,' ').trim();
  let canonical=canonicals.length===0?'':null;if(canonicals.length===1){canonical=canonicals[0];try{canonical=new URL(canonical,effectiveBase).href;}catch{try{new URL(canonical);}catch{if(!['http:','https:'].includes(new URL(effectiveBase).protocol))canonical=null;}}}
  return {url,title,h1,...(locale?{locale}:{}),metadata:{source:'html',canonical,robotsMeta:robots.join(', '),htmlFacts:extractHtmlMetadataFacts(html,parsed)},kind:article?'article':'other',textScope:body.length>50000?'excerpt':'full',text:body.slice(0,50000),links};
 });
 return blogSchema.parse({schemaVersion:1,siteUrl:origin,coverage:'Explicitly supplied static HTML. No JavaScript execution, crawling, authentication or external requests. Client-rendered links and text can be absent.',pages});
}
