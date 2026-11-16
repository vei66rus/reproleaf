import {parse} from 'parse5';
import {z} from 'zod';
import {MARKUP_CORE_LIMITS,assertMarkupSourceBudget,assertMarkupTreeBudget,assertJsonSourceBudget,isSchemaOrgContext,isIsoCalendarDate,isWebUrl} from './markup-input-guards.mjs';

export const schemaAuditSchema=z.object({
 html:z.string().min(1).max(1048576),
 url:z.string().url().max(2048).refine(isWebUrl,'Expected an HTTP(S) page URL without credentials').optional()
}).strict();

const articleTypes=new Set(['Article','BlogPosting','NewsArticle','TechArticle']);
const urlFields=['url','item','sameAs','logo','image'];

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

function collectJsonLdScripts(node,out){
 if(!node)return;
 if(node.tagName==='script'){
  const type=(getAttr(node,'type')||'').split(';')[0].trim().toLowerCase();
  if(type==='application/ld+json'){
   out.push(textContent(node).trim());
  }
 }
 if(Array.isArray(node.childNodes)){
  for(const child of node.childNodes)collectJsonLdScripts(child,out);
 }
}

function normalizeTypes(rawType){
 if(typeof rawType==='string'&&rawType.trim())return [rawType.trim()];
 if(Array.isArray(rawType))return rawType.filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim());
 return [];
}

function hasNonEmptyValue(val){
 if(typeof val==='string')return val.trim().length>0;
 if(Array.isArray(val))return val.length>0;
 if(val&&typeof val==='object')return Object.keys(val).length>0;
 return typeof val==='number'||typeof val==='boolean';
}

function isIsoDateLike(val){
 return isIsoCalendarDate(val);
}

function collectIdReferences(value,refs){
 if(!value||typeof value!=='object')return;
 if(Array.isArray(value)){
  for(const item of value)collectIdReferences(item,refs);
  return;
 }
 const keys=Object.keys(value);
 if(keys.length===1&&typeof value['@id']==='string'&&value['@id'].trim()){
  refs.push(value['@id'].trim());
  return;
 }
 for(const key of keys){
  if(key==='@id'||key==='@context')continue;
  collectIdReferences(value[key],refs);
 }
}

function checkRelativeUrls(entity,blockIndex,typeLabel,findings){
 for(const field of urlFields){
  const val=entity[field];
  const values=typeof val==='string'?[val]:Array.isArray(val)?val.filter(v=>typeof v==='string'):[];
  for(const candidate of values){
   const trimmed=candidate.trim();
   if(trimmed&&(/^(?:https?:|javascript:|data:|file:)/i.test(trimmed))&&!isWebUrl(trimmed)){
    findings.push({code:'SCHEMA_INVALID_WEB_URL',severity:'error',blockIndex,type:typeLabel,message:`Field "${field}" contains an invalid or unsafe web URL.`,recommendation:'Use a valid absolute HTTP(S) URL without credentials for this web-page profile.'});
   }else if(trimmed&&!isWebUrl(trimmed)&&!trimmed.startsWith('#')){
    findings.push({
     code:'SCHEMA_RELATIVE_URL',
     severity:'warning',
     blockIndex,
     type:typeLabel,
     message:`Field "${field}" uses non-absolute URL "${trimmed}".`,
     recommendation:'Use an absolute https:// URL in JSON-LD structured data.'
    });
   }
  }
 }
}

function flattenBlockEntities(parsed,blockIndex,findings){
 const rootContext=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed['@context']:undefined;
 const items=Array.isArray(parsed)?parsed:Array.isArray(parsed?.['@graph'])?parsed['@graph']:[parsed];
 const entities=[];
 for(const item of items){
  if(!item||typeof item!=='object'||Array.isArray(item)){
   findings.push({
    code:'SCHEMA_INVALID_ENTITY',
    severity:'error',
    blockIndex,
    type:null,
    message:'JSON-LD entity must be a JSON object.',
    recommendation:'Ensure every item in JSON-LD or @graph is an object with @type.'
   });
   continue;
  }
  const effectiveContext=item['@context']??rootContext;
  if(!isSchemaOrgContext(effectiveContext)){
   findings.push({
    code:'SCHEMA_CONTEXT_UNUSUAL',
    severity:'warning',
    blockIndex,
    type:normalizeTypes(item['@type'])[0]||null,
    message:'Missing or non-schema.org @context on JSON-LD block.',
    recommendation:'Set "@context": "https://schema.org" on the root JSON-LD object.'
   });
  }
  entities.push({entity:item,blockIndex});
 }
 return entities;
}

