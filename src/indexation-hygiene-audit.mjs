import {z} from 'zod';

const pageHygieneSchema=z.object({
 url:z.string().url().max(2048),
 canonical:z.string().url().max(2048).optional(),
 noindex:z.boolean().default(false),
 hasPrevLink:z.boolean().default(false),
 hasNextLink:z.boolean().default(false)
}).strict();

export const indexationHygieneSchema=z.object({
 pages:z.array(pageHygieneSchema).min(1).max(500)
}).strict();

const trackingOrFacetParams=new Set([
 'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
 'fbclid','gclid','yclid','msclkid','ref','sort','order','filter','sessionid'
]);

function extractPaginationNumber(parsedUrl){
 const qPage=Number(parsedUrl.searchParams.get('page')||parsedUrl.searchParams.get('p')||0);
 if(Number.isInteger(qPage)&&qPage>=2)return qPage;
 const pathMatch=parsedUrl.pathname.match(/\/page\/(\d+)(?:\/|$)/i);
 if(pathMatch){
  const n=Number(pathMatch[1]);
  if(Number.isInteger(n)&&n>=2)return n;
 }
 return null;
}

export function auditIndexationHygiene(rawInput){
 const parsed=indexationHygieneSchema.parse(rawInput);
 const findings=[];

 for(const page of parsed.pages){
  const u=new URL(page.url);
  const canonicalUrl=page.canonical?new URL(page.canonical):null;
  const pageNum=extractPaginationNumber(u);

  if(pageNum!==null&&canonicalUrl){
   const canPageNum=extractPaginationNumber(canonicalUrl);
   if(canPageNum!==pageNum){
    findings.push({
     code:'INDEXATION_PAGINATION_CANONICAL_TO_ROOT',
     severity:'error',
     url:page.url,
     canonical:page.canonical,
     message:`Paginated URL (page ${pageNum}) canonicalizes to ${page.canonical} instead of self-canonical.`,
     recommendation:'Use self-referencing rel="canonical" on each paginated page.'
    });
   }
  }

  const dirtyParams=[...u.searchParams.keys()].filter(k=>trackingOrFacetParams.has(k.toLowerCase()));
  if(dirtyParams.length>0&&!page.noindex){
   const canonicalStillDirty=!canonicalUrl||[...canonicalUrl.searchParams.keys()].some(k=>trackingOrFacetParams.has(k.toLowerCase()));
   if(canonicalStillDirty){
    findings.push({
     code:'INDEXATION_TRACKING_PARAM_INDEXABLE',
     severity:'error',
     url:page.url,
     params:dirtyParams,
     message:`Indexable URL exposes tracking/facet parameter(s) (${dirtyParams.join(', ')}) without clean canonical or noindex.`,
     recommendation:'Strip tracking/facet parameters in rel="canonical" or add meta robots noindex.'
    });
   }
  }

  if(page.noindex&&canonicalUrl&&canonicalUrl.href!==u.href){
   findings.push({
    code:'INDEXATION_NOINDEX_WITH_CANONICAL_TARGET',
    severity:'warning',
    url:page.url,
    canonical:page.canonical,
    message:`URL combines noindex with non-self canonical (${page.canonical}).`,
    recommendation:'Avoid mixing noindex and cross-page canonical; pick one consolidation signal.'
   });
  }

  if(!page.noindex&&/\/(?:tag|author)\/[^/]+/i.test(u.pathname)){
   findings.push({
    code:'INDEXATION_ARCHIVE_ROUTE_INDEXABLE',
    severity:'info',
    url:page.url,
    message:'Tag/author archive route is indexable.',
    recommendation:'Verify this archive has unique editorial value or apply noindex to prevent thin-content bloat.'
   });
  }
 }

 return {
  ok:findings.every(f=>f.severity!=='error'),
  summary:{
   pagesChecked:parsed.pages.length,
   errors:findings.filter(f=>f.severity==='error').length,
   warnings:findings.filter(f=>f.severity==='warning').length
  },
  findings
 };
}
