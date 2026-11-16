import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diffCrawlSnapshots} from '../src/crawl-diff.mjs';
import {createBaselineSnapshot,diffBaselineSnapshots} from '../src/snapshot-diff.mjs';

const url='https://example.org/a';
const issue={code:'HTML_MISSING_H1',severity:'error',message:'Missing H1',url};
const crawlBefore=()=>({ok:true,pages:[{url,status:200}],findings:[issue]});
const batchBefore=()=>({ok:true,pages:[{file:'a.html',ok:false,findings:[issue]}]});
function assertUnknown(diff,entries){
 assert.equal(diff.ok,false);
 assert.equal(diff.verificationComplete,false);
 assert.equal(diff.coverage.state,'unknown');
 assert.equal(entries.length,1);
 assert.ok(entries[0].verificationReasons.includes('engine-unknown'));
 assert.ok(entries[0].verificationReasons.includes('rule-coverage-unknown'));
}

const crawlCases=[
 ['removed page',{ok:true,pages:[],findings:[]},'page-absent'],
 ['timeout status zero',{ok:true,pages:[{url,status:0,error:'timeout'}],findings:[]},'read-failed'],
 ['explicit read failure',{pages:[{url,status:200,readError:'unreadable'}],findings:[]},'read-failed'],
 ['same URL and ok flag',{ok:true,pages:[{url,status:200}],findings:[]},'engine-unknown'],
 ['changed engine',{engine:'next',pages:[{url,status:200}],findings:[]},'engine-unknown'],
 ['omitted rules',{rules:[],pages:[{url,status:200}],findings:[]},'engine-unknown'],
 ['asserted coverage without producer contract',{verificationComplete:true,coverage:{state:'complete'},pages:[{url,status:200}],findings:[]},'engine-unknown']
];
for(const [name,current,reason] of crawlCases)test(`crawl disappearance stays unconfirmed: ${name}`,()=>{
 const before=crawlBefore();before.engine='previous';
 const diff=diffCrawlSnapshots(before,current);
 assertUnknown(diff,diff.unconfirmedFindings);assert.deepEqual(diff.resolvedFindings,[]);
 assert.equal(diff.unconfirmedFindings[0].reason,reason);
 assert.equal(diff.unconfirmedFindings[0].code,issue.code);
 assert.equal(diff.summary.unconfirmedFindingCount,1);
 assert.deepEqual(diff.disappearedFindings,diff.unconfirmedFindings);
});

const batchCases=[
 ['removed file',{ok:true,pages:[]},'page-absent'],
 ['file read error',{pages:[{file:'a.html',ok:false,error:'read failed',findings:[]}]},'read-failed'],
 ['file read finding',{pages:[{file:'a.html',ok:false,findings:[{code:'BATCH_FILE_READ_FAILED',message:'Unreadable'}]}]},'read-failed'],
 ['same file and ok flag',{ok:true,pages:[{file:'a.html',ok:true,findings:[]}]},'engine-unknown'],
 ['changed preset',{preset:'docs',pages:[{file:'a.html',ok:true,findings:[]}]},'engine-unknown'],
 ['omitted rules',{rules:[],pages:[{file:'a.html',ok:true,findings:[]}]},'engine-unknown'],
 ['asserted coverage without producer contract',{verificationComplete:true,coverage:{state:'complete'},pages:[{file:'a.html',ok:true,findings:[]}]},'engine-unknown']
];
for(const [name,current,reason] of batchCases)for(const normalized of [false,true])test(`batch disappearance stays unconfirmed: ${name}, normalized=${normalized}`,()=>{
 const baseline=batchBefore();
 const diff=diffBaselineSnapshots({baseline:normalized?createBaselineSnapshot(baseline):baseline,current:normalized?createBaselineSnapshot(current):current});
 assertUnknown(diff,diff.unconfirmed);assert.deepEqual(diff.resolved,[]);
 assert.equal(diff.unconfirmed[0].reason,reason);
 assert.equal(diff.unconfirmed[0].key,`${issue.code}::${issue.message}`);
 assert.equal(diff.summary.unconfirmed,1);
 assert.deepEqual(diff.disappeared,diff.unconfirmed);
});

test('new and persistent crawl findings remain observable while resolved remains empty',()=>{
 const next={...issue,code:'NEW_ERROR'};
 const diff=diffCrawlSnapshots(crawlBefore(),{pages:[{url,status:200}],findings:[issue,next]});
 assert.equal(diff.newFindings.length,1);assert.equal(diff.persistingFindings.length,1);
 assert.equal(diff.noObservedRegressions,false);assert.equal(diff.outcome,'regressed');
 assert.deepEqual(diff.resolvedFindings,[]);assert.deepEqual(diff.unconfirmedFindings,[]);
});

test('new and unchanged batch findings remain observable without claiming verification',()=>{
 const diff=diffBaselineSnapshots({baseline:batchBefore(),current:{pages:[{file:'a.html',findings:[issue,{code:'NEW_ERROR',message:'New observation'}]}]}});
 assert.equal(diff.regressions.length,1);assert.equal(diff.unchanged.length,1);
 assert.equal(diff.noObservedRegressions,false);assert.equal(diff.outcome,'regressed');
 assert.deepEqual(diff.resolved,[]);assert.equal(diff.verificationComplete,false);
});

test('empty legacy inventories are unconfirmed rather than a verified all-clear',()=>{
 for(const diff of [diffCrawlSnapshots({pages:[]},{pages:[]}),diffBaselineSnapshots({baseline:{pages:[]},current:{pages:[]}})]){
  assert.equal(diff.ok,false);assert.equal(diff.verificationComplete,false);
  assert.equal(diff.noObservedRegressions,true);assert.equal(diff.outcome,'unconfirmed');
 }
});
