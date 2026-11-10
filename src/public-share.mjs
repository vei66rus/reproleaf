import {z} from 'zod';
import {createHash} from 'node:crypto';
import {catalog} from './catalog.mjs';
import {secretPatterns,generateAttributionBadge,buildSanitizedReportPayload} from './sanitize-core.mjs';

export {generateAttributionBadge};

export const sanitizeReportSchema=z.object({
 report:z.record(z.string(),z.unknown()),
 stripOrigin:z.boolean().default(true),
 includeSnippets:z.boolean().default(false),
 language:z.enum(['ru','en']).default('ru')
}).strict();

export const contributionSchema=z.object({
 id:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
 title:z.string().min(8).max(160),
 stack:z.string().min(2).max(60),
 category:z.enum(['overlay','scroll','canvas','layout','focus','forms','hydration']),
 symptom:z.string().min(15).max(600),
 applicability:z.string().min(10).max(600),
 versions:z.string().min(3).max(200),
 preconditions:z.array(z.string().min(5).max(300)).min(1).max(8),
 steps:z.array(z.string().min(5).max(300)).min(1).max(10),
 expected:z.string().min(10).max(500),
 acceptance:z.string().min(10).max(500),
 fixSummary:z.string().min(10).max(600),
 limitations:z.array(z.string().min(5).max(300)).min(1).max(8),
 syntheticSource:z.string().min(20).max(30000),
 authorAttribution:z.string().max(120).optional(),
 publicationConsent:z.literal(true),
 noPrivateDataConfirmed:z.literal(true)
}).strict();

export function sanitizeReportForSharing(rawInput){
 const parsed=sanitizeReportSchema.parse(rawInput);
 const sanitizedReport=buildSanitizedReportPayload(parsed);
 const serialized=JSON.stringify(sanitizedReport);
 sanitizedReport.fingerprintSha256=createHash('sha256').update(serialized).digest('hex');
 return sanitizedReport;
}

export function prepareContributionPacket(rawInput){
 const parsed=contributionSchema.safeParse(rawInput);
 if(!parsed.success){
  const err=new Error('Invalid contribution packet.');
  err.code='RL_INVALID_INPUT';
  err.status=400;
  err.issues=parsed.error.issues.map(i=>({path:i.path.join('.')||'root',message:i.message}));
  throw err;
 }
 const data=parsed.data;
 const existingIds=new Set((catalog.cases||[]).map(c=>c.id));
 const duplicateOf=existingIds.has(data.id)?data.id:null;

 const combinedText=Object.values(data).flatMap(value=>Array.isArray(value)?value:[value]).filter(value=>typeof value==='string').join('\n');

 for(const pattern of secretPatterns){
  if(pattern.test(combinedText)){
   const err=new Error('Contribution contains a potential secret, email address, or local user filesystem path. Strip all private data before submitting.');
   err.code='RL_PRIVATE_DATA_DETECTED';
   err.status=400;
   throw err;
  }
 }

 const candidateCase={
  id:data.id,
  title:data.title,
  stack:data.stack,
  category:data.category,
  symptom:data.symptom,
  applicability:data.applicability,
  versions:data.versions,
  preconditions:data.preconditions,
  steps:data.steps,
  expected:data.expected,
  acceptance:data.acceptance,
  fixSummary:data.fixSummary,
  limitations:data.limitations
 };

 const sourceSha256=createHash('sha256').update(data.syntheticSource).digest('hex');
 return {
  format:'reproleaf-contribution-packet',
  schemaVersion:1,
  status:'pending-independent-verification',
  preparedAt:new Date().toISOString(),
  duplicateCaseId:duplicateOf,
  provenance:{
   origin:'voluntary-synthetic-contribution',
   authorAttribution:data.authorAttribution||'anonymous',
   publicationConsent:true,
   noPrivateDataConfirmed:true,
   license:'MIT',
   sourceSha256
  },
  disclosure:{
   includedFields:Object.keys(candidateCase).concat(['syntheticSource','provenance']),
   sourceChars:data.syntheticSource.length
  },
  candidateCase,
  syntheticSource:data.syntheticSource
 };
}
