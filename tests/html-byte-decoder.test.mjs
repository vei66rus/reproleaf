import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeHtmlBytes} from '../src/html-byte-decoder.mjs';
import {safeFetchPage} from '../src/network-guard.mjs';
import {runMarkupBatch,formatBatchMarkupCsv} from '../src/browser/tools/batch-markup.js';
import {buildMarkupReview} from '../src/browser/tools/markup-review.js';
import {crawlSite} from '../src/live-crawler.mjs';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const utf8=text=>new TextEncoder().encode(text);
export function cp1251(text){
 const inverse=new Map();for(let i=0;i<256;i++){try{inverse.set(new TextDecoder('windows-1251',{fatal:true}).decode(new Uint8Array([i])),i);}catch{}}
 return new Uint8Array([...text].map(char=>{if(!inverse.has(char))throw Error('fixture character');return inverse.get(char);}));
}
const html=title=>`<!doctype html><html><head><meta charset="windows-1251"><meta property="og:title" content="${title}"></head><body><h1>${title}</h1></body></html>`;
const file=(name,bytes)=>({name,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});

test('UTF-8 default preserves Unicode and reports separate raw/text budgets',()=>{
 const text='<h1>Привет €</h1>',result=decodeHtmlBytes(utf8(text));assert.equal(result.text,text);assert.equal(result.encoding.selected,'utf-8');assert.equal(result.encoding.source,'utf8-default');assert.equal(result.encoding.byteLength,utf8(text).length);assert.equal(result.encoding.decodedUtf8Bytes,utf8(text).length);
});
test('declared CP1251 expands decoded bytes without treating expansion as forged file size',async()=>{
 const bytes=cp1251(html('Проверка кодировки')),decoded=decodeHtmlBytes(bytes);assert.equal(decoded.ok,true);assert.equal(decoded.encoding.selected,'windows-1251');assert(decoded.encoding.decodedUtf8Bytes>bytes.length);assert(decoded.text.includes('Проверка кодировки'));
 const batch=await runMarkupBatch([file('page.html',bytes)],{mode:'social-meta'});assert.equal(batch.files[0].status,'checked');assert.equal(batch.files[0].encoding.selected,'windows-1251');assert.equal(batch.files[0].report.scope.sourceEncoding.source,'meta');assert(formatBatchMarkupCsv(batch).includes('windows-1251'));
});
test('HTTP charset has priority over meta and handles quoted parameters',()=>{
 const bytes=cp1251('<meta charset=utf-8><h1>Привет</h1>');const result=decodeHtmlBytes(bytes,{contentType:'text/html; note="a;charset=utf-8"; CHARSET = "windows-1251"'});assert.equal(result.encoding.source,'header');assert.equal(result.encoding.selected,'windows-1251');assert(result.text.includes('Привет'));
});
test('authoritative BOM or header skips unnecessary meta parsing on deeply nested prefixes',()=>{
 const text='<div>'.repeat(130)+'<p>Привет</p>'+'</div>'.repeat(130),bytes=utf8(text);let r=decodeHtmlBytes(bytes,{contentType:'text/html;charset=utf-8'});assert.equal(r.ok,true);assert.equal(r.text,text);assert.equal(r.encoding.metaInspection,'skipped-authoritative-encoding');assert.equal(r.encoding.declarationScanBytes,0);
 r=decodeHtmlBytes(new Uint8Array([239,187,191,...bytes]));assert.equal(r.ok,true);assert.equal(r.text,text);assert.equal(r.encoding.source,'bom');assert.equal(r.encoding.metaCharset,null);
});
test('UTF-8 and UTF-16 BOMs have priority over conflicting declarations',()=>{
 let text='<meta charset=windows-1251><h1>Привет</h1>';let b=new Uint8Array([239,187,191,...utf8(text)]),r=decodeHtmlBytes(b,{contentType:'text/html;charset=windows-1251'});assert.equal(r.text,text);assert.equal(r.encoding.source,'bom');
 b=Buffer.concat([Buffer.from([255,254]),Buffer.from('<h1>Привет</h1>','utf16le')]);r=decodeHtmlBytes(b);assert.equal(r.text,'<h1>Привет</h1>');assert.equal(r.encoding.selected,'utf-16le');
});
test('meta http-equiv is case-insensitive and independent of attribute order',()=>{
 const bytes=cp1251('<META content="text/html; charset=windows-1251" HTTP-EQUIV="Content-Type"><h1>Привет</h1>');const r=decodeHtmlBytes(bytes);assert.equal(r.ok,true);assert.equal(r.encoding.source,'meta');assert(r.text.includes('Привет'));
});
test('HTML meta UTF16 declarations select UTF8 while HTTP UTF16 remains honored',()=>{
 for(const label of ['utf-16','utf-16le','utf-16be','unicode','ucs-2']){const text=`<meta charset=${label}><title>Encoding probe</title>`,r=decodeHtmlBytes(utf8(text));assert.equal(r.text,text);assert.equal(r.encoding.selected,'utf-8');assert.equal(r.encoding.declarationAdjustment,'html-meta-utf16-to-utf8');}
 const text='<title>Encoding probe</title>',r=decodeHtmlBytes(Buffer.from(text,'utf16le'),{contentType:'text/html;charset=utf-16'});assert.equal(r.text,text);assert.equal(r.encoding.selected,'utf-16le');assert.equal(r.encoding.declarationAdjustment,undefined);
});
test('HTML meta x-user-defined selects windows1252 without silently changing header declarations',()=>{
 const bytes=new Uint8Array([...utf8('<meta charset=x-user-defined><title>'),128,...utf8('</title>')]),r=decodeHtmlBytes(bytes);assert.equal(r.ok,true);assert.equal(r.encoding.selected,'windows-1252');assert.equal(r.encoding.declarationAdjustment,'html-meta-x-user-defined-to-windows1252');assert(r.text.includes('€'));
});
for(const prefix of ['<!-- <meta charset=windows-1251> -->','<script>const x="<meta charset=windows-1251>";</script>','<style>x{content:"<meta charset=windows-1251>"}</style>','<textarea><meta charset=windows-1251></textarea>','<title><meta charset=windows-1251></title>','<template><meta charset=windows-1251></template>','<noscript><meta charset=windows-1251></noscript>','<div data-value="<meta charset=windows-1251>"></div>']){
 test('parse5 ignores declaration-like text: '+prefix.slice(0,22),()=>{const text=prefix+'<meta charset=utf-8><h1>Привет</h1>',r=decodeHtmlBytes(utf8(text));assert.equal(r.ok,true);assert.equal(r.encoding.selected,'utf-8');assert(r.text.includes('Привет'));});
}
test('declaration scan never accepts tags ending after byte 1024',()=>{
 const bytes=utf8(' '.repeat(1010)+'<meta charset=windows-1251><h1>Привет</h1>');const r=decodeHtmlBytes(bytes);assert.equal(r.encoding.source,'utf8-default');assert.equal(r.encoding.declarationScanBytes,1024);
});
test('unknown, empty and malformed declarations fail without an implicit replacement decode',()=>{
 for(const contentType of ['text/html; charset=not-an-encoding','text/html; charset=""','text/html; charset="<script>private@example.org</script>"','text/html; charset=sk-proj-private-key-example']){const r=decodeHtmlBytes(utf8('<h1>Text</h1>'),{contentType});assert.equal(r.ok,false);assert.equal(r.text,null);assert.equal(r.error,'HTML_ENCODING_UNSUPPORTED');assert(!JSON.stringify(r).includes('private@example.org'));assert(!JSON.stringify(r).includes('sk-proj-private'));assert.equal(r.encoding.unsupportedDeclaration,true);}
});
test('explicit UTF8 fallback remains unconfirmed and cannot be counted as a successful check',()=>{
 const r=decodeHtmlBytes(utf8('hello'),{contentType:'text/html; charset=unknown',allowUtf8Fallback:true});assert.equal(r.ok,false);assert.equal(r.error,'HTML_ENCODING_CONFIRMATION_REQUIRED');assert.equal(r.text,'hello');assert.equal(r.encoding.fallbackUsed,true);
});
test('invalid UTF8 and unsupported UTF32 BOM fail honestly',()=>{
 assert.equal(decodeHtmlBytes(new Uint8Array([0xc3,0x28])).error,'HTML_ENCODING_INVALID_BYTES');assert.equal(decodeHtmlBytes(new Uint8Array([255,254,0,0,65,0,0,0])).error,'HTML_ENCODING_UNSUPPORTED');
});
test('raw byte and decoded UTF8 limits are independent',()=>{
 const bytes=cp1251(html('П'.repeat(100)));assert.equal(decodeHtmlBytes(bytes,{maxBytes:bytes.length-1}).error,'HTML_BYTE_LIMIT');assert.equal(decodeHtmlBytes(bytes,{maxBytes:bytes.length,maxDecodedBytes:bytes.length}).error,'HTML_TEXT_LIMIT');assert.equal(decodeHtmlBytes(bytes,{maxBytes:bytes.length,maxDecodedBytes:bytes.length*3}).ok,true);
});
test('input and configuration errors remain bounded',()=>{
 assert.throws(()=>decodeHtmlBytes('text'),/HTML_BYTES_REQUIRED/);assert.throws(()=>decodeHtmlBytes(utf8('text'),{maxBytes:0}),/HTML_BYTE_LIMIT_INVALID/);assert.throws(()=>decodeHtmlBytes(utf8('text'),{maxDecodedBytes:0}),/HTML_TEXT_LIMIT_INVALID/);assert.throws(()=>decodeHtmlBytes(utf8('text'),{contentType:'x'.repeat(8193)}),/HTML_CONTENT_TYPE_INVALID/);assert.throws(()=>decodeHtmlBytes(utf8('text'),{allowUtf8Fallback:1}),/HTML_FALLBACK_OPTION_INVALID/);
});
test('pasted HTML and JSON strings are not decoded again',()=>{
 const text=html('Привет');let r=buildMarkupReview({mode:'social-meta',text});assert.equal(r.preview.title,'Привет');assert.equal(r.scope.sourceEncoding.source,'javascript-string');
 r=buildMarkupReview({format:'json',text:JSON.stringify({'@context':'https://schema.org','@type':'Thing',name:'Привет charset=windows-1251'})});assert.equal(r.scope.sourceEncoding.source,'javascript-string');assert.equal(r.summary.entities,1);
});
test('batch duplicate identity uses decoded content but retains each file encoding',async()=>{
 const text=html('Привет'),a=cp1251(text),b=utf8(text),bom=new Uint8Array([239,187,191,...b]);const report=await runMarkupBatch([file('one.html',a),file('two.html',bom)],{mode:'social-meta'});assert.equal(report.files[0].status,'checked');assert.equal(report.files[1].status,'duplicate');assert.equal(report.files[1].encoding.source,'bom');assert.equal(report.files[1].encoding.selected,'utf-8');
});
test('batch checks observed raw size rather than UTF8-expanded length',async()=>{
 const bytes=cp1251(html('Привет')),f=file('one.html',bytes);f.size=bytes.length-1;const report=await runMarkupBatch([f]);assert.equal(report.files[0].reason,'BATCH_METADATA');assert.equal(report.complete,false);
});
test('batch malformed encoding remains a failed row and following valid files run',async()=>{
 const report=await runMarkupBatch([file('bad.html',new Uint8Array([0xc3,0x28])),file('good.html',utf8('<h1>Hi</h1>'))]);assert.equal(report.files[0].status,'failed');assert.equal(report.files[0].reason,'BATCH_ENCODING');assert.equal(report.files[1].status,'checked');assert.equal(report.complete,false);
});
const lookupAll=async()=>[{address:'93.184.216.34',family:4}];
test('safeFetchPage integrates declared HTML decoding but leaves JSON response semantics alone',async()=>{
 const bytes=cp1251(html('Привет'));const fetchImpl=async()=>new Response(bytes,{headers:{'Content-Type':'text/html; charset=windows-1251'}});const r=await safeFetchPage('https://example.com/',{lookupAll,fetchImpl});assert(r.text.includes('Привет'));assert.equal(r.byteLength,bytes.length);assert.equal(r.encoding.source,'header');
 const json=await safeFetchPage('https://example.com/data.json',{lookupAll,fetchImpl:async()=>new Response('{"text":"Привет"}',{headers:{'Content-Type':'application/json; charset=windows-1251'}})});assert.equal(JSON.parse(json.text).text,'Привет');assert.equal(json.encoding,undefined);
});
test('safeFetchPage rejects undecodable HTML with a stable error code and supports existing 8MiB setting',async()=>{
 await assert.rejects(()=>safeFetchPage('https://example.com/',{lookupAll,fetchImpl:async()=>new Response(new Uint8Array([0xc3,0x28]),{headers:{'Content-Type':'text/html'}})}),e=>e.code==='html_encoding_invalid_bytes');const r=await safeFetchPage('https://example.com/',{lookupAll,maxBytes:8388608,fetchImpl:async()=>new Response('<h1>OK</h1>',{headers:{'Content-Type':'text/html'}})});assert.equal(r.encoding.selected,'utf-8');
});
test('actual crawler record and persisted JSON retain bounded HTML encoding provenance',async()=>{
 const bytes=cp1251('<!doctype html><html><head><meta charset=windows-1251><title>Проверка</title></head><body><h1>Проверка</h1></body></html>');
 const report=await crawlSite({startUrl:'https://example.com/',allowNetwork:true,maxPages:1,maxDepth:0,respectRobots:false,followSitemaps:false,crawlDelayMs:0},{lookupAll,fetchImpl:async()=>new Response(bytes,{headers:{'Content-Type':'text/html; charset=windows-1251'}}),waitImpl:async()=>{}});
 assert.equal(report.pages.length,1);assert.equal(report.pages[0].title,'Проверка');assert.equal(report.pages[0].encoding.selected,'windows-1251');assert.equal(report.pages[0].encoding.source,'header');assert.equal(report.pages[0].encoding.headerCharset,'windows-1251');assert(!JSON.stringify(report.pages[0].encoding).includes('text/html'));
 const dir=await mkdtemp(path.join(tmpdir(),'reproleaf-encoding-'));
 try{const target=path.join(dir,'crawl-report.json');await writeFile(target,JSON.stringify(report));const saved=JSON.parse(await readFile(target,'utf8'));assert.deepEqual(saved.pages[0].encoding,report.pages[0].encoding);assert.equal(saved.pages[0].title,'Проверка');}
 finally{assert(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));assert(path.basename(dir).startsWith('reproleaf-encoding-'));await rm(dir,{recursive:true,force:true});}
});
