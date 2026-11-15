export const supportedTools=['ai-crawler','serp-preview','llms-studio','geo-clarity','cocoon-matrix','cocoon-visualizer','hreflang-sitemap','benchmark-leaderboard'];

export async function loadToolModule(toolName){
 switch(toolName){
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
