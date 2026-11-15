import {z} from 'zod';

export const answerFirstSchema=z.object({
 markdown:z.string().min(1).max(200000).optional(),
 html:z.string().min(1).max(200000).optional(),
 maxFirstParagraphWords:z.number().int().min(20).max(150).default(65)
}).strict().superRefine((val,ctx)=>{
 if(!val.markdown&&!val.html){
  ctx.addIssue({code:z.ZodIssueCode.custom,message:'Provide markdown or html'});
 }
});

const questionStarterRe=/^(?:how|what|why|when|where|who|which|can|does|do|is|are|should|will|would|как|что|почему|зачем|когда|где|кто|какой|какая|какое|какие|сколько|можно ли|нужно ли|стоит ли|есть ли|чем)\b/iu;

const fillerPreamblePatterns=[
 /^(?:in this (?:section|article|guide|post)|let'?s (?:explore|look at|dive into|discuss|examine)|before we (?:begin|start|dive)|when it comes to|as we all know|there are many reasons|it is important to note that|in today'?s)\b/i,
 /^(?:в (?:этом разделе|данной статье|этой статье|нашем руководстве)|давайте (?:разбер[её]мся|рассмотрим|узнаем|посмотрим)|прежде чем (?:начать|перейти)|как (?:известно|правило|мы знаем)|многие задаются вопросом|важно отметить,?\s*что|в современном мире)/iu
];

function countWords(text){
 const matches=text.match(/[\p{L}\p{N}-]+/gu);
 return matches?matches.length:0;
}

function stripInlineMarkdown(text){
 return text
  .replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
  .replace(/`([^`]+)`/g,'$1')
  .replace(/(\*\*|__|\*|_|~~)/g,'')
  .replace(/\s+/g,' ')
  .trim();
}

function decodeHtmlEntities(text){
 return text
  .replace(/&nbsp;/gi,' ')
  .replace(/&amp;/gi,'&')
  .replace(/&lt;/gi,'<')
  .replace(/&gt;/gi,'>')
  .replace(/&quot;/gi,'"')
  .replace(/&#39;/gi,"'");
}

function stripHtmlTags(text){
 return decodeHtmlEntities(text.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
}

function extractMarkdownSections(markdown){
 const lines=markdown.split(/\r?\n/);
 const sections=[];
 let inFence=false;
 let current=null;
 let collectingPara=false;
 let seenPara=false;
 const paraLines=[];

 function flushPara(){
  if(current&&!seenPara&&paraLines.length>0){
   current.firstParagraph=stripInlineMarkdown(paraLines.join(' '));
   seenPara=true;
  }
  paraLines.length=0;
  collectingPara=false;
 }

 for(const line of lines){
  const trimmed=line.trim();
  if(trimmed.startsWith('```')||trimmed.startsWith('~~~')){
   flushPara();
   if(current&&!seenPara)seenPara=true;
   inFence=!inFence;
   continue;
  }
  if(inFence)continue;

  const headingMatch=/^(#{2,3})\s+(.+?)\s*#*$/.exec(trimmed);
  if(headingMatch){
   flushPara();
   if(current)sections.push(current);
   current={
    level:headingMatch[1].length,
    heading:stripInlineMarkdown(headingMatch[2]),
    firstParagraph:''
   };
   seenPara=false;
   collectingPara=false;
   continue;
  }

  if(/^#\s+/.test(trimmed)||/^#{4,6}\s+/.test(trimmed)){
   flushPara();
   if(current){
    sections.push(current);
    current=null;
   }
   continue;
  }

  if(!current||seenPara)continue;

  if(!trimmed){
   if(collectingPara)flushPara();
   continue;
  }

  if(/^[-*+]\s+/.test(trimmed)||/^\d+\.\s+/.test(trimmed)||trimmed.startsWith('|')||trimmed.startsWith('>')){
   flushPara();
   seenPara=true;
   continue;
  }

  collectingPara=true;
  paraLines.push(trimmed);
 }

 flushPara();
 if(current)sections.push(current);
 return sections;
}

