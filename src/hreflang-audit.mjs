import {z} from 'zod';

function isHttpReference(value){
 try{const url=new URL(value);return /^https?:\/\//i.test(value)&&!/[\s\u0000-\u001f\u007f]/.test(value)&&!url.username&&!url.password&&!url.hash;}catch{return false;}
}

export const hreflangAuditSchema=z.object({
 pages:z.array(z.object({
  url:z.string().max(2048).refine(isHttpReference,'Use an absolute HTTP(S) URL without whitespace, credentials or fragments').pipe(z.string().url()),
  htmlLang:z.string().max(32).optional(),
  canonical:z.string().max(2048).optional(),
  alternates:z.array(z.object({
   hreflang:z.string().min(1).max(32),
   href:z.string().max(2048).refine(isHttpReference,'Use an absolute HTTP(S) URL without whitespace, credentials or fragments').pipe(z.string().url())
  }).strict()).max(100)
 }).strict()).min(1).max(500)
}).strict();

const hreflangPattern=/^(?:x-default|[a-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?)$/;

function primaryLang(code){
 return String(code||'').trim().toLowerCase().split('-')[0];
}

export function auditHreflangMatrix(rawInput){
 const parsed=hreflangAuditSchema.parse(rawInput);
 const pageMap=new Map();
 for(const page of parsed.pages){
  if(pageMap.has(page.url))throw Error(`Duplicate page URL "${page.url}".`);
  pageMap.set(page.url,page);
 }

 const findings=[];
 let alternatesTotal=0;
 let missingReturnLinks=0;
 let missingSelfLinks=0;
 let uncheckedReturnLinks=0;
 const matrix=[];

 for(const page of parsed.pages){
  alternatesTotal+=page.alternates.length;
  const seenCodes=new Set();
  const duplicateCodes=new Set();
  const selfAlternates=[];

  if(page.canonical&&page.canonical!==page.url&&page.alternates.length>0){
   findings.push({
    code:'HREFLANG_NON_CANONICAL_PAGE',
    severity:'error',
    url:page.url,
    target:page.canonical,
    message:`Page "${page.url}" declares hreflang alternates but its canonical points to "${page.canonical}".`,
    recommendation:'Declare hreflang only on canonical URLs.'
   });
  }

  for(const alt of page.alternates){
   const code=alt.hreflang.trim().toLowerCase();
   if(!hreflangPattern.test(code)){
    findings.push({
     code:'HREFLANG_INVALID_CODE',
     severity:'error',
     url:page.url,
     target:alt.href,
     message:`Invalid hreflang code "${alt.hreflang}" on "${page.url}".`,
    recommendation:'Use a supported language or language-region annotation, or x-default. This checker validates the supported syntax subset, not registry membership.'
    });
   }
   if(seenCodes.has(code))duplicateCodes.add(code);
   else seenCodes.add(code);
   if(alt.href===page.url)selfAlternates.push(code);
  }

  for(const dup of duplicateCodes){
   findings.push({
    code:'HREFLANG_DUPLICATE_CODE',
    severity:'error',
    url:page.url,
    target:page.url,
    message:`Duplicate hreflang "${dup}" on "${page.url}".`,
    recommendation:'Keep one alternate link per hreflang value on each page.'
   });
  }

  if(page.alternates.length>0&&selfAlternates.length===0){
   missingSelfLinks+=1;
   findings.push({
    code:'HREFLANG_MISSING_SELF',
    severity:'error',
    url:page.url,
    target:page.url,
    message:`Page "${page.url}" is missing a self-referencing hreflang link.`,
    recommendation:'Include an alternate link pointing to the page itself with its own language code.'
   });
  }

  if(page.htmlLang){
   const docLang=primaryLang(page.htmlLang);
   const nonDefaultSelf=selfAlternates.filter(c=>c!=='x-default');
   if(nonDefaultSelf.length>0&&!nonDefaultSelf.some(c=>primaryLang(c)===docLang)){
    findings.push({
     code:'HREFLANG_HTML_LANG_MISMATCH',
     severity:'warning',
     url:page.url,
     target:page.url,
     message:`html[lang="${page.htmlLang}"] does not match self-referencing hreflang (${nonDefaultSelf.join(', ')}).`,
     recommendation:'Align <html lang="..."> with the page self-referencing hreflang.'
    });
   }
  }

  if(page.alternates.length>=2&&!seenCodes.has('x-default')){
   findings.push({
    code:'HREFLANG_MISSING_X_DEFAULT',
    severity:'info',
    url:page.url,
    target:page.url,
    message:`Multilingual page "${page.url}" does not declare an optional x-default alternate.`,
    recommendation:'Consider x-default if a fallback language or selector page is useful. Its absence alone is not a hreflang error.'
   });
  }

  for(const alt of page.alternates){
   if(alt.href===page.url)continue;
   const targetPage=pageMap.get(alt.href);
   if(!targetPage){
    uncheckedReturnLinks+=1;
    findings.push({code:'HREFLANG_TARGET_NOT_SUPPLIED',severity:'info',url:page.url,target:alt.href,message:`The target "${alt.href}" was not supplied. Its return link was not checked.`,recommendation:'Include the target page in the supplied matrix to check reciprocity. No URL is fetched.'});
    continue;
   }
   const expectedCodes=selfAlternates.filter(code=>code!=='x-default');
   const hasReturn=targetPage.alternates.some(back=>back.href===page.url&&(expectedCodes.length===0||expectedCodes.includes(back.hreflang.trim().toLowerCase())));
   if(!hasReturn){
    missingReturnLinks+=1;
    findings.push({
     code:'HREFLANG_MISSING_RETURN_LINK',
     severity:'error',
     url:page.url,
     target:alt.href,
     message:`Page "${page.url}" links to "${alt.href}" (${alt.hreflang}), but "${alt.href}" has no return hreflang link back.`,
     recommendation:'Ensure every hreflang pair is reciprocal between both pages.'
    });
   }
  }

  matrix.push({
   url:page.url,
   htmlLang:page.htmlLang||null,
   codes:[...seenCodes],
   hasSelfLink:selfAlternates.length>0,
   hasXDefault:seenCodes.has('x-default')
  });
 }

 const errors=findings.filter(f=>f.severity==='error').length;
 const warnings=findings.filter(f=>f.severity==='warning').length;
 return {
  ok:errors===0&&uncheckedReturnLinks===0&&alternatesTotal>0,
  status:alternatesTotal===0?'not-processed':uncheckedReturnLinks>0?'partial':errors>0?'issues-found':'completed',
  summary:{
   pages:parsed.pages.length,
   alternatesTotal,
   missingReturnLinks,
   missingSelfLinks,
   uncheckedReturnLinks,
   errors,
   warnings
  },
  matrix,
  findings,
  coverage:{suppliedPages:parsed.pages.length,reciprocityComplete:uncheckedReturnLinks===0&&alternatesTotal>0,languageCodeValidation:'syntax-only; language/region registry membership not checked',urlMatching:'Exact supplied strings; redirects and URL equivalence are not resolved.',httpStatusChecked:false,renderedContentChecked:false},
  limits:['Validates reciprocal hreflang links across at most 500 supplied pages without fetching remote URLs. Missing targets remain unchecked; no alternates means not processed.']
 };
}
