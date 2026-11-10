import {z} from 'zod';

const categories=['scroll','overlay','viewport','overflow','focus','forms','hydration'];
const renderModes=['csr','ssr','ssg','hybrid','islands','unknown'];
const forbiddenKeys=new Set(['__proto__','constructor','prototype','toString','valueOf','hasOwnProperty']);
const safeHttpUrl=z.string().url().max(2048).refine(value=>{
 try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}
},'Use an HTTP(S) URL without embedded credentials');

const dependenciesSchema=z.record(z.string().max(120),z.string().max(80)).refine(obj=>Object.keys(obj).length<=150&&Object.keys(obj).every(k=>!forbiddenKeys.has(k)),'Invalid or too many dependencies');
const applicationSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),label:z.string().max(100).optional(),stack:z.string().max(80).optional(),dependencies:dependenciesSchema.optional(),renderMode:z.enum(renderModes).optional()}).strict();
export const diagnoseSchema=z.object({
 stack:z.string().max(80).optional(),
 dependencies:dependenciesSchema.optional(),
 applications:z.array(applicationSchema).min(1).max(20).refine(apps=>new Set(apps.map(a=>a.id)).size===apps.length,'Application IDs must be unique').optional(),
 activeApplication:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(),
 interaction:z.object({canvasOwnsPageNavigation:z.boolean().optional(),hydratesServerHtml:z.boolean().optional()}).strict().optional(),
 renderMode:z.enum(renderModes).default('unknown'),
 symptom:z.string().max(600).optional(),
 category:z.enum(categories).optional(),
 targetUrl:safeHttpUrl.optional()
}).strict();

const tokenize=value=>[...new Set((String(value??'').toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}-]{3,}/gu)||[]))];

function detectEnvironment(input){
 const deps=input.dependencies||{};
 const depNames=Object.keys(deps).map(k=>k.toLowerCase());
 const rawStack=(input.stack||'').toLowerCase();
 const frameworks=new Set();
 if(rawStack){
  for(const token of tokenize(rawStack)){
   if(['react','nextjs','next'].includes(token))frameworks.add('react');
   else if(['vue','nuxt'].includes(token))frameworks.add('vue');
   else if(['three','threejs','webgl'].includes(token))frameworks.add('three');
   else if(['phaser'].includes(token))frameworks.add('phaser');
   else if(['html','vanilla','css','astro','svelte','wordpress'].includes(token))frameworks.add('html');
  }
 }
 if(depNames.some(d=>d==='react'||d==='react-dom'||d==='next'))frameworks.add('react');
 if(depNames.some(d=>d==='vue'||d==='nuxt'))frameworks.add('vue');
 if(depNames.some(d=>d==='three'||d.startsWith('@react-three/')))frameworks.add('three');
 if(depNames.some(d=>d==='phaser'))frameworks.add('phaser');
 frameworks.add('html');

 let inferredRenderMode=input.renderMode||'unknown';
 let renderModeSource=inferredRenderMode==='unknown'?'insufficient-metadata':'declared';
 let possibleRenderModes=[];
 const warnings=[];
 if(inferredRenderMode==='unknown'){
  if(depNames.filter(d=>['astro','next','nuxt','@sveltejs/kit'].includes(d)).length>1){possibleRenderModes=['csr','ssr','ssg','hybrid','islands'];warnings.push('Multiple rendering frameworks may describe different applications. Supply separate applications and select the active one.');}
  else if(/\bwordpress\b/i.test(rawStack)){possibleRenderModes=['ssr','hybrid'];warnings.push('JavaScript dependencies do not describe the WordPress server template. Declare the target route rendering mode.');}
  else if(depNames.includes('astro')){inferredRenderMode='islands';renderModeSource='framework-architecture';possibleRenderModes=['ssg','ssr','islands'];warnings.push('Astro metadata identifies an islands-capable architecture, not the rendering configuration of this route.');}
  else if(depNames.some(d=>['next','nuxt','@sveltejs/kit'].includes(d))){possibleRenderModes=['csr','ssr','ssg','hybrid'];warnings.push('Framework dependencies do not establish whether this route is server-rendered, generated or client-only.');}
  else warnings.push('Rendering mode is unknown: dependencies and symptom words alone are insufficient evidence.');
 }
 const notableVersions={};
 for(const key of ['react','react-dom','next','vue','nuxt','astro','three','phaser','svelte']){
  if(Object.hasOwn(deps,key))notableVersions[key]=deps[key];
 }
 return {
  declaredStack:input.stack||null,
  inferredStacks:[...frameworks],
  renderMode:inferredRenderMode,
  renderModeSource,
  possibleRenderModes,
  warnings,
  notableVersions
 };
}

