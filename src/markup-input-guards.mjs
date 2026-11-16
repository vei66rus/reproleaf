export const MARKUP_CORE_LIMITS=Object.freeze({bytes:1048576,htmlNodes:20000,htmlDepth:128,jsonDepth:32,jsonTokens:10000,blocks:100});
export function isWebUrl(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&Boolean(url.hostname)&&!url.username&&!url.password;}catch{return false;}}
export function assertMarkupSourceBudget(source){if(source.length>MARKUP_CORE_LIMITS.bytes||new TextEncoder().encode(source).length>MARKUP_CORE_LIMITS.bytes)throw new Error('MARKUP_SIZE');if((source.match(/</g)||[]).length>MARKUP_CORE_LIMITS.htmlNodes)throw new Error('MARKUP_COMPLEX');}
export function assertMarkupTreeBudget(document){let nodes=0;const stack=[[document,0]];while(stack.length){const [node,depth]=stack.pop();if(++nodes>MARKUP_CORE_LIMITS.htmlNodes||depth>MARKUP_CORE_LIMITS.htmlDepth)throw new Error('MARKUP_COMPLEX');for(const child of node.childNodes||[])stack.push([child,depth+1]);}}
export function assertJsonSourceBudget(text){let depth=0,quoted=false,escaped=false,tokens=0;for(const char of text){if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}if(char==='"')quoted=true;else if(char==='{'||char==='['){if(++depth>MARKUP_CORE_LIMITS.jsonDepth||++tokens>MARKUP_CORE_LIMITS.jsonTokens)throw new Error('MARKUP_COMPLEX');}else if(char==='}'||char===']')depth--;else if(char===','||char===':'){if(++tokens>MARKUP_CORE_LIMITS.jsonTokens)throw new Error('MARKUP_COMPLEX');}}}
export function isSchemaOrgContext(context){
 if(typeof context==='string'){try{const url=new URL(context);return ['http:','https:'].includes(url.protocol)&&url.hostname==='schema.org'&&['','/'].includes(url.pathname)&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash;}catch{return false;}}
 if(Array.isArray(context))return context.some(isSchemaOrgContext);
 return Boolean(context&&typeof context==='object'&&isSchemaOrgContext(context['@vocab']));
}
export function isIsoCalendarDate(value){
 if(typeof value!=='string')return false;
 const match=/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|([+-])(\d{2}):?(\d{2}))?)?$/.exec(value.trim());
 if(!match)return false;
 const [year,month,day]=match.slice(1,4).map(Number),date=new Date(0);date.setUTCFullYear(year,month-1,day);date.setUTCHours(0,0,0,0);
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return false;
 return (match[4]===undefined||Number(match[4])<=23)&&(match[5]===undefined||Number(match[5])<=59)&&(match[6]===undefined||Number(match[6])<=59)&&(match[8]===undefined||Number(match[8])<=23)&&(match[9]===undefined||Number(match[9])<=59);
}
