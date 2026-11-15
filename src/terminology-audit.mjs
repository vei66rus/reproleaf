import {z} from 'zod';

const glossaryEntrySchema=z.object({
 canonical:z.string().min(1).max(120),
 aliases:z.array(z.string().min(1).max(120)).max(30).default([]),
 forbidden:z.array(z.string().min(1).max(120)).max(30).default([]),
 caseSensitive:z.boolean().default(true)
}).strict();

const documentEntrySchema=z.object({
 id:z.string().min(1).max(120),
 text:z.string().min(1).max(200000)
}).strict();

export const terminologyAuditSchema=z.object({
 text:z.string().min(1).max(200000).optional(),
 documents:z.array(documentEntrySchema).min(1).max(50).optional(),
 glossary:z.array(glossaryEntrySchema).min(1).max(200)
}).strict().superRefine((val,ctx)=>{
 if(!val.text&&(!val.documents||val.documents.length===0)){
  ctx.addIssue({code:'custom',message:'Provide either text or documents.'});
 }
});

function escapeRegex(value){
 return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

function stripCodeFences(text){
 const lines=text.split(/\r?\n/);
 const out=[];
 let inFence=false;
 for(const line of lines){
  const trimmed=line.trim();
  if(trimmed.startsWith('```')||trimmed.startsWith('~~~')){
   inFence=!inFence;
   out.push('');
   continue;
  }
  out.push(inFence?'':line);
 }
 return out.join('\n');
}

function findTermMatches(text,term){
 const pattern=new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(term)}(?![\\p{L}\\p{N}_])`,'giu');
 return [...text.matchAll(pattern)].map(m=>({match:m[0],index:m.index??0}));
}

export function auditTerminologyConsistency(rawInput){
 const parsed=terminologyAuditSchema.parse(rawInput);
 const docs=parsed.documents??[{id:'document',text:parsed.text}];
 const cleanedDocs=docs.map(d=>({id:d.id,text:stripCodeFences(d.text)}));

 const findings=[];
 const terms=[];
 let canonicalMatches=0;
 let aliasMatches=0;
 let forbiddenMatches=0;
 let casingDriftMatches=0;

 for(const entry of parsed.glossary){
  let termCanonical=0;
  let termAliases=0;
  let termForbidden=0;
  let termCasingDrift=0;

  for(const doc of cleanedDocs){
   const coveredRanges=[];
   for(const alias of entry.aliases){
    if(alias.toLowerCase()===entry.canonical.toLowerCase())continue;
    const aMatches=findTermMatches(doc.text,alias);
    if(aMatches.length>0){
     termAliases+=aMatches.length;
     for(const am of aMatches)coveredRanges.push([am.index,am.index+am.match.length]);
     findings.push({
      code:'TERMINOLOGY_NON_CANONICAL_ALIAS',
      severity:'warning',
      documentId:doc.id,
      canonical:entry.canonical,
      found:aMatches[0].match,
      occurrences:aMatches.length,
      message:`Alias "${aMatches[0].match}" used ${aMatches.length} time(s) in ${doc.id} instead of canonical "${entry.canonical}".`,
      recommendation:`Replace "${alias}" with "${entry.canonical}".`
     });
    }
   }

   for(const bad of entry.forbidden){
    const fMatches=findTermMatches(doc.text,bad);
    if(fMatches.length>0){
     termForbidden+=fMatches.length;
     for(const fm of fMatches)coveredRanges.push([fm.index,fm.index+fm.match.length]);
     findings.push({
      code:'TERMINOLOGY_FORBIDDEN_VARIANT',
      severity:'error',
      documentId:doc.id,
      canonical:entry.canonical,
      found:fMatches[0].match,
      occurrences:fMatches.length,
      message:`Forbidden variant "${fMatches[0].match}" used ${fMatches.length} time(s) in ${doc.id}; expected "${entry.canonical}".`,
      recommendation:`Remove "${bad}" and use "${entry.canonical}".`
     });
    }
   }

   const matches=findTermMatches(doc.text,entry.canonical);
   for(const m of matches){
    const mEnd=m.index+m.match.length;
    if(coveredRanges.some(([start,end])=>m.index>=start&&mEnd<=end))continue;
    if(!entry.caseSensitive||m.match===entry.canonical){
     termCanonical+=1;
    }else{
     termCasingDrift+=1;
     findings.push({
      code:'TERMINOLOGY_CASING_DRIFT',
      severity:'warning',
      documentId:doc.id,
      canonical:entry.canonical,
      found:m.match,
      message:`Term "${m.match}" in ${doc.id} differs in casing from canonical "${entry.canonical}".`,
      recommendation:`Use exact canonical casing "${entry.canonical}".`
     });
    }
   }
  }

  canonicalMatches+=termCanonical;
  aliasMatches+=termAliases;
  forbiddenMatches+=termForbidden;
  casingDriftMatches+=termCasingDrift;
  terms.push({
   canonical:entry.canonical,
   canonicalMatches:termCanonical,
   aliasMatches:termAliases,
   forbiddenMatches:termForbidden,
   casingDriftMatches:termCasingDrift
  });
 }

 const totalMentions=canonicalMatches+aliasMatches+forbiddenMatches+casingDriftMatches;
 const consistencyScore=totalMentions>0?Number((canonicalMatches/totalMentions).toFixed(4)):1;

 return {
  ok:findings.every(f=>f.severity!=='error'),
  summary:{
   documentsChecked:cleanedDocs.length,
   glossaryTerms:parsed.glossary.length,
   canonicalMatches,
   aliasMatches,
   forbiddenMatches,
   casingDriftMatches,
   consistencyScore
  },
  terms,
  findings
 };
}
