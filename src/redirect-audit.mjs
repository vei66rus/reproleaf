import {z} from 'zod';

function webTraceUrl(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&Boolean(url.hostname)&&!url.username&&!url.password;}catch{return false;}}
function requestUrl(value,base){const url=new URL(value,base);if(!webTraceUrl(url.href))throw new Error('Invalid HTTP(S) trace target');url.hash='';return url.href;}

export const redirectHopSchema=z.object({
 url:z.string().url().max(2048).refine(webTraceUrl,'Expected an HTTP(S) URL without credentials'),
 status:z.number().int().min(100).max(599),
 location:z.string().max(2048).optional()
}).strict();

export const redirectAuditSchema=z.object({
 traces:z.array(z.object({
  startUrl:z.string().url().max(2048).refine(webTraceUrl,'Expected an HTTP(S) URL without credentials'),
  hops:z.array(redirectHopSchema).min(1).max(20)
 }).strict()).min(1).max(500)
}).strict();

const redirectStatuses=new Set([301,302,303,307,308]);
const temporaryRedirectStatuses=new Set([302,303,307]);

export function auditRedirectTraces(rawInput){
 const parsed=redirectAuditSchema.parse(rawInput),findings=[],traceSummaries=[];
 let chains=0,loops=0,brokenTargets=0,temporaryRedirects=0,incompleteTraces=0,inconsistentTraces=0,terminalTraces=0;
 let inputCharacters=0;
 for(const trace of parsed.traces){
  inputCharacters+=trace.startUrl.length;
  for(const hop of trace.hops)inputCharacters+=hop.url.length+(hop.location||'').length;
 }
 if(inputCharacters>2097152)throw new Error('REDIRECT_INPUT_BUDGET');
 for(const trace of parsed.traces){
  const findingStart=findings.length;
  const seen=new Set();let redirectCount=0,hasLoop=false,inconsistent=false,expected=null,previousRedirect=false;
  const add=(code,severity,idx,url,message,recommendation)=>findings.push({code,severity,startUrl:trace.startUrl,url,hopIndex:idx,message,recommendation});
  const loop=(idx,url)=>{if(hasLoop)return;hasLoop=true;loops++;add('REDIRECT_LOOP','error',idx,url,'The supplied locations form a cycle back to an already observed request URL.','Review the observed cycle and choose the intended target. No URL was requested by this check.');};
  for(const [idx,hop] of trace.hops.entries()){
   const url=requestUrl(hop.url);
   if(idx===0&&url!==requestUrl(trace.startUrl)){
    inconsistent=true;add('REDIRECT_START_MISMATCH','error',idx,hop.url,'The first observed hop does not match startUrl.','Supply the response at startUrl as the first hop.');
   }
   if(idx>0&&(!previousRedirect||!expected||url!==expected)){
    inconsistent=true;add('REDIRECT_HOP_MISMATCH','error',idx,hop.url,'This hop does not follow the preceding observed redirect Location.','Preserve the complete ordered trace; resolve relative Location against the preceding response URL.');
   }
   if(seen.has(url)&&idx>0&&previousRedirect&&expected===url&&!inconsistent)loop(idx,hop.url);
   seen.add(url);
   previousRedirect=redirectStatuses.has(hop.status);expected=null;
   if(previousRedirect){
    redirectCount++;
    if(temporaryRedirectStatuses.has(hop.status)){
     temporaryRedirects++;add('REDIRECT_TEMPORARY_STATUS','warning',idx,hop.url,`Observed temporary HTTP ${hop.status} redirect.`,'Temporary redirects may be intentional. Use a permanent status only when the move is intended to be permanent.');
    }
    if(!hop.location){
     add('REDIRECT_MISSING_LOCATION','error',idx,hop.url,`HTTP ${hop.status} has no supplied Location value.`,'Supply the observed Location header. Absence from this trace is not a live header measurement.');
    }else{
     try{expected=requestUrl(hop.location,url);}catch{add('REDIRECT_INVALID_LOCATION','error',idx,hop.url,'The supplied Location is not a valid HTTP(S) redirect target.','Supply the original Location value, relative or absolute; credentials and executable schemes are not supported.');}
     if(expected&&seen.has(expected)&&!inconsistent)loop(idx,expected);
    }
   }
  }
  const lastHop=trace.hops.at(-1),terminal=(lastHop.status>=200&&lastHop.status<300)||lastHop.status>=400;
  if(hasLoop&&terminal&&!inconsistent){
   loops--;hasLoop=false;
   for(const finding of findings.slice(findingStart))if(finding.code==='REDIRECT_LOOP'){finding.code='REDIRECT_RETURN_VISIT';finding.severity='warning';finding.message='The supplied trace revisits an earlier request URL but later reaches a terminal response.';finding.recommendation='The terminal response is preserved. Review method, cookies and state if relevant; a return visit does not prove an endless redirect loop.';}
  }
  let completion=inconsistent?'inconsistent':terminal?'terminal-observed':hasLoop?'loop':'partial';
  if(inconsistent)inconsistentTraces++;
  if(completion==='partial'){
   incompleteTraces++;add('REDIRECT_TRACE_INCOMPLETE','warning',trace.hops.length-1,lastHop.url,`Trace ends with HTTP ${lastHop.status}; a terminal response has not been supplied.`,'Add the subsequent observed response. Do not treat an unobserved destination as a successful final URL.');
  }
  if(completion==='terminal-observed')terminalTraces++;
  if(redirectCount>1){
   chains++;add('REDIRECT_CHAIN_TOO_LONG','warning',0,trace.startUrl,`The supplied trace contains ${redirectCount} redirect responses.`,'Review whether intermediate redirects can be removed. The check does not infer the intended canonical page.');
  }
  if(lastHop.status>=400){
   brokenTargets++;add(lastHop.status>=500?'STATUS_SERVER_ERROR_5XX':'STATUS_CLIENT_ERROR_4XX','error',trace.hops.length-1,lastHop.url,`Last supplied response is HTTP ${lastHop.status}.`,'Review whether this response is intentional and whether the intended target is reachable.');
  }
  traceSummaries.push({startUrl:trace.startUrl,hopCount:trace.hops.length,redirectCount,finalUrl:completion==='terminal-observed'?lastHop.url:null,finalStatus:completion==='terminal-observed'?lastHop.status:null,lastObservedUrl:lastHop.url,lastObservedStatus:lastHop.status,completion,hasLoop});
 }
 const errors=findings.filter(f=>f.severity==='error').length,warnings=findings.filter(f=>f.severity==='warning').length;
 return {ok:errors===0&&incompleteTraces===0&&loops===0&&inconsistentTraces===0,summary:{totalTraces:parsed.traces.length,errors,warnings,chains,loops,brokenTargets,temporaryRedirects,incompleteTraces,inconsistentTraces,terminalTraces},traces:traceSummaries,findings,limits:['Analyzes supplied ordered HTTP redirect observations without making network requests.','A terminal supplied status is distinct from a live reachability check. Missing or disconnected hops are not accepted as successful resolution.','HTTP request identity excludes fragments; relative Location values are resolved against the observed response URL.','Request methods, cookies and state are not modeled. A cyclic return in supplied locations does not prove endless behavior; a later supplied terminal response is preserved.']};
}

