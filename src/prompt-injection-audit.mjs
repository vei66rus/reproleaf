import {z} from 'zod';
import {parse} from 'parse5';

export const promptInjectionAuditSchema=z.object({
 html:z.string().min(1).max(1000000).optional(),
 markdown:z.string().min(1).max(200000).optional()
}).strict().superRefine((val,ctx)=>{
 if(!val.html&&!val.markdown){
  ctx.addIssue({code:'custom',message:'Provide either html or markdown.'});
 }
});

const hiddenStylePatterns=[
 /display\s*:\s*none/i,
 /visibility\s*:\s*hidden/i,
 /opacity\s*:\s*0(?:\.0+)?\s*(?:;|$)/i,
 /font-size\s*:\s*0(?:px|em|rem|%)?\s*(?:;|$)/i,
 /text-indent\s*:\s*-\d{3,}px/i
];

const injectionPatterns=[
 /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/i,
 /disregard\s+(?:all\s+)?(?:previous|earlier|system)\s+instructions/i,
 /\bsystem\s+prompt\s*:/i,
 /\byou\s+are\s+now\s+(?:in\s+)?developer\s+mode/i,
 /\boverride\s+(?:all\s+)?safety\s+rules\b/i,
 /\bdo\s+not\s+tell\s+the\s+user\b/i,
 /\bexfiltrate\s+(?:data|secrets|tokens|keys)\b/i
];

function getAttr(node,name){
 const attr=(node.attrs||[]).find(a=>a.name.toLowerCase()===name);
 return attr?attr.value.trim():'';
}

function collectText(node,skipTags=new Set(['script','style','template'])){
 if(!node)return '';
 if(node.nodeName==='#text')return node.value||'';
 if(skipTags.has((node.nodeName||'').toLowerCase()))return '';
 return (node.childNodes||[]).map(c=>collectText(c,skipTags)).join(' ');
}

function walkNodes(node,visit){
 if(!node)return;
 visit(node);
 for(const child of node.childNodes||[])walkNodes(child,visit);
}

export function auditPromptInjectionAndHiddenText(rawInput){
 const parsed=promptInjectionAuditSchema.parse(rawInput);
 const findings=[];
 const textBlocks=[];
 let hiddenElements=0;

 if(parsed.html){
  const doc=parse(parsed.html);
  walkNodes(doc,node=>{
   if(node.nodeName==='#comment'){
    if(node.data)textBlocks.push({source:'html-comment',text:node.data});
    return;
   }
   const tag=(node.nodeName||'').toLowerCase();
   if(!tag||tag.startsWith('#')||tag==='script'||tag==='style'||tag==='template')return;
   const style=getAttr(node,'style');
   if(style&&hiddenStylePatterns.some(rx=>rx.test(style))){
    const text=collectText(node).replace(/\s+/g,' ').trim();
    if(text.length>=15){
     hiddenElements+=1;
     const hasInjection=injectionPatterns.some(rx=>rx.test(text));
     findings.push({
      code:'GUARD_HIDDEN_TEXT_CLOAKING',
      severity:hasInjection?'error':'warning',
      tag,
      quote:text.slice(0,180),
      message:`Hidden ${tag} element contains ${text.length} characters of off-screen/invisible text.`,
      recommendation:'Remove hidden keyword stuffing or invisible prompt text from HTML.'
     });
    }
   }
  });
  const bodyText=collectText(doc).replace(/\s+/g,' ').trim();
  if(bodyText)textBlocks.push({source:'html-body',text:bodyText});
 }

 if(parsed.markdown){
  textBlocks.push({source:'markdown',text:parsed.markdown});
 }

 let injectionSignals=0;
 for(const block of textBlocks){
  for(const rx of injectionPatterns){
   const match=block.text.match(rx);
   if(match){
    injectionSignals+=1;
    findings.push({
     code:'GUARD_PROMPT_INJECTION_SIGNAL',
     severity:'error',
     source:block.source,
     quote:match[0],
     message:`Prompt-injection or instruction-override phrase detected in ${block.source}: "${match[0]}".`,
     recommendation:'Strip untrusted instruction overrides before indexing or feeding content to LLM pipelines.'
    });
   }
  }
 }

 return {
  ok:findings.every(f=>f.severity!=='error'),
  summary:{
   hiddenElements,
   injectionSignals,
   errors:findings.filter(f=>f.severity==='error').length,
   warnings:findings.filter(f=>f.severity==='warning').length
  },
  findings
 };
}
