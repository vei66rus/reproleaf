import {z} from 'zod';
import {parse} from 'parse5';

export const htmlAuditSchema=z.object({
 html:z.string().min(1).max(1048576),
 url:z.string().url().max(1000).optional()
}).strict();

const mojibakePattern=/(?:\u00d0[\u0090-\u00bf\u2018-\u201f]|\u00d1[\u0080-\u008f]|\u00c3[\u0080-\u00bf]|\u00e2\u20ac[\u0098-\u00a2]){2,}/u;
const controlCharPattern=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function attrMap(node){
 const map={};
 for(const attr of node.attrs||[])map[attr.name.toLowerCase()]=attr.value;
 return map;
}

function collectText(node,skipTags=new Set(['script','style','noscript','template'])){
 if(!node)return '';
 if(node.nodeName==='#text')return node.value||'';
 if(skipTags.has(node.tagName))return '';
 return (node.childNodes||[]).map(child=>collectText(child,skipTags)).join(' ');
}

function walkNodes(node,visitor){
 visitor(node);
 for(const child of node.childNodes||[])walkNodes(child,visitor);
}

function normalizeUrlForCompare(raw,baseUrl){
 try{
  const resolved=baseUrl?new URL(raw,baseUrl):new URL(raw);
  resolved.hash='';
  return resolved.toString();
 }catch{
  return String(raw||'').trim();
 }
}

