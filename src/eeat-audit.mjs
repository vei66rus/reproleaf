import {parse} from 'parse5';
import {z} from 'zod';

export const eeatAuditSchema=z.object({
 html:z.string().min(1).max(1048576),
 url:z.string().url().max(2048).optional()
}).strict();

const authorLinkPattern=/(?:^|\/)(?:author|authors|team|editor|about|автор|команда|о-нас|о-проекте)(?:\/|$)/i;
const trustLinkPattern=/(?:^|\/)(?:about|contact|editorial|methodology|privacy|terms|disclaimer|контакты|о-нас|редакция|методика|политика)(?:\/|$)/i;

function getAttr(node,name){
 const attr=(node.attrs||[]).find(a=>a.name.toLowerCase()===name.toLowerCase());
 return attr?attr.value:'';
}

function collectText(node,skipTags=new Set(['script','style','noscript','template'])){
 if(!node)return '';
 if(node.nodeName==='#text')return node.value||'';
 if(skipTags.has(node.tagName))return '';
 return (node.childNodes||[]).map(c=>collectText(c,skipTags)).join(' ');
}

function walkNodes(node,visitor){
 visitor(node);
 for(const child of node.childNodes||[])walkNodes(child,visitor);
}

function walkJsonObjects(value,visitor){
 if(!value||typeof value!=='object')return;
 if(Array.isArray(value)){
  for(const item of value)walkJsonObjects(item,visitor);
  return;
 }
 visitor(value);
 for(const v of Object.values(value))walkJsonObjects(v,visitor);
}

function hasText(v){
 return typeof v==='string'&&v.trim().length>0;
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

  if(tag==='meta'){
   const name=(getAttr(node,'name')||getAttr(node,'property')||'').toLowerCase().trim();
   const content=getAttr(node,'content').trim();
   if(!content)return;
   if(name==='author')metaAuthor=content;
   if(name==='article:published_time'||name==='datepublished')metaPublished=content;
   if(name==='article:modified_time'||name==='last-modified'||name==='datemodified')metaModified=content;
  }

  if(tag==='time'){
   const dt=getAttr(node,'datetime').trim()||collectText(node).trim();
   if(dt)timeDatetimes.push(dt);
  }

  if(tag==='a'){
   const href=getAttr(node,'href').trim();
   const rel=(getAttr(node,'rel')||'').toLowerCase();
   const text=collectText(node).replace(/\s+/g,' ').trim();
   if(rel.split(/\s+/).includes('author')||authorLinkPattern.test(href)){
    authorElements.push(text||href);
   }
   if(trustLinkPattern.test(href)){
    trustLinks.push({href,text:text||href});
   }
   if(/^https?:\/\//i.test(href)){
    try{
     const linkUrl=new URL(href);
     if(!baseOrigin||linkUrl.origin!==baseOrigin){
      primaryExternalSources.push(linkUrl.href);
     }
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
      if(hasText(obj.datePublished))schemaSignals.hasDatePublished=true;
      if(hasText(obj.dateModified))schemaSignals.hasDateModified=true;
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

 const hasVisibleAuthor=Boolean(metaAuthor||authorElements.length>0);
 const hasDateSignal=Boolean(metaPublished||metaModified||timeDatetimes.length>0||schemaSignals.hasDatePublished||schemaSignals.hasDateModified);
 const uniqueExternalSources=[...new Set(primaryExternalSources)];
 const uniqueTrustLinks=[...new Map(trustLinks.map(l=>[l.href,l])).values()];

 const findings=[];
 if(!hasVisibleAuthor){
  findings.push({
   code:'EEAT_MISSING_VISIBLE_AUTHOR',
   severity:'warning',
   message:'No visible author byline, rel="author" link, or meta author found.',
   recommendation:'Display a real named author/reviewer byline linked to an author profile page.'
  });
 }
 if(!schemaSignals.hasPerson||!schemaSignals.hasOrganization){
  findings.push({
   code:'EEAT_INCOMPLETE_ENTITY_SCHEMA',
   severity:'warning',
   hasPerson:schemaSignals.hasPerson,
   hasOrganization:schemaSignals.hasOrganization,
   message:`Entity JSON-LD incomplete (Person=${schemaSignals.hasPerson}, Organization=${schemaSignals.hasOrganization}).`,
   recommendation:'Include both Person (with sameAs/jobTitle) and Organization (with logo/sameAs) in JSON-LD.'
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
 if(uniqueExternalSources.length===0){
  findings.push({
   code:'EEAT_NO_PRIMARY_SOURCES',
   severity:'info',
   message:'No external primary-source citations detected on the page.',
   recommendation:'Cite authoritative standards, documentation, or reproducible datasets where claims appear.'
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
  schemaSignals.hasPerson&&schemaSignals.hasOrganization,
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
   externalPrimarySourcesCount:uniqueExternalSources.length,
   externalPrimarySources:uniqueExternalSources.slice(0,15),
   trustLinks:uniqueTrustLinks.slice(0,10)
  },
  findings
 };
}
