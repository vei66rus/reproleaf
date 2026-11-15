import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';

const blockedHostnames=new Set(['localhost','localhost.localdomain','ip6-localhost','ip6-loopback','metadata.google.internal','metadata','169.254.169.254']);

function ipv4ToInt(ip){
 const parts=ip.split('.');
 if(parts.length!==4)return null;
 let value=0;
 for(const part of parts){
  if(!/^\d{1,3}$/.test(part))return null;
  const num=Number(part);
  if(num<0||num>255)return null;
  value=(value<<8)|num;
 }
 return value>>>0;
}

function isPrivateIpv4(ip){
 const n=ipv4ToInt(ip);
 if(n===null)return true;
 const b0=(n>>>24)&0xff;
 const b1=(n>>>16)&0xff;
 const b2=(n>>>8)&0xff;
 if(b0===0)return true;
 if(b0===10)return true;
 if(b0===100&&b1>=64&&b1<=127)return true;
 if(b0===127)return true;
 if(b0===169&&b1===254)return true;
 if(b0===172&&b1>=16&&b1<=31)return true;
 if(b0===192&&b1===0&&b2===0)return true;
 if(b0===192&&b1===0&&b2===2)return true;
 if(b0===192&&b1===168)return true;
 if(b0===198&&(b1===18||b1===19))return true;
 if(b0===198&&b1===51&&b2===100)return true;
 if(b0===203&&b1===0&&b2===113)return true;
 if(b0>=224)return true;
 return false;
}

function extractMappedIpv4(lower){
 const v4Match=lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
 if(v4Match)return v4Match[1];
 const hexMatch=lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
 if(hexMatch){
  const hi=Number.parseInt(hexMatch[1],16);
  const lo=Number.parseInt(hexMatch[2],16);
  return `${(hi>>8)&0xff}.${hi&0xff}.${(lo>>8)&0xff}.${lo&0xff}`;
 }
 return null;
}

export function isPrivateOrReservedIp(rawIp){
 if(typeof rawIp!=='string')return true;
 const stripped=rawIp.trim().replace(/^\[|\]$/g,'').split('%')[0].toLowerCase();
 const kind=isIP(stripped);
 if(kind===4)return isPrivateIpv4(stripped);
 if(kind!==6)return true;
 const mapped=extractMappedIpv4(stripped);
 if(mapped)return isPrivateIpv4(mapped);
 if(stripped==='::'||stripped==='::1')return true;
 const firstGroup=stripped.split(':')[0]||'0';
 if(firstGroup){
  const first=Number.parseInt(firstGroup,16);
  if(Number.isNaN(first))return true;
  if((first&0xfe00)===0xfc00)return true;
  if((first&0xffc0)===0xfe80)return true;
  if((first&0xff00)===0xff00)return true;
  if(first===0x0064&&stripped.startsWith('64:ff9b:'))return true;
 }
 if(stripped.startsWith('::ffff:'))return true;
 return false;
}

export class NetworkGuardError extends Error{
 constructor(message,code='network_guard_blocked'){
  super(message);
  this.name='NetworkGuardError';
  this.code=code;
 }
}

export async function assertSafePublicUrl(rawUrl,{lookupAll=hostname=>lookup(hostname,{all:true,verbatim:true}),requireOrigin=null}={}){
 let parsed;
 try{
  parsed=new URL(rawUrl);
 }catch{
  throw new NetworkGuardError(`Invalid URL: ${rawUrl}`,'invalid_url');
 }
 if(parsed.protocol!=='http:'&&parsed.protocol!=='https:'){
  throw new NetworkGuardError(`Blocked non-HTTP protocol: ${parsed.protocol}`,'blocked_protocol');
 }
 if(parsed.username||parsed.password){
  throw new NetworkGuardError('Blocked URL with embedded credentials','blocked_credentials');
 }
 if(requireOrigin&&parsed.origin!==requireOrigin){
  throw new NetworkGuardError(`Origin ${parsed.origin} outside crawl boundary ${requireOrigin}`,'cross_origin_blocked');
 }
 const host=parsed.hostname.replace(/^\[|\]$/g,'').toLowerCase();
 if(!host||blockedHostnames.has(host)||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.localhost')){
  throw new NetworkGuardError(`Blocked private or reserved hostname: ${host}`,'blocked_hostname');
 }
 if(isIP(host)){
  if(isPrivateOrReservedIp(host)){
   throw new NetworkGuardError(`Blocked private or reserved IP address: ${host}`,'blocked_private_ip');
  }
  return parsed;
 }
 let addresses;
 try{
  addresses=await lookupAll(host);
 }catch(err){
  throw new NetworkGuardError(`DNS lookup failed for ${host}: ${err.message}`,'dns_lookup_failed');
 }
 if(!Array.isArray(addresses)||addresses.length===0){
  throw new NetworkGuardError(`No DNS addresses resolved for ${host}`,'dns_empty');
 }
 for(const entry of addresses){
  const addr=typeof entry==='string'?entry:entry?.address;
  if(isPrivateOrReservedIp(addr)){
   throw new NetworkGuardError(`Blocked hostname "${host}" resolving to private/reserved IP ${addr}`,'blocked_private_ip');
  }
 }
 return parsed;
}

