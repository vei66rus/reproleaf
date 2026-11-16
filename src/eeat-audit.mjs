import {parse} from 'parse5';
import {z} from 'zod';

export const eeatAuditSchema=z.object({
 html:z.string().min(1).max(1048576),
 url:z.string().url().max(2048).optional()
}).strict();

const authorLinkPattern=/(?:^|\/)(?:author|authors|editor|автор)(?:\/|$)/i;
const trustLinkPattern=/(?:^|\/)(?:about|contact|editorial|methodology|privacy|terms|disclaimer|контакты|о-нас|редакция|методика|политика)(?:\/|$)/i;

function getAttr(node,name){
 const attr=(node.attrs||[]).find(a=>a.name.toLowerCase()===name.toLowerCase());
 return attr?attr.value:'';
}

function collectText(node,skipTags=new Set(['script','style','noscript','template'])){
 const parts=[],stack=[{node,depth:0}];let visited=0;
 while(stack.length){
  const {node:current,depth}=stack.pop();if(!current)continue;
  if(++visited>30000||depth>256)throw Error('HTML structure exceeds the review limits (30000 nodes, depth 256).');
  if(isHidden(current)||skipTags.has(current.tagName))continue;
  if(current.nodeName==='#text'){parts.push(current.value||'');continue;}
  const children=current.childNodes||[];
  for(let index=children.length-1;index>=0;index--)stack.push({node:children[index],depth:depth+1});
 }
 return parts.join(' ');
}

function walkNodes(node,visitor){
 const stack=[{node,depth:0}];let visited=0;
 while(stack.length){
  const {node:current,depth}=stack.pop();
  if(++visited>30000||depth>256)throw Error('HTML structure exceeds the review limits (30000 nodes, depth 256).');
  if(isHidden(current))continue;
  visitor(current);
  const children=current.childNodes||[];
  for(let index=children.length-1;index>=0;index--)stack.push({node:children[index],depth:depth+1});
 }
}

function walkJsonObjects(value,visitor){
 const stack=[{value,depth:0}];let visited=0;
 while(stack.length){
  const current=stack.pop();if(!current.value||typeof current.value!=='object')continue;
  if(++visited>10000||current.depth>128)throw Error('JSON-LD structure exceeds the review limits.');
  if(!Array.isArray(current.value))visitor(current.value);
  for(const item of Object.values(current.value))stack.push({value:item,depth:current.depth+1});
 }
}

function hasText(v){
 return typeof v==='string'&&v.trim().length>0;
}

function isIsoDate(value){
 if(typeof value!=='string')return false;
 const match=value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)?)?$/);
 if(!match)return false;
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
 if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())return false;
 return Number.isFinite(Date.parse(value));
}

function isHidden(node){
 if(['template','noscript'].includes(node?.tagName))return true;
 if((node?.attrs||[]).some(a=>a.name==='hidden'||a.name==='inert'))return true;
 if(getAttr(node,'aria-hidden').trim().toLowerCase()==='true')return true;
 if(/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|content-visibility\s*:\s*hidden)\s*(?:!important)?\s*(?:;|$)/i.test(getAttr(node,'style')))return true;
 return false;
}

function safeReference(raw,base){
 try{
  const url=new URL(raw,base||'https://reproleaf.invalid');
  if(!['http:','https:'].includes(url.protocol))return null;
  url.username='';url.password='';url.search='';url.hash='';
  let pathname=url.pathname;
  try{pathname=decodeURIComponent(pathname);}catch{}
  let next=false;
  url.pathname=pathname.split(/[?#]/)[0].split('/').map(segment=>{
   const hide=next||/@/.test(segment)||/^(?:\d{1,3}\.){3}\d{1,3}$/.test(segment)||/^[a-f\d-]{24,}$/i.test(segment)||segment.length>80;
   next=/^(?:token|secret|password|api[-_]?key|session|access[-_]?token)$/i.test(segment);
   return hide?'[redacted]':segment.replace(/[\u0000-\u001f\u007f]/g,'');
  }).join('/');
  return /^https?:\/\//i.test(raw)?url.href:url.pathname;
 }catch{return null;}
}

