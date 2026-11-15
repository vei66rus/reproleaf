import {z} from 'zod';

const httpUrlSchema=z.string().url().max(2048).refine(u=>{
 const protocol=new URL(u).protocol;
 return protocol==='http:'||protocol==='https:';
},{message:'URL must use http or https'});

export const llmsBundlePageSchema=z.object({
 url:httpUrlSchema,
 title:z.string().trim().min(1).max(200),
 section:z.string().trim().min(1).max(60).default('Docs'),
 description:z.string().trim().min(1).max(400).optional(),
 markdown:z.string().max(100000).optional(),
 optional:z.boolean().default(false)
}).strict();

export const llmsBundleSchema=z.object({
 siteTitle:z.string().trim().min(1).max(160),
 summary:z.string().trim().min(1).max(600).optional(),
 maxFullTokens:z.number().int().min(500).max(200000).default(32000),
 pages:z.array(llmsBundlePageSchema).min(1).max(200)
}).strict().superRefine((val,ctx)=>{
 const seen=new Set();
 for(const page of val.pages){
  if(seen.has(page.url)){
   ctx.addIssue({code:z.ZodIssueCode.custom,message:`Duplicate page URL: ${page.url}`});
   return;
  }
  seen.add(page.url);
 }
});

export function estimateTokens(text){
 if(!text)return 0;
 return Math.ceil(text.length/4);
}

function sanitizeLine(text){
 return text.replace(/[\r\n]+/g,' ').trim();
}

export function buildLlmsBundle(rawInput){
 const input=llmsBundleSchema.parse(rawInput);

 const indexLines=[`# ${sanitizeLine(input.siteTitle)}`];
 if(input.summary){
  indexLines.push(`> ${sanitizeLine(input.summary)}`);
 }

 const grouped=new Map();
 const optionalPages=[];

 for(const page of input.pages){
  if(page.optional||page.section.toLowerCase()==='optional'){
   optionalPages.push(page);
   continue;
  }
  if(!grouped.has(page.section))grouped.set(page.section,[]);
  grouped.get(page.section).push(page);
 }

 const preferredOrder=['Docs','Tools','Blog'];
 const sectionNames=[
  ...preferredOrder.filter(name=>grouped.has(name)),
  ...[...grouped.keys()].filter(name=>!preferredOrder.includes(name))
 ];

 for(const section of sectionNames){
  indexLines.push('',`## ${sanitizeLine(section)}`);
  for(const page of grouped.get(section)){
   const title=sanitizeLine(page.title);
   const desc=page.description?`: ${sanitizeLine(page.description)}`:'';
   indexLines.push(`- [${title}](${page.url})${desc}`);
  }
 }

 if(optionalPages.length>0){
  indexLines.push('','## Optional');
  for(const page of optionalPages){
   const title=sanitizeLine(page.title);
   const desc=page.description?`: ${sanitizeLine(page.description)}`:'';
   indexLines.push(`- [${title}](${page.url})${desc}`);
  }
 }

 const llmsTxt=indexLines.join('\n')+'\n';

 const headerParts=[`# ${sanitizeLine(input.siteTitle)}`];
 if(input.summary){
  headerParts.push(`> ${sanitizeLine(input.summary)}`);
 }
 const fullParts=[headerParts.join('\n')];
 let currentTokens=estimateTokens(fullParts[0]);

 const orderedForFull=[
  ...sectionNames.flatMap(name=>grouped.get(name)),
  ...optionalPages
 ];

 const includedUrls=[];
 const omittedUrls=[];

 for(const page of orderedForFull){
  const body=(page.markdown&&page.markdown.trim())||page.description||'';
  if(!body)continue;
  const block=`\n## ${sanitizeLine(page.title)}\nSource: ${page.url}\n\n${body.trim()}\n`;
  const blockTokens=estimateTokens(block);
  if(currentTokens+blockTokens>input.maxFullTokens){
   omittedUrls.push(page.url);
   continue;
  }
  fullParts.push(block);
  currentTokens+=blockTokens;
  includedUrls.push(page.url);
 }

 const llmsFullTxt=fullParts.join('\n').trimEnd()+'\n';

 return {
  ok:true,
  llmsTxt,
  llmsFullTxt,
  summary:{
   totalPages:input.pages.length,
   sections:[...sectionNames,...(optionalPages.length>0?['Optional']:[])],
   estimatedIndexTokens:estimateTokens(llmsTxt),
   estimatedFullTokens:estimateTokens(llmsFullTxt),
   maxFullTokens:input.maxFullTokens,
   includedInFullCount:includedUrls.length,
   omittedFromFullCount:omittedUrls.length,
   omittedUrls
  }
 };
}
