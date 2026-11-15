import {z} from 'zod';

export const redirectHopSchema=z.object({
 url:z.string().url().max(2048),
 status:z.number().int().min(100).max(599),
 location:z.string().max(2048).optional()
}).strict();

export const redirectAuditSchema=z.object({
 traces:z.array(z.object({
  startUrl:z.string().url().max(2048),
  hops:z.array(redirectHopSchema).min(1).max(20)
 }).strict()).min(1).max(500)
}).strict();

const redirectStatuses=new Set([301,302,303,307,308]);
const temporaryRedirectStatuses=new Set([302,303,307]);

export function auditRedirectTraces(rawInput){
 const parsed=redirectAuditSchema.parse(rawInput);
 const findings=[];
 const traceSummaries=[];
 let chains=0;
 let loops=0;
 let brokenTargets=0;
 let temporaryRedirects=0;

 for(const trace of parsed.traces){
  const seen=new Set();
  let redirectCount=0;
  let hasLoop=false;
  for(const [idx,hop] of trace.hops.entries()){
   if(seen.has(hop.url)){
    hasLoop=true;
    loops+=1;
    findings.push({
     code:'REDIRECT_LOOP',
     severity:'error',
     startUrl:trace.startUrl,
     url:hop.url,
     hopIndex:idx,
     message:`Redirect loop detected at "${hop.url}".`,
     recommendation:'Break the cycle so the URL resolves directly to a 200 canonical target.'
    });
    break;
   }
   seen.add(hop.url);
   if(redirectStatuses.has(hop.status)){
    redirectCount+=1;
    if(!hop.location){
     findings.push({
      code:'REDIRECT_MISSING_LOCATION',
      severity:'error',
      startUrl:trace.startUrl,
      url:hop.url,
      hopIndex:idx,
      message:`HTTP ${hop.status} at "${hop.url}" is missing a Location target.`,
      recommendation:'Return a valid Location header for every 3xx redirect.'
     });
    }else if(seen.has(hop.location)){
     hasLoop=true;
     loops+=1;
     findings.push({
      code:'REDIRECT_LOOP',
      severity:'error',
      startUrl:trace.startUrl,
      url:hop.location,
      hopIndex:idx,
      message:`Redirect at "${hop.url}" points back to visited URL "${hop.location}".`,
      recommendation:'Point the redirect directly to the final canonical URL.'
     });
     break;
    }
    if(temporaryRedirectStatuses.has(hop.status)){
     temporaryRedirects+=1;
     findings.push({
      code:'REDIRECT_TEMPORARY_STATUS',
      severity:'warning',
      startUrl:trace.startUrl,
      url:hop.url,
      hopIndex:idx,
      message:`Temporary HTTP ${hop.status} redirect at "${hop.url}".`,
      recommendation:'Use 301 or 308 for permanent URL moves.'
     });
    }
   }
  }
  if(redirectCount>1){
   chains+=1;
   findings.push({
    code:'REDIRECT_CHAIN_TOO_LONG',
    severity:'warning',
    startUrl:trace.startUrl,
    url:trace.startUrl,
    hopIndex:0,
    message:`Redirect chain has ${redirectCount} hops before resolution.`,
    recommendation:'Collapse multi-hop redirects into a single direct 301/308 hop.'
   });
  }
  const lastHop=trace.hops[trace.hops.length-1];
  if(lastHop.status>=400){
   brokenTargets+=1;
   findings.push({
    code:lastHop.status>=500?'STATUS_SERVER_ERROR_5XX':'STATUS_CLIENT_ERROR_4XX',
    severity:'error',
    startUrl:trace.startUrl,
    url:lastHop.url,
    hopIndex:trace.hops.length-1,
    message:`URL "${trace.startUrl}" resolved with HTTP ${lastHop.status} at "${lastHop.url}".`,
    recommendation:'Fix the target route or redirect to an active 200 canonical page.'
   });
  }
  traceSummaries.push({
   startUrl:trace.startUrl,
   hopCount:trace.hops.length,
   redirectCount,
   finalUrl:lastHop.url,
   finalStatus:lastHop.status,
   hasLoop
  });
 }

 const errors=findings.filter(f=>f.severity==='error').length;
 const warnings=findings.filter(f=>f.severity==='warning').length;
 return {
  ok:errors===0,
  summary:{
   totalTraces:parsed.traces.length,
   errors,
   warnings,
   chains,
   loops,
   brokenTargets,
   temporaryRedirects
  },
  traces:traceSummaries,
  findings,
  limits:['Analyzes supplied HTTP redirect traces without making network requests.']
 };
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