export function auditEeatSignals(rawInput){
 const parsed=eeatAuditSchema.parse(rawInput);
 const doc=parse(parsed.html);
 const baseOrigin=parsed.url?new URL(parsed.url).origin:null;

 let metaAuthor='';
 let metaPublished='';
 let metaModified='';
 const authorElements=[];
 const timeDatetimes=[];
 const trustLinks=[];
 const primaryExternalSources=[];
 const absoluteHttpLinks=[];
 const schemaSignals={
  hasPerson:false,
  hasOrganization:false,
  hasSameAs:false,
  hasAuthorProp:false,
  hasReviewedBy:false,
  hasDatePublished:false,
  hasDateModified:false,
  types:new Set()
 };

 walkNodes(doc,node=>{
  const tag=node.tagName;
  if(!tag)return;
  if(isHidden(node))return;

  if(tag==='meta'){
   const name=(getAttr(node,'name')||getAttr(node,'property')||'').toLowerCase().trim();
   const content=getAttr(node,'content').trim();
   if(!content)return;
   if(name==='author')metaAuthor=content;
   if((name==='article:published_time'||name==='datepublished')&&isIsoDate(content))metaPublished=content;
   if((name==='article:modified_time'||name==='last-modified'||name==='datemodified')&&isIsoDate(content))metaModified=content;
  }

  if(tag==='time'){
   const dt=getAttr(node,'datetime').trim()||collectText(node).trim();
   if(isIsoDate(dt))timeDatetimes.push(dt);
  }

  if(tag==='a'){
   const href=getAttr(node,'href').trim();
   const rel=(getAttr(node,'rel')||'').toLowerCase();
   const text=collectText(node).replace(/\s+/g,' ').trim();
   if(rel.split(/\s+/).includes('author')||authorLinkPattern.test(href)){
    if(text)authorElements.push(text);
   }
   if(trustLinkPattern.test(href)){
    const safe=safeReference(href,parsed.url);if(safe)trustLinks.push({href:safe,text:text||safe});
   }
   if(/^https?:\/\//i.test(href)||href.startsWith('//')){
    try{
     const linkUrl=new URL(href,parsed.url||'https://reproleaf.invalid');
     const safe=safeReference(linkUrl.href,parsed.url);
     if(safe)absoluteHttpLinks.push(safe);
     if(safe&&baseOrigin&&linkUrl.origin!==baseOrigin)primaryExternalSources.push(safe);
    }catch{}
   }
  }

  if(tag==='span'||tag==='div'||tag==='p'||tag==='section'){
   const cls=(getAttr(node,'class')||'').toLowerCase();
   const itemprop=(getAttr(node,'itemprop')||'').toLowerCase();
   if(/\b(?:author|byline|reviewed-by|reviewer)\b/.test(cls)||itemprop==='author'){
    const txt=collectText(node).replace(/\s+/g,' ').trim();
    if(txt&&txt.length<=160)authorElements.push(txt);
   }
  }

  if(tag==='script'){
   const tp=(getAttr(node,'type')||'').split(';')[0].trim().toLowerCase();
   if(tp==='application/ld+json'){
    try{
     const data=JSON.parse(collectText(node,new Set()));
     walkJsonObjects(data,obj=>{
      const rawTypes=Array.isArray(obj['@type'])?obj['@type']:[obj['@type']];
      for(const t of rawTypes){
       if(typeof t!=='string'||!t.trim())continue;
       schemaSignals.types.add(t.trim());
       if(t==='Person')schemaSignals.hasPerson=true;
       if(t==='Organization'||t==='NewsMediaOrganization')schemaSignals.hasOrganization=true;
      }
      if(obj.author)schemaSignals.hasAuthorProp=true;
      if(obj.reviewedBy)schemaSignals.hasReviewedBy=true;
      if(isIsoDate(obj.datePublished))schemaSignals.hasDatePublished=true;
      if(isIsoDate(obj.dateModified))schemaSignals.hasDateModified=true;
      if(Array.isArray(obj.sameAs)?obj.sameAs.length>0:hasText(obj.sameAs))schemaSignals.hasSameAs=true;
      if(obj.author&&typeof obj.author==='object'&&!Array.isArray(obj.author)){
       const at=obj.author['@type'];
       if(at==='Person'||(Array.isArray(at)&&at.includes('Person')))schemaSignals.hasPerson=true;
      }
      if(obj.publisher&&typeof obj.publisher==='object'&&!Array.isArray(obj.publisher)){
       const pt=obj.publisher['@type'];
       if(pt==='Organization'||(Array.isArray(pt)&&pt.includes('Organization')))schemaSignals.hasOrganization=true;
      }
     });
    }catch{}
   }
  }
 });

 const hasVisibleAuthor=authorElements.length>0;
 const hasDateSignal=Boolean(metaPublished||metaModified||timeDatetimes.length>0||schemaSignals.hasDatePublished||schemaSignals.hasDateModified);
 const uniqueExternalSources=[...new Set(primaryExternalSources)];
 const uniqueTrustLinks=[...new Map(trustLinks.map(l=>[l.href,l])).values()];

 const findings=[];
 if(!hasVisibleAuthor){
  findings.push({
   code:'EEAT_MISSING_VISIBLE_AUTHOR',
   severity:'warning',
   message:'No recognizable author byline or author link outside explicitly hidden HTML was found. Meta author alone is not a visible byline.',
   recommendation:'Display a real named author/reviewer byline linked to an author profile page.'
  });
 }
 if(!schemaSignals.hasPerson&&!schemaSignals.hasOrganization){
  findings.push({
   code:'EEAT_INCOMPLETE_ENTITY_SCHEMA',
   severity:'warning',
   hasPerson:schemaSignals.hasPerson,
   hasOrganization:schemaSignals.hasOrganization,
   message:'No Person or Organization entity was observed in supplied JSON-LD.',
   recommendation:'If relevant to this page, describe its real author or publisher using the appropriate entity type. Both types are not universally required.'
  });
 }
 if(!hasDateSignal){
  findings.push({
   code:'EEAT_MISSING_PUBLICATION_DATES',
   severity:'warning',
   message:'No publication or update date found in <time>, meta tags, or JSON-LD.',
   recommendation:'Expose visible <time datetime="..."> and datePublished/dateModified in JSON-LD.'
  });
 }
 if(!baseOrigin){
  findings.push({code:'EEAT_EXTERNAL_LINK_SCOPE_UNKNOWN',severity:'info',message:'A page URL was not supplied, so external-vs-internal link classification was not checked.'});
 }else if(uniqueExternalSources.length===0){
  findings.push({
   code:'EEAT_NO_EXTERNAL_LINKS',
   severity:'info',
   message:'No external HTTP(S) links were observed. Link destinations were not checked for quality or primary-source status.',
   recommendation:'Where a claim needs support, cite a relevant source and verify that it supports the claim. A link alone does not prove this.'
  });
 }
 if(uniqueTrustLinks.length===0){
  findings.push({
   code:'EEAT_MISSING_TRUST_PAGES',
   severity:'warning',
   message:'No links to /about, /contact, /editorial, or /methodology pages found.',
   recommendation:'Link clearly to About, Contact, and Editorial Methodology trust pages.'
  });
 }

 const checks=[
  hasVisibleAuthor,
  schemaSignals.hasPerson||schemaSignals.hasOrganization,
  hasDateSignal,
  uniqueExternalSources.length>0,
  uniqueTrustLinks.length>0,
  schemaSignals.hasSameAs
 ];
 const passed=checks.filter(Boolean).length;
 const score=Math.round((passed/checks.length)*100);
 const rating=score>=80?'strong':score>=50?'moderate':'weak';

 return {
  ok:findings.every(f=>f.severity!=='error')&&score>=50,
  score,
  rating,
  scope:{kind:'raw-html-technical-observations',computedVisibilityChecked:false,authorIdentityVerified:false,pageOriginKnown:Boolean(baseOrigin),externalDestinationsFetched:false,primarySourceStatusVerified:false,rankingOrCitationPrediction:false},
  legacyMetrics:{score:'Deprecated: proportion of six detectable technical signals, not Google E-E-A-T or trust.',rating:'Deprecated descriptive bucket for signal coverage; not factual quality or ranking.'},
  signals:{
   author:{visible:hasVisibleAuthor,metaAuthor:metaAuthor||null,mentions:authorElements.slice(0,5)},
   dates:{published:metaPublished||null,modified:metaModified||null,timeTags:timeDatetimes.slice(0,5)},
   schema:{
    types:[...schemaSignals.types],
    hasPerson:schemaSignals.hasPerson,
    hasOrganization:schemaSignals.hasOrganization,
    hasSameAs:schemaSignals.hasSameAs,
    hasAuthorProp:schemaSignals.hasAuthorProp,
    hasReviewedBy:schemaSignals.hasReviewedBy,
    hasDatePublished:schemaSignals.hasDatePublished,
    hasDateModified:schemaSignals.hasDateModified
   },
   externalLinksCount:baseOrigin?uniqueExternalSources.length:null,
   externalLinks:uniqueExternalSources.slice(0,15),
   absoluteHttpLinks:[...new Set(absoluteHttpLinks)].slice(0,15),
   trustLinks:uniqueTrustLinks.slice(0,10)
  },
  findings
 };
}
