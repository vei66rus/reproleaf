import {z} from 'zod';
import {estimateTokens} from './llms-bundle.mjs';

const httpUrlSchema=z.string().url().max(2048).refine(u=>{
 const protocol=new URL(u).protocol;
 return protocol==='http:'||protocol==='https:';
},{message:'URL must use http or https'});

export const llmsBudgetSchema=z.object({
 llmsTxt:z.string().min(1).max(200000),
 targetContextTokens:z.number().int().min(1000).max(200000).default(32000),
 pages:z.array(z.object({
  url:httpUrlSchema,
  markdown:z.string().max(200000)
 }).strict()).max(200).optional()
}).strict();

export function auditLlmsBudget(rawInput){
 const input=llmsBudgetSchema.parse(rawInput);
 const lines=input.llmsTxt.split(/\r?\n/);

 let currentSection='Root';
 const links=[];
 const seenUrls=new Set();
 const duplicateUrls=[];

 for(const line of lines){
  const trimmed=line.trim();
  const h2Match=/^##\s+(.+?)\s*$/.exec(trimmed);
  if(h2Match){
   currentSection=h2Match[1];
   continue;
  }
  const linkRe=/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let m;
  while((m=linkRe.exec(trimmed))!==null){
   const url=m[2];
   if(seenUrls.has(url)){
    duplicateUrls.push(url);
   }else{
    seenUrls.add(url);
   }
   links.push({
    title:m[1].trim(),
    url,
    section:currentSection,
    isOptional:currentSection.toLowerCase()==='optional'
   });
  }
 }

 const pageMap=new Map();
 if(input.pages){
  for(const p of input.pages){
   pageMap.set(p.url,p.markdown);
  }
 }

 let coreTokens=0;
 let optionalTokens=0;
 const missingTargets=[];
 const coreBreakdown=[];

 for(const link of links){
  if(!input.pages)continue;
  if(!pageMap.has(link.url)){
   missingTargets.push(link.url);
   continue;
  }
  const tokens=estimateTokens(pageMap.get(link.url));
  if(link.isOptional){
   optionalTokens+=tokens;
  }else{
   coreTokens+=tokens;
   coreBreakdown.push({url:link.url,title:link.title,section:link.section,tokens});
  }
 }

 coreBreakdown.sort((a,b)=>b.tokens-a.tokens);

 const indexTokens=estimateTokens(input.llmsTxt);
 const totalLinkedTokens=coreTokens+optionalTokens;
 const findings=[];

 if(links.length===0){
  findings.push({
   code:'empty-llms-links',
   severity:'error',
   message:'No HTTP/HTTPS Markdown links were found in llms.txt.',
   suggestion:'Add curated sections (for example ## Docs) with - [Title](URL) entries.'
  });
 }

 for(const dup of duplicateUrls){
  findings.push({
   code:'duplicate-url',
   severity:'error',
   message:`Duplicate URL in llms.txt: ${dup}`,
   suggestion:'Keep each canonical URL listed once in the most relevant section.'
  });
 }

 if(indexTokens>4000){
  findings.push({
   code:'oversized-index',
   severity:'warn',
   message:`llms.txt index itself is ${indexTokens} estimated tokens (recommended <= 4000).`,
   suggestion:'Shorten link descriptions or move secondary links to ## Optional.'
  });
 }

 if(input.pages&&missingTargets.length>0){
  for(const missing of missingTargets){
   findings.push({
    code:'missing-page-content',
    severity:'warn',
    message:`Linked URL has no matching entry in supplied pages: ${missing}`,
    suggestion:'Verify the URL is live and included in the bundle or remove stale links.'
   });
  }
 }

 if(input.pages&&coreTokens>input.targetContextTokens){
  const topCandidates=coreBreakdown.slice(0,3).map(item=>`${item.url} (${item.tokens} tok)`).join(', ');
  findings.push({
   code:'oversized-core-budget',
   severity:'error',
   message:`Core linked content is ${coreTokens} estimated tokens, exceeding target context window of ${input.targetContextTokens}.`,
   suggestion:topCandidates
    ?`Move largest secondary pages to ## Optional: ${topCandidates}`
    :'Move secondary pages to ## Optional to fit the target context window.'
  });
 }else if(input.pages&&coreTokens>Math.floor(input.targetContextTokens*0.75)){
  findings.push({
   code:'core-budget-near-limit',
   severity:'warn',
   message:`Core linked content is ${coreTokens} estimated tokens (>75% of ${input.targetContextTokens}).`,
   suggestion:'Consider moving reference/archive links into ## Optional.'
  });
 }

 const ok=findings.every(f=>f.severity!=='error');
 return {
  ok,
  summary:{
   totalLinks:links.length,
   coreLinks:links.filter(l=>!l.isOptional).length,
   optionalLinks:links.filter(l=>l.isOptional).length,
   duplicateCount:duplicateUrls.length,
   missingTargetCount:missingTargets.length,
   indexTokens,
   coreTokens,
   optionalTokens,
   totalLinkedTokens,
   targetContextTokens:input.targetContextTokens
  },
  largestCorePages:coreBreakdown.slice(0,5),
  findings
 };
}
