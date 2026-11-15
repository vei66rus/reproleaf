import {z} from 'zod';

const pageEntrySchema=z.object({
 url:z.string().min(1).max(2048),
 title:z.string().max(400).default(''),
 h1:z.string().max(400).default(''),
 primaryQuery:z.string().max(200).optional(),
 headings:z.array(z.string().max(300)).max(50).default([])
}).strict();

export const cannibalizationAuditSchema=z.object({
 pages:z.array(pageEntrySchema).min(2).max(200),
 overlapThreshold:z.number().min(0.3).max(1).default(0.6)
}).strict();

const stopWords=new Set([
 'the','and','for','with','how','to','of','in','on','a','an','is','are','by','from','or','vs',
 'и','в','на','по','для','как','что','из','от','до','при','без','под','над','или','а','но'
]);

function tokenize(text){
 const tokens=(text||'').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)||[];
 return new Set(tokens.filter(t=>!stopWords.has(t)));
}

function jaccard(a,b){
 if(a.size===0||b.size===0)return 0;
 let intersection=0;
 for(const t of a){
  if(b.has(t))intersection+=1;
 }
 const union=a.size+b.size-intersection;
 return union>0?intersection/union:0;
}

export function auditCannibalizationMatrix(rawInput){
 const parsed=cannibalizationAuditSchema.parse(rawInput);
 const prepared=parsed.pages.map(p=>({
  url:p.url,
  title:p.title,
  h1:p.h1,
  normalizedQuery:(p.primaryQuery||'').trim().toLowerCase(),
  tokens:tokenize([p.primaryQuery||'',p.title,p.h1,...p.headings.slice(0,5)].join(' '))
 }));

 const pairs=[];
 const findings=[];

 for(let i=0;i<prepared.length;i+=1){
  for(let j=i+1;j<prepared.length;j+=1){
   const a=prepared[i];
   const b=prepared[j];
   const exactQuery=Boolean(a.normalizedQuery&&b.normalizedQuery&&a.normalizedQuery===b.normalizedQuery);
   const similarity=exactQuery?1:Number(jaccard(a.tokens,b.tokens).toFixed(4));
   if(exactQuery||similarity>=parsed.overlapThreshold){
    const shared=[...a.tokens].filter(t=>b.tokens.has(t)).slice(0,8);
    pairs.push({
     urlA:a.url,
     urlB:b.url,
     similarity,
     exactQuery,
     sharedTerms:shared
    });
    findings.push({
     code:exactQuery?'CANNIBALIZATION_EXACT_QUERY':'CANNIBALIZATION_HIGH_OVERLAP',
     severity:exactQuery?'error':'warning',
     urlA:a.url,
     urlB:b.url,
     similarity,
     sharedTerms:shared,
     message:exactQuery
      ?`Pages ${a.url} and ${b.url} target the exact same primaryQuery "${a.normalizedQuery}".`
      :`Pages ${a.url} and ${b.url} share ${Math.round(similarity*100)}% intent token overlap (${shared.join(', ')}).`,
     recommendation:'Consolidate overlapping pages via 301/canonical or differentiate primaryQuery, <title>, and H1.'
    });
   }
  }
 }

 return {
  ok:findings.every(f=>f.severity!=='error'),
  summary:{
   pagesChecked:prepared.length,
   overlappingPairs:pairs.length,
   exactQueryConflicts:findings.filter(f=>f.code==='CANNIBALIZATION_EXACT_QUERY').length
  },
  pairs,
  findings
 };
}
