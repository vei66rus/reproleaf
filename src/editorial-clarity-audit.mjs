import {z} from 'zod';

export const editorialClaritySchema=z.object({
 markdown:z.string().min(1).max(200000),
 locale:z.enum(['ru','en']).default('en')
}).strict();

const clichePatterns={
 en:[
  /\bin today'?s fast-paced world\b/i,
  /\bdelve into\b/i,
  /\bit is worth noting\b/i,
  /\btestament to\b/i,
  /\btapestry of\b/i,
  /\bgame-changer\b/i,
  /\bunlock the full potential\b/i,
  /\bin conclusion,?\s/i
 ],
 ru:[
  /в современном мире/iu,
  /не секрет,?\s+что/iu,
  /в заключение стоит отметить/iu,
  /играет ключевую роль/iu,
  /является мощным инструментом/iu,
  /раскро(?:йте|ет)\s+весь потенциал/iu,
  /подводя итог/iu
 ]
};

function countWords(text){
 const matches=text.match(/[\p{L}\p{N}-]+/gu);
 return matches?matches.length:0;
}

export function auditEditorialClarity(rawInput){
 const parsed=editorialClaritySchema.parse(rawInput);
 const lines=parsed.markdown.split(/\r?\n/);

 let inFence=false;
 let proseRunWords=0;
 let totalWords=0;
 let listOrTableLines=0;
 let wallCount=0;
 const longSentences=[];
 const foundCliches=[];

 const proseLines=[];

 for(const line of lines){
  const trimmed=line.trim();
  if(trimmed.startsWith('```')||trimmed.startsWith('~~~')){
   inFence=!inFence;
   continue;
  }
  if(inFence)continue;

  if(/^#{1,6}\s+/.test(trimmed)){
   if(proseRunWords>280)wallCount+=1;
   proseRunWords=0;
   continue;
  }
  if(/^[-*+]\s+/.test(trimmed)||/^\d+\.\s+/.test(trimmed)||trimmed.startsWith('|')){
   if(proseRunWords>280)wallCount+=1;
   proseRunWords=0;
   listOrTableLines+=1;
  }
  const w=countWords(trimmed);
  totalWords+=w;
  if(!(/^[-*+]\s+/.test(trimmed)||/^\d+\.\s+/.test(trimmed)||trimmed.startsWith('|'))){
   proseRunWords+=w;
   if(trimmed)proseLines.push(trimmed);
  }
 }
 if(proseRunWords>280)wallCount+=1;

 const proseText=proseLines.join(' ');
 const sentences=proseText.split(/(?<=[.!?])\s+/).filter(Boolean);
 for(const s of sentences){
  if(countWords(s)>28)longSentences.push(s.slice(0,180));
 }

 const activeCliches=[...clichePatterns[parsed.locale],...clichePatterns[parsed.locale==='ru'?'en':'ru']];
 for(const rx of activeCliches){
  const m=proseText.match(rx);
  if(m)foundCliches.push(m[0]);
 }

 const findings=[];
 if(wallCount>0){
  findings.push({
   code:'EDITORIAL_WALL_OF_TEXT',
   severity:'warning',
   count:wallCount,
   message:`Detected ${wallCount} continuous prose section(s) exceeding 280 words without headings or lists.`,
   recommendation:'Break long prose runs with descriptive H2/H3 subheadings, bullet lists, or comparison tables.'
  });
 }
 if(longSentences.length>0){
  findings.push({
   code:'EDITORIAL_LONG_SENTENCE',
   severity:'warning',
   count:longSentences.length,
   samples:longSentences.slice(0,3),
   message:`Found ${longSentences.length} sentence(s) exceeding 28 words.`,
   recommendation:'Split dense sentences into direct subject-verb statements.'
  });
 }
 if(foundCliches.length>0){
  findings.push({
   code:'EDITORIAL_AI_CLICHE',
   severity:'warning',
   matches:foundCliches,
   message:`Detected ${foundCliches.length} generic filler/cliche phrase(s): ${foundCliches.join(', ')}.`,
   recommendation:'Replace generic filler phrases with concrete facts, measurements, or examples.'
  });
 }
 if(totalWords>=400&&listOrTableLines===0){
  findings.push({
   code:'EDITORIAL_LOW_SCANNABILITY',
   severity:'info',
   message:`Article has ${totalWords} words with zero bullet lists or tables.`,
   recommendation:'Add structured lists or tables to improve reader and AI-extractor scannability.'
  });
 }

 return {
  ok:findings.every(f=>f.severity!=='error'),
  summary:{
   totalWords,
   sentencesChecked:sentences.length,
   longSentences:longSentences.length,
   wallOfTextSections:wallCount,
   cliches:foundCliches.length,
   listOrTableLines
  },
  findings
 };
}
