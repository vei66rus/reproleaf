import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {auditStaticBuild,reproleafVitePlugin} from '../integrations/static-site/index.mjs';

test('auditStaticBuild audits output directory and enforces failOnError',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'reproleaf-static-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 await writeFile(path.join(dir,'bad.html'),'<!doctype html><html><head><title>Bad</title></head><body><p>Missing H1</p></body></html>');

 await assert.rejects(()=>auditStaticBuild({outDir:dir,failOnError:true}),/static audit found/i);
 const plugin=reproleafVitePlugin({outDir:dir,failOnError:false});
 const report=await plugin.closeBundle();
 assert.equal(report.ok,false);
 assert.equal(report.summary.pagesAudited,1);
});
