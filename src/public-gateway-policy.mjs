import {isIP} from 'node:net';
import {z} from 'zod';

export const publicGatewayLimits=Object.freeze({batch:8,jsonDepth:32,jsonElements:50000,workUnits:2000000,blogPages:100,blogLinks:10000,suppliedText:200000,markdown:50000,glossaryVariants:200,reportRows:2000,comparisonRows:4000});
const comparisonCollections=['findings','results','checks','pages','edges','recommendations'];
function effectiveComparisonReport(item){
 if(!item||typeof item!=='object'||Array.isArray(item))throw new PublicGatewayError('Invalid public comparison report',-32602);
 const wrapped=Object.hasOwn(item,'report');
 if(wrapped&&(!item.report||typeof item.report!=='object'||Array.isArray(item.report)||comparisonCollections.some(field=>Object.hasOwn(item,field))))throw new PublicGatewayError('Invalid public comparison envelope',-32602);
 const report=wrapped?item.report:item;
 if(Object.hasOwn(report,'report'))throw new PublicGatewayError('Nested comparison envelopes are not supported',-32602);
 for(const field of comparisonCollections)if(Object.hasOwn(report,field)&&!Array.isArray(report[field]))throw new PublicGatewayError('Invalid public comparison collection',-32602);
 return report;
}
const requestId=z.union([z.string().max(200),z.number().int().safe()]);
const params=z.record(z.string(),z.unknown());
const rpcSchema=z.object({jsonrpc:z.literal('2.0'),id:requestId.optional(),method:z.string().min(1).max(100),params:params.optional()}).strict();
const initializeSchema=z.object({protocolVersion:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),capabilities:params,clientInfo:z.object({name:z.string().min(1).max(200),version:z.string().min(1).max(100)}).passthrough(),_meta:params.optional()}).strict();
const callSchema=z.object({name:z.string().min(1).max(100),arguments:params.optional(),_meta:params.optional()}).strict();
const emptyParams=z.object({_meta:params.optional()}).strict();
const responseSchema=z.object({jsonrpc:z.literal('2.0'),id:requestId.nullable(),result:z.unknown().optional(),error:z.object({code:z.number().int(),message:z.string(),data:z.unknown().optional()}).strict().optional()}).strict();

