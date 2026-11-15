import {z} from 'zod';

export const cocoonAuditSchema=z.object({
 siteUrl:z.string().url().max(2048),
 rootUrl:z.string().url().max(2048).optional(),
 pages:z.array(z.object({
  url:z.string().url().max(2048),
  title:z.string().max(300).optional(),
  cluster:z.string().max(120).optional(),
  kind:z.enum(['hub','cluster','supporting','money','page']).default('page'),
  links:z.array(z.object({
   href:z.string().max(2048),
   anchor:z.string().max(300).default('')
  }).strict()).max(500).default([])
 }).strict()).min(1).max(1000)
}).strict();

const genericAnchors=new Set([
 'click here','read more','more','here','link','learn more','this page',
 'подробнее','тут','здесь','ссылка','читать далее','далее','источник'
]);

function normalizeUrl(raw,baseUrl,siteOrigin){
 try{
  const parsed=new URL(raw,baseUrl);
  if(parsed.origin!==siteOrigin)return null;
  parsed.hash='';
  return parsed.href;
 }catch{
  return null;
 }
}

export function auditCocoonGraph(rawInput){
 const parsed=cocoonAuditSchema.parse(rawInput);
 const siteOrigin=new URL(parsed.siteUrl).origin;
 const pageMap=new Map();
 for(const page of parsed.pages){
  const norm=normalizeUrl(page.url,parsed.siteUrl,siteOrigin);
  if(!norm)throw Error(`Page URL "${page.url}" does not match siteUrl origin "${siteOrigin}".`);
  if(pageMap.has(norm))throw Error(`Duplicate page URL "${norm}".`);
  pageMap.set(norm,{
   url:norm,
   title:page.title||null,
   cluster:page.cluster||null,
   kind:page.kind,
   links:page.links,
   inDegree:0,
   outDegree:0,
   clickDepth:null,
   incomingAnchors:[]
  });
 }

 const edges=[];
 let emptyAnchors=0;
 let genericAnchorCount=0;
 const findings=[];

 for(const page of pageMap.values()){
  for(const link of page.links){
   const targetUrl=normalizeUrl(link.href,page.url,siteOrigin);
   if(!targetUrl||targetUrl===page.url)continue;
   const target=pageMap.get(targetUrl);
   if(!target)continue;
   const anchor=link.anchor.trim();
   edges.push({from:page.url,to:target.url,anchor});
   page.outDegree+=1;
   target.inDegree+=1;
   target.incomingAnchors.push(anchor);
   if(!anchor){
    emptyAnchors+=1;
    findings.push({
     code:'COCOON_EMPTY_ANCHOR',
     severity:'warning',
     url:page.url,
     target:target.url,
     message:`Internal link from "${page.url}" to "${target.url}" has an empty anchor.`,
     recommendation:'Use a descriptive anchor reflecting the target page topic.'
    });
   }else if(genericAnchors.has(anchor.toLowerCase())){
    genericAnchorCount+=1;
    findings.push({
     code:'COCOON_GENERIC_ANCHOR',
     severity:'warning',
     url:page.url,
     target:target.url,
     message:`Generic anchor "${anchor}" used from "${page.url}" to "${target.url}".`,
     recommendation:'Replace generic anchor text with topic-specific terminology.'
    });
   }
  }
 }

 const adjacency=new Map();
 for(const url of pageMap.keys())adjacency.set(url,[]);
 for(const edge of edges){
  adjacency.get(edge.from).push(edge.to);
 }

 const rootNorm=parsed.rootUrl?normalizeUrl(parsed.rootUrl,parsed.siteUrl,siteOrigin):null;
 const roots=[];
 if(rootNorm&&pageMap.has(rootNorm)){
  roots.push(rootNorm);
 }else{
  const siteRoot=normalizeUrl(parsed.siteUrl,parsed.siteUrl,siteOrigin);
  if(siteRoot&&pageMap.has(siteRoot))roots.push(siteRoot);
  else{
   for(const page of pageMap.values()){
    if(page.kind==='hub'||page.kind==='money')roots.push(page.url);
   }
   if(roots.length===0){
    const first=pageMap.keys().next().value;
    if(first)roots.push(first);
   }
  }
 }

 const queue=[];
 for(const r of roots){
  const node=pageMap.get(r);
  if(node&&node.clickDepth===null){
   node.clickDepth=0;
   queue.push(r);
  }
 }
 for(let i=0;i<queue.length;i+=1){
  const curr=queue[i];
  const depth=pageMap.get(curr).clickDepth;
  for(const next of adjacency.get(curr)){
   const nextNode=pageMap.get(next);
   if(nextNode.clickDepth===null){
    nextNode.clickDepth=depth+1;
    queue.push(next);
   }
  }
 }

 let orphans=0;
 let deepPages=0;
 const rootSet=new Set(roots);
 for(const page of pageMap.values()){
  if(page.inDegree===0&&!rootSet.has(page.url)){
   orphans+=1;
   findings.push({
    code:'COCOON_ORPHAN_PAGE',
    severity:'error',
    url:page.url,
    target:page.url,
    message:`Orphan page "${page.url}" has 0 incoming internal links.`,
    recommendation:'Link to this page from its cluster hub or related supporting articles.'
   });
  }
  if(page.clickDepth===null||page.clickDepth>3){
   deepPages+=1;
   findings.push({
    code:'COCOON_DEEP_PAGE',
    severity:'warning',
    url:page.url,
    target:page.url,
    message:page.clickDepth===null?`Page "${page.url}" is unreachable from root pages.`:`Page "${page.url}" is at click depth ${page.clickDepth} (> 3).`,
    recommendation:'Reduce click depth by adding links from hub or top-level navigation.'
   });
  }
  if(page.inDegree>=3){
   const counts=new Map();
   for(const rawAnchor of page.incomingAnchors){
    const normAnchor=rawAnchor.toLowerCase();
    if(!normAnchor)continue;
    counts.set(normAnchor,(counts.get(normAnchor)||0)+1);
   }
   for(const [anchorText,count] of counts.entries()){
    if(count/page.inDegree>=0.7&&count>=3){
     findings.push({
      code:'COCOON_ANCHOR_CONCENTRATION',
      severity:'warning',
      url:page.url,
      target:page.url,
      message:`Anchor "${anchorText}" accounts for ${count}/${page.inDegree} incoming links to "${page.url}".`,
      recommendation:'Vary incoming anchor phrasing naturally across supporting pages.'
     });
    }
   }
  }
 }

 const clusterMap=new Map();
 for(const page of pageMap.values()){
  if(!page.cluster)continue;
  if(!clusterMap.has(page.cluster))clusterMap.set(page.cluster,[]);
  clusterMap.get(page.cluster).push(page);
 }

 const clusterSummaries=[];
 for(const [clusterName,members] of clusterMap.entries()){
  const hubs=members.filter(m=>m.kind==='hub'||m.kind==='money');
  const hubSet=new Set(hubs.map(h=>h.url));
  const supporting=members.filter(m=>!hubSet.has(m.url));
  if(hubs.length===0&&supporting.length>0){
   findings.push({
    code:'COCOON_CLUSTER_MISSING_HUB',
    severity:'error',
    url:supporting[0].url,
    target:clusterName,
    message:`Cluster "${clusterName}" has ${supporting.length} pages but no hub or money page.`,
    recommendation:'Designate a primary hub page for the cluster and link supporting pages to it.'
   });
  }
  const edgeSet=new Set(edges.map(e=>`${e.from}=>${e.to}`));
  for(const sup of supporting){
   for(const hub of hubs){
    if(!edgeSet.has(`${sup.url}=>${hub.url}`)){
     findings.push({
      code:'COCOON_HUB_NOT_LINKED_FROM_SUPPORTING',
      severity:'warning',
      url:sup.url,
      target:hub.url,
      message:`Supporting page "${sup.url}" in cluster "${clusterName}" does not link to hub "${hub.url}".`,
      recommendation:'Add an internal link from the supporting page back to its cluster hub.'
     });
    }
    if(!edgeSet.has(`${hub.url}=>${sup.url}`)){
     findings.push({
      code:'COCOON_SUPPORTING_NOT_LINKED_FROM_HUB',
      severity:'warning',
      url:hub.url,
      target:sup.url,
      message:`Hub "${hub.url}" in cluster "${clusterName}" does not link to supporting page "${sup.url}".`,
      recommendation:'Link from the cluster hub to each supporting article in the cocoon.'
     });
    }
   }
  }
  const memberUrls=new Set(members.map(m=>m.url));
  let intraLinks=0;
  let crossClusterLinks=0;
  for(const edge of edges){
   if(!memberUrls.has(edge.from))continue;
   const targetPage=pageMap.get(edge.to);
   if(targetPage.cluster===clusterName)intraLinks+=1;
   else if(targetPage.cluster)crossClusterLinks+=1;
  }
  const totalClusterOut=intraLinks+crossClusterLinks;
  if(totalClusterOut>=4&&crossClusterLinks/totalClusterOut>0.5){
   findings.push({
    code:'COCOON_CROSS_CLUSTER_LEAK',
    severity:'warning',
    url:hubs[0]?.url||members[0].url,
    target:clusterName,
    message:`Cluster "${clusterName}" sends ${crossClusterLinks}/${totalClusterOut} cluster links to other clusters (> 50%).`,
    recommendation:'Keep internal linking focused within the cocoon and route cross-cluster links primarily through hub pages.'
   });
  }
  clusterSummaries.push({
   cluster:clusterName,
   pages:members.length,
   hubs:hubs.map(h=>h.url),
   intraClusterLinks:intraLinks,
   crossClusterLinks
  });
 }

 const errors=findings.filter(f=>f.severity==='error').length;
 const warnings=findings.filter(f=>f.severity==='warning').length;
 return {
  ok:errors===0,
  siteOrigin,
  summary:{
   pages:pageMap.size,
   internalEdges:edges.length,
   clusters:clusterSummaries.length,
   orphans,
   deepPages,
   emptyAnchors,
   genericAnchors:genericAnchorCount,
   errors,
   warnings
  },
  clusters:clusterSummaries,
  pages:[...pageMap.values()].map(p=>({
   url:p.url,
   cluster:p.cluster,
   kind:p.kind,
   inDegree:p.inDegree,
   outDegree:p.outDegree,
   clickDepth:p.clickDepth
  })),
  findings,
  limits:['Analyzes supplied internal page graph, cluster labels and anchor texts without crawling live URLs.']
 };
}
