import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createAiBudgetTracker,resolveAiConfig,runAiReview} from '../src/ai-review.mjs';
import {sanitizeReportForSharing,prepareContributionPacket} from '../src/public-share.mjs';

const prices={inputPricePerMillion:.15,outputPricePerMillion:.60};
async function workspace(t){const dir=await mkdtemp(path.join(os.tmpdir(),'reproleaf-hardening-'));t.after(()=>rm(dir,{recursive:true,force:true}));return path.join(dir,'ledger.json');}
const payload={language:'en',includeDraft:false,report:{kind:'editorial-review',findings:[]}};

test('a key alone cannot enable paid AI; explicit model, prices and budget are required',()=>{
 const base={envPath:'nonexistent.env',apiKey:'synthetic-key-longer-than-twenty',enabled:false};
 assert.equal(resolveAiConfig(base).enabled,false);
 assert.equal(resolveAiConfig({...base,enabled:true,model:'gpt-4o-mini',dailyBudgetUsd:1,inputPricePerMillion:0,outputPricePerMillion:0}).enabled,false);
 assert.equal(resolveAiConfig({...base,enabled:true,model:'gpt-4o-mini',dailyBudgetUsd:1,...prices}).enabled,true);
});

test('reservations survive new tracker instances and do not refund uncertain failures',async t=>{
 const ledgerPath=await workspace(t),config={ledgerPath,dailyBudgetUsd:.01,...prices};
 const first=createAiBudgetTracker(config).reserveUsage('client','project',.004);assert.equal(first.allowed,true);
 first.commit(500,300);assert.equal(first.commit(500,300).spentUsd,.004);
 const restarted=createAiBudgetTracker(config);assert.equal(restarted.statusSnapshot().spentUsd,.004);
 assert.equal(restarted.reserveUsage('other','other',.004).allowed,true);
 assert.equal(createAiBudgetTracker(config).reserveUsage('third','third',.003).code,'RL_AI_BUDGET_EXCEEDED');
 assert.equal(restarted.reserveUsage('last','last',.002).allowed,true);
 const callsBefore=createAiBudgetTracker(config).statusSnapshot().callsToday;
 let dispatched=0;
 await assert.rejects(runAiReview(payload,{envPath:'nonexistent.env',enabled:true,apiKey:'synthetic-key-longer-than-twenty',model:'gpt-4o-mini',dailyBudgetUsd:.01,...prices,ledgerPath,fetchImpl:async()=>{dispatched++;throw Error('network outcome unknown');}}),e=>e.code==='RL_AI_BUDGET_EXCEEDED');
 assert.equal(dispatched,0);assert.equal(restarted.statusSnapshot().callsToday,callsBefore);
});

test('separate processes reserve the same ledger atomically without overspending',async t=>{
 const ledgerPath=await workspace(t),moduleUrl=new URL('../src/ai-budget.mjs',import.meta.url).href;
 const script=`import {createAiBudgetTracker} from ${JSON.stringify(moduleUrl)};console.log(JSON.stringify(createAiBudgetTracker({ledgerPath:process.argv[1],dailyBudgetUsd:.01,inputPricePerMillion:.15,outputPricePerMillion:.60}).reserveUsage(process.argv[2],process.argv[2],.004).allowed));`;
 const results=await Promise.all(Array.from({length:6},(_,i)=>promisify(execFile)(process.execPath,['--input-type=module','-e',script,ledgerPath,String(i)])));
 const allowed=results.filter(r=>JSON.parse(r.stdout)).length;assert.ok(allowed>=1&&allowed<=2);
 const budget=createAiBudgetTracker({ledgerPath,dailyBudgetUsd:.01,...prices}).statusSnapshot();assert.equal(budget.spentUsd,allowed*.004);assert.ok(budget.spentUsd<=budget.dailyBudgetUsd);
});

test('corrupt or locked storage fails closed and does not reset the budget',async t=>{
 const ledgerPath=await workspace(t);await writeFile(ledgerPath,'not json');
 const tracker=createAiBudgetTracker({ledgerPath,dailyBudgetUsd:.01,...prices});
 assert.equal(tracker.reserveUsage('a','b',.001).code,'RL_AI_BUDGET_UNAVAILABLE');assert.equal(await readFile(ledgerPath,'utf8'),'not json');
 await rm(ledgerPath);await mkdir(ledgerPath+'.lock');assert.equal(tracker.reserveUsage('a','b',.001).allowed,false);
});

