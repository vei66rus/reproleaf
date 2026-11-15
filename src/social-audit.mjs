import {parse} from 'parse5';
import {z} from 'zod';

export const socialAuditSchema=z.object({
 html:z.string().min(1).max(1048576),
 url:z.string().url().max(2048).optional()
}).strict();

const validTwitterCards=new Set(['summary','summary_large_image','app','player']);

function getAttr(node,name){
 const attr=(node.attrs||[]).find(a=>a.name.toLowerCase()===name.toLowerCase());
 return attr?attr.value:null;
}

function textContent(node){
 if(!node)return '';
 if(node.nodeName==='#text')return node.value||'';
 if(!Array.isArray(node.childNodes))return '';
 return node.childNodes.map(textContent).join('');
}

function collectSocialTags(node,state){
 if(!node)return;
 if(node.tagName==='title'&&state.title===null){
  state.title=textContent(node).trim();
 }else if(node.tagName==='link'){
  const rel=(getAttr(node,'rel')||'').toLowerCase().split(/\s+/);
  const href=(getAttr(node,'href')||'').trim();
  if(rel.includes('canonical')&&href&&state.canonical===null){
   state.canonical=href;
  }
 }else if(node.tagName==='meta'){
  const prop=(getAttr(node,'property')||'').trim().toLowerCase();
  const name=(getAttr(node,'name')||'').trim().toLowerCase();
  const content=(getAttr(node,'content')||'').trim();
  const key=prop||name;
  if(key==='description'&&content&&state.metaDescription===null){
   state.metaDescription=content;
  }else if(key.startsWith('og:')&&content){
   state.og.push({key,value:content});
  }else if(key.startsWith('twitter:')&&content){
   state.twitter.push({key,value:content});
  }
 }
 if(Array.isArray(node.childNodes)){
  for(const child of node.childNodes)collectSocialTags(child,state);
 }
}

function mapFirstAndCheckDuplicates(entries,keysToCheck,findings){
 const map=new Map();
 const counts=new Map();
 for(const {key,value} of entries){
  counts.set(key,(counts.get(key)||0)+1);
  if(!map.has(key))map.set(key,value);
 }
 for(const key of keysToCheck){
  if((counts.get(key)||0)>1){
   findings.push({
    code:'SOCIAL_DUPLICATE_META',
    severity:'warning',
    tag:key,
    message:`Duplicate "${key}" meta tag found (${counts.get(key)} occurrences).`,
    recommendation:`Keep a single "${key}" meta tag so crawlers do not pick an unexpected value.`
   });
  }
 }
 return map;
}

function checkImageUrl(tag,value,findings){
 if(!value)return;
 if(value.startsWith('http://')){
  findings.push({
   code:'SOCIAL_IMAGE_HTTP_NOT_HTTPS',
   severity:'warning',
   tag,
   message:`${tag} uses insecure http:// URL "${value}".`,
   recommendation:`Serve ${tag} over https:// so social platforms do not block mixed content.`
  });
 }else if(!value.startsWith('https://')){
  findings.push({
   code:'SOCIAL_RELATIVE_IMAGE_URL',
   severity:'error',
   tag,
   message:`${tag} uses non-absolute URL "${value}".`,
   recommendation:`Use an absolute https:// URL for ${tag}; social crawlers often fail on relative paths.`
  });
 }
}

