import {z} from 'zod';
import {isIsoCalendarDate} from './markup-input-guards.mjs';

function safeOrigin(value){
 if(typeof value!=='string'||value.length>512||/[\s\u0000-\u001f\u007f]/u.test(value))return false;
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/'&&(/^[a-z0-9.-]+$/i.test(url.hostname)||/^\[[a-f0-9:.]+\]$/i.test(url.hostname));}catch{return false;}
}
const status=z.string().refine(value=>['ok','unreachable','skipped_by_robots','rejected_or_error'].includes(value)||/^http_[1-5]\d\d$/.test(value));
const code=z.number().int().min(100).max(599).nullable().optional();
const integer=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional();
const timestamp=z.string().max(80).refine(value=>isIsoCalendarDate(value)&&Number.isFinite(Date.parse(value)));
const rowSchema=z.object({
 origin:z.string().refine(safeOrigin),retrievedAt:timestamp.optional(),status,
 permissionLog:z.object({robotsUrl:z.string().max(2048).optional(),robotsStatus:code,allowedHome:z.boolean().optional(),allowedLlmsTxt:z.boolean().optional(),userAgent:z.string().max(300).optional()}).strict().optional(),
 error:z.string().max(2000).optional(),homeStatus:code,ttfbMs:z.number().finite().nonnegative().max(10000000).nullable().optional(),wordCount:integer,
 jsonLdTypes:z.array(z.string().max(120)).max(100).optional(),llmsTxtStatus:code,llmsTxtValid:z.boolean().optional(),
 aiBots:z.record(z.string().max(100),z.enum(['allowed','blocked','unknown','not_checked'])).optional(),score:z.number().int().min(0).max(100).nullable().optional()
}).strict();
const summarySchema=z.object({methodology:z.string().max(2000).optional(),userAgent:z.string().max(300).optional(),totalOrigins:z.number().int().min(1).max(500),reachableCount:integer,skippedByRobotsCount:integer,validLlmsTxtCount:integer,jsonLdAdoptedCount:integer,oaiSearchAllowedCount:integer,perplexityAllowedCount:integer,gptBotBlockedCount:integer}).strict();
const schema=z.object({ok:z.boolean().optional(),sha256:z.string().regex(/^[a-f0-9]{64}$/i).optional(),generatedAt:timestamp.optional(),summary:summarySchema,results:z.array(rowSchema).min(1).max(500)}).strict();

export function benchmarkViewRows(results){
 return results.map(row=>{
  const homeKnown=row.status==='ok'&&typeof row.homeStatus==='number'&&row.homeStatus>=200&&row.homeStatus<400;
  const llmsKnown=typeof row.llmsTxtValid==='boolean'&&((row.llmsTxtStatus>=200&&row.llmsTxtStatus<300)||[404,410].includes(row.llmsTxtStatus));
  const policyKnown=homeKnown&&row.permissionLog&&((row.permissionLog.robotsStatus>=200&&row.permissionLog.robotsStatus<300)||[404,410].includes(row.permissionLog.robotsStatus));
  return {...row,origin:new URL(row.origin).origin,score:homeKnown?row.score??null:null,wordCount:homeKnown?row.wordCount??null:null,jsonLdTypes:homeKnown?row.jsonLdTypes??null:null,llmsTxtValid:llmsKnown?row.llmsTxtValid:null,aiBots:policyKnown?row.aiBots??{}:{},ttfbMs:homeKnown?row.ttfbMs??null:null};
 });
}

export async function validateBenchmarkDataset(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('BENCHMARK_STRUCTURE');
 const serialized=JSON.stringify(raw);if(serialized.length>5*1024*1024||new TextEncoder().encode(serialized).length>5*1024*1024)throw Error('BENCHMARK_SIZE');
 const data=schema.parse(raw),seen=new Set();
 for(const row of data.results){const origin=new URL(row.origin).origin;if(seen.has(origin))throw Error('BENCHMARK_DUPLICATE_ORIGIN');seen.add(origin);if(row.permissionLog?.robotsUrl&&row.permissionLog.robotsUrl!==origin+'/robots.txt')throw Error('BENCHMARK_ROBOTS_URL');if(row.llmsTxtValid===true&&!(row.llmsTxtStatus>=200&&row.llmsTxtStatus<300))throw Error('BENCHMARK_CONTRADICTORY_LLMS');if(row.status==='ok'&&row.homeStatus!=null&&!(row.homeStatus>=200&&row.homeStatus<400))throw Error('BENCHMARK_CONTRADICTORY_HOME');}
 const reachable=data.results.filter(row=>row.status==='ok');
 const expected={totalOrigins:data.results.length,reachableCount:reachable.length,skippedByRobotsCount:data.results.filter(row=>row.status==='skipped_by_robots').length,validLlmsTxtCount:reachable.filter(row=>row.llmsTxtValid===true).length,jsonLdAdoptedCount:reachable.filter(row=>row.jsonLdTypes?.length>0).length,oaiSearchAllowedCount:reachable.filter(row=>row.aiBots?.['OAI-SearchBot']==='allowed').length,perplexityAllowedCount:reachable.filter(row=>row.aiBots?.['PerplexityBot']==='allowed').length,gptBotBlockedCount:reachable.filter(row=>row.aiBots?.GPTBot==='blocked').length};
 for(const [key,value] of Object.entries(expected))if(data.summary[key]!==undefined&&data.summary[key]!==value)throw Error('BENCHMARK_SUMMARY_MISMATCH');
 let integrity='not-provided';
 if(data.sha256){
  const payload=new TextEncoder().encode(JSON.stringify({summary:raw.summary,results:raw.results}));
  const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',payload))].map(value=>value.toString(16).padStart(2,'0')).join('');
  if(actual!==data.sha256.toLowerCase())throw Error('BENCHMARK_HASH_MISMATCH');integrity='match';
 }
 return {data:raw,viewRows:benchmarkViewRows(data.results),integrity:{status:integrity,covers:['summary','results'],authenticityVerified:false,freshnessVerified:false,generatedAtCovered:false}};
}

export function benchmarkCommand(origin){if(!safeOrigin(origin))throw Error('BENCHMARK_ORIGIN');return `node src/cli.mjs benchmark '${new URL(origin).origin}' --allow-network`;}
