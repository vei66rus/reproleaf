import {runBatchAudit} from '../../src/batch-audit.mjs';

const frameworkDefaultDirs={
 next:'out',
 astro:'dist',
 vite:'dist',
 generic:'dist'
};

export async function auditStaticBuild({outDir,framework='generic',preset='saas',failOnError=true}={}){
 const targetDir=outDir||frameworkDefaultDirs[framework]||'dist';
 const report=await runBatchAudit({dir:targetDir,preset});
 if(failOnError&&!report.ok){
  const error=new Error(`Reproleaf static audit found ${report.summary.totalErrors} error(s) in ${targetDir}`);
  error.report=report;
  throw error;
 }
 return report;
}

export function reproleafVitePlugin({outDir='dist',preset='saas',failOnError=false}={}){
 return {
  name:'reproleaf-static-audit',
  async closeBundle(){
   return auditStaticBuild({outDir,framework:'vite',preset,failOnError});
  }
 };
}

export function reproleafAstroIntegration({preset='docs',failOnError=false}={}){
 return {
  name:'reproleaf-astro-audit',
  hooks:{
   'astro:build:done':async({dir})=>{
    const outDir=dir?.pathname?decodeURIComponent(dir.pathname).replace(/^\/([A-Za-z]:)/,'$1'):'dist';
    return auditStaticBuild({outDir,framework:'astro',preset,failOnError});
   }
  }
 };
}
