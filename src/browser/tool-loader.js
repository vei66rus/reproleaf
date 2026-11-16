export const supportedTools=['ai-crawler','serp-preview','llms-studio','geo-clarity','cocoon-matrix','cocoon-visualizer','hreflang-sitemap','benchmark-leaderboard','gsc-quick-wins','keyword-cleaner','log-bot','eeat','serp-gap','jsonld-schema','social-meta','robots-policy','redirect-chain'];

export async function loadToolModule(toolName){
 switch(toolName){
  case 'robots-policy':
  case 'redirect-chain':
   return import('./tools/policy-trace.js');
  case 'jsonld-schema':
  case 'social-meta':
   return import('./tools/markup-inspector.js');
  case 'gsc-quick-wins':
   return import('./tools/gsc-quick-wins.js');
  case 'keyword-cleaner':
   return import('./tools/keyword-cleaner.js');
  case 'log-bot':
   return import('./tools/log-bot.js');
  case 'eeat':
   return import('./tools/eeat.js');
  case 'serp-gap':
   return import('./tools/serp-gap.js');
  case 'ai-crawler':
   return import('./tools/ai-crawler.js');
  case 'serp-preview':
   return import('./tools/serp-preview.js');
  case 'llms-studio':
   return import('./tools/llms-studio.js');
  case 'geo-clarity':
   return import('./tools/geo-clarity.js');
  case 'cocoon-matrix':
   return import('./tools/cocoon-matrix.js');
  case 'cocoon-visualizer':
   return import('./tools/cocoon-visualizer.js');
  case 'hreflang-sitemap':
   return import('./tools/hreflang-sitemap.js');
  case 'benchmark-leaderboard':
   return import('./tools/benchmark-leaderboard.js');
  default:
   throw Error(`Unknown browser tool: ${toolName}`);
 }
}

export async function mountToolContainers(root=typeof document!=='undefined'?document:null){
 if(!root)return;
 const nodes=[...root.querySelectorAll('[data-reproleaf-tool]')];
 await Promise.all(nodes.map(async node=>{
  const toolName=node.dataset.reproleafTool;
  if(!toolName||node.dataset.reproleafMounted==='1')return;
  node.dataset.reproleafMounted='1';
  try{
   const mod=await loadToolModule(toolName);
   if(typeof mod.mount==='function')mod.mount(node);
  }catch{
   node.dataset.reproleafMounted='error';
   const english=node.dataset.language==='en';
   const status=document.createElement('p');
   status.className='reproleaf-status';status.setAttribute('role','status');
   status.textContent=english?'The tool could not open. Reload the page to try again. No input was sent.':'Не удалось открыть инструмент. Перезагрузите страницу и попробуйте снова. Входные данные не отправлялись.';
   const retry=document.createElement('button');retry.type='button';retry.className='agent-kit-download';retry.textContent=english?'Reload tool':'Перезагрузить инструмент';retry.addEventListener('click',()=>location.reload());
   node.replaceChildren(status,retry);
  }
 }));
}

if(typeof document!=='undefined'){
 if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>{mountToolContainers();},{once:true});
 }else{
  mountToolContainers();
 }
}
