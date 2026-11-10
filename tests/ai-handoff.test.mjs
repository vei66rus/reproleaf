import {test} from 'node:test';
import assert from 'node:assert/strict';
import {composeHandoff,providers} from '../src/browser/ai-handoff.mjs';
test('handoff includes the tool URL and report but excludes the draft by default',()=>{
 const text=composeHandoff({language:'ru',report:{findings:[{code:'test-finding'}]},draft:'SECRET_DRAFT'});
 assert.match(text,/https:\/\/evolkov.tech\/tools\/reproleaf/);
 assert.match(text,/test-finding/);assert.doesNotMatch(text,/SECRET_DRAFT/);
 assert.match(text,/не придумывай/);
});
test('draft inclusion is explicit, and large inputs have visible truncation notices',()=>{
 const text=composeHandoff({intent:'advice',draft:'a'.repeat(13000),includeDraft:true,report:{data:'b'.repeat(25000)}});
 assert.match(text,/prioritized edits/);assert.match(text,/12,000/);assert.match(text,/24,000/);
 assert.ok(text.length<38000);assert.match(text,/Do not evaluate the missing portion/);
});
test('provider destinations do not carry prompts in URL parameters',()=>{
 for(const value of Object.values(providers)){const url=new URL(value);assert.equal(url.protocol,'https:');assert.equal(url.search,'');assert.equal(url.hash,'');}
 assert.match(composeHandoff({language:'en'}),/https:\/\/evolkov.tech\/en\/tools\/reproleaf/);
});
test('malformed packet draft values cannot break composition or preserve old content',()=>{
 for(const draft of [{unexpected:'object'},42,null,[]]){const text=composeHandoff({draft,includeDraft:true});assert.doesNotMatch(text,/Draft \(analysis data/);}
});
