import {readFile,mkdir,writeFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {root} from './catalog.mjs';
export const skillNames=['mobile-web-review','seo-evidence-review','blog-link-review'];
export async function installSkill({name,destination}){
 if(!skillNames.includes(name))throw Error('Unknown bundled skill');
 if(!destination)throw Error('Choose an explicit skills destination with --dest');
 const directory=path.resolve(destination,name),target=path.join(directory,'SKILL.md');
 try{await lstat(directory);throw Error('Skill already exists; not overwriting local instructions');}catch(error){if(error.code!=='ENOENT')throw error;}
 const [content,launcherContent,boundRoot]=await Promise.all([readFile(path.join(root,'skills',name,'SKILL.md')),readFile(path.join(root,'skills/runtime/reproleaf.mjs')),realpath(root)]);
 await mkdir(path.dirname(directory),{recursive:true});
 try{await mkdir(directory);}catch(error){if(error.code==='EEXIST')throw Error('Skill already exists; not overwriting local instructions');throw error;}
 const launcher=path.join(directory,'scripts/reproleaf.mjs'),binding=path.join(directory,'private/install.json');
 await mkdir(path.dirname(launcher));await mkdir(path.dirname(binding),{mode:0o700});
 await writeFile(launcher,launcherContent,{flag:'wx'});await writeFile(binding,JSON.stringify({schemaVersion:1,root:boundRoot},null,2)+'\n',{flag:'wx',mode:0o600});
 await writeFile(target,content,{flag:'wx'});
 return {skill:name,path:target,launcher,binding};
}
