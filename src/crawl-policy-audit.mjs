import {z} from 'zod';

function isWebPolicyUrl(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&Boolean(url.hostname)&&!url.username&&!url.password;}catch{return false;}}

export const crawlPolicyAuditSchema=z.object({
 siteUrl:z.string().url().max(2048).refine(isWebPolicyUrl,'Expected an HTTP(S) site URL without credentials').optional(),
 robotsTxt:z.string().max(524288).optional(),
 sitemapXml:z.string().max(2097152).optional(),
 pages:z.array(z.object({
  url:z.string().url().max(2048).refine(isWebPolicyUrl,'Expected an HTTP(S) page URL without credentials'),
  canonical:z.string().max(2048).optional(),
  noindex:z.boolean().optional()
 }).strict()).max(1000).optional()
}).strict();

function stripComments(line){
 const idx=line.indexOf('#');
 return (idx===-1?line:line.slice(0,idx)).trim();
}

export function parseRobotsTxt(raw){
 const source=String(raw||'');
 if(source.length>524288||new TextEncoder().encode(source).length>524288)throw new Error('ROBOTS_INPUT_BUDGET');
 const lines=source.split(/\r\n?|\n/);
 if(lines.length>10000)throw new Error('ROBOTS_INPUT_BUDGET');
 const groups=[];
 let currentAgents=[];
 let currentRules=[];
 const sitemaps=[];
 let sawDirective=false;

 for(const rawLine of lines){
  if(rawLine.length>8192)throw new Error('ROBOTS_INPUT_BUDGET');
  const line=stripComments(rawLine);
  if(!line)continue;
  const colon=line.indexOf(':');
  if(colon===-1)continue;
  const field=line.slice(0,colon).trim().toLowerCase();
  const value=line.slice(colon+1).trim();
  if(field==='user-agent'){
   if(sawDirective&&currentAgents.length){
    groups.push({agents:currentAgents,rules:currentRules});
    currentAgents=[];
    currentRules=[];
   }
   if(value)currentAgents.push(value.toLowerCase());
   sawDirective=false;
  }else if(field==='allow'||field==='disallow'){
   sawDirective=true;
   if(currentAgents.length&&value!==''){
    if(value.length>2048||currentRules.length>=5000)throw new Error('ROBOTS_INPUT_BUDGET');
    currentRules.push({type:field,pattern:value});
   }
  }else if(field==='sitemap'){
   if(value)sitemaps.push(value);
  }
 }
 if(currentAgents.length){
  groups.push({agents:currentAgents,rules:currentRules});
 }
 const wildcardRules=groups
  .filter(g=>g.agents.includes('*'))
  .flatMap(g=>g.rules);
 return {groups,wildcardRules,sitemaps};
}

function normalizeRobotsOctets(value){
 const decoded=value.replace(/%([0-9a-f]{2})/gi,(_,hex)=>{const char=String.fromCharCode(parseInt(hex,16));return /^[A-Za-z0-9._~-]$/.test(char)?char:'%'+hex.toUpperCase();});
 let result='';for(const char of decoded){if(char.codePointAt(0)>127){try{result+=encodeURIComponent(char);}catch{throw new Error('ROBOTS_PATTERN_INVALID');}}else result+=char;}
 return result;
}
function matchRobotsPattern(pathAndQuery,pattern,budget){
 if(!pattern)return false;
 const anchoredEnd=pattern.endsWith('$');
 const normalized=normalizeRobotsOctets(anchoredEnd?pattern.slice(0,-1):pattern),target=pathAndQuery;
 budget.remaining-=normalized.length;if(budget.remaining<0)throw new Error('ROBOTS_MATCH_BUDGET');
 const glob=normalized+(anchoredEnd?'':'*');
 let source=0,rule=0,star=-1,checkpoint=0;
 while(source<target.length){
  if(--budget.remaining<0)throw new Error('ROBOTS_MATCH_BUDGET');
  if(rule<glob.length&&glob[rule]!=='*'&&glob[rule]===target[source]){source++;rule++;}
  else if(glob[rule]==='*'){star=rule++;checkpoint=source;}
  else if(star!==-1){rule=star+1;source=++checkpoint;}
  else return false;
 }
 while(glob[rule]==='*')rule++;
 return rule===glob.length;
}

export function isBlockedByRules(pathAndQuery,rules,budget={remaining:2000000}){
 if(typeof pathAndQuery!=='string'||pathAndQuery.length>4096||!Array.isArray(rules)||rules.length>5000)throw new Error('ROBOTS_MATCH_BUDGET');
 const target=normalizeRobotsOctets(pathAndQuery);budget.remaining-=target.length;if(budget.remaining<0)throw new Error('ROBOTS_MATCH_BUDGET');
 if(target.split('?')[0]==='/robots.txt')return null;
 let bestMatch=null;
 for(const rule of rules){
  if(typeof rule?.pattern!=='string'||rule.pattern.length>2048||!['allow','disallow'].includes(rule.type))throw new Error('ROBOTS_PATTERN_INVALID');
  if(matchRobotsPattern(target,rule.pattern,budget)){
   const len=normalizeRobotsOctets(rule.pattern.replace(/\*/g,'').replace(/\$$/,'')).length;
   if(!bestMatch||len>bestMatch.len||(len===bestMatch.len&&rule.type==='allow')){
    bestMatch={type:rule.type,len,pattern:rule.pattern};
   }
  }
 }
 return bestMatch?.type==='disallow'?bestMatch.pattern:null;
}

