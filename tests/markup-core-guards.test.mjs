import test from 'node:test';
import assert from 'node:assert/strict';
import {auditJsonLd} from '../src/schema-audit.mjs';
import {auditSocialMeta} from '../src/social-audit.mjs';
import {isIsoCalendarDate,isSchemaOrgContext,isWebUrl} from '../src/markup-input-guards.mjs';

const html=json=>`<script type="application/ld+json">${JSON.stringify(json)}</script>`;
test('Schema.org context match uses origin/path rather than substring',()=>{
 for(const good of ['https://schema.org','http://schema.org/','HTTPS://SCHEMA.ORG/'])assert(isSchemaOrgContext(good),good);
 for(const bad of ['https://evil.example/schema.org','https://schema.org.evil.example','https://schema.org:8443/','https://schema.org/custom','https://schema.org/?custom=yes','https://user:pass@schema.org/'])assert.equal(isSchemaOrgContext(bad),false,bad);
 assert(isSchemaOrgContext({'@vocab':'https://schema.org/'}));
 assert(auditJsonLd({html:html({'@context':'https://evil.example/schema.org','@type':'Person',name:'Example'})}).findings.some(f=>f.code==='SCHEMA_CONTEXT_UNUSUAL'));
});
test('Calendar dates reject rollover, impossible times and impossible offsets',()=>{
 for(const good of ['2024-02-29','2026-11-16T23:59:59Z','2026-11-16T10:30+05:00'])assert(isIsoCalendarDate(good),good);
 for(const bad of ['2026-02-31','2026-13-01','2026-01-00','2026-01-01T24:30:00Z','2026-01-01T10:60Z','2026-01-01T10:30+25:00'])assert.equal(isIsoCalendarDate(bad),false,bad);
 assert(auditJsonLd({html:html({'@context':'https://schema.org','@type':'Article',headline:'Example',author:'Example',datePublished:'2026-02-31'})}).findings.some(f=>f.code==='SCHEMA_INVALID_DATE'));
});
test('Article missing fields are local-profile review warnings, not universal required Schema.org errors',()=>{
 const report=auditJsonLd({html:html({'@context':'https://schema.org','@type':'Article'})});
 const missing=report.findings.filter(f=>f.code==='SCHEMA_ARTICLE_MISSING_FIELD');assert.equal(missing.length,3);assert(missing.every(f=>f.severity==='warning'&&f.recommendation.includes('not a universal')));assert.match(report.profile,/local structural/);
});
test('Page and image web addresses are syntactically validated without fetching',()=>{
 for(const good of ['https://example.com/a','HTTP://EXAMPLE.COM/','https://127.0.0.1/'])assert(isWebUrl(good));
 for(const bad of ['https://[invalid','javascript:alert(1)','data:text/html,test','/relative','https://u:p@example.com/'])assert.equal(isWebUrl(bad),false);
 const report=auditSocialMeta({html:'<meta property="og:title" content="Example"><meta property="og:url" content="javascript:alert(1)"><meta property="og:image" content="https://[invalid">'});
 assert.equal(report.ok,false);assert(report.findings.some(f=>f.code==='SOCIAL_INVALID_PAGE_URL'));assert(report.findings.some(f=>f.code==='SOCIAL_INVALID_IMAGE_URL'));
 const uppercase=auditSocialMeta({html:'<meta property="og:title" content="Example"><meta property="og:image" content="HTTPS://EXAMPLE.COM/image.png">'});
 assert(!uppercase.findings.some(f=>f.code==='SOCIAL_INVALID_IMAGE_URL'||f.code==='SOCIAL_RELATIVE_IMAGE_URL'));
});
test('Schema URL fields reject unsafe or malformed absolute HTTP values',()=>{
 for(const url of ['https://[invalid','javascript:alert(1)','https://u:p@example.com/']){
  const report=auditJsonLd({html:html({'@context':'https://schema.org','@type':'Person',name:'Example',url})});
  assert(report.findings.some(f=>f.code==='SCHEMA_INVALID_WEB_URL'));assert.equal(report.ok,false);
 }
});
test('Core entrypoints bound DOM and JSON work before recursive processing',()=>{
 const nested='<div>'.repeat(150)+'x'+'</div>'.repeat(150);
 assert.throws(()=>auditJsonLd({html:nested}),/MARKUP_COMPLEX/);assert.throws(()=>auditSocialMeta({html:nested}),/MARKUP_COMPLEX/);
 assert.throws(()=>auditJsonLd({html:'<script type="application/ld+json">'+'['.repeat(80)+'0'+']'.repeat(80)+'</script>'}),/MARKUP_COMPLEX/);
 assert.throws(()=>auditJsonLd({html:'<script type="application/ld+json">{}</script>'.repeat(101)}),/MARKUP_COMPLEX/);
 assert.throws(()=>auditJsonLd({html:'<script type="application/ld+json">['+'0,'.repeat(11000)+'0]</script>'}),/MARKUP_COMPLEX/);
});
test('Core byte limit counts UTF-8 bytes rather than only JavaScript string length',()=>{
 const html='<p>'+'я'.repeat(600000)+'</p>';
 assert.throws(()=>auditJsonLd({html}),/MARKUP_SIZE/);assert.throws(()=>auditSocialMeta({html}),/MARKUP_SIZE/);
});
test('Invalid optional origin cannot bypass URL rules through API data',()=>{
 for(const url of ['javascript:alert(1)','https://u:p@example.com/']){
  assert.throws(()=>auditJsonLd({html:'<p>Example</p>',url}));assert.throws(()=>auditSocialMeta({html:'<p>Example</p>',url}));
 }
});
