import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildRecommendationEvidence} from '../src/recommendation-evidence.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/recommendation-evidence-contract.json',import.meta.url),'utf8'));
test('shared Unicode location contract preserves frozen cases without semantic claims',()=>{
 for(const item of fixture.cases){const result=buildRecommendationEvidence(item.candidate);assert.equal(result.status,item.expected.status,item.id);assert.equal(result.reviewRequired,true);assert.equal(result.scope,'supplied-excerpt');assert.equal(result.matchType,'exact-substring');if(result.status==='literal-span'){assert.equal(result.literalSpan.start,item.expected.start,item.id);assert.equal(result.literalSpan.end,item.expected.end,item.id);assert.equal([...item.candidate[result.excerptField]].slice(result.literalSpan.start,result.literalSpan.end).join(''),result.literalSpan.text);}else assert.equal(result.literalSpan,null);}
});