function validateTypedEntity(entity,blockIndex,types,findings){
 const primaryType=types[0];
 checkRelativeUrls(entity,blockIndex,primaryType,findings);
 if(types.some(t=>articleTypes.has(t))){
  for(const req of ['headline','author','datePublished']){
   if(!hasNonEmptyValue(entity[req])){
    findings.push({
     code:'SCHEMA_ARTICLE_MISSING_FIELD',
     severity:'warning',
     blockIndex,
     type:primaryType,
     message:`${primaryType} does not include "${req}" under this local article profile.`,
     recommendation:`Review whether "${req}" describes the visible page. This is a local profile check, not a universal Schema.org requirement.`
    });
   }
  }
  if(entity.datePublished&&!isIsoDateLike(entity.datePublished)){
   findings.push({
    code:'SCHEMA_INVALID_DATE',
    severity:'warning',
    blockIndex,
    type:primaryType,
    message:`${primaryType}.datePublished "${entity.datePublished}" is not ISO 8601.`,
    recommendation:'Format datePublished and dateModified as ISO 8601 (YYYY-MM-DD or full timestamp).'
   });
  }
  if(entity.dateModified&&!isIsoDateLike(entity.dateModified)){
   findings.push({
    code:'SCHEMA_INVALID_DATE',
    severity:'warning',
    blockIndex,
    type:primaryType,
    message:`${primaryType}.dateModified "${entity.dateModified}" is not ISO 8601.`,
    recommendation:'Format dateModified as ISO 8601.'
   });
  }
 }
 if(types.includes('FAQPage')){
  const items=Array.isArray(entity.mainEntity)?entity.mainEntity:[];
  if(items.length===0){
   findings.push({
    code:'SCHEMA_FAQ_EMPTY',
    severity:'error',
    blockIndex,
    type:'FAQPage',
    message:'FAQPage.mainEntity must be a non-empty array of Question objects.',
    recommendation:'Include Question items with name and acceptedAnswer.text.'
   });
  }else{
   for(const [idx,q] of items.entries()){
    if(!hasNonEmptyValue(q?.name)||!hasNonEmptyValue(q?.acceptedAnswer?.text)){
     findings.push({
      code:'SCHEMA_FAQ_INCOMPLETE_ITEM',
      severity:'error',
      blockIndex,
      type:'FAQPage',
      message:`FAQPage.mainEntity[${idx}] is missing name or acceptedAnswer.text.`,
      recommendation:'Ensure every FAQ Question includes both name and acceptedAnswer.text.'
     });
    }
   }
  }
 }
 if(types.includes('BreadcrumbList')){
  const items=Array.isArray(entity.itemListElement)?entity.itemListElement:[];
  if(items.length===0){
   findings.push({
    code:'SCHEMA_BREADCRUMB_EMPTY',
    severity:'error',
    blockIndex,
    type:'BreadcrumbList',
    message:'BreadcrumbList.itemListElement must be a non-empty array.',
    recommendation:'Populate itemListElement with ListItem entries.'
   });
  }else{
   for(const [idx,item] of items.entries()){
    if(typeof item?.position!=='number'||!hasNonEmptyValue(item?.name)){
     findings.push({
      code:'SCHEMA_BREADCRUMB_INCOMPLETE_ITEM',
      severity:'error',
      blockIndex,
      type:'BreadcrumbList',
      message:`BreadcrumbList.itemListElement[${idx}] must have numeric position and name.`,
      recommendation:'Provide numeric position, name, and item URL on each ListItem.'
     });
    }
   }
  }
 }
 if(types.includes('SoftwareApplication')||types.includes('WebApplication')){
  if(!hasNonEmptyValue(entity.name)){
   findings.push({
    code:'SCHEMA_SOFTWARE_MISSING_NAME',
    severity:'error',
    blockIndex,
    type:primaryType,
    message:`${primaryType} is missing "name".`,
    recommendation:`Add "name" to ${primaryType}.`
   });
  }
  if(!hasNonEmptyValue(entity.applicationCategory)&&!hasNonEmptyValue(entity.operatingSystem)){
   findings.push({
    code:'SCHEMA_SOFTWARE_MISSING_CATEGORY',
    severity:'warning',
    blockIndex,
    type:primaryType,
    message:`${primaryType} should specify applicationCategory or operatingSystem.`,
    recommendation:'Add applicationCategory and operatingSystem for clearer software classification.'
   });
  }
 }
 if(types.includes('Organization')||types.includes('Person')){
  if(!hasNonEmptyValue(entity.name)){
   findings.push({
    code:'SCHEMA_IDENTITY_MISSING_NAME',
    severity:'error',
    blockIndex,
    type:primaryType,
    message:`${primaryType} is missing "name".`,
    recommendation:`Add "name" to ${primaryType}.`
   });
  }
 }
}

