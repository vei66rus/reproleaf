import {appendFile,readFile,writeFile} from 'node:fs/promises';
import {runBatchAudit,formatBatchCsv} from '../../src/batch-audit.mjs';
import {toSarifReport} from '../../src/sarif-export.mjs';
import {formatPrAuditMarkdown,postOrUpdatePrComment,shouldPostPrComment} from './pr-comment.mjs';

const dir=process.env.INPUT_DIR||'dist';
const format=(process.env.INPUT_FORMAT||'sarif').toLowerCase();
const output=process.env.INPUT_OUTPUT||'reproleaf-results.sarif';
const preset=(process.env.INPUT_PRESET||'saas').toLowerCase();
const maxFiles=Number(process.env['INPUT_MAX-FILES'])||500;
const baselinePath=(process.env.INPUT_BASELINE||'').trim();
const commentPr=String(process.env['INPUT_COMMENT-PR']||'false').toLowerCase()==='true';
const githubToken=process.env['INPUT_GITHUB-TOKEN']||process.env.GITHUB_TOKEN||'';

let baseline=null;
if(baselinePath){
 baseline=JSON.parse(await readFile(baselinePath,'utf8'));
}

const report=await runBatchAudit({dir,maxFiles,preset});
let payload;
if(format==='csv')payload=formatBatchCsv(report);
else if(format==='sarif')payload=JSON.stringify(toSarifReport(report),null,2);
else payload=JSON.stringify(report,null,2);

await writeFile(output,payload,'utf8');

const summaryMd=formatPrAuditMarkdown(report,{baseline,preset});
if(process.env.GITHUB_STEP_SUMMARY){
 await appendFile(process.env.GITHUB_STEP_SUMMARY,`${summaryMd}\n`,'utf8');
}
if(process.env.GITHUB_OUTPUT){
 const outs=[
  `ok=${report.ok}`,
  `errors=${report.summary.totalErrors}`,
  `warnings=${report.summary.totalWarnings}`,
  `pages-audited=${report.summary.pagesAudited}`,
  `report-path=${output}`
 ].join('\n')+'\n';
 await appendFile(process.env.GITHUB_OUTPUT,outs,'utf8');
}

if(commentPr&&process.env.GITHUB_EVENT_PATH){
 const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
 const guard=shouldPostPrComment({
  commentPr,
  token:githubToken,
  eventName:process.env.GITHUB_EVENT_NAME||'',
  isFork:Boolean(ev?.pull_request?.head?.repo?.fork)
 });
 if(guard.allowed&&ev?.pull_request?.number&&process.env.GITHUB_REPOSITORY){
  await postOrUpdatePrComment({
   token:githubToken,
   repository:process.env.GITHUB_REPOSITORY,
   prNumber:ev.pull_request.number,
   body:summaryMd
  });
 }
}

if(!report.ok)process.exitCode=1;
