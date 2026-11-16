import {parse,serialize} from 'parse5';

import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export const LIMITS=Object.freeze({bytes:524288,nodes:10000,depth:64,rules:200,pathsPerRule:10,timeoutMs:6000});
const CSP="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'";
const forbidden=new Set(['iframe','frame','frameset','object','embed','portal','fencedframe','base']);
const remove=new Set(['script','link','animate','animatemotion','animatetransform','set','discard']);
const resourceAttrs=new Set(['src','srcset','poster','background','action','formaction','ping','manifest','data','codebase']);
const sourcePath=new URL(import.meta.resolve('axe-core/axe.min.js')),source=await readFile(sourcePath,'utf8'),pkg=JSON.parse(await readFile(new URL('./package.json',sourcePath),'utf8'));
if(pkg.version!=='4.14.0'||pkg.license!=='MPL-2.0')throw Error('AXE_DEPENDENCY_DRIFT');
const sourceSha256=createHash('sha256').update(source).digest('hex');
if(sourceSha256!=='20c09fe157a8a34a30e241aaa1fcdade657734f08ab379ecfbeb7d45cc46e878')throw Error('AXE_SOURCE_HASH_DRIFT');
const locales={en:null,ru:JSON.parse(await readFile(new URL('./locales/ru.json',sourcePath),'utf8'))};
const delegated=[{axeRule:'document-title',existingRule:'html-audit:title-not-provided'},{axeRule:'image-alt',existingRule:'dom-perf:HTML_IMAGE_MISSING_ALT'}];

export function prepareOfflineHtml(html){
 if(typeof html!=='string'||!html.trim())throw Error('AXE_HTML_EMPTY');
 const bytes=new TextEncoder().encode(html).length;if(bytes>LIMITS.bytes)throw Error('AXE_HTML_BYTES');
 if((html.match(/</g)||[]).length>LIMITS.nodes)throw Error('AXE_HTML_COMPLEX');
 const document=parse(html),stack=[[document,0]],transforms={scriptOrResourceElementsRemoved:0,eventAttributesRemoved:0,resourceAttributesRemoved:0,hrefsNeutralized:0,cspMetaRemoved:0,inlineStyleElements:0,inlineStyleAttributes:0};let nodes=0;
 while(stack.length){
  const [node,depth]=stack.pop();if(++nodes>LIMITS.nodes||depth>LIMITS.depth)throw Error('AXE_HTML_COMPLEX');
  const tag=(node.tagName||'').toLowerCase(),attrs=node.attrs||[],map=new Map(attrs.map(attr=>[attr.name.toLowerCase(),attr.value]));
  if(forbidden.has(tag)||map.has('srcdoc')||(tag==='template'&&map.has('shadowrootmode')))throw Error('AXE_EMBEDDED_DOCUMENT_UNSUPPORTED');
  if(tag==='meta'&&(map.get('http-equiv')||'').trim().toLowerCase()==='refresh')throw Error('AXE_REFRESH_UNSUPPORTED');
  if(tag==='style')transforms.inlineStyleElements++;
  if(map.has('style'))transforms.inlineStyleAttributes++;
  node.attrs=attrs.filter(attr=>{const name=attr.name.toLowerCase();if(name.startsWith('on')){transforms.eventAttributesRemoved++;return false;}if(resourceAttrs.has(name)){transforms.resourceAttributesRemoved++;return false;}return true;}).map(attr=>{const name=attr.name.toLowerCase();if(name==='href'){transforms.hrefsNeutralized++;return {...attr,value:attr.value.startsWith('#')?attr.value:'#offline-link'};}return attr;});
  if(node.childNodes){node.childNodes=node.childNodes.filter(child=>{const tag=(child.tagName||'').toLowerCase();if(remove.has(tag)||tag.startsWith('animate')){transforms.scriptOrResourceElementsRemoved++;return false;}if(tag==='meta'&&(child.attrs||[]).some(attr=>attr.name==='http-equiv'&&attr.value.trim().toLowerCase()==='content-security-policy')){transforms.cspMetaRemoved++;return false;}return true;});for(let i=node.childNodes.length-1;i>=0;i--)stack.push([node.childNodes[i],depth+1]);}
  if(node.content)stack.push([node.content,depth+1]);
 }
 const htmlNode=document.childNodes.find(node=>node.tagName==='html'),head=htmlNode?.childNodes.find(node=>node.tagName==='head');if(!head)throw Error('AXE_HTML_STRUCTURE');
 head.childNodes.unshift({nodeName:'meta',tagName:'meta',namespaceURI:'http://www.w3.org/1999/xhtml',attrs:[{name:'http-equiv',value:'Content-Security-Policy'},{name:'content',value:CSP}],childNodes:[],parentNode:head});
 return {html:serialize(document),bytes,nodes,transforms};
}

