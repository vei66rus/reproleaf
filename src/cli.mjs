import {parseArgs} from 'node:util';
import {catalog,getCase} from './catalog.mjs';
const [command='help',...args]=process.argv.slice(2);
async function readMetadata(file){
 const {open}=await import('node:fs/promises');const handle=await open(file,'r');
 try{
  if(!(await handle.stat()).isFile())throw Error('Metadata input must be a regular file.');
  const buffer=Buffer.alloc(262145);let offset=0;
  while(offset<buffer.length){const {bytesRead}=await handle.read(buffer,offset,buffer.length-offset,offset);if(!bytesRead)break;offset+=bytesRead;}
  if(offset>262144)throw Error('Metadata input exceeds 256 KiB');
  return new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,offset));
 }finally{await handle.close();}
}
try{
 const {values,positionals}=parseArgs({args,allowPositionals:true,options:{case:{type:'string'},all:{type:'boolean'},variant:{type:'string',default:'both'},output:{type:'string'},port:{type:'string',default:'4179'},adapter:{type:'string'},'allow-network':{type:'boolean'},packet:{type:'string'},report:{type:'string'},inventory:{type:'string'},skill:{type:'string'},dest:{type:'string'},stack:{type:'string'},'render-mode':{type:'string'},symptom:{type:'string'},category:{type:'string'},package:{type:'string'},context:{type:'string'},application:{type:'string'},'target-url':{type:'string'},before:{type:'string'},after:{type:'string'}}});
 if(command==='list'){console.log(JSON.stringify(catalog,null,2));}
 else if(command==='case'){console.log(JSON.stringify(getCase(positionals[0]),null,2));}
 else if(command==='clients'){
  const {clientSetups}=await import('./client-setups.mjs');
  console.log(JSON.stringify({schemaVersion:1,clients:clientSetups},null,2));
 }
 else if(command==='serve'){
  const {buildSite}=await import('./build.mjs');await buildSite();
  const {startServer}=await import('./server.mjs');const port=Number(values.port);if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid port');
  const server=await startServer({port});console.log(`Local pilot: ${server.origin} (noindex, loopback only)`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();process.exit(0);});
 }
 else if(command==='verify'){
  if(!values.all&&!values.case)throw Error('Choose --all or --case <id>');
  if(values.all&&values.case)throw Error('Choose --all or --case, not both');
  const {verify}=await import('./verify.mjs');const result=await verify({id:values.case,variant:values.variant,output:values.output});
  console.log(JSON.stringify({success:result.success,summary:result.summary,report:result.directory+'/report.json'},null,2));
  if(!result.success)process.exitCode=1;
 }
 else if(command==='check'){
  if(!values.adapter)throw Error('Use --adapter <local JSON file>');
  const {checkTarget}=await import('./check-target.mjs');const result=await checkTarget({adapter:values.adapter,allowNetwork:values['allow-network'],output:values.output});
  console.log(JSON.stringify({success:result.success,summary:result.summary,setupError:result.setupError,report:result.directory+'/report.json'},null,2));if(!result.success)process.exitCode=1;
 }
 else if(command==='diagnose'){
  const {diagnoseProject,diagnoseFromPackageJson}=await import('./diagnose-project.mjs');
  const options={stack:values.stack,renderMode:values['render-mode'],symptom:values.symptom,category:values.category,targetUrl:values['target-url'],activeApplication:values.application};
  for(const k of Object.keys(options))if(options[k]===undefined)delete options[k];
  if(values.package&&values.context)throw Error('Choose --package or --context, not both.');
  if(values.context){
   const context=JSON.parse(await readMetadata(values.context));
   if(!context||typeof context!=='object'||Array.isArray(context))throw Error('Context must be a metadata object.');
   console.log(JSON.stringify(diagnoseProject({...context,...options}),null,2));
  }else if(values.package){
   console.log(JSON.stringify(diagnoseFromPackageJson(await readMetadata(values.package),options),null,2));
  }else{
   console.log(JSON.stringify(diagnoseProject(options),null,2));
  }
 }
 else if(command==='compare'){
  if(!values.before||!values.after)throw Error('Use compare --before <local JSON file> --after <local JSON file>');
  const {readFile}=await import('node:fs/promises');
  const {compareReports}=await import('./history.mjs');
  const [aBytes,bBytes]=await Promise.all([readFile(values.before),readFile(values.after)]);
  if(aBytes.length>5242880||bBytes.length>5242880)throw Error('Report exceeds 5 MiB');
  console.log(JSON.stringify(compareReports(JSON.parse(aBytes),JSON.parse(bBytes)),null,2));
 }
 else if(command==='editorial'){
  const {getWorkflow,reviewEditorial}=await import('./editorial.mjs');
  if(positionals[0]==='workflow')console.log(JSON.stringify(await getWorkflow(),null,2));
  else if(positionals[0]==='review'&&values.packet){const {readFile}=await import('node:fs/promises');const bytes=await readFile(values.packet);if(bytes.length>1048576)throw Error('Packet exceeds 1 MiB');const result=reviewEditorial(JSON.parse(bytes));console.log(JSON.stringify(result,null,2));if(!result.structuralPass)process.exitCode=1;}
  else throw Error('Use editorial workflow or editorial review --packet <local JSON file>');
 }
 else if(command==='skill'){
  const {skillNames,installSkill}=await import('./skills.mjs');
  if(positionals[0]==='list')console.log(JSON.stringify(skillNames));
  else if(positionals[0]==='install')console.log(JSON.stringify(await installSkill({name:values.skill,destination:values.dest}),null,2));
  else throw Error('Use skill list or skill install --skill <name> --dest <skills directory>');
 }
 else if(command==='blog'){
  if(positionals[0]!=='audit'||!values.inventory)throw Error('Use blog audit --inventory <local JSON file>');
  const {auditBlogFile}=await import('./blog.mjs');console.log(JSON.stringify(await auditBlogFile(values.inventory),null,2));
 }
 else if(command==='sanitize'){
  if(!values.report)throw Error('Use sanitize --report <local JSON file>');
  const {readFile}=await import('node:fs/promises');
  const {sanitizeReportForSharing}=await import('./public-share.mjs');
  const bytes=await readFile(values.report);if(bytes.length>5242880)throw Error('Report exceeds 5 MiB');
  const parsed=JSON.parse(bytes);
  console.log(JSON.stringify(sanitizeReportForSharing(parsed.report?parsed:{report:parsed}),null,2));
 }
 else if(command==='contribute'){
  if(!values.packet)throw Error('Use contribute --packet <local JSON file>');
  const {readFile}=await import('node:fs/promises');
  const {prepareContributionPacket}=await import('./public-share.mjs');
  const bytes=await readFile(values.packet);if(bytes.length>524288)throw Error('Packet exceeds 512 KiB');
  console.log(JSON.stringify(prepareContributionPacket(JSON.parse(bytes)),null,2));
 }
 else if(command==='help'){console.log('Reproleaf\n  node src/cli.mjs list\n  node src/cli.mjs case <id>\n  node src/cli.mjs clients\n  node src/cli.mjs diagnose [--stack <name>] [--render-mode <csr|ssr|ssg|hybrid|islands>] [--symptom <text>] [--category <category>] [--package <package.json> | --context <metadata.json> [--application <id>]]\n  node src/cli.mjs compare --before <report.json> --after <report.json>\n  node src/cli.mjs sanitize --report <report.json>\n  node src/cli.mjs contribute --packet <contribution.json>\n  node src/cli.mjs serve [--port 4179]\n  node src/cli.mjs verify --all|--case <id> [--variant both|broken|fixed] [--output <directory>]\n  node src/cli.mjs check --adapter <local JSON file> [--allow-network] [--output <directory>]\n  node src/cli.mjs editorial workflow\n  node src/cli.mjs editorial review --packet <local JSON file>\n  node src/cli.mjs skill install --skill <name> --dest <skills directory>\n  node src/mcp.mjs');}
 else throw Error('Unknown command');
}catch(error){console.error(error.message);process.exitCode=1;}