function adapterCheckForRule(item){
 const checkType=item.adapterCheckType||'control';
 if(checkType==='document-overflow')return {id:`${item.id}-overflow`,type:'document-overflow'};
 if(checkType==='focus-occlusion')return {id:`${item.id}-focus`,type:'focus-occlusion',selector:'input, textarea, select, [data-order-note]'};
 if(checkType==='readable-tail')return {id:`${item.id}-tail`,type:'readable-tail',selector:'[data-scroll]',tail:'[data-scroll] > :last-child',close:'[data-close]'};
 if(checkType==='canvas-coverage')return {id:`${item.id}-canvas`,type:'canvas-coverage',selector:'canvas',host:'.scene-host'};
 return {id:`${item.id}-control`,type:'control',selector:'button, a[href], [role="button"]'};
}

export function diagnoseProjectWithCatalog(rawInput={},catalog){
 let input=diagnoseSchema.parse(rawInput);
 if(input.activeApplication&&!input.applications)throw Error('activeApplication requires application metadata.');
 let selectedApplication=null;
 if(input.applications){
  const apps=input.applications;
  if(apps.reduce((n,a)=>n+Object.keys(a.dependencies||{}).length,0)>300)throw Error('Application metadata exceeds the combined dependency limit.');
  if(input.stack!==undefined||input.dependencies!==undefined||input.renderMode!=='unknown')throw Error('Supply stack, dependencies and render mode inside the selected application; do not merge root and application metadata.');
  selectedApplication=input.activeApplication|| (apps.length===1?apps[0].id:null);
  if(!selectedApplication)return {schemaVersion:1,kind:'project-diagnosis',status:'needs-application-selection',environment:null,matchedRules:[],adapterTemplate:null,applications:apps.map(a=>({id:a.id,label:a.label||a.id,environment:detectEnvironment(a)})),nextAction:'Choose activeApplication from the supplied application IDs. No application or merged dependency set has been selected.',limits:['Only supplied application metadata was inspected; no repository files were read and no checks were executed.']};
  const app=apps.find(a=>a.id===selectedApplication);if(!app)throw Error('Unknown activeApplication.');
  input={...input,stack:app.stack,dependencies:app.dependencies,renderMode:app.renderMode||'unknown'};
 }
 const env=detectEnvironment(input);
 const symptomTokens=tokenize(input.symptom||'');

 const scored=catalog.cases.map(item=>{
  let score=0;
  const matchReasons=[];
  if(input.category&&item.category===input.category){
   score+=5;
   matchReasons.push(`Matches requested failure category (${item.category}).`);
  }
  if(env.inferredStacks.includes(item.stack)){
   if(item.stack!=='html'){
    score+=3;
    matchReasons.push(`Matches project dependency or stack (${item.stack}).`);
   }else{
    score+=1;
    matchReasons.push('Universal DOM/CSS rule applicable across stacks.');
   }
  }
  if(['ssr','ssg','hybrid','islands'].includes(env.renderMode)&&item.category==='hydration'){
   score+=3;
   matchReasons.push(`Relevant to ${env.renderMode.toUpperCase()} / deferred hydration lifecycle.`);
  }
  if(symptomTokens.length){
   const hay=tokenize([item.id,item.title,item.symptom,item.category,item.applicability,...(item.labels||[]),...(item.preconditions||[])].join(' '));
   const shared=symptomTokens.filter(t=>hay.some(h=>h===t||(t.length>=4&&h.includes(t))||(h.length>=4&&t.includes(h))));
   if(shared.length){
    score+=shared.length*2;
    matchReasons.push(`Symptom terms overlap (${shared.slice(0,6).join(', ')}).`);
   }
  }
  if(!input.category&&!symptomTokens.length&&score===0){
   score=1;
   matchReasons.push('Included from baseline mobile web verification corpus.');
  }
  return {item,score,matchReasons};
 }).filter(entry=>entry.score>0 && !(entry.item.id==='canvas-touch-trap'&&input.interaction?.canvasOwnsPageNavigation===false) && !(entry.item.category==='hydration'&&input.interaction?.hydratesServerHtml===false)).sort((a,b)=>b.score-a.score||a.item.id.localeCompare(b.item.id));

 const selected=scored.slice(0,6);

 const matchedRules=selected.map(({item,score,matchReasons})=>({
  id:item.id,
  title:item.title,
  stack:item.stack,
  category:item.category,
  score,
  applicabilityStatus:'requires-precondition-check',
  verificationStatus:'not-run',
  matchReasons,
  symptom:item.symptom,
  applicability:item.applicability||'Applies when the described DOM and viewport preconditions hold.',
  versions:item.versions||'Synthetic fixture verified in headless Chromium.',
  preconditions:item.preconditions||[],
  expected:item.expected,
  fixSummary:item.fixSummary,
  acceptance:item.acceptance,
  limitations:item.limitations,
  reproduction:{
   casePage:`/cases/${item.id}/`,
   verifyCommand:`node src/cli.mjs verify --case ${item.id}`,
   source:item.source
  },
  verificationPlan:{
   steps:[
    'Confirm the target page exhibits the preconditions in an isolated local checkout.',
    `Prepare a local adapter JSON targeting the page and run: node src/cli.mjs check --adapter <adapter.json>`,
    `Apply the minimal fix: ${item.fixSummary}`,
    'Re-run node src/cli.mjs check --adapter <adapter.json> with the exact same viewport, target URL, and check IDs.',
    'Compare the baseline and post-fix reports to verify that the failure transitioned from fail to pass without environment or scope warnings.'
   ],
   independentCheckCondition:item.acceptance,
   adapterCheckTemplate:adapterCheckForRule(item)
  }
 }));

 const heuristics=(catalog.unverifiedHeuristics||[]).filter(h=>{
  if(input.category&&h.category===input.category)return true;
  if(symptomTokens.length){
   const hTokens=tokenize(`${h.title} ${h.note}`);
   return symptomTokens.some(t=>hTokens.includes(t));
  }
  return true;
 });

 let safeUrl='http://127.0.0.1:3000/';
 if(input.targetUrl){
  const parsed=new URL(input.targetUrl);
  if(['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password)safeUrl=parsed.href;
 }

 const uniqueChecks=[];
 const seenCheckIds=new Set();
 for(const rule of matchedRules.slice(0,3)){
  const check=rule.verificationPlan.adapterCheckTemplate;
  if(!seenCheckIds.has(check.id)){
   seenCheckIds.add(check.id);
   uniqueChecks.push(check);
  }
 }

 return {
  schemaVersion:1,
  kind:'project-diagnosis',
  status:catalog.status,
  provenance:catalog.provenance,
  environment:env,
  selectedApplication,
  selectionStatus:selectedApplication?'selected': 'single-context',
  matchedRules,
  unverifiedHeuristics:heuristics,
  adapterTemplate:{
   schemaVersion:1,
   url:safeUrl,
   viewport:{width:390,height:844},
   steps:[],
   checks:uniqueChecks.length?uniqueChecks:[{id:'primary-control',type:'control',selector:'button, a[href]'}]
  },
  workflowSteps:[
   '1. Inspect local stack, render mode, and concrete symptom using only allowed project metadata.',
   '2. Select matching verified rules and review their applicability, preconditions, and limitations.',
   '3. Customize the generated adapterTemplate selectors for the target page and run a baseline check before editing code.',
   '4. Apply the minimal fix in the target project and re-run the same adapter check.',
   '5. Compare baseline and post-fix runs; any change in viewport, browser, adapterSha256, or checkerSha256 marks the resolution unverified.'
  ],
  limits:[
   'Rule matching uses supplied metadata and symptom terms; it does not scan private repositories or execute project code.',
   'Framework tags on synthetic fixtures indicate the test implementation, not that a DOM/CSS failure is exclusive to that framework.',
   'Unverified heuristics are separated from confirmed rules and cannot be used as automated pass/fail acceptance evidence.'
  ]
 };
}

export function diagnoseFromPackageJsonWithCatalog(packageJsonContent,options={},catalog){
 const pkg=typeof packageJsonContent==='string'?JSON.parse(packageJsonContent):packageJsonContent;
 if(!pkg||typeof pkg!=='object')throw Error('Invalid package.json object');
 const mergedDeps={};
 for(const section of ['dependencies','devDependencies','peerDependencies']){
  if(pkg[section]&&typeof pkg[section]==='object'){
   for(const [name,ver]of Object.entries(pkg[section])){
    if(!forbiddenKeys.has(name)&&typeof ver==='string'&&Object.keys(mergedDeps).length<150)mergedDeps[name]=ver.slice(0,80);
   }
  }
 }
 return diagnoseProjectWithCatalog({...options,dependencies:mergedDeps},catalog);
}