export const REDIRECT_PLAN_LIMITS=Object.freeze({traces:100,hops:20,inputCharacters:1048576,pathCharacters:1024,rules:100});
const redirectPlanInputSchema=z.object({traces:z.array(z.object({startUrl:z.string().min(1).max(2048),hops:z.array(z.object({url:z.string().min(1).max(2048),status:z.number().int().min(100).max(599),location:z.string().max(2048).optional()}).strict()).min(1).max(20)}).strict()).min(1).max(100)}).strict();
function redirectPlanUrl(raw,base){
 if(/[\x00-\x20\x7f\\]/.test(raw))throw Error('unsafe-url');
 if(raw.includes('?')||raw.includes('#'))throw Error('query-or-fragment');
 let url;try{url=new URL(raw,base);}catch{throw Error('invalid-url');}
 if(url.username||url.password)throw Error('credentials');
 if(raw.includes('%'))throw Error('unsafe-path');
 if(!['http:','https:'].includes(url.protocol)||!url.hostname||!/^[a-z0-9.-]+$/i.test(url.hostname))throw Error('unsupported-origin');
 if(url.search||url.hash)throw Error('query-or-fragment');
 if(!/^\/[A-Za-z0-9._~/-]*$/.test(url.pathname)||url.pathname.length>1024||url.pathname.includes('//')||/(?:^|\/)\.{1,2}(?:\/|$)/.test(url.pathname))throw Error('unsafe-path');
 if(!base&&raw!==url.href)throw Error('noncanonical-url');
 if(base&&/(?:^|\/)\.{1,2}(?:\/|$)/.test(raw))throw Error('unsafe-path');
 return url;
}
const redirectPlanPattern=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function redirectPlanRule(source,target,format,status){
 if(format==='nginx')return `if ($request_uri = "${source}") {\n    return ${status} ${target};\n}`;
 const pattern=redirectPlanPattern(source);
 return `RewriteCond %{QUERY_STRING} ^$\nRewriteCond %{THE_REQUEST} "^[^[:space:]]+[[:space:]]${pattern}[[:space:]]HTTP/[0-9.]+$"\nRewriteRule "^${redirectPlanPattern(source.slice(1))}$" "${target}" [R=${status},END,NE]`;
}

