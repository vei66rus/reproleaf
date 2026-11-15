import {z} from 'zod';

const serpEntrySchema=z.object({
 query:z.string().min(1).max(300),
 urls:z.array(z.string().min(1).max(2048)).min(1).max(20),
 volume:z.number().min(0).max(100000000).optional()
}).strict();

const existingPageSchema=z.object({
 url:z.string().min(1).max(2048),
 title:z.string().max(400).optional(),
 h1:z.string().max(400).optional(),
 primaryQuery:z.string().max(300).optional()
}).strict();

export const serpClusterSchema=z.object({
 entries:z.array(serpEntrySchema).min(2).max(1000),
 mode:z.enum(['hard','soft']).default('soft'),
 minOverlap:z.number().int().min(1).max(10).default(3),
 existingPages:z.array(existingPageSchema).max(2000).default([])
}).strict();

const stopWords=new Set([
 'the','and','for','with','how','to','of','in','on','a','an','is','are','by','from','or','vs',
 'и','в','на','по','для','как','что','из','от','до','при','без','под','над','или','а','но'
]);

function normalizeSerpUrl(raw){
 try{
  const u=new URL(raw);
  const path=u.pathname.replace(/\/+$/,'')||'/';
  return `${u.origin.toLowerCase()}${path.toLowerCase()}`;
 }catch{
  return String(raw||'').trim().toLowerCase().replace(/#.*$/,'').replace(/\/+$/,'');
 }
}

function tokenize(text){
 const tokens=(text||'').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)||[];
 return new Set(tokens.filter(t=>!stopWords.has(t)));
}

function jaccard(a,b){
 if(a.size===0||b.size===0)return 0;
 let inter=0;
 for(const t of a)if(b.has(t))inter+=1;
 const union=a.size+b.size-inter;
 return union>0?inter/union:0;
}

function countOverlap(setA,setB){
 let count=0;
 const [small,large]=setA.size<=setB.size?[setA,setB]:[setB,setA];
 for(const url of small)if(large.has(url))count+=1;
 return count;
}

function clusterSoft(items,adj){
 const visited=new Array(items.length).fill(false);
 const groups=[];
 for(let i=0;i<items.length;i+=1){
  if(visited[i])continue;
  const queue=[i];
  const group=[];
  visited[i]=true;
  while(queue.length>0){
   const cur=queue.shift();
   group.push(cur);
   for(const nxt of adj[cur]){
    if(!visited[nxt]){
     visited[nxt]=true;
     queue.push(nxt);
    }
   }
  }
  groups.push(group);
 }
 return groups;
}

function clusterHard(items,adj,overlapMatrix){
 const order=items
  .map((item,idx)=>({idx,vol:item.volume??0,deg:adj[idx].size}))
  .sort((a,b)=>(b.vol-a.vol)||(b.deg-a.deg)||(a.idx-b.idx))
  .map(x=>x.idx);
 const assigned=new Array(items.length).fill(false);
 const groups=[];
 for(const seed of order){
  if(assigned[seed])continue;
  const group=[seed];
  assigned[seed]=true;
  const candidates=[...adj[seed]].filter(i=>!assigned[i]).sort((a,b)=>overlapMatrix[seed][b]-overlapMatrix[seed][a]);
  for(const cand of candidates){
   if(group.every(member=>overlapMatrix[member][cand]>0)){
    group.push(cand);
    assigned[cand]=true;
   }
  }
  groups.push(group);
 }
 return groups;
}

function matchExistingPages(clusterUrls,primaryQuery,existingPrepared){
 const urlHits=[];
 const sharedSet=new Set(clusterUrls);
 for(const page of existingPrepared){
  if(sharedSet.has(page.normUrl)){
   urlHits.push({url:page.url,matchType:'serp_url_match',score:1});
  }
 }
 if(urlHits.length>0)return urlHits;

 const queryTokens=tokenize(primaryQuery);
 const lexicalHits=[];
 for(const page of existingPrepared){
  if(page.normalizedQuery&&page.normalizedQuery===primaryQuery.toLowerCase()){
   lexicalHits.push({url:page.url,matchType:'exact_primary_query',score:1});
   continue;
  }
  const sim=jaccard(queryTokens,page.tokens);
  if(sim>=0.4){
   lexicalHits.push({url:page.url,matchType:'lexical_topic_match',score:Number(sim.toFixed(3))});
  }
 }
 lexicalHits.sort((a,b)=>b.score-a.score);
 return lexicalHits.slice(0,3);
}

