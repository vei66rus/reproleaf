import {z} from 'zod';
import {buildRecommendationEvidence} from './recommendation-evidence.mjs';
import {passageInventorySchema} from './passage-inventory.mjs';
const http=z.string().url().max(2048).refine(v=>/^https?:$/.test(new URL(v).protocol),'HTTP(S) URL required');
export const blogSchema=z.object({schemaVersion:z.literal(1),siteUrl:http,coverage:z.string().max(3000),recommendationMode:z.literal('legacy').optional(),evidenceScope:z.enum(['stored-links','urls-only']).default('stored-links'),pages:z.array(z.object({url:http,title:z.string().max(1000),kind:z.enum(['article','hub','other']).default('article'),locale:z.string().max(20).optional(),textScope:z.enum(['full','excerpt','unknown']).default('unknown'),cluster:z.string().max(200).optional(),h1:z.string().max(1000).optional(),primaryQuery:z.string().max(300).optional(),text:z.string().max(50000).default(''),passageInventory:passageInventorySchema.optional(),links:z.array(z.object({href:z.string().max(2048),anchor:z.string().max(1000).default(''),region:z.enum(['content','navigation','unknown']).optional()}).strict()).max(1000)}).strict()).min(1).max(1000)}).strict();
export function countPhrase(text,phrase){
 if(!phrase?.trim())return null;
 const normalized=text.normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase(),query=phrase.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return [...normalized.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${query}(?![\\p{L}\\p{N}])`,'gu'))].length;
}
function bestExcerpt(text,sharedTerms,phrase){
 if(!text?.trim())return null;
 const segments=text.replace(/\s+/g,' ').split(/(?<=[.!?…])\s+|\n+/).map(s=>s.trim()).filter(Boolean);
 if(!segments.length)return null;
 const loweredPhrase=phrase?.trim()?phrase.normalize('NFKC').trim().toLocaleLowerCase():'';
 let best=segments[0],bestHits=-1;
 for(const segment of segments){
  const lower=segment.normalize('NFKC').toLocaleLowerCase();
  let hits=0;
  if(loweredPhrase&&lower.includes(loweredPhrase))hits+=4;
  for(const term of sharedTerms)if(lower.includes(term))hits+=1;
  if(hits>bestHits){bestHits=hits;best=segment;}
 }
 return bestHits>0?best.slice(0,240):segments[0].slice(0,240);
}
function cleanAnchorCandidate(target,sharedTerms,matchedPhrase){
 if(matchedPhrase)return matchedPhrase.slice(0,80);
 if(target.primaryQuery?.trim())return target.primaryQuery.trim().slice(0,80);
 const raw=(target.h1||target.title||'').split(/\s+(?:—|–|\||:)\s+/)[0].trim();
 if(raw.length>=3&&raw.length<=80)return raw;
 return sharedTerms.slice(0,4).join(' ').slice(0,80)||raw.slice(0,80);
}
export function auditBlog(input,onPhase=()=>{}){
 onPhase('validate');
 const data=blogSchema.parse(input),base=new URL(data.siteUrl),byUrl=new Map(),findings=[];
 function canonical(value,relative=base.href){const u=new URL(value,relative);u.hash='';u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.href;}
 const pages=data.pages.map((page,index)=>{
  const url=canonical(page.url);if(new URL(url).origin!==base.origin)throw Error('Every page must belong to the inventory site origin.');if(byUrl.has(url))throw Error('Duplicate canonicalized page URL in inventory.');byUrl.set(url,index);return {...page,resolutionBase:page.url,url,incoming:new Set(),outgoing:new Set(),edgeAnchors:new Map(),external:new Set(),unresolved:new Set(),issueCodes:[]};
 });
 if(data.evidenceScope==='urls-only')return {schemaVersion:1,kind:'blog-graph',scope:{siteOrigin:base.origin,coverage:data.coverage,evidenceScope:'urls-only'},summary:{pages:pages.length,articles:0,distinctInternalEdges:null,noObservedIncoming:null},strengths:[{code:'sitemap-scope',message:'The sitemap URLs were parsed locally.'}],findings:[],pages:pages.map(p=>({url:p.url,title:p.title,kind:p.kind,textScope:'unknown',incomingPages:null,outgoingInternalTargets:null,issueCodes:[]})),edges:[],unresolvedTargets:[],clusters:[],recommendations:[],requiresEditorialReview:true,limits:['A sitemap lists URLs; it does not show internal hyperlinks, article content, indexation or HTTP status. Import stored content to audit links.']};
 onPhase('links');
 let internalOccurrences=0,resolvedInternalOccurrences=0,externalOccurrences=0;const externalSites=new Set(),unresolvedMap=new Map();
 const add=(page,code,message,priority=3,extra={})=>{
  page.issueCodes.push(code);
  findings.push({
   code,
   severity:'warning',
   priority,
   message,
   record:page.url,
   observation:extra.observation||message,
   why:extra.why||'',
   ...(extra.snippet?{snippet:String(extra.snippet).slice(0,240)}:{}),
   suggestion:extra.suggestion||'',
   verifyHint:extra.verifyHint||''
  });
 };
 for(const page of pages)for(const link of page.links){
  let target;try{target=new URL(link.href,page.resolutionBase);}catch{
   add(page,'invalid-link-url','A stored link URL cannot be parsed.',2,{
    observation:`Malformed href "${link.href}" on page ${page.url}.`,
    why:'Browsers and crawlers cannot resolve an invalid URL syntax.',
    snippet:link.anchor?`[${link.anchor}](${link.href})`:link.href,
    suggestion:'Fix the href syntax to a valid relative path or https:// URL.',
    verifyHint:'Re-export the inventory and confirm invalid-link-url disappears.'
   });
   continue;
  }
  if(!['http:','https:'].includes(target.protocol))continue;
  if(target.origin!==base.origin){externalOccurrences++;page.external.add(target.href);externalSites.add(target.hostname);continue;}
  const key=canonical(target.href);if(key===page.url)continue;
  internalOccurrences++;
  const index=byUrl.get(key);
  if(index===undefined){
   page.unresolved.add(key);
   if(!unresolvedMap.has(key))unresolvedMap.set(key,new Set());
   unresolvedMap.get(key).add(page.url);
   continue;
  }
  resolvedInternalOccurrences++;page.outgoing.add(key);pages[index].incoming.add(page.url);
  if(!page.edgeAnchors.has(key))page.edgeAnchors.set(key,new Set());
  if(link.anchor?.trim())page.edgeAnchors.get(key).add(link.anchor.trim().slice(0,120));
 }
 const clusters=new Map();for(const p of pages)if(p.cluster){if(!clusters.has(p.cluster))clusters.set(p.cluster,[]);clusters.get(p.cluster).push(p);}
 for(const p of pages){
  if(p.kind==='article'&&!p.incoming.size)add(p,'no-observed-incoming','No other supplied page links to this article. Check omitted hubs, navigation and external sources before calling it an orphan.',2,{
   observation:`Page "${p.title}" (${p.url}) has 0 incoming links from the ${pages.length} supplied pages.`,
   why:'Articles without contextual links from related articles or hubs are harder for readers and crawlers to discover.',
   snippet:`${p.title} (${p.cluster||'no cluster'})`,
   suggestion:'Add a contextual link to this article from a relevant hub or related donor page in the same cluster.',
   verifyHint:'Add the link, re-export the inventory with the same page scope and confirm incomingPages > 0.'
  });
  if(p.kind==='article'&&!p.outgoing.size)add(p,'no-observed-outgoing','No internal target from this article was resolved within the supplied inventory. Review useful onward reading.',3,{
   observation:`Page "${p.title}" (${p.url}) has 0 resolved outgoing links to other supplied pages.`,
   why:'Dead-end articles miss opportunities to guide readers to deeper guides, cases or service hubs.',
   snippet:p.title,
   suggestion:'Link to 1–2 relevant next-step pages or the parent topic hub where it helps the reader.',
   verifyHint:'Re-run on the updated inventory and confirm outgoingInternalTargets > 0.'
  });
  if(p.unresolved.size)add(p,'unresolved-internal-targets','Some internal targets are absent from this inventory. This does not establish a broken URL.',3,{
   observation:`${p.unresolved.size} internal target(s) linked from ${p.url} are not present in pages[].`,
   why:'Targets missing from the export may be non-exported sections, redirects, drafts or mistyped slugs.',
   snippet:[...p.unresolved].slice(0,4).join(', '),
   suggestion:'Verify whether these URLs exist on the live site or include their section in the inventory export.',
   verifyHint:'Include all relevant site sections in the export or fix mistyped slugs.'
  });
  if(p.cluster&&clusters.get(p.cluster).length>1&&![...p.incoming,...p.outgoing].some(url=>pages[byUrl.get(url)]?.cluster===p.cluster))add(p,'no-observed-topic-link','No link to or from a supplied page in the same declared topic cluster was found. Review whether a topic link is useful.',3,{
   observation:`Page "${p.title}" belongs to cluster "${p.cluster}" (${clusters.get(p.cluster).length} pages) but has 0 links within that cluster.`,
   why:'Pages in the same topic cluster usually benefit from connecting to their topic hub or sibling articles.',
   snippet:`cluster: ${p.cluster} (${p.url})`,
   suggestion:`Connect ${p.url} with another page or hub in cluster "${p.cluster}" if topics genuinely overlap.`,
   verifyHint:'Re-run with the same cluster declarations and confirm no-observed-topic-link resolves.'
  });
 }
 const clusterSummaries=[];
 for(const [clusterName,members]of clusters.entries()){
  const memberUrls=new Set(members.map(m=>m.url)),hubs=members.filter(m=>m.kind==='hub'),articles=members.filter(m=>m.kind==='article');
  let internalEdges=0;const isolatedUrls=[],missingHubLinks=[];
  for(const m of members){
   const sameClusterOut=[...m.outgoing].filter(u=>memberUrls.has(u)),sameClusterIn=[...m.incoming].filter(u=>memberUrls.has(u));
   internalEdges+=sameClusterOut.length;
   if(members.length>1&&sameClusterOut.length===0&&sameClusterIn.length===0)isolatedUrls.push(m.url);
   if(hubs.length&&m.kind==='article'&&!hubs.some(h=>m.outgoing.has(h.url)||m.incoming.has(h.url)))missingHubLinks.push(m.url);
  }
  const weakReasons=[];
  if(members.length>1&&!hubs.length)weakReasons.push('No hub page (kind="hub") is declared in this cluster.');
  if(isolatedUrls.length)weakReasons.push(`${isolatedUrls.length} page(s) have no links within the cluster.`);
  if(missingHubLinks.length)weakReasons.push(`${missingHubLinks.length} article(s) are not connected to a cluster hub.`);
  clusterSummaries.push({
   name:clusterName,
   pageCount:members.length,
   articleCount:articles.length,
   hubUrls:hubs.map(h=>h.url),
   internalEdges,
   isolatedUrls,
   missingHubLinks,
   weakConnections:weakReasons
  });
 }
 const stop=new Set('the and for with from this that how your you our are was can into not but about guide tutorial overview introduction complete ultimate article что как для или при это этой свои ваш его она они без над под все по про руководство инструкция обзор статья полный лучшая лучший'.split(' '));
 const terms=text=>[...new Set((text.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]).filter(t=>!stop.has(t)))].slice(0,100);
 const inverted=new Map();for(const p of pages)for(const term of terms((p.h1?.trim()||p.title)+' '+(p.primaryQuery||''))){if(!inverted.has(term))inverted.set(term,[]);inverted.get(term).push(p);}
 onPhase('candidates');
 const rawCandidates=[];
 for(const source of pages){
  const sourceSample=source.text.slice(0,12000), scores=new Map();
  for(const term of terms(source.title+' '+sourceSample)){
   const matches=inverted.get(term)||[];
   if(pages.length>10&&matches.length>pages.length*.5)continue;
   for(const target of matches){
    if(target===source||source.outgoing.has(target.url)||(source.locale&&target.locale&&source.locale!==target.locale))continue;
    const current=scores.get(target.url)||{target,score:0,sharedTerms:[]};
    current.score+=Math.log(1+pages.length/(1+matches.length));
    current.sharedTerms.push(term);
    scores.set(target.url,current);
   }
  }
  if(source.cluster&&clusters.has(source.cluster)){
   for(const target of clusters.get(source.cluster)){
    if(target===source||source.outgoing.has(target.url)||(source.locale&&target.locale&&source.locale!==target.locale))continue;
    if((source.kind==='article'&&target.kind==='hub')||(source.kind==='hub'&&target.kind==='article')){
     const current=scores.get(target.url)||{target,score:0,sharedTerms:[]};
     current.score+=1.5;
     scores.set(target.url,current);
    }
   }
  }
  for(const c of scores.values()){
   const targetPhrase=c.target.primaryQuery?.trim()||'';
   const phraseHit=targetPhrase&&countPhrase(sourceSample,targetPhrase)>0?targetPhrase:null;
   if(phraseHit)c.score+=2.5;
   c.matchedPhrase=phraseHit;
   if(!c.target.incoming.size)c.score+=0.5;
  }
  const qualified=[...scores.values()].filter(c=>c.sharedTerms.length>=2||c.matchedPhrase||(source.cluster&&source.cluster===c.target.cluster&&(c.sharedTerms.length>=1||source.kind==='hub'||c.target.kind==='hub'))||c.sharedTerms.some(t=>t.length>=7&&(inverted.get(t)?.length||0)<=2)).sort((a,b)=>b.score-a.score||a.target.url.localeCompare(b.target.url)).slice(0,3);
  for(const c of qualified){
   const shared=c.sharedTerms.slice(0,8);
   const sameCluster=!!source.cluster&&source.cluster===c.target.cluster;
   const hubConnection=sameCluster?(source.kind==='article'&&c.target.kind==='hub'?'spoke-to-hub':source.kind==='hub'&&c.target.kind==='article'?'hub-to-spoke':null):null;
   rawCandidates.push({
    source:source.url,
    sourceTitle:source.title,
    target:c.target.url,
    targetTitle:c.target.title,
    targetKind:c.target.kind,
    score:Number(c.score.toFixed(3)),
    sharedTerms:shared,
    matchedPhrase:c.matchedPhrase,
    excerpt:bestExcerpt(source.text,shared,c.matchedPhrase),
    suggestedAnchor:cleanAnchorCandidate(c.target,shared,c.matchedPhrase),
    sameDeclaredCluster:sameCluster,
    hubConnection,
    basis:'lexical-and-cluster',
    reason:'Lexical topic overlap; review context and choose a natural anchor. This is not a semantic or ranking verdict.'
   });
  }
 }
 rawCandidates.sort((a,b)=>b.score-a.score||a.source.localeCompare(b.source)||a.target.localeCompare(b.target));
 const seenPairs=new Set(),targetCounts=new Map(),acceptedCandidates=[];
 for(const item of rawCandidates){
  const pairKey=`${item.source} -> ${item.target}`;
  if(seenPairs.has(pairKey))continue;
  const countForTarget=targetCounts.get(item.target)||0;
  if(countForTarget>=10&&item.targetKind!=='hub')continue;
  seenPairs.add(pairKey);
  targetCounts.set(item.target,countForTarget+1);
  acceptedCandidates.push(item);
 }
 const recommendations=acceptedCandidates.map(({score:_score,...cleanItem})=>({...cleanItem,reciprocalSuggested:seenPairs.has(`${cleanItem.target} -> ${cleanItem.source}`),anchorEvidence:buildRecommendationEvidence(cleanItem)}));
 onPhase('report');
 const articlePages=pages.filter(p=>p.kind==='article'),orphanCandidates=articlePages.filter(p=>!p.incoming.size).length;
 const unresolvedTargets=[...unresolvedMap.entries()].map(([url,sources])=>({url,referencedFrom:[...sources]})).sort((a,b)=>a.url.localeCompare(b.url));
 return {
  schemaVersion:1,
  kind:'blog-graph',
  scope:{siteOrigin:base.origin,coverage:data.coverage,evidenceScope:'stored-links',method:'Stored links from supplied pages; fragments and trailing slashes normalized, query strings preserved. No network requests.'},
  summary:{pages:pages.length,articles:articlePages.length,internalLinkOccurrences:internalOccurrences,resolvedInternalLinkOccurrences:resolvedInternalOccurrences,distinctInternalEdges:pages.reduce((n,p)=>n+p.outgoing.size,0),externalLinkOccurrences:externalOccurrences,externalDomains:externalSites.size,noObservedIncoming:orphanCandidates,unresolvedTargets:unresolvedTargets.length,clusters:clusterSummaries.length},
  structuralPass:true,
  strengths:[{code:'graph-scope',message:`${pages.length} supplied pages were analyzed locally.`},...(articlePages.length&&orphanCandidates===0?[{code:'observed-incoming',message:'Every supplied article has an incoming link from another supplied page.'}]:[])],
  findings:findings.sort((a,b)=>a.priority-b.priority),
  pages:pages.map(p=>({url:p.url,title:p.title,kind:p.kind,locale:p.locale,textScope:p.textScope,cluster:p.cluster,incomingPages:p.incoming.size,outgoingInternalTargets:p.outgoing.size,externalTargets:p.external.size,unresolvedTargets:[...p.unresolved],issueCodes:p.issueCodes,queryOccurrences:p.primaryQuery?{title:countPhrase(p.title,p.primaryQuery),h1:countPhrase(p.h1||'',p.primaryQuery),suppliedText:countPhrase(p.text,p.primaryQuery),method:'Literal Unicode-aware phrase counts, not stemming, intent understanding or a density target.'}:null,titleMatchesH1:p.h1?p.title.trim().toLocaleLowerCase()===p.h1.trim().toLocaleLowerCase():null})),
  edges:pages.flatMap(p=>[...p.outgoing].map(target=>({source:p.url,target,anchors:[...(p.edgeAnchors.get(target)||[])]}))),
  unresolvedTargets,
  clusters:clusterSummaries,
  recommendations:recommendations.slice(0,200),
  recommendationsTruncated:recommendations.length>200,
  requiresEditorialReview:true,
  limits:['No observed incoming link is only a candidate within this inventory, not proof of a site-wide orphan.','Internal incoming links are not external backlinks. External links in these pages do not reveal backlinks to your site.','Missing inventory targets are unresolved, not HTTP-verified broken links.','Clusters are supplied labels. Suggestions use lexical overlap, not an AI understanding of relevance.','No fixed link quota, title/H1 inequality requirement, keyword-density target, ranking score or automatic edits.']
 };
}
