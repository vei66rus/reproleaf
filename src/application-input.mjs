const blocked=new Set(['__proto__','constructor','prototype','toString','valueOf','hasOwnProperty']);
export class ApplicationInputError extends Error{
 constructor(code,field='manifest'){super(code);this.name='ApplicationInputError';this.code=code;this.field=field;}
}
/** Read dependency metadata only. Scripts, repository paths and other fields are discarded. */
export function readApplicationManifest(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>262144)throw new ApplicationInputError('manifest-size');
 let pkg;try{pkg=JSON.parse(text);}catch{throw new ApplicationInputError('manifest-json');}
 if(!pkg||typeof pkg!=='object'||Array.isArray(pkg))throw new ApplicationInputError('manifest-object');
 const dependencies=Object.create(null);
 for(const section of ['dependencies','devDependencies','peerDependencies']){
  if(pkg[section]===undefined)continue;
  const group=pkg[section];if(!group||typeof group!=='object'||Array.isArray(group))throw new ApplicationInputError('dependency-object');
  for(const [key,value] of Object.entries(group)){
   if(blocked.has(key)||!key.length||key.length>120||typeof value!=='string'||value.length>80)throw new ApplicationInputError('dependency-value');
   dependencies[key]=value;if(Object.keys(dependencies).length>150)throw new ApplicationInputError('dependency-count');
  }
 }
 return {dependencies};
}
export function buildApplicationContext({applications,activeApplication='',symptom='',category='',targetUrl='',canvas='unknown',hydration='unknown'}){
 if(!Array.isArray(applications)||!applications.length||applications.length>20)throw new ApplicationInputError('application-count','applications');
 const apps=applications.map((app,index)=>{
  const fail=code=>{throw new ApplicationInputError(code,`applications.${index}`);};
  if(typeof app.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(app.id))fail('application-id');
  if(typeof app.label!=='string'||app.label.length>100||typeof app.stack!=='string'||app.stack.length>80)fail('application-label');
  let metadata={};if(app.manifest.trim())try{metadata=readApplicationManifest(app.manifest);}catch(error){error.field=`applications.${index}.manifest`;throw error;}
  if(!['unknown','csr','ssr','ssg','hybrid','islands'].includes(app.renderMode))fail('render-mode');
  return {id:app.id,...(app.label.trim()?{label:app.label.trim()}:{}),...(app.stack.trim()?{stack:app.stack.trim()}:{}),...metadata,renderMode:app.renderMode};
 });
 if(new Set(apps.map(a=>a.id)).size!==apps.length)throw new ApplicationInputError('duplicate-id','applications');
 if(apps.reduce((n,a)=>n+Object.keys(a.dependencies||{}).length,0)>300)throw new ApplicationInputError('combined-dependencies','applications');
 if(activeApplication&&!apps.some(a=>a.id===activeApplication))throw new ApplicationInputError('unknown-application','activeApplication');
 if(symptom.length>600)throw new ApplicationInputError('symptom-length','symptom');
 if(category&&!['scroll','overlay','viewport','overflow','focus','forms','hydration'].includes(category))throw new ApplicationInputError('category','category');
 if(targetUrl){try{const u=new URL(targetUrl);if(targetUrl.length>2048||!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error();}catch{throw new ApplicationInputError('target-url','targetUrl');}}
 const interaction={};for(const [field,value] of [['canvasOwnsPageNavigation',canvas],['hydratesServerHtml',hydration]]){
  if(!['unknown','yes','no'].includes(value))throw new ApplicationInputError('interaction',field==='canvasOwnsPageNavigation'?'canvas':'hydration');
  if(value!=='unknown')interaction[field]=value==='yes';
 }
 return {applications:apps,...(activeApplication?{activeApplication}:{}),...(symptom.trim()?{symptom:symptom.trim()}:{}),...(category?{category}:{}),...(targetUrl?{targetUrl}:{}),...(Object.keys(interaction).length?{interaction}:{})};
}
