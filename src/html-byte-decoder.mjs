/*!
 * Derived from decodeHtmlBody, houtini-ai/seo-audit commit
 * ff75890fb5c9c39f3c52f8abf99cc2b4a531740d, src/core/extract.ts.
 * Apache-2.0; see vendor/houtini/LICENSE and vendor/houtini/NOTICE.txt.
 * Modifications: bounded Uint8Array input, parse5 declaration inspection,
 * BOM precedence, fatal decoding, independent text budget and provenance.
 */
import {parse} from 'parse5';

const trim=value=>value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g,'');
function charsetParameter(value){
 if(typeof value!=='string')return null;
 const parts=[];let quote=null,start=0;
 for(let i=0;i<=value.length;i++){
  const char=value[i];
  if(i===value.length||(!quote&&char===';')){parts.push(value.slice(start,i));start=i+1;}
  else if(quote){if(char===quote)quote=null;}
  else if(char==='"'||char==="'")quote=char;
 }
 for(const part of parts){
  const match=/^[\t\n\f\r ]*charset[\t\n\f\r ]*=[\t\n\f\r ]*(.*)$/i.exec(part);if(!match)continue;
  const raw=trim(match[1]),quoted=/^"([^"]*)"$/.exec(raw)||/^'([^']*)'$/.exec(raw);
  return quoted?trim(quoted[1]):raw;
 }
 return null;
}

function sniffMetaCharset(bytes){
 const prefix=bytes.subarray(0,1024);let source='';for(const byte of prefix)source+=String.fromCharCode(byte);
 const document=parse(source,{sourceCodeLocationInfo:true}),stack=[[document,0]];let visited=0;
 while(stack.length){
  const [node,depth]=stack.pop();if(++visited>2048||depth>128)throw Error('HTML_DECLARATION_COMPLEX');
  if(node.tagName==='meta'){
   const location=node.sourceCodeLocation;
   if(location&&location.endOffset<=prefix.length&&source[location.endOffset-1]==='>'){
    const attrs=new Map((node.attrs||[]).map(attr=>[attr.name,attr.value]));
    if(attrs.has('charset'))return trim(attrs.get('charset'));
    if(trim(attrs.get('http-equiv')||'').toLowerCase()==='content-type'){
     const label=charsetParameter(attrs.get('content'));if(label)return label;
    }
   }
  }
  // Template content is inert. Raw-text, comment and attribute contents are
  // already represented by parse5 as text rather than declaration elements.
  const children=node.childNodes||[];for(let i=children.length-1;i>=0;i--)stack.push([children[i],depth+1]);
 }
 return null;
}

function bomOf(bytes){
 if(bytes[0]===239&&bytes[1]===187&&bytes[2]===191)return 'utf-8';
 if(bytes[0]===255&&bytes[1]===254&&bytes[2]===0&&bytes[3]===0)return 'utf-32le';
 if(bytes[0]===0&&bytes[1]===0&&bytes[2]===254&&bytes[3]===255)return 'utf-32be';
 if(bytes[0]===255&&bytes[1]===254)return 'utf-16le';
 if(bytes[0]===254&&bytes[1]===255)return 'utf-16be';
 return null;
}

export function decodeHtmlBytes(bytes,{contentType=null,maxBytes=1048576,maxDecodedBytes=1048576,allowUtf8Fallback=false}={}){
 if(!(bytes instanceof Uint8Array))throw Error('HTML_BYTES_REQUIRED');
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>8388608)throw Error('HTML_BYTE_LIMIT_INVALID');
 if(!Number.isSafeInteger(maxDecodedBytes)||maxDecodedBytes<1||maxDecodedBytes>25165824)throw Error('HTML_TEXT_LIMIT_INVALID');
 if(typeof allowUtf8Fallback!=='boolean')throw Error('HTML_FALLBACK_OPTION_INVALID');
 if(contentType!==null&&(typeof contentType!=='string'||contentType.length>8192))throw Error('HTML_CONTENT_TYPE_INVALID');
 if(bytes.byteLength>maxBytes)return {ok:false,text:null,error:'HTML_BYTE_LIMIT',byteLength:bytes.byteLength};
 const bom=bomOf(bytes),headerCharset=charsetParameter(contentType);
 const inspectMeta=bom===null&&headerCharset===null;
 let metaCharset=null;if(inspectMeta){try{metaCharset=sniffMetaCharset(bytes);}catch{return {ok:false,text:null,error:'HTML_DECLARATION_COMPLEX',byteLength:bytes.byteLength};}}
 const requested=bom??headerCharset??metaCharset??'utf-8',safeLabel=value=>{
  if(typeof value!=='string'||!/^[a-z0-9._:-]{1,80}$/i.test(value))return null;
  if(value.toLowerCase()==='x-user-defined')return value;
  try{new TextDecoder(value);return value;}catch{return null;}
 };
 const encoding={requested:safeLabel(requested),selected:null,source:bom?'bom':headerCharset!==null?'header':metaCharset!==null?'meta':'utf8-default',bom,headerCharset:safeLabel(headerCharset),metaCharset:safeLabel(metaCharset),metaInspection:inspectMeta?'bounded-dom':'skipped-authoritative-encoding',fallbackUsed:false,byteLength:bytes.byteLength,decodedUtf8Bytes:null,declarationScanBytes:inspectMeta?Math.min(bytes.byteLength,1024):0,scope:'Bounded HTML declaration inspection; not a complete browser encoding detector.'};
 let decodeLabel=requested;
 if(encoding.source==='meta'){
  if(requested.toLowerCase()==='x-user-defined'){decodeLabel='windows-1252';encoding.declarationAdjustment='html-meta-x-user-defined-to-windows1252';}
  else{try{if(['utf-16le','utf-16be'].includes(new TextDecoder(requested).encoding)){decodeLabel='utf-8';encoding.declarationAdjustment='html-meta-utf16-to-utf8';}}catch{}}
 }
 let decoder;
 try{decoder=new TextDecoder(decodeLabel,{fatal:true});}
 catch{encoding.unsupportedDeclaration=true;if(!allowUtf8Fallback)return {ok:false,text:null,error:'HTML_ENCODING_UNSUPPORTED',encoding};decoder=new TextDecoder('utf-8',{fatal:true});encoding.fallbackUsed=true;}
 encoding.selected=decoder.encoding;
 try{
  const text=decoder.decode(bytes);encoding.decodedUtf8Bytes=new TextEncoder().encode(text).length;
  if(encoding.decodedUtf8Bytes>maxDecodedBytes)return {ok:false,text:null,error:'HTML_TEXT_LIMIT',encoding};
  if(encoding.fallbackUsed)return {ok:false,text,error:'HTML_ENCODING_CONFIRMATION_REQUIRED',encoding};
  return {ok:true,text,encoding};
 }catch{return {ok:false,text:null,error:'HTML_ENCODING_INVALID_BYTES',encoding};}
}
