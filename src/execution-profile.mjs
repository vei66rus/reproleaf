const keys=['schemaVersion','allowNetwork','methods','analyticsPolicy','isMobile','hasTouch','deviceScaleFactor','serviceWorkers','webSockets'];
/** Only understood execution policies can establish a comparable scope. */
export function normalizeExecutionProfile(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))return null;
 if(value.schemaVersion!==2||typeof value.allowNetwork!=='boolean'||typeof value.isMobile!=='boolean'||typeof value.hasTouch!=='boolean'||!Number.isFinite(value.deviceScaleFactor)||value.deviceScaleFactor<.25||value.deviceScaleFactor>4||value.serviceWorkers!=='block'||value.webSockets!=='blocked'||value.analyticsPolicy!=='known-analytics-blocked-v1')return null;
 if(!Array.isArray(value.methods)||value.methods.length!==2||[...value.methods].sort().join(',')!=='GET,HEAD')return null;
 return {schemaVersion:2,allowNetwork:value.allowNetwork,methods:['GET','HEAD'],analyticsPolicy:value.analyticsPolicy,isMobile:value.isMobile,hasTouch:value.hasTouch,deviceScaleFactor:value.deviceScaleFactor,serviceWorkers:'block',webSockets:'blocked'};
}
export function executionProfileLabel(value,language='en'){
 const p=normalizeExecutionProfile(value),ru=language==='ru';if(!p)return ru?'Не зафиксирована':'Not recorded';
 return [(p.allowNetwork?(ru?'Внешние GET/HEAD разрешены':'External GET/HEAD allowed'):(ru?'GET/HEAD только на loopback':'Loopback GET/HEAD only')),(p.isMobile?(ru?'Мобильная эмуляция':'Mobile emulation'):(ru?'Без мобильной эмуляции':'No mobile emulation')),(p.hasTouch?(ru?'Touch включён':'Touch enabled'):(ru?'Без touch':'No touch')),`DPR ${p.deviceScaleFactor}`,(ru?'Аналитика, service workers и WebSocket заблокированы':'Analytics, service workers and WebSocket blocked')].join('; ');
}
