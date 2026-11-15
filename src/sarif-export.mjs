import {version} from './version.mjs';

export function toSarifReport(batchReport,{toolVersion=version}={}){
 const rulesMap=new Map();
 const results=[];

 for(const page of batchReport.pages||[]){
  for(const finding of page.findings||[]){
   if(!rulesMap.has(finding.code)){
    rulesMap.set(finding.code,{
     id:finding.code,
     shortDescription:{text:finding.code},
     defaultConfiguration:{level:finding.severity==='error'?'error':'warning'}
    });
   }
   results.push({
    ruleId:finding.code,
    level:finding.severity==='error'?'error':'warning',
    message:{text:finding.message},
    locations:[{
     physicalLocation:{
      artifactLocation:{uri:page.file}
     }
    }]
   });
  }
 }

 return {
  $schema:'https://json.schemastore.org/sarif-2.1.0.json',
  version:'2.1.0',
  runs:[{
   tool:{
    driver:{
     name:'Reproleaf',
     version:toolVersion,
     informationUri:'https://github.com/vei66rus/reproleaf',
     rules:[...rulesMap.values()]
    }
   },
   results
  }]
 };
}