export function auditJsonLd(rawInput){
 const parsed=schemaAuditSchema.parse(rawInput);
 assertMarkupSourceBudget(parsed.html);
 const doc=parse(parsed.html);
 assertMarkupTreeBudget(doc);
 const rawBlocks=[];
 collectJsonLdScripts(doc,rawBlocks);
 if(rawBlocks.length>MARKUP_CORE_LIMITS.blocks)throw new Error('MARKUP_COMPLEX');
 const findings=[];
 const entities=[];
 const blockSummaries=[];
 if(rawBlocks.length===0){
  findings.push({
   code:'SCHEMA_MISSING',
   severity:'warning',
   blockIndex:null,
   type:null,
   message:'No <script type="application/ld+json"> blocks found in document.',
   recommendation:'Add Schema.org JSON-LD structured data matching the page type.'
  });
 }
 for(const [blockIndex,rawText] of rawBlocks.entries()){
  if(!rawText){
   findings.push({
    code:'SCHEMA_EMPTY_BLOCK',
    severity:'error',
    blockIndex,
    type:null,
    message:`JSON-LD script block ${blockIndex} is empty.`,
    recommendation:'Remove empty JSON-LD script tags or populate valid structured data.'
   });
   blockSummaries.push({blockIndex,validJson:false,entityCount:0});
   continue;
  }
  assertJsonSourceBudget(rawText);
  let json;
  try{
   json=JSON.parse(rawText);
  }catch(error){
   const position=/\bposition\s+(\d+)/i.exec(error.message||'')?.[1];
   findings.push({
    code:'SCHEMA_INVALID_JSON',
    severity:'error',
    blockIndex,
    type:null,
    message:`JSON-LD block ${blockIndex} is not valid JSON${position?` at position ${position}`:''}.`,
    recommendation:'Fix JSON syntax errors inside the <script type="application/ld+json"> block.'
   });
   blockSummaries.push({blockIndex,validJson:false,entityCount:0});
   continue;
  }
  const blockEntities=flattenBlockEntities(json,blockIndex,findings);
  blockSummaries.push({blockIndex,validJson:true,entityCount:blockEntities.length});
  for(const item of blockEntities)entities.push(item);
 }
 const declaredIds=new Map();
 const allTypes=new Set();
 for(const {entity,blockIndex} of entities){
  const types=normalizeTypes(entity['@type']);
  if(types.length===0){
   findings.push({
    code:'SCHEMA_MISSING_TYPE',
    severity:'error',
    blockIndex,
    type:null,
    message:'JSON-LD entity is missing @type.',
    recommendation:'Specify a valid Schema.org @type on every entity.'
   });
  }else{
   for(const t of types)allTypes.add(t);
   validateTypedEntity(entity,blockIndex,types,findings);
  }
  if(typeof entity['@id']==='string'&&entity['@id'].trim()){
   const idVal=entity['@id'].trim();
   if(declaredIds.has(idVal)){
    findings.push({
     code:'SCHEMA_DUPLICATE_ID',
     severity:'warning',
     blockIndex,
     type:types[0]||null,
     message:`Duplicate @id "${idVal}" already declared in block ${declaredIds.get(idVal)}.`,
     recommendation:'Use unique @id identifiers per distinct entity or merge properties into one node.'
    });
   }else{
    declaredIds.set(idVal,blockIndex);
   }
  }
 }
 const pageHashPrefix=parsed.url?`${parsed.url.split('#')[0]}#`:null;
 for(const {entity,blockIndex} of entities){
  const refs=[];
  collectIdReferences(entity,refs);
  for(const ref of refs){
   const isLocalRef=ref.startsWith('#')||(pageHashPrefix&&ref.startsWith(pageHashPrefix));
   if(isLocalRef&&!declaredIds.has(ref)){
    findings.push({
     code:'SCHEMA_UNRESOLVED_ID_REF',
     severity:'warning',
     blockIndex,
     type:normalizeTypes(entity['@type'])[0]||null,
     message:`Referenced @id "${ref}" is not declared by any entity on this page.`,
     recommendation:'Declare the target entity with matching @id or remove the dangling reference.'
    });
   }
  }
 }
 const errors=findings.filter(f=>f.severity==='error').length;
 const warnings=findings.filter(f=>f.severity==='warning').length;
 return {
  ok:errors===0,
  url:parsed.url||null,
  summary:{
   blocks:rawBlocks.length,
   entities:entities.length,
   errors,
   warnings,
   types:[...allTypes]
  },
  blocks:blockSummaries,
  findings,
  profile:'Reproleaf local structural checks; not complete Schema.org validation or Google rich-result eligibility',
  limits:['Inspects static <script type="application/ld+json"> tags in supplied HTML without executing JavaScript or fetching remote @id URLs.','Only selected local type/field rules are evaluated. Missing article fields are review warnings, not universal Schema.org requirements.','Input is bounded by bytes, DOM depth/node count, JSON nesting/token count and script-block count.']
 };
}
