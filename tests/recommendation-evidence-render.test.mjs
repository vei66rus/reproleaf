import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRecommendationEvidence} from '../src/recommendation-evidence.mjs';
import {recommendationEvidenceText} from '../src/recommendation-evidence-copy.mjs';
import {reportHtml} from '../src/report-html.mjs';
test('renderer separates location, edits and unknown metadata without a relevance verdict',()=>{
 const literal={source:'https://example.org/a',target:'https://example.org/b',excerpt:'Use HTTP caching.',suggestedAnchor:'HTTP caching'};literal.anchorEvidence=buildRecommendationEvidence(literal);const proposed={...literal,suggestedAnchor:'cache policy'};proposed.anchorEvidence=buildRecommendationEvidence(proposed);const forged={...literal,anchorEvidence:{...literal.anchorEvidence,literalSpan:{start:0,end:4,text:'NESTED_PRIVATE_CANARY'}}};
 for(const language of ['ru','en']){const html=reportHtml({kind:'blog-graph',findings:[],recommendations:[literal,proposed,forged]},language);assert(html.includes(recommendationEvidenceText(literal,language)));assert(html.includes(recommendationEvidenceText(proposed,language)));assert(html.includes(recommendationEvidenceText(forged,language)));assert(!html.includes('NESTED_PRIVATE_CANARY'));}
 assert.match(recommendationEvidenceText(literal,'en'),/Review its boundaries/);assert.match(recommendationEvidenceText(proposed,'en'),/rest of the page was not checked/);assert.match(recommendationEvidenceText({...literal,excerpt:'Redacted '+literal.excerpt},'en'),/unconfirmed/);
});
