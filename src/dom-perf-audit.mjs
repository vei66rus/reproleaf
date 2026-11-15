import {z} from 'zod';
import {parse} from 'parse5';

export const domPerfAuditSchema=z.object({
 html:z.string().min(1).max(1000000)
}).strict();

function getAttr(node,name){
 const attr=(node.attrs||[]).find(a=>a.name.toLowerCase()===name);
 return attr?attr.value.trim():'';
}

function hasAttr(node,name){
 return (node.attrs||[]).some(a=>a.name.toLowerCase()===name);
}

export function auditDomPerfHints(rawInput){
 const parsed=domPerfAuditSchema.parse(rawInput);
 const doc=parse(parsed.html);

 let totalNodes=0;
 let maxDepth=0;
 let hasViewport=false;
 let imagesTotal=0;
 let imagesMissingDimensions=0;
 let imagesMissingAlt=0;
 let firstImageLazy=false;
 let blockingHeadScripts=0;
 let firstImgSeen=false;

 function walk(node,depth,inHead){
  if(!node)return;
  const tag=(node.nodeName||'').toLowerCase();
  const isElement=Boolean(tag&&!tag.startsWith('#'));
  if(isElement){
   totalNodes+=1;
   if(depth>maxDepth)maxDepth=depth;
   if(tag==='meta'&&getAttr(node,'name').toLowerCase()==='viewport'&&getAttr(node,'content')){
    hasViewport=true;
   }else if(tag==='script'&&inHead){
    const src=getAttr(node,'src');
    const type=getAttr(node,'type').toLowerCase();
    if(src&&type!=='module'&&!hasAttr(node,'async')&&!hasAttr(node,'defer')){
     blockingHeadScripts+=1;
    }
   }else if(tag==='img'){
    imagesTotal+=1;
    if(!hasAttr(node,'width')||!hasAttr(node,'height'))imagesMissingDimensions+=1;
    if(!hasAttr(node,'alt'))imagesMissingAlt+=1;
    if(!firstImgSeen){
     firstImgSeen=true;
     if(getAttr(node,'loading').toLowerCase()==='lazy')firstImageLazy=true;
    }
   }
  }
  const nextHead=inHead||tag==='head';
  for(const child of node.childNodes||[]){
   walk(child,isElement?depth+1:depth,nextHead&&tag!=='body');
  }
 }

 walk(doc,0,false);

 const findings=[];
 if(!hasViewport){
  findings.push({
   code:'MOBILE_VIEWPORT_MISSING',
   severity:'error',
   message:'Missing <meta name="viewport"> tag.',
   recommendation:'Add <meta name="viewport" content="width=device-width, initial-scale=1">.'
  });
 }
 if(firstImageLazy){
  findings.push({
   code:'LCP_FIRST_IMAGE_LAZY',
   severity:'error',
   message:'First <img> element uses loading="lazy", which delays Largest Contentful Paint.',
   recommendation:'Remove loading="lazy" from above-the-fold hero images and consider fetchpriority="high".'
  });
 }
 if(imagesMissingDimensions>0){
  findings.push({
   code:'CLS_IMAGE_MISSING_DIMENSIONS',
   severity:'warning',
   message:`${imagesMissingDimensions} <img> element(s) lack explicit width and height attributes.`,
   recommendation:'Specify width and height attributes (or CSS aspect-ratio) to prevent Cumulative Layout Shift.'
  });
 }
 if(imagesMissingAlt>0){
  findings.push({
   code:'HTML_IMAGE_MISSING_ALT',
   severity:'warning',
   message:`${imagesMissingAlt} <img> element(s) lack an alt attribute.`,
   recommendation:'Provide descriptive alt text (or alt="" for purely decorative images).'
  });
 }
 if(blockingHeadScripts>0){
  findings.push({
   code:'INP_RENDER_BLOCKING_HEAD_SCRIPT',
   severity:'warning',
   message:`${blockingHeadScripts} external <script> tag(s) in <head> lack defer, async, or type="module".`,
   recommendation:'Add defer or async to non-critical head scripts to avoid blocking first paint.'
  });
 }
 if(totalNodes>1500){
  findings.push({
   code:'DOM_EXCESSIVE_NODES',
   severity:'warning',
   message:`DOM contains ${totalNodes} elements (recommended <= 1500).`,
   recommendation:'Simplify wrapper markup or paginate long lists to reduce style/layout cost.'
  });
 }
 if(maxDepth>32){
  findings.push({
   code:'DOM_EXCESSIVE_DEPTH',
   severity:'warning',
   message:`DOM nesting depth is ${maxDepth} levels (recommended <= 32).`,
   recommendation:'Flatten deeply nested layout containers.'
  });
 }

 return {
  ok:findings.every(f=>f.severity!=='error'),
  metrics:{
   totalNodes,
   maxDepth,
   hasViewport,
   imagesTotal,
   imagesMissingDimensions,
   imagesMissingAlt,
   blockingHeadScripts
  },
  findings
 };
}
