import {parse} from 'parse5';
import {blogSchema} from './blog-graph.mjs';
const attr=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;
export function inventoryFromHtml(documents,siteUrl){
 const origin=new URL(siteUrl).origin;
 const pages=documents.map(({html,url})=>{
  if(typeof html!=='string'||Buffer.byteLength(html)>2*1048576)throw Error('Each HTML document must be at most 2 MiB.');
  const parsed=parse(html),links=[];let title='',h1='',locale='',main=null,article=null,baseHref=null;
  function text(node){if(['script','style','noscript','template','form'].includes(node.tagName))return '';if(node.nodeName==='#text')return node.value;return(node.childNodes||[]).map(text).join(' ');}
  function visit(node){if(node.tagName==='base'&&baseHref===null&&attr(node,'href')!==undefined)baseHref=attr(node,'href');if(node.tagName==='title'&&!title)title=text(node).trim();if(node.tagName==='h1'&&!h1)h1=text(node).trim();if(node.tagName==='html')locale=attr(node,'lang')||'';if(node.tagName==='main'&&!main)main=node;if(node.tagName==='article'&&!article)article=node;if(['script','style','noscript','template','form'].includes(node.tagName))return;if(node.tagName==='a'&&attr(node,'href')!==undefined)links.push({href:attr(node,'href'),anchor:text(node).trim().slice(0,1000)});for(const child of node.childNodes||[])visit(child);}
  visit(parsed);if(baseHref!==null){const base=new URL(baseHref,url);for(const link of links){try{link.href=new URL(link.href,base).href;}catch{}}}const body=text(article||main||parsed).replace(/\s+/g,' ').trim();
  return {url,title,h1,...(locale?{locale}:{}),kind:article?'article':'other',textScope:body.length>50000?'excerpt':'full',text:body.slice(0,50000),links};
 });
 return blogSchema.parse({schemaVersion:1,siteUrl:origin,coverage:'Explicitly supplied static HTML. No JavaScript execution, crawling, authentication or external requests. Client-rendered links and text can be absent.',pages});
}