async function withDeadline(promise,timeoutMs,onTimeout){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>{void onTimeout?.();reject(Error('AXE_WALL_TIMEOUT'));},timeoutMs);})]);}finally{clearTimeout(timer);}}

export async function inspectOfflineHtml({html,locale='en',timeoutMs=LIMITS.timeoutMs,width=1280,height=900,onBrowserProcess}={}){
 if(!Object.hasOwn(locales,locale))throw Error('AXE_LOCALE');if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('AXE_TIMEOUT_OPTION');
 if(!Number.isSafeInteger(width)||width<320||width>1920||!Number.isSafeInteger(height)||height<320||height>1200)throw Error('AXE_VIEWPORT');
 const prepared=prepareOfflineHtml(html);let chromium;try{({chromium}=await import('playwright'));}catch{throw Error('AXE_BROWSER_UNAVAILABLE');}
 let server;try{server=await chromium.launchServer({headless:true,host:'127.0.0.1',...(process.env.REPROLEAF_BROWSER_EXECUTABLE?{executablePath:process.env.REPROLEAF_BROWSER_EXECUTABLE}:{}),timeout:10000,args:['--dns-prefetch-disable','--disable-background-networking']});}catch{throw Error('AXE_BROWSER_UNAVAILABLE');}let browser,context,page;
 onBrowserProcess?.(server.process().pid);
 let requestAttempts=0,navigationEvents=0;
 try{
  const started=performance.now();
  const packet=await withDeadline((async()=>{
   browser=await chromium.connect(server.wsEndpoint(),{timeout:5000});
   context=await browser.newContext({javaScriptEnabled:true,serviceWorkers:'block',acceptDownloads:false,viewport:{width,height}});
   await context.route('**/*',route=>{requestAttempts++;return route.abort('blockedbyclient');});page=await context.newPage();
   page.on('framenavigated',frame=>{if(frame===page.mainFrame()&&frame.url()!=='about:blank')navigationEvents++;});
   await page.setContent(prepared.html,{waitUntil:'domcontentloaded',timeout:Math.max(1,timeoutMs)});
   const session=await context.newCDPSession(page),tree=await session.send('Page.getFrameTree'),world=await session.send('Page.createIsolatedWorld',{frameId:tree.frameTree.frame.id,worldName:'ReproleafOfflineAxe'});
   const injected=await session.send('Runtime.evaluate',{expression:source,contextId:world.executionContextId,returnByValue:true,timeout:Math.max(1,timeoutMs)});if(injected.exceptionDetails)throw Error('AXE_INJECTION_FAILED');
   const options={runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']},rules:Object.fromEntries(delegated.map(item=>[item.axeRule,{enabled:false}])),iframes:false,elementRef:true,selectors:false,preload:false};
   const expression=`(async()=>{if(${JSON.stringify(locales[locale])})axe.configure({locale:${JSON.stringify(locales[locale])}});const result=await axe.run(document,${JSON.stringify(options)});const pathOf=node=>{if(!node||node.nodeType!==1)return null;const parts=[];while(node&&node!==document.documentElement&&parts.length<64){const parent=node.parentElement;if(!parent)return null;parts.push('*:nth-child('+(Array.prototype.indexOf.call(parent.children,node)+1)+')');node=parent;}return node===document.documentElement?'html'+(parts.length?' > '+parts.reverse().join(' > '):''):null;};const group=key=>result[key].map(rule=>({id:rule.id,impact:rule.impact??null,help:rule.help,description:rule.description,helpUrl:rule.helpUrl,tags:rule.tags,affectedNodes:rule.nodes.length,paths:rule.nodes.slice(0,${LIMITS.pathsPerRule}).map(node=>pathOf(node.element)),pathsTruncated:rule.nodes.length>${LIMITS.pathsPerRule}}));return {engineVersion:result.testEngine.version,violations:group('violations'),incomplete:group('incomplete'),passes:result.passes.map(rule=>({id:rule.id,nodes:rule.nodes.length})),inapplicable:result.inapplicable.map(rule=>rule.id)};})()`;
   const response=await session.send('Runtime.evaluate',{expression,contextId:world.executionContextId,awaitPromise:true,returnByValue:true,timeout:Math.max(1,timeoutMs)});if(response.exceptionDetails||!response.result.value)throw Error('AXE_RUN_FAILED');
   const signals=await page.evaluate(()=>({attackExecuted:window.__untrustedExecuted??null,scriptElements:document.scripts.length,handlerAttributes:Array.from(document.querySelectorAll('*')).reduce((n,node)=>n+Array.from(node.attributes).filter(attr=>attr.name.toLowerCase().startsWith('on')).length,0)}));return {result:response.result.value,signals};
  })(),timeoutMs,()=>server.kill().catch(()=>{}));
  const {result,signals}=packet;
  if(signals.attackExecuted!==null||signals.scriptElements!==0||signals.handlerAttributes!==0||navigationEvents!==0)throw Error('AXE_ISOLATION_FAILED');
  return {schemaVersion:1,status:'completed-transformed-static-dom',engine:{name:'axe-core',version:pkg.version,license:pkg.license,sourceSha256},locale,environment:{browser:browser.version(),node:process.version,platform:process.platform,viewport:{width,height}},summary:{violationRules:result.violations.length,violatingNodes:result.violations.reduce((n,rule)=>n+rule.affectedNodes,0),incompleteRules:result.incomplete.length,passedRuleObservations:result.passes.length,inapplicableRules:result.inapplicable.length},violations:result.violations.slice(0,LIMITS.rules),incomplete:result.incomplete.slice(0,LIMITS.rules),passes:result.passes.slice(0,LIMITS.rules),inapplicable:result.inapplicable.slice(0,LIMITS.rules),rulesTruncated:result.violations.length>LIMITS.rules||result.incomplete.length>LIMITS.rules||result.passes.length>LIMITS.rules||result.inapplicable.length>LIMITS.rules,scope:{rawHtmlIncluded:false,rawSelectorsIncluded:false,nodePaths:'Positional paths refer to the sanitized static DOM, not original source line numbers.',originalSiteConformanceEstablished:false,externalCssAndJsLoaded:false,fontsAndImagesLoaded:false,inlineCssPreserved:true,javascriptEnabled:true,executionPolicy:'Active HTML removed before first parse; CSP script-src none; trusted axe executes only through DevTools isolated world. This is not the JavaScript-disabled mode, which cannot settle axe.run.',networkPolicy:'Browser context requests aborted before setContent; resource URLs removed or neutralized; CSP default-src none; no supplied URL is navigated. This is not operating-system network isolation.',osNetworkIsolationEstablished:false,requestAttemptsBlocked:requestAttempts,navigationEvents,sanitization:prepared.transforms,delegatedChecks:delegated,limits:LIMITS,elapsedMs:Math.round(performance.now()-started),limitsText:'Automated results on transformed static HTML only. Original external CSS, images, fonts, scripts, embedded documents and dynamic states are not assessed. Incomplete checks require review; zero violations does not establish WCAG compliance.'},isolationSignals:signals};
 }catch(error){throw Error(['AXE_WALL_TIMEOUT','AXE_INJECTION_FAILED','AXE_RUN_FAILED','AXE_ISOLATION_FAILED'].includes(error.message)?error.message:'AXE_EXECUTION_FAILED');}
 finally{await server.kill();if(server.process().exitCode===null&&server.process().signalCode===null)throw Error('AXE_CLEANUP_FAILED');onBrowserProcess?.(null);}
}

