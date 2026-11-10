// Only serializable DOM observations. No variant flags or application internals.
export async function inspectPage(page,check){
 const result=await page.evaluate(check=>{
  function problem(status,reason){return {status,reason};}
  function select(selector){
   let matches;try{matches=document.querySelectorAll(selector);}catch{return problem('setup-error','invalid-selector');}
   if(matches.length===0)return problem('setup-error','selector-not-found');
   if(matches.length!==1)return problem('unsupported','ambiguous-selector');
   const element=matches[0];
   if(['IFRAME','FRAME'].includes(element.tagName)||element.shadowRoot)return problem('unsupported','frame-or-shadow-boundary');
   return {element};
  }
  const v=visualViewport;
  const viewport={left:v?.offsetLeft||0,top:v?.offsetTop||0,right:(v?.offsetLeft||0)+(v?.width||innerWidth),bottom:(v?.offsetTop||0)+(v?.height||innerHeight)};
  function geometry(element){
   const rect=element.getBoundingClientRect();let clip={...viewport};const clipping=[];
   const rootStyle=getComputedStyle(document.documentElement),bodyStyle=document.body?getComputedStyle(document.body):null;
   // CSS Overflow 3 §3.1.1: root overflow, and sometimes body overflow,
   // applies to the viewport rather than the body's (possibly zero-height) box.
   const bodyPropagates=rootStyle.overflowX==='visible'&&rootStyle.overflowY==='visible'&&rootStyle.contain==='none'&&bodyStyle?.contain==='none'&&bodyStyle.display!=='none';
   for(let p=element.parentElement;p;p=p.parentElement){
    if(p===document.documentElement||(p===document.body&&bodyPropagates))continue;
    const style=getComputedStyle(p),r=p.getBoundingClientRect();
    const boundary={left:r.left+p.clientLeft,top:r.top+p.clientTop,right:r.left+p.clientLeft+p.clientWidth,bottom:r.top+p.clientTop+p.clientHeight};
    if(/hidden|clip|scroll|auto/.test(style.overflowX)){clip.left=Math.max(clip.left,boundary.left);clip.right=Math.min(clip.right,boundary.right);clipping.push({axis:'x',tag:p.tagName});}
    if(/hidden|clip|scroll|auto/.test(style.overflowY)){clip.top=Math.max(clip.top,boundary.top);clip.bottom=Math.min(clip.bottom,boundary.bottom);clipping.push({axis:'y',tag:p.tagName});}
   }
   const css=getComputedStyle(element),center={x:rect.left+rect.width/2,y:rect.top+rect.height/2};
   const hit=document.elementFromPoint(center.x,center.y);
   const displayed=element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
   return {rect:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height},clip,clipping,displayed,fullyVisible:displayed&&rect.width>0&&rect.height>0&&rect.left>=clip.left-1&&rect.top>=clip.top-1&&rect.right<=clip.right+1&&rect.bottom<=clip.bottom+1,centerHit:!!hit&&(hit===element||element.contains(hit)),pointerEvents:css.pointerEvents};
  }
  function control(selector){const selected=select(selector);if(!selected.element)return selected;const element=selected.element,g=geometry(element),disabled=element.matches(':disabled')||element.getAttribute('aria-disabled')==='true';return {status:g.fullyVisible&&g.centerHit&&!disabled?'pass':'fail',observations:{...g,disabled},scope:'Reachability at the center only; no keyboard, full hit-area or functional activation guarantee.'};}
  if(check.type==='control')return control(check.selector);
  if(check.type==='document-overflow'){
   if(check.intentionalHorizontalScroll)return problem('unsupported','intentional-horizontal-document-scroll');
   const width=document.documentElement.clientWidth,scrollWidth=document.documentElement.scrollWidth;
   return {status:scrollWidth<=width+1?'pass':'fail',observations:{width,scrollWidth},scope:'Horizontal document overflow only; intentional scrolling must be declared.'};
  }
  if(check.type==='canvas-coverage'){
   const c=select(check.selector),h=select(check.host);if(!c.element)return c;if(!h.element)return h;
   if(c.element.tagName!=='CANVAS')return problem('setup-error','selector-is-not-canvas');
   if(c.element===h.element||!h.element.contains(c.element))return problem('setup-error','host-must-be-a-distinct-canvas-ancestor');
   const canvas=geometry(c.element),host=h.element.getBoundingClientRect();
   if(host.width<=0||host.height<=0||canvas.rect.width<=0||canvas.rect.height<=0)return problem('unsupported','zero-sized-render-host');
   const covers=canvas.displayed&&canvas.rect.left<=host.left+1&&canvas.rect.top<=host.top+1&&canvas.rect.right>=host.right-1&&canvas.rect.bottom>=host.bottom-1;
   const drawing={width:c.element.width,height:c.element.height};
   const bufferMatches=check.renderScale===undefined?null:Math.abs(drawing.width-Math.round(canvas.rect.width*check.renderScale))<=1&&Math.abs(drawing.height-Math.round(canvas.rect.height*check.renderScale))<=1;
   return {status:covers&&bufferMatches!==false?'pass':'fail',observations:{canvas,host:{left:host.left,top:host.top,width:host.width,height:host.height},drawing,renderScale:check.renderScale??null,bufferMatches,covers},scope:'Canvas element and optional buffer geometry only; no claim about camera aspect, pixels, WebGL success or native browser bars.'};
  }
  if(check.type==='readable-tail'){
   const scroll=select(check.selector),tail=select(check.tail);if(!scroll.element)return scroll;if(!tail.element)return tail;
   if(!scroll.element.contains(tail.element))return problem('setup-error','tail-is-outside-scroll-host');
   const end=geometry(tail.element),close=control(check.close),el=scroll.element;
   const atEnd=Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop)<=2;
   return {status:end.fullyVisible&&close.status==='pass'&&atEnd?'pass':close.status==='unsupported'||close.status==='setup-error'?close.status:'fail',observations:{tail:end,close,atEnd,scrollTop:el.scrollTop,scrollMaximum:el.scrollHeight-el.clientHeight},scope:'End-marker visibility and close-control reachability after explicit scrolling, not full modal accessibility.'};
  }
  if(check.type==='focus-occlusion'){
   const selected=select(check.selector);if(!selected.element)return selected;
   const element=selected.element;
   element.scrollIntoView({block:'nearest'});
   element.focus();
   const g=geometry(element),focused=document.activeElement===element,disabled=element.matches(':disabled')||element.getAttribute('aria-disabled')==='true';
   return {status:g.fullyVisible&&g.centerHit&&focused&&!disabled?'pass':'fail',observations:{...g,focused,disabled},scope:'Focused target visibility and center hit-target check after scrollIntoView; does not measure native OS virtual keyboard height.'};
  }
  return problem('unsupported','unknown-check');
 },check);
 if(check.type==='readable-tail'&&result.status==='pass'&&result.observations.scrollMaximum>2){
  const element=page.locator(check.selector),box=await element.boundingBox();
  if(!box)return {...result,status:'fail',reason:'scroll-host-not-visible'};
  const before=await element.evaluate(el=>el.scrollTop);
  await page.mouse.move(box.x+box.width/2,Math.max(1,Math.min(page.viewportSize().height-2,box.y+box.height/2)));
  await page.mouse.wheel(0,-120);await page.waitForTimeout(200);
  const after=await element.evaluate(el=>el.scrollTop);
  if(before-after<=2)return {...result,status:'fail',reason:'scroll-host-does-not-respond-to-wheel',observations:{...result.observations,userInput:{kind:'browser-injected wheel',before,after}}};
  await page.mouse.wheel(0,result.observations.scrollMaximum+200);await page.waitForTimeout(200);
  const final=await element.evaluate(el=>({top:el.scrollTop,max:el.scrollHeight-el.clientHeight}));
  return {...result,status:Math.abs(final.top-final.max)<=2?'pass':'fail',observations:{...result.observations,userInput:{kind:'browser-injected wheel; not a touch/device claim',before,after,final}}};
 }
 return result;
}