export function auditHtmlDocument(rawInput){
 const {html,url}=htmlAuditSchema.parse(rawInput);
 const doc=parse(html);
 let title='';
 let description='';
 let robots='';
 const canonicals=[];
 const hreflangs=[];
 const headings=[];
 let hasMain=false;
 let nestedArticleInMain=false;

 walkNodes(doc,node=>{
  const tag=node.tagName;
  if(!tag)return;
  const attrs=attrMap(node);
  if(tag==='title'&&!title)title=collectText(node).replace(/\s+/g,' ').trim();
  if(tag==='meta'){
   const name=(attrs.name||'').toLowerCase().trim();
   if(name==='description'&&!description)description=(attrs.content||'').trim();
   if(name==='robots')robots=(attrs.content||'').trim();
  }
  if(tag==='link'){
   const relTokens=String(attrs.rel||'').toLowerCase().split(/\s+/).filter(Boolean);
   if(relTokens.includes('canonical'))canonicals.push((attrs.href||'').trim());
   if(relTokens.includes('alternate')&&Object.hasOwn(attrs,'hreflang')){
    hreflangs.push({hreflang:(attrs.hreflang||'').trim(),href:(attrs.href||'').trim()});
   }
  }
  if(tag==='main'){
   hasMain=true;
   walkNodes(node,inner=>{
    if(inner!==node&&inner.tagName==='article'){
     nestedArticleInMain=true;
    }
   });
  }
  if(/^h[1-6]$/.test(tag)){
   const text=collectText(node).replace(/\s+/g,' ').trim();
   if(text)headings.push({level:Number(tag.slice(1)),text:text.slice(0,200)});
  }
 });

 const visibleText=collectText(doc).replace(/\s+/g,' ').trim();
 const findings=[];
 const strengths=[];

 if(!title){
  findings.push({code:'title-not-provided',severity:'warning',observation:'<title> is missing or empty.',why:'Search snippets and browser tabs lose primary document labeling.',suggestion:'Add a unique descriptive <title> element in <head>.',verifyHint:'Re-run audit_html_document and confirm metadata.title is non-empty.'});
 }
 if(!description){
  findings.push({code:'description-not-provided',severity:'warning',observation:'meta[name="description"] is missing or empty.',why:'Snippet fallback text becomes unpredictable.',suggestion:'Add a concise meta[name="description"] summarizing page scope.',verifyHint:'Re-run audit_html_document and confirm metadata.description is populated.'});
 }

 const nonEmptyCanonicals=canonicals.filter(Boolean);
 if(canonicals.length>1){
  findings.push({code:'multiple-canonicals',severity:'error',observation:`Found ${canonicals.length} canonical link elements.`,why:'Conflicting canonical signals can cause search engines to ignore all canonical hints.',suggestion:'Emit at most one rel="canonical" link element per HTML document.',verifyHint:'Verify canonicals.length === 1 in metadata.'});
 }else if(canonicals.length===1&&!nonEmptyCanonicals.length){
  findings.push({code:'empty-canonical',severity:'error',observation:'rel="canonical" element has an empty href attribute.',why:'An empty canonical resolves ambiguously or to the current URL without intent.',suggestion:'Set an explicit absolute canonical URL or remove the empty tag.',verifyHint:'Confirm canonicals[0] contains a valid URL.'});
 }else if(url&&nonEmptyCanonicals.length===1){
  const normPage=normalizeUrlForCompare(url);
  const normCan=normalizeUrlForCompare(nonEmptyCanonicals[0],url);
  if(normPage!==normCan){
   findings.push({code:'canonical-points-elsewhere',severity:'info',observation:`Canonical (${normCan}) differs from supplied page URL (${normPage}).`,why:'Non-self canonicals ask search engines to consolidate indexing to another URL.',suggestion:'Confirm this is intentional consolidation and not a template leak.',verifyHint:'Check whether the canonical target is the intended indexable URL.'});
  }else{
   strengths.push({code:'self-canonical-valid',message:'Single self-referencing canonical matches the supplied URL.'});
  }
 }

 if(hreflangs.length>0){
  const seenLangs=new Set();
  const duplicates=[];
  let hasEmpty=false;
  let hasSelf=false;
  const normPage=url?normalizeUrlForCompare(url):null;
  for(const item of hreflangs){
   const code=item.hreflang.toLowerCase();
   if(!code||!item.href)hasEmpty=true;
   if(code){
    if(seenLangs.has(code))duplicates.push(code);
    seenLangs.add(code);
   }
   if(normPage&&item.href&&normalizeUrlForCompare(item.href,url)===normPage)hasSelf=true;
  }
  if(hasEmpty)findings.push({code:'invalid-hreflang',severity:'error',observation:'One or more rel="alternate" hreflang tags have an empty hreflang or href.',why:'Incomplete hreflang annotations are ignored by crawlers.',suggestion:'Provide both a valid BCP-47/x-default hreflang and an absolute href.',verifyHint:'Re-run audit_html_document and inspect metadata.hreflangs.'});
  if(duplicates.length)findings.push({code:'duplicate-hreflang',severity:'error',observation:`Duplicate hreflang values: ${[...new Set(duplicates)].join(', ')}.`,why:'Each language/region variant may only map to one target URL per page.',suggestion:'Deduplicate hreflang alternate links so each code appears once.',verifyHint:'Confirm all hreflang values are unique.'});
  if(normPage&&!hasSelf)findings.push({code:'missing-self-hreflang',severity:'warning',observation:'Hreflang cluster is present without a self-referencing alternate link for the supplied URL.',why:'Hreflang clusters require self-referencing and reciprocal entries.',suggestion:'Include the current page URL with its language code in the hreflang set.',verifyHint:'Verify the current URL appears in metadata.hreflangs.'});
 }

 const encodingSamples=[title,description,visibleText.slice(0,50000)].join('\n');
 if(encodingSamples.includes('\uFFFD')){
  findings.push({code:'replacement-character-detected',severity:'error',observation:'Unicode replacement character (U+FFFD) found in extracted text.',why:'Indicates broken charset decoding or truncated multi-byte characters.',suggestion:'Ensure UTF-8 encoding in HTTP Content-Type, <meta charset="utf-8">, and source files.',verifyHint:'Search source HTML for U+FFFD and re-check.'});
 }
 if(controlCharPattern.test(encodingSamples)){
  findings.push({code:'control-characters-detected',severity:'warning',observation:'Unexpected ASCII control characters found in extracted text.',why:'Control bytes can corrupt feeds, structured data, or snippet rendering.',suggestion:'Strip control characters from template and CMS outputs.',verifyHint:'Inspect extracted text for non-printable bytes.'});
 }
 if(mojibakePattern.test(encodingSamples)){
  findings.push({code:'mojibake-candidate',severity:'warning',observation:'Character sequence resembles UTF-8/single-byte encoding corruption (mojibake).',why:'Double-encoded or mis-decoded text breaks readability and indexing.',suggestion:'Verify UTF-8 storage and charset headers across database and templates.',verifyHint:'Inspect rendered text around corrupted sequences.'});
 }

 const h1Count=headings.filter(h=>h.level===1).length;
 if(h1Count!==1){
  findings.push({code:'h1-count',severity:h1Count===0?'error':'warning',observation:`Found ${h1Count} H1 headings (expected 1).`,why:'Missing or multiple H1s blur the primary document topic hierarchy.',suggestion:'Use a single primary H1 heading for the main page subject.',verifyHint:'Confirm headings.filter(h => h.level === 1).length === 1.'});
 }else{
  strengths.push({code:'single-h1',message:'Document contains exactly one H1 heading.'});
 }
 let prevLevel=0;
 for(const h of headings){
  if(prevLevel>0&&h.level>prevLevel+1){
   findings.push({code:'heading-level-gap',severity:'warning',observation:`Heading level jumps from H${prevLevel} to H${h.level} ("${h.text.slice(0,60)}").`,why:'Skipped heading levels degrade document outline navigation and accessibility.',suggestion:`Use H${prevLevel+1} or insert the intermediate section heading.`,verifyHint:'Re-check heading levels in sequence.'});
  }
  prevLevel=h.level;
 }

 if(hasMain&&nestedArticleInMain){
  findings.push({code:'nested-article-in-main',severity:'info',observation:'Found nested <article> elements inside <main>.',why:'Embedded promo/related cards marked as <article> can confuse naive content extractors.',suggestion:'Use <aside> or <section> for secondary cards inside <main>.',verifyHint:'Confirm only primary content uses <article> or main landmark.'});
 }

 if(/\bnoindex\b/i.test(robots)){
  findings.push({code:'robots-noindex',severity:'info',observation:`meta[name="robots"] specifies "${robots}".`,why:'Search engines will exclude this document from indexation.',suggestion:'Confirm noindex is intentional for this route.',verifyHint:'Check robots directive before production release.'});
 }

 return {
  schemaVersion:1,
  kind:'html-audit',
  url:url||null,
  metadata:{
   title,
   description,
   robots:robots||null,
   canonicals:nonEmptyCanonicals,
   hreflangs,
   hasMain
  },
  headings,
  summary:{
   errors:findings.filter(f=>f.severity==='error').length,
   warnings:findings.filter(f=>f.severity==='warning').length,
   info:findings.filter(f=>f.severity==='info').length,
   headingsCount:headings.length
  },
  strengths,
  findings,
  limitations:[
   'Parses supplied HTML statically without executing client-side JavaScript or fetching external URLs.',
   'Hreflang reciprocity against target pages requires checking those target HTML documents separately.'
  ]
 };
}
