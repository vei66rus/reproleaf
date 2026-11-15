import {z} from 'zod';

export const ragChunkAuditSchema=z.object({
 text:z.string().min(1).max(200000),
 locale:z.enum(['ru','en']).default('en'),
 targetWordsPerChunk:z.number().int().min(30).max(300).default(90)
}).strict();

const dependentOpeningsEn=new Set(['it','this','that','they','these','those','he','she','such','there']);
const dependentOpeningsRu=new Set(['это','оно','он','она','они','эти','те','такой','такая','такое','данный','данная','данное','тут','здесь']);

function firstWord(text){
 const match=text.match(/[\p{L}\p{N}]+/u);
 return match?match[0].toLowerCase():'';
}

function countWords(text){
 return text.trim().split(/\s+/).filter(Boolean).length;
}

export function auditRagChunks(rawInput){
 const parsed=ragChunkAuditSchema.parse(rawInput);
 const lines=parsed.text.split(/\r?\n/);
 const chunks=[];
 let currentHeading=null;
 let buffer=[];
 let inCodeFence=false;

 function flush(){
  const raw=buffer.join(' ').replace(/\s+/g,' ').trim();
  buffer=[];
  if(!raw)return;
  if(/^[-*_]{3,}$/.test(raw))return;
  const words=countWords(raw);
  const opener=firstWord(raw);
  const pronounSet=parsed.locale==='ru'?dependentOpeningsRu:dependentOpeningsEn;
  const pronounDependent=pronounSet.has(opener);
  chunks.push({
   index:chunks.length,
   heading:currentHeading,
   words,
   opener,
   pronounDependent,
   excerpt:raw.slice(0,140)
  });
 }

 for(const rawLine of lines){
  const line=rawLine.trim();
  if(line.startsWith('```')||line.startsWith('~~~')){
   flush();
   inCodeFence=!inCodeFence;
   continue;
  }
  if(inCodeFence)continue;
  const headingMatch=line.match(/^#{1,6}\s+(.+)$/);
  if(headingMatch){
   flush();
   currentHeading=headingMatch[1].trim();
   continue;
  }
  if(!line){
   flush();
   continue;
  }
  if(/^(?:[-*+]|\d+\.)\s+/.test(line)){
   flush();
   buffer.push(line.replace(/^(?:[-*+]|\d+\.)\s+/,''));
   flush();
   continue;
  }
  buffer.push(line);
 }
 flush();

 const findings=[];
 let pronounDependentOpenings=0;
 let oversizedChunks=0;
 let undersizedChunks=0;
 let autonomousChunks=0;

 for(const chunk of chunks){
  let isAutonomous=true;
  if(chunk.pronounDependent){
   pronounDependentOpenings+=1;
   isAutonomous=false;
   findings.push({
    code:'RAG_PRONOUN_DEPENDENT_OPENING',
    severity:'warning',
    chunkIndex:chunk.index,
    heading:chunk.heading,
    message:`Chunk ${chunk.index} starts with context-dependent word "${chunk.opener}": "${chunk.excerpt}".`,
    recommendation:'Name the explicit subject or entity in the first sentence so the passage stands alone when extracted.'
   });
  }
  if(chunk.words>200){
   oversizedChunks+=1;
   isAutonomous=false;
   findings.push({
    code:'RAG_CHUNK_TOO_LONG',
    severity:'warning',
    chunkIndex:chunk.index,
    heading:chunk.heading,
    message:`Chunk ${chunk.index} is ${chunk.words} words (> 200), reducing single-passage extractability.`,
    recommendation:`Split long passages into focused sub-paragraphs around ${parsed.targetWordsPerChunk} words.`
   });
  }else if(chunk.words<12){
   undersizedChunks+=1;
   isAutonomous=false;
   findings.push({
    code:'RAG_CHUNK_TOO_SHORT',
    severity:'warning',
    chunkIndex:chunk.index,
    heading:chunk.heading,
    message:`Chunk ${chunk.index} has only ${chunk.words} words (< 12): "${chunk.excerpt}".`,
    recommendation:'Expand fragmentary lines or merge them with their supporting explanation.'
   });
  }
  if(isAutonomous)autonomousChunks+=1;
 }

 const extractabilityRate=chunks.length?Number((autonomousChunks/chunks.length).toFixed(2)):0;
 return {
  ok:chunks.length>0,
  locale:parsed.locale,
  summary:{
   chunks:chunks.length,
   autonomousChunks,
   pronounDependentOpenings,
   oversizedChunks,
   undersizedChunks,
   extractabilityRate,
   warnings:findings.length
  },
  chunks,
  findings,
  limits:['Deterministic passage boundary and opener check; does not simulate proprietary LLM retrieval ranking.']
 };
}
