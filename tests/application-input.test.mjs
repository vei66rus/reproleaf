import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readApplicationManifest,buildApplicationContext,ApplicationInputError} from '../src/application-input.mjs';
import {diagnoseProject} from '../src/diagnose-project.mjs';
import {diagnoseProject as browserDiagnose} from '../src/browser/diagnose.js';
const application=(patch={})=>({id:'main',label:'Main',stack:'',renderMode:'unknown',manifest:'',...patch});
test('manifest extraction discards scripts and private unrelated fields without executing them',()=>{
 const result=readApplicationManifest(JSON.stringify({scripts:{postinstall:'globalThis.__manifestExecuted=true'},privateSecret:'not-for-context',dependencies:{astro:'5'},devDependencies:{vue:'3'},peerDependencies:{react:'19'}}));
 assert.deepEqual({...result.dependencies},{astro:'5',vue:'3',react:'19'});assert.equal(globalThis.__manifestExecuted,undefined);assert(!JSON.stringify(result).includes('not-for-context'));assert.equal(Object.getPrototypeOf(result.dependencies),null);
});
test('manifest extraction rejects malformed, oversized and unsafe dependency metadata',()=>{
 for(const text of ['{','null','[]','{"dependencies":[]}','{"dependencies":{"x":2}}','{"dependencies":{"__proto__":"1"}}','{"dependencies":{"constructor":"1"}}',JSON.stringify({dependencies:{['a'.repeat(121)]:'1'}}),JSON.stringify({dependencies:{x:'a'.repeat(81)}}),JSON.stringify({dependencies:Object.fromEntries(Array.from({length:151},(_,i)=>['dep'+i,'1']))}),' '.repeat(262145),'я'.repeat(131073)])assert.throws(()=>readApplicationManifest(text),ApplicationInputError);
});
test('UI context uses selected metadata without merging legacy application dependencies',()=>{
 const input=buildApplicationContext({applications:[application({id:'legacy',manifest:'{"dependencies":{"nuxt":"4"}}'}),application({id:'active',manifest:'{"dependencies":{"astro":"5","vue":"3"}}'})],activeApplication:'active'}),result=diagnoseProject(input);
 assert.equal(result.selectedApplication,'active');assert.equal(result.environment.notableVersions.nuxt,undefined);assert.equal(result.environment.notableVersions.astro,'5');assert.equal(result.environment.renderModeSource,'framework-architecture');assert.deepEqual(browserDiagnose(input),result);
});
test('two unselected applications produce no adapter or candidate checks',()=>{
 const input=buildApplicationContext({applications:[application(),application({id:'second'})]}),result=diagnoseProject(input);assert.equal(result.status,'needs-application-selection');assert.equal(result.adapterTemplate,null);assert.deepEqual(result.matchedRules,[]);
});
test('explicit negative interaction facts exclude inapplicable cases in both entry points',()=>{
 const input=buildApplicationContext({applications:[application({stack:'React Phaser',renderMode:'ssr'})],canvas:'no',hydration:'no',symptom:'canvas touch navigation hydration'}),result=diagnoseProject(input);assert.equal(input.interaction.canvasOwnsPageNavigation,false);assert.equal(input.interaction.hydratesServerHtml,false);assert(!result.matchedRules.some(r=>r.id==='canvas-touch-trap'||r.category==='hydration'));assert.deepEqual(browserDiagnose(input),result);
});
test('unknown facts stay unknown; mixed WordPress and React does not establish rendering',()=>{
 const input=buildApplicationContext({applications:[application({stack:'WordPress React',manifest:'{"dependencies":{"react":"19"}}'})]}),result=diagnoseProject(input);assert.equal(input.interaction,undefined);assert.equal(result.environment.renderMode,'unknown');assert.equal(result.environment.renderModeSource,'insufficient-metadata');assert(result.matchedRules.every(r=>r.verificationStatus==='not-run'&&r.applicabilityStatus==='requires-precondition-check'));
});
test('invalid manifest errors identify the precise application without mutating entered data',()=>{
 const applications=[application(),application({id:'bad',manifest:'{broken'})],before=JSON.stringify(applications);assert.throws(()=>buildApplicationContext({applications}),error=>error.code==='manifest-json'&&error.field==='applications.1.manifest');assert.equal(JSON.stringify(applications),before);
});
test('context rejects excessive apps, merged limits, unsafe targets and invalid selection',()=>{
 const deps=JSON.stringify({dependencies:Object.fromEntries(Array.from({length:101},(_,i)=>['dep'+i,'1']))});
 for(const options of [{applications:[]},{applications:Array.from({length:21},(_,i)=>application({id:'a'+i}))},{applications:[application(),application()]},{applications:[application()],activeApplication:'missing'},{applications:[application()],targetUrl:'https://user:password@example.com/'},{applications:[application()],targetUrl:'javascript:alert(1)'},{applications:[application()],symptom:'a'.repeat(601)},{applications:[application()],canvas:'maybe'},{applications:[application({id:'one',manifest:deps}),application({id:'two',manifest:deps}),application({id:'three',manifest:deps})]}])assert.throws(()=>buildApplicationContext(options),ApplicationInputError);
});
