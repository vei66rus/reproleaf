import {z} from 'zod';
import {parse} from 'parse5';

export const serpSnippetSchema=z.object({
 html:z.string().min(1).max(1000000).optional(),
 title:z.string().max(500).optional(),
 description:z.string().max(1000).optional(),
 h1:z.string().max(500).optional(),
 url:z.string().url().max(2048).optional(),
 primaryQuery:z.string().max(200).optional()
}).strict().superRefine((val,ctx)=>{
 if(!val.html&&val.title===undefined&&val.description===undefined){
  ctx.addIssue({code:'custom',message:'Provide html, title, or description.'});
 }
});

const narrowChars=new Set([...'ilIj1.,:;|!\'"`()[] ']);
const wideChars=new Set([...'WMm@%&ЖШЩЮФДЪЫ']);

export function measurePixelWidth(text,basePx=10){
 let units=0;
 for(const ch of text){
  if(narrowChars.has(ch))units+=0.48;
  else if(wideChars.has(ch))units+=1.38;
  else if(ch!==ch.toLowerCase()&&ch===ch.toUpperCase())units+=1.15;
  else units+=0.92;
 }
 return Math.round(units*basePx);
}

function truncateToPixels(text,maxPx,basePx){
 if(measurePixelWidth(text,basePx)<=maxPx)return text;
 let acc='';
 for(const ch of text){
  if(measurePixelWidth(`${acc}${ch}...`,basePx)>maxPx)break;
  acc+=ch;
 }
 return `${acc.trimEnd()}...`;
}

function getAttr(node,name){
 const attr=(node.attrs||[]).find(a=>a.name.toLowerCase()===name);
 return attr?attr.value.trim():'';
}

function collectText(node){
 if(!node)return '';
 if(node.nodeName==='#text')return node.value||'';
 return (node.childNodes||[]).map(collectText).join(' ');
}

function walkNodes(node,visit){
 if(!node)return;
 visit(node);
 for(const child of node.childNodes||[])walkNodes(child,visit);
}

function extractFromHtml(html){
 const doc=parse(html);
 let title='';
 let description='';
 let h1='';
 walkNodes(doc,node=>{
  const tag=(node.nodeName||'').toLowerCase();
  if(tag==='title'&&!title){
   title=collectText(node).replace(/\s+/g,' ').trim();
  }else if(tag==='meta'&&getAttr(node,'name').toLowerCase()==='description'&&!description){
   description=getAttr(node,'content').replace(/\s+/g,' ').trim();
  }else if(tag==='h1'&&!h1){
   h1=collectText(node).replace(/\s+/g,' ').trim();
  }
 });
 return {title,description,h1};
}

export function auditSerpSnippet(rawInput){
 const parsed=serpSnippetSchema.parse(rawInput);
 const extracted=parsed.html?extractFromHtml(parsed.html):{title:'',description:'',h1:''};
 const title=(parsed.title??extracted.title).replace(/\s+/g,' ').trim();
 const description=(parsed.description??extracted.description).replace(/\s+/g,' ').trim();
 const h1=(parsed.h1??extracted.h1).replace(/\s+/g,' ').trim();

 const titlePx=measurePixelWidth(title,10.2);
 const descPx=measurePixelWidth(description,7.4);
 const findings=[];

 if(!title){
  findings.push({
   code:'SERP_TITLE_MISSING',
   severity:'error',
   message:'Missing <title> tag or empty title string.',
   recommendation:'Add a unique descriptive title between 280px and 580px.'
  });
 }else{
  if(titlePx<200){
   findings.push({
    code:'SERP_TITLE_TOO_SHORT',
    severity:'warning',
    message:`Title is short (${titlePx}px, ${title.length} chars) and underuses SERP real estate.`,
    recommendation:'Expand the title with primary topic context up to ~580px.'
   });
  }else if(titlePx>580){
   findings.push({
    code:'SERP_TITLE_TRUNCATED',
    severity:'warning',
    message:`Title (~${titlePx}px, ${title.length} chars) exceeds ~580px desktop SERP width and will truncate.`,
    recommendation:'Trim or front-load key terms within 580px.'
   });
  }
 }

 if(!description){
  findings.push({
   code:'SERP_DESCRIPTION_MISSING',
   severity:'warning',
   message:'Missing meta description; search engines will auto-generate a snippet.',
   recommendation:'Write a concise meta description between 450px and 920px.'
  });
 }else{
  if(descPx<350){
   findings.push({
    code:'SERP_DESCRIPTION_TOO_SHORT',
    severity:'warning',
    message:`Meta description is short (~${descPx}px, ${description.length} chars).`,
    recommendation:'Expand description to clarify value and scope (~680px-920px).'
   });
  }else if(descPx>920){
   findings.push({
    code:'SERP_DESCRIPTION_TRUNCATED_DESKTOP',
    severity:'warning',
    message:`Meta description (~${descPx}px, ${description.length} chars) exceeds ~920px desktop limit.`,
    recommendation:'Keep key message within 680px (mobile) to 920px (desktop).'
   });
  }else if(descPx>680){
   findings.push({
    code:'SERP_DESCRIPTION_TRUNCATED_MOBILE',
    severity:'info',
    message:`Meta description (~${descPx}px) fits desktop (<=920px) but may truncate on mobile (>680px).`,
    recommendation:'Front-load the main takeaway in the first 680px.'
   });
  }
 }

 if(title&&h1&&title.toLowerCase()===h1.toLowerCase()){
  findings.push({
   code:'SERP_TITLE_EQUALS_H1_EXACT',
   severity:'info',
   message:'Title is identical to H1.',
   recommendation:'Consider adding brand or clarifying modifiers in <title> while keeping H1 concise.'
  });
 }

 if(parsed.primaryQuery&&title){
  const tokens=parsed.primaryQuery.toLowerCase().split(/\s+/).filter(t=>t.length>=3);
  const titleLower=title.toLowerCase();
  const matched=tokens.filter(t=>titleLower.includes(t));
  if(tokens.length>0&&matched.length===0){
   findings.push({
    code:'SERP_QUERY_NOT_IN_TITLE',
    severity:'warning',
    message:`Primary query "${parsed.primaryQuery}" terms are absent from <title>.`,
    recommendation:'Include the primary query terms naturally near the start of <title>.'
   });
  }
 }

 return {
  ok:findings.every(f=>f.severity!=='error'),
  metrics:{
   titleChars:title.length,
   titlePixels:titlePx,
   descriptionChars:description.length,
   descriptionPixels:descPx
  },
  preview:{
   url:parsed.url??null,
   desktopTitle:truncateToPixels(title,580,10.2),
   mobileTitle:truncateToPixels(title,520,10.2),
   desktopDescription:truncateToPixels(description,920,7.4),
   mobileDescription:truncateToPixels(description,680,7.4)
  },
  findings
 };
}
