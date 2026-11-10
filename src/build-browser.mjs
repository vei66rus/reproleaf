import {build} from 'esbuild';
import {version} from './version.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {root} from './catalog.mjs';
import {mkdir,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function buildBrowser(output=path.join(root,'dist/browser')){
 await mkdir(output,{recursive:true});
 const settings={absWorkingDir:root,outdir:output,bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'external',entryNames:'[name]-[hash]',metafile:true,banner:{js:'/* Bundled dependency notices: THIRD-PARTY-DEPENDENCIES-LICENSE.txt. */'}};
 const emitted=result=>path.basename(Object.keys(result.metafile.outputs).find(p=>p.endsWith('.js')));
 const anchorEvidence=emitted(await build({...settings,entryPoints:['src/recommendation-evidence-copy.mjs'],format:'iife',globalName:'ReproleafAnchorEvidence',banner:{}}));
 const worker=emitted(await build({...settings,entryPoints:['src/browser/editorial-worker.js']}));
 const playground=emitted(await build({...settings,entryPoints:['src/browser/playground.js'],define:{__REPROLEAF_WORKER__:JSON.stringify('./'+worker)}}));
 const diagnose=emitted(await build({...settings,entryPoints:['src/browser/diagnose.js'],banner:{js:'/* Zod: MIT license, see THIRD-PARTY-ZOD-LICENSE.txt. */'}}));
 const projects=emitted(await build({...settings,entryPoints:['src/browser/dev-projects.js'],external:['./'+diagnose],define:{__REPROLEAF_DIAGNOSE__:JSON.stringify('./'+diagnose)}}));
 const install=emitted(await build({...settings,entryPoints:['src/browser/install.js']}));
 const loader=emitted(await build({...settings,entryPoints:['src/browser/loader.js'],external:['./'+playground],define:{__REPROLEAF_APP__:JSON.stringify('./'+playground)}}));
 const css=Buffer.concat([await readFile(path.join(root,'src/browser/playground.css')),await readFile(path.join(root,'src/browser/selects.css')),await readFile(path.join(root,'src/browser/projects.css'))]);const styles='playground-'+createHash('sha256').update(css).digest('hex').slice(0,10)+'.css';await writeFile(path.join(output,styles),css);
 const activeNames=new Set([loader,playground,worker,install,projects,diagnose,anchorEvidence,styles,`${anchorEvidence}.LEGAL.txt`,`${diagnose}.LEGAL.txt`,`${loader}.LEGAL.txt`,`${playground}.LEGAL.txt`,`${worker}.LEGAL.txt`,`${install}.LEGAL.txt`,`${projects}.LEGAL.txt`,'manifest.json','index.html','ru.html','dev.html','dev-ru.html','LICENSE','THIRD-PARTY-ICONS-LICENSE.txt']);
 for(const entry of await readdir(output)){
  if(!activeNames.has(entry)&&/^(loader|playground|editorial-worker|dev-projects|diagnose|install|recommendation-evidence-copy)-/.test(entry)){
   await rm(path.join(output,entry),{force:true});
  }
 }
 const manifest={version,loader,playground,worker,install,projects,diagnose,anchorEvidence,styles,bytes:{}};for(const name of [loader,playground,worker,install,projects,diagnose,anchorEvidence,styles])manifest.bytes[name]=(await readFile(path.join(output,name))).length;
 await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 for(const language of ['en','ru'])for(const kind of ['seo','web']){
  const suffix=(kind==='web'?'-dev':'')+(language==='ru'?'-ru':'');let template;
  try{template=await readFile(path.join(root,'src/browser/template'+suffix+'.html'),'utf8');}catch(error){if(error.code==='ENOENT')continue;throw error;}
  const filename=kind==='web'?(language==='ru'?'dev-ru.html':'dev.html'):(language==='ru'?'ru.html':'index.html'),script=kind==='web'?projects:loader;
  await writeFile(path.join(output,filename),`<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Reproleaf — ${kind==='web'?'Web Dev evidence':'SEO workspace'}</title><link rel="stylesheet" href="./${styles}"><style>body{margin:0;padding:24px;background:#fff;color:#121212;font:16px/1.6 system-ui,sans-serif}main{max-width:1180px;margin:auto}a{color:inherit}.agent-kit-download{padding:14px 22px;background:#121212;color:#fff;border:0;border-radius:12px;cursor:pointer}</style><body><main>${template}</main><script type="module" src="./${script}"></script></body></html>`);
 }
 await writeFile(path.join(output,'THIRD-PARTY-ICONS-LICENSE.txt'),await readFile(path.join(root,'integrations/THIRD-PARTY-ICONS-LICENSE.txt')));
 await writeFile(path.join(output,'THIRD-PARTY-ZOD-LICENSE.txt'),await readFile(path.join(root,'node_modules/zod/LICENSE')));
 const dependencyNotices=[];for(const name of ['zod','marked']){const pkg=JSON.parse(await readFile(path.join(root,'node_modules',name,'package.json'),'utf8'));dependencyNotices.push(`${name} ${pkg.version}\n\n${await readFile(path.join(root,'node_modules',name,'LICENSE'),'utf8')}`);}
 await writeFile(path.join(output,'THIRD-PARTY-DEPENDENCIES-LICENSE.txt'),dependencyNotices.join('\n\n'));
 await writeFile(path.join(output,'LICENSE'),await readFile(path.join(root,'LICENSE')));
 return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await buildBrowser(process.argv[2]));