export class PublicGatewayError extends Error {
 constructor(message,code=-32600){super(message);this.name='PublicGatewayError';this.rpcCode=code;}
}
export function rpcError(id,code,message){return {jsonrpc:'2.0',id:typeof id==='string'||Number.isSafeInteger(id)?id:null,error:{code,message}};}
export function parsePublicRpc(input){
 if(input&&typeof input==='object'&&!Array.isArray(input)&&!Object.hasOwn(input,'method')){
  const response=responseSchema.safeParse(input);if(response.success&&Object.hasOwn(input,'result')!==Object.hasOwn(input,'error'))return {notification:true,rpc:response.data};
 }
 const parsed=rpcSchema.safeParse(input);if(!parsed.success)throw new PublicGatewayError('Invalid JSON-RPC request');
 const rpc=parsed.data;if(!Object.hasOwn(rpc,'id'))return {notification:true,rpc};
 const schema=rpc.method==='initialize'?initializeSchema:rpc.method==='tools/call'?callSchema:['tools/list','ping'].includes(rpc.method)?emptyParams:null;
 if(schema&&!schema.safeParse(rpc.params??{}).success)throw new PublicGatewayError('Invalid method parameters',-32602);
 return {notification:false,rpc};
}
export function assertJsonWorkBounds(input){
 const stack=[{value:input,depth:0}];let elements=0;
 while(stack.length){const {value,depth}=stack.pop();if(++elements>publicGatewayLimits.jsonElements||depth>publicGatewayLimits.jsonDepth)throw new PublicGatewayError('Public JSON complexity limit exceeded',-32602);if(value&&typeof value==='object'){const children=Object.values(value);if(elements+stack.length+children.length>publicGatewayLimits.jsonElements)throw new PublicGatewayError('Public JSON complexity limit exceeded',-32602);for(const child of children)stack.push({value:child,depth:depth+1});}}
}
export function publicToolWork(name,args){
 let units=1;
 if(name==='audit_blog_links'){
  const pages=Array.isArray(args.inventory?.pages)?args.inventory.pages:[];
  if(pages.length>publicGatewayLimits.blogPages)throw new PublicGatewayError('Public blog limit: at most 100 pages',-32602);
  let links=0,text=0;for(const page of pages){links+=Array.isArray(page?.links)?page.links.length:0;text+=typeof page?.text==='string'?page.text.length:0;for(const p of Array.isArray(page?.passageInventory?.passages)?page.passageInventory.passages:[])text+=typeof p?.text==='string'?p.text.length:0;}
  if(links>publicGatewayLimits.blogLinks||text>publicGatewayLimits.suppliedText)throw new PublicGatewayError('Public blog link/text budget exceeded',-32602);
  units=pages.length**2+links+text;
 }else if(name==='review_editorial_packet'){
  const packet=args.packet,markdown=typeof packet?.article?.markdown==='string'?packet.article.markdown.length:0;
  const variants=(Array.isArray(packet?.glossary)?packet.glossary:[]).reduce((n,term)=>n+(Array.isArray(term?.prohibitedVariants)?term.prohibitedVariants.length:0),0);
  if(markdown>publicGatewayLimits.markdown||variants>publicGatewayLimits.glossaryVariants)throw new PublicGatewayError('Public editorial text/glossary budget exceeded',-32602);
  units=markdown*(1+variants);
 }else if(name==='compare_check_runs'){
  let total=0;
  for(const input of [args.before,args.after]){const report=effectiveComparisonReport(input);for(const field of comparisonCollections){const rows=report[field];if(Array.isArray(rows)&&rows.length>publicGatewayLimits.reportRows)throw new PublicGatewayError('Public comparison row budget exceeded',-32602);if(Array.isArray(rows))total+=rows.length;}}
  if(total>publicGatewayLimits.comparisonRows)throw new PublicGatewayError('Public comparison total row budget exceeded',-32602);
  units+=total;
 }
 return units;
}
export function assertPublicRequestBudget(input){
 assertJsonWorkBounds(input);const requests=Array.isArray(input)?input:[input];
 if(!requests.length||requests.length>publicGatewayLimits.batch)throw new PublicGatewayError('Public JSON-RPC batch limit exceeded');
 let units=0;
 for(const rpc of requests){if(rpc?.method==='tools/call'&&rpc?.params?.arguments&&typeof rpc.params.arguments==='object'&&!Array.isArray(rpc.params.arguments))units+=publicToolWork(rpc.params.name,rpc.params.arguments);}
 if(units>publicGatewayLimits.workUnits)throw new PublicGatewayError('Public analysis work budget exceeded',-32602);
}
export function normalizePeer(value){const address=value?.startsWith('::ffff:')?value.slice(7):value;return typeof address==='string'&&isIP(address)?address.toLowerCase():null;}
export function proxyClientIdentity(peer,forwarded,trustedPeers=[]){
 const address=normalizePeer(peer)||'unknown',trusted=new Set(trustedPeers.map(normalizePeer).filter(Boolean));
 if(!trusted.has(address)||forwarded===undefined)return address;
 if(typeof forwarded!=='string'||forwarded.length>2048)throw new PublicGatewayError('Invalid trusted proxy identity');
 const chain=forwarded.split(',').map(value=>normalizePeer(value.trim()));if(chain.length>20||chain.some(value=>!value))throw new PublicGatewayError('Invalid trusted proxy identity');
 for(let i=chain.length-1;i>=0;i--)if(!trusted.has(chain[i]))return chain[i];
 return chain[0]||address;
}
export function exactOriginAllowed(origin,localOrigins,allowedOrigins=[]){
 if(origin===undefined)return true;
 try{const parsed=new URL(origin);return ['http:','https:'].includes(parsed.protocol)&&origin===parsed.origin&&[...localOrigins,...allowedOrigins].includes(origin);}catch{return false;}
}
export function acceptsPublicMcp(header){
 if(typeof header!=='string')return false;
 const accepted=new Set();
 for(const item of header.split(',')){const [raw,...parameters]=item.split(';'),quality=parameters.find(part=>/^\s*q\s*=/i.test(part));if(quality&&!(Number(quality.split('=')[1])>0))continue;accepted.add(raw.trim().toLowerCase());}
 return accepted.has('application/json')&&accepted.has('text/event-stream');
}
