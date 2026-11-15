import {z} from 'zod';
import {auditCocoonGraph} from './cocoon-audit.mjs';

const cocoonNodeInputSchema=z.object({
 url:z.string().url().max(2048),
 title:z.string().max(300),
 targetKeyword:z.string().min(1).max(200),
 keywords:z.array(z.string().max(200)).max(50).default([]),
 parentUrl:z.string().url().max(2048).optional(),
 kind:z.enum(['cluster','supporting','money']).default('cluster'),
 draftText:z.string().max(200000).optional(),
 existingLinks:z.array(z.object({
  href:z.string().max(2048),
  anchor:z.string().max(300).default('')
 }).strict()).max(500).default([])
}).strict();

export const cocoonPlanSchema=z.object({
 siteUrl:z.string().url().max(2048),
 pillar:z.object({
  url:z.string().url().max(2048),
  title:z.string().max(300),
  targetKeyword:z.string().min(1).max(200),
  keywords:z.array(z.string().max(200)).max(50).default([]),
  draftText:z.string().max(200000).optional(),
  existingLinks:z.array(z.object({
   href:z.string().max(2048),
   anchor:z.string().max(300).default('')
  }).strict()).max(500).default([])
 }).strict(),
 clusters:z.array(cocoonNodeInputSchema).min(1).max(100),
 brandTerms:z.array(z.string().max(120)).max(30).default([])
}).strict();

const genericAnchorSet=new Set([
 'click here','read more','more','here','link','learn more','this page','source','website',
 'подробнее','тут','здесь','ссылка','читать далее','далее','источник','сайт','перейти'
]);

function normalizeUrl(raw,siteOrigin){
 try{
  const u=new URL(raw,siteOrigin);
  u.hash='';
  return u.href;
 }catch{
  return String(raw||'').trim();
 }
}

function classifyAnchor(anchor,targetKeyword,brandTerms){
 const clean=String(anchor||'').trim().toLowerCase();
 if(!clean)return 'generic';
 if(/^https?:\/\/|^www\.|\.[a-z]{2,}\//i.test(clean))return 'url';
 if(genericAnchorSet.has(clean))return 'generic';
 for(const brand of brandTerms){
  const b=brand.toLowerCase().trim();
  if(b&&clean.includes(b))return 'branded';
 }
 const targetClean=targetKeyword.toLowerCase().trim();
 if(targetClean&&clean===targetClean)return 'exact';
 return 'partial';
}

function escapeRegExp(val){
 return val.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

function stripLinkedSegments(paragraph){
 return paragraph
  .replace(/\[[^\]]*\]\([^)]*\)/g,' ')
  .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi,' ');
}

