const credentialAssignment=/\b(?:[A-Z0-9_]*(?:API[_-]?KEY|ACCESS[_-]?KEY(?:[_-]?ID)?|SECRET(?:[_-]?KEY)?|TOKEN|PASSWORD|PASSWD|CLIENT[_-]?SECRET|PRIVATE[_-]?KEY)[A-Z0-9_]*)["']?\s*[:=]\s*(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s,;})\]>]+)/i;
export const secretPatterns=[
 /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z]+ )*PRIVATE KEY-----|$)/,
 /\bsk-[A-Za-z0-9_-]{12,}\b/,
 /\b(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/,
 /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
 /\b(?:xox[baprs]-[A-Za-z0-9-]{10,}|AIza[A-Za-z0-9_-]{25,})\b/,
 /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
 /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/,
 /\bBearer\s+[A-Za-z0-9._-]{16,}\b/i,
 /[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@/i,
 credentialAssignment,
 /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
 /(?:[A-Za-z]:[\\/]Users[\\/]|\/Users\/|\/home\/)[A-Za-z0-9._-]+/i
];

export function redactUrl(rawUrl,stripOrigin=true){
 if(typeof rawUrl!=='string'||!rawUrl.trim())return '';
 const trimmed=rawUrl.trim();
 try{
  const parsed=new URL(trimmed,'https://example.invalid');
  const cleanPath=parsed.pathname||'/';
  if(stripOrigin||parsed.origin==='https://example.invalid')return cleanPath;
  return `${parsed.origin}${cleanPath}`;
 }catch{
  return '[unparseable-url]';
 }
}

export function redactTextSecrets(text,stripOrigin=true){
 if(typeof text!=='string')return '';
 let cleaned=text;
 for(const pattern of secretPatterns.slice(0,10))cleaned=cleaned.replace(new RegExp(pattern.source,pattern.flags.replace(/g/g,'')+'g'),'[redacted-secret]');
 return cleaned
  .replace(/https?:\/\/[^\s)"'<>]+/g,match=>{
   const trailing=match.match(/[.,;:!?]+$/)?.[0]||'';
   const core=trailing?match.slice(0,-trailing.length):match;
   return redactUrl(core,stripOrigin)+trailing;
  })
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,'[redacted-email]')
  .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g,'[redacted-key]')
  .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi,'Bearer [redacted-token]')
  .replace(/\b(OPENAI_API_KEY|ANTHROPIC_API_KEY|SUPABASE_SERVICE_KEY|AWS_SECRET_ACCESS_KEY)\s*=\s*\S+/gi,'$1=[redacted-secret]')
  .replace(/(?:[A-Za-z]:[\\/]Users[\\/]|\/Users\/|\/home\/)[A-Za-z0-9._\\/-]+/gi,'[redacted-path]');
}

export function generateAttributionBadge(report,language='ru'){
 report={kind:report?.kind,findings:Array.isArray(report?.findings)?report.findings:[],summary:numericFields(report?.summary,['pages','distinctInternalEdges']),...(report?.diagnostics?.summary?{diagnostics:{summary:numericFields(report.diagnostics.summary,['good','attention','problem','unchecked'])}}:{})};
 const isRu=language==='ru';
 const kind=report?.kind==='blog-graph'?'blog-graph':'editorial-review';
 let summaryText;
 if(report?.diagnostics?.summary){
  const s=report.diagnostics.summary;
  const total=(s.good||0)+(s.attention||0)+(s.problem||0);
  summaryText=isRu
   ?`Проверено в Reproleaf: пройдено ${s.good||0} из ${total} структурных проверок (ошибок: ${s.problem||0}, внимание: ${s.attention||0}). Не является прогнозом позиций.`
   :`Checked with Reproleaf: ${s.good||0} of ${total} structural checks passed (errors: ${s.problem||0}, review: ${s.attention||0}). Not a ranking prediction.`;
 }else if(kind==='blog-graph'&&report?.summary){
  summaryText=isRu
   ?`Проверено в Reproleaf: карта из ${report.summary.pages||0} страниц, внутренних связей: ${report.summary.distinctInternalEdges??'нет данных'}.`
   :`Checked with Reproleaf: ${report.summary.pages||0} pages in inventory, distinct internal links: ${report.summary.distinctInternalEdges??'unknown'}.`;
 }else{
  const errs=(report?.findings||[]).filter(f=>f.severity==='error').length;
  const warns=(report?.findings||[]).filter(f=>f.severity==='warning').length;
  summaryText=isRu
   ?`Проверено в Reproleaf: ошибок ${errs}, замечаний ${warns}. Структурная проверка.`
   :`Checked with Reproleaf: ${errs} errors, ${warns} warnings. Structural check.`;
 }
 const toolUrl=isRu?'https://evolkov.tech/tools/reproleaf':'https://evolkov.tech/en/tools/reproleaf';
 const escapedText=summaryText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 return {
  text:summaryText,
  markdown:`*${summaryText} ([Reproleaf](${toolUrl}))*`,
  html:`<aside class="reproleaf-attribution-badge" data-reproleaf-badge><small>${escapedText} <a href="${toolUrl}" rel="noopener noreferrer">Reproleaf</a></small></aside>`
 };
}

