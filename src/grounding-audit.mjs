import {z} from 'zod';

export const groundingAuditSchema=z.object({
 markdown:z.string().min(1).max(200000),
 sources:z.array(z.object({
  id:z.string().min(1).max(64),
  url:z.string().url().max(2048).optional(),
  title:z.string().max(300).optional()
 }).strict()).max(200).default([])
}).strict();

const metricClaimPattern=/\b\d+(?:[.,]\d+)?\s?(?:%|\u2030|(?:x|ms|s|kb|mb|gb|usd|eur|rub)\b)|\$\d+(?:[.,]\d+)?/i;
const inlineLinkOrCitationPattern=/\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\[\^?[a-zA-Z0-9_-]{1,32}\]|https?:\/\/\S+/;
const attributionCuePattern=/\b(?:according to|measured|benchmark|study|survey|source:|dataset|по данным|исследование|замер|методика|источник:)\b/iu;

function stripCodeFences(markdown){
 const lines=markdown.split(/\r?\n/);
 const out=[];
 let inFence=false;
 for(const line of lines){
  const trimmed=line.trim();
  if(trimmed.startsWith('```')||trimmed.startsWith('~~~')){
   inFence=!inFence;
   out.push('');
   continue;
  }
  if(!inFence&&!trimmed.startsWith('#')){
   out.push(line);
  }else{
   out.push('');
  }
 }
 return out.join('\n');
}

export function auditClaimGrounding(rawInput){
 const parsed=groundingAuditSchema.parse(rawInput);
 const cleaned=stripCodeFences(parsed.markdown);
 const paragraphs=cleaned.split(/\r?\n\s*\r?\n/).map(p=>p.replace(/\s+/g,' ').trim()).filter(Boolean);

 const knownSourceIds=new Set(parsed.sources.map(s=>s.id));
 const knownSourceUrls=new Set(parsed.sources.filter(s=>s.url).map(s=>s.url));
 const referencedCitations=new Set();

 const claims=[];
 const findings=[];
 let sentencesChecked=0;
 let groundedClaims=0;
 let ungroundedClaims=0;

 for(const [pIndex,paragraph] of paragraphs.entries()){
  const paragraphHasLink=inlineLinkOrCitationPattern.test(paragraph);
  const paragraphHasCue=attributionCuePattern.test(paragraph);
  const sentences=paragraph.split(/(?<=[.!?])\s+/).filter(Boolean);
  for(const sentence of sentences){
   sentencesChecked+=1;
   const citationMatches=[...sentence.matchAll(/\[\^?([a-zA-Z0-9_-]{1,32})\](?!\()/g)];
   for(const m of citationMatches)referencedCitations.add(m[1]);

   if(!metricClaimPattern.test(sentence))continue;
   const hasOwnLink=inlineLinkOrCitationPattern.test(sentence);
   const hasOwnCue=attributionCuePattern.test(sentence);
   const grounded=hasOwnLink||hasOwnCue||paragraphHasLink||paragraphHasCue;
   if(grounded)groundedClaims+=1;
   else{
    ungroundedClaims+=1;
    findings.push({
     code:'GROUNDING_UNSUPPORTED_METRIC_CLAIM',
     severity:'warning',
     paragraphIndex:pIndex,
     quote:sentence.slice(0,240),
     message:`Quantitative claim has no nearby source link or attribution cue: "${sentence.slice(0,120)}".`,
     recommendation:'Attach a primary source URL, citation ID, or explicit measurement methodology.'
    });
   }
   claims.push({
    paragraphIndex:pIndex,
    quote:sentence.slice(0,240),
    grounded,
    basis:hasOwnLink||paragraphHasLink?'link-or-citation':hasOwnCue||paragraphHasCue?'methodology-cue':'none'
   });
  }
 }

 if(knownSourceIds.size>0){
  for(const refId of referencedCitations){
   if(!knownSourceIds.has(refId)){
    findings.push({
     code:'GROUNDING_UNKNOWN_SOURCE_REF',
     severity:'error',
     paragraphIndex:null,
     quote:`[${refId}]`,
     message:`Citation "[${refId}]" does not match any entry in supplied sources.`,
     recommendation:'Add the missing source entry or fix the citation identifier.'
    });
   }
  }
 }

 const metricClaims=claims.length;
 const groundingRate=metricClaims?Number((groundedClaims/metricClaims).toFixed(2)):1;
 const errors=findings.filter(f=>f.severity==='error').length;
 const warnings=findings.filter(f=>f.severity==='warning').length;

 return {
  ok:errors===0,
  summary:{
   sentencesChecked,
   metricClaims,
   groundedClaims,
   ungroundedClaims,
   groundingRate,
   knownSources:knownSourceIds.size+knownSourceUrls.size,
   errors,
   warnings
  },
  claims,
  findings,
  limits:['Detects quantitative claims and nearby markdown citations/methodology cues without verifying external source truth.']
 };
}
