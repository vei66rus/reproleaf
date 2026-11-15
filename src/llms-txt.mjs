import {z} from 'zod';

export const llmsTxtAuditSchema=z.object({
 content:z.string().min(1).max(524288),
 siteUrl:z.string().url().max(2048).optional()
}).strict();

export const llmsTxtGenerateSchema=z.object({
 title:z.string().min(1).max(200),
 summary:z.string().min(1).max(600),
 details:z.string().max(4000).optional(),
 sections:z.array(z.object({
  heading:z.string().min(1).max(120),
  links:z.array(z.object({
   title:z.string().min(1).max(200),
   url:z.string().url().max(2048),
   description:z.string().max(400).optional()
  }).strict()).min(1).max(100)
 }).strict()).min(1).max(30)
}).strict();

export function auditLlmsTxt(rawInput){
 const parsed=llmsTxtAuditSchema.parse(rawInput);
 const lines=parsed.content.split(/\r?\n/);
 const findings=[];
 const siteOrigin=parsed.siteUrl?new URL(parsed.siteUrl).origin:null;

 let title=null;
 let h1Count=0;
 let firstNonEmptySeen=false;
 let summaryLines=[];
 let inSummary=false;
 const sections=[];
 let currentSection=null;
 const allLinks=[];
 const seenUrls=new Set();

 const linkPattern=/^\s*[-*]\s+\[([^\]]+)\]\(([^\s]+)\)(?:\s*:\s*(.+))?$/;

 for(const rawLine of lines){
  const line=rawLine.trim();
  if(!line){
   if(inSummary&&summaryLines.length>0)inSummary=false;
   continue;
  }
  if(!firstNonEmptySeen){
   firstNonEmptySeen=true;
   if(!line.startsWith('# ')){
    findings.push({
     code:'LLMS_MISSING_H1',
     severity:'error',
     target:'line:1',
     message:'llms.txt must start with an H1 heading (# Site Name).',
     recommendation:'Place a single "# <Project or Site Name>" heading on the first non-empty line.'
    });
   }
  }
  if(line.startsWith('# ')){
   h1Count+=1;
   if(h1Count===1){
    title=line.slice(2).trim();
    inSummary=true;
   }else{
    findings.push({
     code:'LLMS_MULTIPLE_H1',
     severity:'error',
     target:line,
     message:'Multiple H1 headings found in llms.txt.',
     recommendation:'Keep exactly one H1 heading at the top and use ## for sections.'
    });
   }
   continue;
  }
  if(line.startsWith('>')){
   if(inSummary){
    summaryLines.push(line.replace(/^>\s?/,'').trim());
   }
   continue;
  }
  inSummary=false;
  if(line.startsWith('## ')){
   currentSection={heading:line.slice(3).trim(),links:[]};
   sections.push(currentSection);
   continue;
  }
  const match=rawLine.match(linkPattern);
  if(match){
   const linkTitle=match[1].trim();
   const url=match[2].trim();
   const description=match[3]?match[3].trim():null;
   const entry={
    section:currentSection?currentSection.heading:null,
    title:linkTitle,
    url,
    description
   };
   allLinks.push(entry);
   if(currentSection)currentSection.links.push(entry);

   if(/^(?:javascript|data|vbscript):/i.test(url)){
    findings.push({
     code:'LLMS_UNSAFE_LINK_SCHEME',
     severity:'error',
     target:url,
     message:`Unsafe URL scheme in llms.txt link "${linkTitle}".`,
     recommendation:'Use https:// URLs only.'
    });
   }else if(!/^https?:\/\//i.test(url)){
    findings.push({
     code:'LLMS_RELATIVE_LINK',
     severity:'warning',
     target:url,
     message:`Relative link "${url}" found in llms.txt.`,
     recommendation:'Use absolute https:// URLs so LLM crawlers can resolve resources from any context.'
    });
   }else if(siteOrigin){
    try{
     if(new URL(url).origin!==siteOrigin){
      findings.push({
       code:'LLMS_CROSS_ORIGIN_LINK',
       severity:'warning',
       target:url,
       message:`Link "${url}" points outside site origin "${siteOrigin}".`,
       recommendation:'Verify that external links in llms.txt are intentional.'
      });
     }
    }catch{
     findings.push({
      code:'LLMS_INVALID_URL',
      severity:'error',
      target:url,
      message:`Invalid URL "${url}" in llms.txt.`,
      recommendation:'Replace with a valid absolute https:// URL.'
     });
    }
   }

   if(seenUrls.has(url)){
    findings.push({
     code:'LLMS_DUPLICATE_LINK',
     severity:'warning',
     target:url,
     message:`Duplicate URL "${url}" listed in llms.txt.`,
     recommendation:'List each canonical resource once.'
    });
   }else{
    seenUrls.add(url);
   }
  }
 }

 const summaryText=summaryLines.join(' ').trim()||null;
 if(!summaryText){
  findings.push({
   code:'LLMS_MISSING_SUMMARY_BLOCKQUOTE',
   severity:'warning',
   target:'summary',
   message:'Missing blockquote summary (> ...) right below the H1 heading.',
   recommendation:'Add a concise > summary line describing the site or project.'
  });
 }
 if(sections.length===0||allLinks.length===0){
  findings.push({
   code:'LLMS_NO_SECTIONS_OR_LINKS',
   severity:'error',
   target:'sections',
   message:'llms.txt should contain at least one ## section and one markdown list link.',
   recommendation:'Add ## sections with "- [Title](https://...): description" entries.'
  });
 }

 const errors=findings.filter(f=>f.severity==='error').length;
 const warnings=findings.filter(f=>f.severity==='warning').length;
 return {
  ok:errors===0,
  title,
  summaryText,
  summary:{
   errors,
   warnings,
   sections:sections.length,
   links:allLinks.length
  },
  sections,
  findings,
  limits:['Validates supplied llms.txt Markdown structure locally without fetching linked URLs.']
 };
}

export function generateLlmsTxt(rawInput){
 const parsed=llmsTxtGenerateSchema.parse(rawInput);
 const blocks=[
  `# ${parsed.title.trim()}`,
  '',
  `> ${parsed.summary.trim().replace(/\r?\n+/g,' ')}`
 ];
 if(parsed.details&&parsed.details.trim()){
  blocks.push('',parsed.details.trim());
 }
 for(const section of parsed.sections){
  blocks.push('',`## ${section.heading.trim()}`,'');
  for(const link of section.links){
   const desc=link.description&&link.description.trim()?`: ${link.description.trim()}`:'';
   blocks.push(`- [${link.title.trim()}](${link.url.trim()})${desc}`);
  }
 }
 const llmsTxt=blocks.join('\n')+'\n';
 const audit=auditLlmsTxt({content:llmsTxt});
 return {
  ok:audit.ok,
  bytes:Buffer.byteLength(llmsTxt,'utf8'),
  llmsTxt,
  audit
 };
}
