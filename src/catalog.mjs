import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const root=fileURLToPath(new URL('../',import.meta.url));
export const catalog=JSON.parse(await readFile(path.join(root,'cases/catalog.json'),'utf8'));
export function getCase(id){const item=catalog.cases.find(c=>c.id===id);if(!item)throw new Error('Unknown case ID');return item;}
export const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
