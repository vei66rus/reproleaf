import {z} from 'zod';
import {validateMethodologyResult} from './methodology-packets.mjs';

const maxResponseBytes=2*1024*1024;
const allowedLoopbackHosts=new Set(['127.0.0.1','[::1]']);

export const localModelConfigSchema=z.object({
 endpoint:z.string().url().default('http://127.0.0.1:11434'),
 model:z.string().min(1).max(120),
 maxOutputTokens:z.number().int().min(128).max(16384).default(2048),
 timeoutMs:z.number().int().min(1000).max(120000).default(45000)
}).strict();

export function validateLocalModel(rawInput){
 const parsed=localModelConfigSchema.parse(rawInput);
 const url=new URL(parsed.endpoint);
 if(url.protocol!=='http:'){
  throw Error('Local Ollama endpoint must use http:// on a loopback address.');
 }
 if(!allowedLoopbackHosts.has(url.hostname)){
  throw Error(`Local Ollama endpoint host "${url.hostname}" is not allowed; only 127.0.0.1 or [::1] are permitted.`);
 }
 if(url.username||url.password){
  throw Error('Local Ollama endpoint must not contain credentials.');
 }
 const normalizedModel=parsed.model.trim();
 if(/(^|[:/\-])cloud($|[:/\-])/i.test(normalizedModel)){
  throw Error(`Cloud model "${normalizedModel}" is rejected; use a local Ollama model.`);
 }
 return {
  endpoint:url.origin,
  model:normalizedModel,
  maxOutputTokens:parsed.maxOutputTokens,
  timeoutMs:parsed.timeoutMs
 };
}

async function readLimitedText(response,limitBytes){
 const rawText=await response.text();
 if(Buffer.byteLength(rawText,'utf8')>limitBytes){
  throw Error(`Local Ollama response exceeded ${limitBytes} bytes.`);
 }
 return rawText;
}

export async function runLocalMethodologyReview({packet,text,endpoint='http://127.0.0.1:11434',model,maxOutputTokens=2048,timeoutMs=45000,fetchImpl=fetch}){
 if(!packet||typeof packet!=='object'){
  throw Error('Prepared methodology packet is required.');
 }
 if(typeof text!=='string'||!text.length){
  throw Error('Source text is required for local methodology validation.');
 }
 const config=validateLocalModel({endpoint,model,maxOutputTokens,timeoutMs});
 const response=await fetchImpl(`${config.endpoint}/api/chat`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  redirect:'error',
  signal:AbortSignal.timeout(config.timeoutMs),
  body:JSON.stringify({
   model:config.model,
   stream:false,
   format:'json',
   options:{temperature:0,num_predict:config.maxOutputTokens},
   messages:[
    {role:'system',content:'Return strict JSON matching the requested schema. Quote verbatim from source text.'},
    {role:'user',content:packet.prompt}
   ]
  })
 });
 const rawBody=await readLimitedText(response,maxResponseBytes);
 if(!response.ok){
  throw Error(`Local Ollama request failed with HTTP ${response.status}: ${rawBody.slice(0,300)}`);
 }
 let payload;
 try{
  payload=JSON.parse(rawBody);
 }catch{
  throw Error('Local Ollama returned non-JSON envelope.');
 }
 if(payload?.done_reason==='length'){
  throw Error('Local Ollama output truncated (done_reason=length). Increase maxOutputTokens.');
 }
 const content=payload?.message?.content??payload?.response;
 if(typeof content!=='string'||!content.trim()){
  throw Error('Local Ollama response contained empty message content.');
 }
 let parsedResult;
 try{
  parsedResult=JSON.parse(content);
 }catch{
  throw Error('Local Ollama message content was not valid JSON.');
 }
 const validation=validateMethodologyResult({packet,text,result:parsedResult});
 return {
  ok:validation.ok,
  endpoint:config.endpoint,
  model:config.model,
  result:parsedResult,
  validation
 };
}
