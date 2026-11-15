import {z} from 'zod';

const telemetryEventSchema=z.object({
 tool:z.string().min(1).max(80).regex(/^[a-z0-9_-]+$/i),
 ok:z.boolean(),
 errors:z.number().int().min(0).max(100000).default(0),
 warnings:z.number().int().min(0).max(100000).default(0)
}).strict();

export function createTelemetryRecorder({enabled=process.env.REPROLEAF_TELEMETRY==='1'}={}){
 return {
  enabled:Boolean(enabled),
  startedAt:new Date().toISOString(),
  totals:{
   runs:0,
   passed:0,
   failed:0,
   errors:0,
   warnings:0
  },
  byTool:{}
 };
}

export function recordAuditEvent(recorder,rawEvent){
 if(!recorder?.enabled)return false;
 const event=telemetryEventSchema.parse(rawEvent);
 recorder.totals.runs+=1;
 if(event.ok)recorder.totals.passed+=1;
 else recorder.totals.failed+=1;
 recorder.totals.errors+=event.errors;
 recorder.totals.warnings+=event.warnings;

 if(!recorder.byTool[event.tool]){
  recorder.byTool[event.tool]={runs:0,passed:0,failed:0,errors:0,warnings:0};
 }
 const bucket=recorder.byTool[event.tool];
 bucket.runs+=1;
 if(event.ok)bucket.passed+=1;
 else bucket.failed+=1;
 bucket.errors+=event.errors;
 bucket.warnings+=event.warnings;
 return true;
}

export function getTelemetrySummary(recorder){
 return {
  enabled:Boolean(recorder?.enabled),
  startedAt:recorder?.startedAt??null,
  privacyGuarantee:'Aggregate counters only; no URLs, domains, HTML, text, or PII recorded.',
  totals:{...(recorder?.totals||{runs:0,passed:0,failed:0,errors:0,warnings:0})},
  byTool:{...(recorder?.byTool||{})}
 };
}

export function summarizeToolDemand(recorder){
 const entries=Object.entries(recorder?.byTool||{}).map(([tool,stats])=>{
  const runs=Number(stats?.runs||0);
  const failed=Number(stats?.failed||0);
  return {
   tool,
   runs,
   passed:Number(stats?.passed||0),
   failed,
   errors:Number(stats?.errors||0),
   warnings:Number(stats?.warnings||0),
   failRatePct:runs>0?Math.round((failed/runs)*1000)/10:0
  };
 });
 entries.sort((a,b)=>b.runs-a.runs||a.tool.localeCompare(b.tool));
 return {
  enabled:Boolean(recorder?.enabled),
  totalRuns:Number(recorder?.totals?.runs||0),
  toolsRanked:entries
 };
}
