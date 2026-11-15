import {z} from 'zod';

const anomalyPageSchema=z.object({
 url:z.string().min(1),
 status:z.number().int().min(0).max(599),
 title:z.string().default(''),
 description:z.string().default(''),
 h1:z.array(z.string()).default([]),
 canonical:z.string().default(''),
 wordCount:z.number().int().nonnegative().default(0)
}).passthrough();

export const crawlAnomaliesSchema=z.object({
 pages:z.array(anomalyPageSchema)
}).passthrough();

const soft404Re=/\b(?:404|page not found|not found|nothing found|error 404|oops! that page)\b|(?:страница не найдена|ничего не найдено|ошибка 404|не найдена)/iu;
const bloatParamNames=new Set(['sort','order','dir','filter','utm_source','utm_medium','utm_campaign','utm_term','utm_content','fbclid','gclid','yclid','page','p','paged']);

function normalizeText(value){
 return String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
}

function normalizeUrlForCompare(raw){
 try{
  const u=new URL(raw);
  u.hash='';
  if(u.pathname.length>1&&u.pathname.endsWith('/'))u.pathname=u.pathname.slice(0,-1);
  return u.href;
 }catch{
  return String(raw||'').trim();
 }
}

function collectDuplicates(entries,fieldName){
 const groups=new Map();
 for(const item of entries){
  const norm=normalizeText(item.value);
  if(!norm)continue;
  if(!groups.has(norm))groups.set(norm,{value:item.value,urls:[]});
  const group=groups.get(norm);
  if(!group.urls.includes(item.url))group.urls.push(item.url);
 }
 return [...groups.values()]
  .filter(g=>g.urls.length>=2)
  .map(g=>({field:fieldName,value:g.value,count:g.urls.length,urls:g.urls}));
}

export function classifyCrawlAnomalies(rawInput,{thinContentThreshold=150,soft404WordLimit=180}={}){
 const parsed=crawlAnomaliesSchema.parse(rawInput);
 const activePages=parsed.pages.filter(p=>p.status>=200&&p.status<300);

 const soft404s=[];
 const thinPages=[];
 const missingTitle=[];
 const missingDescription=[];
 const missingH1=[];
 const paramBloatUrls=[];
 const findings=[];

 const titleEntries=[];
 const descEntries=[];
 const h1Entries=[];

 for(const page of activePages){
  const titleText=page.title.trim();
  const descText=page.description.trim();
  const firstH1=(page.h1[0]||'').trim();

  if(!titleText){
   missingTitle.push(page.url);
   findings.push({code:'CRAWL_MISSING_TITLE',severity:'error',url:page.url,message:`Page has empty <title>: ${page.url}`});
  }else{
   titleEntries.push({url:page.url,value:titleText});
  }

  if(!descText){
   missingDescription.push(page.url);
   findings.push({code:'CRAWL_MISSING_DESCRIPTION',severity:'warning',url:page.url,message:`Page is missing meta description: ${page.url}`});
  }else{
   descEntries.push({url:page.url,value:descText});
  }

  if(!firstH1){
   missingH1.push(page.url);
   findings.push({code:'CRAWL_MISSING_H1',severity:'warning',url:page.url,message:`Page is missing an H1 heading: ${page.url}`});
  }else{
   h1Entries.push({url:page.url,value:firstH1});
  }

  if(page.wordCount<soft404WordLimit&&(soft404Re.test(titleText)||soft404Re.test(firstH1))){
   soft404s.push({url:page.url,title:titleText,h1:firstH1,wordCount:page.wordCount});
   findings.push({
    code:'CRAWL_SOFT_404',
    severity:'error',
    url:page.url,
    message:`HTTP 200 page matches soft-404 signals (${page.wordCount} words): "${titleText||firstH1}".`
   });
  }else if(page.wordCount<thinContentThreshold){
   thinPages.push({url:page.url,wordCount:page.wordCount});
   findings.push({
    code:'CRAWL_THIN_CONTENT',
    severity:'warning',
    url:page.url,
    wordCount:page.wordCount,
    message:`Thin content detected (${page.wordCount} words < ${thinContentThreshold}).`
   });
  }

  try{
   const u=new URL(page.url);
   const matchedParams=[...u.searchParams.keys()].filter(k=>bloatParamNames.has(k.toLowerCase()));
   const paginatedPath=/\/page\/\d+(?:\/|$)/i.test(u.pathname);
   if(matchedParams.length>0||paginatedPath){
    const normPage=normalizeUrlForCompare(page.url);
    const normCanon=page.canonical?normalizeUrlForCompare(page.canonical):'';
    if(!normCanon||normCanon===normPage){
     paramBloatUrls.push({url:page.url,params:matchedParams,paginatedPath,canonical:page.canonical||null});
     findings.push({
      code:'CRAWL_PARAM_PAGINATION_BLOAT',
      severity:'warning',
      url:page.url,
      message:`Parameterized or paginated URL lacks canonical consolidation to clean root URL.`
     });
    }
   }
  }catch{}
 }

 const duplicateTitles=collectDuplicates(titleEntries,'title');
 const duplicateDescriptions=collectDuplicates(descEntries,'description');
 const duplicateH1s=collectDuplicates(h1Entries,'h1');

 for(const d of duplicateTitles){
  findings.push({
   code:'CRAWL_DUPLICATE_TITLE',
   severity:'warning',
   urls:d.urls,
   message:`Duplicate title "${d.value}" shared across ${d.count} pages.`
  });
 }
 for(const d of duplicateDescriptions){
  findings.push({
   code:'CRAWL_DUPLICATE_DESCRIPTION',
   severity:'warning',
   urls:d.urls,
   message:`Duplicate meta description "${d.value.slice(0,80)}" shared across ${d.count} pages.`
  });
 }
 for(const d of duplicateH1s){
  findings.push({
   code:'CRAWL_DUPLICATE_H1',
   severity:'warning',
   urls:d.urls,
   message:`Duplicate H1 "${d.value}" shared across ${d.count} pages.`
  });
 }

 const errors=findings.filter(f=>f.severity==='error').length;
 const warnings=findings.filter(f=>f.severity==='warning').length;

 return {
  ok:errors===0,
  summary:{
   checkedPages:activePages.length,
   errors,
   warnings,
   soft404Count:soft404s.length,
   thinContentCount:thinPages.length,
   missingTitleCount:missingTitle.length,
   missingDescriptionCount:missingDescription.length,
   missingH1Count:missingH1.length,
   duplicateTitleGroups:duplicateTitles.length,
   duplicateDescriptionGroups:duplicateDescriptions.length,
   duplicateH1Groups:duplicateH1s.length,
   paramBloatCount:paramBloatUrls.length
  },
  soft404s,
  thinPages,
  missingTitle,
  missingDescription,
  missingH1,
  duplicates:{
   titles:duplicateTitles,
   descriptions:duplicateDescriptions,
   h1s:duplicateH1s
  },
  paramBloatUrls,
  findings
 };
}