export function clusterSerpKeywords(rawInput){
 const parsed=serpClusterSchema.parse(rawInput);
 const items=parsed.entries.map((e,idx)=>({
  idx,
  query:e.query.trim(),
  volume:e.volume??null,
  urlSet:new Set(e.urls.slice(0,10).map(normalizeSerpUrl).filter(Boolean))
 }));

 const n=items.length;
 const adj=Array.from({length:n},()=>new Set());
 const overlapMatrix=Array.from({length:n},()=>new Int16Array(n));

 for(let i=0;i<n;i+=1){
  for(let j=i+1;j<n;j+=1){
   const overlap=countOverlap(items[i].urlSet,items[j].urlSet);
   if(overlap>=parsed.minOverlap){
    adj[i].add(j);
    adj[j].add(i);
    overlapMatrix[i][j]=overlap;
    overlapMatrix[j][i]=overlap;
   }
  }
 }

 const rawGroups=parsed.mode==='hard'
  ?clusterHard(items,adj,overlapMatrix)
  :clusterSoft(items,adj);

 const existingPrepared=parsed.existingPages.map(p=>({
  url:p.url,
  normUrl:normalizeSerpUrl(p.url),
  normalizedQuery:(p.primaryQuery||'').trim().toLowerCase(),
  tokens:tokenize([p.primaryQuery||'',p.title||'',p.h1||''].join(' '))
 }));

 const findings=[];
 const clusters=rawGroups.map((indices,cIdx)=>{
  const members=indices.map(i=>items[i]);
  members.sort((a,b)=>((b.volume??-1)-(a.volume??-1))||(a.query.length-b.query.length));
  const primary=members[0];
  const urlFrequency=new Map();
  for(const m of members){
   for(const u of m.urlSet){
    urlFrequency.set(u,(urlFrequency.get(u)||0)+1);
   }
  }
  const sharedTopUrls=[...urlFrequency.entries()]
   .filter(([,cnt])=>cnt>=Math.min(2,members.length))
   .sort((a,b)=>b[1]-a[1])
   .slice(0,10)
   .map(([url])=>url);
  const clusterUrlSet=new Set(urlFrequency.keys());
  const matches=matchExistingPages([...clusterUrlSet],primary.query,existingPrepared);
  const knownVolumes=members.map(m=>m.volume).filter(v=>typeof v==='number');
  const totalVolume=knownVolumes.length>0?knownVolumes.reduce((s,v)=>s+v,0):null;

  if(matches.length>1){
   findings.push({
    code:'CLUSTER_DUPLICATE_TARGET_RISK',
    severity:'warning',
    clusterId:`cluster-${cIdx+1}`,
    primaryQuery:primary.query,
    matchedUrls:matches.map(m=>m.url),
    message:`Cluster "${primary.query}" matches ${matches.length} existing pages (${matches.map(m=>m.url).join(', ')}).`,
    recommendation:'Consolidate overlapping site pages or assign a clear canonical primary target for this SERP cluster.'
   });
  }

  return {
   clusterId:`cluster-${cIdx+1}`,
   primaryQuery:primary.query,
   queryCount:members.length,
   totalVolume,
   action:matches.length>0?'OPTIMIZE_EXISTING':'CREATE_NEW_PAGE',
   matchedSitePages:matches,
   sharedTopUrls,
   queries:members.map(m=>({query:m.query,volume:m.volume}))
  };
 });

 clusters.sort((a,b)=>((b.totalVolume??0)-(a.totalVolume??0))||(b.queryCount-a.queryCount));

 return {
  ok:findings.every(f=>f.severity!=='error'),
  summary:{
   mode:parsed.mode,
   minOverlap:parsed.minOverlap,
   totalQueries:n,
   clusterCount:clusters.length,
   singletonClusters:clusters.filter(c=>c.queryCount===1).length,
   matchedExistingClusters:clusters.filter(c=>c.action==='OPTIMIZE_EXISTING').length,
   newPageClusters:clusters.filter(c=>c.action==='CREATE_NEW_PAGE').length
  },
  clusters,
  findings
 };
}
