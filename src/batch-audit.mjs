import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {auditHtmlDocument} from './html-audit.mjs';
import {auditJsonLd} from './schema-audit.mjs';
import {auditSocialMeta} from './social-audit.mjs';
import {auditAiCrawlerAccess} from './ai-crawler-audit.mjs';

const maxFileBytes=1048576;

async function collectHtmlFiles(rootDir,maxFiles){
 const files=[];
 async function walk(current){
  if(files.length>=maxFiles)return;
  const entries=await readdir(current,{withFileTypes:true});
  entries.sort((a,b)=>a.name.localeCompare(b.name));
  for(const entry of entries){
   if(files.length>=maxFiles)return;
   if(entry.name.startsWith('.')||entry.name==='node_modules')continue;
   const fullPath=path.join(current,entry.name);
   if(entry.isDirectory()){
    await walk(fullPath);
   }else if(entry.isFile()&&/\.(?:html|htm)$/i.test(entry.name)){
    files.push(fullPath);
   }
  }
 }
 await walk(rootDir);
 return files;
}

function safeCsvCell(value){
 const raw=String(value??'');
 const neutralized=/^[=+\-@\t\r]/.test(raw)?`'${raw}`:raw;
 return `"${neutralized.replace(/"/g,'""')}"`;
}

export function formatBatchCsv(report){
 const headers=['file','ok','errors','warnings','htmlFindings','schemaBlocks','socialWarnings','aiWords'];
 const lines=[headers.join(',')];
 for(const row of report.pages){
  lines.push([
   row.file,
   row.ok,
   row.errors,
   row.warnings,
   row.htmlFindings,
   row.schemaBlocks,
   row.socialWarnings,
   row.aiWords
  ].map(safeCsvCell).join(','));
 }
 return lines.join('\n');
}

export const batchPresets={
 blog:['html','schema','social','ai-crawler'],
 docs:['html','schema','ai-crawler'],
 landing:['html','social','schema'],
 saas:['html','schema','social','ai-crawler']
};

export async function runBatchAudit({dir,maxFiles=500,preset='saas'}){
 const rootDir=path.resolve(dir);
 const limit=Math.max(1,Math.min(500,Number(maxFiles)||500));
 const activeChecks=new Set(batchPresets[preset]||batchPresets.saas);
 const files=await collectHtmlFiles(rootDir,limit);
 const pages=[];

 for(const filePath of files){
  const bytes=await readFile(filePath);
  if(bytes.length>maxFileBytes)continue;
  const html=bytes.toString('utf8');
  const htmlRes=activeChecks.has('html')?auditHtmlDocument({html}):{findings:[]};
  const schemaRes=activeChecks.has('schema')?auditJsonLd({html}):{findings:[],summary:{blocks:0}};
  const socialRes=activeChecks.has('social')?auditSocialMeta({html}):{findings:[]};
  const aiRes=activeChecks.has('ai-crawler')?auditAiCrawlerAccess({html}):{findings:[],summary:{visibleWordsNoJs:0}};

  const allFindings=[
   ...(htmlRes.findings||[]),
   ...(schemaRes.findings||[]),
   ...(socialRes.findings||[]),
   ...(aiRes.findings||[])
  ];
  const errors=allFindings.filter(f=>f.severity==='error').length;
  const warnings=allFindings.filter(f=>f.severity==='warning').length;

  pages.push({
   file:path.relative(rootDir,filePath).replace(/\\/g,'/'),
   ok:errors===0,
   errors,
   warnings,
   htmlFindings:(htmlRes.findings||[]).length,
   schemaBlocks:schemaRes.summary?.blocks??0,
   socialWarnings:(socialRes.findings||[]).filter(f=>f.severity==='warning').length,
   aiWords:aiRes.summary?.visibleWordsNoJs??0,
   findings:allFindings
  });
 }

 const totalErrors=pages.reduce((sum,p)=>sum+p.errors,0);
 const totalWarnings=pages.reduce((sum,p)=>sum+p.warnings,0);

 return {
  ok:totalErrors===0,
  directory:rootDir,
  summary:{
   pagesAudited:pages.length,
   passingPages:pages.filter(p=>p.ok).length,
   failingPages:pages.filter(p=>!p.ok).length,
   totalErrors,
   totalWarnings
  },
  pages
 };
}