async function readStreamWithLimit(response,maxBytes){
 if(!response.body){
  return Buffer.alloc(0);
 }
 const reader=response.body.getReader();
 const chunks=[];
 let received=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   const chunk=Buffer.isBuffer(value)?value:Buffer.from(value);
   received+=chunk.length;
   if(received>maxBytes){
    await reader.cancel('Response byte limit exceeded');
    throw new NetworkGuardError(`Response exceeded ${maxBytes} bytes limit`,'body_too_large');
   }
   chunks.push(chunk);
  }
 }finally{
  reader.releaseLock();
 }
 return Buffer.concat(chunks,received);
}

const redirectStatuses=new Set([301,302,303,307,308]);

export async function safeFetchPage(rawUrl,{
 fetchImpl=fetch,
 lookupAll,
 requireOrigin=null,
 maxRedirects=5,
 maxBytes=2097152,
 timeoutMs=15000,
 headers={},
 acceptContentTypes=null
}={}){
 let currentUrl=(await assertSafePublicUrl(rawUrl,{lookupAll,requireOrigin})).href;
 const redirectChain=[];
 const visited=new Set([currentUrl]);
 const startTime=performance.now();

 for(let hop=0;hop<=maxRedirects;hop+=1){
  const res=await fetchImpl(currentUrl,{
   method:'GET',
   redirect:'manual',
   signal:AbortSignal.timeout(timeoutMs),
   headers
  });

  if(redirectStatuses.has(res.status)){
   const location=res.headers.get('location');
   await res.body?.cancel();
   if(!location){
    throw new NetworkGuardError(`HTTP ${res.status} at ${currentUrl} missing Location header`,'missing_redirect_location');
   }
   const nextUrlObj=new URL(location,currentUrl);
   await assertSafePublicUrl(nextUrlObj.href,{lookupAll,requireOrigin});
   redirectChain.push({url:currentUrl,status:res.status,location:nextUrlObj.href});
   if(visited.has(nextUrlObj.href)){
    throw new NetworkGuardError(`Redirect loop detected at ${nextUrlObj.href}`,'redirect_loop');
   }
   visited.add(nextUrlObj.href);
   currentUrl=nextUrlObj.href;
   continue;
  }

  const contentType=(res.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  const contentLengthHeader=Number(res.headers.get('content-length'));
  if(Number.isFinite(contentLengthHeader)&&contentLengthHeader>maxBytes){
   await res.body?.cancel();
   throw new NetworkGuardError(`Declared Content-Length ${contentLengthHeader} exceeds ${maxBytes}`,'body_too_large');
  }
  if(Array.isArray(acceptContentTypes)&&contentType&&!acceptContentTypes.some(t=>contentType===t||contentType.endsWith(t))){
   await res.body?.cancel();
   return {
    url:rawUrl,
    finalUrl:currentUrl,
    status:res.status,
    ttfbMs:Math.round(performance.now()-startTime),
    contentType,
    redirectChain,
    headers:Object.fromEntries(res.headers.entries()),
    text:'',
    skippedNonHtml:true
   };
  }

  const bodyBuf=await readStreamWithLimit(res,maxBytes);
  return {
   url:rawUrl,
   finalUrl:currentUrl,
   status:res.status,
   ttfbMs:Math.round(performance.now()-startTime),
   contentType,
   redirectChain,
   headers:Object.fromEntries(res.headers.entries()),
   text:bodyBuf.toString('utf8'),
   byteLength:bodyBuf.length,
   skippedNonHtml:false
  };
 }

 throw new NetworkGuardError(`Too many redirects (>${maxRedirects}) starting from ${rawUrl}`,'too_many_redirects');
}
