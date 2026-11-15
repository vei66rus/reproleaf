import {auditRawVsRenderedHtml} from './hydration-diff-audit.mjs';
import {assertSafePublicUrl} from './network-guard.mjs';

async function loadPlaywright(){
 try{
  return await import('playwright');
 }catch(error){
  throw Error('--render-js requires playwright. Install it with: npm install playwright',{cause:error});
 }
}

async function createPlaywrightRenderer({timeoutMs=15000,lookupAll,requireOrigin=null}={}){
 const {chromium}=await loadPlaywright();
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({javaScriptEnabled:true});

 return {
  async render(url){
   const page=await context.newPage();
   try{
    await page.route('**/*',async route=>{
     const req=route.request();
     if(req.resourceType()==='websocket'){
      await route.abort();
      return;
     }
     try{
      await assertSafePublicUrl(req.url(),{lookupAll,requireOrigin});
      await route.continue();
     }catch{
      await route.abort();
     }
    });
    await page.goto(url,{waitUntil:'networkidle',timeout:timeoutMs});
    return await page.content();
   }finally{
    await page.close();
   }
  },
  async close(){
   await context.close();
   await browser.close();
  }
 };
}

export async function renderAndDiffCrawlPages(pages,{
 maxRenderPages=25,
 timeoutMs=15000,
 lookupAll,
 requireOrigin=null,
 renderer=null
}={}){
 const candidates=pages
  .filter(p=>p.status>=200&&p.status<300&&typeof p.html==='string'&&p.html.trim().length>0)
  .slice(0,maxRenderPages);

 const activeRenderer=renderer||(await createPlaywrightRenderer({timeoutMs,lookupAll,requireOrigin}));
 const shouldClose=!renderer&&typeof activeRenderer.close==='function';

 const results=[];
 const allFindings=[];
 let renderedCount=0;
 let failedRenderCount=0;

 try{
  for(const page of candidates){
   const targetUrl=page.finalUrl||page.url;
   try{
    const renderedHtml=await activeRenderer.render(targetUrl);
    renderedCount+=1;
    const diff=auditRawVsRenderedHtml({rawHtml:page.html.slice(0,1000000),renderedHtml:String(renderedHtml||'').slice(0,1000000),url:targetUrl});
    results.push({
     url:targetUrl,
     ok:diff.ok,
     raw:diff.raw,
     rendered:diff.rendered,
     summary:diff.summary,
     findings:diff.findings
    });
    for(const f of diff.findings){
     allFindings.push({...f,url:targetUrl});
    }
   }catch(err){
    failedRenderCount+=1;
    allFindings.push({
     code:'RENDER_JS_FAILED',
     severity:'warning',
     url:targetUrl,
     message:`Playwright render failed: ${err.message}`
    });
   }
  }
 }finally{
  if(shouldClose)await activeRenderer.close();
 }

 const errors=allFindings.filter(f=>f.severity==='error').length;
 const warnings=allFindings.filter(f=>f.severity==='warning').length;

 return {
  ok:errors===0,
  summary:{
   candidateCount:candidates.length,
   renderedCount,
   failedRenderCount,
   errors,
   warnings
  },
  pages:results,
  findings:allFindings
 };
}