function extractHtmlSections(html){
 const cleaned=html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,' ')
  .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi,' ');

 const sections=[];
 const headingRe=/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
 const matches=[];
 let m;
 while((m=headingRe.exec(cleaned))!==null){
  matches.push({
   level:Number(m[1]),
   heading:stripHtmlTags(m[2]),
   afterIndex:m.index+m[0].length,
   startIndex:m.index
  });
 }

 for(let i=0;i<matches.length;i+=1){
  const item=matches[i];
  const nextHeadingRe=/<h[1-6]\b/i;
  const rest=cleaned.slice(item.afterIndex);
  const nextHeadingMatch=nextHeadingRe.exec(rest);
  const boundary=nextHeadingMatch?nextHeadingMatch.index:rest.length;
  const slice=rest.slice(0,boundary);
  const pMatch=/<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(slice);
  sections.push({
   level:item.level,
   heading:item.heading,
   firstParagraph:pMatch?stripHtmlTags(pMatch[1]):''
  });
 }
 return sections;
}

export function auditAnswerFirst(rawInput){
 const parsed=answerFirstSchema.parse(rawInput);
 const rawSections=parsed.markdown
  ?extractMarkdownSections(parsed.markdown)
  :extractHtmlSections(parsed.html);

 const findings=[];
 const sections=[];
 let questionHeadings=0;
 let snippetReadyHeadings=0;
 let overlongCount=0;
 let fillerCount=0;
 let missingParagraphCount=0;

 for(const sec of rawSections){
  const isQuestion=sec.heading.includes('?')||questionStarterRe.test(sec.heading);
  if(isQuestion)questionHeadings+=1;

  const firstParagraphWords=countWords(sec.firstParagraph);
  const issues=[];

  if(!sec.firstParagraph||firstParagraphWords===0){
   missingParagraphCount+=1;
   issues.push('missing-answer-paragraph');
   findings.push({
    code:'missing-answer-paragraph',
    severity:isQuestion?'error':'warn',
    heading:sec.heading,
    message:`Heading "${sec.heading}" has no direct prose paragraph immediately following it.`,
    suggestion:'Add a concise 40-65 word answer paragraph directly under the heading before lists, tables, or code blocks.'
   });
  }else{
   if(firstParagraphWords>parsed.maxFirstParagraphWords){
    overlongCount+=1;
    issues.push('overlong-first-paragraph');
    findings.push({
     code:'overlong-first-paragraph',
     severity:'warn',
     heading:sec.heading,
     message:`First paragraph under "${sec.heading}" is ${firstParagraphWords} words (limit ${parsed.maxFirstParagraphWords}).`,
     suggestion:`Trim the opening paragraph to <= ${parsed.maxFirstParagraphWords} words so it fits featured snippets and AI answer extraction.`
    });
   }
   if(fillerPreamblePatterns.some(re=>re.test(sec.firstParagraph))){
    fillerCount+=1;
    issues.push('filler-preamble');
    findings.push({
     code:'filler-preamble',
     severity:'warn',
     heading:sec.heading,
     message:`First paragraph under "${sec.heading}" opens with a filler preamble instead of a direct answer.`,
     suggestion:'Remove meta-commentary and start the very first sentence with the concrete fact or definition.'
    });
   }
  }

  const snippetReady=issues.length===0;
  if(snippetReady)snippetReadyHeadings+=1;

  sections.push({
   level:sec.level,
   heading:sec.heading,
   isQuestion,
   firstParagraphWords,
   snippetReady,
   issues
  });
 }

 const ok=findings.every(f=>f.severity!=='error');
 return {
  ok,
  summary:{
   totalHeadings:sections.length,
   questionHeadings,
   snippetReadyHeadings,
   overlongCount,
   fillerCount,
   missingParagraphCount,
   maxFirstParagraphWords:parsed.maxFirstParagraphWords
  },
  sections,
  findings
 };
}
