import {mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync,rmdirSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const units=usd=>Math.ceil(usd*1e6);
const id=value=>createHash('sha256').update(String(value)).digest('hex');
const denied=(code,reason,status=429)=>({allowed:false,code,reason,status});

// Reserve before dispatch. Unknown outcomes keep their full reservation.
// All processes serving one budget must use the same private ledger path.
export function createAiBudgetTracker(config={}){
 const file=config.ledgerPath;
 const limit=Math.floor(Number(config.dailyBudgetUsd||0)*1e6);
 const maxRequestsPerWindow=config.maxRequestsPerWindow||8;
 const maxRequestsPerProject=config.maxRequestsPerProject||15;
 const windowMs=config.windowMs||600000;
 const clock=config.now||(()=>Date.now());
 const policy=id(JSON.stringify({limit,inputPricePerMillion:config.inputPricePerMillion,outputPricePerMillion:config.outputPricePerMillion,maxRequestsPerWindow,maxRequestsPerProject,windowMs}));
 function transaction(work){
  if(!file||!Number.isSafeInteger(limit)||limit<=0)throw Error('AI budget is not configured.');
  mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const lock=file+'.lock';
  // Never silently clear a stale lock or reset a damaged ledger.
  mkdirSync(lock,{mode:0o700});
  let temporary;
  try{
   let state;
   try{state=JSON.parse(readFileSync(file,'utf8'));}
   catch(error){if(error.code!=='ENOENT')throw error;state={schemaVersion:1,policy,days:{},paused:false};}
   if(state.schemaVersion!==1||state.policy!==policy||!state.days||typeof state.days!=='object'||Array.isArray(state.days)||typeof state.paused!=='boolean')throw Error('Invalid or mismatched AI budget ledger.');
   const today=new Date(clock()).toISOString().slice(0,10);
   for(const key of Object.keys(state.days))if(key<new Date(clock()-7*86400000).toISOString().slice(0,10))delete state.days[key];
   const day=state.days[today]??={reservedUnits:0,callsToday:0,clients:{},projects:{}};
   if(!Number.isSafeInteger(day.reservedUnits)||day.reservedUnits<0||!Number.isSafeInteger(day.callsToday)||day.callsToday<0||!day.clients||!day.projects)throw Error('Invalid daily AI budget state.');
   const result=work(state,day);
   temporary=file+'.'+randomUUID()+'.tmp';
   writeFileSync(temporary,JSON.stringify(state),{mode:0o600,flag:'wx'});
   renameSync(temporary,file);temporary=null;
   return result;
  }finally{if(temporary)try{unlinkSync(temporary);}catch{}rmdirSync(lock);}
 }
 function snapshot(day,paused=false){return {day:new Date(clock()).toISOString().slice(0,10),dailyBudgetUsd:limit/1e6,spentUsd:day.reservedUnits/1e6,remainingUsd:Math.max(0,limit-day.reservedUnits)/1e6,callsToday:day.callsToday,maxRequestsPerWindow,maxRequestsPerProject,accounting:'conservative-reservations',paused};}
 function reserveUsage(clientId='local',projectId='default',maximumCostUsd){
  const charge=units(maximumCostUsd);
  if(!Number.isSafeInteger(charge)||charge<=0)return denied('RL_AI_CONFIGURATION','A positive maximum request cost is required.',503);
  let reserved;
  try{reserved=transaction((state,day)=>{
   if(state.paused)return denied('RL_AI_BUDGET_EXCEEDED','AI spending is paused for administrator review.');
   const client=id(clientId),project=id(projectId),hits=(day.clients[client]||[]).filter(ts=>ts>clock()-windowMs);
   if(hits.length>=maxRequestsPerWindow||(day.projects[project]||0)>=maxRequestsPerProject)return denied('RL_RATE_LIMIT','AI request limit reached.');
   if(Object.keys(day.clients).length>=10000||Object.keys(day.projects).length>=10000)return denied('RL_RATE_LIMIT','AI tracking capacity reached.');
   if(day.reservedUnits+charge>limit)return denied('RL_AI_BUDGET_EXCEEDED','Daily AI reservation cap reached.');
   day.reservedUnits+=charge;day.callsToday++;day.clients[client]=[...hits,clock()];day.projects[project]=(day.projects[project]||0)+1;
   return {allowed:true,budget:snapshot(day,state.paused)};
  });}catch{return denied('RL_AI_BUDGET_UNAVAILABLE','AI budget storage is unavailable; request not dispatched.',503);}
  if(!reserved.allowed)return reserved;
  return {allowed:true,reservedUsd:charge/1e6,
   commit(promptTokens,completionTokens){
    const actual=((promptTokens*config.inputPricePerMillion)+(completionTokens*config.outputPricePerMillion))/1e6;
    if(!Number.isFinite(actual)||actual<0||units(actual)>charge){
     try{transaction(state=>{state.paused=true;return null;});}catch{}
     const error=Error('Provider usage exceeded the configured reservation. AI is paused for review.');error.code='RL_AI_BUDGET_EXCEEDED';error.status=503;throw error;
    }
    return statusSnapshot();
   }
  };
 }
 function statusSnapshot(){
  try{return transaction((state,day)=>snapshot(day,state.paused));}
  catch{return {enabled:false,available:false,accounting:'conservative-reservations',dailyBudgetUsd:Math.max(0,limit)/1e6,remainingUsd:0};}
 }
 return {reserveUsage,statusSnapshot};
}