export function auditSocialMeta(rawInput){
 const parsed=socialAuditSchema.parse(rawInput);
 const doc=parse(parsed.html);
 const state={title:null,canonical:null,metaDescription:null,og:[],twitter:[]};
 collectSocialTags(doc,state);
 const findings=[];
 const ogMap=mapFirstAndCheckDuplicates(state.og,['og:title','og:description','og:url','og:type'],findings);
 const twMap=mapFirstAndCheckDuplicates(state.twitter,['twitter:card','twitter:title','twitter:description'],findings);

 const openGraph={
  title:ogMap.get('og:title')||null,
  description:ogMap.get('og:description')||null,
  type:ogMap.get('og:type')||null,
  url:ogMap.get('og:url')||null,
  image:ogMap.get('og:image')||null,
  imageAlt:ogMap.get('og:image:alt')||null,
  imageWidth:ogMap.get('og:image:width')||null,
  imageHeight:ogMap.get('og:image:height')||null,
  siteName:ogMap.get('og:site_name')||null,
  locale:ogMap.get('og:locale')||null
 };
 const twitter={
  card:twMap.get('twitter:card')||null,
  title:twMap.get('twitter:title')||null,
  description:twMap.get('twitter:description')||null,
  image:twMap.get('twitter:image')||null,
  imageAlt:twMap.get('twitter:image:alt')||null,
  site:twMap.get('twitter:site')||null,
  creator:twMap.get('twitter:creator')||null
 };

 if(!openGraph.title){
  findings.push({
   code:'SOCIAL_MISSING_OG_TITLE',
   severity:'error',
   tag:'og:title',
   message:'Missing og:title meta tag.',
   recommendation:'Add <meta property="og:title" content="..."> for consistent social previews.'
  });
 }
 if(!openGraph.description){
  findings.push({
   code:'SOCIAL_MISSING_OG_DESCRIPTION',
   severity:'warning',
   tag:'og:description',
   message:'Missing og:description meta tag.',
   recommendation:'Add <meta property="og:description" content="...">.'
  });
 }
 if(!openGraph.image){
  findings.push({
   code:'SOCIAL_MISSING_OG_IMAGE',
   severity:'warning',
   tag:'og:image',
   message:'Missing og:image meta tag.',
   recommendation:'Add a 1200x630 https:// image in og:image for rich link previews.'
  });
 }else{
  checkImageUrl('og:image',openGraph.image,findings);
 }
 if(!openGraph.url){
  findings.push({
   code:'SOCIAL_MISSING_OG_URL',
   severity:'warning',
   tag:'og:url',
   message:'Missing og:url meta tag.',
   recommendation:'Set og:url to the canonical URL of the page.'
  });
 }else if(state.canonical&&openGraph.url!==state.canonical){
  findings.push({
   code:'SOCIAL_OG_URL_CANONICAL_MISMATCH',
   severity:'warning',
   tag:'og:url',
   message:`og:url "${openGraph.url}" differs from canonical "${state.canonical}".`,
   recommendation:'Align og:url with link[rel="canonical"] unless intentionally overridden.'
  });
 }
 if(!openGraph.type){
  findings.push({
   code:'SOCIAL_MISSING_OG_TYPE',
   severity:'warning',
   tag:'og:type',
   message:'Missing og:type meta tag (e.g., "website" or "article").',
   recommendation:'Add <meta property="og:type" content="article"> or "website".'
  });
 }

 if(!twitter.card){
  findings.push({
   code:'SOCIAL_MISSING_TWITTER_CARD',
   severity:'warning',
   tag:'twitter:card',
   message:'Missing twitter:card meta tag.',
   recommendation:'Add <meta name="twitter:card" content="summary_large_image"> for X.com cards.'
  });
 }else if(!validTwitterCards.has(twitter.card)){
  findings.push({
   code:'SOCIAL_INVALID_TWITTER_CARD',
   severity:'error',
   tag:'twitter:card',
   message:`Invalid twitter:card value "${twitter.card}".`,
   recommendation:'Use summary, summary_large_image, app, or player.'
  });
 }
 if(twitter.image){
  checkImageUrl('twitter:image',twitter.image,findings);
 }
 if(twitter.card==='summary_large_image'&&!twitter.image&&!openGraph.image){
  findings.push({
   code:'SOCIAL_SUMMARY_LARGE_IMAGE_NO_IMAGE',
   severity:'error',
   tag:'twitter:image',
   message:'twitter:card is summary_large_image but neither twitter:image nor og:image is present.',
   recommendation:'Provide an absolute https:// image via twitter:image or og:image.'
  });
 }

 const previewTitle=twitter.title||openGraph.title||state.title||null;
 const previewDescription=twitter.description||openGraph.description||state.metaDescription||null;
 const previewImage=twitter.image||openGraph.image||null;
 const previewUrl=openGraph.url||state.canonical||parsed.url||null;

 if(previewTitle&&previewTitle.length>70){
  findings.push({
   code:'SOCIAL_TITLE_TOO_LONG',
   severity:'warning',
   tag:'og:title',
   message:`Social preview title is ${previewTitle.length} characters; platforms typically truncate past 70.`,
   recommendation:'Keep social card titles concise (<= 70 characters).'
  });
 }
 if(previewDescription&&previewDescription.length>200){
  findings.push({
   code:'SOCIAL_DESCRIPTION_TOO_LONG',
   severity:'warning',
   tag:'og:description',
   message:`Social preview description is ${previewDescription.length} characters; platforms typically truncate past 200.`,
   recommendation:'Keep social card descriptions concise (<= 200 characters).'
  });
 }

 const errors=findings.filter(f=>f.severity==='error').length;
 const warnings=findings.filter(f=>f.severity==='warning').length;
 return {
  ok:errors===0,
  url:parsed.url||null,
  summary:{
   errors,
   warnings,
   hasOpenGraph:state.og.length>0,
   hasTwitterCard:Boolean(twitter.card)
  },
  openGraph,
  twitter,
  preview:{
   title:previewTitle,
   description:previewDescription,
   image:previewImage,
   url:previewUrl,
   siteName:openGraph.siteName,
   card:twitter.card||(previewImage?'summary_large_image':'summary')
  },
  findings,
  limits:['Inspects static <meta> tags in supplied HTML without fetching image dimensions or remote URLs.']
 };
}