test('processes cannot silently apply different prices or allocations to one ledger',async t=>{
 const ledgerPath=await workspace(t),config={ledgerPath,dailyBudgetUsd:.01,...prices};
 assert.equal(createAiBudgetTracker(config).reserveUsage('a','b',.004).allowed,true);
 assert.equal(createAiBudgetTracker({...config,dailyBudgetUsd:1}).reserveUsage('c','d',.004).code,'RL_AI_BUDGET_UNAVAILABLE');
 assert.equal(createAiBudgetTracker({...config,inputPricePerMillion:.01}).reserveUsage('e','f',.004).allowed,false);
 assert.equal(createAiBudgetTracker(config).statusSnapshot().spentUsd,.004);
});

test('provider usage above reservation pauses future requests; midnight does not refund the previous day',async t=>{
 const ledgerPath=await workspace(t);let now=Date.parse('2026-11-09T23:59:00Z');
 const config={ledgerPath,dailyBudgetUsd:.01,...prices,now:()=>now},tracker=createAiBudgetTracker(config);
 const request=tracker.reserveUsage('a','b',.001);assert.equal(request.allowed,true);now+=120000;
 request.commit(1,1);assert.equal(tracker.statusSnapshot().spentUsd,0);
 const persisted=JSON.parse(await readFile(ledgerPath,'utf8'));assert.equal(persisted.days['2026-11-09'].reservedUnits,1000);
 const high=tracker.reserveUsage('c','d',.001);assert.throws(()=>high.commit(100000,100000),/paused/);
 assert.equal(createAiBudgetTracker(config).reserveUsage('e','f',.001).allowed,false);
});

test('unknown upstream failure retains the reservation across process restart',async t=>{
 const ledgerPath=await workspace(t);let calls=0;
 const options={enabled:true,envPath:'nonexistent.env',apiKey:'synthetic-key-longer-than-twenty',model:'gpt-4o-mini',dailyBudgetUsd:.003,...prices,ledgerPath,fetchImpl:async()=>{calls++;throw Error('synthetic timeout');}};
 await assert.rejects(runAiReview(payload,options),e=>e.code==='RL_AI_UPSTREAM_ERROR');
 assert.ok(createAiBudgetTracker(options).statusSnapshot().spentUsd>0);
 await assert.rejects(runAiReview(payload,options),e=>e.code==='RL_AI_BUDGET_EXCEEDED');assert.equal(calls,1);
});

test('public reports redact token families in all exported text and exclude arbitrary diagnostics',()=>{
 const secrets=['AKIAIOSFODNN7EXAMPLE','ghp_'+'a'.repeat(36),'github_pat_'+'b'.repeat(40),'eyJsynthetic.payload.signature','-----BEGIN PRIVATE KEY-----\nSYNTHETIC-ONLY\n-----END PRIVATE KEY-----','1234567890:'+'c'.repeat(35),'password="synthetic-password"'];
 for(const secret of secrets){
  const out=sanitizeReportForSharing({report:{kind:'editorial-review',summary:{distinctInternalEdges:secret},diagnostics:{summary:{good:1,private:secret},metrics:{words:5,private:secret}},findings:[{code:secret,severity:'error',message:secret,observation:secret,record:'https://site.test/'+secret,snippet:secret}],strengths:[{code:secret,message:secret}]},includeSnippets:true,stripOrigin:true});
  const serialized=JSON.stringify(out);assert.ok(!serialized.includes(secret),secret.slice(0,12));assert.deepEqual(out.diagnostics.metrics,{words:5});
 }
 const out=sanitizeReportForSharing({report:{findings:[{message:'x'.repeat(490)+' ghp_'+'z'.repeat(36)}]}});assert.doesNotMatch(JSON.stringify(out),/ghp_/);
});

test('contribution metadata is scanned as well as the synthetic source',()=>{
 const base={id:'synthetic-safe-case',title:'Synthetic safe contribution',stack:'HTML',category:'layout',symptom:'A synthetic heading overflows its parent.',applicability:'A bounded synthetic HTML fixture.',versions:'HTML and Chromium',preconditions:['Mobile viewport'],steps:['Open synthetic fixture'],expected:'Heading fits inside its container.',acceptance:'No horizontal overflow is observed.',fixSummary:'Constrain the grid track width.',limitations:['Only a synthetic fixture is tested.'],syntheticSource:'<main><h1>Synthetic heading</h1></main>',publicationConsent:true,noPrivateDataConfirmed:true};
 for(const field of ['stack','versions','authorAttribution'])assert.throws(()=>prepareContributionPacket({...base,[field]:'AKIAIOSFODNN7EXAMPLE'}),e=>e.code==='RL_PRIVATE_DATA_DETECTED');
 assert.equal(prepareContributionPacket(base).status,'pending-independent-verification');
});
