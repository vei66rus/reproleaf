import {parse} from 'parse5';
import {assertMarkupSourceBudget,assertMarkupTreeBudget,MARKUP_CORE_LIMITS} from './markup-input-guards.mjs';

const attr=(node,name)=>node.attrs?.find(item=>item.name===name)?.value;
const inert=new Set(['script','style','noscript','template']);
const htmlNamespace='http://www.w3.org/1999/xhtml';
function visibleText(node){
 let result='';const stack=[node];
 while(stack.length){const current=stack.pop();if(inert.has(current.tagName))continue;if(current.nodeName==='#text')result+=current.value||'';for(let i=(current.childNodes?.length||0)-1;i>=0;i--)stack.push(current.childNodes[i]);}
 return result.trim();
}

/** Capture static element facts only; never infer them from shortened crawl fields. */
export function captureHtmlMetadata(html,document=null){
 if(typeof html!=='string')throw Error('HTML_FACTS_SOURCE_REQUIRED');
 try{
  assertMarkupSourceBudget(html);const tree=document||parse(html);assertMarkupTreeBudget(tree);
  let titlePresent=false,titleSeen=false,title='',h1Count=0,canonicalCount=0;const descriptions=[];const stack=[tree];
  while(stack.length){
   const node=stack.pop();if(inert.has(node.tagName))continue;
   if(node.namespaceURI===htmlNamespace){
    if(node.tagName==='title'&&!titleSeen){titleSeen=true;title=visibleText(node);titlePresent=Boolean(title);}
    if(node.tagName==='h1')h1Count++;
    if(node.tagName==='link'&&(attr(node,'rel')||'').toLowerCase().split(/\s+/).includes('canonical'))canonicalCount++;
    if(node.tagName==='meta'&&(attr(node,'name')||'').trim().toLowerCase()==='description')descriptions.push((attr(node,'content')||'').trim());
   }
   for(let i=(node.childNodes?.length||0)-1;i>=0;i--)stack.push(node.childNodes[i]);
  }
  const nonempty=[...new Set(descriptions.filter(Boolean))];
  const description=nonempty.length===0?'':nonempty.length===1&&nonempty[0].length<=1000?nonempty[0]:null;
  return {facts:{status:'observed',titlePresent,description,h1Count,canonicalCount},title:title.length<=1000?title:null};
 }catch(error){
  if(error.message==='MARKUP_SIZE')return {facts:{status:'not-processed',reason:'size-limit'},title:null};
  if(error.message==='MARKUP_COMPLEX')return {facts:{status:'not-processed',reason:'complexity-limit'},title:null};
  throw error;
 }
}

export function extractHtmlMetadataFacts(html,document=null){return captureHtmlMetadata(html,document).facts;}

export const HTML_METADATA_FACTS_LIMITS=Object.freeze({bytes:MARKUP_CORE_LIMITS.bytes,nodes:MARKUP_CORE_LIMITS.htmlNodes,depth:MARKUP_CORE_LIMITS.htmlDepth,descriptionCharacters:1000});
