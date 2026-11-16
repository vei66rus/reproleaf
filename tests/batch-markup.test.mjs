import test from 'node:test';
import assert from 'node:assert/strict';
import {runMarkupBatch,formatBatchMarkupCsv,localBatchLabel,BATCH_MARKUP_LIMITS} from '../src/browser/tools/batch-markup.js';
import {markupExample} from '../src/browser/tools/markup-inspector.js';

const good=markupExample('jsonld-schema'),social=markupExample('social-meta');
const file=(name,text=good)=>({name,size:Buffer.byteLength(text),text:async()=>text});
test('Batch checks every bounded file and exports only ordinal IDs, not filenames or raw source',async()=>{
 const report=await runMarkupBatch([file('confidential-alice@example.com.html'),file('C:\\Users\\Owner\\private\\client.htm',good+'\n')]);
 assert.equal(report.complete,true);assert.equal(report.summary.uniqueCheckedFiles,2);assert.deepEqual(report.files.map(f=>f.id),['file-01','file-02']);
 const json=JSON.stringify(report);assert(!json.includes('confidential-alice'));assert(!json.includes('Users'));assert(!json.includes('client.htm'));assert(!json.includes('<script type='));assert.equal(report.scope.fileNamesIncluded,false);assert.equal(report.scope.networkUsed,false);
});
test('Identical decoded content reuses the first successful check while retaining every file row',async()=>{
 const report=await runMarkupBatch([file('first.html'),file('renamed.html'),file('third.html',good+'\n')]);
 assert.deepEqual(report.files.map(f=>f.status),['checked','duplicate','checked']);assert.equal(report.files[1].duplicateOf,'file-01');assert.equal(report.files[1].report,undefined);assert.deepEqual(report.files[1].summary,report.files[0].summary);assert.equal(report.summary.duplicateFiles,1);assert.equal(report.summary.processedFiles,3);
});
test('Duplicate content with actual findings still counts every affected input file',async()=>{
 const bad='<script type="application/ld+json">{invalid</script>';
 const report=await runMarkupBatch([file('a.html',bad),file('b.html',bad)]);
 assert.equal(report.summary.filesWithErrors,2);assert.equal(report.ok,false);assert.equal(report.files[1].status,'duplicate');
});
test('Core and read failures remain per-file outcomes, allowing later files to be checked',async()=>{
 const report=await runMarkupBatch([file('empty.html',''),{name:'private.html',size:100,text:async()=>{throw new Error('C:\\Users\\Secret\\customer');}},file('complex.html','<div>'.repeat(140)+'x'+'</div>'.repeat(140)),file('valid.html')]);
 assert.deepEqual(report.files.map(f=>f.status),['failed','failed','failed','checked']);assert.equal(report.summary.failedFiles,3);assert.equal(report.complete,false);assert.equal(report.ok,false);assert(!JSON.stringify(report).includes('customer'));assert.equal(report.files[1].reason,'BATCH_READ');
});
test('Unsupported extensions and oversized files are not read and do not prevent a later valid file',async()=>{
 let reads=0;
 const report=await runMarkupBatch([{name:'source.txt',size:100,text:async()=>{reads++;return good;}},{name:'large.html',size:BATCH_MARKUP_LIMITS.fileBytes+1,text:async()=>{reads++;return good;}},file('valid.html')]);
 assert.equal(reads,0);assert.deepEqual(report.files.map(f=>f.status),['failed','failed','checked']);assert.equal(report.files[0].reason,'BATCH_TYPE');assert.equal(report.files[1].reason,'BATCH_FILE_LIMIT');
});
test('Invalid UTF-8 is an explicit per-file failure rather than replacement-character analysis',async()=>{
 const report=await runMarkupBatch([{name:'invalid.html',size:2,arrayBuffer:async()=>Uint8Array.of(195,40).buffer},file('valid.html')]);
 assert.equal(report.files[0].reason,'BATCH_ENCODING');assert.equal(report.files[1].status,'checked');
});
test('Preflight limits reject invalid count, total size and metadata before reading any file',async()=>{
 await assert.rejects(runMarkupBatch([]),/BATCH_COUNT/);await assert.rejects(runMarkupBatch(Array.from({length:21},(_,i)=>file(`${i}.html`))),/BATCH_COUNT/);
 let reads=0;const large={name:'a.html',size:1048576,text:async()=>{reads++;return good;}};
 await assert.rejects(runMarkupBatch([...Array(5).fill(large),{...large,size:1}]),/BATCH_TOTAL/);assert.equal(reads,0);
 for(const size of [undefined,-1,NaN,Infinity,1.5])await assert.rejects(runMarkupBatch([{name:'a.html',size,text:async()=>good}]),/BATCH_METADATA/);
});
test('Forged declared sizes cannot bypass decoded file-size or aggregate input limits',async()=>{
 const report=await runMarkupBatch([{name:'forged.html',size:0,text:async()=>good}]);assert.equal(report.files[0].status,'failed');assert.equal(report.files[0].reason,'BATCH_METADATA');assert.equal(report.ok,false);
});
test('Cancellation before start leaves every selected file explicitly unprocessed',async()=>{
 const controller=new AbortController();controller.abort();let reads=0;
 const report=await runMarkupBatch([{name:'a.html',size:100,text:async()=>{reads++;return good;}}],{signal:controller.signal});
 assert.equal(reads,0);assert.equal(report.status,'cancelled');assert.equal(report.complete,false);assert.equal(report.ok,false);assert.equal(report.summary.notProcessedFiles,1);assert.equal(report.files[0].reason,'cancelled');
});
test('Cancellation between files preserves completed observations and unknown remaining files',async()=>{
 const controller=new AbortController(),progress=[];
 const report=await runMarkupBatch([file('a.html'),file('b.html',good+'\n'),file('c.html',good+'\n\n')],{signal:controller.signal,onProgress:update=>{progress.push(update.completed);if(update.completed===1)controller.abort();},yieldControl:async()=>{}});
 assert.equal(report.status,'cancelled');assert.deepEqual(report.files.map(f=>f.status),['checked','not-processed','not-processed']);assert.equal(report.summary.processedFiles,1);assert.equal(report.summary.notProcessedFiles,2);assert(progress.every(n=>n<=1));assert.equal(report.files[1].summary,null);
});
test('Abort during an outstanding file read returns without waiting; late data cannot mutate the result',async()=>{
 const controller=new AbortController();let resolveRead,started;
 const reading=new Promise(resolve=>{started=resolve;});
 const pending=runMarkupBatch([{name:'slow.html',size:Buffer.byteLength(good),text:()=>{started();return new Promise(resolve=>{resolveRead=resolve;});}},file('next.html')],{signal:controller.signal});
 await reading;controller.abort();const report=await pending;
 assert.equal(report.status,'cancelled');assert.equal(report.summary.processedFiles,0);const before=JSON.stringify(report);resolveRead(good);await Promise.resolve();await Promise.resolve();assert.equal(JSON.stringify(report),before);
});
test('Progress is emitted from actual file outcomes and yields between files without a fake delay',async()=>{
 const progress=[];let yields=0;
 const report=await runMarkupBatch([file('a.html'),file('b.html')],{onProgress:event=>progress.push(event.completed),yieldControl:async()=>{yields++;}});
 assert.deepEqual(progress,[0,1,2,2]);assert.equal(yields,2);assert.equal(report.summary.uniqueCheckedFiles,1);assert.equal(report.summary.duplicateFiles,1);
});
test('CSV includes every file status plus all checked findings, and neutralizes formulas',async()=>{
 const controller=new AbortController();
 const report=await runMarkupBatch([file('a.html','<script type="application/ld+json">{bad</script>'),file('b.html')],{signal:controller.signal,onProgress:update=>{if(update.completed===1)controller.abort();}});
 const csv=formatBatchMarkupCsv(report);assert(csv.startsWith('\uFEFF'));assert(csv.includes('"file-01","checked"'));assert(csv.includes('"file-02","not-processed"'));assert(csv.includes('SCHEMA_INVALID_JSON'));
 assert(formatBatchMarkupCsv({files:[{id:'=1+1',status:'failed',reason:'error',summary:null}]}).includes('"\'=1+1"'));
});
test('Social batch reuses local profile results and makes no invented per-file URL',async()=>{
 const report=await runMarkupBatch([file('card.html',social)],{mode:'social-meta'});assert.equal(report.files[0].report.url,null);assert.equal(report.files[0].report.preview.title,'A reproducible cache check');assert.equal(report.files[0].summary.errors,0);assert.match(report.scope.pageUrls,/No per-file URL is invented/);
});
test('Local filename labels are safe basenames only and never become report metadata',()=>{
 assert.equal(localBatchLabel('C:\\Users\\Private\\customer.html'),'customer.html');assert.equal(localBatchLabel('/home/private/draft.htm'),'draft.htm');assert.equal(localBatchLabel('bad\u0000name.html'),'badname.html');
});
test('Syntax errors cannot copy private raw JSON snippets into a batch export',async()=>{
 const report=await runMarkupBatch([file('secret.html','<script type="application/ld+json">{"private":"CONFIDENTIAL_CUSTOMER_TEXT",broken}</script>')]);
 assert.equal(report.files[0].summary.errors,1);assert(!JSON.stringify(report).includes('CONFIDENTIAL_CUSTOMER_TEXT'));assert(report.files[0].report.findings.some(f=>f.code==='SCHEMA_INVALID_JSON'&&f.message.includes('not valid JSON')));
});
