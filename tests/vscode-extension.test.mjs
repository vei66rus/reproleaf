import test from 'node:test';
import assert from 'node:assert/strict';
import {lintDocumentText} from '../integrations/vscode/extension.mjs';

test('lintDocumentText runs HTML and Markdown deterministic diagnostics',()=>{
 const htmlFindings=lintDocumentText({
  languageId:'html',
  text:'<!doctype html><html><head><title>Doc</title></head><body><p>No H1</p></body></html>'
 });
 assert.ok(htmlFindings.some(f=>f.code==='h1-count'));

 const mdFindings=lintDocumentText({
  languageId:'markdown',
  text:'Conversion rose by 40% yesterday.'
 });
 assert.ok(mdFindings.some(f=>f.code==='GROUNDING_UNSUPPORTED_METRIC_CLAIM'));
});
