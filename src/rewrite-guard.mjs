import {z} from 'zod';

const protectedPatterns={
 numbers:/(?:[+\-\u2212]\s*)?(?:\d+(?:[.,]\d+)*|[.,]\d+)(?:[%\u2030])?/gu,
 urls:/https?:\/\/[^\s<>"'`\])]+/gu,
 formulas:/\$\$[\s\S]*?\$\$|\$[^$\r\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|(?<![\p{L}\p{N}_])[\p{L}\p{N}_]+(?:\s*[+*/^\u2212-]\s*[\p{L}\p{N}_]+)*\s*(?:!=|[=\u2248\u2264\u2265<>])\s*[\p{L}\p{N}_]+(?:\s*[+*/^\u2212-]\s*[\p{L}\p{N}_]+)*/gu,
 code:/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\r\n]+`|<code\b[^>]*>[\s\S]*?<\/code>/gu,
 negations_and_conditions:/(?<![\p{L}\p{N}_])(?:\u043d\u0435|\u043d\u0435\u0442|\u043d\u0435\u043b\u044c\u0437\u044f|\u0431\u0435\u0437|\u043d\u0438\u043a\u043e\u0433\u0434\u0430|\u0435\u0441\u043b\u0438|\u043a\u0440\u043e\u043c\u0435|\u0442\u043e\u043b\u044c\u043a\u043e|\u043f\u0440\u0438 \u0443\u0441\u043b\u043e\u0432\u0438\u0438|\u0437\u0430 \u0438\u0441\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435\u043c|not|no|never|without|unless|except|only|if)(?![\p{L}\p{N}_])/giu
};

const editItemSchema=z.object({
 id:z.string().min(1).max(120).optional(),
 before:z.string().max(100000),
 after:z.string().max(100000),
 reason:z.string().max(2000).optional()
}).strict();

export const rewriteGuardSchema=z.object({
 before:z.string().max(200000).optional(),
 after:z.string().max(200000).optional(),
 reason:z.string().max(2000).optional(),
 edits:z.array(editItemSchema).min(1).max(50).optional()
}).strict();

function extractSortedTokens(text,pattern){
 return [...String(text||'').matchAll(pattern)].map(m=>m[0]).sort();
}

function multisetDiff(beforeList,afterList){
 const counts=new Map();
 for(const item of afterList)counts.set(item,(counts.get(item)||0)+1);
 const missing=[];
 for(const item of beforeList){
  const n=counts.get(item)||0;
  if(n>0)counts.set(item,n-1);
  else missing.push(item);
 }
 const added=[];
 const beforeCounts=new Map();
 for(const item of beforeList)beforeCounts.set(item,(beforeCounts.get(item)||0)+1);
 for(const item of afterList){
  const n=beforeCounts.get(item)||0;
  if(n>0)beforeCounts.set(item,n-1);
  else added.push(item);
 }
 return {missing,added};
}

export function checkRewritePreservation(rawInput){
 const parsed=rewriteGuardSchema.parse(rawInput);
 const hasEdits=Array.isArray(parsed.edits);
 const hasPair=typeof parsed.before==='string'&&typeof parsed.after==='string';
 if((hasEdits&&hasPair)||(!hasEdits&&!hasPair)){
  throw Error('Provide either { before, after } or { edits }.');
 }
 const edits=hasEdits?parsed.edits:[{id:'block-1',before:parsed.before,after:parsed.after,reason:parsed.reason}];
 const guards=[];
 let changedEdits=0;
 for(const [index,edit] of edits.entries()){
  const editId=edit.id||`block-${index+1}`;
  if(edit.before!==edit.after)changedEdits++;
  for(const [kind,pattern] of Object.entries(protectedPatterns)){
   const before=extractSortedTokens(edit.before,pattern);
   const after=extractSortedTokens(edit.after,pattern);
   const {missing,added}=multisetDiff(before,after);
   const passed=missing.length===0&&added.length===0;
   guards.push({editId,kind,passed,before,after,missing,added});
  }
 }
 const failedGuards=guards.filter(g=>!g.passed);
 const status=changedEdits===0?'no_changes_proposed':failedGuards.length===0?'needs_independent_review':'blocked_by_preservation_checks';
 return {
  schemaVersion:1,
  kind:'rewrite-preservation-guard',
  status,
  editsChecked:edits.length,
  changedEdits,
  summary:{
   totalChecks:guards.length,
   passed:guards.length-failedGuards.length,
   blocked:failedGuards.length
  },
  guards,
  evidenceLimit:'Deterministic token checks do not establish semantic preservation or factual validity.'
 };
}
