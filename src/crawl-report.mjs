import {csvCell} from './csv-export.mjs';
import {toSarifReport} from './sarif-export.mjs';

function safeHttpHref(raw){
 try{
  const u=new URL(String(raw||''));
  if(u.protocol==='http:'||u.protocol==='https:')return u.href;
 }catch{}
 return null;
}

function escapeHtml(value){
 return String(value??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');
}

function collectAllFindings(crawl){
 const findings=[];
 for(const f of crawl.profile?.findings||[])findings.push({...f,source:'profile'});
 for(const f of crawl.anomalies?.findings||[])findings.push({...f,source:'anomalies'});
 for(const f of crawl.renderDiff?.findings||[])findings.push({...f,source:'renderDiff'});
 return findings;
}

export function exportCrawlCsv(crawl){
 const columns=['url','final_url','depth','status','ttfb_ms','word_count','title','description','h1','canonical','internal_links','external_links','x_robots_tag'];
 const rows=(crawl.pages||[]).map(p=>[
  p.url||'',
  p.finalUrl||p.url||'',
  p.depth??0,
  p.status??0,
  p.ttfbMs??0,
  p.wordCount??0,
  p.title||'',
  p.description||'',
  Array.isArray(p.h1)?p.h1.join(' | '):(p.h1||''),
  p.canonical||'',
  Array.isArray(p.internalLinks)?p.internalLinks.length:0,
  Array.isArray(p.externalLinks)?p.externalLinks.length:0,
  p.xRobotsTag||''
 ]);
 return '\uFEFF'+[columns,...rows].map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
}

export function exportCrawlJsonl(crawl){
 const lines=[JSON.stringify({type:'summary',summary:crawl.summary||{},profile:crawl.profile?.summary||{},anomalies:crawl.anomalies?.summary||{}})];
 for(const page of crawl.pages||[]){
  const {html,...slim}=page;
  lines.push(JSON.stringify({type:'page',...slim}));
 }
 for(const finding of collectAllFindings(crawl)){
  lines.push(JSON.stringify({type:'finding',...finding}));
 }
 return lines.join('\n')+'\n';
}

export function exportCrawlSarif(crawl,{toolVersion='1.0.0'}={}){
 const findingsByUrl=new Map();
 for(const f of collectAllFindings(crawl)){
  const target=f.url||(Array.isArray(f.urls)&&f.urls[0])||crawl.summary?.startUrl||'unknown';
  if(!findingsByUrl.has(target))findingsByUrl.set(target,[]);
  findingsByUrl.get(target).push(f);
 }
 const pages=[...findingsByUrl.entries()].map(([file,findings])=>({file,findings}));
 return toSarifReport({pages},{toolVersion});
}

export function exportCrawlHtml(crawl){
 const summary=crawl.summary||{};
 const profileSummary=crawl.profile?.summary||{};
 const anomaliesSummary=crawl.anomalies?.summary||{};
 const findings=collectAllFindings(crawl);
 const pages=crawl.pages||[];

 const kpis=[
  ['Origin',summary.origin||'-'],
  ['Crawled pages',summary.crawledPages??pages.length],
  ['Robots blocked',summary.blockedByRobotsCount??0],
  ['Avg TTFB (ms)',profileSummary.avgTtfbMs??0],
  ['Broken internal links',profileSummary.brokenInternalLinkCount??0],
  ['Canonical issues',profileSummary.canonicalIssueCount??0],
  ['Soft-404 / Thin',`${anomaliesSummary.soft404Count??0} / ${anomaliesSummary.thinContentCount??0}`],
  ['Duplicate groups',(anomaliesSummary.duplicateTitleGroups??0)+(anomaliesSummary.duplicateDescriptionGroups??0)+(anomaliesSummary.duplicateH1Groups??0)]
 ];

 const findingRows=findings.map(f=>{
  const target=f.url||(Array.isArray(f.urls)?f.urls.join(', '):'');
  return `<tr data-severity="${escapeHtml(f.severity||'info')}"><td><span class="badge badge-${escapeHtml(f.severity||'info')}">${escapeHtml(f.severity||'info')}</span></td><td><code>${escapeHtml(f.code)}</code></td><td>${escapeHtml(target)}</td><td>${escapeHtml(f.message)}</td></tr>`;
 }).join('');

 const pageRows=pages.map(p=>{
  const href=safeHttpHref(p.url);
  const urlCell=href?`<a href="${escapeHtml(href)}">${escapeHtml(p.url)}</a>`:escapeHtml(p.url);
  return `<tr><td>${escapeHtml(p.status)}</td><td>${escapeHtml(p.depth)}</td><td>${escapeHtml(p.ttfbMs)} ms</td><td>${escapeHtml(p.wordCount)}</td><td>${urlCell}</td><td>${escapeHtml(p.title)}</td><td>${escapeHtml((p.h1||[])[0]||'')}</td></tr>`;
 }).join('');

 return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reproleaf Crawl Report — ${escapeHtml(summary.origin||'Site')}</title>
<style>
body{margin:0;padding:24px;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f7f5;color:#171717}
.wrap{max-width:1280px;margin:0 auto}
h1{font-size:22px;margin:0 0 8px}
h2{font-size:17px;margin:28px 0 12px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:16px 0 24px}
.kpi{background:#fff;border:1px solid #e2e2dd;border-radius:8px;padding:12px 14px}
.kpi-label{font-size:12px;color:#666;display:block}
.kpi-value{font-size:20px;font-weight:600;margin-top:4px;word-break:break-word}
.filters{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.filters button{border:1px solid #d4d4ce;background:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:13px}
.filters button[aria-pressed="true"]{background:#171717;color:#fff;border-color:#171717}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e2dd;font-size:13px}
th,td{padding:8px 10px;border-bottom:1px solid #ecece7;text-align:left;vertical-align:top;word-break:break-word}
th{background:#fafaf8;font-weight:600}
.badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase}
.badge-error{background:#fde8e8;color:#9b1c1c}
.badge-warning{background:#fef3c7;color:#92400e}
.badge-info{background:#e0f2fe;color:#075985}
</style>
</head>
<body>
<div class="wrap">
<h1>Reproleaf Crawl Report</h1>
<p>Target: <strong>${escapeHtml(summary.startUrl||summary.origin||'Unknown')}</strong></p>
<div class="kpis">${kpis.map(([label,val])=>`<div class="kpi"><span class="kpi-label">${escapeHtml(label)}</span><div class="kpi-value">${escapeHtml(val)}</div></div>`).join('')}</div>
<h2>Findings (${findings.length})</h2>
<div class="filters">
<button type="button" data-filter="all" aria-pressed="true">All (${findings.length})</button>
<button type="button" data-filter="error" aria-pressed="false">Errors</button>
<button type="button" data-filter="warning" aria-pressed="false">Warnings</button>
<button type="button" data-filter="info" aria-pressed="false">Info</button>
</div>
<table><thead><tr><th>Severity</th><th>Code</th><th>URL</th><th>Message</th></tr></thead><tbody id="findings-body">${findingRows||'<tr><td colspan="4">No findings detected.</td></tr>'}</tbody></table>
<h2>Crawled Pages (${pages.length})</h2>
<table><thead><tr><th>Status</th><th>Depth</th><th>TTFB</th><th>Words</th><th>URL</th><th>Title</th><th>H1</th></tr></thead><tbody>${pageRows}</tbody></table>
</div>
<script>
document.querySelectorAll('[data-filter]').forEach(function(btn){
 btn.addEventListener('click',function(){
  var f=btn.getAttribute('data-filter');
  document.querySelectorAll('[data-filter]').forEach(function(b){b.setAttribute('aria-pressed',b===btn?'true':'false');});
  document.querySelectorAll('#findings-body tr[data-severity]').forEach(function(row){
   row.hidden=f!=='all'&&row.getAttribute('data-severity')!==f;
  });
 });
});
</script>
</body>
</html>
`;
}

export function exportCrawlReport(crawl,{format='html',toolVersion='1.0.0'}={}){
 if(format==='html')return {format:'html',contentType:'text/html; charset=utf-8',body:exportCrawlHtml(crawl)};
 if(format==='csv')return {format:'csv',contentType:'text/csv; charset=utf-8',body:exportCrawlCsv(crawl)};
 if(format==='jsonl')return {format:'jsonl',contentType:'application/x-ndjson; charset=utf-8',body:exportCrawlJsonl(crawl)};
 if(format==='sarif'){
  const sarif=exportCrawlSarif(crawl,{toolVersion});
  return {format:'sarif',contentType:'application/sarif+json; charset=utf-8',body:JSON.stringify(sarif,null,2)+'\n',report:sarif};
 }
 throw Error(`Unsupported report format "${format}". Choose html, csv, jsonl, or sarif.`);
}
