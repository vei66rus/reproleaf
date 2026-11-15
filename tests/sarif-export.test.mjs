import test from 'node:test';
import assert from 'node:assert/strict';
import {toSarifReport} from '../src/sarif-export.mjs';

test('toSarifReport produces valid SARIF 2.1.0 output with rules and artifact locations',()=>{
 const sarif=toSarifReport({
  pages:[
   {
    file:'blog/post.html',
    findings:[
     {code:'HTML_MISSING_H1',severity:'error',message:'Document is missing an H1 heading.'},
     {code:'SOCIAL_MISSING_OG_IMAGE',severity:'warning',message:'Missing og:image tag.'}
    ]
   }
  ]
 },{toolVersion:'1.0.0'});
 assert.equal(sarif.version,'2.1.0');
 assert.equal(sarif.runs.length,1);
 assert.equal(sarif.runs[0].tool.driver.rules.length,2);
 assert.equal(sarif.runs[0].results.length,2);
 assert.equal(sarif.runs[0].results[0].level,'error');
 assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri,'blog/post.html');
});
