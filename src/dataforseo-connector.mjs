import {z} from 'zod';

export const dataForSeoByokSchema=z.object({
 action:z.enum(['volumes','serp']),
 keywords:z.array(z.string().min(1).max(200)).min(1).max(20),
 locationCode:z.number().int().min(1000).max(99999).default(2840),
 languageCode:z.string().min(2).max(10).default('en'),
 login:z.string().min(1).optional(),
 password:z.string().min(1).optional(),
 allowNetwork:z.literal(true),
 timeoutMs:z.number().int().min(1000).max(60000).default(30000)
}).strict();

function ensureSerpCacheTable(db){
 db.exec(`
  CREATE TABLE IF NOT EXISTS byok_serp_cache (
   cache_key TEXT PRIMARY KEY,
   action TEXT NOT NULL,
   keyword TEXT NOT NULL,
   location_code INTEGER NOT NULL,
   language_code TEXT NOT NULL,
   payload_json TEXT NOT NULL,
   fetched_at TEXT NOT NULL
  );
 `);
}

export function extractSerpFeaturesSummary(serpTask){
 const result=serpTask?.result?.[0];
 if(!result)return null;
 const items=Array.isArray(result.items)?result.items:[];
 const organic=items
  .filter(it=>it.type==='organic')
  .slice(0,10)
  .map(it=>({
   rank:it.rank_absolute??it.rank_group??null,
   domain:it.domain||null,
   url:it.url||null,
   title:it.title||''
  }));

 const hasAiOverview=items.some(it=>it.type==='ai_overview')||(Array.isArray(result.item_types)&&result.item_types.includes('ai_overview'));
 const hasFeaturedSnippet=items.some(it=>it.type==='featured_snippet')||(Array.isArray(result.item_types)&&result.item_types.includes('featured_snippet'));

 return {
  keyword:result.keyword||'',
  locationCode:result.location_code||null,
  languageCode:result.language_code||null,
  seResultsCount:result.se_results_count??null,
  hasAiOverview:Boolean(hasAiOverview),
  hasFeaturedSnippet:Boolean(hasFeaturedSnippet),
  top10:organic
 };
}

export async function runDataForSeoByok(rawInput,{fetchImpl=fetch,db=null}={}){
 const input=dataForSeoByokSchema.parse(rawInput);
 const login=input.login||process.env.DATAFORSEO_LOGIN;
 const password=input.password||process.env.DATAFORSEO_PASSWORD;
 if(!login||!password){
  throw Error('DataForSEO BYOK credentials required. Pass login/password or set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD.');
 }
 const auth='Basic '+Buffer.from(`${login}:${password}`).toString('base64');

 if(db)ensureSerpCacheTable(db);

 if(input.action==='volumes'){
  const res=await fetchImpl('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live',{
   method:'POST',
   signal:AbortSignal.timeout(input.timeoutMs),
   headers:{Authorization:auth,'Content-Type':'application/json'},
   body:JSON.stringify([{
    keywords:input.keywords,
    location_code:input.locationCode,
    language_code:input.languageCode
   }])
  });
  if(!res.ok)throw Error(`DataForSEO search_volume HTTP ${res.status}`);
  const data=await res.json();
  const rows=[];
  for(const task of data.tasks||[]){
   for(const item of task.result||[]){
    rows.push({
     keyword:item.keyword,
     searchVolume:item.search_volume??0,
     cpc:item.cpc??null,
     competition:item.competition||null
    });
    if(db){
     db.prepare('INSERT OR REPLACE INTO byok_serp_cache (cache_key, action, keyword, location_code, language_code, payload_json, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(`vol:${input.locationCode}:${input.languageCode}:${String(item.keyword||'').toLowerCase()}`,'volumes',String(item.keyword||''),input.locationCode,input.languageCode,JSON.stringify(item),new Date().toISOString());
    }
   }
  }
  return {
   ok:true,
   action:'volumes',
   cost:data.cost??null,
   count:rows.length,
   results:rows
  };
 }

 const serpBody=input.keywords.slice(0,10).map(kw=>({
  keyword:kw,
  location_code:input.locationCode,
  language_code:input.languageCode,
  depth:10
 }));
 const res=await fetchImpl('https://api.dataforseo.com/v3/serp/google/organic/live/advanced',{
  method:'POST',
  signal:AbortSignal.timeout(input.timeoutMs),
  headers:{Authorization:auth,'Content-Type':'application/json'},
  body:JSON.stringify(serpBody)
 });
 if(!res.ok)throw Error(`DataForSEO SERP HTTP ${res.status}`);
 const data=await res.json();
 const summaries=[];
 for(const task of data.tasks||[]){
  const summary=extractSerpFeaturesSummary(task);
  if(!summary)continue;
  summaries.push(summary);
  if(db){
   db.prepare('INSERT OR REPLACE INTO byok_serp_cache (cache_key, action, keyword, location_code, language_code, payload_json, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(`serp:${input.locationCode}:${input.languageCode}:${summary.keyword.toLowerCase()}`,'serp',summary.keyword,input.locationCode,input.languageCode,JSON.stringify(summary),new Date().toISOString());
  }
 }
 return {
  ok:true,
  action:'serp',
  cost:data.cost??null,
  count:summaries.length,
  results:summaries
 };
}
