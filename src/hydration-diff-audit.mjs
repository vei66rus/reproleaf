import {z} from 'zod';
import {parse} from 'parse5';

export const hydrationDiffSchema=z.object({
 rawHtml:z.string().min(1).max(1000000),
 renderedHtml:z.string().min(1).max(1000000),
 url:z.string().url().max(2048).optional()
}).strict();

function getAttr(node,name){
 const attr=(node.attrs||[]).find(a=>a.name.toLowerCase()===name);
 return attr?attr.value.trim():'';
}

function collectText(node,skipTags=new Set(['script','style','noscript','template'])){
 if(!node)return '';
 if(node.nodeName==='#text')return node.value||'';
 if(skipTags.has((node.nodeName||'').toLowerCase()))return '';
 return (node.childNodes||[]).map(c=>collectText(c,skipTags)).join(' ');
}

function walkNodes(node,visit){
 if(!node)return;
 visit(node);
 for(const child of node.childNodes||[])walkNodes(child,visit);
}

function extractSnapshot(html){
 const doc=parse(html);
 let title='';
 const canonicals=[];
 const robots=[];
 const h1=[];
 let headingCount=0;
 let jsonLdCount=0;
 let linkCount=0;
 let bodyNode=null;

 walkNodes(doc,node=>{
  const tag=(node.nodeName||'').toLowerCase();
  if(tag==='body'&&!bodyNode)bodyNode=node;
  else if(tag==='title'&&!title)title=collectText(node,new Set()).replace(/\s+/g,' ').trim();
  else if(tag==='link'){
   const rel=getAttr(node,'rel').toLowerCase().split(/\s+/);
   if(rel.includes('canonical')){
    const href=getAttr(node,'href');
    if(href)canonicals.push(href);
   }
  }else if(tag==='meta'){
   const name=getAttr(node,'name').toLowerCase();
   if(name==='robots'||name==='googlebot'){
    const content=getAttr(node,'content').toLowerCase();
    if(content)robots.push(`${name}:${content}`);
   }
  }else if(/^h[1-6]$/.test(tag)){
   headingCount+=1;
   if(tag==='h1'){
    const text=collectText(node).replace(/\s+/g,' ').trim();
    if(text)h1.push(text);
   }
  }else if(tag==='script'){
   const type=getAttr(node,'type').toLowerCase().split(';')[0].trim();
   if(type==='application/ld+json')jsonLdCount+=1;
  }else if(tag==='a'){
   if(getAttr(node,'href'))linkCount+=1;
  }
 });

 const visibleText=collectText(bodyNode||doc).replace(/\s+/g,' ').trim();
 const wordCount=visibleText?visibleText.split(/\s+/).length:0;

 return {
  title,
  canonical:canonicals[0]||'',
  robots:robots.sort(),
  h1,
  headingCount,
  jsonLdCount,
  linkCount,
  wordCount
 };
}

export function auditRawVsRenderedHtml(rawInput){
 const parsed=hydrationDiffSchema.parse(rawInput);
 const raw=extractSnapshot(parsed.rawHtml);
 const rendered=extractSnapshot(parsed.renderedHtml);
 const findings=[];

 if(raw.wordCount<30&&rendered.wordCount>=150){
  findings.push({
   code:'HYDRATION_CSR_SHELL_EMPTY',
   severity:'error',
   message:`Raw HTML has only ${raw.wordCount} visible words while rendered DOM has ${rendered.wordCount} words.`,
   recommendation:'Server-render or pre-render primary content so non-JS crawlers and AI fetchers receive full text.'
  });
 }

 if(raw.h1.length===0&&rendered.h1.length>0){
  findings.push({
   code:'HYDRATION_MISSING_H1_IN_RAW',
   severity:'error',
   message:'H1 is present in rendered DOM but missing from raw server HTML.',
   recommendation:'Render the primary H1 heading in initial SSR HTML.'
  });
 }

 if(raw.title!==rendered.title){
  findings.push({
   code:'HYDRATION_TITLE_MUTATED',
   severity:'warning',
   message:`Document title changed during hydration ("${raw.title}" -> "${rendered.title}").`,
   recommendation:'Keep SSR <title> identical to client-hydrated title.'
  });
 }

 if(raw.canonical!==rendered.canonical){
  findings.push({
   code:'HYDRATION_CANONICAL_MUTATED',
   severity:'error',
   message:`Canonical URL changed during hydration ("${raw.canonical}" -> "${rendered.canonical}").`,
   recommendation:'Emit the final canonical link tag in server HTML and avoid client-side overrides.'
  });
 }

 if(JSON.stringify(raw.robots)!==JSON.stringify(rendered.robots)){
  findings.push({
   code:'HYDRATION_ROBOTS_MUTATED',
   severity:'error',
   message:`Robots meta directives changed during hydration (${raw.robots.join(', ')||'none'} -> ${rendered.robots.join(', ')||'none'}).`,
   recommendation:'Do not add or alter meta robots directives client-side.'
  });
 }

 if(raw.jsonLdCount===0&&rendered.jsonLdCount>0){
  findings.push({
   code:'HYDRATION_SCHEMA_CLIENT_ONLY',
   severity:'warning',
   message:`${rendered.jsonLdCount} JSON-LD block(s) injected client-side only.`,
   recommendation:'Inline Schema.org JSON-LD in initial server HTML.'
  });
 }

 if(raw.linkCount===0&&rendered.linkCount>=5){
  findings.push({
   code:'HYDRATION_LINKS_CLIENT_ONLY',
   severity:'warning',
   message:`Raw HTML contains 0 links while rendered DOM exposes ${rendered.linkCount} links.`,
   recommendation:'Render navigation and internal links in SSR HTML for crawler discovery.'
  });
 }

 return {
  ok:findings.every(f=>f.severity!=='error'),
  url:parsed.url??null,
  raw,
  rendered,
  summary:{
   wordRatio:rendered.wordCount>0?Number((raw.wordCount/rendered.wordCount).toFixed(4)):1,
   errors:findings.filter(f=>f.severity==='error').length,
   warnings:findings.filter(f=>f.severity==='warning').length
  },
  findings
 };
}
