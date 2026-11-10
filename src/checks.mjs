const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function frame(page,selector){return page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;const hit=document.elementFromPoint(x,y);return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,viewport:{width:innerWidth,height:innerHeight},topmost:!!hit&&(el===hit||el.contains(hit))};});}
async function touch(page,{x,y,dy}){
 const session=await page.context().newCDPSession(page);
 try{
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1,radiusX:3,radiusY:3,force:1}]});
  for(let i=1;i<=16;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy*i/16,id:1,radiusX:3,radiusY:3,force:1}]});await pause(20);}
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await pause(350);
 }finally{await session.detach();}
}
export const checks={
 'heading-grid-overflow':async page=>{
  const observations=await page.evaluate(()=>({layoutWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,visualWidth:visualViewport?.width,innerWidth}));
  return {passed:observations.scrollWidth<=observations.layoutWidth+1,observations};
 },
 'modal-close-unreachable':async page=>{
  await page.locator('[data-open]').click();
  const scroller=page.locator('[data-scroll]');
  await scroller.evaluate(el=>el.scrollTop=el.scrollHeight);
  await pause(100);
  const scroll=await scroller.evaluate(el=>({top:el.scrollTop,max:el.scrollHeight-el.clientHeight}));
  if(scroll.max<150||Math.abs(scroll.top-scroll.max)>2)throw Error('Setup did not reach the end of long modal content');
  const end=await frame(page,'[data-scroll] p:last-child');
  const endVisible=end.top>=0&&end.bottom<=end.viewport.height;
  const close=await frame(page,'[data-close]');
  const reachable=close.top>=0&&close.bottom<=close.viewport.height&&close.topmost;
  if(reachable)await page.mouse.click(close.left+close.width/2,close.top+close.height/2);
  const closed=await page.locator('[role=dialog]').count()===0;
  return {passed:endVisible&&reachable&&closed,observations:{scroll,end,endVisible,close,closed}};
 },
 'nested-scroll-trap':async page=>{
  await page.locator('[data-panel]').evaluate(el=>{window.scrollTo(0,el.getBoundingClientRect().top+scrollY-90);el.scrollTop=0;});
  await pause(150);
  const panel=await frame(page,'[data-panel]');
  const before=await page.evaluate(()=>scrollY);
  if(before<250)throw Error('Setup did not reach the nested panel');
  await touch(page,{x:panel.left+panel.width/2,y:panel.top+80,dy:180});
  const after=await page.evaluate(()=>scrollY);
  const panelTop=await page.locator('[data-panel]').evaluate(el=>el.scrollTop);
  return {passed:before-after>50,observations:{before,after,delta:after-before,panelTop,input:'CDP touch sequence'}};
 },
 'canvas-resize-gap':async page=>{
  await page.setViewportSize({width:page.viewportSize().width,height:Math.max(900,page.viewportSize().height+180)});
  await pause(200);
  const canvas=await frame(page,'canvas');
  const drawing=await page.locator('canvas').evaluate(el=>({width:el.width,height:el.height}));
  const bottomHit=await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight-2)?.tagName==='CANVAS');
  return {passed:canvas.left<=1&&canvas.top<=1&&canvas.right>=canvas.viewport.width-1&&canvas.bottom>=canvas.viewport.height-1&&drawing.height===Math.round(canvas.height)&&drawing.width===Math.round(canvas.width)&&bottomHit,observations:{canvas,drawing,bottomHit,input:'Height-only Playwright viewport resize; not native browser bars'}};
 },
 'canvas-touch-trap':async page=>{
  await page.locator('canvas').evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+scrollY-110));
  await pause(150);
  const canvas=await frame(page,'canvas'),before=await page.evaluate(()=>scrollY);
  const scoreBefore=await page.locator('[data-score]').textContent();
  await page.touchscreen.tap(canvas.left+canvas.width/2,canvas.top+165);
  const scoreAfter=await page.locator('[data-score]').textContent();
  const tapWorks=scoreBefore!==scoreAfter;
  if(before<250)throw Error('Setup did not reach the embedded game');
  await touch(page,{x:canvas.left+canvas.width/2,y:canvas.top+200,dy:-170});
  const after=await page.evaluate(()=>scrollY);
  return {passed:tapWorks&&after-before>50,observations:{before,after,delta:after-before,tapWorks,scoreBefore,scoreAfter,input:'CDP touch sequence on real Phaser canvas'}};
 },
 'menu-under-overlay':async page=>{
  await page.locator('[data-open]').click();
  const link=await frame(page,'[data-menu-link]');
  await page.mouse.click(link.left+link.width/2,link.top+link.height/2);
  const activated=await page.locator('#result').textContent()==='Navigation activated';
  return {passed:link.topmost&&activated,observations:{link,activated}};
 },
 'sticky-bar-focus-occlusion':async page=>{
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.locator('[data-order-note]').evaluate(el=>{el.scrollIntoView({block:'nearest'});el.focus();});
  await pause(100);
  const field=await frame(page,'[data-order-note]');
  const stickyBar=await frame(page,'[data-sticky-bar]');
  const focused=await page.locator('[data-order-note]').evaluate(el=>document.activeElement===el);
  const visibleInViewport=field.top>=0&&field.bottom<=field.viewport.height;
  let typedValue='';
  if(field.topmost&&visibleInViewport){
   await page.mouse.click(field.left+field.width/2,field.top+field.height/2);
   await page.keyboard.type('Gate 4');
   typedValue=await page.locator('[data-order-note]').inputValue();
  }
  return {passed:visibleInViewport&&field.topmost&&focused&&typedValue==='Gate 4',observations:{field,stickyBar,focused,visibleInViewport,typedValue}};
 },
 'async-submit-double-fire':async page=>{
  const btn=await frame(page,'[data-submit]');
  const centerX=btn.left+btn.width/2,centerY=btn.top+btn.height/2;
  await page.mouse.click(centerX,centerY);
  await pause(30);
  const busyState=await page.evaluate(()=>{
   const button=document.querySelector('[data-submit]'),form=button?.closest('form');
   return {disabled:Boolean(button?.disabled),ariaBusy:form?.getAttribute('aria-busy')==='true'};
  });
  await page.mouse.click(centerX,centerY);
  await pause(260);
  const submissions=Number(await page.locator('[data-submissions]').textContent());
  const guarded=busyState.disabled||busyState.ariaBusy;
  return {passed:guarded&&submissions===1,observations:{busyState,submissions,guarded}};
 },
 'ssr-disclosure-hydration-reset':async page=>{
  await page.locator('[data-disclosure-trigger]').click();
  const expandedBefore=await page.locator('[data-disclosure-trigger]').getAttribute('aria-expanded')==='true';
  await page.evaluate(()=>window.dispatchEvent(new Event('reproleaf:hydrate')));
  await pause(50);
  const expandedAfter=await page.locator('[data-disclosure-trigger]').getAttribute('aria-expanded')==='true';
  const panel=await frame(page,'[data-disclosure-panel]');
  const panelVisible=panel.width>0&&panel.height>0&&panel.topmost;
  return {passed:expandedBefore&&expandedAfter&&panelVisible,observations:{expandedBefore,expandedAfter,panel,panelVisible}};
 }
};