function splitParagraphs(text){
 return String(text||'')
  .split(/\r?\n\s*\r?\n/)
  .map(p=>p.trim())
  .filter(p=>p.length>20&&!/^#{1,6}\s/.test(p));
}

export function planCocoonAndAnchors(rawInput){
 const parsed=cocoonPlanSchema.parse(rawInput);
 const siteOrigin=new URL(parsed.siteUrl).origin;
 const pillarUrl=normalizeUrl(parsed.pillar.url,siteOrigin);

 const allNodes=[
  {
   url:pillarUrl,
   title:parsed.pillar.title,
   targetKeyword:parsed.pillar.targetKeyword,
   keywords:parsed.pillar.keywords,
   kind:'hub',
   parentUrl:null,
   draftText:parsed.pillar.draftText||'',
   existingLinks:parsed.pillar.existingLinks
  },
  ...parsed.clusters.map(c=>({
   url:normalizeUrl(c.url,siteOrigin),
   title:c.title,
   targetKeyword:c.targetKeyword,
   keywords:c.keywords,
   kind:c.kind,
   parentUrl:c.parentUrl?normalizeUrl(c.parentUrl,siteOrigin):pillarUrl,
   draftText:c.draftText||'',
   existingLinks:c.existingLinks
  }))
 ];

 const nodeByUrl=new Map(allNodes.map(n=>[n.url,n]));
 const graphAudit=auditCocoonGraph({
  siteUrl:parsed.siteUrl,
  rootUrl:pillarUrl,
  pages:allNodes.map(n=>({
   url:n.url,
   title:n.title,
   cluster:parsed.pillar.targetKeyword,
   kind:n.kind,
   links:n.existingLinks
  }))
 });

 const anchorStatsByTarget=new Map();
 for(const n of allNodes){
  anchorStatsByTarget.set(n.url,{branded:0,exact:0,partial:0,url:0,generic:0,total:0});
 }

 const findings=[...graphAudit.findings];

 for(const donor of allNodes){
  const outTargets=new Set(donor.existingLinks.map(l=>normalizeUrl(l.href,siteOrigin)));
  if(donor.url!==pillarUrl&&!outTargets.has(pillarUrl)){
   findings.push({
    code:'PLANNER_MISSING_PILLAR_BACKLINK',
    severity:'warning',
    url:donor.url,
    target:pillarUrl,
    message:`Node "${donor.url}" does not link upward to pillar "${pillarUrl}".`,
    recommendation:`Insert a contextual partial/branded link from "${donor.url}" back to the pillar page.`
   });
  }
  if(donor.url===pillarUrl){
   for(const child of allNodes.filter(n=>n.kind==='cluster')){
    if(!outTargets.has(child.url)){
     findings.push({
      code:'PLANNER_PILLAR_MISSING_CLUSTER_LINK',
      severity:'warning',
      url:pillarUrl,
      target:child.url,
      message:`Pillar "${pillarUrl}" does not link downward to cluster "${child.url}".`,
      recommendation:`Link from pillar section summary to "${child.url}" with descriptive anchor text.`
     });
    }
   }
  }
  for(const link of donor.existingLinks){
   const tgtUrl=normalizeUrl(link.href,siteOrigin);
   const tgtNode=nodeByUrl.get(tgtUrl);
   if(!tgtNode)continue;
   const bucket=classifyAnchor(link.anchor,tgtNode.targetKeyword,parsed.brandTerms);
   const stats=anchorStatsByTarget.get(tgtUrl);
   stats[bucket]+=1;
   stats.total+=1;
  }
 }

 const anchorDistribution={};
 for(const [url,stats] of anchorStatsByTarget.entries()){
  const ratios={};
  for(const k of ['branded','exact','partial','url','generic']){
   ratios[k]=stats.total>0?Number((stats[k]/stats.total).toFixed(3)):0;
  }
  anchorDistribution[url]={total:stats.total,counts:{branded:stats.branded,exact:stats.exact,partial:stats.partial,url:stats.url,generic:stats.generic},ratios};
  if(stats.total>=3&&ratios.exact>0.35){
   findings.push({
    code:'ANCHOR_EXACT_OVER_OPTIMIZED',
    severity:'warning',
    url,
    exactRatio:ratios.exact,
    message:`Exact-match anchors to "${url}" reach ${Math.round(ratios.exact*100)}% (${stats.exact}/${stats.total}).`,
    recommendation:'Dilute anchors with partial descriptive phrases and branded wording (<35% exact match).'
   });
  }
  if(stats.total>=2&&ratios.generic>0.25){
   findings.push({
    code:'ANCHOR_GENERIC_HIGH',
    severity:'warning',
    url,
    genericRatio:ratios.generic,
    message:`Generic anchors to "${url}" reach ${Math.round(ratios.generic*100)}%.`,
    recommendation:'Replace generic click-here style anchors with descriptive topic phrasing.'
   });
  }
 }

 const linkOpportunities=[];
 for(const donor of allNodes){
  if(!donor.draftText)continue;
  const existingTargets=new Set(donor.existingLinks.map(l=>normalizeUrl(l.href,siteOrigin)));
  const paragraphs=splitParagraphs(donor.draftText);
  for(const target of allNodes){
   if(target.url===donor.url||existingTargets.has(target.url))continue;
   const searchPhrases=[target.targetKeyword,...target.keywords].map(k=>k.trim()).filter(Boolean);
   let matched=false;
   for(let pIdx=0;pIdx<paragraphs.length&&!matched;pIdx+=1){
    const rawPara=paragraphs[pIdx];
    const cleanPara=stripLinkedSegments(rawPara);
    for(const phrase of searchPhrases){
     const rx=new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}])`,'iu');
     const hit=rx.exec(cleanPara);
     if(hit){
      const start=Math.max(0,hit.index-40);
      const end=Math.min(cleanPara.length,hit.index+hit[0].length+40);
      const brandPrefix=parsed.brandTerms[0]?`${parsed.brandTerms[0]}: `:'';
      linkOpportunities.push({
       fromUrl:donor.url,
       toUrl:target.url,
       targetTitle:target.title,
       paragraphIndex:pIdx,
       matchedPhrase:hit[0],
       donorExcerpt:cleanPara.slice(start,end).trim(),
       suggestedAnchors:{
        exact:target.targetKeyword,
        partial:`${hit[0]} — ${target.title.split('|')[0].trim().slice(0,48)}`,
        branded:`${brandPrefix}${target.targetKeyword}`
       }
      });
      matched=true;
      break;
     }
    }
   }
  }
 }

 return {
  ok:findings.every(f=>f.severity!=='error'),
  summary:{
   pillarUrl,
   totalNodes:allNodes.length,
   clustersCount:allNodes.filter(n=>n.kind==='cluster').length,
   supportingCount:allNodes.filter(n=>n.kind==='supporting').length,
   moneyCount:allNodes.filter(n=>n.kind==='money').length,
   existingEdges:graphAudit.summary.internalEdges,
   linkOpportunitiesCount:linkOpportunities.length,
   findingCount:findings.length
  },
  hierarchy:allNodes.map(n=>({
   url:n.url,
   title:n.title,
   kind:n.kind,
   parentUrl:n.parentUrl,
   targetKeyword:n.targetKeyword
  })),
  anchorDistribution,
  linkOpportunities,
  findings
 };
}
