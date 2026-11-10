import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root} from './catalog.mjs';
export {editorialSchema,reviewEditorial} from './editorial-core.mjs';
export async function getWorkflow(){return JSON.parse(await readFile(path.join(root,'packs/editorial-evidence/workflow.json'),'utf8'));}
