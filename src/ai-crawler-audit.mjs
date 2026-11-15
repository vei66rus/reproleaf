import {parse} from 'parse5';
import {z} from 'zod';

export const aiCrawlerAuditSchema=z.object({
 url:z.string().url().max(2048).optional(),
 robotsTxt:z.string().max(524288).optional(),
 html:z.string().max(1048576).optional()
}).strict();

const trackedBots=[
 {agent:'OAI-SearchBot',role:'search'},
 {agent:'ChatGPT-User',role:'search'},
 {agent:'PerplexityBot',role:'search'},
 {agent:'GPTBot',role:'training'},
 {agent:'ClaudeBot',role:'search'},
 {agent:'anthropic-ai',role:'training'},
 {agent:'Google-Extended',role:'training'},
 {agent:'Applebot-Extended',role:'training'},
 {agent:'CCBot',role:'training'}
];

function stripComments(line){
 const idx=line.indexOf('#');
 return (idx===-1?line:line.slice(0,idx)).trim();
}

function parseRobotsGroups(raw){
 const lines=String(raw||'').split(/\r?\n/);
 const groups=[];
 let currentAgents=[];
 let currentRules=[];
 let sawDirective=false;
 for(const rawLine of lines){
  const line=stripComments(rawLine);
  if(!line)continue;
  const colon=line.indexOf(':');
  if(colon===-1)continue;
  const field=line.slice(0,colon).trim().toLowerCase();
  const value=line.slice(colon+1).trim();
  if(field==='user-agent'){
   if(sawDirective&&currentAgents.length){
    groups.push({agents:currentAgents,rules:currentRules});
    currentAgents=[];
    currentRules=[];
   }
   if(value)currentAgents.push(value.toLowerCase());
   sawDirective=false;
  }else if(field==='allow'||field==='disallow'){
   sawDirective=true;
   if(currentAgents.length&&value!==''){
    currentRules.push({type:field,pattern:value});
   }
  }
 }
 if(currentAgents.length){
  groups.push({agents:currentAgents,rules:currentRules});
 }
 return groups;
}

function matchPattern(pathAndQuery,pattern){
 if(!pattern)return false;
 const anchoredEnd=pattern.endsWith('$');
 const clean=anchoredEnd?pattern.slice(0,-1):pattern;
 const escaped=clean.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');
 return new RegExp(`^${escaped}${anchoredEnd?'$':''}`).test(pathAndQuery);
}

function evaluateBot(agent,pathAndQuery,groups){
 const lower=agent.toLowerCase();
 const explicitRules=groups.filter(g=>g.agents.includes(lower)).flatMap(g=>g.rules);
 const wildcardRules=groups.filter(g=>g.agents.includes('*')).flatMap(g=>g.rules);
 const rules=explicitRules.length?explicitRules:wildcardRules;
 const source=explicitRules.length?'explicit':'wildcard';
 let best=null;
 for(const rule of rules){
  if(matchPattern(pathAndQuery,rule.pattern)){
   const len=rule.pattern.length;
   if(!best||len>best.len||(len===best.len&&rule.type==='allow')){
    best={type:rule.type,len,pattern:rule.pattern};
   }
  }
 }
 return {
  status:best?.type==='disallow'?'blocked':'allowed',
  source:rules.length?source:'none',
  rule:best?`${best.type==='disallow'?'Disallow':'Allow'}: ${best.pattern}`:null
 };
}

function getAttr(node,name){
 const attr=(node.attrs||[]).find(a=>a.name.toLowerCase()===name.toLowerCase());
 return attr?attr.value:null;
}

function extractVisibleText(node,chunks){
 if(!node)return;
 if(node.tagName==='script'||node.tagName==='style'||node.tagName==='noscript'||node.tagName==='template'){
  return;
 }
 if(node.nodeName==='#text'){
  const t=(node.value||'').trim();
  if(t)chunks.push(t);
  return;
 }
 if(Array.isArray(node.childNodes)){
  for(const child of node.childNodes)extractVisibleText(child,chunks);
 }
}

