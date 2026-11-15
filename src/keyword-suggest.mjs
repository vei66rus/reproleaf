import {z} from 'zod';

export const keywordSuggestSchema=z.object({
 seed:z.string().min(1).max(160),
 provider:z.enum(['google','yandex']).default('google'),
 locale:z.enum(['ru','en']).default('en'),
 mode:z.enum(['questions','alphabet','both']).default('questions'),
 allowNetwork:z.literal(true),
 maxRequests:z.number().int().min(1).max(60).default(20),
 delayMs:z.number().int().min(0).max(5000).default(200),
 timeoutMs:z.number().int().min(500).max(15000).default(8000),
 useCache:z.boolean().default(true)
}).strict();

const modifiers={
 en:{
  questions:['how','what','why','best','free','vs','for'],
  alphabet:'abcdefghijklmnopqrstuvwxyz'.split('')
 },
 ru:{
  questions:['как','что','почему','лучший','бесплатно','или','для'],
  alphabet:['а','б','в','г','д','е','з','и','к','л','м','н','о','п','р','с','т','у','ф','х','ч','ш','э','ю','я']
 }
};

export function buildSuggestQueries(seed,locale='en',mode='questions',maxRequests=20){
 const cleanSeed=seed.trim().replace(/\s+/g,' ');
 const queries=[{query:cleanSeed,modifier:'seed'}];
 const set=modifiers[locale]||modifiers.en;

 if(mode==='questions'||mode==='both'){
  for(const mod of set.questions){
   queries.push({query:`${cleanSeed} ${mod}`,modifier:`suffix:${mod}`});
   queries.push({query:`${mod} ${cleanSeed}`,modifier:`prefix:${mod}`});
  }
 }
 if(mode==='alphabet'||mode==='both'){
  for(const ch of set.alphabet){
   queries.push({query:`${cleanSeed} ${ch}`,modifier:`alpha:${ch}`});
  }
 }
 return queries.slice(0,maxRequests);
}

export function buildSuggestUrl(provider,query,locale){
 const encoded=encodeURIComponent(query);
 if(provider==='yandex'){
  return `https://suggest.yandex.ru/suggest-ya.cgi?part=${encoded}&lang=${locale}&v=4`;
 }
 return `https://suggestqueries.google.com/complete/search?client=firefox&hl=${locale}&q=${encoded}`;
}

export function parseSuggestPayload(provider,json){
 if(!Array.isArray(json)||json.length<2)return [];
 if(provider==='yandex'){
  return (Array.isArray(json[1])?json[1]:[]).map(item=>Array.isArray(item)?String(item[0]||''):String(item||'')).filter(Boolean);
 }
 return (Array.isArray(json[1])?json[1]:[]).map(item=>String(item||'')).filter(Boolean);
}

function ensureKeywordCacheTable(db){
 db.exec(`
  CREATE TABLE IF NOT EXISTS keyword_cache (
   cache_key TEXT PRIMARY KEY,
   provider TEXT NOT NULL,
   locale TEXT NOT NULL,
   query TEXT NOT NULL,
   suggestions_json TEXT NOT NULL,
   fetched_at TEXT NOT NULL
  );
 `);
}

export async function collectKeywordSuggestTree(rawInput,{
 fetchImpl=fetch,
 waitImpl=ms=>new Promise(r=>setTimeout(r,ms)),
 db=null
}={}){
 const input=keywordSuggestSchema.parse(rawInput);
 const plan=buildSuggestQueries(input.seed,input.locale,input.mode,input.maxRequests);

 if(db&&input.useCache){
  ensureKeywordCacheTable(db);
 }

 const uniqueMap=new Map();
 const errors=[];
 let cacheHits=0;
 let networkRequests=0;

 for(const step of plan){
  const cacheKey=`${input.provider}:${input.locale}:${step.query.toLowerCase()}`;
  let suggestions=null;

  if(db&&input.useCache){
   const row=db.prepare('SELECT suggestions_json FROM keyword_cache WHERE cache_key = ?').get(cacheKey);
   if(row){
    suggestions=JSON.parse(row.suggestions_json);
    cacheHits+=1;
   }
  }

  if(suggestions===null){
   if(networkRequests>0&&input.delayMs>0)await waitImpl(input.delayMs);
   networkRequests+=1;
   const endpoint=buildSuggestUrl(input.provider,step.query,input.locale);
   try{
    const res=await fetchImpl(endpoint,{
     method:'GET',
     redirect:'manual',
     signal:AbortSignal.timeout(input.timeoutMs),
     headers:{accept:'application/json','user-agent':'ReproleafKeywords/1.0'}
    });
    if(!res.ok){
     errors.push({query:step.query,status:res.status,error:`HTTP ${res.status}`});
     continue;
    }
    const data=await res.json();
    suggestions=parseSuggestPayload(input.provider,data);
    if(db&&input.useCache){
     db.prepare('INSERT OR REPLACE INTO keyword_cache (cache_key, provider, locale, query, suggestions_json, fetched_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(cacheKey,input.provider,input.locale,step.query,JSON.stringify(suggestions),new Date().toISOString());
    }
   }catch(err){
    errors.push({query:step.query,status:0,error:err.message});
    continue;
   }
  }

  for(const rawTerm of suggestions){
   const cleaned=rawTerm.trim().replace(/\s+/g,' ');
   const norm=cleaned.toLowerCase();
   if(!cleaned)continue;
   if(!uniqueMap.has(norm)){
    uniqueMap.set(norm,{keyword:cleaned,sources:[step.modifier],queriesMatched:1});
   }else{
    const rec=uniqueMap.get(norm);
    if(!rec.sources.includes(step.modifier))rec.sources.push(step.modifier);
    rec.queriesMatched+=1;
   }
  }
 }

 const keywords=[...uniqueMap.values()].sort((a,b)=>b.queriesMatched-a.queriesMatched||a.keyword.localeCompare(b.keyword));

 return {
  ok:errors.length<plan.length,
  summary:{
   seed:input.seed,
   provider:input.provider,
   locale:input.locale,
   mode:input.mode,
   plannedSteps:plan.length,
   cacheHits,
   networkRequests,
   uniqueKeywordCount:keywords.length,
   errorCount:errors.length
  },
  keywords,
  errors
 };
}
