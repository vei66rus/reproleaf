import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {recommendInfrastructureProviders} from '../src/provider-guidance.mjs';
import {createTelemetryRecorder,recordAuditEvent,summarizeToolDemand} from '../src/telemetry.mjs';
import {mount} from '../src/browser/tools/benchmark-leaderboard.js';

function createMiniDom(){
 const makeNode=tag=>{
  const listeners=new Map();
  const children=[];
  const attrs=new Map();
  const node={
   tagName:String(tag).toUpperCase(),
   children,
   className:'',
   hidden:false,
   value:'',
   textContent:'',
   dataset:{language:'en'},
   classList:{add:(...c)=>{node.className=(node.className?node.className+' ':'')+c.join(' ');}},
   setAttribute:(k,v)=>attrs.set(k,String(v)),
   getAttribute:k=>attrs.get(k),
   append:(...items)=>{
    for(const it of items){
     if(it===null||it===undefined||it===false)continue;
     children.push(typeof it==='string'?{nodeType:3,textContent:it}:it);
    }
   },
   replaceChildren:(...items)=>{
    children.length=0;
    node.append(...items);
   },
   prepend:(...items)=>{
    children.unshift(...items);
   },
   addEventListener:(ev,fn)=>{
    if(!listeners.has(ev))listeners.set(ev,[]);
    listeners.get(ev).push(fn);
   },
   dispatchEvent:ev=>{
    for(const fn of listeners.get(ev.type)||[])fn(ev);
    return true;
   }
  };
  return node;
 };
 return {
  document:{
   createElement:makeNode,
   createTextNode:text=>({nodeType:3,textContent:String(text)})
  },
  CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}},
  makeRoot:()=>makeNode('section')
 };
}

test('benchmark-leaderboard mount initializes the frame and emits success after async validation',async()=>{
 const prevDoc=globalThis.document;
 const prevCustomEvent=globalThis.CustomEvent;
 const env=createMiniDom();
 globalThis.document=env.document;
 globalThis.CustomEvent=env.CustomEvent;
 try{
  const root=env.makeRoot();
  const events=[];
  let completed;
  const validated=new Promise(resolve=>{completed=resolve;});
  root.addEventListener('reproleaf:tool-event',e=>{events.push(e.detail);completed();});
  mount(root,{language:'en'});
  assert.equal(events.length,0,'Mount must not report success before validation finishes.');
  let timer;
  try { await Promise.race([validated,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Validation did not complete.')),3000);})]); }
  finally { clearTimeout(timer); }
  assert.equal(events.length,1);
  assert.equal(events[0].tool,'benchmark-leaderboard');
  assert.equal(events[0].action,'run');
  assert.equal(events[0].ok,true);
  assert.match(root.className,/reproleaf-workbench/);
  assert.equal(root.children.filter(node=>node.tagName==='H2').length,1);
  assert.equal(root.children.some(node=>node.tagName==='H3'),false);
 }finally{
  globalThis.document=prevDoc;
  globalThis.CustomEvent=prevCustomEvent;
 }
});

test('recommendInfrastructureProviders emits zero triggers on clean metrics and tags BYOK links sponsored',()=>{
 const clean=recommendInfrastructureProviders({ttfbMs:180,nonJsWords:600,needsExternalVolumes:false,hasGscData:true});
 assert.equal(clean.triggerCount,0);
 assert.deepEqual(clean.recommendations,[]);

 const bottlenecks=recommendInfrastructureProviders({locale:'en',ttfbMs:950,nonJsWords:24,needsExternalVolumes:true,hasGscData:false});
 assert.equal(bottlenecks.triggerCount,4);
 const apiRec=bottlenecks.recommendations.find(r=>r.trigger==='external_keyword_volume_gap');
 assert.ok(apiRec);
 assert.equal(apiRec.links.every(l=>l.rel.includes('sponsored')&&l.rel.includes('noopener')),true);
});

test('summarizeToolDemand ranks tools by run frequency without storing PII',()=>{
 const recorder=createTelemetryRecorder({enabled:true});
 recordAuditEvent(recorder,{tool:'llms-studio',ok:true,errors:0,warnings:1});
 recordAuditEvent(recorder,{tool:'benchmark-leaderboard',ok:true,errors:0,warnings:0});
 recordAuditEvent(recorder,{tool:'benchmark-leaderboard',ok:false,errors:2,warnings:0});
 const ranked=summarizeToolDemand(recorder);
 assert.equal(ranked.totalRuns,3);
 assert.equal(ranked.toolsRanked[0].tool,'benchmark-leaderboard');
 assert.equal(ranked.toolsRanked[0].runs,2);
 assert.equal(ranked.toolsRanked[0].failRatePct,50);
});