function collectMetaDirectives(node,directives){
 if(!node)return;
 if(node.tagName==='meta'){
  const name=(getAttr(node,'name')||'').trim().toLowerCase();
  const content=(getAttr(node,'content')||'').trim().toLowerCase();
  if((name==='robots'||name==='googlebot'||name==='bingbot')&&content){
   directives.push({name,content});
  }
 }
 if(Array.isArray(node.childNodes)){
  for(const child of node.childNodes)collectMetaDirectives(child,directives);
 }
}

export function auditAiCrawlerAccess(rawInput){
 const parsed=aiCrawlerAuditSchema.parse(rawInput);
 if(typeof parsed.robotsTxt!=='string'&&typeof parsed.html!=='string'){
  throw Error('Provide at least robotsTxt or html.');
 }
 const pathAndQuery=parsed.url?`${new URL(parsed.url).pathname}${new URL(parsed.url).search}`:'/';
 const findings=[];
 const bots=[];

 if(typeof parsed.robotsTxt==='string'){
  const groups=parseRobotsGroups(parsed.robotsTxt);
  for(const bot of trackedBots){
   const evalResult=evaluateBot(bot.agent,pathAndQuery,groups);
   bots.push({
    agent:bot.agent,
    role:bot.role,
    status:evalResult.status,
    source:evalResult.source,
    rule:evalResult.rule
   });
   if(evalResult.status==='blocked'&&bot.role==='search'){
    findings.push({
     code:'AI_CRAWLER_SEARCH_BLOCKED',
     severity:'warning',
     target:bot.agent,
     message:`Search/citation AI bot "${bot.agent}" is blocked for "${pathAndQuery}" (${evalResult.rule}).`,
     recommendation:`Allow "${bot.agent}" if you want this page cited in AI search answers, while optionally keeping training bots restricted.`
    });
   }
  }
  if(bots.length>0&&bots.every(b=>b.status==='blocked')){
   findings.push({
    code:'AI_CRAWLER_ALL_BLOCKED',
    severity:'warning',
    target:'robots.txt',
    message:`All tracked AI crawlers are blocked for "${pathAndQuery}".`,
    recommendation:'Separate search-citation bots (OAI-SearchBot, PerplexityBot, ClaudeBot) from training bots if AI visibility is desired.'
   });
  }
 }

 let visibleWordsNoJs=null;
 const metaDirectives=[];
 if(typeof parsed.html==='string'){
  const doc=parse(parsed.html);
  collectMetaDirectives(doc,metaDirectives);
  for(const meta of metaDirectives){
   if(/\b(?:noindex|nosnippet|noai|noimageai)\b/.test(meta.content)||/max-snippet:\s*0\b/.test(meta.content)){
    findings.push({
     code:'AI_META_CITATION_RESTRICTED',
     severity:'warning',
     target:`meta[name="${meta.name}"]`,
     message:`Meta directive "${meta.name}: ${meta.content}" restricts indexing or snippet extraction for AI search.`,
     recommendation:'Remove nosnippet, max-snippet:0, noindex, or noai on pages intended for AI citation.'
    });
   }
  }
  const chunks=[];
  extractVisibleText(doc,chunks);
  const words=chunks.join(' ').trim().split(/\s+/).filter(Boolean);
  visibleWordsNoJs=words.length;
  if(visibleWordsNoJs<50){
   findings.push({
    code:'AI_NO_JS_CONTENT_SPARSE',
    severity:'error',
    target:'html',
    message:`Raw HTML without JavaScript execution contains only ${visibleWordsNoJs} visible words (< 50).`,
    recommendation:'Server-render or pre-render core article/product text in HTML so non-JS AI crawlers can read it.'
   });
  }
 }

 const botsAllowed=bots.filter(b=>b.status==='allowed').length;
 const botsBlocked=bots.filter(b=>b.status==='blocked').length;
 const errors=findings.filter(f=>f.severity==='error').length;
 const warnings=findings.filter(f=>f.severity==='warning').length;

 return {
  ok:errors===0,
  path:pathAndQuery,
  summary:{
   errors,
   warnings,
   botsAllowed,
   botsBlocked,
   visibleWordsNoJs
  },
  bots,
  htmlSignals:{
   visibleWordsNoJs,
   metaDirectives
  },
  findings,
  limits:['Evaluates supplied robots.txt rules and static HTML without JavaScript execution or network requests.']
 };
}
