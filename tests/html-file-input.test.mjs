import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readHtmlFile,HTML_FILE_LIMIT} from '../src/html-file-input.mjs';
const exec=promisify(execFile),root=fileURLToPath(new URL('..',import.meta.url));
const fixture=charset=>`<!doctype html><html lang="ru"><head><meta charset="${charset}"><title>Проверка кодировки</title><meta name="description" content="Проверка описания"><link rel="canonical" href="https://example.org/page"><meta property="og:title" content="Проверка кодировки"><meta property="og:description" content="Проверка описания"><meta property="og:type" content="website"><meta property="og:url" content="https://example.org/page"><meta property="og:image" content="https://example.org/image.jpg"><meta property="og:image:alt" content="Описание изображения"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"Проверка кодировки","about":{"@id":"#Проверка кодировки"},"url":"https://example.org/page"}</script></head><body><h1>Проверка кодировки</h1></body></html>`;
const cp1251=text=>Buffer.from([...text].map(char=>{const n=char.codePointAt(0);if(n<128)return n;if(n>=0x410&&n<=0x44f)return n-0x350;if(n===0x401)return 0xa8;if(n===0x451)return 0xb8;throw Error('Unsupported synthetic fixture character');}));
async function temp(t){const dir=await mkdtemp(path.join(tmpdir(),'reproleaf-html-file-'));t.after(async()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(tmpdir()));assert.match(path.basename(dir),/^reproleaf-html-file-/);await rm(dir,{recursive:true,force:true});});return dir;}
async function cli(command,file){try{return await exec(process.execPath,['src/cli.mjs',command,'--file',file,'--url','https://example.org/page'],{cwd:root,maxBuffer:2097152});}catch(error){if(error.stdout?.trim().startsWith('{'))return {stdout:error.stdout,stderr:error.stderr,exitCode:error.code};throw error;}}

test('bounded regular file helper returns independently bounded decoded text and encoding provenance',async t=>{
 const dir=await temp(t),file=path.join(dir,'private-file-name.html');await writeFile(file,cp1251(fixture('windows-1251')));const result=await readHtmlFile(file);assert(result.html.includes('Проверка кодировки'));assert.equal(result.inputEncoding.selected,'windows-1251');assert.equal(result.inputEncoding.source,'meta');assert(result.inputEncoding.decodedUtf8Bytes>result.inputEncoding.byteLength);assert(!JSON.stringify(result.inputEncoding).includes(file));
 await writeFile(file,Buffer.concat([Buffer.from('<meta charset=windows-1251>'),Buffer.alloc(600000,0xe0)]));await assert.rejects(()=>readHtmlFile(file),/HTML_TEXT_LIMIT/);
 await writeFile(file,Buffer.alloc(HTML_FILE_LIMIT+1,65));await assert.rejects(()=>readHtmlFile(file),/HTML_BYTE_LIMIT/);
 await assert.rejects(()=>readHtmlFile(dir),/HTML_FILE_REGULAR_REQUIRED/);await assert.rejects(()=>readHtmlFile(path.join(dir,'missing-private-name.html')),error=>error.message==='HTML_FILE_UNREADABLE');
});
for(const command of ['html-audit','schema-audit','social-audit']){
 test(command+' actual CLI decodes CP1251 meta and UTF16 BOM without mojibake',async t=>{
  const dir=await temp(t),file=path.join(dir,'source-private-filename.html');
  for(const [bytes,selected,source]of [[cp1251(fixture('windows-1251')),'windows-1251','meta'],[Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(fixture('utf-8'),'utf16le')]),'utf-16le','bom']]){
   await writeFile(file,bytes);const result=await cli(command,file),report=JSON.parse(result.stdout);assert.equal(report.inputEncoding.selected,selected);assert.equal(report.inputEncoding.source,source);assert(result.stdout.includes('Проверка кодировки'));assert(!result.stdout.includes('source-private-filename'));assert(!Object.hasOwn(report,'html'));assert(!result.stdout.includes('РџСЂРѕ'));
  }
 });
 test(command+' actual CLI rejects invalid bytes, unsupported labels and invalid file bounds',async t=>{
  const dir=await temp(t),file=path.join(dir,'bad-private-file.html');
  for(const [bytes,code]of [[Buffer.from([0xff,0x41]),'HTML_ENCODING_INVALID_BYTES'],[Buffer.from('<meta charset="PRIVATE_LABEL_CANARY"><h1>Test</h1>'),'HTML_ENCODING_UNSUPPORTED'],[Buffer.alloc(HTML_FILE_LIMIT+1,65),'HTML_BYTE_LIMIT']]){
   await writeFile(file,bytes);await assert.rejects(()=>cli(command,file),error=>{assert(error.stderr.includes(code));assert(!error.stderr.includes('PRIVATE_LABEL_CANARY'));assert(!error.stderr.includes('bad-private-file'));assert.equal(error.stdout,'');return true;});
  }
  await assert.rejects(()=>cli(command,dir),error=>error.stderr.includes('HTML_FILE_REGULAR_REQUIRED'));
 });
}