/** Local review draft only. Supplied observations do not establish deployment intent. */
export function generateRedirectPlan(rawInput,{format,status}={}){
 if(!['nginx','apache-root'].includes(format))throw Error('REDIRECT_PLAN_FORMAT');
 if(status!==301&&status!==308)throw Error('REDIRECT_PLAN_STATUS');
 const input=redirectPlanInputSchema.parse(rawInput);
 let inputCharacters=0;
 for(const trace of input.traces){inputCharacters+=trace.startUrl.length;for(const hop of trace.hops)inputCharacters+=hop.url.length+(hop.location?.length||0);}
 if(inputCharacters>REDIRECT_PLAN_LIMITS.inputCharacters)throw Error('REDIRECT_PLAN_INPUT_BUDGET');
 const observations=new Map(),conflicts=new Set(),entries=[];
 const observe=(url,signature)=>{if(observations.has(url)&&observations.get(url)!==signature)conflicts.add(url);else observations.set(url,signature);};
 for(const [index,trace] of input.traces.entries()){
  let source=null,reason=null;const requests=[],seen=new Set();let expected=null;
  try{source=redirectPlanUrl(trace.startUrl);}catch(error){reason=error.message;}
  for(const [hopIndex,hop] of trace.hops.entries()){
   let url,target=null;
   try{url=redirectPlanUrl(hop.url);}catch(error){reason??=error.message;continue;}
   let invalidTarget=false;
   try{if(hop.location)target=redirectPlanUrl(hop.location,url.href);}catch(error){reason??=error.message;invalidTarget=true;}
   const signature=String(hop.status)+'|'+(invalidTarget?'invalid-location':target?.href||'');observe(url.href,signature);
   requests.push(url.href);
   if(source&&url.origin!==source.origin)reason??='cross-origin';
   if(target&&source&&target.origin!==source.origin)reason??='cross-origin';
   if(hopIndex===0&&source&&url.href!==source.href)reason??='start-mismatch';
   if(hopIndex>0&&url.href!==expected)reason??='disconnected-trace';
   if(seen.has(url.href))reason??='repeated-request';seen.add(url.href);
   const final=hopIndex===trace.hops.length-1;
   if(final){if(hop.status<200||hop.status>=300)reason??='final-not-successful';if(hop.location)reason??='terminal-location';}
   else{if(hop.status!==301&&hop.status!==308)reason??='not-permanent';if(!target)reason??='missing-location';}
   expected=target?.href??null;
  }
  if(trace.hops.length<3)reason??='not-multihop';
  const final=trace.hops.at(-1);let target=null;
  try{target=redirectPlanUrl(final.url);}catch(error){reason??=error.message;}
  if(!reason){const audit=auditRedirectTraces({traces:[trace]});if(!audit.ok||audit.traces[0]?.completion!=='terminal-observed')reason='audit-not-confirmed';}
  entries.push({traceIndex:index+1,status:'blocked',reason,requests,...(!reason&&source&&target?{origin:source.origin,sourcePath:source.pathname,targetUrl:target.href,redirectCount:trace.hops.length-1}:{})});
 }
 for(const entry of entries)if(!entry.reason&&entry.requests.some(url=>conflicts.has(url)))entry.reason='conflicting-observations';
 const origins=new Set(entries.filter(entry=>!entry.reason).map(entry=>entry.origin));
 if(origins.size>1)for(const entry of entries)if(!entry.reason)entry.reason='multiple-origins';
 const rules=[],seenRules=new Map();
 for(const entry of entries){
  delete entry.requests;
  if(entry.reason){delete entry.origin;delete entry.sourcePath;delete entry.targetUrl;delete entry.redirectCount;continue;}
  const key=entry.origin+'|'+entry.sourcePath;
  if(seenRules.has(key)){entry.status='duplicate';entry.ruleIndex=seenRules.get(key);continue;}
  entry.status='ready';entry.ruleIndex=rules.length+1;seenRules.set(key,entry.ruleIndex);
  rules.push({index:entry.ruleIndex,origin:entry.origin,sourcePath:entry.sourcePath,targetUrl:entry.targetUrl,status,template:redirectPlanRule(entry.sourcePath,entry.targetUrl,format,status)});
 }
 const origin=rules[0]?.origin??null,blocked=entries.filter(entry=>entry.status==='blocked').length;
 const context=format==='nginx'?'Inside the matching nginx server block':'Root .htaccess with Apache 2.4 mod_rewrite, before application rules';
 const text=rules.length?[`# Draft only. Context: ${context} for ${origin}.`,'# Exact ASCII query-free request targets only; review existing routing and test before deployment.',...(format==='apache-root'?['RewriteEngine On']:[]),...rules.map(rule=>rule.template)].join('\n\n')+'\n':'';
 return {schemaVersion:1,tool:'redirect-plan',ok:rules.length>0&&blocked===0,state:rules.length?(blocked?'partial':'ready'):'blocked',format,status,origin,context,summary:{traces:entries.length,generatedRules:rules.length,blockedTraces:blocked,duplicateTraces:entries.filter(entry=>entry.status==='duplicate').length},entries,rules,text,scope:{networkUsed:false,applied:false,queryPolicy:'Only exact query-free original request targets match. Requests with any query or different original spelling are left to existing routing.',methodSemantics:status===308?'308 retains the request method when followed. Original method/cookie requirements were not supplied or tested.':'301 permits a client to change POST to GET. Original method/cookie requirements were not supplied or tested.',evidence:'Supplied permanent ordered chains and supplied successful final responses only; no live reachability, canonical-intent, server compatibility or deployment verification.'},limits:['Same-origin batches only; ASCII paths without percent encoding, queries, fragments, dot segments, doubled slashes or configuration metacharacters.','Only the starting URL is redirected to the supplied final URL. No intermediate, guessed, wildcard, cookie-dependent or cross-origin mapping is generated.','Review virtual-host context and existing rules. This draft is not universally deployable and is never automatically applied.','Editing the preview removes any assurance that the text still matches the generated draft. Test syntax and behavior before deployment.']};
}


export async function traceRedirects({urls,maxHops=10,timeoutMs=10000,fetchImpl=fetch}){
 if(!Array.isArray(urls)||urls.length===0||urls.length>50){
  throw Error('Provide between 1 and 50 URLs to trace.');
 }
 const traces=[];
 for(const startUrl of urls){
  const hops=[];
  const visited=new Set();
  let current=new URL(startUrl).href;
  for(let step=0;step<maxHops;step+=1){
   if(visited.has(current))break;
   visited.add(current);
   const res=await fetchImpl(current,{
    method:'GET',
    redirect:'manual',
    signal:AbortSignal.timeout(timeoutMs)
   });
   const locationHeader=res.headers.get('location');
   const resolvedLocation=locationHeader?new URL(locationHeader,current).href:undefined;
   hops.push({
    url:current,
    status:res.status,
    ...(resolvedLocation?{location:resolvedLocation}:{})
   });
   if(!redirectStatuses.has(res.status)||!resolvedLocation)break;
   current=resolvedLocation;
  }
  traces.push({startUrl,hops});
 }
 return auditRedirectTraces({traces});
}
