import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root,catalog} from './catalog.mjs';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const evidenceFiles=['package.json','package-lock.json','cases/catalog.json','src/checks.mjs','src/verify.mjs','src/build.mjs','src/server.mjs','src/evidence.mjs','src/adapter.mjs','src/inspect-page.mjs','src/check-target.mjs','src/diagnose-project.mjs','src/editorial.mjs','packs/editorial-evidence/workflow.json','fixtures/shared.js','fixtures/fixture.css',...catalog.cases.map(c=>c.source)];
export const evidencePackages=['playwright','vue','react','three','phaser','esbuild','marked','@modelcontextprotocol/server'];
export async function currentEvidenceInputs(){
 const sourceHashes={},packages={};
 for(const file of evidenceFiles)sourceHashes[file]=sha256(await readFile(path.join(root,file)));
 for(const name of evidencePackages)packages[name]=JSON.parse(await readFile(path.join(root,'node_modules',name,'package.json'),'utf8')).version;
 return {sourceHashes,packages};
}
export async function inspectFreshness(report){
 // Never interpret saved report keys as filesystem paths. Only read our own allowlist.
 const current=await currentEvidenceInputs(),mismatches=[];
 for(const [file,hash]of Object.entries(current.sourceHashes))if(report.sourceHashes?.[file]!==hash)mismatches.push({kind:'source',file,reason:report.sourceHashes?.[file]?'changed':'missing recorded hash'});
 for(const key of Object.keys(report.sourceHashes||{}))if(!evidenceFiles.includes(key))mismatches.push({kind:'source',file:key,reason:'unknown recorded source; not read'});
 for(const [name,version]of Object.entries(current.packages))if(report.packages?.[name]!==version)mismatches.push({kind:'package',name,reason:'version mismatch or missing version'});
 if(report.environment?.node!==process.version)mismatches.push({kind:'runtime',reason:'Node version changed'});
 return {stale:mismatches.length>0,mismatches,browserFreshness:'Browser version was recorded at run time; not re-launched or certified by this read-only lookup.'};
}