function decodeXmlEntities(text){
 return text
  .replace(/&amp;/g,'&')
  .replace(/&lt;/g,'<')
  .replace(/&gt;/g,'>')
  .replace(/&quot;/g,'"')
  .replace(/&apos;/g,"'");
}

function parseSitemapXml(raw){
 const xml=String(raw||'');
 const isIndex=/<sitemapindex\b/i.test(xml);
 const isUrlset=/<urlset\b/i.test(xml);
 const locs=[];
 const locRegex=/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;
 let match;
 while((match=locRegex.exec(xml))!==null){
  const value=decodeXmlEntities(match[1].trim());
  if(value)locs.push(value);
 }
 return {
  kind:isIndex?'sitemapindex':isUrlset?'urlset':'unknown',
  locs
 };
}

export function auditCrawlPolicy(rawInput){
 const parsed=crawlPolicyAuditSchema.parse(rawInput);
 if(!parsed.robotsTxt?.trim()&&!parsed.sitemapXml?.trim()){
  throw Error('Provide nonempty robotsTxt or sitemapXml.');
 }
 const findings=[];
 const siteOrigin=parsed.siteUrl?new URL(parsed.siteUrl).origin:null;
 const robots=parsed.robotsTxt?.trim()?parseRobotsTxt(parsed.robotsTxt):null;
 const sitemap=parsed.sitemapXml?.trim()?parseSitemapXml(parsed.sitemapXml):null;
 const matchBudget={remaining:5000000};

 if(robots){
  const hasDisallowAll=robots.wildcardRules.some(r=>r.type==='disallow'&&r.pattern==='/');
  const hasAnyAllow=robots.wildcardRules.some(r=>r.type==='allow');
  if(hasDisallowAll&&!hasAnyAllow){
   findings.push({
    code:'ROBOTS_DISALLOW_ALL',
    severity:'error',
    target:'/',
    message:'robots.txt blocks all crawling for User-agent: * (Disallow: /).',
    recommendation:'Remove Disallow: / unless blocking the entire site is intentional.'
   });
  }
  if(robots.sitemaps.length===0){
   findings.push({
    code:'ROBOTS_MISSING_SITEMAP',
    severity:'warning',
    target:'robots.txt',
    message:'robots.txt does not declare any Sitemap directive.',
    recommendation:'Add a Sitemap: https://your-domain/sitemap.xml line to robots.txt.'
   });
  }
  for(const sm of robots.sitemaps){
   if(!isWebPolicyUrl(sm)){
    findings.push({
     code:'ROBOTS_RELATIVE_SITEMAP',
     severity:'error',
     target:sm,
     message:`Sitemap directive "${sm}" is not an absolute URL.`,
     recommendation:'Use an absolute https:// URL in Sitemap directives.'
    });
   }else if(siteOrigin){
    try{
     if(new URL(sm).origin!==siteOrigin){
      findings.push({
       code:'ROBOTS_HOST_SITEMAP_MISMATCH',
       severity:'warning',
       target:sm,
       message:`Sitemap directive "${sm}" points to a different origin than "${siteOrigin}".`,
       recommendation:'Align the Sitemap directive origin with the canonical site origin.'
      });
     }
    }catch{
     findings.push({
      code:'ROBOTS_RELATIVE_SITEMAP',
      severity:'error',
      target:sm,
      message:`Sitemap directive "${sm}" is not a valid URL.`,
      recommendation:'Provide a valid https:// URL for Sitemap.'
     });
    }
   }
  }
 }

 const seenSitemapUrls=new Set();
 const duplicateSitemapUrls=new Set();
 const validSitemapUrls=[];
 let blockedInSitemap=0;

 if(sitemap){
  if(sitemap.kind==='unknown'){
   findings.push({
    code:'SITEMAP_UNRECOGNIZED_ROOT',
    severity:'error',
    target:'sitemap.xml',
    message:'XML does not contain a <urlset> or <sitemapindex> root element.',
    recommendation:'Ensure the file is a valid XML sitemap with <urlset> or <sitemapindex>.'
   });
  }else if(sitemap.kind==='sitemapindex'){
   findings.push({
    code:'SITEMAP_IS_INDEX',
    severity:'warning',
    target:'sitemap.xml',
    message:`XML is a sitemapindex with ${sitemap.locs.length} child sitemaps; supply a child urlset for URL-level checks.`,
    recommendation:'Pass the child urlset XML to cross-check individual page URLs.'
   });
  }else if(sitemap.locs.length===0){
   findings.push({
    code:'SITEMAP_EMPTY',
    severity:'warning',
    target:'sitemap.xml',
    message:'Sitemap <urlset> contains 0 <loc> entries.',
    recommendation:'Include canonical indexable page URLs in <urlset>.'
   });
  }

  if(sitemap.kind==='urlset'){
   for(const loc of sitemap.locs){
    let locUrl;
    try{
     locUrl=new URL(loc);
     if(!isWebPolicyUrl(loc))throw new Error('Unsupported web URL');
    }catch{
     findings.push({
      code:'SITEMAP_INVALID_URL',
      severity:'error',
      target:loc,
      message:`Invalid URL "${loc}" in sitemap <loc>.`,
      recommendation:'Use valid absolute https:// URLs in sitemap <loc> tags.'
     });
     continue;
    }
    if(seenSitemapUrls.has(loc)){
     duplicateSitemapUrls.add(loc);
    }else{
     seenSitemapUrls.add(loc);
     validSitemapUrls.push(locUrl);
    }
    if(siteOrigin&&locUrl.origin!==siteOrigin){
     findings.push({
      code:'SITEMAP_CROSS_ORIGIN_URL',
      severity:'error',
      target:loc,
      message:`Sitemap URL "${loc}" does not match site origin "${siteOrigin}".`,
      recommendation:'Remove cross-origin URLs from this domain sitemap.'
     });
    }
    if(robots){
     const pathAndQuery=`${locUrl.pathname}${locUrl.search}`;
     const blockedRule=isBlockedByRules(pathAndQuery,robots.wildcardRules,matchBudget);
     if(blockedRule){
      blockedInSitemap+=1;
      findings.push({
       code:'SITEMAP_URL_BLOCKED_BY_ROBOTS',
       severity:'error',
       target:loc,
       message:`Sitemap URL "${loc}" is blocked by robots.txt rule "Disallow: ${blockedRule}".`,
       recommendation:'Either remove the URL from sitemap.xml or allow it in robots.txt.'
      });
     }
    }
   }
   for(const dup of duplicateSitemapUrls){
    findings.push({
     code:'SITEMAP_DUPLICATE_URL',
     severity:'warning',
     target:dup,
     message:`Duplicate <loc> entry "${dup}" in sitemap.xml.`,
     recommendation:'Deduplicate URLs in sitemap.xml.'
    });
   }
  }
 }

 if(parsed.pages&&sitemap&&sitemap.kind==='urlset'){
  for(const page of parsed.pages){
   if(!seenSitemapUrls.has(page.url))continue;
   if(page.noindex){
    findings.push({
     code:'SITEMAP_URL_NOINDEX',
     severity:'error',
     target:page.url,
     message:`Page "${page.url}" is listed in sitemap.xml but marked noindex.`,
     recommendation:'Exclude noindex pages from sitemap.xml.'
    });
   }
   if(page.canonical&&page.canonical!==page.url){
    findings.push({
     code:'SITEMAP_URL_NON_CANONICAL',
     severity:'error',
     target:page.url,
     message:`Sitemap URL "${page.url}" declares a different canonical "${page.canonical}".`,
     recommendation:'List only canonical URLs in sitemap.xml.'
    });
   }
  }
 }

 const errors=findings.filter(f=>f.severity==='error').length;
 const warnings=findings.filter(f=>f.severity==='warning').length;
 return {
  ok:errors===0,
  scope:{robotsObserved:Boolean(robots),sitemapObserved:Boolean(sitemap),userAgent:'*',networkUsed:false,robotsPatternProfile:'Case-sensitive path/query, wildcard/end-anchor and percent-encoded octet comparisons. Supplied wildcard groups only; no live fetch, status, caching or crawler-specific behavior is measured.'},
  siteOrigin,
  summary:{
   errors,
   warnings,
   robotsRules:robots?robots.wildcardRules.length:0,
   sitemapUrls:sitemap?sitemap.locs.length:0,
   uniqueSitemapUrls:seenSitemapUrls.size,
   duplicateSitemapUrls:duplicateSitemapUrls.size,
   blockedInSitemap,
   isSitemapIndex:sitemap?.kind==='sitemapindex'
  },
  robots:robots?{sitemaps:robots.sitemaps,wildcardRules:robots.wildcardRules}:null,
  sitemap:sitemap?{kind:sitemap.kind,totalUrls:sitemap.locs.length,uniqueUrls:seenSitemapUrls.size}:null,
  findings,
  limits:['Evaluates supplied robots.txt, sitemap.xml and optional page metadata locally without fetching remote URLs.','Robots checks use supplied wildcard groups, not arbitrary crawler-specific behavior or live access. Sitemap extraction is a limited loc profile, not complete XML-schema validation.']
 };
}
