import {z} from 'zod';

const linkEquityPageSchema=z.object({
 url:z.string().min(1),
 depth:z.number().int().nonnegative().optional(),
 status:z.number().int().min(0).max(599).default(200),
 internalLinks:z.array(z.object({
  url:z.string().min(1)
 }).passthrough()).default([])
}).passthrough();

export const linkEquityInputSchema=z.object({
 startUrl:z.string().url().optional(),
 damping:z.number().min(0.1).max(0.99).default(0.85),
 iterations:z.number().int().min(5).max(100).default(40),
 pages:z.array(linkEquityPageSchema).min(1)
}).strict();

function powerRank(urls,outNeighbors,damping,iterations){
 const n=urls.length;
 if(n===0)return new Map();
 const idxMap=new Map(urls.map((u,i)=>[u,i]));
 let scores=new Float64Array(n).fill(1/n);
 const teleport=(1-damping)/n;

 for(let iter=0;iter<iterations;iter+=1){
  const next=new Float64Array(n).fill(teleport);
  let danglingSum=0;
  for(let i=0;i<n;i+=1){
   const targets=outNeighbors[i];
   if(targets.length===0){
    danglingSum+=scores[i];
   }else{
    const share=(damping*scores[i])/targets.length;
    for(const targetIdx of targets){
     next[targetIdx]+=share;
    }
   }
  }
  const danglingShare=(damping*danglingSum)/n;
  for(let i=0;i<n;i+=1)next[i]+=danglingShare;

  let diff=0;
  for(let i=0;i<n;i+=1)diff+=Math.abs(next[i]-scores[i]);
  scores=next;
  if(diff<1e-7)break;
 }

 const out=new Map();
 for(const [u,i] of idxMap.entries()){
  out.set(u,Number(scores[i].toFixed(6)));
 }
 return out;
}

export function analyzeInternalLinkEquity(rawInput){
 const input=linkEquityInputSchema.parse(rawInput);
 const urls=input.pages.map(p=>p.url);
 const urlSet=new Set(urls);
 const idxMap=new Map(urls.map((u,i)=>[u,i]));
 const n=urls.length;

 const forward=Array.from({length:n},()=>[]);
 const reverse=Array.from({length:n},()=>[]);
 const inDegree=new Int32Array(n);
 const outDegree=new Int32Array(n);

 for(let i=0;i<n;i+=1){
  const seenTargets=new Set();
  for(const link of input.pages[i].internalLinks){
   if(!urlSet.has(link.url)||link.url===urls[i]||seenTargets.has(link.url))continue;
   seenTargets.add(link.url);
   const tIdx=idxMap.get(link.url);
   forward[i].push(tIdx);
   reverse[tIdx].push(i);
   outDegree[i]+=1;
   inDegree[tIdx]+=1;
  }
 }

 const pageRankMap=powerRank(urls,forward,input.damping,input.iterations);
 const cheiRankMap=powerRank(urls,reverse,input.damping,input.iterations);

 const seedUrl=(input.startUrl&&urlSet.has(input.startUrl))?input.startUrl:(input.pages.find(p=>p.depth===0)?.url||urls[0]);
 const clickDepth=new Int32Array(n).fill(-1);
 const seedIdx=idxMap.get(seedUrl);
 clickDepth[seedIdx]=0;
 const bfs=[seedIdx];
 for(let head=0;head<bfs.length;head+=1){
  const u=bfs[head];
  for(const v of forward[u]){
   if(clickDepth[v]===-1){
    clickDepth[v]=clickDepth[u]+1;
    bfs.push(v);
   }
  }
 }

 const nodes=[];
 const orphanPages=[];
 const deadEndPages=[];
 const deepPages=[];

 for(let i=0;i<n;i+=1){
  const url=urls[i];
  const depthVal=clickDepth[i]===-1?null:clickDepth[i];
  const pageStatus=input.pages[i].status;
  const node={
   url,
   status:pageStatus,
   clickDepth:depthVal,
   inDegree:inDegree[i],
   outDegree:outDegree[i],
   pageRank:pageRankMap.get(url)||0,
   cheiRank:cheiRankMap.get(url)||0
  };
  nodes.push(node);

  if(url!==seedUrl&&inDegree[i]===0){
   orphanPages.push({url,clickDepth:depthVal,status:pageStatus});
  }
  if(pageStatus>=200&&pageStatus<300&&outDegree[i]===0){
   deadEndPages.push({url,inDegree:inDegree[i],pageRank:node.pageRank});
  }
  if(depthVal!==null&&depthVal>3){
   deepPages.push({url,clickDepth:depthVal,pageRank:node.pageRank});
  }
 }

 const topByPageRank=[...nodes].sort((a,b)=>b.pageRank-a.pageRank).slice(0,10);
 const topByCheiRank=[...nodes].sort((a,b)=>b.cheiRank-a.cheiRank).slice(0,10);

 return {
  ok:orphanPages.length===0&&deadEndPages.length===0,
  summary:{
   totalNodes:n,
   seedUrl,
   reachableCount:bfs.length,
   orphanCount:orphanPages.length,
   deadEndCount:deadEndPages.length,
   deepPageCount:deepPages.length,
   maxClickDepth:Math.max(0,...clickDepth.filter(d=>d>=0))
  },
  nodes,
  orphanPages,
  deadEndPages,
  deepPages,
  topByPageRank,
  topByCheiRank
 };
}
