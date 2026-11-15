function escapeMdCell(value){
 return String(value??'').replace(/\|/g,'\\|').replace(/\r?\n/g,' ').trim();
}

function formatDelta(current,previous){
 if(typeof previous!=='number'||!Number.isFinite(previous))return String(current);
 const diff=current-previous;
 if(diff===0)return `${current} (+0)`;
 return `${current} (${diff>0?`+${diff}`:diff})`;
}

export function formatPrAuditMarkdown(report,{baseline=null,maxFindings=15,preset='saas'}={}){
 const summary=report?.summary||{};
 const baseSummary=baseline?.summary||null;
 const errorsText=formatDelta(summary.totalErrors??0,baseSummary?.totalErrors);
 const warningsText=formatDelta(summary.totalWarnings??0,baseSummary?.totalWarnings);
 const pagesText=formatDelta(summary.pagesAudited??0,baseSummary?.pagesAudited);
 const statusLabel=report?.ok?'PASS':'FAIL';

 const lines=[
  '### Reproleaf SEO & GEO Audit Report',
  '',
  `Status: **${statusLabel}** | Preset: \`${escapeMdCell(preset)}\``,
  '',
  '| Metric | Value |',
  '| --- | --- |',
  `| Pages audited | ${pagesText} |`,
  `| Passing pages | ${summary.passingPages??0} |`,
  `| Total errors | ${errorsText} |`,
  `| Total warnings | ${warningsText} |`
 ];

 const findings=[];
 for(const page of report?.pages||[]){
  for(const item of page.findings||[]){
   findings.push({file:page.file,...item});
  }
 }
 findings.sort((a,b)=>(a.severity===b.severity?0:a.severity==='error'?-1:1));

 if(findings.length>0){
  lines.push('','#### Top Findings','','| Severity | File | Code | Message |','| --- | --- | --- | --- |');
  for(const item of findings.slice(0,maxFindings)){
   lines.push(`| ${escapeMdCell(item.severity)} | \`${escapeMdCell(item.file)}\` | \`${escapeMdCell(item.code)}\` | ${escapeMdCell(item.message)} |`);
  }
  if(findings.length>maxFindings){
   lines.push('',`Showing top ${maxFindings} of ${findings.length} total findings.`);
  }
 }

 lines.push('','Audited locally via [Reproleaf](https://evolkov.tech/en/tools/geo-readiness-checker/).');
 return lines.join('\n');
}

export function shouldPostPrComment({commentPr=false,token='',eventName='',isFork=false}={}){
 if(!commentPr)return {allowed:false,reason:'comment_disabled'};
 if(!token||typeof token!=='string'||!token.trim())return {allowed:false,reason:'missing_token'};
 if(eventName!=='pull_request')return {allowed:false,reason:'unsupported_event'};
 if(isFork)return {allowed:false,reason:'fork_pr_blocked'};
 return {allowed:true};
}

export async function postOrUpdatePrComment({token,repository,prNumber,body,apiBase='https://api.github.com',fetchImpl=fetch}){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repository||''))){
  throw Error(`Invalid GitHub repository slug: ${repository}`);
 }
 const issueNum=Number(prNumber);
 if(!Number.isInteger(issueNum)||issueNum<=0){
  throw Error(`Invalid PR number: ${prNumber}`);
 }
 const baseUrl=new URL(apiBase);
 if(baseUrl.protocol!=='https:'){
  throw Error('GitHub API base URL must use HTTPS.');
 }
 const headers={
  Authorization:`Bearer ${token}`,
  Accept:'application/vnd.github+json',
  'Content-Type':'application/json',
  'User-Agent':'reproleaf-github-action/2.0'
 };
 const listUrl=`${baseUrl.origin}/repos/${repository}/issues/${issueNum}/comments?per_page=100`;
 const listRes=await fetchImpl(listUrl,{method:'GET',headers});
 if(!listRes.ok){
  throw Error(`GitHub comments fetch failed with HTTP ${listRes.status}`);
 }
 const comments=await listRes.json();
 const existing=Array.isArray(comments)?comments.find(c=>typeof c.body==='string'&&c.body.startsWith('### Reproleaf SEO & GEO Audit Report')):null;
 const targetUrl=existing
  ?`${baseUrl.origin}/repos/${repository}/issues/comments/${existing.id}`
  :`${baseUrl.origin}/repos/${repository}/issues/${issueNum}/comments`;
 const method=existing?'PATCH':'POST';
 const saveRes=await fetchImpl(targetUrl,{method,headers,body:JSON.stringify({body})});
 if(!saveRes.ok){
  throw Error(`GitHub comment ${method} failed with HTTP ${saveRes.status}`);
 }
 const saved=await saveRes.json();
 return {action:existing?'updated':'created',id:saved?.id??null};
}
