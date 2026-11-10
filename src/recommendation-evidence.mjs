const fields=['excerpt','donorExcerpt','suggestedAnchor'];
const excerptLimit=1000,anchorLimit=200;

function textIssue(value,limit){
 if(value.length>limit*2)return 'input-too-large';
 for(let index=0;index<value.length;index++){
  const code=value.charCodeAt(index);
  if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++index);if(!(next>=0xdc00&&next<=0xdfff))return 'invalid-unicode';}
  else if(code>=0xdc00&&code<=0xdfff)return 'invalid-unicode';
 }
 return [...value].length>limit?'input-too-large':null;
}

/** Exact text-location evidence, not whole-word or semantic approval.
 * Span offsets are inclusive start/exclusive end codepoints in the named unchanged excerpt.
 */
export function buildRecommendationEvidence(candidate){
 const base={schemaVersion:1,status:'unconfirmed',scope:'supplied-excerpt',basis:'lexical-candidate-not-semantic',reviewRequired:true,matchType:'exact-substring',excerptField:null,offsetUnit:'unicode-code-points',literalSpan:null};
 const unknown=(reason,excerptField=null)=>({...base,excerptField,reason});
 let descriptors;
 try{
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||![Object.prototype,null].includes(Object.getPrototypeOf(candidate)))return unknown('invalid-candidate');
  descriptors=Object.fromEntries(fields.map(field=>[field,Object.getOwnPropertyDescriptor(candidate,field)]));
  if(fields.some(field=>descriptors[field]&&!Object.hasOwn(descriptors[field],'value')))return unknown('invalid-candidate');
 }catch{return unknown('invalid-candidate');}
 const values=Object.fromEntries(fields.map(field=>[field,descriptors[field]?.value]));
 for(const field of ['excerpt','donorExcerpt']){
  const value=values[field];if(value===null||value===undefined)continue;
  if(typeof value!=='string')return unknown('invalid-excerpt');
  const issue=textIssue(value,excerptLimit);if(issue)return unknown(issue);
 }
 const excerpts=['excerpt','donorExcerpt'].filter(field=>typeof values[field]==='string'&&values[field].trim()!=='');
 if(excerpts.length===2&&values.excerpt!==values.donorExcerpt)return unknown('conflicting-excerpts');
 if(!excerpts.length)return unknown('missing-excerpt');
 const excerptField=excerpts[0],excerpt=values[excerptField],anchor=values.suggestedAnchor;
 if(anchor===null||anchor===undefined)return unknown('missing-anchor',excerptField);
 if(typeof anchor!=='string')return unknown('invalid-anchor',excerptField);
 const issue=textIssue(anchor,anchorLimit);if(issue)return unknown(issue,excerptField);
 if(anchor.trim()==='')return unknown('missing-anchor',excerptField);
 const index=excerpt.indexOf(anchor);
 if(index<0)return {...base,excerptField,status:'text-edit-required',reason:'anchor-not-in-excerpt'};
 const text=excerpt.slice(index,index+anchor.length),start=[...excerpt.slice(0,index)].length;
 return {...base,excerptField,status:'literal-span',literalSpan:{start,end:start+[...text].length,text},reason:'exact-literal-match'};
}

function compareStored(value,expected){
 try{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return 'invalid-evidence';
  const keys=Reflect.ownKeys(value),expectedKeys=Object.keys(expected);
  if(keys.length!==expectedKeys.length||keys.some(key=>typeof key!=='string'||!Object.hasOwn(expected,key)))return 'invalid-evidence';
  const stored={};for(const key of expectedKeys){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||!Object.hasOwn(descriptor,'value'))return 'invalid-evidence';stored[key]=descriptor.value;}
  for(const key of expectedKeys){
   if(expected[key]!==null&&typeof expected[key]==='object'){const issue=compareStored(stored[key],expected[key]);if(issue)return issue;}
   else if(stored[key]!==expected[key])return 'evidence-mismatch';
  }
  return null;
 }catch{return 'invalid-evidence';}
}

/** Missing/forged stored metadata is not silently upgraded into current literal evidence. */
export function readRecommendationEvidence(candidate){
 const canonical=buildRecommendationEvidence(candidate);
 if(canonical.status==='unconfirmed')return canonical;
 let descriptor;try{descriptor=Object.getOwnPropertyDescriptor(candidate,'anchorEvidence');}catch{}
 let issue;
 if(!descriptor||Object.hasOwn(descriptor,'value')&&(descriptor.value===null||descriptor.value===undefined))issue='missing-evidence';
 else if(!Object.hasOwn(descriptor,'value'))issue='invalid-evidence';
 else issue=compareStored(descriptor.value,canonical);
 return issue?{...canonical,status:'unconfirmed',literalSpan:null,reason:issue}:canonical;
}
