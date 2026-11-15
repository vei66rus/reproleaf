import {z} from 'zod';
import {assertSafePublicUrl} from './network-guard.mjs';

export const psiAuditSchema=z.object({
 url:z.string().url().max(2048),
 strategy:z.enum(['mobile','desktop']).default('mobile'),
 apiKey:z.string().min(1).max(256).optional(),
 allowNetwork:z.boolean().default(false),
 timeoutMs:z.number().int().min(1000).max(60000).default(30000),
 psiResponse:z.record(z.string(),z.unknown()).optional(),
 domPerfReport:z.record(z.string(),z.unknown()).optional()
}).strict().superRefine((val,ctx)=>{
 if(!val.psiResponse&&!val.allowNetwork){
  ctx.addIssue({code:z.ZodIssueCode.custom,message:'Provide psiResponse JSON or set allowNetwork: true (--allow-network).'});
 }
});

function readCruxMetric(metrics,key){
 const entry=metrics?.[key];
 if(!entry||typeof entry!=='object')return null;
 return {
  percentile:entry.percentile??null,
  category:entry.category||null
 };
}

export function extractPsiMetrics(payload){
 const crux=payload?.loadingExperience?.metrics||payload?.originLoadingExperience?.metrics||{};
 const lhr=payload?.lighthouseResult||{};
 const audits=lhr?.audits||{};
 const perfScore=typeof lhr?.categories?.performance?.score==='number'
  ?Math.round(lhr.categories.performance.score*100)
  :null;

 return {
  performanceScore:perfScore,
  field:{
   overallCategory:payload?.loadingExperience?.overall_category||null,
   lcpMs:readCruxMetric(crux,'LARGEST_CONTENTFUL_PAINT_MS'),
   inpMs:readCruxMetric(crux,'INTERACTION_TO_NEXT_PAINT'),
   cls:readCruxMetric(crux,'CUMULATIVE_LAYOUT_SHIFT_SCORE'),
   ttfbMs:readCruxMetric(crux,'EXPERIMENTAL_TIME_TO_FIRST_BYTE')
  },
  lab:{
   lcpMs:typeof audits['largest-contentful-paint']?.numericValue==='number'?Math.round(audits['largest-contentful-paint'].numericValue):null,
   cls:typeof audits['cumulative-layout-shift']?.numericValue==='number'?Number(audits['cumulative-layout-shift'].numericValue.toFixed(4)):null,
   tbtMs:typeof audits['total-blocking-time']?.numericValue==='number'?Math.round(audits['total-blocking-time'].numericValue):null,
   fcpMs:typeof audits['first-contentful-paint']?.numericValue==='number'?Math.round(audits['first-contentful-paint'].numericValue):null,
   speedIndexMs:typeof audits['speed-index']?.numericValue==='number'?Math.round(audits['speed-index'].numericValue):null
  }
 };
}

function correlateDomIssues(metrics,domPerfReport){
 const correlations=[];
 const domFindings=Array.isArray(domPerfReport?.findings)?domPerfReport.findings:[];
 const poorLcp=(metrics.field.lcpMs?.category==='POOR'||(metrics.lab.lcpMs!==null&&metrics.lab.lcpMs>2500));
 const poorCls=(metrics.field.cls?.category==='POOR'||(metrics.lab.cls!==null&&metrics.lab.cls>0.1));
 const poorInp=(metrics.field.inpMs?.category==='POOR'||(metrics.lab.tbtMs!==null&&metrics.lab.tbtMs>200));

 for(const f of domFindings){
  if(poorLcp&&/LCP|HERO|RENDER_BLOCK/i.test(f.code||'')){
   correlations.push({cwv:'LCP',domCode:f.code,message:`LCP bottleneck correlates with DOM finding ${f.code}: ${f.message}`});
  }
  if(poorCls&&/DIMENSION|CLS|WIDTH|HEIGHT|LAYOUT/i.test(f.code||'')){
   correlations.push({cwv:'CLS',domCode:f.code,message:`CLS shift correlates with DOM finding ${f.code}: ${f.message}`});
  }
  if(poorInp&&/DOM_DEPTH|DOM_NODE|MAIN_THREAD|HEAVY_SCRIPT/i.test(f.code||'')){
   correlations.push({cwv:'INP',domCode:f.code,message:`Responsiveness lag correlates with DOM finding ${f.code}: ${f.message}`});
  }
 }
 return correlations;
}

export async function auditPageSpeedWithDom(rawInput,{fetchImpl=fetch,lookupAll}={}){
 const input=psiAuditSchema.parse(rawInput);
 let psiPayload=input.psiResponse;

 if(!psiPayload){
  const safeTarget=await assertSafePublicUrl(input.url,{lookupAll});
  const params=new URLSearchParams({
   url:safeTarget.href,
   strategy:input.strategy,
   category:'performance'
  });
  const key=input.apiKey||process.env.PSI_API_KEY;
  if(key)params.set('key',key);
  const endpoint=`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;
  const res=await fetchImpl(endpoint,{
   method:'GET',
   redirect:'manual',
   signal:AbortSignal.timeout(input.timeoutMs),
   headers:{accept:'application/json','user-agent':'ReproleafPSI/1.0'}
  });
  if(!res.ok){
   throw Error(`PageSpeed Insights API returned HTTP ${res.status}`);
  }
  psiPayload=await res.json();
 }

 const metrics=extractPsiMetrics(psiPayload);
 const correlations=correlateDomIssues(metrics,input.domPerfReport);
 const findings=[];

 if(metrics.field.lcpMs?.category==='POOR'){
  findings.push({code:'CWV_FIELD_LCP_POOR',severity:'error',message:`CrUX p75 LCP is ${metrics.field.lcpMs.percentile} ms (POOR).`});
 }
 if(metrics.field.inpMs?.category==='POOR'){
  findings.push({code:'CWV_FIELD_INP_POOR',severity:'error',message:`CrUX p75 INP is ${metrics.field.inpMs.percentile} ms (POOR).`});
 }
 if(metrics.field.cls?.category==='POOR'){
  findings.push({code:'CWV_FIELD_CLS_POOR',severity:'error',message:`CrUX p75 CLS (${metrics.field.cls.percentile}) is POOR.`});
 }
 if(metrics.performanceScore!==null&&metrics.performanceScore<50){
  findings.push({code:'PSI_LAB_SCORE_LOW',severity:'warning',message:`Lighthouse mobile/desktop performance score is ${metrics.performanceScore}/100.`});
 }

 return {
  ok:findings.every(f=>f.severity!=='error'),
  url:input.url,
  strategy:input.strategy,
  metrics,
  domCorrelations:correlations,
  findings
 };
}