export function buildSanitizedReportPayload({report,stripOrigin=true,includeSnippets=false,language='ru',translateMessage}){
 const kind=report?.kind==='blog-graph'?'blog-graph':report?.kind==='frontend-adapter'?'frontend-adapter':'editorial-review';
 const rawFindings=Array.isArray(report?.findings)?report.findings:[];
 const findings=rawFindings.slice(0,60).map(f=>{
  if(!f||typeof f!=='object')return null;
  const rawMsg=typeof translateMessage==='function'?(translateMessage(f)||f.message||''):String(f.message||'');
  const clean={
   code:redactTextSecrets(String(f.code||'unknown'),stripOrigin).slice(0,120),
   severity:['error','warning','info'].includes(f.severity)?f.severity:'warning',
   message:redactTextSecrets(String(rawMsg),stripOrigin).slice(0,500)
  };
  if(f.record){
   const r=String(f.record);
   clean.record=redactTextSecrets((r.startsWith('http')||r.startsWith('/'))?redactUrl(r,stripOrigin):r,stripOrigin).slice(0,300);
  }
  if(f.observation)clean.observation=redactTextSecrets(String(f.observation),stripOrigin).slice(0,500);
  if(f.why)clean.why=redactTextSecrets(String(f.why),stripOrigin).slice(0,500);
  if(f.suggestion)clean.suggestion=redactTextSecrets(String(f.suggestion),stripOrigin).slice(0,500);
  if(f.verifyHint)clean.verifyHint=redactTextSecrets(String(f.verifyHint),stripOrigin).slice(0,500);
  if(includeSnippets&&f.snippet)clean.snippet=redactTextSecrets(String(f.snippet),stripOrigin).slice(0,300);
  return clean;
 }).filter(Boolean);

 const rawStrengths=Array.isArray(report?.strengths)?report.strengths:[];
 const strengths=rawStrengths.slice(0,30).map(s=>s&&typeof s==='object'?{
  code:redactTextSecrets(String(s.code||''),stripOrigin).slice(0,120),
  message:redactTextSecrets(String(s.message||''),stripOrigin).slice(0,400)
 }:null).filter(Boolean);

 return {
  format:'reproleaf-sanitized-report',
  schemaVersion:1,
  sanitizedAt:new Date().toISOString(),
  kind,
  redactionPolicy:{
   draftRemoved:true,
   queryParamsRemoved:true,
   originStripped:stripOrigin,
   snippetsIncluded:includeSnippets
  },
  summary:report?.summary&&typeof report.summary==='object'?{
   errors:Number(report.summary.errors??findings.filter(f=>f.severity==='error').length),
   warnings:Number(report.summary.warnings??findings.filter(f=>f.severity==='warning').length),
   ...(typeof report.summary.pages==='number'?{pages:report.summary.pages}:{}),
   ...(report.summary.distinctInternalEdges!==undefined?{distinctInternalEdges:typeof report.summary.distinctInternalEdges==='number'&&Number.isFinite(report.summary.distinctInternalEdges)?report.summary.distinctInternalEdges:null}:{}),
   ...(report.summary.noObservedIncoming!==undefined?{noObservedIncoming:typeof report.summary.noObservedIncoming==='number'&&Number.isFinite(report.summary.noObservedIncoming)?report.summary.noObservedIncoming:null}:{})
  }:{
   errors:findings.filter(f=>f.severity==='error').length,
   warnings:findings.filter(f=>f.severity==='warning').length
  },
  ...(report?.diagnostics&&typeof report.diagnostics==='object'&&report.diagnostics.summary?{
   diagnostics:{
    summary:numericFields(report.diagnostics.summary,['good','attention','problem','unchecked']),
    metrics:numericFields(report.diagnostics.metrics,['words','headings','links','images'])
   }
  }:{}),
  strengths,
  findings,
  attributionBadge:generateAttributionBadge({kind,findings,summary:numericFields(report.summary,['pages','distinctInternalEdges']),...(report?.diagnostics?.summary?{diagnostics:{summary:numericFields(report.diagnostics.summary,['good','attention','problem','unchecked'])}}:{})},language)
 };
}

function numericFields(input,keys){
 return Object.fromEntries(keys.filter(key=>typeof input?.[key]==='number'&&Number.isFinite(input[key])&&input[key]>=0).map(key=>[key,input[key]]));
}
