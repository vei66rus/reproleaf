import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import pilot from '../benchmarks/pilot-dataset.json' with {type:'json'};
import {validateBenchmarkDataset,benchmarkCommand,benchmarkViewRows} from '../src/benchmark-dataset.mjs';
import {formatBenchmarkCsv,filterBenchmarkRows} from '../src/browser/tools/benchmark-leaderboard.js';
const clone=value=>JSON.parse(JSON.stringify(value));
const hash=data=>createHash('sha256').update(JSON.stringify({summary:data.summary,results:data.results})).digest('hex');
test('benchmark validates the supplied pilot checksum without claiming authenticity or time coverage',async()=>{
 const report=await validateBenchmarkDataset(pilot);assert.equal(report.viewRows.length,24);assert.equal(report.integrity.status,'match');assert.equal(report.integrity.authenticityVerified,false);assert.equal(report.integrity.freshnessVerified,false);assert.equal(report.integrity.generatedAtCovered,false);
 const roundtrip=await validateBenchmarkDataset(JSON.parse(JSON.stringify(report.data)));assert.equal(roundtrip.integrity.status,'match');
});
test('altered checksums and results reject rather than display a claimed hash',async()=>{
 const bad=clone(pilot);bad.sha256='0'.repeat(64);await assert.rejects(()=>validateBenchmarkDataset(bad),/HASH_MISMATCH/);
 const changed=clone(pilot);changed.results[0].wordCount++;await assert.rejects(()=>validateBenchmarkDataset(changed),/HASH_MISMATCH/);
 const badType=clone(pilot);badType.sha256={};await assert.rejects(()=>validateBenchmarkDataset(badType));
});
test('recomputed integrity does not become measurement verification; timestamp is outside hash',async()=>{
 const data=clone(pilot);data.results[0].wordCount++;data.sha256=hash(data);data.generatedAt='2020-01-01T00:00:00Z';
 const report=await validateBenchmarkDataset(data);assert.equal(report.integrity.status,'match');assert.equal(report.integrity.authenticityVerified,false);
});
test('invalid shapes, summary contradictions and duplicate origins reject',async()=>{
 for(const mutate of [data=>data.results[0]=null,data=>data.results[0].score=100000,data=>data.results[0].jsonLdTypes='Article',data=>data.summary.totalOrigins++,data=>data.results[1].origin=data.results[0].origin,data=>data.results[0].clientSource='private']){const data=clone(pilot);mutate(data);await assert.rejects(()=>validateBenchmarkDataset(data));}
});
test('unknown measurements are null, not missing llms or zero words',()=>{
 const rows=benchmarkViewRows([{origin:'https://unknown.example',status:'unreachable',wordCount:0,llmsTxtValid:false,jsonLdTypes:[],score:0}]);
 assert.equal(rows[0].wordCount,null);assert.equal(rows[0].llmsTxtValid,null);assert.equal(rows[0].jsonLdTypes,null);assert.equal(rows[0].score,null);assert.deepEqual(filterBenchmarkRows(rows,'missing_llms'),[]);
});
test('CSV escapes every field, including formerly numeric formula cells and whitespace',()=>{
 const csv=formatBenchmarkCsv([{origin:' =ORIGIN()',status:'ok',score:'=SCORE()',llmsTxtStatus:'=STATUS()',wordCount:'=WORDS()',ttfbMs:'=TIME()',jsonLdTypes:[' \t=TYPE()']}]);
 for(const token of ['=ORIGIN()','=SCORE()','=STATUS()','=WORDS()','=TIME()','=TYPE()'])assert(csv.includes(token));
 assert(csv.includes('"\' =ORIGIN()"'));assert(csv.includes('"\'=SCORE()"'));assert(csv.startsWith('\uFEFF'));assert(csv.endsWith('\r\n'));
});
test('CLI origin labels cannot inject shell commands, paths, credentials or queries',()=>{
 for(const value of ['https://example.com;whoami','https://example.com/?a=1&b=2','https://user:pass@example.com','https://example.com/path','https://example.com/\n'])assert.throws(()=>benchmarkCommand(value));
 assert.equal(benchmarkCommand('https://example.com/'),"node src/cli.mjs benchmark 'https://example.com' --allow-network");
});
test('unchecksummed input is explicitly unverified and impossible dates reject',async()=>{
 const data=clone(pilot);delete data.sha256;assert.equal((await validateBenchmarkDataset(data)).integrity.status,'not-provided');data.generatedAt='2026-02-31T00:00:00Z';await assert.rejects(()=>validateBenchmarkDataset(data));
});
test('contradictory valid llms or successful home observations reject',async()=>{
 for(const mutate of [data=>{data.results[0].llmsTxtValid=true;data.results[0].llmsTxtStatus=404;},data=>{data.results[0].homeStatus=503;}]){const data=clone(pilot);delete data.sha256;mutate(data);await assert.rejects(()=>validateBenchmarkDataset(data),/CONTRADICTORY/);}
});
