import {readFile} from 'node:fs/promises';
import {auditBlog} from './blog-graph.mjs';
export async function auditBlogFile(file){
 if(!file)throw Error('Configure REPROLEAF_INVENTORY_FILE or supply an inventory.');
 const bytes=await readFile(file);if(bytes.length>5*1024*1024)throw Error('Inventory exceeds 5 MiB');
 return auditBlog(JSON.parse(bytes));
}
