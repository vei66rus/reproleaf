import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {decodeHtmlBytes} from './html-byte-decoder.mjs';

export const HTML_FILE_LIMIT=1048576;

export async function readHtmlFile(file){
 if(typeof file!=='string'||!file)throw Error('HTML_FILE_REQUIRED');
 let handle;
 try{
  const entry=await lstat(file);
  if(!entry.isFile())throw Error('HTML_FILE_REGULAR_REQUIRED');
  if(entry.size>HTML_FILE_LIMIT)throw Error('HTML_BYTE_LIMIT');
  handle=await open(file,constants.O_RDONLY|(constants.O_NONBLOCK||0));
  const stat=await handle.stat();
  if(!stat.isFile())throw Error('HTML_FILE_REGULAR_REQUIRED');
  if(stat.size>HTML_FILE_LIMIT)throw Error('HTML_BYTE_LIMIT');
  const bytes=Buffer.alloc(HTML_FILE_LIMIT+1);let offset=0;
  while(offset<bytes.length){const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);if(!bytesRead)break;offset+=bytesRead;}
  if(offset>HTML_FILE_LIMIT)throw Error('HTML_BYTE_LIMIT');
  const decoded=decodeHtmlBytes(bytes.subarray(0,offset),{maxBytes:HTML_FILE_LIMIT,maxDecodedBytes:HTML_FILE_LIMIT});
  if(!decoded.ok)throw Error(decoded.error);
  return {html:decoded.text,inputEncoding:decoded.encoding};
 }catch(error){
  if(typeof error?.message==='string'&&/^HTML_[A-Z_]+$/.test(error.message))throw error;
  throw Error('HTML_FILE_UNREADABLE');
 }finally{if(handle)await handle.close();}
}
