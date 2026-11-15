import test from 'node:test';
import assert from 'node:assert/strict';
import {createBaselineSnapshot,diffBaselineSnapshots} from '../src/snapshot-diff.mjs';

test('diffBaselineSnapshots detects regressions, resolved findings and added/removed pages',()=>{
 const baseline=createBaselineSnapshot({
  pages:[
   {file:'index.html',ok:true,errors:0,warnings:0,findings:[]},
   {file:'old.html',ok:false,errors:1,warnings:0,findings:[{code:'HTML_MISSING_H1',message:'Missing H1'}]}
  ]
 });
 const current=createBaselineSnapshot({
  pages:[
   {file:'index.html',ok:false,errors:1,warnings:0,findings:[{code:'SCHEMA_INVALID_JSON',message:'Bad JSON-LD'}]},
   {file:'new.html',ok:true,errors:0,warnings:0,findings:[]}
  ]
 });
 const diff=diffBaselineSnapshots({baseline,current});
 assert.equal(diff.ok,false);
 assert.equal(diff.summary.regressions,1);
 assert.equal(diff.regressions[0].file,'index.html');
 assert.equal(diff.summary.addedPages,1);
 assert.equal(diff.summary.removedPages,1);
});

test('diffBaselineSnapshots passes when no new regressions exist',()=>{
 const baseline=createBaselineSnapshot({
  pages:[{file:'index.html',ok:false,errors:1,warnings:0,findings:[{code:'HTML_MISSING_H1',message:'Missing H1'}]}]
 });
 const current=createBaselineSnapshot({
  pages:[{file:'index.html',ok:true,errors:0,warnings:0,findings:[]}]
 });
 const diff=diffBaselineSnapshots({baseline,current});
 assert.equal(diff.ok,true);
 assert.equal(diff.summary.resolved,1);
 assert.equal(diff.summary.regressions,0);
});
