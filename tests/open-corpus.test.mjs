import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runBatchAudit} from '../src/batch-audit.mjs';
import {toSarifReport} from '../src/sarif-export.mjs';
import {version} from '../src/version.mjs';

test('open corpus batch audit and SARIF 2.1.0 export run deterministically',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'reproleaf-corpus-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const bodyWords=Array.from({length:50},(_,i)=>`term${i}`).join(' ');
 await writeFile(path.join(dir,'clean.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Clean</title><link rel="canonical" href="https://evolkov.tech/clean"><meta property="og:title" content="Clean"><meta property="og:description" content="Desc"><meta property="og:image" content="https://evolkov.tech/og.png"><meta property="og:url" content="https://evolkov.tech/clean"><meta name="twitter:card" content="summary_large_image"></head><body><h1>Clean</h1><p>${bodyWords}</p></body></html>`);
 await writeFile(path.join(dir,'broken.html'),'<!doctype html><html><head><title>Broken</title></head><body><p>No H1</p></body></html>');

 const report=await runBatchAudit({dir});
 assert.equal(report.summary.pagesAudited,2);
 const sarif=toSarifReport(report);
 assert.equal(sarif.version,'2.1.0');
 assert.equal(sarif.runs[0].tool.driver.version,version);
 assert.ok(sarif.runs[0].results.length>=1);
});
