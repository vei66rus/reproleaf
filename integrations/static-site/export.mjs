import {readFile,readdir,writeFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {inventoryFromHtml} from '../../src/import-html.mjs';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
if(!args.includes('--dir')||!args.includes('--site')||!args.includes('--out'))throw Error('Usage: node integrations/static-site/export.mjs --dir ./dist --site https://example.com --out inventory.json');
const directory=await realpath(option('--dir')),site=new URL(option('--site')),files=[];
if(!['http:','https:'].includes(site.protocol)||site.pathname!=='/'||site.username||site.password)throw Error('Supply the root HTTP(S) origin of the published site.');
let bytes=0,visited=0;
async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){if(++visited>20000)throw Error('Build has too many entries. Select a smaller output.');const file=path.join(dir,item.name);if(item.isSymbolicLink())throw Error('Symlinks are not imported.');if(item.isDirectory())await walk(file);else if(item.isFile()&&/\.html$/i.test(item.name)){if(files.length>=1000)throw Error('At most 1000 HTML pages per export.');const size=(await lstat(file)).size;bytes+=size;if(size>2*1048576||bytes>50*1048576)throw Error('HTML input exceeds the bounded export size.');let relative=path.relative(directory,file).split(path.sep).join('/');relative=relative.replace(/(^|\/)index\.html$/i,'$1');const url=new URL(relative.split('/').map(encodeURIComponent).join('/'),site);files.push({url:url.href,html:await readFile(file,'utf8')});}}}
await walk(directory);const data=inventoryFromHtml(files,site.href),json=JSON.stringify(data,null,2);
if(Buffer.byteLength(json)>5*1048576)throw Error('Inventory exceeds 5 MiB. Export a smaller published build.');
await writeFile(path.resolve(option('--out')),json+'\n');console.log(JSON.stringify({pages:data.pages.length,output:path.resolve(option('--out')),networkRequests:0}));
